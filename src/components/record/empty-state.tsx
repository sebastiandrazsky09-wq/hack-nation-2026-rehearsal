'use client';
import { PRODUCT_NAME } from '../../lib/product';
import Link from 'next/link';
import type { ChangesResponse, PipelineResponse } from '../../server/ordinal';
import { RESULT_LABELS, RESULT_MEANINGS, RESULT_ORDER, isIsoDate, label, shortDate, streetCase } from '../labels';
import { SignalMark } from '../signal';
import { frac, needleStyle, toDay } from '../timeline';
import { useApi } from '../use-api';
import { cityName, type AddressRow } from './address';

// Example buttons are picked from the address list by property, so no address id is written here.
export const EXAMPLES: { label: string; shows: string; pick: (a: AddressRow) => boolean }[] = [
  { label: 'A 1978 building in Los Angeles: a cutoff year', shows: 'Rent stabilization turns on a 1978 certificate date. A year alone cannot settle it, so the answer is unknown and says why.', pick: a => a.year_built === 1978 && cityName(a.legal_city) === 'Los Angeles' },
  { label: 'Mailing city is not the legal city', shows: 'The mail says one place; the law follows another. The address is placed in its legal city first.', pick: a => { const c = cityName(a.legal_city); return c !== null && c.toLowerCase() !== a.postal_city.toLowerCase(); } },
  { label: 'A city rule and a state rule in tension', shows: 'A local ban is in force. A state act that bars conflicting local rules starts later. Both are flagged for review.', pick: a => cityName(a.legal_city) === 'Hoboken' },
  { label: 'Pending bills', shows: 'Two bills would reach this address if enacted. They are shown as pending, never as law.', pick: a => cityName(a.legal_city) === 'Cambridge' }
];

export function EmptyState({ loading, examples, cases, asOf, onExample }: {
  loading: boolean; examples: { label: string; shows: string; address: AddressRow | null }[];
  cases: ChangesResponse['cases']; asOf: string | null; onExample: (id: string) => void;
}) {
  const pipeline = useApi<PipelineResponse>('/api/pipeline');
  const metrics = pipeline.data?.selfcheck?.metrics;
  const n = (key: string) => (typeof metrics?.[key] === 'number' ? (metrics[key] as number) : 0);
  // Each change case at the latest date it looks at, in date order.
  const tracked = cases.map(c => ({ c, at: [...c.dates].sort().at(-1) ?? '' })).filter(t => isIsoDate(t.at)).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return (
    <div className="empty">
      <div className="empty-lead">
        <h2>Which housing rules apply at this address, on this day?</h2>
        <p>Choose one of the{metrics ? ` ${n('addresses_total')}` : ''} sample addresses in California, New Jersey and Massachusetts. {PRODUCT_NAME} places it in its legal city, tests each law&rsquo;s dates and conditions against the building, and shows the sentence of law behind every answer.</p>
        <h3>Every rule gets one of five answers</h3>
        <dl className="answers-key">
          {RESULT_ORDER.map(r => (
            <div key={r}><dt className={`signal signal-${r}`}><SignalMark result={r} />{label(RESULT_LABELS, r)}</dt><dd>{RESULT_MEANINGS[r]}</dd></div>
          ))}
        </dl>
        {metrics && (
          <p className="provenance-line">
            Built from {n('official_docs_processed') + n('supplemental_docs_processed') + n('ingested_docs')} public documents. {n('rules_verified')} of {n('rules_total')} extracted rules carry a quote found word for word in its source, and {n('addresses_resolved')} of {n('addresses_total')} addresses are placed in their legal city.{' '}
            <Link className="link" href="/system">See how it was produced</Link>
          </p>
        )}
      </div>
      <section className="examples" aria-labelledby="examples-heading">
        <h3 id="examples-heading">Try an example</h3>
        <ul>
          {examples.map((e, i) => (
            <li key={e.label}>
              <button type="button" disabled={e.address === null || loading} aria-describedby={`example-${i}`} onClick={() => e.address && onExample(e.address.address_id)}>{e.label}</button>
              <p id={`example-${i}`}>
                {e.address && <span className="example-where">{streetCase(e.address.street_address)}, {e.address.postal_city}, {e.address.state}. </span>}
                {e.shows}
              </p>
            </li>
          ))}
        </ul>
      </section>
      {tracked.length > 0 && (
        <section className="tracking" aria-label="Tracked changes" style={asOf ? needleStyle(asOf) : undefined}>
          <h3>Changes in the law, and how many of the{metrics ? ` ${n('addresses_total')}` : ''} sample properties each one reaches</h3>
          <ol>
            {tracked.map(({ c, at }) => (
              <li key={c.test_id}>
                <Link href="/changes">
                  <span className="tracking-date">{shortDate(at)}</span>
                  <span className="tracking-title">{c.title ?? c.test_id}</span>
                  <span className="tracking-track" aria-hidden><i style={{ left: `${(frac(toDay(at)) * 100).toFixed(3)}%` }} /></span>
                  <span className="tracking-n">{c.affected_address_ids.length} {c.affected_address_ids.length === 1 ? 'address' : 'addresses'}</span>
                </Link>
              </li>
            ))}
          </ol>
          {asOf && <div className="tracking-needle" aria-hidden><em>{shortDate(asOf)}</em></div>}
        </section>
      )}
    </div>
  );
}
