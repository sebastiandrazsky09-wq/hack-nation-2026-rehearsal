'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { ACTIONS, ACTION_NAMES, type ActionName, type CheckBatchResponse, type ErrorBody } from '../../gate/contract';
import { postChecks } from '../gate-client';
import { DecisionMark } from '../decision-mark';
import { longDate, shortDate } from '../labels';
import { PortfolioGrid } from './portfolio-grid';
import { PortfolioTable } from './portfolio-table';
import {
  changedIds, formatParam, MAX_POINTS, ORDER, pointLabel, screenUrl, validateDate, validateParam, visiblePoints, type RequestKey
} from './portfolio-model';

export type PortfolioInitial = { action: ActionName; asOf: string; param: string };
type View = { data: CheckBatchResponse; key: RequestKey };
type Changed = { n: number; before: RequestKey; after: RequestKey };
type Failure = { message: string; issues: NonNullable<ErrorBody['error']['issues']> };

const FLASH_MS = 900;
const DEBOUNCE_MS = 150;

/** What the two requests differ in, as one side of "between {a} and {b}". */
function side(key: RequestKey, other: RequestKey) {
  const parts: string[] = [];
  if (key.asOf !== other.asOf) parts.push(shortDate(key.asOf));
  if (key.param !== other.param) parts.push(formatParam(key.action, key.param));
  return parts.join(', ');
}

function FirstLoad() {
  return <div className="pf-placeholder" aria-hidden>{Array.from({ length: 9 }, (_, i) => <span key={i} className="pf-ph-row" />)}</div>;
}

export function PortfolioView({ initial }: { initial: PortfolioInitial }) {
  const [action, setAction] = useState<ActionName>(initial.action);
  const [asOf, setAsOf] = useState(initial.asOf);
  const [param, setParam] = useState(initial.param);
  const [view, setView] = useState<View | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(false);
  const [dim, setDim] = useState(false);
  const [changed, setChanged] = useState<Changed | null>(null);
  const [flash, setFlash] = useState<Set<string> | null>(null);
  const [showAllPoints, setShowAllPoints] = useState(false);
  const shown = useRef<View | null>(null);
  const first = useRef(true);
  const ids = { date: useId(), param: useId(), action: useId() };

  const spec = ACTIONS[action];
  const dateIssue = validateDate(asOf);
  const paramIssue = validateParam(action, param);
  const serverIssues = (failure?.issues ?? []);
  const dateServer = serverIssues.filter(i => i.path.includes('as_of')).map(i => i.message).join(' ');
  const paramServer = serverIssues.filter(i => i.path.includes('properties')).map(i => i.message).join(' ');
  const dateText = dateIssue ?? (dateServer || null);
  const paramText = paramIssue ?? (paramServer || null);

  // State lives in the URL.
  useEffect(() => { window.history.replaceState(null, '', screenUrl({ action, asOf, param: spec.parameter ? param : '' })); }, [action, asOf, param, spec.parameter]);

  // Each valid change re-posts after a short wait; the superseded request is aborted.
  useEffect(() => {
    if (validateDate(asOf) || validateParam(action, param)) { setLoading(false); return; }
    const key: RequestKey = { action, asOf, param: spec.parameter ? param : '' };
    const controller = new AbortController();
    setLoading(true);
    const wait = first.current ? 0 : DEBOUNCE_MS;
    first.current = false;
    const timer = setTimeout(async () => {
      let result;
      try {
        result = await postChecks({
          subject: { type: 'property_manager' },
          action: { name: action, ...(spec.parameter ? { properties: { [spec.parameter.name]: Number(param) } } : {}) },
          context: { as_of: asOf },
          resources: 'all'
        }, controller.signal);
      } catch { return; } // aborted: a newer request owns the screen
      setLoading(false);
      if (!result.ok) { setFailure({ message: result.error.message, issues: result.error.issues ?? [] }); return; }
      setFailure(null);
      const before = shown.current;
      const next: View = { data: result.data, key };
      shown.current = next;
      setView(next);
      if (!before || before.key.action !== key.action) { setChanged(null); setFlash(null); return; }
      if (before.key.asOf !== key.asOf || before.key.param !== key.param) {
        const diff = changedIds(before.data.results, result.data.results);
        setChanged({ n: diff.length, before: before.key, after: key });
        setFlash(diff.length ? new Set(diff) : null);
      }
    }, wait);
    return () => { clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, asOf, param]);

  // The outline marks a changed cell once, then goes.
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  // Dim the old result only when the new one is slow.
  useEffect(() => {
    if (!loading) { setDim(false); return; }
    const timer = setTimeout(() => setDim(true), 150);
    return () => clearTimeout(timer);
  }, [loading]);

  const chooseAction = (name: ActionName) => {
    setAction(name);
    setParam(ACTIONS[name].parameter ? String(ACTIONS[name].parameter!.example) : '');
  };

  const data = view?.data;
  const points = data ? visiblePoints(data.change_points, data.as_of, showAllPoints) : [];

  const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
  return (
    <main className="page pf">
      <h2 className="sep-hidden">Portfolio</h2>
      <div className="pf-top">
        <div className="pf-lead">
          <section className="ck-step">
            <h3 className="ck-label">Proposed action</h3>
            <div>
              {/* One action, every property in the registry, one date: the same sentence as a single check. */}
              <div className="ck-sentence">
                <div className="ck-line">
                  <label className="sep-hidden" htmlFor={ids.action}>Action</label>
                  <select id={ids.action} className="ck-token" value={action} onChange={e => chooseAction(e.target.value as ActionName)}>
                    {ACTION_NAMES.map(n => <option key={n} value={n}>{lower(ACTIONS[n].short)}</option>)}
                  </select>
                  {spec.parameter && (
                    <span className="ck-nowrap">
                      {' '}<span className="ck-w">of</span>{' '}
                      <label className="sep-hidden" htmlFor={ids.param}>{spec.parameter.label} ({spec.parameter.unit})</label>
                      <input
                        id={ids.param} type="text" inputMode="decimal" autoComplete="off" value={param} onChange={e => setParam(e.target.value)} style={{ width: `${Math.max(1, param.length) + 0.3}ch` }}
                        aria-invalid={paramText ? true : undefined} aria-describedby={paramText ? `${ids.param}-issue` : undefined} className="ck-token ck-number pf-narrow"
                      />
                      {' '}<span className="ck-w">{spec.parameter.unit}</span>
                    </span>
                  )}
                </div>
                <div className="ck-line">
                  <span className="ck-w">at {data ? `all ${data.evaluated} properties` : 'every property'} on</span>{' '}
                  <span className="ck-date">
                    <span aria-hidden className="ck-token ck-date-text">{dateText ? 'a date' : longDate(asOf)}</span>
                    <label className="sep-hidden" htmlFor={ids.date}>As of</label>
                    <input
                      id={ids.date} type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
                      aria-invalid={dateText ? true : undefined} aria-describedby={dateText ? `${ids.date}-issue` : undefined}
                    />
                  </span>
                  <span className="ck-w ck-stop">.</span>
                </div>
              </div>
              {paramText && <p id={`${ids.param}-issue`} className="pf-issue">{paramText}</p>}
              {dateText && <p id={`${ids.date}-issue`} className="pf-issue">{dateText}</p>}
              {spec.label !== spec.short && <p className="ck-fine ck-definition">Checked as: {lower(spec.label)}.</p>}
            </div>
          </section>

          {failure && <p role="alert" className="pf-alert">{failure.message}</p>}

          {data && (
            <section className="ck-step pf-summary" aria-labelledby={`${ids.action}-d`}>
              <h3 id={`${ids.action}-d`} className="ck-label">Decisions</h3>
              <div>
                <div className="pf-counts" data-testid="pf-counts">
                  {ORDER.map(d => (
                    <div key={d} className={`pf-count pf-count-${d}${data.counts[d] === 0 ? ' pf-count-zero' : ''}`} data-testid={`pf-count-${d}`}>
                      <span className="pf-figure" data-testid="pf-count-n">{data.counts[d]}</span>
                      <span className="pf-word"><DecisionMark decision={d} size={13} />{d}</span>
                    </div>
                  ))}
                </div>
                <p className="pf-meta" data-testid="pf-meta">
                  {data.evaluated} properties checked in {data.evaluated_ms.toFixed(1)} ms, ruleset <span className="pf-version">{data.ruleset_version}</span>.
                </p>
                {changed && (
                  <p className="pf-changed-line" role="status" data-testid="pf-changed">
                    {changed.n === 0 ? 'No property changed' : `${changed.n} ${changed.n === 1 ? 'property' : 'properties'} changed`} between {side(changed.before, changed.after)} and {side(changed.after, changed.before)}.
                  </p>
                )}
              </div>
            </section>
          )}

        </div>

        {points.length > 0 && data && (
          <aside className="pf-rail" aria-label="Dates when the law changes">
            <h3 className="ck-label">Over time</h3>
            <div className="pf-points" role="group" aria-label="Dates when the law changes">
              {points.map(p => (
                <button key={`${p.date}-${p.label}`} type="button" className="pf-point" aria-pressed={p.date === asOf} onClick={() => setAsOf(p.date)} aria-label={pointLabel(p)}>
                  <span className="pf-point-date">{pointLabel(p).split(': ')[0]}</span><span className="sep-hidden">: </span>
                  <span>{pointLabel(p).split(': ').slice(1).join(': ')}</span>
                </button>
              ))}
              {data.change_points.length > MAX_POINTS && (
                <button type="button" className="pf-all" aria-expanded={showAllPoints} onClick={() => setShowAllPoints(v => !v)}>
                  {showAllPoints ? `Show the nearest ${MAX_POINTS}` : `Show all ${data.change_points.length}`}
                </button>
              )}
            </div>
          </aside>
        )}

        {view && (
          <div className={`pf-body${dim ? ' pf-dim' : ''}`} aria-busy={loading}>
            <PortfolioGrid rows={view.data.results} request={view.key} flash={flash} />
          </div>
        )}
      </div>

      {view ? (
        <div className={`pf-list${dim ? ' pf-dim' : ''}`}>
          <PortfolioTable rows={view.data.results} counts={view.data.counts} request={view.key} />
        </div>
      ) : (
        !failure && <div className="pf-body" aria-busy={loading}><FirstLoad /></div>
      )}
    </main>
  );
}
