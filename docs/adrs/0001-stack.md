# ADR-0001: Stack

**Status:** Accepted
**Date:** 2026-04-26

## Context

Three Days is a 7-day, browser-only, single-player tactical roguelike with a hard quality bar (GDD §12) and a learning agenda. The stack must be familiar enough to ship in a week and minimal enough that build/tooling is not a tax on the build budget. Hosting target is itch.io static.

## Decision

- **Language:** TypeScript, strict mode on.
- **Engine:** Phaser 3.
- **Build:** Vite.
- **Package manager:** pnpm.

## Alternatives considered

- **Plain Canvas / WebGL without an engine** — would teach more but eats days that the quality bar needs. Rejected.
- **PixiJS or three.js** — lower-level than Phaser; we'd reinvent scenes, input, and asset loading. Rejected for this scope.
- **Webpack / Parcel / Bun** — Vite's dev-server speed and zero-config TS handling are worth more here than alternatives' marginal differences. Rejected.
- **npm / yarn** — pnpm's content-addressed store and stricter hoisting catch dependency mistakes earlier. Marginal but free.

## Consequences

- Positive: TS strict mode catches the tile/pixel mix-up class of bugs at compile time (see ADR-0006).
- Positive: Phaser handles input, asset loading, and the scene graph — zero days spent on plumbing.
- Positive: Vite dev server gives sub-second HMR; play-testing is fast.
- Negative: Phaser's API surface is large and not always idiomatic TS — types are sometimes loose. Mitigated by ADR-0005 (game logic in `systems/`, Phaser only in `scenes/`).
- Negative: A small audience of contributors will not have pnpm; documented in README.

## Verification

- `package.json` lists `typescript`, `phaser`, `vite`, and uses pnpm (`packageManager` field or pnpm-lock.yaml).
- `tsconfig.json` has `"strict": true`.
- `pnpm typecheck` runs `tsc --noEmit` and is part of the per-task done checklist.
