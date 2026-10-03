# Architecture
Pipeline (TypeScript, run with `npm run ordinal -- <command>`): corpus → compile (LLM extraction + mechanical quote verification) → `store/rules.jsonl` → resolve (Census Geocoder, cached) → `store/stacks.json` → apply (pure, deterministic) → export → `out/*.json`. See `docs/CONTRACTS.md`; the code in `src/ordinal/{contracts,status,corpus,entrypoints,cli}.ts` is the contract.
LLM extracts; deterministic code decides. The deployed UI reads the committed store and runs the engine; it makes no model call.
Web: Next.js 16 / React 19 / TypeScript / Tailwind 4. No agent framework, no database, no containers. Provider SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`) is used only by compile; see `src/server/ai/brief.ts` for the calling pattern already proven in this repo.
Only the lead holds keys and runs live extraction. Workers use a fake model client and recorded outputs.
Owners: contracts, package files, `official/`, `supplemental/`, `store/`, `out/`, docs: lead. Compile: `src/ordinal/compile`. Engine: `src/ordinal/{resolve,apply,export,selfcheck}`. UI: `src/components` + `globals.css`. Tests follow their module under `tests/unit/ordinal/`.
