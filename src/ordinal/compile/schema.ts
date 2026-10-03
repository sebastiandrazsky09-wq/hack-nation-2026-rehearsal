// What the model returns, and the injectable client boundary. Nothing here talks to a provider.
import { z } from 'zod';
import { CategorySchema, CoverageSpecSchema, LegalStatusSchema, PartialDateSchema, PrecedenceSchema, type Category, type InternalRule } from '../contracts';
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

/** The model groups candidates by id only; it writes no rule text. */
export const GroupAnswerSchema = z.object({ groups: z.array(z.object({ member_ids: z.array(z.string()), primary_id: z.string() })) });
export type GroupAnswer = z.infer<typeof GroupAnswerSchema>;

export type ExtractRequest = { doc: SourceDoc; chunkIndex: number; chunkText: string; allowedJurisdictions: string[] };
export type RepairRequest = { doc: SourceDoc; chunkText: string; rule: RawRule };
export type GroupCandidate = {
  id: string; title: string; citation: string; requirement: string; key_value: string | null; legal_status: InternalRule['legal_status'];
  enacted_date: string | null; effective_date: string | null; source_doc_id: string; source_origin: SourceDoc['origin'];
};
export type GroupRequest = { jurisdiction: string; category: Category; candidates: GroupCandidate[] };

export type LlmClient = {
  /** Model name used in cache keys. When absent the configured model name is used. */
  readonly model?: string;
  extract(req: ExtractRequest): Promise<{ rules: RawRule[]; model: string }>;
  repair(req: RepairRequest): Promise<{ quoted_span: string }>;
  /** Group the candidates of one (jurisdiction, category) cell by underlying law. Called only for cells with two or more candidates. */
  group(req: GroupRequest): Promise<GroupAnswer>;
};
