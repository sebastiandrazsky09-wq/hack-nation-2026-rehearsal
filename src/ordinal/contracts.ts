// FROZEN CONTRACT. Lead-owned. Workers import from here and never redefine these shapes.
// Official submission shapes live in official/pack/schema and official/pack/submission_templates; these are internal supersets.
import { z } from 'zod';

export const CATEGORIES = ['rent_increase_limits', 'just_cause_eviction', 'security_deposits', 'application_screening_fees', 'screening_restrictions', 'algorithmic_rent_setting'] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;
export const LevelSchema = z.enum(['state', 'city']);
export const OfficialStatusSchema = z.enum(['in_force', 'not_yet_effective', 'pending', 'failed']);
export type OfficialStatus = z.infer<typeof OfficialStatusSchema>;
export const LegalStatusSchema = z.enum(['enacted', 'pending', 'failed']);
/** YYYY, YYYY-MM or YYYY-MM-DD: the official effective_date pattern. */
export const PartialDateSchema = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/);
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const DEFAULT_AS_OF = '2026-10-01';

const Cmp = z.enum(['lt', 'lte', 'gt', 'gte', 'eq']);
/**
 * One machine-checkable coverage condition. `text` is always the source wording it was derived from.
 * Evaluation is three-valued (true / false / unknown); a missing dataset fact is unknown, never false.
 * - year_built: compares the building date with `date` (YYYY or YYYY-MM-DD). The dataset has a year only, so the
 *   fact is the interval [Y-01-01, Y-12-31]; if that interval straddles `date` the condition is unknown.
 * - building_age_years: age at the query date, same interval logic (e.g. "certificate of occupancy within the previous 15 years").
 * - units: compares the unit count.
 * - unavailable: a property-level fact the dataset does not hold (owner type, exemption filing, registration). Always unknown.
 * - caveat: tenancy-, unit- or special-housing-specific wording (seasonal lets, dormitories, subsidised units).
 *   Never changes the result; it is listed in the explanation.
 */
export const ConditionSchema = z.discriminatedUnion('fact', [
  z.object({ fact: z.literal('year_built'), op: Cmp, date: PartialDateSchema, basis: z.enum(['construction', 'certificate_of_occupancy', 'other']), text: z.string() }),
  z.object({ fact: z.literal('building_age_years'), op: Cmp, years: z.number(), basis: z.enum(['construction', 'certificate_of_occupancy', 'other']), text: z.string() }),
  z.object({ fact: z.literal('units'), op: Cmp, value: z.number().int(), text: z.string() }),
  z.object({ fact: z.literal('unavailable'), name: z.string(), text: z.string() }),
  z.object({ fact: z.literal('caveat'), name: z.string(), text: z.string() })
]);
export type Condition = z.infer<typeof ConditionSchema>;

/** covered = every `requires` condition holds AND no `exempt_if` group holds (a group holds when all its conditions hold). */
export const CoverageSpecSchema = z.object({
  requires: z.array(ConditionSchema),
  exempt_if: z.array(z.array(ConditionSchema).min(1)),
  summary: z.string().nullable(),
  exemptions_summary: z.string().nullable()
});
export type CoverageSpec = z.infer<typeof CoverageSpecSchema>;

/**
 * What the rule's own text says about the other level of government, for the same category.
 * - yields_to_stricter_local: a state rule that gives way where a local rule governs -> result `superseded` there.
 * - preempts_local: text bars conflicting local ordinances -> conflict flag for human review where a local rule also covers the address.
 * - allows_stricter_local: both apply, no conflict.
 * - none_stated: both apply, no conflict.
 */
export const PrecedenceSchema = z.object({
  relation: z.enum(['yields_to_stricter_local', 'preempts_local', 'allows_stricter_local', 'none_stated']),
  text: z.string().nullable()
});

export const SourceOriginSchema = z.enum(['official_captured', 'supplemental', 'ingested']);
export const VerificationMethodSchema = z.enum(['exact', 'normalized', 'repaired', 'failed']);

export const InternalRuleSchema = z.object({
  /** Stable across recompiles: derived only from jurisdiction, category and normalized citation. */
  team_rule_id: z.string().min(1),
  /** 'CA' | 'NJ' | 'MA' | 'City, ST'. Chosen from the document's manifest jurisdiction or its parent state; never free text. */
  jurisdiction: z.string().min(2),
  level: LevelSchema,
  category: CategorySchema,
  title: z.string().min(1),
  /** One or two plain-language sentences. */
  requirement: z.string().min(1),
  key_value: z.string().nullable(),
  penalty: z.string().nullable(),
  citation: z.string().min(1),
  /** True when the citation's identifying tokens occur in the source document. A citation is never taken from model memory. */
  citation_in_source: z.boolean(),
  legal_status: LegalStatusSchema,
  enacted_date: PartialDateSchema.nullable(),
  effective_date: PartialDateSchema.nullable(),
  repeal_date: PartialDateSchema.nullable(),
  /** Source wording the status and dates were derived from. */
  status_basis: z.string().nullable(),
  coverage: CoverageSpecSchema,
  precedence: PrecedenceSchema,
  source_doc_id: z.string().min(1),
  source_url: z.string().min(1),
  source_origin: SourceOriginSchema,
  retrieved_at: z.string().nullable(),
  /** When verified: exactly sourceText.slice(span_start, span_end) of the document file as supplied. */
  quoted_span: z.string().min(20),
  span_start: z.number().int().nullable(),
  span_end: z.number().int().nullable(),
  verified: z.boolean(),
  verification_method: VerificationMethodSchema,
  confidence: z.number().min(0).max(1).nullable(),
  /** Unresolved conflict between sources or within one (e.g. two published effective dates). Never silently resolved. */
  conflict_flag: z.boolean(),
  conflict_note: z.string().nullable(),
  /** Other documents that support the same rule (merged duplicates), each with its own verified quote. */
  also_supported_by: z.array(z.object({ source_doc_id: z.string(), source_url: z.string(), quoted_span: z.string(), verified: z.boolean() })),
  extraction_run_id: z.string()
});
export type InternalRule = z.infer<typeof InternalRuleSchema>;

export const AddressSchema = z.object({
  address_id: z.string(), street_address: z.string(), postal_city: z.string(), state: z.string(), zip: z.string(),
  year_built: z.number().int().nullable(), units: z.number().int().nullable(),
  use_code: z.string(), use_description: z.string(), source_dataset: z.string(), retrieved_at: z.string()
});
export type Address = z.infer<typeof AddressSchema>;

export const JurisdictionStackSchema = z.object({
  address_id: z.string(),
  state: z.string(),
  county: z.string().nullable(),
  /** 'City, ST' in the same vocabulary as InternalRule.jurisdiction, or null when the address is in no incorporated place or is unresolved. */
  legal_city: z.string().nullable(),
  method: z.enum(['geocoder', 'pip', 'postal_fallback', 'unresolved']),
  confidence: z.number().min(0).max(1),
  matched_address: z.string().nullable(),
  raw_response_path: z.string().nullable(),
  note: z.string().nullable()
});
export type JurisdictionStack = z.infer<typeof JurisdictionStackSchema>;

/** `not_applicable` is internal and never exported. The rest is the official lookups `result` enum. */
export const ResultSchema = z.enum(['applies', 'unknown', 'superseded', 'not_yet_effective', 'pending', 'not_applicable']);
export type Result = z.infer<typeof ResultSchema>;

export const ApplyResultSchema = z.object({
  address_id: z.string(),
  team_rule_id: z.string(),
  result: ResultSchema,
  /** Machine code for the deciding reason, e.g. 'covered', 'outside_jurisdiction', 'missing_year_built', 'cutoff_year_ambiguous', 'status_pending'. */
  reason_code: z.string(),
  missing_facts: z.array(z.string()),
  caveats: z.array(z.string()),
  /** Deterministic template text. No model output. */
  explanation: z.string(),
  conflict_flag: z.boolean(),
  conflict_note: z.string().nullable()
});
export type ApplyResult = z.infer<typeof ApplyResultSchema>;

/** Jurisdiction vocabulary in scope. A new 'City, ST' may still appear through ingest; nothing may assume this list is closed. */
export const KNOWN_JURISDICTIONS = ['CA', 'NJ', 'MA', 'Los Angeles, CA', 'San Francisco, CA', 'San Diego, CA', 'Berkeley, CA', 'Santa Ana, CA', 'Jersey City, NJ', 'Hoboken, NJ', 'Newark, NJ', 'Boston, MA', 'Cambridge, MA'] as const;
export function levelOf(jurisdiction: string): 'state' | 'city' { return jurisdiction.includes(',') ? 'city' : 'state'; }
export function stateOf(jurisdiction: string): string { return jurisdiction.includes(',') ? jurisdiction.split(',')[1].trim() : jurisdiction; }
