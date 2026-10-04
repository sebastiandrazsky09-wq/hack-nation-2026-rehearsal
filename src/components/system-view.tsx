'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AuditTable } from './audit-table';
import { DEFAULT_AS_OF, isIsoDate } from './labels';
import { PipelinePanel } from './pipeline-panel';
import { Planes } from './planes';

/** /system: how the answers were produced, then the rule registry (#rules) with its own as-of date in the URL as ?as_of=. */
export function SystemView() {
  const incoming = useSearchParams().get('as_of');
  const [asOf, setAsOf] = useState(incoming && isIsoDate(incoming) ? incoming : DEFAULT_AS_OF);
  const first = useRef(true);

  // Keep the URL in step with the date so it can be shared. Leaves the #rules anchor alone.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!isIsoDate(asOf)) return;
    const qs = asOf === DEFAULT_AS_OF ? '' : `?as_of=${asOf}`;
    window.history.replaceState(null, '', `${window.location.pathname}${qs}${window.location.hash}`);
  }, [asOf]);

  return (
    <main className="page main">
      <Planes />
      <PipelinePanel />
      <section id="rules" aria-label="Rule registry">
        <div className="field field-date">
          <label htmlFor="registry-as-of">As of</label>
          <input id="registry-as-of" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} />
        </div>
        <AuditTable asOf={isIsoDate(asOf) ? asOf : null} />
      </section>
    </main>
  );
}
