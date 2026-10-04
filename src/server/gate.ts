// Loads everything a decision rests on once and serves it from memory. No model call happens at request time.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadManifest, PATHS } from '../ordinal/corpus';
import type { ChangeCase } from '../ordinal/entrypoints';
import { computeKnownGaps } from '../gate/coverage';
import type { GateData } from '../gate/index';
import { readConstraints, rulesetVersion } from '../gate/store';
import { dataset } from './ordinal';

let cached: GateData | null = null;
/** Rebuilt whenever the rule store or the constraint store changes, which `rulesetVersion()` detects. */
export function gateData(): GateData {
  const version = rulesetVersion();
  if (cached && cached.rulesetVersion === version) return cached;
  const { rules, addresses, stacks } = dataset();
  const manifest = loadManifest();
  const supplementalIds = new Set(manifest.filter(r => existsSync(path.join(PATHS.supplementalText, r.doc_id + '.txt'))).map(r => r.doc_id));
  const cases = existsSync(PATHS.changeTests) ? JSON.parse(readFileSync(PATHS.changeTests, 'utf8')) as ChangeCase[] : [];
  const known = new Set(rules.map(r => r.team_rule_id));
  const constraints = readConstraints().filter(c => known.has(c.rule_id));
  cached = { rules, addresses, stacks, constraints, rulesetVersion: version, gaps: computeKnownGaps(rules, cases, manifest, supplementalIds), manifest, supplementalIds };
  return cached;
}
