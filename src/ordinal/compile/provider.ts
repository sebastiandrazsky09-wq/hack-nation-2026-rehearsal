// The real model client. Never constructed by tests; the lead exercises it on the first live run.
import { generateText, Output } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { RawRuleListSchema, RepairSchema, type LlmClient } from './schema';
import { REPAIR_PROMPT, SYSTEM_PROMPT, extractUserPrompt } from './prompt';

const anthropicModel = () => process.env.ORDINAL_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
const openaiModel = () => process.env.ORDINAL_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-6.1-sol';

/** Model names this environment could use, preferred first. Offline runs try each when looking up the cache. */
export function configuredModelNames(): string[] {
  const names = process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY ? [openaiModel(), anthropicModel()] : [anthropicModel(), openaiModel()];
  return [...new Set(names)];
}

const CALL = { temperature: 0, maxRetries: 2 } as const;
const timeout = () => AbortSignal.timeout(180_000);

export function createProviderClient(): LlmClient {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey && !openaiKey) throw new Error('No model credentials: set ANTHROPIC_API_KEY (model from ORDINAL_MODEL or ANTHROPIC_MODEL) or OPENAI_API_KEY (model from OPENAI_MODEL), or run with --offline against a warm cache.');
  const name = anthropicKey ? anthropicModel() : openaiModel();
  const model = anthropicKey ? createAnthropic({ apiKey: anthropicKey })(name) : createOpenAI({ apiKey: openaiKey })(name);
  return {
    model: name,
    async extract(req) {
      const result = await generateText({
        model, output: Output.object({ schema: RawRuleListSchema }), system: SYSTEM_PROMPT,
        prompt: extractUserPrompt(req), maxOutputTokens: 16000, abortSignal: timeout(), ...CALL
      });
      return { rules: RawRuleListSchema.parse(result.output).rules, model: name };
    },
    async repair(req) {
      const result = await generateText({
        model, output: Output.object({ schema: RepairSchema }), system: REPAIR_PROMPT,
        prompt: `Rule: ${req.rule.title}\nCitation: ${req.rule.citation}\nQuote that could not be found: ${req.rule.quoted_span}\n\n<text>\n${req.chunkText}\n</text>`,
        maxOutputTokens: 1000, abortSignal: timeout(), ...CALL
      });
      return RepairSchema.parse(result.output);
    }
  };
}
