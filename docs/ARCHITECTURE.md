# Architecture
Browser -> Next.js route -> input schema -> provider SDK -> output schema -> grounding/business rules -> browser.
Default: Next.js 16 / React 19 / TypeScript / Tailwind 4. No agent framework or local containers.
Supabase cloud is optional: auth, private Postgres records, private object storage. SQL migration must be applied and RLS tested against two users before calling the capability ready.
The sample replay is explicitly labelled and rejects unrelated input. APP_MODE=live enables paid provider calls. One OpenAI attempt then one Anthropic fallback share a 25-second deadline. They do not provide offline AI.
Streaming/tool adapter is in src/server/ai/capabilities.ts; it is optional and has not been live-tested. Structured results use the non-streaming hero path to simplify final validation.
Contract owner: lead. Root dependency/config owner: lead. Frontend: src/components + globals.css. Core: server + API routes. Research: docs/research. QA gets a separate task with tests/evals ownership after freezing test writers.
