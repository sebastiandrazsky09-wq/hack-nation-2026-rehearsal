'use client';
import { DecisionMark } from './decision-mark';
import { useApi } from './use-api';

type SystemResponse = {
  ruleset_version: string;
  compile: { documents_read: number | null; rules: number; rules_withheld: number | null; rules_in_action_categories: number; rules_with_constraint: number; constraints_verified: number; constraints_withheld: number; constraints_by_effect: Record<string, number> };
  decision: { actions: number; properties: number; known_gaps: string[]; measured: { action: string; as_of: string; evaluated: number; evaluated_ms: number; counts: Record<'PASS' | 'BLOCK' | 'REQUIRE' | 'REVIEW', number> } };
};
const EFFECT_WORDS: Record<string, string> = { prohibit: 'prohibitions', limit: 'limits', obligation: 'duties', none: 'no effect' };
const ORDER = ['BLOCK', 'REVIEW', 'REQUIRE', 'PASS'] as const;

/** The two planes: what is compiled ahead of time with a model and verified, and what happens on a request with no model at all. */
export function Planes() {
  const { data, error } = useApi<SystemResponse>('/api/v1/system');
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!data) return <div className="skeleton" aria-busy="true"><p>Loading the system figures…</p><span /><span /></div>;
  const { compile: c, decision: d } = data;
  const effects = Object.entries(c.constraints_by_effect).map(([k, n]) => `${n} ${EFFECT_WORDS[k] ?? k}`).join(', ');
  return (
    <div className="planes" data-testid="planes">
      <div className="view-lead">
        <h2>System</h2>
        <p>Law is compiled ahead of time, with a model that proposes and a verifier that decides what is kept. A check at request time reads only the compiled, verified records. No model runs on a request.</p>
      </div>
      <section className="plane" aria-labelledby="plane-compile">
        <h3 id="plane-compile">Compile plane <span>ahead of time, model-assisted, mechanically verified</span></h3>
        <ol>
          <li><strong>Law</strong><span>{c.documents_read ?? 'not counted'} source documents read</span></li>
          <li><strong>Extraction</strong><span>{c.rules} rules, each proposed by a model with a quote</span></li>
          <li><strong>Verification</strong><span>{c.rules} quotes found word for word in their source; {c.rules_withheld ?? 0} withheld</span></li>
          <li><strong>Constraints</strong><span>{c.constraints_verified} verified for {c.rules_with_constraint} of {c.rules_in_action_categories} rules in the gated categories ({effects}); {c.constraints_withheld} withheld</span></li>
          <li><strong>Version</strong><span>ruleset <code>{data.ruleset_version}</code>, a hash of the rule and constraint stores</span></li>
        </ol>
      </section>
      <section className="plane" aria-labelledby="plane-decision">
        <h3 id="plane-decision">Decision plane <span>at request time, deterministic, no model</span></h3>
        <ol>
          <li><strong>Request</strong><span>subject, action, property, date and facts; {d.actions} actions</span></li>
          <li><strong>Jurisdiction</strong><span>{d.properties} registry properties placed in a legal city</span></li>
          <li><strong>Applicable rules</strong><span>the engine&rsquo;s answer per rule: applies, unknown, not yet effective, pending, superseded</span></li>
          <li><strong>Evaluation</strong><span>verified constraints against the request; anything unsettled is REVIEW</span></li>
          <li><strong>Decision</strong><span>PASS, BLOCK, REQUIRE or REVIEW, with an id that is a hash of the request and the ruleset</span></li>
          <li><strong>Trace</strong><span>the steps per rule and the quoted sentence</span></li>
        </ol>
        <p className="plane-measure" data-testid="plane-measure">
          Measured for this page: the pricing-algorithm action over {d.measured.evaluated} properties as of {d.measured.as_of} took {d.measured.evaluated_ms.toFixed(1)} ms on the server.{' '}
          {ORDER.map(k => <span key={k} className="plane-count"><DecisionMark decision={k} size={13} />{d.measured.counts[k]} {k}</span>)}
        </p>
        {d.known_gaps.length > 0 && (
          <div className="plane-gaps">
            <p><strong>Known gaps in the gated categories.</strong> A check that falls in one returns REVIEW, never PASS.</p>
            <ul className="plain-list">{d.known_gaps.map(g => <li key={g}>{g}</li>)}</ul>
          </div>
        )}
      </section>
    </div>
  );
}
