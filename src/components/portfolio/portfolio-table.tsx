'use client';
import { useMemo, useState } from 'react';
import type { Decision } from '../../gate/contract';
import { DecisionMark, DecisionWord } from '../decision-mark';
import { cityName, ORDER, propertyLink, sortRows, streetOf, TABLE_PAGE, type Counts, type RequestKey, type Row, type SortDir, type SortKey } from './portfolio-model';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'property', label: 'Property' }, { key: 'city', label: 'Legal city' }, { key: 'decision', label: 'Decision' }, { key: 'reason', label: 'Top reason' }
];

function SortArrow({ dir }: { dir: SortDir | null }) {
  return (
    <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden focusable={false} className="pf-arrow">
      <path d="M4 1L7 4.5H1z" fill="currentColor" opacity={dir === 'asc' ? 1 : 0.28} />
      <path d="M4 9L1 5.5H7z" fill="currentColor" opacity={dir === 'desc' ? 1 : 0.28} />
    </svg>
  );
}

export function PortfolioTable({ rows, counts, request }: { rows: Row[]; counts: Counts; request: RequestKey }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'decision', dir: 'asc' });
  const [pressed, setPressed] = useState<Set<Decision>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(() => sortRows(pressed.size ? rows.filter(r => pressed.has(r.decision)) : rows, sort.key, sort.dir), [rows, pressed, sort]);
  const shown = showAll ? visible : visible.slice(0, TABLE_PAGE);

  const toggle = (decision: Decision) => setPressed(prev => { const next = new Set(prev); if (!next.delete(decision)) next.add(decision); return next; });
  const sortBy = (key: SortKey) => setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));

  return (
    <section className="pf-table-section" aria-label="Properties">
      <div className="pf-filter" role="group" aria-label="Show only">
        {ORDER.map(decision => (
          <button key={decision} type="button" aria-pressed={pressed.has(decision)} data-testid={`pf-filter-${decision}`} onClick={() => toggle(decision)}>
            <DecisionMark decision={decision} size={14} />{decision}<span className="pf-filter-n">{counts[decision]}</span>
          </button>
        ))}
      </div>
      <div className="pf-frame" tabIndex={0} role="region" aria-label="Property table, scrolls sideways on small screens">
        <table className="pf-table" data-testid="pf-table">
          <thead>
            <tr>
              {COLUMNS.map(c => (
                <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => sortBy(c.key)}>{c.label}<SortArrow dir={sort.key === c.key ? sort.dir : null} /></button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(row => (
              <tr key={row.id}>
                <td><a href={propertyLink(row.id, request)}>{streetOf(row)}</a></td>
                <td>{cityName(row)}</td>
                <td><DecisionWord decision={row.decision} size={14} /></td>
                <td className="pf-reason">{row.top_reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length > shown.length && (
        <button type="button" className="pf-more" onClick={() => setShowAll(true)}>Show all {visible.length}</button>
      )}
    </section>
  );
}
