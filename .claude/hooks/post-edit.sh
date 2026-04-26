#!/usr/bin/env bash
# PostToolUse hook for Edit/Write/MultiEdit. Two stages:
#
#   1. prettier --write on the edited file (any extension Prettier handles;
#      .prettierignore is respected; unsupported extensions yield an error
#      that we swallow). This auto-formats markdown-excluded JSON, JSONC,
#      YAML, HTML, CSS, etc., catching the wrangler.jsonc class of issues
#      before they reach CI.
#
#   2. For TS/TSX files only: typecheck the whole project (blocking, exit 2)
#      and run eslint --fix on src/ (best-effort).
#
# Bootstrap-friendly: silent no-op when bun, package.json, or node_modules
# aren't in place (early Day 1, fresh clones, etc.).

set -uo pipefail

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

# Need bun + package.json + node_modules to do anything
command -v bun >/dev/null 2>&1 || exit 0
[[ -f package.json ]] || exit 0
[[ -d node_modules ]] || exit 0

# Need an actual file to act on
[[ -n "$file_path" ]] || exit 0
[[ -f "$file_path" ]] || exit 0

# Stage 1: prettier --write (any file Prettier handles). Best-effort —
# .prettierignore wins, unsupported extensions are silently skipped.
bunx prettier --write --log-level=warn "$file_path" >/dev/null 2>&1 || true

# Stage 2: TS/TSX-specific checks
if [[ "$file_path" =~ \.(ts|tsx)$ ]]; then
  # Typecheck — failure blocks and reports to Claude
  if ! bun run typecheck 2>&1; then
    exit 2
  fi
  # ESLint --fix — best-effort, never blocks
  bunx eslint --fix src 2>&1 || true
fi

exit 0
