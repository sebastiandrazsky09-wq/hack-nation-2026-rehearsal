// The model call of the constraint step. Never constructed by tests or by the server: only `ordinal constrain` without --offline uses it.
// Same two routes as src/ordinal/compile/provider.ts: an Anthropic API key, else the Claude Code CLI login.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { generateText, Output } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';

export type ConstraintClient = {
  readonly model: string;
  /** One schema-constrained answer for one prompt. */
  ask<T>(system: string, prompt: string, schema: z.ZodType<T>): Promise<T>;
};

export const constraintModelName = () => process.env.ORDINAL_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
const CLI_TIMEOUT_MS = 420_000;

function callCli(model: string, system: string, prompt: string, schema: z.ZodType): Promise<unknown> {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  return new Promise((resolve, reject) => {
    const args = ['-p', '--model', model, '--system-prompt', system, '--output-format', 'json', '--json-schema', JSON.stringify(jsonSchema),
      '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--tools', ''];
    const env = { ...process.env }; delete env.ANTHROPIC_API_KEY; delete env.OPENAI_API_KEY;
    const child = spawn(process.env.ORDINAL_CLAUDE_BIN ?? 'claude', args, { cwd: mkdtempSync(path.join(tmpdir(), 'ordinal-gate-')), env, stdio: ['pipe', 'pipe', 'pipe'] });
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

export function createConstraintClient(): ConstraintClient {
  const model = constraintModelName();
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && process.env.ORDINAL_PROVIDER !== 'claude-cli') {
    const anthropic = createAnthropic({ apiKey: key })(model);
    return {
      model,
      async ask(system, prompt, schema) {
        const result = await generateText({ model: anthropic, output: Output.object({ schema }), system, prompt, maxOutputTokens: 4000, temperature: 0, maxRetries: 2, abortSignal: AbortSignal.timeout(180_000) });
        return schema.parse(result.output);
      }
    };
  }
  return { model, async ask(system, prompt, schema) { return schema.parse(await callCli(model, system, prompt, schema)); } };
}
