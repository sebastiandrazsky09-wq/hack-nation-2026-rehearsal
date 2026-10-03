---
name: task-handoff
description: Convert a hackathon product increment into an isolated, testable 30–45-minute agent task and a compact evidence-backed return.
---
Task requires: ID, current integration SHA, goal, allowed paths, frozen interface, observable acceptance, deadline, exclusions, and the condition that escalates a blocker. Combine tightly coupled API and AI work into one core owner; split parallel tasks only at a stable typed boundary.

Use python3 scripts/ops.py task ID ROLE GOAL; edit .ops/tasks/ID.json acceptance before launch. Workers cannot change root dependencies/contracts/migrations. Do not dispatch when two returns await review. Reissue a blocked or rejected task with python3 scripts/ops.py retry ID (add --fresh to discard its commits onto task/ID-attemptN); never hand-edit task status. A new critical interface decision invalidates affected tasks: stop and reissue them against the new SHA.

Return a scoped commit and docs/handoffs/ID.md with behavior, actual verification, observed limitations, and screenshots where applicable. An exit code is a process result, not acceptance evidence: ops.py records exit 0 without a new commit, committed handoff, and clean worktree as blocked. Do not call a fixture live functionality.
