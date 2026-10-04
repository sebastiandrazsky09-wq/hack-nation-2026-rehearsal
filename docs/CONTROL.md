# Control room
## Objective
Ordinal: for any of the 500 sample addresses, say which housing rules apply on a query date (default 2026-10-01), with the exact source quote, and report which addresses each change case affects. Hack-Nation 7, Challenge 02 (RealPage Rental Housing Law Navigator).
## Rules and rubric
Official files are in `official/pack/` (README.md is the participant guide). Differences from the lead's brief: `docs/RECONCILIATION.md`.
Extraction is automated from the corpus, never hand-coded. "unknown" is a valid answer when a fact is missing. Every interface says "Not legal advice". Public data only. Deadline Sun 4 Oct 15:00 CEST; freeze 14:00.
Priority: scorer correctness > T1–T5 and generalization to unseen law > citation integrity > submission artifacts > live deployment > usability > polish.
## Current release
Live at https://hack-nation-machine-rehearsal.vercel.app, deployed 4 Oct 13:41 CEST from integration `f8b2c1a` as Mortise, the legal envelope: `POST /api/v1/envelope` and the Envelope section on Check, over the unchanged engine and decision endpoints. The pipeline, the engine, the exports and the web app are complete for the supplied corpus (57 rules, 500 addresses, T1–T5). The GitHub repository is not public yet.
## Current priority
Keep the accepted baseline stable. The Envelope pivot from the PO's brief is built, tested and deployed (see STATUS); the demo film and deck in `submission/` predate it and the new sequence is in `docs/DEMO.md`. Open items need the product owner: Jersey City source, unit-count policy, the public repository, videos and the HackOS submission. The organizers' pack states there is no hour-16 release and no T6; a new document, if any, goes through `npm run ordinal -- ingest`.
## Task queue
Use .ops/tasks/*.json and npm run status. At most two implementation writers. Lead owns contracts/dependencies/store/out/releases. Two waiting handoffs mean stop dispatching.
## Decisions
Use docs/DECISIONS.md. Every consequential change includes reason and effect on the demo.
