// The real model client. Never constructed by tests; the lead exercises it on the first live run.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
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
  if (process.env.ORDINAL_PROVIDER === 'claude-cli' || (!anthropicKey && !openaiKey && process.env.ORDINAL_PROVIDER !== 'api')) return createCliClient();
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

const CLI_TIMEOUT_MS = 420_000;
/** The CLI validator has no meta-schema registry: drop `$schema` and emit draft-7. */
function cliSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  return rest;
}
/** One tool-free, settings-free headless call. The prompt goes in on stdin; the answer must satisfy the JSON schema. */
function callClaudeCli(model: string, system: string, prompt: string, schema: z.ZodType): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--model', model, '--system-prompt', system, '--output-format', 'json', '--json-schema', JSON.stringify(cliSchema(schema)),
      '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--tools', ''];
    const env = { ...process.env }; delete env.ANTHROPIC_API_KEY; delete env.OPENAI_API_KEY;
    const child = spawn(process.env.ORDINAL_CLAUDE_BIN ?? 'claude', args, { cwd: mkdtempSync(path.join(tmpdir(), 'ordinal-llm-')), env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`claude CLI timed out after ${CLI_TIMEOUT_MS / 1000}s`)); }, CLI_TIMEOUT_MS);
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      try {
        const envelope = JSON.parse(out) as { is_error?: boolean; result?: string; structured_output?: unknown };
        if (code !== 0 || envelope.is_error) throw new Error(`claude CLI failed (exit ${code}): ${String(envelope.result ?? err).slice(0, 400)}`);
        if (envelope.structured_output !== undefined && envelope.structured_output !== null) return resolve(envelope.structured_output);
        const text = String(envelope.result ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        resolve(JSON.parse(text));
      } catch (e) { reject(e instanceof SyntaxError ? new Error(`claude CLI returned no parseable JSON (exit ${code}): ${(out || err).slice(0, 400)}`) : e); }
    });
    child.stdin.end(prompt);
  });
}

/**
 * Same model, reached through the Claude Code CLI login instead of an API key. Used when no provider key is set,
 * or when ORDINAL_PROVIDER=claude-cli. The cache key uses the bare model name, so both routes share one cache.
 */
export function createCliClient(): LlmClient {
  const name = anthropicModel();
  return {
    model: name,
    async extract(req) {
      const output = await callClaudeCli(name, SYSTEM_PROMPT, extractUserPrompt(req), RawRuleListSchema);
      return { rules: RawRuleListSchema.parse(output).rules, model: name };
    },
    async repair(req) {
      const output = await callClaudeCli(name, REPAIR_PROMPT, `Rule: ${req.rule.title}\nCitation: ${req.rule.citation}\nQuote that could not be found: ${req.rule.quoted_span}\n\n<text>\n${req.chunkText}\n</text>`, RepairSchema);
      return RepairSchema.parse(output);
    }
  };
}
