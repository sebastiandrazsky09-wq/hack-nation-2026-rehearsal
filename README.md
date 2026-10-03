# Hackathon Machine Starter

Prepared and locally tested on 3 October 2026. This is a generic preparation artifact, not a challenge submission. Check the actual event's pre-existing-code rules before using it.

## Start
```bash
npm ci
cp .env.example .env.local
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
npm run dev
```
Open http://127.0.0.1:3000. The default is labelled sample replay, with no model cost. It rejects arbitrary input. No live functionality is implied by a replay test.

## Live mode
Enter server-side provider keys in .env.local using an editor; set APP_MODE=live and a random 32-character DEMO_ACCESS_TOKEN. Generate the code with openssl rand -hex 16 and store it privately; enter it once in the live browser. Do not export these keys into coding-agent shells. Run npm run live-check. This spends API money. Verify the primary and fallback separately by temporarily removing the other key locally. Exact model IDs: gpt-6.1-sol and claude-sonnet-5-5. Your ChatGPT/Claude subscription does not pay for these app calls.

The hero path has input/output validation, quote grounding, a shared 25-second provider deadline, and selected JSON telemetry. APP_MODE is server-side. No keys are exposed in browser code. The optional streaming/tool adapter is not wired into the hero path and must be live-tested before use.

## Optional backend
Create a dedicated Supabase cloud project. Set URL/publishable key and enable anonymous sign-ins. Apply supabase/migrations/001_private_runs.sql once. Visit /login and verify two-user record/storage isolation with separate browser profiles. Guest sessions do not verify real identity; use GitHub OAuth if the challenge needs it. Default Supabase email is restricted to team addresses and two messages/hour, so it is not the demo login path. server/data.ts provides save/upload adapters; the hero screen does not automatically persist reports. Realtime must be explicitly enabled for the needed table and exercised. The adapters/migration are supplied, but live auth, database, storage, and realtime are unverified.

## UI
Responsive native controls and Tailwind are included. components.json gives the shadcn registry configuration. Add an actual component only when the workflow needs it, through the lead:
```bash
npx shadcn@4.21.1 add dialog
```
Review added dependencies, styles, and accessibility, then rerun gates. The current starter has no shadcn primitives installed and does not need a dialog.

## Worktrees
Create your own project outside the synced source mirror, then initialize it:
```bash
git init -b main
git add .
git commit -m "Prepared generic starter; pre-event provenance"
git switch -c integration
python3 scripts/ops.py task fe-01 frontend 'Implement the chosen hero interface using the frozen contract'
```
Review .ops/tasks/fe-01.json, especially acceptance, before running it. From another terminal: python3 scripts/ops.py run fe-01. Lead-only: python3 scripts/ops.py merge fe-01. The task queue does not launch a model until run is called. Claude auth and Node dependencies are prerequisites. QA is read-only; a test-writing task must be separately assigned with exclusive ownership.

The merge gate is designed to use a temporary candidate worktree, run check/build/browser tests, and advance integration only by fast-forward. Path rejection and explicit current-base selection have been tested in a disposable repository. The full candidate integration gate was also exercised in a disposable repository: install, checks, production build, browser smoke, and fast-forward. Live model task dispatch remains unverified. Failed candidate directories are retained for inspection; remove them using git worktree remove after inspecting.

## Release
Independent review + human inspection of the hero flow precede release. Then fast-forward main, push, and deploy using the lead's credentials. Never push from a worker. Do not run concurrent merge gates.

## Security and cost
.env.local, logs, backups, and eval outputs are ignored. The local secret guard is basic; run gitleaks git --redact before publishing. The live endpoint requires a private demo access cookie and has no durable distributed per-user rate limiter. This blocks anonymous inference; distribute the demo access code privately and use account budgets plus the per-request token cap. Cost figures are short-context estimates, not invoices or enforced spending caps.

## Verification
See ../VERIFICATION.md for dated observed checks and outstanding readiness gates. npm run eval refuses replay mode; its two example cases are smoke tests, not a benchmark. Replace them with a labelled challenge-specific dev/holdout set.

## Skills
Four repository skills live under .agents/skills; .claude/skills contains symlinks to them. The frontend skill is an unmodified snapshot of Anthropic's official skill, with its Apache 2.0 license. The three operation skills are custom. Browser skill installation is a separate runbook step through Microsoft's Playwright CLI.
