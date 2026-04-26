# ADR-0003: Client-only architecture (with persistence model)

**Status:** Accepted
**Date:** 2026-04-26

## Context

Three Days is single-player, free, hosted on itch.io as a static page (Day 7 ship target) and on Cloudflare Pages during the build week (preview target — see ADR-0010). The GDD explicitly lists what the project is *not*: no recruits, no LLM content pipeline, no telemetry, no meta-progression. itch.io's free tier and Cloudflare Pages both serve a static bundle; neither offers a backend the game can rely on.

Within that constraint, two related decisions: (a) whether *anything* runs server-side, and (b) what persists across sessions on the client itself. Both decisions live in this ADR because the second is downstream of the first — once you've committed to "no backend," persistence is reduced to "what fits in the browser," and the question becomes "what should fit, and what should not."

## Decision

### Architecture: client-only

The game runs entirely in the browser. No backend service, no runtime LLM call, no telemetry, no analytics, no auth. All content (chunks, balance, traits, names) ships as static JSON in the bundle.

### Persistence: LocalStorage for run history only, no mid-run save

LocalStorage stores **only** the run-history list — an array of completed run summaries: name, profession, traits, day ended, kill count, seed, exit chosen. Nothing else.

There is **no mid-run save**. Closing the tab abandons the run. Permadeath is real.

LocalStorage is read and written from a single module (planned: `systems/run-history.ts`); no other module touches `window.localStorage`.

## Alternatives considered

### Architecture

- **Telemetry for "did the player finish" / "which exit"** — useful for a commercial title; this game doesn't need the data. Rejected.
- **Server-side leaderboard** — fun, but contradicts the GDD's "no meta-progression" rule (§6.3). Rejected.
- **Runtime LLM for dialog flavor** — explicitly out of scope per GDD §1 ("Not in this game"). Rejected.

### Persistence

- **Mid-run save** — removed because it enables save-scumming and makes failure non-final. The whole tactical-roguelike feel depends on commitment.
- **IndexedDB** — overkill for an array of small JSON records.
- **No persistence at all** — would lose the small amount of cross-run flavor (seeing past attempts) for no real gain.

## Consequences

- Positive: Zero deploy infrastructure beyond static hosting. Cloudflare Pages and itch.io both serve the bundle as-is.
- Positive: No latency, no offline failure modes, no API key management.
- Positive: Privacy-by-default — nothing leaves the player's machine.
- Positive: A stranger can refresh the tab without losing their run history.
- Positive: Permadeath stays sharp — there is no Plan B for a bad turn.
- Negative: No data on how the game is played in the wild. The retrospective devlog (Success Criterion §14.4) substitutes by recording the developer's own observations.
- Negative: A browser-cleared cache erases history. Documented; acceptable.
- Negative: Any future migration of the run-summary schema must handle old records gracefully (or wipe with a version bump).

## Verification

- No `fetch` / `XMLHttpRequest` / `WebSocket` calls in the codebase except to bundled static asset URLs.
- No environment variables or runtime config that imply a server.
- Build output is fully self-contained: index.html + bundled JS + static assets.
- LocalStorage is read/written from a single module (planned: `systems/run-history.ts`); no other module touches `window.localStorage`.
- The codebase contains no save-game serializer for active run state.
