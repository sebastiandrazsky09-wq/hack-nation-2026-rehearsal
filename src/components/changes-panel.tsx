'use client';
import { useMemo } from 'react';
import type { ChangesResponse, RuleView } from '../server/ordinal';
import { DEFAULT_AS_OF, RESULT_LABELS, RESULT_ORDER, label, shortDate } from './labels';
import { FlagMark, SignalMark } from './signal';
import { YEARS, frac, toDay } from './timeline';
import { useApi } from './use-api';

type CaseRow = ChangesResponse['cases'][number];
const NO_CITY = 'no legal city found';
const pct = (f: number) => `${(f * 100).toFixed(3)}%`;

/** Counts ids per legal city, using the legal_city the address API returns. */
function byCity(ids: string[], cityOf: Map<string, string | null>): [string, number][] {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const city = cityOf.get(id) ?? NO_CITY;
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

function CityBars({ ids, cityOf, tone }: { ids: string[]; cityOf: Map<string, string | null>; tone?: 'conflict' }) {
  if (ids.length === 0) return null;
  const rows = byCity(ids, cityOf);
  const max = rows[0][1];
  return (
    <ul className={`bars ${tone ? `bars-${tone}` : ''}`}>
      {rows.map(([city, n]) => (
        <li key={city}><span className="bar-label">{city}</span><span className="bar" aria-hidden><i style={{ width: pct(n / max) }} /></span><span className="bar-n">{n}</span></li>
      ))}
    </ul>
  );
}

/** The selected rules as lines in time, with the dates the case looks at drawn across them. */
function CaseTimeline({ dates, rules }: { dates: string[]; rules: RuleView[] }) {
  const sorted = [...dates].sort();
  const close = sorted.length === 2 && Math.abs(frac(toDay(sorted[1])) - frac(toDay(sorted[0]))) < 0.04;
  const needles = close ? [{ at: sorted[1], text: `${shortDate(sorted[0])} and ${shortDate(sorted[1])}` }] : sorted.map(d => ({ at: d, text: shortDate(d) }));
  return (
    <div className="case-time" aria-hidden>
      <div className="case-needles">
        {needles.map(n => {
          const f = frac(toDay(n.at));
          return <span key={n.at} className={`case-needle ${f > 0.7 ? 'case-needle-left' : ''}`} style={{ left: pct(f) }}><em>{n.text}</em></span>;
        })}
      </div>
      <div className="case-scale">{YEARS.map(y => <span key={y} style={{ left: pct(frac(toDay(`${y}-01-01`))) }}>{y}</span>)}</div>
      {rules.map(rule => {
        const pending = rule.legal_status !== 'enacted';
        const start = rule.effective_date ? frac(toDay(rule.effective_date)) : 0;
        const lead = rule.effective_date && rule.enacted_date && toDay(rule.enacted_date) < toDay(rule.effective_date) ? frac(toDay(rule.enacted_date)) : null;
        return (
          <div key={rule.team_rule_id} className="case-rule">
            <div className="life">
              {pending
                ? <span className={`life-line ${rule.legal_status === 'failed' ? 'life-failed' : 'life-dashed'}`} style={{ left: 0, right: 0 }} />
                : <>
                  {lead !== null && lead < start && <span className="life-line life-lead" style={{ left: pct(lead), width: pct(start - lead) }} />}
                  <span className={`life-line ${rule.effective_date ? '' : 'life-open'}`} style={{ left: pct(start), right: 0 }} />
                  {rule.effective_date && <span className="life-tick" style={{ left: pct(start) }} />}
                </>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A neutral note about a gap in the sources. It is not an error: the case is shown with what the data supports. */
function SourceNote({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div data-testid="changes-errors" className="gap">
      <strong>Gap in the sources.</strong>
      <ul className="plain-list">{notes.map(e => <li key={e}>{e}</li>)}</ul>
    </div>
  );
}

function CaseBlock({ c, cityOf, ruleOf, onOpen, notes }: {
  c: CaseRow; cityOf: Map<string, string | null>; ruleOf: Map<string, RuleView>; onOpen: (addressId: string, asOf: string) => void; notes: string[];
}) {
  const caseDate = [...c.dates].sort().at(-1) ?? '';
  const present = new Set(Object.values(c.counts).flatMap(row => Object.keys(row)));
  const results = [...RESULT_ORDER.filter(r => present.has(r)), ...[...present].filter(r => !RESULT_ORDER.includes(r))];
  // Two selectors can resolve to the same rule (both pending bills of one state match either proposal label): each rule is listed once.
  const selectorsOf = new Map<string, string[]>();
  for (const s of c.selected) for (const id of s.team_rule_ids) selectorsOf.set(id, [...(selectorsOf.get(id) ?? []), s.selector]);
  const ruleIds = [...selectorsOf.keys()];
  const rules = ruleIds.map(id => ruleOf.get(id)).filter((r): r is RuleView => r !== undefined);
  return (
    <section data-testid="change-case" data-test-id={c.test_id} className="case">
      <header className="case-head">
        <h3>{c.title ?? c.test_id}</h3>
        <p className="case-when">{c.dates.length > 1 ? `Compared on ${c.dates.map(shortDate).join(' and ')}` : `Evaluated on ${c.dates.map(shortDate).join('')}`}, case {c.test_id}</p>
      </header>
      <SourceNote notes={notes} />

      <div className="case-body">
        <div className="case-effect">
          <p className="case-count" data-testid="affected-count">{c.affected_address_ids.length} addresses affected</p>
          <CityBars ids={c.affected_address_ids} cityOf={cityOf} />
          <p className={`case-conflicts ${c.conflict_flag_address_ids.length ? 'has-conflicts' : ''}`} data-testid="conflict-count">
            {c.conflict_flag_address_ids.length > 0 && <FlagMark />}{c.conflict_flag_address_ids.length} addresses flagged for conflict review
          </p>
          <CityBars ids={c.conflict_flag_address_ids} cityOf={cityOf} tone="conflict" />
        </div>

        <div className="case-evidence">
          {rules.length > 0 && <CaseTimeline dates={c.dates} rules={rules} />}
          <ul className="case-rules">
            {ruleIds.map(id => (
              <li key={id}>
                <span className="case-rule-name">{ruleOf.get(id)?.title ?? id}<span className="case-rule-id">{ruleOf.get(id)?.jurisdiction ? `${ruleOf.get(id)!.jurisdiction}, ` : ''}{id}, matched from {selectorsOf.get(id)!.join(' and ')}</span></span>
              </li>
            ))}
            {c.selected.filter(s => s.team_rule_ids.length === 0).map(s => (
              <li key={s.selector}><span data-testid="selector-gap" className="gap"><strong>Gap.</strong> {s.selector} did not match any rule in the extracted set, so nothing is evaluated for it.</span></li>
            ))}
          </ul>
          <div className="table-wrap">
            <table className="counts">
              <thead><tr><th>Date</th>{results.map(r => <th key={r}><SignalMark result={r} size={13} />{label(RESULT_LABELS, r)}</th>)}</tr></thead>
              <tbody>
                {c.dates.map(d => <tr key={d}><td>{shortDate(d)}</td>{results.map(r => <td key={r} className={c.counts[d]?.[r] ? '' : 'is-zero'}>{c.counts[d]?.[r] ?? 0}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          {ruleIds.length > 1 && <p className="counts-note">Counts are answers, one per selected rule and address: {ruleIds.length} rules across the affected addresses.</p>}
        </div>
      </div>

      {c.expected_behavior && <p className="case-expects"><span className="term">What the test expects.</span> {c.expected_behavior}</p>}
      <div className="case-more">
        {c.notes && (
          <details>
            <summary>How this was computed</summary>
            <p>{c.notes}</p>
          </details>
        )}
        {c.affected_address_ids.length > 0 && (
          <details>
            <summary>Show the affected addresses</summary>
            <p className="idlist-note">Choosing one opens its rules as of {caseDate}.</p>
            <ul className="idlist">
              {c.affected_address_ids.map(id => (
                <li key={id}><button type="button" onClick={() => onOpen(id, caseDate)}>{id}</button></li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

export function ChangesPanel({ addresses, onOpen }: {
  addresses: { address_id: string; legal_city: string | null }[];
  onOpen: (addressId: string, asOf: string) => void;
}) {
  const { data, error, loading } = useApi<ChangesResponse>('/api/changes');
  const rulesApi = useApi<{ rules: RuleView[] }>(`/api/rules?as_of=${DEFAULT_AS_OF}`);
  const cityOf = useMemo(() => new Map(addresses.map(a => [a.address_id, a.legal_city])), [addresses]);
  const ruleOf = useMemo(() => new Map((rulesApi.data?.rules ?? []).map(r => [r.team_rule_id, r])), [rulesApi.data]);
  if (error) return <p role="alert" className="error">{error}</p>;
  if (loading || !data) return <div className="skeleton" aria-busy="true"><p>Loading the change cases…</p><span /><span /><span /></div>;
  // The API reports a gap as "TEST_ID: …". A gap belongs on its case; one that names no case stays at the top.
  const notesFor = (testId: string) => data.errors.filter(e => e.startsWith(`${testId}:`));
  const loose = data.errors.filter(e => !data.cases.some(c => e.startsWith(`${c.test_id}:`)));
  return (
    <div className="changes">
      <div className="view-lead">
        <h2>What is changing</h2>
        <p>Each case asks which of the 500 addresses a change in the law reaches. The counts come from the same engine as the address answers; nothing here is written by hand.</p>
      </div>
      <SourceNote notes={loose} />
      {data.cases.map(c => <CaseBlock key={c.test_id} c={c} cityOf={cityOf} ruleOf={ruleOf} onOpen={onOpen} notes={notesFor(c.test_id)} />)}
    </div>
  );
}
