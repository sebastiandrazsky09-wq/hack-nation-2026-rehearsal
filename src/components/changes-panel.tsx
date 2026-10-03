'use client';
import { useMemo } from 'react';
import type { ChangesResponse } from '../server/ordinal';
import { RESULT_LABELS, label } from './labels';
import { useApi } from './use-api';

type CaseRow = ChangesResponse['cases'][number];
const NO_CITY = 'no legal city found';

/** Counts ids per legal city, using the legal_city the address API returns. */
function byCity(ids: string[], cityOf: Map<string, string | null>): [string, number][] {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const city = cityOf.get(id) ?? NO_CITY;
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

function Breakdown({ ids, cityOf }: { ids: string[]; cityOf: Map<string, string | null> }) {
  if (ids.length === 0) return null;
  return <ul className="breakdown">{byCity(ids, cityOf).map(([city, n]) => <li key={city}>{city}: {n}</li>)}</ul>;
}

function CaseBlock({ c, cityOf, onOpen }: { c: CaseRow; cityOf: Map<string, string | null>; onOpen: (addressId: string, asOf: string) => void }) {
  const caseDate = [...c.dates].sort().at(-1) ?? '';
  const results = [...new Set(Object.values(c.counts).flatMap(row => Object.keys(row)))];
  return (
    <section data-testid="change-case" data-test-id={c.test_id} className="case">
      <h3>{c.title ?? c.test_id}</h3>
      <p className="meta">Case {c.test_id} · dates evaluated: {c.dates.join(', ')}</p>
      {c.expected_behavior && <p className="mt-2"><span className="field">What the test expects</span> {c.expected_behavior}</p>}

      <h4 className="sub">Rules it selected</h4>
      <ul className="ml-5 list-disc">
        {c.selected.map(s => (
          <li key={s.selector}>
            {s.team_rule_ids.length > 0
              ? <>{s.selector}: {s.team_rule_ids.join(', ')}</>
              : <span data-testid="selector-gap" className="gap"><strong>Gap.</strong> {s.selector} did not match any rule in the extracted set, so nothing is evaluated for it.</span>}
          </li>
        ))}
      </ul>

      <h4 className="sub">Results by date</h4>
      <table className="plain">
        <thead><tr><th>Date</th>{results.map(r => <th key={r}>{label(RESULT_LABELS, r)}</th>)}</tr></thead>
        <tbody>
          {c.dates.map(d => <tr key={d}><td>{d}</td>{results.map(r => <td key={r}>{c.counts[d]?.[r] ?? 0}</td>)}</tr>)}
        </tbody>
      </table>

      <p className="mt-3 font-semibold" data-testid="affected-count">{c.affected_address_ids.length} addresses affected</p>
      <Breakdown ids={c.affected_address_ids} cityOf={cityOf} />
      <p className="mt-2 font-semibold" data-testid="conflict-count">{c.conflict_flag_address_ids.length} addresses flagged for conflict review</p>
      <Breakdown ids={c.conflict_flag_address_ids} cityOf={cityOf} />

      {c.notes && <p className="mt-3"><span className="field">Notes</span> {c.notes}</p>}

      {c.affected_address_ids.length > 0 && (
        <details className="more">
          <summary>Show the affected addresses</summary>
          <p className="meta mt-2">Choosing one opens its rules as of {caseDate}.</p>
          <ul className="idlist">
            {c.affected_address_ids.map(id => (
              <li key={id}><button type="button" onClick={() => onOpen(id, caseDate)}>{id}</button></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function ChangesPanel({ addresses, onOpen }: {
  addresses: { address_id: string; legal_city: string | null }[];
  onOpen: (addressId: string, asOf: string) => void;
}) {
  const { data, error, loading } = useApi<ChangesResponse>('/api/changes');
  const cityOf = useMemo(() => new Map(addresses.map(a => [a.address_id, a.legal_city])), [addresses]);
  if (error) return <p role="alert" className="error">{error}</p>;
  if (loading || !data) return <p className="text-[var(--muted)]">Loading the change cases…</p>;
  return (
    <div>
      <p>What the rules do on the dates that matter, for each change case. Counts come from the same engine as the address lookups.</p>
      {data.errors.length > 0 && (
        <div role="alert" data-testid="changes-errors" className="error mt-3">
          <strong>Problems with some change cases</strong>
          <ul className="ml-5 list-disc">{data.errors.map(e => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {data.cases.map(c => <CaseBlock key={c.test_id} c={c} cityOf={cityOf} onOpen={onOpen} />)}
    </div>
  );
}
