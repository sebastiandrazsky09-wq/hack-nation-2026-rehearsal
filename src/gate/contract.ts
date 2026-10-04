// The gate's wire contract. Lead-owned and frozen: the API, the decision function and the interface all import it.
// Shapes follow the subject / action / resource / context naming of the OpenID AuthZEN Authorization API; no conformance is claimed.
import { z } from 'zod';
import type { Category } from '../ordinal/contracts';

export const DECISIONS = ['PASS', 'BLOCK', 'REQUIRE', 'REVIEW'] as const;
export const DecisionSchema = z.enum(DECISIONS);
export type Decision = z.infer<typeof DecisionSchema>;
/** Aggregation: the first of these that any rule produces is the decision. PASS only when nothing else was produced. */
export const DECISION_PRECEDENCE: readonly Decision[] = ['BLOCK', 'REVIEW', 'REQUIRE', 'PASS'];

export const SUBJECT_TYPES = ['property_manager', 'owner', 'software_agent'] as const;
export const SUBJECT_LABELS: Record<(typeof SUBJECT_TYPES)[number], string> = {
  property_manager: 'Property manager', owner: 'Owner', software_agent: 'Software agent'
};
export const ACTION_NAMES = ['set_rent_with_pricing_algorithm', 'collect_security_deposit', 'charge_application_fee'] as const;
export const ActionNameSchema = z.enum(ACTION_NAMES);
export type ActionName = z.infer<typeof ActionNameSchema>;
export const PARAMETER_NAMES = ['amount_months_rent', 'fee_usd'] as const;
export const ParameterNameSchema = z.enum(PARAMETER_NAMES);
export type ParameterName = z.infer<typeof ParameterNameSchema>;

export type ActionSpec = {
  name: ActionName; label: string;
  /** The label without its qualification, for a narrow control. The full label is always shown beside it. */
  short: string;
  /** The rule category this action is checked against. Fixed here, never chosen by a model. */
  category: Category;
  parameter: null | { name: ParameterName; label: string; unit: string; min: number; min_exclusive: boolean; max: number; example: number };
};
export const ACTIONS: Record<ActionName, ActionSpec> = {
  set_rent_with_pricing_algorithm: {
    name: 'set_rent_with_pricing_algorithm', label: 'Set rents with a pricing algorithm that uses non-public competitor data', short: 'Set rents with a pricing algorithm',
    category: 'algorithmic_rent_setting', parameter: null
  },
  collect_security_deposit: {
    name: 'collect_security_deposit', label: 'Collect a security deposit', short: 'Collect a security deposit', category: 'security_deposits',
    parameter: { name: 'amount_months_rent', label: 'Deposit', unit: 'months of rent', min: 0, min_exclusive: true, max: 12, example: 2 }
  },
  charge_application_fee: {
    name: 'charge_application_fee', label: 'Charge an application fee', short: 'Charge an application fee', category: 'application_screening_fees',
    parameter: { name: 'fee_usd', label: 'Fee', unit: 'US dollars', min: 0, min_exclusive: false, max: 10000, example: 75 }
  }
};
/** Categories with rules in the registry but no action: their rules are formulas or procedures the gate cannot test. Shown, never gated. */
export const UNMODELED_CATEGORIES: { category: Category; label: string }[] = [
  { category: 'rent_increase_limits', label: 'Raise the rent' },
  { category: 'just_cause_eviction', label: 'End a tenancy' },
  { category: 'screening_restrictions', label: 'Screen an applicant' }
];

export const IsoDateSchema = z.iso.date();
const PropertiesSchema = z.strictObject({
  amount_months_rent: z.number().gt(0).lte(12).optional(),
  fee_usd: z.number().gte(0).lte(10000).optional()
});
/** Facts the caller may supply where the registry record has none. A value that contradicts the record is rejected. */
export const FactsSchema = z.strictObject({
  units: z.number().int().min(1).max(100000).optional(),
  year_built: z.number().int().min(1600).max(2100).optional()
});
export type CallerFacts = z.infer<typeof FactsSchema>;
export const SUPPLIABLE_FACTS = ['units', 'year_built'] as const;

const SubjectSchema = z.strictObject({ type: z.enum(SUBJECT_TYPES) });
const ActionSchema = z.strictObject({ name: ActionNameSchema, properties: PropertiesSchema.optional() });
const ContextSchema = z.strictObject({ as_of: IsoDateSchema.optional(), facts: FactsSchema.optional() });

/** The parameter an action needs must be present, and a parameter of another action is an error, not noise. */
function checkParameters(action: z.infer<typeof ActionSchema>, ctx: z.RefinementCtx) {
  const wanted = ACTIONS[action.name].parameter?.name ?? null;
  for (const name of PARAMETER_NAMES) {
    const given = action.properties?.[name] !== undefined;
    if (name === wanted && !given) ctx.addIssue({ code: 'custom', path: ['action', 'properties', name], message: `${action.name} requires ${name}` });
    if (name !== wanted && given) ctx.addIssue({ code: 'custom', path: ['action', 'properties', name], message: `${name} is not a parameter of ${action.name}` });
  }
}

export const CheckRequestSchema = z.strictObject({
  subject: SubjectSchema,
  action: ActionSchema,
  resource: z.strictObject({ type: z.literal('property'), id: z.string().min(1).max(40) }),
  context: ContextSchema.optional()
}).superRefine((req, ctx) => checkParameters(req.action, ctx));
export type CheckRequest = z.infer<typeof CheckRequestSchema>;

export const MAX_BATCH = 500;
export const MAX_BODY_BYTES = 16 * 1024;
export const CheckBatchRequestSchema = z.strictObject({
  subject: SubjectSchema,
  action: ActionSchema,
  context: ContextSchema.optional(),
  resources: z.union([z.literal('all'), z.array(z.string().min(1).max(40)).min(1).max(MAX_BATCH)])
}).superRefine((req, ctx) => checkParameters(req.action, ctx));
export type CheckBatchRequest = z.infer<typeof CheckBatchRequestSchema>;

/** The request with defaults filled and keys in one order: what `decision_id` is a hash of, and what the interface shows as sent. */
export function canonicalRequest(req: CheckRequest, asOf: string): CheckRequest {
  const parameter = ACTIONS[req.action.name].parameter?.name;
  const facts = req.context?.facts ?? {};
  return {
    subject: { type: req.subject.type },
    action: { name: req.action.name, ...(parameter ? { properties: { [parameter]: req.action.properties?.[parameter] } } : {}) },
    resource: { type: 'property', id: req.resource.id },
    context: {
      as_of: asOf,
      ...(facts.units !== undefined || facts.year_built !== undefined
        ? { facts: { ...(facts.units !== undefined ? { units: facts.units } : {}), ...(facts.year_built !== undefined ? { year_built: facts.year_built } : {}) } }
        : {})
    }
  };
}

// ---- Typed constraints: the second compile step. A model proposes them; only mechanically verified ones decide. ----
export const EFFECTS = ['prohibit', 'limit', 'obligation', 'none'] as const;
export const EffectSchema = z.enum(EFFECTS);
export type Effect = z.infer<typeof EffectSchema>;
export const ConstraintSchema = z.strictObject({
  constraint_id: z.string(),
  rule_id: z.string(),
  action: ActionNameSchema,
  effect: EffectSchema,
  /** limit only. */
  parameter: ParameterNameSchema.nullable(),
  /** limit only: at or under this the action satisfies the rule. Null when the text gives no figure the data can be held to. */
  max: z.number().nullable(),
  /** The words in `evidence_quote` that state `max`, for example "one and one-half times one month's rent". */
  value_text: z.string().nullable(),
  /** limit only: the highest cap under any reading of the text. Over this is a violation whatever the missing figure is. */
  hard_max: z.number().nullable(),
  hard_max_text: z.string().nullable(),
  /** limit only: the sentence that states hard_max when it is not in evidence_quote. Also a literal slice of the source. */
  hard_max_quote: z.string().nullable().optional(),
  /** limit only: the text lets the cap rise (an index, a yearly adjustment) without stating the result. Above `max` is then not computable, never a violation. */
  open_above: z.boolean().optional(),
  /** limit only: the calendar year the quoted figure is stated for. For a date in another year the limit is not computable. */
  figure_year: z.number().int().nullable().optional(),
  /** prohibit only: elements of the ban the engine cannot test (agreement, coercion, intent). Non-null means the ban is conditional. */
  elements_untestable: z.string().nullable(),
  /** obligation only: what must be done, in the model's words; shown beside the quote, never used to decide. */
  obligation_text: z.string().nullable(),
  /** Always the literal slice `source[span_start:span_end]` of the rule's source document. */
  evidence_quote: z.string(),
  source_doc_id: z.string(),
  span_start: z.number().int().nonnegative(),
  span_end: z.number().int().positive(),
  verification_method: z.enum(['exact', 'normalized', 'repaired']),
  /** How the figures were checked: 'parsed' = a fixed parser read the same number from the quoted words; 'none' = the effect carries no figure. */
  value_check: z.enum(['parsed', 'none']),
  model: z.string(),
  prompt_version: z.string()
});
export type Constraint = z.infer<typeof ConstraintSchema>;
/** A proposal that failed verification. Kept for the audit trail; it never reaches a decision. */
export const WithheldConstraintSchema = z.strictObject({
  rule_id: z.string(), action: ActionNameSchema, effect: EffectSchema, reason: z.string(), proposed_quote: z.string(), model: z.string(), prompt_version: z.string()
});
export type WithheldConstraint = z.infer<typeof WithheldConstraintSchema>;

// ---- Response ----
export const REVIEW_CODES = ['missing_fact', 'cutoff_ambiguous', 'unverifiable_condition', 'coverage_gap', 'conflict', 'conditional_prohibition', 'limit_not_computable', 'constraint_not_modeled'] as const;
export const ReviewCodeSchema = z.enum(REVIEW_CODES);
export type ReviewCode = z.infer<typeof ReviewCodeSchema>;
export const RULE_RESULTS = ['applies', 'unknown', 'superseded', 'not_yet_effective', 'pending', 'not_applicable'] as const;
export const TRACE_CHECKS = ['jurisdiction', 'status', 'coverage', 'exemption', 'precedence', 'constraint'] as const;

export const CheckResponseSchema = z.strictObject({
  decision: DecisionSchema,
  /** True only for PASS and REQUIRE. */
  permit: z.boolean(),
  /** 'dec_' + sha256(canonical request + ruleset_version), first 16 hex characters. Reproducible; not a stored log entry. */
  decision_id: z.string().regex(/^dec_[0-9a-f]{16}$/),
  /** sha256 of the rule store and the constraint store, first 12 hex characters. */
  ruleset_version: z.string().regex(/^[0-9a-f]{12}$/),
  as_of: IsoDateSchema,
  /** Measured on the server for this request. */
  evaluated_ms: z.number().nonnegative(),
  /** Fixed template text. */
  summary: z.string(),
  determining: z.array(z.strictObject({
    rule_id: z.string(), title: z.string(), jurisdiction: z.string(), citation: z.string(), effect: EffectSchema.nullable(),
    outcome: z.enum(['violated', 'satisfied', 'obligation', 'unresolved']), detail: z.string(),
    conflict_note: z.string().nullable()
  })),
  obligations: z.array(z.strictObject({ rule_id: z.string(), citation: z.string(), text: z.string(), evidence_quote: z.string() })),
  review: z.array(z.strictObject({
    code: ReviewCodeSchema, rule_id: z.string().nullable(), detail: z.string(), missing_facts: z.array(z.string()),
    /** The missing facts the caller may supply in `context.facts`. */
    resolvable_by: z.array(z.enum(SUPPLIABLE_FACTS))
  })),
  upcoming: z.array(z.strictObject({
    rule_id: z.string(), title: z.string(), status: z.enum(['not_yet_effective', 'pending']), effective_date: z.string().nullable(),
    /** The decision this rule alone would give once in force, when that can be computed from verified constraints. */
    would_be: DecisionSchema.nullable()
  })),
  trace: z.array(z.strictObject({
    rule_id: z.string(), title: z.string(), result: z.enum(RULE_RESULTS),
    steps: z.array(z.strictObject({ check: z.enum(TRACE_CHECKS), outcome: z.enum(['matched', 'not_matched', 'unknown']), detail: z.string() }))
  })),
  evidence: z.array(z.strictObject({
    rule_id: z.string(), citation: z.string(), quoted_span: z.string(), source_doc_id: z.string(), source_url: z.string(),
    source_origin: z.enum(['official_captured', 'supplemental', 'ingested']), retrieved_at: z.string().nullable(), verification_method: z.string(),
    /** 'rule' = the sentence that establishes the rule; 'constraint' = the sentence that states the prohibition, limit or duty. */
    kind: z.enum(['rule', 'constraint'])
  })),
  facts: z.array(z.strictObject({ name: z.string(), value: z.union([z.number(), z.string()]).nullable(), source: z.enum(['record', 'caller', 'missing']) })),
  subject_note: z.string(),
  coverage: z.strictObject({
    jurisdictions: z.array(z.string()), category: z.string(), rules_considered: z.number().int(),
    sources_read: z.number().int(), sources_unreadable: z.number().int(), known_gaps: z.array(z.string())
  }),
  /** Enactment, effective and repeal dates of the rules considered, with what changes on each. */
  change_points: z.array(z.strictObject({ date: IsoDateSchema, label: z.string() })),
  disclaimer: z.string()
});
export type CheckResponse = z.infer<typeof CheckResponseSchema>;

export const CheckBatchResponseSchema = z.strictObject({
  counts: z.strictObject({ PASS: z.number().int(), BLOCK: z.number().int(), REQUIRE: z.number().int(), REVIEW: z.number().int() }),
  evaluated: z.number().int(),
  evaluated_ms: z.number().nonnegative(),
  as_of: IsoDateSchema,
  ruleset_version: z.string(),
  change_points: z.array(z.strictObject({ date: IsoDateSchema, label: z.string() })),
  /** In request order; 'all' means registry order. */
  results: z.array(z.strictObject({
    id: z.string(), street_address: z.string(), legal_city: z.string().nullable(), decision: DecisionSchema, top_reason: z.string(), determining_rule_ids: z.array(z.string())
  })),
  disclaimer: z.string()
});
export type CheckBatchResponse = z.infer<typeof CheckBatchResponseSchema>;

// ---- Envelope: the same decision function, evaluated over what a request leaves open (the amount, a missing fact, the date). ----
/** A check request whose numeric parameter may be left out. A parameter of another action is still an error. */
export const EnvelopeRequestSchema = z.strictObject({
  subject: SubjectSchema,
  action: ActionSchema,
  resource: z.strictObject({ type: z.literal('property'), id: z.string().min(1).max(40) }),
  context: ContextSchema.optional()
}).superRefine((req, ctx) => {
  const wanted = ACTIONS[req.action.name].parameter?.name ?? null;
  for (const name of PARAMETER_NAMES) {
    if (name !== wanted && req.action.properties?.[name] !== undefined) ctx.addIssue({ code: 'custom', path: ['action', 'properties', name], message: `${name} is not a parameter of ${req.action.name}` });
  }
});
export type EnvelopeRequest = z.infer<typeof EnvelopeRequestSchema>;

/** The envelope request with defaults filled and keys in one order: what `envelope_id` is a hash of. */
export function canonicalEnvelopeRequest(req: EnvelopeRequest, asOf: string): EnvelopeRequest {
  const parameter = ACTIONS[req.action.name].parameter?.name;
  const value = parameter ? req.action.properties?.[parameter] : undefined;
  const facts = req.context?.facts ?? {};
  return {
    subject: { type: req.subject.type },
    action: { name: req.action.name, ...(parameter && value !== undefined ? { properties: { [parameter]: value } } : {}) },
    resource: { type: 'property', id: req.resource.id },
    context: {
      as_of: asOf,
      ...(facts.units !== undefined || facts.year_built !== undefined
        ? { facts: { ...(facts.units !== undefined ? { units: facts.units } : {}), ...(facts.year_built !== undefined ? { year_built: facts.year_built } : {}) } }
        : {})
    }
  };
}

/** One part of the parameter's range, with the decision check() gives at every value inside it. */
export const EnvelopeIntervalSchema = z.strictObject({
  from: z.number(), from_exclusive: z.boolean(),
  /** Inclusive. */
  to: z.number(),
  decision: DecisionSchema,
  /** True only for PASS and REQUIRE: no modeled constraint is violated inside the represented coverage. Not a statement of legality. */
  permit: z.boolean(),
  /** The rule whose verified bound ends this interval, with the words that state the bound. Null where the interval ends at the parameter's own maximum. */
  bounding_rule_id: z.string().nullable(), bounding_citation: z.string().nullable(), bound_text: z.string().nullable()
});
export type EnvelopeInterval = z.infer<typeof EnvelopeIntervalSchema>;
/** What holds across a region of a fact or of time: a decision when the request fixes the amount (or the action has none), else the amount intervals. */
const EnvelopeOutcome = { decision: DecisionSchema.nullable(), intervals: z.array(EnvelopeIntervalSchema).nullable() };

export const EnvelopeResponseSchema = z.strictObject({
  /** 'env_' + sha256(canonical request + ruleset_version), first 16 hex characters. Reproducible; not a stored log entry. */
  envelope_id: z.string().regex(/^env_[0-9a-f]{16}$/),
  ruleset_version: z.string().regex(/^[0-9a-f]{12}$/),
  as_of: IsoDateSchema,
  /** Measured on the server for this request. */
  evaluated_ms: z.number().nonnegative(),
  /** How many times the decision function ran to build this envelope. */
  evaluations: z.number().int(),
  action: ActionNameSchema,
  /** The decision at the requested point; null when the amount was left open. */
  decision: DecisionSchema.nullable(),
  /** The amount axis on `as_of` with the facts given. Null for an action without an amount. */
  permitted: z.strictObject({
    parameter: ParameterNameSchema, unit: z.string(),
    /** The whole range of the amount, in order. */
    intervals: z.array(EnvelopeIntervalSchema),
    /** Null when some interval permits. 'bound_not_computable': nothing permits and some interval is REVIEW. 'prohibited': every interval is BLOCK. */
    reason: z.enum(['bound_not_computable', 'prohibited']).nullable()
  }).nullable(),
  /** One entry per fact the record lacks and the answer depends on: the regions of that fact and what each yields. */
  decides: z.array(z.strictObject({
    fact: z.enum(SUPPLIABLE_FACTS),
    /** Null `from` or `to` means unbounded on that side. Both ends inclusive. */
    regions: z.array(z.strictObject({ from: z.number().nullable(), to: z.number().nullable(), ...EnvelopeOutcome }))
  })),
  /** Date intervals, in order, covering all time. Both ends inclusive; null means unbounded. `cause_*` name what starts the interval. */
  timeline: z.array(z.strictObject({
    from: IsoDateSchema.nullable(), to: IsoDateSchema.nullable(), current: z.boolean(), ...EnvelopeOutcome,
    cause_rule_ids: z.array(z.string()), cause_label: z.string().nullable()
  })),
  /** Duties that attach inside the permitted part, on `as_of`. */
  obligations: CheckResponseSchema.shape.obligations,
  /** What cannot be settled on `as_of`. */
  review: CheckResponseSchema.shape.review,
  evidence: CheckResponseSchema.shape.evidence,
  /** The building facts used, and where each came from. */
  facts: CheckResponseSchema.shape.facts,
  coverage: z.strictObject({ jurisdictions: z.array(z.string()), category: z.string(), known_gaps: z.array(z.string()) }),
  /** Fixed text: how the envelope was computed and what "permitted" does not mean. */
  limits: z.string(),
  disclaimer: z.string()
});
export type EnvelopeResponse = z.infer<typeof EnvelopeResponseSchema>;
export const ENVELOPE_LIMITS = 'Enumerated over the thresholds present in the compiled rules: verified constraint bounds, coverage thresholds and rule dates. Every part of the envelope is the decision check() returns there. Permitted means no modeled constraint is violated within the represented coverage; it does not mean legal. Conditional prohibitions and coverage gaps stay REVIEW.';

export const ActionsResponseSchema = z.strictObject({
  actions: z.array(z.strictObject({
    name: z.string(), label: z.string(), category: z.string(), modeled: z.boolean(),
    /** Whether POST /api/v1/envelope accepts this action. */
    envelope: z.boolean(),
    parameter: z.strictObject({ name: ParameterNameSchema, label: z.string(), unit: z.string(), min: z.number(), min_exclusive: z.boolean(), max: z.number(), example: z.number() }).nullable()
  })),
  subjects: z.array(z.strictObject({ type: z.string(), label: z.string() })),
  disclaimer: z.string()
});
export type ActionsResponse = z.infer<typeof ActionsResponseSchema>;

export const ERROR_CODES = ['invalid_request', 'property_not_in_registry', 'fact_conflicts_with_record', 'body_too_large', 'method_not_allowed', 'internal_error'] as const;
export const ErrorBodySchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(ERROR_CODES), message: z.string(),
    issues: z.array(z.strictObject({ path: z.string(), message: z.string() })).optional()
  }),
  disclaimer: z.string()
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

/** The exact wording of a PASS. It claims the absence of a modeled constraint, never legality. */
export const passSummary = (asOf: string) => `No modeled constraint in force for this action at this property on ${asOf}.`;
export const SUBJECT_NOTE = 'No modeled rule in this category conditions on the actor.';
