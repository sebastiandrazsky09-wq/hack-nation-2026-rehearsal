// What the model returns, and the injectable client boundary. Nothing here talks to a provider.
import { z } from 'zod';
import { CategorySchema, CoverageSpecSchema, LegalStatusSchema, PartialDateSchema, PrecedenceSchema } from '../contracts';
import type { SourceDoc } from '../corpus';

/** One extracted rule as the model states it. Offsets, ids, provenance and verification are added mechanically afterwards. */
export const RawRuleSchema = z.object({
  jurisdiction: z.string(),
  category: CategorySchema,
  title: z.string(),
  requirement: z.string(),
  key_value: z.string().nullable(),
  penalty: z.string().nullable(),
  citation: z.string(),
  legal_status: LegalStatusSchema,
  enacted_date: PartialDateSchema.nullable(),
  effective_date: PartialDateSchema.nullable(),
  repeal_date: PartialDateSchema.nullable(),
  status_basis: z.string().nullable(),
  coverage: CoverageSpecSchema,
  precedence: PrecedenceSchema,
  quoted_span: z.string(),
  confidence: z.number().nullable(),
  conflict_flag: z.boolean(),
  conflict_note: z.string().nullable()
});
export type RawRule = z.infer<typeof RawRuleSchema>;
export const RawRuleListSchema = z.object({ rules: z.array(RawRuleSchema) });
export const RepairSchema = z.object({ quoted_span: z.string() });

export type ExtractRequest = { doc: SourceDoc; chunkIndex: number; chunkText: string; allowedJurisdictions: string[] };
export type RepairRequest = { doc: SourceDoc; chunkText: string; rule: RawRule };

export type LlmClient = {
  /** Model name used in cache keys. When absent the configured model name is used. */
  readonly model?: string;
  extract(req: ExtractRequest): Promise<{ rules: RawRule[]; model: string }>;
  repair(req: RepairRequest): Promise<{ quoted_span: string }>;
};
