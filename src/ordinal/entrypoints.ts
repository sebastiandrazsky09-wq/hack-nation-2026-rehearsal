// FROZEN CONTRACT. Lead-owned. Signatures of the module entry points the CLI and the UI call.
// Each module's index.ts must export exactly these names with these types.
import type { Address, ApplyResult, InternalRule, JurisdictionStack } from './contracts';

// ---- compile (BUILD-1): src/ordinal/compile/index.ts ----
export type CompileOptions = {
  /** Restrict to these doc_ids. Default: every supplied captured text plus every supplemental text. */
  docs?: string[];
  /** A new document outside the manifest (`ordinal ingest PATH`). It is copied to store/ingested first. */
  ingestPath?: string;
  /** Jurisdiction for an ingested document when known; otherwise it is extracted from the text. */
  ingestJurisdiction?: string;
  /** Ignore the extraction cache and call the model again. */
  force?: boolean;
  /** Never call a model: use the extraction cache only and report documents that are not cached. */
  offline?: boolean;
};
export type CompileReport = {
  run_id: string;
  docs_requested: number;
  docs_processed: number;
  docs_failed: { doc_id: string; error: string }[];
  rules_total: number;
  rules_verified: number;
  rules_unverified: number;
  llm_calls: number;
  cache_hits: number;
};
export type RunCompile = (options: CompileOptions) => Promise<CompileReport>;

// ---- resolve (BUILD-2): src/ordinal/resolve/index.ts ----
export type ResolveOptions = { ids?: string[]; /** Use cached geocoder responses only. */ offline?: boolean };
export type ResolveReport = { total: number; by_method: Record<string, number>; unresolved: string[] };
export type RunResolve = (options: ResolveOptions) => Promise<ResolveReport>;

// ---- apply (BUILD-2): src/ordinal/apply/index.ts ----
/** Coverage and status of one rule at one address, ignoring every other rule. Pure and deterministic. */
export type ApplyRule = (rule: InternalRule, address: Address, stack: JurisdictionStack, asOf: string) => ApplyResult;
/** All rules at one address, including cross-rule precedence (`superseded`) and conflict flags. Returns one result per rule, `not_applicable` included. Pure and deterministic. */
export type ApplyAddress = (rules: InternalRule[], address: Address, stack: JurisdictionStack, asOf: string) => ApplyResult[];

// ---- export (BUILD-2): src/ordinal/export/index.ts ----
export type ExportOptions = { asOf?: string; outDir?: string };
export type ExportReport = { as_of: string; rules: number; rules_withheld_unverified: number; addresses: number; lookup_rows: number; schema_errors: string[]; files: string[] };
export type RunExport = (options: ExportOptions) => Promise<ExportReport>;

// ---- selfcheck (BUILD-2): src/ordinal/selfcheck/index.ts ----
export type SelfcheckReport = { ok: boolean; metrics: Record<string, number | string>; failures: string[] };
export type RunSelfcheck = () => Promise<SelfcheckReport>;
