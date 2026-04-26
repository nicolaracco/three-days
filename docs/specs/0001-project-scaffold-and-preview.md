# Spec 0001: Project scaffold and Cloudflare preview pipeline

**Status:** Done
**Roadmap day:** GDD §13 Day 1 (substrate only — click-to-move and enemy pathfinding become specs 0002 and 0003)
**Owner:** Nicola
**Related ADRs:** ADR-0001, ADR-0004, ADR-0008, ADR-0009, ADR-0010

## Goal

The repo gains a Bun + Vite + Phaser 3 + TypeScript scaffold, a `bun test` harness, and a Cloudflare Workers Builds preview pipeline that auto-deploys on every push. A minimal "hello-world" Phaser scene loads at the production URL on desktop and iPhone Safari portrait. No game logic ships in this spec — only the substrate that every subsequent spec needs to land on.

## Why this, why now

GDD §13 Day 1's deliverables include "Phaser project compiles. Hello-world is live on Cloudflare and verified on iPhone Safari portrait. CLAUDE.md is in the repo." (CLAUDE.md is already in.) ADR-0010 (preview pipeline) and ADR-0009 (testing discipline, red-green-verify) both depend on this substrate existing — the iPhone manual play-test is the verify step for every subsequent change, so the preview URL must be real before any other feature can be marked done. Spec 0001 lands the scaffold so specs 0002+ can use it.

## Scope

### In scope

- **Project scaffold (ADR-0001).** Bun (≥ 1.2) + Vite + Phaser 3 + TypeScript (`strict: true`). `package.json` with `dev`, `build`, `typecheck`, `lint`, `test`, `preview` scripts (see ADR-0001 for the canonical script content). `bun.lock` (text format) committed.
- **TypeScript devDep.** `typescript` is installed as a devDep for `bunx tsc --noEmit`. Bun runs TS at runtime; type-checking still needs `tsc` per ADR-0001.
- **Bun version pin.** `.bun-version` at repo root (implementer pins the exact version they used; currently `1.3.13`). The `BUN_VERSION` env var on the Cloudflare Workers Builds dashboard mirrors this file.
- **Layered directory skeleton (ADR-0004).** `src/main.ts`, `src/scenes/`, `src/systems/`, `src/procgen/`, `src/data/`, `src/ui/`. Empty placeholder files (with a `.gitkeep` or a one-line README) where there's no real content yet are fine.
- **Test harness (ADR-0009).** One trivial passing test in `src/systems/sanity.test.ts` that proves the loop: `import { test, expect } from "bun:test"; test("sanity", () => expect(1 + 1).toBe(2));`. No game-logic tests yet — those land with their features. No `vitest`, no `jest` packages.
- **Hello-world Phaser scene.** A `BootScene` and a `MenuScene` (Phaser scenes; the only place classes are required per code style). `MenuScene` displays the text "Three Days — Hello World" centered on a solid background. No interactivity, no audio, no input handlers.
- **Phaser Scale Manager (ADR-0008).** `mode: Phaser.Scale.FIT`, `autoCenter: Phaser.Scale.CENTER_BOTH`, working resolution `360 × 640`. The `360 × 640` value is recorded in `src/data/viewport.json` (or equivalent) as `WORKING_WIDTH` / `WORKING_HEIGHT` constants — not hardcoded in scenes.
- **Mobile viewport meta tag.** `index.html` has `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">`. Page title is `Three Days`. No favicon yet (placeholder allowed).
- **Pointer-events-only input config (ADR-0008).** No `mouse-*` or `touch-*` handlers anywhere. The scaffold doesn't *use* input yet, but if any sample listener is added, it goes through `pointerdown`/`pointerup`/`pointermove`. Verifiable by grep.
- **Cloudflare Workers + Static Assets (ADR-0010).** Worker named `three-days` connected to the GitHub repo via Workers Builds. A `wrangler.jsonc` at the repo root with `name: three-days`, `assets.directory: ./dist`, `preview_urls: true`, and a recent `compatibility_date`. Dashboard config: **Build command** `bun install --frozen-lockfile && bun run typecheck && bun run lint && bun test && bun run build`; **Deploy command** `bunx wrangler deploy`; env var `BUN_VERSION` matching `.bun-version`.
- **Lint setup — minimum viable.** `eslint` + `@typescript-eslint` + `eslint-config-prettier` + `prettier` with defaults, run via `bunx eslint src && bunx prettier --check .`. `bun run lint` is the wired command. No bespoke rules in this spec; bespoke rules can land in their own follow-up.
- **Per-branch and production preview verified.** `https://three-days.<account>.workers.dev` serves the hello-world (where `<account>` is the developer's Cloudflare workers.dev subdomain). A pushed feature branch produces `https://<branch>-three-days.<account>.workers.dev` within ~60 seconds (per ADR-0010).

### Out of scope

- **Click-to-move with AP.** Spec 0002.
- **One enemy that pathfinds.** Spec 0003.
- **Any combat / AP / RunState / RNG / procgen / traits / character generation.** All belong to later specs.
- **Audio.** No SFX in this spec. The iOS audio-unlock gate (mentioned in ADR-0008's verification) defers to the first audio-touching spec.
- **Orientation-lock overlay.** Mentioned in ADR-0008 verification. Defers to the first interactive spec (likely 0002) — there's no game state to pause yet.
- **itch.io upload.** Day 7 deliverable, separate spec.
- **A `.github/workflows/ci.yml`.** ADR-0010 calls this an optional follow-up; CF Pages's consolidated build is sufficient for this spec.
- **Custom domain on Cloudflare.** Optional per ADR-0010; defer.
- **Inspection panel, glyphs, action targeting UI.** No game elements yet.
- **DEVLOG.md content.** First entry will land alongside this spec being implemented, via `/devlog`.

## Inputs

- Build inputs: `package.json`, `tsconfig.json`, `vite.config.ts`, `bunfig.toml` (only if needed), `.eslintrc.cjs` (or equivalent), `.prettierrc`, `.bun-version`.
- Cloudflare Workers Builds dashboard configuration (manual one-time setup by the user, post-spec).
- GitHub repo at `git@github.com:nicolaracco/three-days.git` (already exists; `main` is the production branch).
- No runtime inputs — the hello-world scene reads no data.

## Outputs / Effects

- A working `bun run dev` server on `localhost:5173` (Vite default).
- A working `bun run build` producing a `dist/` artifact (`index.html` + bundled JS + assets).
- A working `bun test` running Bun's built-in runner with one passing test.
- A working `bun run typecheck` and `bun run lint`.
- A Cloudflare Worker (`three-days`) deployed via Workers Builds on every push.
- Public URLs: production `https://three-days.<account>.workers.dev`, per-branch `https://<branch>-three-days.<account>.workers.dev`.

No game state, no events, no persistence.

## Interaction (desktop + mobile, same model)

The scaffold has no interactive UI. The page renders the hello-world and the user does nothing. The contract is correct rendering, not interaction.

That said, ADR-0008's substrate constraints apply even at zero interaction:

- **Always-visible glyphs:** N/A (no game elements).
- **Inspection panel:** N/A (no selection).
- **Targeting:** N/A.
- **Confirm flow:** N/A.
- **Hit areas:** N/A — but if any debug button were added (it shouldn't be in this spec), it would be ≥ 44 × 44 logical px.
- **Viewport behavior:** the page must not zoom on iOS Safari pinch, must not horizontally scroll, must not show URL bar quirks that crop the canvas. The mobile viewport meta tag handles this.

## Acceptance criteria

§12 sub-bar touched: **§12.3 visual coherence**, lightly. Pass = the placeholder font and centered canvas do not look obviously broken on either platform. Other sub-bars (§12.1 combat feel, §12.2 information design, §12.4 audio coverage, §12.5 onboarding) are not yet on the line — no game.

- [ ] **[unit]** `bun run typecheck` exits 0 with no TS errors.
- [ ] **[unit]** `bun run lint` exits 0 with no errors and no formatting violations.
- [ ] **[unit]** `bun test` runs Bun's built-in runner and the trivial sanity test in `src/systems/sanity.test.ts` passes.
- [ ] **[unit]** `bun run build` produces a `dist/index.html` that references the bundled JS, and the bundle imports Phaser without runtime errors when loaded.
- [ ] **[unit]** `rg "Math\\.random" src/` returns no hits (ADR-0007 — no Math.random in game logic; trivially true here, but the discipline starts now).
- [ ] **[unit]** `rg "(mousedown|mouseup|mousemove|touchstart|touchmove|touchend)" src/` returns no hits (ADR-0008).
- [ ] **[unit]** `rg "from \"vitest\"|from 'vitest'" src/` returns no hits (ADR-0009 — no vitest).
- [ ] **[unit]** `index.html` contains the mobile viewport meta tag exactly once, with `width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no`.
- [ ] **[unit]** `index.html` `<title>` is `Three Days`.
- [ ] **[unit]** Working canvas resolution `360 × 640` is read from `src/data/viewport.json` (or equivalent), not hardcoded in the Phaser config.
- [ ] **[unit]** A `bun.lock` (text) file is committed at the repo root. No `bun.lockb`, `pnpm-lock.yaml`, `package-lock.json`, or `yarn.lock`.
- [ ] **[unit]** A `.bun-version` file is committed at the repo root, pinning the Bun version used for the build.
- [ ] **[unit]** A `wrangler.jsonc` is committed at the repo root with `name: three-days`, `assets.directory: ./dist`, and `preview_urls: true` (per ADR-0010).
- [ ] **[manual desktop]** `bun run dev` serves the hello-world scene on `localhost:5173`. The text "Three Days — Hello World" is centered. Browser console shows no errors.
- [ ] **[manual desktop]** Pushing a feature branch produces a preview URL at `https://<branch>-three-days.<account>.workers.dev` within ~60 seconds. The URL serves the hello-world.
- [ ] **[manual desktop]** Production URL `https://three-days.<account>.workers.dev` serves the hello-world after a push to `main`.
- [ ] **[manual desktop]** Introducing a deliberate typecheck error on a feature branch causes Workers Builds to fail at the Build step; the Deploy step never runs and no preview URL is published for the broken commit. (This validates ADR-0010's gate.)
- [ ] **[manual iPhone]** Opening the production URL on iPhone Safari portrait shows the hello-world scene centered, no horizontal scroll, no zoom on tap, no Safari URL-bar cropping that disturbs the canvas.
- [ ] **[manual iPhone]** Rotating the iPhone to landscape during the test does *not* break the page — the scene re-fits to the new aspect (orientation-lock overlay is out of scope, but the scaffold must not crash).

## Test plan

Per ADR-0009, criteria split:

### Automated tests (red-green)

- `src/systems/sanity.test.ts` — one trivial assertion (`expect(1 + 1).toBe(2)`) imported from `"bun:test"`. Future specs add real systems tests.
- The unit-marked criteria above are mostly verified by `bun run typecheck` / `bun run lint` / `bun test` / `bun run build` succeeding, plus a few `rg` greps. They are not "tests" in the `bun test` sense, but they are mechanical and run on every CI build.

### Manual play-test (verify)

For every `[manual]` criterion above:

- **Scenario "dev server":** run `bun run dev`, open `localhost:5173`, confirm centered hello-world and clean console.
  - **Pass condition:** text reads "Three Days — Hello World", no console errors, no missing-asset warnings.
  - **Targets:** desktop browser only (the dev server isn't reachable from the iPhone unless on the same LAN — not required).

- **Scenario "branch preview":** `git push origin a-throwaway-branch`, wait ≤ 60s, open `https://a-throwaway-branch-three-days.<account>.workers.dev`.
  - **Pass condition:** URL exists, serves the hello-world, no console errors.
  - **Targets:** desktop browser **and** iPhone Safari portrait (this is the iPhone test loop ADR-0010 promised).

- **Scenario "production URL":** push to `main`, open `https://three-days.<account>.workers.dev`.
  - **Pass condition:** as above.
  - **Targets:** desktop browser **and** iPhone Safari portrait.

- **Scenario "broken-build gate":** introduce a deliberate `let x: number = "string";` somewhere, push the branch, wait for CF Pages.
  - **Pass condition:** CF Pages build fails. No preview URL is published for the broken commit. Logs show the typecheck failure.
  - **Targets:** desktop (verifying the dashboard).

- **Scenario "iPhone fit":** open the production URL on a real iPhone in Safari portrait. Pinch, tap, scroll attempts.
  - **Pass condition:** canvas is centered. No pinch-zoom (`user-scalable=no`). No horizontal scroll. URL bar collapse doesn't crop the canvas in a way that hides content.
  - **Targets:** iPhone Safari portrait only.

§12.3 visual coherence: pass = the placeholder font and the centered hello-world look intentional, not broken. Pass-by-eye is the bar at this stage.

## Open questions

User's answers from the previous draft are folded in. Remaining items:

- **Bun version pin.** Latest stable at implementation time (Bun 1.3.13 as committed). The `.bun-version` file must match the `BUN_VERSION` set on the Workers Builds dashboard.
- **Cloudflare Workers Builds dashboard setup.** The user does the dashboard click-through after the implementer ships `wrangler.jsonc`. The implementer pauses and prompts before attempting the iPhone-portrait acceptance criteria.

## Done means

The user opens `https://three-days.<account>.workers.dev` on their iPhone Safari in portrait orientation and sees a centered "Three Days — Hello World" Phaser scene render without console errors. They push a feature branch from their laptop; within ~60 seconds, `https://<branch>-three-days.<account>.workers.dev` exists and serves the same scene. A deliberately broken commit on a branch fails CI and produces no preview URL. `bun run dev`, `bun run typecheck`, `bun run lint`, `bun test`, and `bun run build` all succeed locally. The repo's `src/` skeleton — `scenes/`, `systems/`, `procgen/`, `data/`, `ui/` — is in place, ready for spec 0002 (click-to-move with AP) to land on.
