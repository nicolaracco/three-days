# ADR-0002: No state framework

**Status:** Accepted
**Date:** 2026-04-26

## Context

A tactical roguelike has rich runtime state (RunState, map, units, AP, RNG seed). Single-player, no network, no time-travel debugging needed. Build budget is tight; learning to wire a state framework is not on the learning agenda.

## Decision

State lives in plain TypeScript classes and tagged-union data. No Redux, no MobX, no signals library, no DI framework.

UI changes are dispatched as Phaser events; `systems/` mutate state in response. The event bus is **Phaser's built-in `EventEmitter`** (`Phaser.Events.EventEmitter`, `scene.events`, `game.events`) — already part of the engine, no extra dependency, idiomatic for the framework. Do not add Mitt, RxJS, EventEmitter3, or any other event library; if Phaser's emitter is insufficient for a given case, that's a finding worth its own ADR.

## Alternatives considered

- **Redux / Zustand** — overkill for single-player, no async actions of significance. Rejected.
- **Signals (Solid-style, Preact signals)** — would integrate cleanly with Phaser via subscriptions, but introduces a paradigm to learn alongside Phaser. Rejected for this build budget; reconsider for any larger follow-up.
- **DI container (tsyringe, InversifyJS)** — useful at much larger scope; here it pays nothing.

## Consequences

- Positive: Zero learning tax on the state layer. New code is "just TS."
- Positive: Tests against `systems/` need no framework setup.
- Negative: No automatic re-render on state change — UI must explicitly listen for events. Acceptable: turn-based combat has a small set of update points.
- Negative: Refactor cost if the project grows. This is intentional; if we hit that point, we've already shipped.

## Verification

- `package.json` does not list redux, zustand, mobx, signals libraries, DI containers, or third-party event libraries (mitt, eventemitter3, rxjs).
- State types are defined in `systems/` as classes or tagged unions, not as framework primitives.
- Cross-layer event flow uses Phaser's `EventEmitter` only. `rg "import.*EventEmitter" src/` shows imports from `phaser`, not from a third-party module.
