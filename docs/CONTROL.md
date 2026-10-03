# Control room
## Objective
Ordinal: for any of the 500 sample addresses, say which housing rules apply on a query date (default 2026-10-01), with the exact source quote, and report which addresses each change case affects. Hack-Nation 7, Challenge 02 (RealPage Rental Housing Law Navigator).
## Rules and rubric
Official files are in `official/pack/` (README.md is the participant guide). Differences from the lead's brief: `docs/RECONCILIATION.md`.
Extraction is automated from the corpus, never hand-coded. "unknown" is a valid answer when a fact is missing. Every interface says "Not legal advice". Public data only. Deadline Sun 4 Oct 15:00 CEST; freeze 14:00.
Priority: scorer correctness > T1–T6 generalization > citation integrity > submission artifacts > live deployment > usability > polish.
## Current release
Contracts frozen (`docs/CONTRACTS.md`). Pipeline modules are stubs. The starter sample app in `src/app`, `src/components`, `src/server` is unrelated to the product and stays untouched until a UI task replaces it.
## Current priority
Milestone 1: one document → one verified rule → one address → one valid lookup → one rule card.
## Task queue
Use .ops/tasks/*.json and npm run status. At most two implementation writers. Lead owns contracts/dependencies/store/out/releases. Two waiting handoffs mean stop dispatching.
## Decisions
Use docs/DECISIONS.md. Every consequential change includes reason and effect on the demo.
