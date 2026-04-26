---
description: Review the current uncommitted diff against CLAUDE.md and GDD Section 12 quality bar
allowed-tools: Bash(git diff:*), Bash(git status:*), Bash(git log:*), Read, Agent
---

Run a quality review of the current changes.

Steps:

1. Capture the diff context: `git status`, `git diff`, `git diff --staged`. If both diffs are empty, stop and tell the user there is nothing to review.
2. Delegate to the `quality-reviewer` subagent. Hand it the diff context and the user's optional focus area (`$ARGUMENTS` if provided — e.g. "focus on systems/combat").
3. Relay the agent's findings verbatim. Do not paraphrase or soften.
4. If there are blockers, ask the user whether to fix them now or defer.
