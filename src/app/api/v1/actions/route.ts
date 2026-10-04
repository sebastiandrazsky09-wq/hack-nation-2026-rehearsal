import { ACTIONS, SUBJECT_LABELS, SUBJECT_TYPES, UNMODELED_CATEGORIES, type ActionsResponse } from '../../../../gate/contract';
import { guard, methodNotAllowed } from '../../../../gate/http';
import { DISCLAIMER } from '../../../../server/ordinal';
export const dynamic = 'force-dynamic';

/** GET /api/v1/actions: what can be checked, and what is shown but not gated. */
export const GET = () => guard((): ActionsResponse => ({
  actions: [
    ...Object.values(ACTIONS).map(a => ({ name: a.name, label: a.label, category: a.category, modeled: true, envelope: true, parameter: a.parameter })),
    ...UNMODELED_CATEGORIES.map(u => ({ name: u.category, label: u.label, category: u.category, modeled: false, envelope: false, parameter: null }))
  ],
  subjects: SUBJECT_TYPES.map(type => ({ type, label: SUBJECT_LABELS[type] })),
  disclaimer: DISCLAIMER
}));
const notAllowed = () => methodNotAllowed('GET');
export const POST = notAllowed, PUT = notAllowed, PATCH = notAllowed, DELETE = notAllowed;
