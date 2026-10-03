// Candidates -> rules. Per (jurisdiction, category) cell the model groups candidate ids by underlying law (cached);
// a deterministic merge then writes one rule per group. A cell with one candidate never reaches the model.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { InternalRule } from '../contracts';
import { sha256 } from './ids';
import { mergeGroup, choosePrimary, type Candidate } from './merge';
import { GROUP_PROMPT_VERSION } from './prompt';
import { GroupAnswerSchema, type GroupAnswer, type GroupCandidate, type LlmClient } from './schema';

export type ConsolidateDeps = {
  cacheDir: string;
  /** Model names whose cached groupings may be reused, preferred first. */
  modelNames: string[];
  offline: boolean;
  force: boolean;
  /** Created on first use so a fully cached run needs no credentials. */
  client: () => LlmClient;
  onCall: () => void;
  onHit: () => void;
};

export type ConsolidateResult = {
  rules: InternalRule[];
  /** One entry per cell whose grouping fell back to singletons, doc_id "cell:<jurisdiction>|<category>". */
  failures: { doc_id: string; error: string }[];
  cells: number;
  grouped: number;
  calls: number;
};

type Group = GroupAnswer['groups'][number];

const CacheSchema = z.object({ cell: z.string(), prompt_version: z.string(), model: z.string(), groups: GroupAnswerSchema.shape.groups });
const cachePath = (dir: string, key: string) => path.join(dir, 'groups', `${key}.json`);
const groupKey = (model: string, payload: GroupCandidate[]) => sha256(GROUP_PROMPT_VERSION + model + JSON.stringify(payload));
const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Null when the answer places every id exactly once, with each primary inside its own group. Nothing is repaired. */
export function groupingProblem(answer: GroupAnswer, ids: string[]): string | null {
  const known = new Set(ids); const seen = new Set<string>();
  for (const g of answer.groups) {
    if (g.member_ids.length === 0) return 'empty group';
    if (!g.member_ids.includes(g.primary_id)) return `primary "${g.primary_id}" is not in its group`;
    for (const id of g.member_ids) {
      if (!known.has(id)) return `unknown id "${id}"`;
      if (seen.has(id)) return `duplicated id "${id}"`;
      seen.add(id);
    }
  }
  const missing = ids.filter(id => !seen.has(id));
  return missing.length ? `missing id "${missing[0]}"` : null;
}

const toPayload = (c: Candidate): GroupCandidate => ({
  id: c.id, title: c.rule.title, citation: c.rule.citation, requirement: c.rule.requirement, key_value: c.rule.key_value,
  legal_status: c.rule.legal_status, enacted_date: c.rule.enacted_date, effective_date: c.rule.effective_date,
  source_doc_id: c.rule.source_doc_id, source_origin: c.rule.source_origin
});

async function groupCell(cell: string, members: Candidate[], deps: ConsolidateDeps): Promise<{ groups: Group[]; failure?: string; called: boolean }> {
  const [jurisdiction, category] = [members[0].rule.jurisdiction, members[0].rule.category];
  const payload = [...members].sort(byId).map(toPayload);
  const ids = payload.map(p => p.id);
  const singletons = (failure: string) => ({ groups: ids.map(id => ({ member_ids: [id], primary_id: id })), failure, called: false });

  if (!deps.force) for (const model of deps.modelNames) {
    const file = cachePath(deps.cacheDir, groupKey(model, payload));
    if (!existsSync(file)) continue;
    try {
      const hit = CacheSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      if (groupingProblem({ groups: hit.groups }, ids) === null) { deps.onHit(); return { groups: hit.groups, called: false }; }
    } catch { /* unreadable entry counts as a miss */ }
  }
  if (deps.offline) return singletons('grouping not cached (offline); kept one rule per candidate');

  let client: LlmClient; let answer: GroupAnswer;
  try {
    client = deps.client();
    deps.onCall();
    answer = GroupAnswerSchema.parse(await client.group({ jurisdiction, category, candidates: payload }));
  } catch (error) {
    return { ...singletons(`grouping call failed: ${error instanceof Error ? error.message : String(error)}; kept one rule per candidate`), called: true };
  }
  const problem = groupingProblem(answer, ids);
  if (problem) return { ...singletons(`invalid grouping (${problem}); kept one rule per candidate`), called: true };
  const model = client.model ?? deps.modelNames[0];
  const file = cachePath(deps.cacheDir, groupKey(model, payload));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ cell, prompt_version: GROUP_PROMPT_VERSION, model, groups: answer.groups }, null, 1) + '\n');
  return { groups: answer.groups, called: true };
}

export async function consolidate(candidates: Candidate[], deps: ConsolidateDeps): Promise<ConsolidateResult> {
  const cells = new Map<string, Candidate[]>();
  for (const c of [...candidates].sort(byId)) {
    const key = `${c.rule.jurisdiction}|${c.rule.category}`;
    cells.set(key, [...(cells.get(key) ?? []), c]);
  }
  const keys = [...cells.keys()].sort();
  const multi = keys.filter(k => cells.get(k)!.length > 1);

  const answers = new Map<string, Awaited<ReturnType<typeof groupCell>>>();
  let cursor = 0; let calls = 0;
  const workers = Math.max(1, Math.min(Number(process.env.ORDINAL_CONCURRENCY ?? 4) || 1, multi.length));
  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < multi.length) {
      const key = multi[cursor++];
      const answer = await groupCell(key, cells.get(key)!, deps);
      answers.set(key, answer);
      if (answer.called) calls++;
      if (process.env.ORDINAL_PROGRESS) console.error(`[consolidate] ${key} ${cells.get(key)!.length} candidates ${answer.failure ? 'FALLBACK' : answer.called ? 'grouped' : 'cached'}`);
    }
  }));

  const rules: InternalRule[] = []; const failures: ConsolidateResult['failures'] = [];
  for (const key of keys) {
    const members = cells.get(key)!;
    const byMemberId = new Map(members.map(m => [m.id, m]));
    const answer = answers.get(key);
    if (answer?.failure) failures.push({ doc_id: `cell:${key}`, error: answer.failure });
    const groups: Group[] = answer?.groups ?? [{ member_ids: [members[0].id], primary_id: members[0].id }];
    // Two groups whose primaries share a team_rule_id are one rule (same jurisdiction, category and citation).
    const buckets = new Map<string, { members: Candidate[]; pick: string }>();
    for (const g of groups) {
      const mine = g.member_ids.map(id => byMemberId.get(id)!);
      const teamId = choosePrimary(mine, g.primary_id).rule.team_rule_id;
      const bucket = buckets.get(teamId);
      if (bucket) bucket.members.push(...mine); else buckets.set(teamId, { members: mine, pick: g.primary_id });
    }
    for (const bucket of buckets.values()) rules.push(mergeGroup(bucket.members, bucket.pick));
  }
  return { rules, failures, cells: keys.length, grouped: multi.length, calls };
}
