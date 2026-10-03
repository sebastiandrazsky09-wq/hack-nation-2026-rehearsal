import type { LookupResponse } from '../server/ordinal';
import { ORIGIN_LABELS, RESULT_LABELS, label } from './labels';

export type ResultRow = LookupResponse['results'][number];

export function ResultBadge({ result }: { result: string }) {
  return <span data-testid="result-badge" className={`badge badge-${result}`}>{label(RESULT_LABELS, result)}</span>;
}

export function RuleCard({ item, asOf }: { item: ResultRow; asOf: string }) {
  const { rule } = item;
  const showMissing = item.result === 'unknown' && item.missing_facts.length > 0;
  return (
    <article data-testid="rule-card" className="card">
      <div className="flex flex-wrap items-center gap-2">
        <ResultBadge result={item.result} />
        <span className="text-sm text-[var(--muted)]">{rule.jurisdiction} · {rule.level === 'state' ? 'State rule' : 'City rule'}</span>
      </div>
      <h4 className="mt-2 text-base font-semibold">{rule.title}</h4>
      <p className="mt-2"><span className="field">Requirement</span> {rule.requirement}</p>
      {rule.key_value && <p className="mt-1"><span className="field">Key value</span> {rule.key_value}</p>}
      <p className="mt-2"><span className="field">Why this result</span> {item.explanation}</p>
      {showMissing && (
        <div className="mt-2">
          <p className="field">What is missing</p>
          <ul className="ml-5 list-disc">{item.missing_facts.map(f => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
      {item.caveats.length > 0 && (
        <div className="mt-2">
          <p className="field">Caveats</p>
          <ul className="ml-5 list-disc">{item.caveats.map(c => <li key={c}>{c}</li>)}</ul>
        </div>
      )}
      {item.conflict_flag && (
        <p className="conflict mt-3" role="note">
          <strong>Conflict flagged for review.</strong> {item.conflict_note ?? 'No note was recorded.'}
        </p>
      )}
      <p className="mt-2"><span className="field">Effective</span> {rule.effective_date ?? 'date not stated'}</p>
      <p className="mt-1"><span className="field">Citation</span> {rule.citation}</p>
      <blockquote className="quote">{rule.quoted_span}</blockquote>
      <p className="meta">
        Source{' '}
        <a href={rule.source_url} target="_blank" rel="noopener noreferrer">{rule.source_doc_id}</a>
        {' '}· {ORIGIN_LABELS[rule.source_origin] ?? rule.source_origin}
        {' '}· Retrieved {rule.retrieved_at ?? 'date not recorded'}
        {' '}· As of {asOf}
      </p>
    </article>
  );
}
