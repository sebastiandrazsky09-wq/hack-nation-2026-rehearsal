// The second compile step: each rule in an action's category becomes typed constraints on that action.
// A model proposes. This file decides what enters the store: a quote that is a literal slice of the source, and figures a
// fixed parser reads out of the quoted words. Anything else is withheld, and a withheld constraint can only ever mean REVIEW.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { InternalRule } from '../ordinal/contracts';
import { PATHS, loadOfficialDocs, loadSupplementalDocs, readRuleStore, type SourceDoc } from '../ordinal/corpus';
import { loadIngestedDocs } from '../ordinal/compile/ingest';
import { verifyQuote } from '../ordinal/compile/verify';
import { ACTIONS, EffectSchema, type ActionSpec, type Constraint, type WithheldConstraint } from './contract';
import { constraintModelName, createConstraintClient, type ConstraintClient } from './model';
import { containsText, parseQuantity } from './quantity';
import { GATE_PATHS, writeConstraints, writeWithheld } from './store';

export const CONSTRAINT_PROMPT_VERSION = 'gate-constrain-v2';
const WINDOW = 14_000;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

export const ProposalSchema = z.object({
  constraints: z.array(z.object({
    effect: EffectSchema,
    max: z.number().nullable(),
    value_text: z.string().nullable(),
    hard_max: z.number().nullable(),
    hard_max_text: z.string().nullable(),
    hard_max_quote: z.string().nullable(),
    cap_can_rise: z.boolean(),
    figure_year: z.number().int().nullable(),
    elements_untestable: z.string().nullable(),
    obligation_text: z.string().nullable(),
    evidence_quote: z.string()
  })).max(6)
});
export type Proposal = z.infer<typeof ProposalSchema>;
const RepairSchema = z.object({ evidence_quote: z.string() });

export const actionFor = (category: string): ActionSpec | null => Object.values(ACTIONS).find(a => a.category === category) ?? null;

const SYSTEM = `You convert one housing rule into typed constraints on ONE proposed action. You are given the action, the rule as already extracted, and text from the rule's own source document. Report only what that text states. Do not use any knowledge beyond the text.

Each constraint has one effect:
- "prohibit": the text forbids taking the action at all. For an action with a parameter this means no amount is allowed. A text that forbids some other conduct connected with the action (a clause in a lease, a different kind of charge, a way of handling the money, conduct toward a different group of people) is not a prohibition of the action: leave it out, or if it binds whoever takes the action, express it as an obligation. If the ban on the action holds only together with elements about other parties' conduct or state of mind that cannot be observed from the action and the property (an agreement between competitors, a contract or conspiracy, coercion), copy those elements into elements_untestable in the text's own words; otherwise elements_untestable is null. If the ban depends on a circumstance the actor can confirm before acting, express it as an obligation that states what must be true.
- "limit": the text caps the action's parameter. max is the cap as a number in the parameter's unit that holds for everyone, and value_text is the exact words inside evidence_quote that state it. If the text allows a higher cap in some cases (for a kind of landlord, a kind of unit), hard_max is the highest cap the text allows in any case, hard_max_text the exact words that state it, and hard_max_quote the sentence containing those words if it is not evidence_quote. If the text states one cap for everyone, hard_max, hard_max_text and hard_max_quote are null. If the text only states a cap that applies in some cases, max is null and that cap is hard_max. cap_can_rise is true when the text says the cap may be adjusted or increased over time (an index, a yearly adjustment) without stating the adjusted figure. figure_year is the calendar year when the text states the figure for one named year, else null.
- "obligation": the text requires whoever takes the action to do something, or to meet a condition, in taking it (for example a receipt, a separate account, a written notice, a refund deadline). obligation_text states that duty in one plain sentence. Penalties, remedies and enforcement procedures are not obligations.
- "none": as this text states it, the rule places no prohibition, cap or duty on this action.

Requirements:
- evidence_quote is copied character for character from the source text: one or two whole sentences, at least 20 characters, and it must itself contain the operative words (for a prohibition the words that forbid, for an obligation the words that require, for a limit the figure). When the operative words are in the lead-in of a list, quote from the lead-in through the relevant item. Never paraphrase, never join distant passages, never use an ellipsis, never quote a heading or a table row as if it were a rule.
- value_text and hard_max_text are copied from inside the quote they belong to and contain the figure itself.
- Fields that do not belong to the effect are null (cap_can_rise is false).
- A bill or proposal is converted the same way as enacted law; its status is handled elsewhere.
- If the text states no number, give no number.
- Return at most four constraints, the most consequential first, no near-duplicates. If nothing constrains the action, return exactly one constraint with effect "none" and a quote showing what the rule is about.

Illustration with invented law (do not reuse its words or figures): for the action "keep a pet deposit, parameter: amount in US dollars" and a text saying "A landlord shall not demand a pet deposit exceeding $275. For a furnished unit the pet deposit shall not exceed $410. The landlord shall give the tenant a dated receipt for any pet deposit.", the answer is a limit (max 275, value_text "$275", evidence_quote the first sentence, hard_max 410, hard_max_text "$410", hard_max_quote the second sentence, cap_can_rise false) and an obligation (obligation_text "Give the tenant a dated receipt for the deposit.", evidence_quote the third sentence).`;

const parameterLine = (action: ActionSpec) => action.parameter
  ? `Parameter: ${action.parameter.name}, the ${action.parameter.label.toLowerCase()} in ${action.parameter.unit}.`
  : 'Parameter: none. The action is either constrained or not.';

/** The whole document when short, else the text around the rule's own quote. Offsets are never taken from the window. */
export function sourceWindow(doc: SourceDoc, rule: Pick<InternalRule, 'span_start' | 'span_end'>): string {
  if (doc.text.length <= WINDOW * 2 || rule.span_start === null || rule.span_end === null) return doc.text.slice(0, WINDOW * 2);
  return doc.text.slice(Math.max(0, rule.span_start - WINDOW), Math.min(doc.text.length, rule.span_end + WINDOW));
}

function userPrompt(action: ActionSpec, rule: InternalRule, window: string): string {
  return [
    `Action: ${action.label}.`, parameterLine(action), '',
    `Rule title: ${rule.title}`, `Jurisdiction: ${rule.jurisdiction}`, `Citation: ${rule.citation}`,
    `Requirement as extracted: ${rule.requirement}`, `Key value as extracted: ${rule.key_value ?? 'none'}`,
    `Quote already verified for this rule: ${rule.quoted_span}`, '', '<source_text>', window, '</source_text>'
  ].join('\n');
}

// Words that make a ban depend on something the gate cannot observe. Finding them in the quote can only turn a BLOCK into a REVIEW.
const CONDITIONAL = /\b(as part of an? (?:contract|agreement)|contract, combination|combination in the form|conspir\w*|agreement (?:among|between|with)|coerc\w*|collu\w*|two or more (?:persons|landlords|users|competitors))\b/i;
// A quote offered as a ban must itself forbid; a quote offered as a duty must itself require. A fragment, a heading or a table row does neither.
const FORBIDS = /\b(unlawful|illegal|prohibit\w*|forbid\w*|forbidden|shall not|may not|must not|cannot|can not|can no longer|not (?:be )?(?:permitted|allowed)|no (?:person|landlord|lessor|owner|agent)\b[^.]*\b(?:shall|may))\b/i;
const REQUIRES = /\b(shall|must|required?|requires|has to|have to|obligated)\b/i;
// A cap the text lets rise without stating the result. Above such a cap nothing can be computed.
const NO_BAN_WORDS = 'the quote offered as a ban contains no words that forbid';
const NO_DUTY_WORDS = 'the quote offered as a duty contains no words that require';
const ADJUSTABLE = /\b(adjust\w*|consumer price index|cpi|indexed|index(?:ing|ation)?)\b/i;

/** Constraints the lead rejected on reading them, by id, with the reason. Data, not code: it can only remove a constraint. */
export type ReviewFile = { rejected: { constraint_id: string; reason: string }[] };
export const reviewPath = () => path.join(path.dirname(GATE_PATHS.constraints), 'constraints.review.json');
function readReview(file: string): ReviewFile {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as ReviewFile : { rejected: [] };
}

type CacheFile = { key: string; model: string; prompt_version: string; proposal: Proposal; repairs: Record<string, string | null> };
const cachePath = (dir: string, ruleId: string) => path.join(dir, `${ruleId}.json`);
function readCache(dir: string, ruleId: string): CacheFile | null {
  const file = cachePath(dir, ruleId);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as CacheFile : null;
}

export type ConstrainOptions = { offline?: boolean; force?: boolean; ruleIds?: string[] };
export type ConstrainDeps = { client?: ConstraintClient; rules?: InternalRule[]; docs?: SourceDoc[]; cacheDir?: string; constraintFile?: string; withheldFile?: string; reviewFile?: string; modelName?: string; log?: (line: string) => void };
export type ConstrainReport = {
  rules: number; model_calls: number; verified: number; withheld: number;
  by_effect: Record<string, number>; rules_without_constraint: string[]; errors: { rule_id: string; error: string }[];
};

/** Mechanical acceptance of one proposed constraint. Returns the stored record or the reason it is withheld. */
export function verifyProposal(
  p: Proposal['constraints'][number], rule: InternalRule, action: ActionSpec, doc: SourceDoc, repairedQuote: string | null, model: string,
  /** The one repair attempt for a quote that is in the source but lacks the operative words. */
  operativeQuote: string | null = null
): { constraint: Constraint } | { withheld: WithheldConstraint } {
  const withhold = (reason: string) => ({ withheld: { rule_id: rule.team_rule_id, action: action.name, effect: p.effect, reason, proposed_quote: p.evidence_quote, model, prompt_version: CONSTRAINT_PROMPT_VERSION } });
  let found = verifyQuote(doc.text, p.evidence_quote);
  let method: Constraint['verification_method'] | null = found.verified ? found.method : null;
  if (!found.verified && repairedQuote) { found = verifyQuote(doc.text, repairedQuote); method = found.verified ? 'repaired' : null; }
  if (!found.verified || !method) return withhold('the quote is not in the source document');
  const operative = p.effect === 'prohibit' ? FORBIDS : p.effect === 'obligation' ? REQUIRES : null;
  if (operative && !operative.test(found.quoted_span) && operativeQuote) {
    const wider = verifyQuote(doc.text, operativeQuote);
    if (wider.verified && operative.test(wider.quoted_span)) { found = wider; method = 'repaired'; }
  }
  const quote = found.quoted_span;

  let max: number | null = null; let valueText: string | null = null; let hardMax: number | null = null; let hardMaxText: string | null = null;
  let elements: string | null = null; let obligation: string | null = null; let valueCheck: Constraint['value_check'] = 'none';
  let hardMaxQuote: string | null = null; let openAbove = false; let figureYear: number | null = null;
  if (p.effect === 'limit') {
    if (!action.parameter) return withhold('this action has no parameter a limit could apply to');
    const figure = (n: number | null, text: string | null, name: string, within: string): { ok: true; n: number | null; text: string | null } | { ok: false; reason: string } => {
      if (n === null) return { ok: true, n: null, text: null };
      if (!text || !containsText(within, text)) return { ok: false, reason: `the words given for ${name} are not inside the quote` };
      const read = parseQuantity(text, action.parameter!.name);
      if (read === null) return { ok: false, reason: `no single figure could be read from the words given for ${name}: "${text}"` };
      if (read !== n) return { ok: false, reason: `the words given for ${name} read as ${read}, the proposal says ${n}` };
      return { ok: true, n, text };
    };
    const a = figure(p.max, p.value_text, 'max', quote); if (!a.ok) return withhold(a.reason);
    // hard_max may rest on a second sentence, which must be in the source like the first.
    let hardQuote: string | null = null;
    if (p.hard_max !== null && p.hard_max_quote && !(p.hard_max_text && containsText(quote, p.hard_max_text))) {
      const second = verifyQuote(doc.text, p.hard_max_quote);
      if (!second.verified) return withhold('the quote given for hard_max is not in the source document');
      hardQuote = second.quoted_span;
    }
    const b = figure(p.hard_max, p.hard_max_text, 'hard_max', hardQuote ?? quote); if (!b.ok) return withhold(b.reason);
    if (a.n !== null && b.n !== null && b.n < a.n) return withhold('hard_max is below max');
    if (p.figure_year !== null && !new RegExp(`\\b${p.figure_year}\\b`).test(quote)) return withhold('the year given for the figure is not in the quote');
    max = a.n; valueText = a.text; hardMax = b.n; hardMaxText = b.text; hardMaxQuote = hardQuote; figureYear = p.figure_year;
    openAbove = p.cap_can_rise || ADJUSTABLE.test(quote) || ADJUSTABLE.test(`${rule.key_value ?? ''} ${rule.requirement}`);
    valueCheck = max !== null || hardMax !== null ? 'parsed' : 'none';
  } else if (p.effect === 'prohibit') {
    if (!FORBIDS.test(quote)) return withhold(NO_BAN_WORDS);
    elements = p.elements_untestable?.trim() || null;
    const marker = CONDITIONAL.exec(quote);
    if (!elements && marker) elements = `The quoted text makes the ban depend on "${marker[0]}".`;
  } else if (p.effect === 'obligation') {
    obligation = p.obligation_text?.trim() || null;
    if (!obligation) return withhold('an obligation with no stated duty');
    if (!REQUIRES.test(quote)) return withhold(NO_DUTY_WORDS);
  }
  return {
    constraint: {
      constraint_id: `${rule.team_rule_id}:${p.effect}:${sha(quote).slice(0, 6)}`, rule_id: rule.team_rule_id, action: action.name, effect: p.effect,
      parameter: p.effect === 'limit' ? action.parameter!.name : null, max, value_text: valueText, hard_max: hardMax, hard_max_text: hardMaxText,
      ...(p.effect === 'limit' ? { hard_max_quote: hardMaxQuote, open_above: openAbove, figure_year: figureYear } : {}),
      elements_untestable: elements, obligation_text: obligation, evidence_quote: quote, source_doc_id: doc.doc_id,
      span_start: found.span_start, span_end: found.span_end, verification_method: method, value_check: valueCheck, model, prompt_version: CONSTRAINT_PROMPT_VERSION
    }
  };
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (next < items.length) await work(items[next++]); }));
}

export async function runConstrain(options: ConstrainOptions = {}, deps: ConstrainDeps = {}): Promise<ConstrainReport> {
  const cacheDir = deps.cacheDir ?? GATE_PATHS.cache;
  const allRules = (deps.rules ?? readRuleStore()).filter(r => r.verified && actionFor(r.category));
  const rules = options.ruleIds ? allRules.filter(r => options.ruleIds!.includes(r.team_rule_id)) : allRules;
  const docs = new Map((deps.docs ?? [...loadOfficialDocs(), ...loadSupplementalDocs(), ...loadIngestedDocs(PATHS.ingested)]).map(d => [d.doc_id, d]));
  const modelName = deps.client?.model ?? deps.modelName ?? constraintModelName();
  const log = deps.log ?? (() => {});
  let client: ConstraintClient | null = deps.client ?? null;
  const getClient = () => (client ??= createConstraintClient());
  mkdirSync(cacheDir, { recursive: true });

  const report: ConstrainReport = { rules: allRules.length, model_calls: 0, verified: 0, withheld: 0, by_effect: {}, rules_without_constraint: [], errors: [] };
  const perRule = new Map<string, { constraints: Constraint[]; withheld: WithheldConstraint[] }>();

  await pool(rules, 4, async rule => {
    try {
      const action = actionFor(rule.category)!;
      const doc = docs.get(rule.source_doc_id);
      if (!doc) throw new Error(`source document ${rule.source_doc_id} is not available`);
      const window = sourceWindow(doc, rule);
      const key = sha(JSON.stringify([CONSTRAINT_PROMPT_VERSION, modelName, rule.team_rule_id, action.name, rule.quoted_span, sha(window)]));
      let cache = options.force ? null : readCache(cacheDir, rule.team_rule_id);
      if (cache && cache.key !== key) cache = null;
      if (!cache) {
        if (options.offline) throw new Error('no cached proposal for this rule; run without --offline');
        const proposal = await getClient().ask(SYSTEM, userPrompt(action, rule, window), ProposalSchema);
        report.model_calls++;
        cache = { key, model: modelName, prompt_version: CONSTRAINT_PROMPT_VERSION, proposal, repairs: {} };
      }
      const out = { constraints: [] as Constraint[], withheld: [] as WithheldConstraint[] };
      for (const p of cache.proposal.constraints) {
        let repaired: string | null = null;
        if (!verifyQuote(doc.text, p.evidence_quote).verified) {
          if (p.evidence_quote in cache.repairs) repaired = cache.repairs[p.evidence_quote];
          else if (!options.offline) {
            // One repair attempt: ask for the exact passage, nothing else.
            const answer = await getClient().ask(
              'A quote could not be found word for word in a source text. Return the exact passage of the source text that the quote was meant to be, copied character for character, one or two whole sentences. If no such passage exists, return an empty string.',
              `Quote that could not be found: ${p.evidence_quote}\n\n<source_text>\n${window}\n</source_text>`, RepairSchema);
            report.model_calls++;
            repaired = answer.evidence_quote.trim() || null;
            cache.repairs[p.evidence_quote] = repaired;
          }
        }
        let result = verifyProposal(p, rule, action, doc, repaired, cache.model);
        if ('withheld' in result && (result.withheld.reason === NO_BAN_WORDS || result.withheld.reason === NO_DUTY_WORDS)) {
          const key = `operative:${p.evidence_quote}`;
          let wider: string | null = null;
          if (key in cache.repairs) wider = cache.repairs[key];
          else if (!options.offline) {
            const answer = await getClient().ask(
              `A quote was offered as evidence that a text ${p.effect === 'prohibit' ? 'forbids' : 'requires'} something, but the quote does not itself contain the words that ${p.effect === 'prohibit' ? 'forbid' : 'require'}. Return the exact passage of the source text, copied character for character, that contains those words together with the part the quote was pointing at. For an item of a list, return the passage from the lead-in sentence of the list through the item that concerns the action. If no such passage exists, return an empty string.`,
              `Action: ${action.label}.\nQuote offered: ${p.evidence_quote}\n\n<source_text>\n${window}\n</source_text>`, RepairSchema);
            report.model_calls++;
            wider = answer.evidence_quote.trim() || null;
            cache.repairs[key] = wider;
          }
          if (wider) result = verifyProposal(p, rule, action, doc, repaired, cache.model, wider);
        }
        if ('constraint' in result) { if (!out.constraints.some(c => c.constraint_id === result.constraint.constraint_id)) out.constraints.push(result.constraint); }
        else out.withheld.push(result.withheld);
      }
      writeFileSync(cachePath(cacheDir, rule.team_rule_id), JSON.stringify(cache, null, 1) + '\n');
      perRule.set(rule.team_rule_id, out);
      log(`${rule.team_rule_id}: ${out.constraints.map(c => c.effect).join(', ') || 'nothing verified'}${out.withheld.length ? `; ${out.withheld.length} withheld` : ''}`);
    } catch (e) {
      report.errors.push({ rule_id: rule.team_rule_id, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // A partial run (--rules) keeps what the store already holds for the other rules.
  const constraintFile = deps.constraintFile ?? GATE_PATHS.constraints; const withheldFile = deps.withheldFile ?? GATE_PATHS.withheld;
  const read = <T,>(file: string): T[] => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as T) : []);
  const done = new Set(perRule.keys());
  const constraints = [...read<Constraint>(constraintFile).filter(c => !done.has(c.rule_id) && allRules.some(r => r.team_rule_id === c.rule_id)), ...[...perRule.values()].flatMap(v => v.constraints)];
  const withheld = [...read<WithheldConstraint>(withheldFile).filter(c => !done.has(c.rule_id) && allRules.some(r => r.team_rule_id === c.rule_id)), ...[...perRule.values()].flatMap(v => v.withheld)];
  // The lead's reading of the records: a rejected constraint moves to the withheld file and never decides.
  const review = readReview(deps.reviewFile ?? reviewPath());
  const rejected = new Map(review.rejected.map(r => [r.constraint_id, r.reason]));
  const kept = constraints.filter(c => !rejected.has(c.constraint_id));
  for (const c of constraints) if (rejected.has(c.constraint_id)) withheld.push({ rule_id: c.rule_id, action: c.action, effect: c.effect, reason: `rejected in lead review: ${rejected.get(c.constraint_id)}`, proposed_quote: c.evidence_quote, model: c.model, prompt_version: c.prompt_version });
  constraints.length = 0; constraints.push(...kept);
  writeConstraints(constraints, constraintFile); writeWithheld(withheld, withheldFile);

  report.verified = constraints.length; report.withheld = withheld.length;
  for (const c of constraints) report.by_effect[c.effect] = (report.by_effect[c.effect] ?? 0) + 1;
  report.rules_without_constraint = allRules.filter(r => !constraints.some(c => c.rule_id === r.team_rule_id)).map(r => r.team_rule_id).sort();
  report.errors.sort((a, b) => (a.rule_id < b.rule_id ? -1 : 1));
  return report;
}
