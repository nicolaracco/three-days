# ADR-0006: Tile/pixel coordinate split

**Status:** Accepted
**Date:** 2026-04-26

## Context

Tactical-grid games have two coordinate spaces: tile coordinates (col, row) for game logic, and pixel coordinates (x, y) for rendering. Mixing the two is the most common bug class in this genre — passing a pixel value where a tile is expected (or vice versa) produces silent, off-by-tile-size bugs that look like everything else.

## Decision

- Tile space: `(col, row)`, origin top-left, both increasing rightward/downward. Type: `TilePos`.
- Pixel space: `(x, y)`, origin top-left, y-down (Phaser default). Type: `PixelPos`.
- All conversion goes through `systems/grid.ts` (`tileToPixel`, `pixelToTile`).
- Function signatures keep the space explicit. `place(tile: TilePos)` and `draw(pixel: PixelPos)` — never `place({ x, y })` ambiguously.
- No `* TILE_SIZE` math inline in scenes, systems, or ui. The compiler refuses to mix `TilePos` and `PixelPos` without a conversion.

## Alternatives considered

- **Raw `{ x, y }` everywhere with comments** — convention is not type-checkable. Rejected; comments rot, types don't.
- **A single coordinate type with a `space` tag field** — runtime check instead of compile-time. Rejected for the same reason: type system is free to use.

## Consequences

- Positive: The most common bug class in the genre becomes a compile error.
- Positive: Unit tests for `systems/grid.ts` are tiny but cover a load-bearing surface.
- Negative: Slight verbosity at conversion sites. Acceptable.

## Verification

- `systems/grid.ts` exports `TilePos`, `PixelPos`, `tileToPixel`, `pixelToTile` and nothing else for coordinate work.
- `rg "TILE_SIZE \\*" src/` returns nothing (or only `systems/grid.ts`).
- `rg "{ x:.*, y:" src/` results have either `TilePos` or `PixelPos` annotation nearby.
