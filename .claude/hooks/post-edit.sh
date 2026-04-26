#!/usr/bin/env bash
# PostToolUse hook: typecheck + lint --fix on TS edits.
# Silent no-op when bun or package.json aren't in place yet (early in Day 1).
# Surfaces typecheck failures to Claude via exit code 2.

set -uo pipefail

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

# Only fire on TS/TSX files
[[ "$file_path" =~ \.(ts|tsx)$ ]] || exit 0

# Need bun + package.json to do anything
command -v bun >/dev/null 2>&1 || exit 0
[[ -f package.json ]] || exit 0

# Typecheck — failure blocks and reports to Claude
if ! bun run typecheck 2>&1; then
  exit 2
fi

# Lint with autofix — best-effort, never blocks
bun run lint --fix 2>&1 || true

exit 0
