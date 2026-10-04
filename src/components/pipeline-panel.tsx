'use client';
import type { PipelineResponse } from '../server/ordinal';
import { CATEGORY_LABELS, METHOD_LABELS, RESULT_LABELS, label } from './labels';
import { SignalMark } from './signal';
import { useApi } from './use-api';

const METRIC_LABELS: Record<string, string> = {
  official_docs_expected: 'Supplied documents expected',
  official_docs_processed: 'Supplied documents read',
  supplemental_docs_available: 'Team-captured pages available',
  supplemental_docs_processed: 'Team-captured pages read',
  ingested_docs: 'Added documents',
  rules_total: 'Rules extracted',
  rules_verified: 'Rules with a verified quote',
  rules_unverified: 'Rules with an unverified quote',
  rules_exported: 'Rules exported',
  rules_withheld: 'Rules withheld',
  rules_by_jurisdiction: 'Rules by jurisdiction',
  rules_by_category: 'Rules by category',
  rules_citation_not_in_source: 'Rules whose citation text is not in the source',
  rules_supplemental_only: 'Rules supported only by a team-captured page',
  conflicts: 'Conflicts flagged',
  addresses_total: 'Addresses',
  addresses_resolved: 'Addresses placed in a legal city',
  resolve_methods: 'How addresses were placed',
  lookup_addresses: 'Addresses with lookups',
  lookup_rows: 'Answers produced',
  result_counts: 'Answers by result',
  schema_errors: 'Schema errors',
  empty_cells: 'Jurisdiction and category pairs with no rule'
};
const keyName = (k: string) => CATEGORY_LABELS[k] ?? RESULT_LABELS[k] ?? METHOD_LABELS[k]?.split(':')[0] ?? label({}, k);

/** Step details may embed a JSON object; show it as "name n, name n". */
function readable(detail: string): string {
  return detail.replace(/\{[^{}]*\}/g, m => {
    try { return Object.entries(JSON.parse(m)).map(([k, n]) => `${keyName(k)} ${String(n)}`).join(', '); } catch { return m; }
  });
}

function parsed(value: number | string): unknown {
  if (typeof value !== 'string' || !/^\s*[[{]/.test(value)) return value;
  try { return JSON.parse(value); } catch { return value; }
}

function MetricValue({ value }: { value: number | string }) {
  const v = parsed(value);
  if (Array.isArray(v)) {
    return (
      <details>
        <summary>{v.length} entries</summary>
        <ul className="plain-list">{v.map(x => <li key={String(x)}>{String(x).split('|').map(keyName).join(': ')}</li>)}</ul>
      </details>
    );
  }
  if (v && typeof v === 'object') {
    return <ul className="plain-list">{Object.entries(v).map(([k, n]) => <li key={k}>{keyName(k)}: {String(n)}</li>)}</ul>;
  }
  return <>{String(v)}</>;
}

// What the self-check refuses to pass. These are the invariants `ordinal selfcheck` enforces.
const CHECKS = [
  'Every exported quote is still the exact slice of its source document.',
  'Every rule record matches the official schema.',
  'No pending or failed proposal is reported as in force at any address.',
  'No effective date comes from an amendment note or the start of a rate period.',
  'All 500 addresses are placed and have answers.',
  'Two exports of the same inputs are identical, byte for byte.'
];

export function PipelinePanel() {
  const { data, error, loading } = useApi<PipelineResponse>('/api/pipeline');
  if (error) return <p role="alert" className="error">{error}</p>;
  if (loading || !data) return <div className="skeleton" aria-busy="true"><p>Loading how the answers were produced…</p><span /><span /><span /></div>;
  const { selfcheck } = data;
  return (
    <div className="method">
      <div className="view-lead">
        <h3 className="section-title">How the rule store was produced</h3>
        <p>Fixed steps, rebuilt byte for byte from the committed store with no model call.</p>
      </div>

      <ol data-testid="pipeline-steps" className="steps">
        {data.steps.map(s => <li key={s.name}><strong>{s.name}.</strong> {readable(s.detail)}</li>)}
      </ol>

      <section className="selfcheck">
        <h3>Self-check</h3>
        {!selfcheck && <p data-testid="selfcheck-verdict">No selfcheck report in this build</p>}
        {selfcheck && (
          <>
            <p data-testid="selfcheck-verdict" className={selfcheck.ok ? 'verdict verdict-ok' : 'verdict error'}>
              <SignalMark result={selfcheck.ok ? 'applies' : 'unknown'} /><strong>{selfcheck.ok ? 'Self-check passed.' : 'Self-check failed.'}</strong>
              <span>{selfcheck.ok ? ' The build would fail if any of these stopped being true.' : ' The failures are listed below.'}</span>
            </p>
            {selfcheck.failures.length > 0 && <ul className="plain-list">{selfcheck.failures.map(f => <li key={f}>{f}</li>)}</ul>}
            {selfcheck.ok && <ul className="checks">{CHECKS.map(c => <li key={c}>{c}</li>)}</ul>}
            <details className="measures">
              <summary>All {Object.keys(selfcheck.metrics).length} measures</summary>
              <div className="table-wrap">
                <table data-testid="selfcheck-metrics">
                  <thead><tr><th>Measure</th><th>Value</th></tr></thead>
                  <tbody>
                    {Object.entries(selfcheck.metrics).map(([k, v]) => (
                      <tr key={k}><td>{METRIC_LABELS[k] ?? label({}, k)}</td><td><MetricValue value={v} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>
    </div>
  );
}
