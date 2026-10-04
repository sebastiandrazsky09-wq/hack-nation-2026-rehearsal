'use client';
import { useMemo } from 'react';
import { cellName, countWords, groupByCity, propertyLink, type RequestKey, type Row } from './portfolio-model';

/** One 12px link per property, grouped by legal city. The shape of a cell carries the decision as well as its colour. */
export function PortfolioGrid({ rows, request, flash }: { rows: Row[]; request: RequestKey; flash: Set<string> | null }) {
  const groups = useMemo(() => groupByCity(rows), [rows]);
  return (
    <div className="pf-grid" data-testid="pf-grid">
      {groups.map(group => (
        <section key={group.name} className="pf-group" aria-label={group.name}>
          <h3>{group.name}<span className="pf-group-counts">{countWords(group.counts)}</span></h3>
          <div className="pf-cells">
            {group.rows.map(row => {
              const name = cellName(row);
              return (
                <a
                  key={row.id} href={propertyLink(row.id, request)} title={name} aria-label={name} data-id={row.id} data-decision={row.decision}
                  className={`pf-cell pf-cell-${row.decision}${flash?.has(row.id) ? ' pf-changed' : ''}`}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
