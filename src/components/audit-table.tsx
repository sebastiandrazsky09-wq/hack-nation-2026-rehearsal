'use client';
import type { RuleView } from '../server/ordinal';
import { CATEGORY_LABELS, ORIGIN_LABELS, STATUS_LABELS, label } from './labels';
import { useApi } from './use-api';

type RulesResponse = { as_of: string; withheld_unverified: number; rules: RuleView[] };

export function AuditTable({ asOf }: { asOf: string | null }) {
  const { data, error, loading } = useApi<RulesResponse>(asOf ? `/api/rules?as_of=${asOf}` : null);
  if (!asOf) return <p role="alert" className="error">Enter a real date (YYYY-MM-DD) to list the rules.</p>;
  if (error) return <p role="alert" className="error">{error}</p>;
  if (loading || !data) return <p className="text-[var(--muted)]">Loading all extracted rules for {asOf}…</p>;
  return (
    <div>
      <p data-testid="audit-summary">
        {data.rules.length} extracted rules, with the status each one has on {data.as_of}. {data.withheld_unverified} {data.withheld_unverified === 1 ? 'rule was' : 'rules were'} withheld because the quoted text could not be verified against its source document.
      </p>
      <div className="table-wrap mt-3" tabIndex={0} role="region" aria-label="Extracted rules table">
        <table>
          <thead>
            <tr>
              <th>Rule id</th><th>Jurisdiction</th><th>Category</th><th>Status</th><th>Effective</th>
              <th>Citation</th><th>Source document</th><th>Retrieved</th><th>Verification</th><th>Conflict</th>
            </tr>
          </thead>
          <tbody>
            {data.rules.map(r => (
              <tr key={r.team_rule_id} data-testid="audit-row">
                <td>{r.team_rule_id}</td>
                <td>{r.jurisdiction}</td>
                <td>{label(CATEGORY_LABELS, r.category)}</td>
                <td>{label(STATUS_LABELS, r.status)}</td>
                <td>{r.effective_date ?? 'not stated'}</td>
                <td>{r.citation}</td>
                <td><a href={r.source_url} target="_blank" rel="noopener noreferrer">{r.source_doc_id}</a> ({ORIGIN_LABELS[r.source_origin] ?? r.source_origin})</td>
                <td>{r.retrieved_at ?? 'not recorded'}</td>
                <td>{r.verification_method}</td>
                <td>{r.conflict_flag ? `Yes: ${r.conflict_note ?? 'no note'}` : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
