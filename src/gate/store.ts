// Where the gate's own compiled data lives, and the version stamp of everything a decision rests on. Lead-owned.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS, ROOT } from '../ordinal/corpus';
import { ConstraintSchema, WithheldConstraintSchema, type Constraint, type WithheldConstraint } from './contract';

export const GATE_PATHS = {
  /** Verified constraints: the only constraint data a decision may read. */
  constraints: path.join(ROOT, 'store', 'constraints.jsonl'),
  /** Proposals that failed verification, kept for audit. Never read by a decision. */
  withheld: path.join(ROOT, 'store', 'constraints.withheld.jsonl'),
  /** One cached model answer per rule, so the step replays offline. */
  cache: path.join(ROOT, 'store', 'constraints')
};

const lines = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(l => l.trim()) : []);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function readConstraints(file = GATE_PATHS.constraints): Constraint[] {
  return lines(file).map(l => ConstraintSchema.parse(JSON.parse(l)));
}
export function writeConstraints(constraints: Constraint[], file = GATE_PATHS.constraints): void {
  const sorted = [...constraints].sort((a, b) => cmp(a.constraint_id, b.constraint_id));
  writeFileSync(file, sorted.map(c => JSON.stringify(c)).join('\n') + (sorted.length ? '\n' : ''));
}
export function readWithheld(file = GATE_PATHS.withheld): WithheldConstraint[] {
  return lines(file).map(l => WithheldConstraintSchema.parse(JSON.parse(l)));
}
export function writeWithheld(items: WithheldConstraint[], file = GATE_PATHS.withheld): void {
  const sorted = [...items].sort((a, b) => cmp(a.rule_id + a.proposed_quote, b.rule_id + b.proposed_quote));
  writeFileSync(file, sorted.map(c => JSON.stringify(c)).join('\n') + (sorted.length ? '\n' : ''));
}

/** sha256 over the rule store and the constraint store, first 12 hex characters. Changes whenever either file does. */
export function rulesetVersion(ruleFile = PATHS.ruleStore, constraintFile = GATE_PATHS.constraints): string {
  const hash = createHash('sha256');
  hash.update(readFileSync(ruleFile));
  hash.update('\n--constraints--\n');
  if (existsSync(constraintFile)) hash.update(readFileSync(constraintFile));
  return hash.digest('hex').slice(0, 12);
}
