'use client';
import { useState } from 'react';
import type { RuleView } from '../server/ordinal';
import { CATEGORY_LABELS, ORIGIN_LABELS, STATUS_LABELS, VERIFICATION_LABELS, label, shortDate } from './labels';
import { FlagMark, SignalMark } from './signal';
import { useApi } from './use-api';

type RulesResponse = { as_of: string; withheld_unverified: number; rules: RuleView[] };
// Which signal mark stands for each status of a rule on the chosen date.
const STATUS_MARK: Record<string, string> = { in_force: 'applies', not_yet_effective: 'not_yet_effective', pending: 'pending', failed: 'failed' };

export function AuditTable({ asOf }: { asOf: string | null }) {
  const { data, error, loading } = useApi<RulesResponse>(asOf ? `/api/rules?as_of=${asOf}` : null);
  const [query, setQuery] = useState('');
  if (!asOf) return <p role="alert" className="error">Enter a real date (YYYY-MM-DD) to list the rules.</p>;
  if (error) return <p role="alert" className="error">{error}</p>;
  if (loading || !data) return <div className="skeleton" aria-busy="true"><p>Loading all extracted rules for {asOf}…</p><span /><span /><span /></div>;
  const q = query.trim().toLowerCase();
  const rows = q
    ? data.rules.filter(r => `${r.team_rule_id} ${r.title} ${r.jurisdiction} ${label(CATEGORY_LABELS, r.category)} ${r.citation} ${label(STATUS_LABELS, r.status)}`.toLowerCase().includes(q))
    : data.rules;
  return (
    <div className="audit">
      <div className="view-lead">
        <h2>All extracted rules</h2>
        <p data-testid="audit-summary">
          {data.rules.length} extracted rules, with the status each one has on {data.as_of}. {data.withheld_unverified} {data.withheld_unverified === 1 ? 'rule was' : 'rules were'} withheld because the quoted text could not be verified against its source document.
        </p>
      </div>
      <div className="audit-tools">
        <label htmlFor="audit-filter">Filter rules</label>
        <input id="audit-filter" type="search" placeholder="Jurisdiction, category, citation or status" value={query} onChange={e => setQuery(e.target.value)} />
        <span role="status">{q ? `${rows.length} of ${data.rules.length} shown` : ''}</span>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Extracted rules table">
        <table className="audit-table">
          <thead>
            <tr><th>Status</th><th>Rule</th><th>Jurisdiction</th><th>Category</th><th>Effective</th><th>Citation</th><th>Source</th><th>Quote check</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.team_rule_id} data-testid="audit-row">
                <td className={`status signal-${STATUS_MARK[r.status] ?? 'pending'}`}><SignalMark result={STATUS_MARK[r.status] ?? 'pending'} size={14} />{label(STATUS_LABELS, r.status)}</td>
                <td>
                  <span className="audit-title">{r.title}</span>
                  <span className="audit-id">{r.team_rule_id}</span>
                  {r.conflict_flag && <span className="audit-conflict"><FlagMark size={12} />Conflict: {r.conflict_note ?? 'no note'}</span>}
                </td>
                <td>{r.jurisdiction}</td>
                <td>{label(CATEGORY_LABELS, r.category)}</td>
                <td className="num">{r.effective_date ? shortDate(r.effective_date) : 'not stated'}</td>
                <td>{r.citation}</td>
                <td><a href={r.source_url} target="_blank" rel="noopener noreferrer">{r.source_doc_id}</a><span className="audit-id">{ORIGIN_LABELS[r.source_origin] ?? r.source_origin}; retrieved {r.retrieved_at ?? 'not recorded'}</span></td>
                <td>{VERIFICATION_LABELS[r.verification_method] ?? r.verification_method}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
