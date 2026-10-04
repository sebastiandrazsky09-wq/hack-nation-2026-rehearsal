'use client';
import type { CSSProperties } from 'react';
import type { RuleView } from '../server/ordinal';
import { DEFAULT_AS_OF, longDate, shortDate } from './labels';
import { SignalMark } from './signal';

// One time scale shared by the needle and every rule's line. Display geometry only: answers always come from the API.
const DAY = 86_400_000;
export const floorDate = (partial: string) => { const [y, m, d] = partial.split('-'); return `${y}-${m ?? '01'}-${d ?? '01'}`; };
export const toDay = (iso: string) => Math.round(Date.parse(floorDate(iso) + 'T00:00:00Z') / DAY);
export const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

const centre = Number(DEFAULT_AS_OF.slice(0, 4));
/** Two years before the default query year to three after. Fixed, so nothing rescales while the needle moves. */
export const DOMAIN = { start: toDay(`${centre - 2}-01-01`), end: toDay(`${centre + 3}-01-01`) };
export const YEARS = Array.from({ length: 5 }, (_, i) => centre - 2 + i);
export const frac = (day: number) => Math.min(1, Math.max(0, (day - DOMAIN.start) / (DOMAIN.end - DOMAIN.start)));
const pct = (f: number) => `${(f * 100).toFixed(3)}%`;
export const needleStyle = (asOf: string) => ({ '--f': frac(toDay(asOf)).toFixed(5) }) as CSSProperties;

/** The header of the time column: year marks, the change-case dates as notches, and the needle as a native slider. */
export function TimeAxis({ asOf, caseDates, onChange }: { asOf: string; caseDates: string[]; onChange: (date: string) => void }) {
  const day = toDay(asOf);
  const f = frac(day);
  const outside = day < DOMAIN.start ? 'earlier than this scale' : day > DOMAIN.end ? 'later than this scale' : null;
  return (
    <div className="axis" style={needleStyle(asOf)}>
      <div className="axis-scale" aria-hidden>
        {YEARS.map(y => <span key={y} className="axis-year" style={{ left: pct(frac(toDay(`${y}-01-01`))) }}>{y}</span>)}
        {caseDates.map(d => <span key={d} className="axis-notch" style={{ left: pct(frac(toDay(d))) }} />)}
      </div>
      <input
        type="range" className="axis-range" aria-label="Move the as-of date"
        min={DOMAIN.start} max={DOMAIN.end} step={1} value={Math.min(DOMAIN.end, Math.max(DOMAIN.start, day))}
        aria-valuetext={longDate(asOf)} onChange={e => onChange(fromDay(Number(e.target.value)))}
      />
      <span className={`axis-flag ${f > 0.82 ? 'axis-flag-left' : ''}`} aria-hidden>{shortDate(asOf)}{outside ? `, ${outside}` : ''}</span>
    </div>
  );
}

/** When a rule starts, in words. Chosen by the status the API returned for this date; no date is compared here. */
export function timingPhrase(rule: RuleView): string | null {
  if (rule.status === 'pending') return 'A pending proposal, not law';
  if (rule.status === 'not_yet_effective') return rule.effective_date ? `Takes effect ${shortDate(rule.effective_date)}` : 'Enacted, not yet in effect';
  return rule.effective_date ? `In force since ${shortDate(rule.effective_date)}` : null;
}

/**
 * One rule in time. Solid from its effective date; a dashed lead-in from enactment to effect; dashed throughout for a
 * pending proposal; an open ring at the left end when the source states no start. The mark sits where the needle is and shows the
 * answer the API gave for that day.
 */
export function Lifeline({ rule, result, asOf, onJump }: { rule: RuleView; result: string; asOf: string; onJump: (date: string) => void }) {
  const pending = rule.legal_status === 'pending';
  const effective = rule.effective_date ? toDay(rule.effective_date) : null;
  const enacted = rule.enacted_date ? toDay(rule.enacted_date) : null;
  const start = effective === null ? 0 : frac(effective);
  const lead = effective !== null && enacted !== null && enacted < effective ? frac(enacted) : null;
  const inScale = effective !== null && effective >= DOMAIN.start && effective <= DOMAIN.end;
  const needle = frac(toDay(asOf));
  // The date label sits to the right of its tick unless it would run off the scale or under the needle.
  const room = 0.24;
  let labelLeft = start > 0.72;
  if (!labelLeft && needle > start && needle - start < room && start > room) labelLeft = true;
  else if (labelLeft && needle < start && start - needle < room && start < 1 - room) labelLeft = false;
  return (
    <div className="life">
      {pending
        ? <span className="life-line life-dashed" style={{ left: 0, right: 0 }} />
        : <>
          {lead !== null && lead < start && <span className="life-line life-lead" style={{ left: pct(lead), width: pct(start - lead) }} />}
          <span className={`life-line ${effective === null ? 'life-open' : ''}`} style={{ left: pct(start), right: 0 }} />
          {inScale && rule.effective_date && (
            <button
              type="button" className={`life-start ${labelLeft ? 'life-start-left' : ''}`} style={{ left: pct(start) }}
              onClick={() => onJump(floorDate(rule.effective_date!))}
              aria-label={`Set the date to ${floorDate(rule.effective_date)}, the day this takes effect`}
            >
              <span className="life-start-label">{shortDate(rule.effective_date)}</span>
            </button>
          )}
        </>}
      <span className={`life-mark signal-${result}`} style={{ left: pct(needle) }}><SignalMark result={result} size={14} /></span>
    </div>
  );
}
