// Coverage of one rule at one address: requires AND NOT (any exempt group). Three-valued.
import type { Address, Condition, CoverageSpec } from '../contracts';
import { evaluateCondition, type Evaluated, type Tri } from './conditions';

export type Coverage = {
  value: Tri;
  /** Why a definite false came out false. */
  falseBecause: 'requirement_not_met' | 'exempt' | null;
  /** Conditions that decided the outcome (the failed requirement, the exemption that holds, or the unknown ones). */
  deciding: Evaluated[];
  unknowns: Evaluated[];
  caveats: string[];
};

type Judged = { value: Tri; deciding: Evaluated[]; unknowns: Evaluated[] };

function all(items: Evaluated[]): Judged {
  const falses = items.filter(i => i.value === false);
  if (falses.length) return { value: false, deciding: falses, unknowns: [] };
  const unknowns = items.filter(i => i.value === null);
  if (unknowns.length) return { value: null, deciding: unknowns, unknowns };
  return { value: true, deciding: items, unknowns: [] };
}

export function evaluateCoverage(spec: CoverageSpec, address: Pick<Address, 'year_built' | 'units' | 'units_min' | 'units_max'>, asOf: string): Coverage {
  const caveats: string[] = [];
  /** A caveat is neutral: true in `requires`, false inside an exempt group. */
  const run = (conditions: Condition[], caveatValue: boolean): Evaluated[] => conditions.map(c => {
    if (c.fact === 'caveat') { if (!caveats.includes(c.text)) caveats.push(c.text); return { value: caveatValue, text: c.text }; }
    return evaluateCondition(c, address, asOf);
  });

  const requires = all(run(spec.requires, true));
  const groups = spec.exempt_if.map(group => all(run(group, false)));
  const exemptTrue = groups.filter(g => g.value === true);
  const exemptUnknown = groups.filter(g => g.value === null);

  if (requires.value === false) return { value: false, falseBecause: 'requirement_not_met', deciding: requires.deciding, unknowns: [], caveats };
  if (exemptTrue.length) return { value: false, falseBecause: 'exempt', deciding: exemptTrue.flatMap(g => g.deciding), unknowns: [], caveats };
  const unknowns = [...requires.unknowns, ...exemptUnknown.flatMap(g => g.unknowns)];
  if (requires.value === null || exemptUnknown.length) return { value: null, falseBecause: null, deciding: unknowns, unknowns, caveats };
  return { value: true, falseBecause: null, deciding: requires.deciding, unknowns: [], caveats };
}
