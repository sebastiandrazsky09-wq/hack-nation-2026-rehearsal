import { describe, it, expect } from 'vitest';
import { caseForDocument, upsertCase } from '../../../../src/ordinal/diff/cases';
import type { InternalRule } from '../../../../src/ordinal/contracts';

const rule = (over: Partial<InternalRule>) => ({ team_rule_id: 'r', source_doc_id: 'X1', also_supported_by: [], effective_date: null, ...over }) as InternalRule;

describe('change case for an ingested document', () => {
  it('compares the default date with the day after a future effective date', () => {
    expect(caseForDocument([rule({ effective_date: '2027-03-01' })], 'X1', 'T6', '2026-10-01', 'New ordinance'))
      .toEqual({ test_id: 'T6', title: 'New ordinance', source_doc_ids: ['X1'], type: 'as_of', as_of_before: '2026-10-01', as_of_after: '2027-03-02' });
    expect(caseForDocument([rule({ effective_date: '2027-03' })], 'X1', 'T6', '2026-10-01').as_of_after).toBe('2027-04-01');
    expect(caseForDocument([rule({ effective_date: '2027-03-01' }), rule({ team_rule_id: 'q', effective_date: '2028-01-01' })], 'X1', 'T6', '2026-10-01').as_of_after).toBe('2028-01-02');
  });
  it('lists the reach on the default date when nothing takes effect later, or when the document is only a supporting source', () => {
    expect(caseForDocument([rule({ effective_date: '2025-06-21' })], 'X1', 'T6', '2026-10-01')).toMatchObject({ type: 'boundary', as_of: '2026-10-01' });
    expect(caseForDocument([rule({ source_doc_id: 'D1', also_supported_by: [{ source_doc_id: 'X1', source_url: 'u', quoted_span: 'q', verified: true }], effective_date: '2027-07-01' })], 'X1', 'T6', '2026-10-01')).toMatchObject({ type: 'as_of', as_of_after: '2027-07-02' });
    expect(caseForDocument([rule({ source_doc_id: 'D9', effective_date: '2030-01-01' })], 'X1', 'T6', '2026-10-01').type).toBe('boundary');
  });
  it('replaces a case with the same id and keeps the list sorted', () => {
    const a = { test_id: 'T7', type: 'boundary' }; const b = { test_id: 'T6', type: 'boundary' }; const b2 = { test_id: 'T6', type: 'as_of' };
    expect(upsertCase(upsertCase([a], b), b2)).toEqual([b2, a]);
  });
});
