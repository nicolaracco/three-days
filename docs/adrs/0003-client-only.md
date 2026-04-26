# ADR-0003: Client-only architecture

**Status:** Accepted
**Date:** 2026-04-26

## Context

Three Days is single-player, free, hosted on itch.io as a static page. The GDD lists what the project is *not* (no recruits, no LLM content pipeline, no telemetry). itch.io's free tier serves a static bundle from a CDN.

## Decision

The game runs entirely in the browser. No backend service, no runtime LLM call, no telemetry, no analytics, no auth. All content (chunks, balance, traits, names) ships as static JSON in the bundle.

## Alternatives considered

- **Telemetry for "did the player finish" / "which exit"** — useful for a commercial title; this game doesn't need the data. Rejected.
- **Server-side leaderboard** — fun, but contradicts "no meta-progression" (ADR-0011-equivalent design rule in GDD §6.3). Rejected.
- **Runtime LLM for dialog flavor** — explicitly out of scope per GDD §1 ("Not in this game"). Rejected.

## Consequences

- Positive: Zero deploy infrastructure beyond itch.io's static hosting.
- Positive: No latency, no offline failure modes, no API key management.
- Positive: Privacy-by-default — nothing leaves the player's machine.
- Negative: No data on how the game is played in the wild. The retrospective devlog (Success Criterion 14.4) substitutes by recording the developer's own observations.

## Verification

- No `fetch` / `XMLHttpRequest` / `WebSocket` calls in the codebase except to bundled static asset URLs.
- No environment variables or runtime config that imply a server.
- Build output is fully self-contained: index.html + bundled JS + static assets.
