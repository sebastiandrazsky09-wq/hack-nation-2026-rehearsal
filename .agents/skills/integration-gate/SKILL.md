---
name: integration-gate
description: Integrate a completed hackathon task through file ownership, contract, test, and demo checks before advancing the release branch.
---
Read the handoff and task envelope. Inspect the diff against its pinned base. Reject out-of-owner files; a prompt's ownership rule is not access control. A green worker test run does not establish compatibility with newer integration commits.

Run python3 scripts/ops.py merge TASK_ID from a clean integration checkout. It applies task commits to a temporary worktree based on current integration, checks ownership, installs from the lockfile, runs type/unit/secret checks, production build, and browser smoke, then fast-forwards integration only if it has not moved.

Resolve a conflict by returning a new task with the current contracts; never accept generated conflict resolutions without re-running gates. Inspect the working result and independent review before releasing main. Only the human authorizes a scope change; routine successful task integration is lead-owned.
