# ADR-0004: Layered architecture

**Status:** Accepted
**Date:** 2026-04-26

## Context

Phaser couples scene management, rendering, input, and asset loading. Without discipline, game logic ends up tangled with Phaser primitives, making it untestable and tying every change to the engine. The GDD treats combat feel and information design as gating quality requirements (§12.1, §12.2); both are easier to verify with logic that can be tested headlessly.

## Decision

Code is organized into five top-level layers under `src/`:

```
src/
├── main.ts        Phaser game config + bootstrap
├── scenes/        Phaser scenes only (Boot, Menu, Run, GameOver)
├── systems/       Game logic — Phaser-free where avoidable
├── procgen/       Chunk loading, stitching, validation, placement
├── data/          Read-only static JSON
└── ui/            HUD, menus, dialog rendering
```

Layer rules:

- **`data/`** is read-only at runtime. Loaded once; never mutated.
- **`systems/`** is testable without Phaser. Pure functions where possible. State mutations live here.
- **`scenes/`** glue Phaser to systems. They render and route input but **do not own** game logic.
- **`ui/`** consumes state. It does not produce state changes directly; it dispatches events that systems handle.
- **`procgen/`** is a sibling of `systems/` because it has its own surface area and test set; same Phaser-free discipline applies.

## Alternatives considered

- **Flat `src/` with no layer rules** — fastest to start, hardest to test. Rejected; combat feel depends on logic that can be exercised in a unit test.
- **Domain-driven feature folders (`combat/`, `procgen/`, `ui/`)** — would group by capability instead of layer, but mixes Phaser-coupled and Phaser-free code in the same folder. Rejected for clarity.
- **Class hierarchy of `Scene` subclasses owning their own systems** — Phaser idiomatic but inverts the dependency we want. Rejected; composition over inheritance.

## Consequences

- Positive: `systems/` can be tested with `bun test` and no DOM.
- Positive: Swapping a Phaser version, or even Phaser itself, is bounded to `scenes/` + `ui/`.
- Positive: Quality-reviewer (and `quality-reviewer` agent) has a clear set of grep targets for layer violations.
- Negative: A small amount of ceremony when a system needs to surface state to UI (event dispatch instead of direct call).

## Verification

- `systems/` imports Phaser only when truly necessary; each Phaser import in `systems/` carries a comment explaining why.
- `ui/` does not mutate `RunState` directly; it dispatches events.
- `data/*.json` is imported with `as const` or read via a typed loader; nothing writes to imported data objects.
- File names match the layer (`systems/foo.ts` next to `systems/foo.test.ts`).
