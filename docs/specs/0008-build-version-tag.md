# Spec 0008: Build version tag

**Status:** In progress
**Roadmap day:** N/A — developer ergonomics
**Owner:** Nicola
**Related ADRs:** ADR-0001 (Vite build), ADR-0008 (UI architecture), ADR-0010 (preview pipeline), ADR-0011 (world camera)

## Goal

Render the deployed commit's short SHA (7 chars) in the bottom-right corner of the inspection panel, in a small dim font, so the user can verify which version is running without checking the Cloudflare dashboard. On local `bun run dev`, the same slot shows the working tree's short SHA, or `dev` if git is unavailable.

## Why this, why now

The Cloudflare Workers Builds preview rebuilds asynchronously from `main` pushes; refreshing the browser before the deploy lands silently shows an older build. Today's resolution is "watch the dashboard," which is friction in the per-change manual play-test loop (ADR-0009). A two-line build tag closes the loop: the user can refresh and tell at a glance whether the latest commit is live.

This is **not** a §12 sub-bar feature. It is a developer affordance, justified independently as removing a known friction point in the daily test workflow.

## Scope

### In scope

- One immutable build constant `BUILD_SHA` (string, length 3–8 chars), resolved at build time.
- Vite injection of `BUILD_SHA` via `define` in `vite.config.ts`. Resolution order:
  1. `process.env.WORKERS_CI_COMMIT_SHA` (set by Cloudflare Workers Builds), truncated to 7 chars.
  2. `git rev-parse --short HEAD` run from the project root.
  3. Literal `"dev"` if both fail.
- Render `BUILD_SHA` in `RunScene` as a tiny dim text in the bottom-right of the panel, with `setScrollFactor(0)` per ADR-0011 so it stays screen-fixed.
- One TypeScript declaration so the global constant is typed (e.g. a `src/build-info.ts` module that re-exports `__BUILD_SHA__` as a typed `BUILD_SHA`).

### Out of scope

- Build date, build number, branch name, dirty-tree marker. SHA only — confirmed.
- Click-to-copy or any interaction. The text is non-interactive.
- A "new version available, refresh" prompt. The user refreshes manually; the tag tells them what they got.
- Showing the SHA on `MenuScene` / `BootScene`. The play scene is the only place the user lands during the test loop, so the value lives there. If a future menu screen wants it too, it pulls from the same module.
- Hashing or verifying integrity. This is a label, not a checksum.

## Inputs

- Build-time: `process.env.WORKERS_CI_COMMIT_SHA` (Cloudflare Workers Builds; documented in their build environment) and `git rev-parse --short HEAD` (local fallback).
- Runtime: none — the value is baked into the bundle by Vite's `define`.

## Outputs / Effects

- A new text Game Object in `RunScene.create()`, rendered in screen space (scrollFactor 0), at the bottom-right of the panel area:
  - Position: `(WORKING_WIDTH - 6, PANEL_Y + PANEL_HEIGHT - 4)`, origin `(1, 1)` (bottom-right anchor).
  - Font: monospace, 9 px, color `#555` (dim — same family as `COLOR.textDim` but dimmer; pick the closer of the two existing dim greys, do not introduce a new color).
  - Text: the value of `BUILD_SHA`.
- A new `vite.config.ts` `define` block that resolves `__BUILD_SHA__` at build time (string literal).
- A new `src/build-info.ts` module that re-exports `__BUILD_SHA__` as `export const BUILD_SHA: string`, with a TypeScript ambient declaration so the global type-checks.

## Interaction (desktop + mobile, same model)

N/A — non-interactive display. ADR-0008's hit-area, selection, and confirm rules don't apply. The text is read-only and never the current selection.

## Acceptance criteria

- [ ] **[unit]** `BUILD_SHA` is a non-empty string of length 3–8. (Cheap regression guard against an empty `define` collapsing to `""`.)
- [ ] **[manual]** On the deployed Cloudflare URL, bottom-right of the panel shows the first 7 chars of the commit SHA the deploy was built from. Verifiable by comparing the on-screen string against `git log --oneline -1` for the commit `wrangler deploy` ran on.
- [ ] **[manual]** On `bun run dev` from a clean checkout, bottom-right of the panel shows the working tree's short SHA (the output of `git rev-parse --short HEAD`).
- [ ] **[manual]** With git removed from the build environment (or run from a non-repo dir), the slot shows `dev` and the build does not fail.
- [ ] **[manual]** The text does not overlap the action button slot in any of its modes (`Confirm Move`, `Confirm Attack`, `Attack (X AP)`, hidden). The action button is right-anchored at width 132 and ends ~y = `PANEL_Y + 78`; the SHA text sits below it at y = `PANEL_Y + PANEL_HEIGHT - 4`. Verified by entering each mode in turn during play-test.
- [ ] **[manual]** The text stays pinned bottom-right when the camera scrolls — verified on a multi-chunk procgen map by walking the protagonist to a corner and confirming the SHA does not drift.
- [ ] **[manual]** On iPhone Safari portrait, the text is legible at one arm's length without zooming. If 9 px is too small to read on a 360-wide canvas at 3× device pixel ratio, bump to 10 or 11 in implementation review and update the spec.

## Test plan

### Automated tests (red-green)

- `src/build-info.test.ts` — a tiny test asserting `BUILD_SHA` is a non-empty string ≤ 8 chars. The test runs against whatever Vite injected during the test run; under `bun test` (no Vite involvement) we provide a default in `build-info.ts` so the constant resolves cleanly without the bundler. The test guards against accidentally shipping `""` or `undefined`.

### Manual play-test (verify)

- **Scenario: deploy verification.**
  - Push a commit to `main`, wait for Cloudflare Workers Builds to finish, refresh the preview URL.
  - **Pass:** the SHA in the panel matches the first 7 chars of the just-pushed commit.
  - **Targets:** desktop browser **and** iPhone Safari portrait.
- **Scenario: local dev resolution.**
  - From a clean checkout on a feature branch, `bun run dev`, open `http://localhost:5173`.
  - **Pass:** SHA matches `git rev-parse --short HEAD`.
  - **Targets:** desktop browser only.
- **Scenario: button-overlap sweep.**
  - In the deployed build, cycle through every action button mode (no selection → Move staged → Attack staged → adjacent enemy selected with sufficient AP).
  - **Pass:** the SHA text remains visible and is not occluded by the action button rectangle in any mode.
  - **Targets:** desktop and iPhone Safari portrait.
- **Scenario: scroll-pinned.**
  - Walk the protagonist from the entrance to an unconnected connector on a multi-chunk map (camera scrolls).
  - **Pass:** SHA stays anchored to the bottom-right of the screen throughout. Per ADR-0011's verification list.

## Open questions

- None. Defaults: SHA truncated to 7 chars, dim grey 9 px monospace, bottom-right of panel, scrollFactor 0, fallback chain env var → git → `"dev"`. If implementation review surfaces a legibility issue at 9 px on iPhone, raise font size in the implementer's discretion and amend the spec retrospectively.

## Done means

The user pushes a commit to `main`, waits for Cloudflare Workers Builds to land, refreshes the preview URL on iPhone or desktop, and reads the new commit's short SHA from the bottom-right of the panel without opening the dashboard. On `bun run dev` the same slot shows the local commit's SHA, so the test loop works the same way locally and in the deployed build.
