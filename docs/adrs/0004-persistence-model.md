# ADR-0004: Persistence model

**Status:** Accepted
**Date:** 2026-04-26

## Context

The game is a 15–25 minute roguelike with permadeath. Players might want to see their past runs (kill counts, exits chosen, deaths). Mid-run save would invite save-scumming, which contradicts the run-as-decision-act philosophy.

## Decision

LocalStorage stores **only** the run-history list (array of completed run summaries: name, profession, traits, day ended, kill count, seed, exit chosen). Nothing else.

There is no mid-run save. Closing the tab abandons the run.

## Alternatives considered

- **Mid-run save** — removed because it enables save-scumming and makes failure non-final. The whole tactical-roguelike feel depends on commitment.
- **IndexedDB** — overkill for an array of small JSON records.
- **No persistence at all** — would lose the small amount of cross-run flavor (seeing past attempts) for no real gain.

## Consequences

- Positive: A stranger can refresh the tab without losing their history.
- Positive: Permadeath stays sharp — there is no Plan B for a bad turn.
- Negative: A browser-cleared cache erases history. Documented; acceptable.
- Negative: Any future migration of the run-summary schema must handle old records gracefully (or wipe with a version bump).

## Verification

- LocalStorage is read/written from a single module (planned: `systems/run-history.ts`); no other module touches `window.localStorage`.
- The codebase contains no save-game serializer for active run state.
