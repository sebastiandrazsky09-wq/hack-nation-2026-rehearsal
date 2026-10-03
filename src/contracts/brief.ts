import { z } from 'zod';
export const RequestSchema = z.object({ text: z.string().trim().min(20).max(12000) }).strict();
export const BriefSchema = z.object({
  title: z.string().min(1).max(100),
  summary: z.string().min(1).max(800),
  evidence: z.array(z.object({ quote: z.string().min(1), interpretation: z.string().min(1) })).min(1).max(6),
  actions: z.array(z.object({ action: z.string().min(1), reason: z.string().min(1), urgency: z.enum(['now', 'next', 'later']) })).min(1).max(5),
  unknowns: z.array(z.string().min(1)).max(8)
});
export type Brief = z.infer<typeof BriefSchema>;
export type Run = { brief: Brief; mode: 'live' | 'replay'; model: string; latencyMs: number; requestId: string; inputTokens: number; outputTokens: number; estimatedCostUsd: number | null };
export function validateGrounding(brief: Brief, input: string): void {
  for (const evidence of brief.evidence) {
    if (!input.includes(evidence.quote)) throw new Error('Model supplied an ungrounded quote');
  }
}
