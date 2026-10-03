import { streamText, tool, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { logTrace } from '../telemetry';
// Optional adapter: not used by the hero path. Add challenge-specific tools only after a direct call passes evals.
export function streamWithEvidence(prompt: string, evidence: string[]) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing');
  return streamText({
    model: createOpenAI() (process.env.OPENAI_MODEL ?? 'gpt-6.1-sol'),
    prompt, maxRetries: 0, abortSignal: AbortSignal.timeout(25000),
    stopWhen: stepCountIs(3),
    onStepFinish: step => { logTrace({ event: 'ai_step', tools: step.toolCalls.map(call => call.toolName).join(','), inputTokens: step.usage.inputTokens ?? 0, outputTokens: step.usage.outputTokens ?? 0 }); },
    tools: {
      readEvidence: tool({
        description: 'Read an item from the supplied evidence list.',
        inputSchema: z.object({ index: z.number().int().min(0).max(Math.max(0, evidence.length - 1)) }),
        execute: async ({ index }) => ({ evidence: evidence[index] ?? null })
      })
    }
  });
}
