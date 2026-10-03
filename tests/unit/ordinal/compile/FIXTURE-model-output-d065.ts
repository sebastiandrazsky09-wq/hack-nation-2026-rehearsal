// TEST FIXTURE, hand-written. This is NOT live model output: it stands in for what a model could return for the
// supplied text of document D065, so the compile pipeline can be tested without a provider.
import type { RawRule } from '../../../../src/ordinal/compile';
import { emptyCoverage, rawRule } from './helpers';

export const FIXTURE_D065_RULES: RawRule[] = [
  rawRule({
    jurisdiction: 'NJ', category: 'screening_restrictions', title: 'No criminal record inquiry before a conditional offer',
    requirement: 'A housing provider may not ask about an applicant\'s criminal record before making a conditional offer.',
    key_value: null, penalty: 'Up to $1,000 for a first violation', citation: 'C.46:8-55',
    legal_status: 'enacted', enacted_date: '2021-06-18', effective_date: '2022-01-01', repeal_date: null,
    status_basis: 'This act shall take effect on the first day of the seventh month next following the date of enactment; approved June 18, 2021.',
    coverage: { ...emptyCoverage, exempt_if: [[{ fact: 'units', op: 'lte', value: 4, text: 'owner-occupied premises of not more than four dwelling units' }, { fact: 'unavailable', name: 'owner_occupancy', text: 'owner-occupied premises' }]] },
    // Straight apostrophe and single spaces where the file has a curly apostrophe and line breaks: verifies as "normalized".
    quoted_span: "A housing provider shall not make any oral or written inquiry regarding an applicant's criminal record prior to making a conditional offer."
  }),
  rawRule({
    jurisdiction: 'NJ', category: 'application_screening_fees', title: 'Written disclosure before accepting an application fee',
    requirement: 'Before taking an application fee a housing provider must say in writing whether criminal history is considered.',
    citation: 'C.46:8-55', legal_status: 'enacted', enacted_date: '2021-06-18', effective_date: '2022-01-01',
    quoted_span: 'Prior to accepting any application fee, a housing provider shall disclose in writing to the applicant:'
  })
];
