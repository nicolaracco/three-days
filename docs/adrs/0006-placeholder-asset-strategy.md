# ADR-0006: Placeholder asset strategy

**Status:** Accepted
**Date:** 2026-04-26

## Context

Real art lands on Day 7 (GDD §13). Days 1–6 implement and polish systems against placeholders. The risk: building system code that depends on placeholder asset details, then breaking that code at the Day-7 swap. That breaks the quality bar at the worst possible moment.

## Decision

- All Days 1–6 art uses a **single** placeholder spritesheet at `public/assets/placeholder.png`.
- Tiles, sprites, and UI source from it via texture frame indices.
- Real art ships on Day 7 as a **drop-in** replacement: same atlas layout, same frame indices, same dimensions. No system code changes for the swap.
- Frame indices are constants in `data/sprites.json` (or equivalent), not magic numbers in scenes.

## Alternatives considered

- **Per-feature placeholder assets** — would let each system iterate visually in isolation, but multiplies the surface area that must be re-aligned on Day 7. Rejected.
- **Skip placeholders, generate real art day-of-feature** — couples PixelLab work to feature work; both slow each other down. Rejected.

## Consequences

- Positive: Day 7 risk is a single asset swap, not a refactor.
- Positive: Visual coherence (GDD §12.3) becomes a single regeneration if a coherence issue is found.
- Positive: The atlas layout itself becomes a designed artifact, documented up front.
- Negative: The placeholder must be authored deliberately enough to map to the real-art layout. Front-loaded cost.

## Verification

- `rg "this\\.load\\.(image|atlas|spritesheet)" src/` shows only `placeholder.png` (until Day 7) or the canonical real-art file (Day 7 onward). (Phaser's loaders are `this.load.image`, `this.load.atlas`, and `this.load.spritesheet` — pattern matches the actual API surface.)
- Frame indices are imported from `data/`, not typed as numeric literals at call sites.

## Open question — required atlas glyphs

ADR-0008 introduced a glyph-rich tile/unit rendering: HP bar, threat-type icon (melee fang vs ranged crosshair), exit type icon (stairwell vs fire-escape), trait-gate icon (Athletic emblem), item icons, cover markers, AP cost labels in targeting mode, hit-chance labels in targeting mode. The exact frame-index allocations are **not yet decided** — they depend on the tile size chosen under ADR-0005 and on the placeholder atlas authoring approach.

**For any agent or developer touching the placeholder atlas:** ask the user for the canonical glyph list and frame allocations before authoring. Do not invent them. The list above is the *minimum* set; the user may extend it.

This question is expected to resolve in the first spec that touches the atlas (likely an early-Day-1 or early-Day-2 spec).
