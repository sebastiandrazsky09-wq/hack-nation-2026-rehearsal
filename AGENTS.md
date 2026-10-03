# Hackathon operation
Read docs/CONTROL.md, docs/ARCHITECTURE.md, and the task envelope first. The challenge and rubric in CONTROL override generic starter assumptions.

Only the lead edits shared contracts, package files, migrations, root configuration, and release branches. Workers own exactly the paths in their envelope. Worktrees isolate working files, not credentials or git metadata. Path ownership is checked at integration; it is not an OS security boundary.

No worker pushes, deploys, purchases, sends messages, changes credentials, or accesses another worktree. No keys in reports, logs, git, browser code, or NEXT_PUBLIC variables. Use replay mode and mocked provider calls during implementation. Lead supplies live-test evidence.

Make one bounded change. Reproduce a failure, locate the failing boundary, test one hypothesis, then add a regression case where meaningful. After two unsuccessful fixes, report the evidence and ask the lead to choose the next hypothesis. Report missing evidence explicitly. Never describe fixtures as live AI or a test that was not run as passing.

Return a commit and docs/handoffs/TASK_ID.md: behavior, changed interfaces (normally none), actual checks, screenshot paths if relevant, remaining risks. No automatic release from a worker result.
