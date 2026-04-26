# ADR-0001: Stack

**Status:** Accepted
**Date:** 2026-04-26

## Context

Three Days is a 7-day, browser-only, single-player tactical roguelike with a hard quality bar (GDD §12) and a learning agenda. The stack must be familiar enough to ship in a week and minimal enough that build/tooling is not a tax on the build budget. Hosting target is itch.io static (Day 7); preview pipeline is Cloudflare Pages (ADR-0010).

The toolchain is consolidated under **Bun** to keep the surface area small: one binary handles install, runtime, scripts, and tests. Vite stays for the browser-side dev server and bundle, since Bun's bundler is server-focused and Vite's HMR / asset handling for browser games is mature.

## Decision

- **Language:** TypeScript, strict mode on.
- **Runtime + package manager + script runner + test runner:** Bun (latest stable, ≥ 1.2).
- **Engine:** Phaser 3.
- **Browser bundler / dev server:** Vite, run via Bun (`bunx --bun vite`).
- **Lockfile:** `bun.lock` (text format, version-controlled). The legacy binary `bun.lockb` is not used.

`typescript` is **still** installed as a devDependency. Bun's runtime executes TS natively, but Bun's docs say explicitly: *"The Bun bundler is not intended to replace `tsc` for typechecking or generating type declarations."* So `bun run typecheck` is `bunx tsc --noEmit`. There is no Node and no pnpm in the toolchain.

Conventional `package.json` scripts:

```json
"scripts": {
  "dev":       "bunx --bun vite",
  "build":     "bunx --bun vite build",
  "preview":   "bunx --bun vite preview",
  "typecheck": "bunx tsc --noEmit",
  "lint":      "bunx eslint src && bunx prettier --check .",
  "test":      "bun test"
}
```

## Alternatives considered

- **Plain Canvas / WebGL without an engine** — would teach more but eats days the quality bar needs. Rejected.
- **PixiJS or three.js** — lower-level than Phaser; we'd reinvent scenes, input, and asset loading. Rejected for this scope.
- **Webpack / Parcel / Bun's own bundler for the browser app** — Bun's bundler targets servers and CLIs and lacks Vite's browser DX (HMR, plugin ecosystem, dev server). Vite is the right tool for the browser side. Rejected.
- **pnpm + Node (the previous decision in this ADR's earlier draft)** — pnpm is a fine package manager, but using Bun consolidates the runtime / installer / test runner / script runner into one binary. The learning agenda includes "felt opinion on the toolchain," and Bun is the more interesting answer in 2026.
- **npm / yarn** — slower than Bun, and either way requires a separate Node install. Rejected for the same reason as pnpm.

## Consequences

- Positive: TS strict mode catches the tile/pixel mix-up class of bugs at compile time (see ADR-0005).
- Positive: Phaser handles input, asset loading, and the scene graph — zero days spent on plumbing.
- Positive: Vite dev server gives sub-second HMR; play-testing is fast.
- Positive: One binary (Bun) replaces Node + pnpm + Vitest. Faster `install`, `run`, `test`. Fewer global tools to keep updated. No `.nvmrc` — Bun version is pinned via `.bun-version` and Cloudflare Pages's `BUN_VERSION` env var (ADR-0010).
- Positive: Bun runs TypeScript natively, so any one-off scripts (e.g. asset processing, a CLI tool to validate `data/*.json`) don't need a transpilation step.
- Negative: Phaser's API surface is large and not always idiomatic TS — types are sometimes loose. Mitigated by ADR-0004 (game logic in `systems/`, Phaser only in `scenes/`).
- Negative: `typescript` is still required as a devDep — Bun does not include `tsc`. The "no separate TS install" claim is partially true (Bun runs TS) and partially false (type-checking still needs `tsc`).
- Negative: Bun's plugin and integration ecosystem is smaller than Node's. Most things work; some edge cases (a Vite plugin assuming Node-only APIs, for example) may need a workaround. Acceptable for this project's surface area.
- Negative: A small audience of contributors will not have Bun. README documents the install (`curl -fsSL https://bun.sh/install | bash`).

## Verification

- `package.json` lists `phaser`, `vite`, and `typescript` (devDep). It does **not** list `pnpm`, `vitest`, or any pnpm-specific config.
- A `bun.lock` (text) file exists at the repo root. No `bun.lockb`, `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock`.
- `package.json` `scripts.dev` invokes Vite via `bunx --bun vite`.
- `package.json` `scripts.test` is `bun test` (not `vitest`).
- `tsconfig.json` has `"strict": true`.
- `bun run typecheck` runs `bunx tsc --noEmit` and is part of the per-task done checklist (CLAUDE.md).
- A `.bun-version` file pins the Bun version used by Cloudflare Pages and any contributor running the project locally.
