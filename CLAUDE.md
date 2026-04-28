# CLAUDE.md — Three Days

This file is loaded at the start of every Claude Code session. It is the **operational** layer: code style, commands, hard rules, and pointers. Design lives in the GDD; architecture lives in ADRs; per-feature contracts live in specs.

## What this project is

A two-day tactical roguelike vignette played in the browser. The player controls a single civilian who survives an alien invasion across a procgen apartment escape (Day 1) and a handcrafted final stand (Day 2). Run length: 15–25 minutes.

This project simultaneously serves a learning agenda and a commercial quality bar. Both goals are real. Scope stays small so quality stays high. **Shipping a smaller game at quality is the goal. Shipping a larger game below the quality bar is the failure mode.**

## Where to look

| Question                              | Document                                                                  |
|---------------------------------------|---------------------------------------------------------------------------|
| What does the game do? Why?           | [`docs/three-days-gdd.md`](docs/three-days-gdd.md)                        |
| What's the quality bar?               | GDD §12                                                                   |
| What's the build plan / cut list?     | GDD §13                                                                   |
| Why is the architecture this way?     | [`docs/adrs/`](docs/adrs/README.md) — ADR-0001 through ADR-0011           |
| What's the contract for feature X?    | [`docs/specs/`](docs/specs/README.md) — one spec per shippable feature    |
| Daily progress log                    | `DEVLOG.md` (created at first entry; see `/devlog` slash command)         |

## Workflow

Spec-driven. The path from roadmap to merge:

1. **Spec** — the `spec-author` agent (`.claude/agents/spec-author.md`) drafts a spec under `docs/specs/`. The user approves it.
2. **Implement** — the `implementer` agent (`.claude/agents/implementer.md`) writes code to satisfy the approved spec, no more.
3. **Review** — the `quality-reviewer` agent grades the diff against the spec and GDD §12. The `/code-review` and `/quality-check` slash commands wrap this.
4. **Log** — `/devlog` records what shipped, what was learned, what's next.

Do not invent architectural rules inside specs or code. If a feature would require one, write an ADR first (or flag that one is needed).

## Stack (one line each — see ADRs for rationale)

- **TypeScript strict + Bun + Phaser 3 + Vite (no Node, no pnpm; `typescript` devDep stays for `tsc --noEmit`)** — ADR-0001
- **Plain TS classes for state, no framework** — ADR-0002
- **Client-only architecture: no backend / LLM / telemetry; LocalStorage for run history only, no mid-run save** — ADR-0003
- **Layered architecture: scenes / systems / data / procgen / ui** — ADR-0004
- **Tile vs pixel coordinates, conversion in `systems/grid.ts`** — ADR-0005
- **Single placeholder spritesheet, drop-in real art on Day 7** — ADR-0006
- **Seeded RNG everywhere, no `Math.random()` in game logic** — ADR-0007
- **Playable on desktop landscape AND iPhone portrait; pointer events; no hover dependency — always-visible glyphs + sticky inspection panel + targeting projects all costs at once** — ADR-0008
- **`bun test` + red-green-verify; manual play-test for §12 sub-bars on desktop and iPhone** — ADR-0009
- **Cloudflare Workers Builds preview per branch (`<branch>-three-days.<account>.workers.dev`, deployed via `wrangler deploy`); itch.io is the Day-7 ship target only** — ADR-0010
- **World camera follows the protagonist; HUD / panel / overlays use `setScrollFactor(0)`; pointer handlers gate on the screen-space HUD/panel band before resolving world coordinates** — ADR-0011

Don't add dependencies casually. Each new dep is build-time and bug-surface tax. If "we could write this in 30 lines," write the 30 lines.

### Library docs

Phaser 3, Vite, and TypeScript APIs evolve. Before writing non-trivial code against them, fetch current docs via Context7 (`resolve-library-id` → `query-docs`). Training data is often behind the current API.

## Commands

- `bun run dev` — local dev server (Vite via `bunx --bun vite`)
- `bun run build` — production build
- `bun run typecheck` — `bunx tsc --noEmit`
- `bun test` — run unit tests (Bun's built-in runner)
- `bun run lint` — lint and format check

These are wired during Day 1 setup; treat the list as the planned interface until then.

## Code style

- Strict TypeScript. No `any` without a justifying comment. Prefer `unknown` + narrowing.
- Plain functions and data over classes when classes don't earn their weight.
- Phaser scenes are classes (Phaser requires it). Game logic is functions where possible. Composition over Scene inheritance.
- Tagged unions for variant data (`type Tile = FloorTile | DoorTile | ExitTile`). Avoid class hierarchies for plain data.
- Constants live in `data/*.json`, not inline. If you're typing a number into systems code, ask whether it should be JSON.
- Vocabulary follows the GDD: `Day1Map`, `Day2Map`, `ExitTile`, `RunState`, `TraitId`, `TilePos`, `PixelPos`. Use the design's words consistently.
- Tests live next to systems: `systems/foo.ts` ↔ `systems/foo.test.ts`.

## What NOT to build

- No backend, no runtime LLM, no telemetry, no multiplayer scaffolding, no account systems.
- No procedural narrative, no dialogue tree, no quest engine.
- No tutorial pop-ups. Onboarding is implicit through level design (GDD §12.5).
- No mid-run save (ADR-0003).
- No third enemy type, no fourth weapon, no half-cover, no procgen on Day 2 — without explicit human approval and a corresponding GDD edit.

## Decision rules

When choosing between approaches:

1. If both meet the quality bar, pick the faster one to implement.
2. If only one meets the quality bar, pick that one even if it's slower.
3. If neither meets the quality bar, stop and flag it back to the user before continuing. Don't lower the bar to make the change land.
4. If you're tempted to add "just one more thing," don't. Open a follow-up spec for v2 instead.

## Per-task done checklist

For any change that touches game logic:

- `bun run typecheck` passes.
- `bun run lint` passes.
- `bun test` passes — every red-green pair is now green (ADR-0009).
- No `any` introduced (or commented if unavoidable).
- Constants live in `data/`, not inline.
- Vocabulary follows the GDD.
- If combat / info design / audio / visuals are touched: the relevant §12 sub-bar still holds, **verified manually on desktop and on iPhone Safari portrait** via the preview URL (ADR-0008 + ADR-0010).
- The change can be described in one sentence. If not, split it.

## Daily end-to-end playtest

Per-change manual play-tests (under ADR-0009) cover the §12 sub-bars touched by that change. They do not catch **integration drift** — the slow accretion of cross-system breakage where each change passes its own check but the run as a whole degrades.

Once per build day, **play the entire run end-to-end at least once** on the latest preview URL — desktop and iPhone portrait. Note any feel, legibility, or pacing surprises in the devlog (`/devlog`). This is process, not architecture; it lives here because it's the cheapest insurance against a Day-6 surprise.

## File index

Pointers to load-bearing files, so future sessions orient without re-greping.

### Source

- `src/main.ts` — Phaser game bootstrap; reads `data/viewport.json` for the working resolution; registers `BootScene` + `MenuScene`; sets `Phaser.Scale.FIT` + `CENTER_BOTH` per ADR-0008.
- `src/scenes/` — Phaser scenes (the only place classes are required). `BootScene` transitions to `MenuScene`. New scenes: extend `Phaser.Scene`, add to the scene array in `main.ts`.
- `src/systems/` — Game logic, Phaser-free where possible (ADR-0004). Tests live next to source: `foo.ts` ↔ `foo.test.ts`. Only file currently: `sanity.test.ts` (the bun-test harness check).
- `src/data/viewport.json` — `WORKING_WIDTH` / `WORKING_HEIGHT` constants (per ADR-0008's portrait-resolution decision; ADR-0005 says coordinate-related constants live in JSON, not inline).
- `src/procgen/` — chunk-based map generation. Empty placeholder; first content lands in spec 0003 / Day 3.
- `src/ui/` — HUD, menus, inspection panel. Empty placeholder; first content lands when the inspection panel is needed (ADR-0008).

### Toolchain

- `package.json` — Bun-aware scripts (`bunx --bun vite` etc., per ADR-0001).
- `tsconfig.json` — strict TypeScript; `resolveJsonModule: true` so `viewport.json` imports cleanly.
- `vite.config.ts` — Vite browser config; `base: "./"` so the bundle works at any URL.
- `eslint.config.js` — flat ESLint config (v9), TypeScript-aware, prettier-compatible.
- `.prettierrc.json` / `.prettierignore` — defaults; `*.md` excluded so prose stays curated by hand.
- `wrangler.jsonc` — Cloudflare Workers Builds config (ADR-0010); `assets.directory: ./dist`, `preview_urls: true`.
- `.bun-version` — Bun version pin (currently `1.3.13`); read by Bun and mirrored to `BUN_VERSION` in the Workers Builds dashboard.
- `index.html` — Vite entry; mobile viewport meta tag; `<title>Three Days</title>`.
- `.claude/hooks/post-edit.sh` — typecheck on TS edits when bun + package.json + node_modules are all present (no-op during bootstrap).

## What "done" looks like

The game is on itch.io. A stranger could play it. A 20-minute run is completable. The §12 quality bar is met for every system in the build. Three runs feel meaningfully different. The repo has CLAUDE.md, a README, and a short devlog.

That is done. Shipping with a known §12 violation is not done.
