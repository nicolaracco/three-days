# ADR-0009: Testing discipline (bun test + red-green-verify)

**Status:** Accepted
**Date:** 2026-04-26

## Context

The GDD's quality bar (§12) is non-negotiable, and several sub-bars are about *behaviors* that regress invisibly when changes ripple (turn order, AP costs, hit-chance qualitative tells, RNG reproducibility). Manual play-testing alone won't catch most regressions before they ship; the run-end screen telling you "you died on turn 14" doesn't tell you that hit-chance thresholds drifted.

Phaser ships no testing harness. Community practice is framework-agnostic: pick a runner, then make `systems/` Phaser-free so most tests need no engine at all (which ADR-0004 already enforces). What unit tests can't cover is *feel* — §12.1 timing of hit/miss feedback, §12.2 information legibility, §12.3 visual coherence, §12.4 audio cue presence. Those need play-test verification.

The toolchain is consolidated under Bun (ADR-0001), so the test runner choice that minimizes surface area is **Bun's built-in test runner** — same Jest-compatible API as Vitest, no extra dev dependency, faster startup, and one binary instead of two.

## Decision

### Test runner

- **`bun test`** (Bun's built-in runner). API: `import { test, expect, describe } from "bun:test";` — Jest-compatible, near-identical to Vitest's surface.
- Tests co-located with source: `systems/foo.ts` ↔ `systems/foo.test.ts`. Bun discovers `*.test.ts` automatically.
- For DOM-touching tests, `happy-dom` (Bun's recommended DOM shim) is loaded explicitly per-test via `import { Window } from "happy-dom"`. Most `systems/` tests need no DOM and run in pure Bun.
- A `bunfig.toml` at the repo root captures any test config (preload scripts, env overrides). Most projects need none — the file may be empty or absent.

### What is tested where

| Layer (ADR-0004) | Test type | Tooling |
|---|---|---|
| `data/` | Schema/shape tests on JSON loads | `bun test`, no Phaser |
| `systems/` | Pure unit tests | `bun test`, no Phaser |
| `procgen/` | Property tests where useful (e.g. "every generated map has ≥ 2 reachable exits"); unit tests otherwise | `bun test`, seeded RNG |
| `scenes/` | Minimal — only when scene logic can't be hoisted to `systems/`. Use a hand-rolled `Scene` stub or `Phaser.HEADLESS`. | `bun test` with manual mocks |
| `ui/` | Event-emission tests (UI dispatches the right event for the right input) | `bun test` with hand-rolled stubs |
| §12 sub-bars (combat feel, info legibility, audio coverage, visual coherence) | **Manual play-test only** | Browser + iPhone (ADR-0008 + ADR-0010) |

### Red-green-verify loop

Every implementation step follows this loop. The implementer agent enforces it.

1. **Red.** Write a failing test that captures one acceptance criterion from the spec. The test must fail for the *right reason* (the behavior is missing), not for setup noise.
2. **Green.** Write the minimum code to pass the test. No surrounding cleanup, no speculative abstractions.
3. **Verify.** Two checks, both required:
   - **Spec match.** Cite the spec line that was satisfied; confirm no scope crept in.
   - **§12 sub-bar manual play-test** if the change touches combat feel, info design, audio, or visuals. The relevant sub-bar's wording is the test script. Run it on desktop *and* on iPhone portrait via the preview URL (ADR-0010).

If the change is pure logic with no §12 surface (e.g. pathfinding cost computation), step 3 is just the spec-match check.

### What "everything tested" means in practice

"Everything tested" does **not** mean "every line has a unit test." It means:

- Every spec acceptance criterion has either an automated test **or** a recorded manual play-test in the spec's Test plan.
- Every game-logic decision (`systems/`, `procgen/`) has automated tests.
- Every §12 sub-bar has a recorded manual play-test procedure that's run before merge.
- A criterion that is *only* manual must say so explicitly in the spec — it cannot be silently uncovered.

### Coverage as a guide, not a gate

Coverage targets are not a quality gate. A 100%-covered implementation that doesn't meet §12.1 still ships below the bar; an 80%-covered implementation that nails §12.1 ships at the bar. Don't write tests to chase coverage. Do write tests to lock in behavior the spec promised.

`bun test --coverage` is available when a number is genuinely useful for a sweep, but it does not block CI.

### CI

`bun test` runs on every push to a branch with a preview build (ADR-0010). A failing test blocks the preview deploy. This makes "the test suite passes" the precondition for the iPhone test.

## Alternatives considered

- **Vitest (the previous choice in this ADR's earlier draft).** Mature, Vite-native, jsdom built in. Rejected only because the project is now Bun-native — keeping Vitest would mean two test toolchains (Bun for everything else, Vitest for tests) for no real benefit. The migration cost is trivial: the test API is near-identical.
- **Jest.** Works fine, but slower than `bun test` and adds a parallel install. Rejected.
- **Playwright end-to-end.** Genuinely useful for checking that the inspection panel surfaces the right text, but heavier than this build's budget. Reconsider as a follow-up; not blocking.
- **No discipline (test where it's easy, skip where it's hard).** Rejected — the §12 sub-bars are exactly the hard places, and skipping them is the failure mode.
- **TDD without a verify step.** The standard red-green-refactor loop misses the §12 cases entirely. The verify step is what makes the discipline appropriate to this project.

## Consequences

- Positive: ADR-0004's layer split pays its dividend — most behavior is unit-testable without Phaser, which is fast.
- Positive: One test toolchain. `bun test` is the same binary used for `bun install` and `bun run`. No Vitest config, no Vite plugin to keep aligned.
- Positive: Faster test startup than Vitest in most cases (Bun's runner has no Vite dev-server warmup).
- Positive: The §12 manual play-test list becomes a real document; it's no longer a vibe check.
- Positive: The iPhone test (ADR-0010) becomes the verify step's natural home — testing on the phone is part of every change, not a Day-7 surprise.
- Negative: Bun's test runner ecosystem is younger than Vitest's. Some snapshot or DOM tooling may need workarounds. For pure-logic `systems/` tests this is a non-issue; the surface area where it could bite is `scenes/` and `ui/`, which we test sparingly anyway.
- Negative: Manual play-test discipline depends on the developer actually doing it. The implementer agent reports each verify step explicitly, which makes skipping it visible.

## Verification

- `package.json` does **not** list `vitest`, `jest`, or `@vitest/*` packages.
- `package.json` `scripts.test` is `bun test`.
- Test files match `*.test.ts` and import from `"bun:test"`, not from `"vitest"` or `"@jest/globals"`.
- A failing `bun test` on a feature branch blocks the Cloudflare Workers Builds deploy step (per ADR-0010's build command).
- Each spec in `docs/specs/` has a `Test plan` block that splits unit-testable criteria from manual play-test criteria, and that explicitly lists iPhone-portrait scenarios for any UI-touching feature.
- The implementer agent's report after each task lists the red, green, and verify steps with file:line evidence.
