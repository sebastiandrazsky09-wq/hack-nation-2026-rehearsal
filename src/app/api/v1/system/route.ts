import { ACTIONS, type ActionName } from '../../../../gate/contract';
import { guard, methodNotAllowed } from '../../../../gate/http';
import { checkBatch } from '../../../../gate/index';
import { readWithheld } from '../../../../gate/store';
import { DEFAULT_AS_OF } from '../../../../ordinal/contracts';
import { gateData } from '../../../../server/gate';
import { DISCLAIMER, pipeline } from '../../../../server/ordinal';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/system: the two planes in figures. Everything is counted from the stores at request time;
 * the batch time is measured by running one action over the whole registry for this response.
 */
export const GET = () => guard(() => {
  const data = gateData();
  const metrics = pipeline().selfcheck?.metrics ?? {};
  const n = (key: string) => (typeof metrics[key] === 'number' ? metrics[key] as number : null);
  const categories = new Set(Object.values(ACTIONS).map(a => a.category));
  const actionRules = data.rules.filter(r => categories.has(r.category));
  const byEffect: Record<string, number> = {};
  for (const c of data.constraints) byEffect[c.effect] = (byEffect[c.effect] ?? 0) + 1;
  const docs = [n('official_docs_processed'), n('supplemental_docs_processed'), n('ingested_docs')];
  const action: ActionName = 'set_rent_with_pricing_algorithm';
  const batch = checkBatch({ subject: { type: 'software_agent' }, action: { name: action }, context: { as_of: DEFAULT_AS_OF }, resources: 'all' }, data);
  return {
    ruleset_version: data.rulesetVersion,
    compile: {
      documents_read: docs.every(d => d !== null) ? docs.reduce<number>((sum, d) => sum + (d ?? 0), 0) : null,
      rules: data.rules.length, rules_withheld: n('rules_withheld'),
      rules_in_action_categories: actionRules.length,
      rules_with_constraint: actionRules.filter(r => data.constraints.some(c => c.rule_id === r.team_rule_id)).length,
      constraints_verified: data.constraints.length, constraints_withheld: readWithheld().length, constraints_by_effect: byEffect
    },
    decision: {
      actions: Object.keys(ACTIONS).length, properties: data.addresses.length,
      known_gaps: data.gaps.filter(g => categories.has(g.category)).map(g => g.text),
      measured: { action, as_of: batch.as_of, evaluated: batch.evaluated, evaluated_ms: batch.evaluated_ms, counts: batch.counts }
    },
    disclaimer: DISCLAIMER
  };
});
const notAllowed = () => methodNotAllowed('GET');
export const POST = notAllowed, PUT = notAllowed, PATCH = notAllowed, DELETE = notAllowed;
