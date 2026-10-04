'use client';
import { ChevronDown } from 'lucide-react';
import type { LookupResponse } from '../server/ordinal';
import { ORIGIN_LABELS, RESULT_LABELS, VERIFICATION_LABELS, factName, label, shortDate } from './labels';
import { FlagMark, ResultBadge } from './signal';
import { SourceLink } from './source-link';
import { Lifeline, timingPhrase } from './timeline';

export type ResultRow = LookupResponse['results'][number];

/**
 * One rule at this address: the answer, what the law requires, where it comes from and its line in time.
 * The evidence (why, the quoted sentence, source and conditions) opens in place.
 */
export function RuleRow({ item, asOf, needle, open, was, onToggle, onJump }: {
  /** `asOf` is the date the answer was computed for; `needle` is where the date control is now. */
  item: ResultRow; asOf: string; needle: string; open: boolean; was: string | null | undefined;
  onToggle: () => void; onJump: (date: string) => void;
}) {
  const { rule } = item;
  const needs = item.result === 'unknown' && item.missing_facts.length > 0;
  const detailId = `detail-${item.team_rule_id}`;
  const timing = timingPhrase(rule);
  // Other documents that support the same rule; the primary source is already shown.
  const others = [...new Map(rule.also_supported_by.filter(s => s.source_doc_id !== rule.source_doc_id).map(s => [s.source_doc_id, s])).values()];
  return (
    <article data-testid="rule-card" className={`rule ${open ? 'is-open' : ''} ${was !== undefined ? 'is-changed' : ''}`}>
      <div className="rule-row">
        <div className="rule-signal">
          <ResultBadge result={item.result} />
          {was !== undefined && <span className="was" data-testid="was">{was === null ? 'new on this date' : `was ${label(RESULT_LABELS, was).toLowerCase()}`}</span>}
        </div>
        <div className="rule-main">
          <h4 className="rule-title">
            <button type="button" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>{rule.title}</button>
          </h4>
          <p className="rule-req">{rule.requirement}</p>
          <p className="rule-meta">
            <span>{rule.jurisdiction}, {rule.level === 'state' ? 'state rule' : 'city rule'}</span>
            <span>{rule.citation}</span>
            {timing && <span className="rule-timing">{timing}</span>}
          </p>
          {needs && (
            <div className="needs" data-testid="needs">
              <span className="needs-lead">What would settle it.</span> Needs:{' '}
              <ul data-testid="missing-facts">{item.missing_facts.map(f => <li key={f}>{factName(f)}</li>)}</ul>
            </div>
          )}
          {item.conflict_flag && (
            <p className="conflict" role="note">
              <FlagMark /> <strong>Conflict flagged for review.</strong> {item.conflict_note ?? 'No note was recorded.'}
            </p>
          )}
        </div>
        <div className="rule-track"><Lifeline rule={rule} result={item.result} asOf={needle} onJump={onJump} /></div>
        {/* A second, pointer-only handle for the same disclosure; the title button is the one keyboards and screen readers use. */}
        <button type="button" className="rule-toggle" tabIndex={-1} aria-hidden onClick={onToggle}>
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="rule-detail" id={detailId}>
          <div className="detail-why">
            <h5>Why this answer</h5>
            <p>{item.explanation}</p>
            {(rule.coverage_conditions || rule.exemptions || item.caveats.length > 0) && <h5>Who it covers</h5>}
            {rule.coverage_conditions && <p>{rule.coverage_conditions}</p>}
            {rule.exemptions && <p><span className="term">Exemptions.</span> {rule.exemptions}</p>}
            {item.caveats.length > 0 && (
              <>
                <p><span className="term">Not tested against this building.</span></p>
                <ul className="plain-list">{item.caveats.map(c => <li key={c}>{c}</li>)}</ul>
              </>
            )}
          </div>
          <div className="detail-law">
            <h5>The law&rsquo;s own words</h5>
            <blockquote className="quote">{rule.quoted_span}</blockquote>
            <dl className="provenance">
              <div><dt>Citation</dt><dd>{rule.citation}</dd></div>
              {rule.key_value && <div><dt>Key value</dt><dd>{rule.key_value}</dd></div>}
              {rule.penalty && <div><dt>Penalty</dt><dd>{rule.penalty}</dd></div>}
              <div><dt>Effective</dt><dd>{rule.effective_date ? shortDate(rule.effective_date) : 'not stated in the source'}</dd></div>
              <div>
                <dt>Source</dt>
                <dd>
                  <SourceLink url={rule.source_url} icon>{rule.source_doc_id}</SourceLink>
                  , {ORIGIN_LABELS[rule.source_origin] ?? rule.source_origin}. Retrieved {rule.retrieved_at ?? 'date not recorded'}. As of {asOf}.
                </dd>
              </div>
              <div><dt>Quote check</dt><dd>The quoted text was {VERIFICATION_LABELS[rule.verification_method] ?? rule.verification_method}.</dd></div>
              {others.length > 0 && (
                <div><dt>Also in</dt><dd>{others.map((s, i) => <span key={`${s.source_doc_id}-${i}`}>{i > 0 ? ', ' : ''}<SourceLink url={s.source_url}>{s.source_doc_id}</SourceLink></span>)}</dd></div>
              )}
            </dl>
          </div>
        </div>
      )}
    </article>
  );
}
