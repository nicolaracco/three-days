# ADR-0008: Seeded RNG

**Status:** Accepted
**Date:** 2026-04-26

## Context

A run involves randomness in many places: chunk selection and stitching, enemy/item placement, hit rolls, loot drops, character generation. The same run must be reproducible from start to end — for debugging (the dev sees a bug, replays the seed, diagnoses), for tests (deterministic outcomes), and for the run-history record (a stranger could in principle re-play their own run).

`Math.random()` is unseeded. Mixing it with a seeded RNG produces non-reproducible runs that are *almost* deterministic, which is worse than fully non-deterministic.

## Decision

- All randomness in game logic flows through a seeded RNG in `systems/rng.ts`.
- Every `RunState` carries the seed it was created from.
- `Math.random()` is **forbidden** in `systems/`, `procgen/`, `scenes/`, and `ui/` for any decision that affects gameplay.
- Cosmetic randomness (e.g. footstep variation that doesn't gate logic) may use `Math.random()` if it is genuinely orthogonal to game state — but the default answer is "use the seeded RNG anyway."

## Alternatives considered

- **`Math.random()` everywhere** — fastest, breaks reproducibility. Rejected.
- **Multiple RNG streams (one for procgen, one for combat, one for AI)** — clean but more machinery than this build needs. The single-stream approach plus careful call ordering is enough at this scope.

## Consequences

- Positive: Run reproducibility is automatic. Debug sessions and tests both benefit.
- Positive: Run-history can record `{ seed, choices }` and re-play deterministically.
- Negative: Any change to call ordering inside a turn (e.g. resolving move, then attack, then enemy turn in a different order) changes the resulting RNG path. Tests must account for this when seeds are pinned.
- Negative: Insertion of new RNG calls in mid-development invalidates pinned-seed snapshots in tests. Acceptable; we re-pin.

## Verification

- `rg "Math\\.random" src/` returns no results in `systems/`, `procgen/`, `scenes/`, or `ui/`.
- `systems/rng.ts` exports a typed RNG factory and the gameplay primitives (`pickOne`, `roll01`, `intInRange`, etc.).
- `RunState` includes a `seed: number` field set at creation and never reassigned.
