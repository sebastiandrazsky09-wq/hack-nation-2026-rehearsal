// A change case for a newly ingested document, built from what was extracted. No law-specific logic.
import type { InternalRule } from '../contracts';
import type { ChangeCase } from '../entrypoints';
import { dateCeil } from '../status';

const nextDay = (iso: string) => new Date(Date.parse(iso + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);

/**
 * The case that asks "which addresses does this document change?". When one of its rules takes effect after the default
 * query date, the case compares the default date with the day after the latest such effective date; otherwise it lists the
 * addresses the document's rules reach on the default date.
 */
export function caseForDocument(rules: InternalRule[], docId: string, testId: string, defaultAsOf: string, title?: string): ChangeCase {
  const mine = rules.filter(r => r.source_doc_id === docId || r.also_supported_by.some(s => s.source_doc_id === docId));
  const future = mine.map(r => r.effective_date).filter((d): d is string => d !== null).map(dateCeil).filter(d => d > defaultAsOf).sort();
  const base = { test_id: testId, title: title ?? `Document ${docId}`, source_doc_ids: [docId] };
  return future.length
    ? { ...base, type: 'as_of', as_of_before: defaultAsOf, as_of_after: nextDay(future[future.length - 1]) }
    : { ...base, type: 'boundary', as_of: defaultAsOf };
}
/** Add or replace a case by test id, keeping the list sorted. */
export function upsertCase(cases: ChangeCase[], next: ChangeCase): ChangeCase[] {
  return [...cases.filter(c => c.test_id !== next.test_id), next].sort((a, b) => a.test_id < b.test_id ? -1 : 1);
}
