# Spec 0007: Full procgen — connectors, multi-chunk, spawn slots, larger maps

**Status:** Approved
**Roadmap day:** GDD §13 Day 3 (procgen, third pass — closes the procgen-for-Day-1 deliverable). Day 4 (Day chain + Day-2 maps) is the next spec on top of this.
**Owner:** Nicola
**Related ADRs:** ADR-0004 (layered architecture), ADR-0005 (tile/pixel coordinates), ADR-0007 (seeded RNG), ADR-0008 (UI architecture), ADR-0009 (testing discipline)

## Goal

Procgen grows up. Chunks gain explicit `connectors` (n/s/e/w + chunk-local position) and `spawnSlots` metadata. The stitcher composes 3–4 chunks per map by matching compatible connectors, with bounding-box collision detection and coordinate normalization for chunks that extend in any direction from the entrance. Variable chunk dimensions are supported. The library grows from 6 to 8 chunks. The runtime `placeEnemiesOnMap` mitigation goes away — enemies spawn at chunk-authored slots picked by RNG. Re-roll on bad seeds (the bigger search space makes some seed/chunk combinations fail). Maps now feel like a small apartment — multiple connected rooms, varied layouts, spawn positions that match each chunk's design intent.

## Why this, why now

GDD §3 pillar 2 (*procedural assembly, authored components*) and §13 Day 3 wanted procgen with **5–7 chunks per map** producing **a small apartment**. Spec 0006 shipped the visible procgen baseline (2-chunk vertical stack); spec 0007 closes the full deliverable. After this, exits and Day chain (Day 4) can land cleanly on a real apartment-shaped map. Without it, exits would feel arbitrary on a 5×10 two-room layout.

§12 sub-bars touched: **§12.3 Visual coherence** lightly (larger maps fill the viewport better; less empty space). **§12.5 Onboarding** — a recognisable apartment shape makes "find the exits" a more legible spatial puzzle for a new player.

## Scope

### In scope

- **Connector metadata in chunk JSON.** Each chunk gains a `connectors: Array<{ side: "n" | "s" | "e" | "w"; col: number; row: number }>` field listing all door-connection points on the chunk's edges. Connector positions are **chunk-local** (relative to the chunk's `(0,0)`).
- **Spawn slots in chunk JSON.** Each chunk gains a `spawnSlots: Array<{ col: number; row: number }>` field listing chunk-local positions where an enemy can spawn. Empty array allowed (some rooms have no enemies).
- **Variable chunk dimensions.** Chunks can be any width × height (within reason — 3..9 each axis). The 5×5 fixed assumption from spec 0005/0006 goes away.
- **Chunk library grows 6 → 8.** Re-tag the existing 6 (entrance-room-a/b/c, back-room-a/b/c become entrance + interior chunks with proper connectors). Author 2 new chunks for variety: `hallway` (long corridor for connecting rooms) and `corner-room` (with E and S connectors for L-shape compositions). Chunk `kind` becomes `"entrance" | "interior"` (replacing `"back"`).
- **Connector-based stitcher** in `systems/procgen.ts`:
  - `stitch(rng, library, targetCount): StitchResult | null`. Returns `null` on failure (caller retries with a new RNG seed).
  - Algorithm: place an entrance chunk at origin. Repeatedly: pick a random open connector, pick a chunk with a compatible (opposite-side) connector, compute the placement offset so the door tiles end up adjacent, check no bounding-box overlap with already-placed chunks. If no compatible chunk fits, try another connector or a different chunk for that connector. Give up on this iteration if no progress; caller retries.
  - Coordinate normalization: chunks may end up at negative offsets (placed to the left/north of the entrance). After stitching, translate all positions so the resulting map's origin is `(0, 0)`.
  - Door tiles in chunks become `floor` in the stitched map; unconnected connectors remain visible but stay as `door` tiles in the chunk content (spec 0009 introduces `ExitTile` and converts them).
- **`generateMap(rng)` rewired.** Calls `stitch` with a target chunk count of `rng.intInRange(3, 5)` (3 or 4 chunks). Validates connectivity (existing). Validates that the stitched map has **≥ 2 unconnected connectors** remaining (these become exit candidates in spec 0009). On any validation failure, calls `stitch` again with the same RNG (deterministic retry chain). Up to 10 retries before throwing.
- **Spawn slots replace `placeEnemiesOnMap`.** Each placed chunk contributes its spawn slots (translated to absolute coordinates) to a global pool. `generateMap` returns the pool as `Day1Map.spawnSlots`. `createRunState` picks `loadDay1Enemies().length` positions from the pool via `rng.pickOne` (without replacement) and assigns them to enemies.
- **Scene continues to work.** The scene already reads `state.map.width`/`height` and centers the map via `gridCfg.offset` (spec 0006). Larger maps fill more of the viewport — possibly all of it.

### Out of scope

- **`ExitTile` rendering and Day chain.** Spec 0009 — exits land there. Spec 0007 leaves unconnected connectors as `door`-typed tiles (visible as floor) in the map data; they're functionally floor tiles for now.
- **Specific exit-type semantics** (stairwell vs fire-escape per GDD §9). Spec 0009.
- **Trait-gated exits** (Athletic for fire-escape). Spec 0009+.
- **Day 2 / handcrafted maps.** Day 4 / spec 0010 territory.
- **Real GDD §8.2 chunk roster** (living room, kitchen, bedroom, etc.). Spec 0007 ships 8 chunks but they're abstract layouts, not themed rooms — themes come with art (Day 7) or with §10 visual coherence. Spec naming is functional ("entrance-a", "corner-room", "hallway") not thematic ("kitchen").
- **Multiple enemies per chunk.** One enemy per slot for now; multi-enemy is implicit (more enemies = more slots used).
- **Doors as visible glyphs.** Doors-become-floor stays. Visual indication of doors is deferred to a Day-5 IA-pass spec (doors become a distinct tile kind for visual cue).
- **A `quality-reviewer` pass.**

## Inputs

- 8 chunk JSON files in `src/data/chunks/`.
- `RunState.seed` — already plumbed.

## Outputs / Effects

- `Day1Map` shape extends to `{ ...existing, spawnSlots: TilePos[] }`.
- `state.map` at runtime is a stitched 3–4 chunk map (variable width × height, typically ~10–14 each axis).
- Enemies spawn at chunk-authored positions.
- Scene renders larger map; centering math (spec 0006) is unchanged but now produces less empty space around the map.

## Interaction (desktop + mobile, same model)

Per ADR-0008. No new UI in this spec. The user notices:

- The map is larger and more apartment-shaped (multiple connected rooms).
- Each refresh produces a different layout from a wider variety than spec 0006's 9 combinations.
- The alien spawns in a position that matches the chunk's intent (no longer just "somewhere in the back half").

## Acceptance criteria

### Stitcher logic

- [ ] **[unit]** `stitch(rng, library, 1)` returns a single-chunk map (an entrance chunk placed at origin).
- [ ] **[unit]** `stitch(rng, library, 2)` returns a 2-chunk map where the second chunk's connector aligns with one of the entrance's connectors (door tiles 1 apart in absolute coords).
- [ ] **[unit]** `stitch(rng, library, 3)` returns a 3-chunk map with all chunks connected.
- [ ] **[unit]** Stitched maps never have overlapping chunks (sample 50 seeds × 3-chunk count; verify no two chunks' bounding boxes overlap).
- [ ] **[unit]** Stitched map's tile grid is large enough to fit all chunks after coord normalization (no negative coordinates).
- [ ] **[unit]** Door tiles in chunks become `floor` in the stitched map at *all* connection points (no "door" kind appears in the result).
- [ ] **[unit]** Unconnected connectors (chunks placed but their other connectors not yet matched) are reported in the stitch result.
- [ ] **[unit]** `stitch` returns `null` when the library has no entrance chunks.
- [ ] **[unit]** `stitch` returns `null` when target count exceeds compatible-connector graph capacity (e.g. all chunks have only one connector, library is small, target = 10).

### `generateMap` integration

- [ ] **[unit]** `generateMap(rng)` returns a connected `Day1Map` for every seed in 1..50.
- [ ] **[unit]** Every generated map has ≥ 2 unconnected connectors (spec 0009 will treat these as exit candidates).
- [ ] **[unit]** Every generated map has at least 1 spawn slot (so enemies can be placed).
- [ ] **[unit]** Generated maps have variable dimensions (sample 50 seeds; > 1 distinct `(width, height)` pair).
- [ ] **[unit]** `generateMap` is deterministic — same seed yields equal map.
- [ ] **[unit]** `generateMap` retries on bad seeds — confirmable by a unit test that constructs a deliberately poor library and verifies the retry path. (If hard to test, an internal counter exposed for testing.)

### Spawn slots

- [ ] **[unit]** Each chunk's `spawnSlots` are non-empty for chunks that should host enemies (interior chunks); empty for chunks that shouldn't (entrance chunks — protagonist spawns there).
- [ ] **[unit]** `Day1Map.spawnSlots` reflects all contributing chunks' spawn slots translated to absolute coordinates.
- [ ] **[unit]** `createRunState` picks `enemies.length` distinct slots via `rng.pickOne` (without replacement) and assigns to enemies. With 1 enemy from `loadDay1Enemies()`, 1 slot is consumed.
- [ ] **[unit]** `placeEnemiesOnMap` (the spec-0006 mitigation) is removed.

### Discipline (greppable)

- [ ] **[unit]** `rg "Math\\.random" src/` returns no hits.
- [ ] **[unit]** `rg "(mousedown|mouseup|mousemove|touchstart|touchmove|touchend)" src/` returns no hits.
- [ ] **[unit]** `rg "TILE_SIZE\\s*\\*" src/ | grep -v "systems/grid"` returns no hits.
- [ ] **[unit]** `rg "from \"vitest\"|from 'vitest'" src/` returns no hits.

### UI — desktop + iPhone

- [ ] **[manual desktop]** `bun run dev` opens the scene. The map is larger than 5×10 — varies per refresh, typically 10–14 tiles each axis.
- [ ] **[manual desktop]** Refreshing produces noticeably different shapes (some maps are wider than tall, some taller than wide, some L-shaped).
- [ ] **[manual desktop]** Combat scenarios from spec 0004 still work — walk to alien, attack, take damage, end turn.
- [ ] **[manual iPhone]** Same on iPhone Safari portrait. The map fits comfortably in the viewport with the centering math from spec 0006.

### §12 sub-bars

- [ ] **[manual]** §12.3 visual coherence — the larger procgen maps don't look broken or cluttered.

## Test plan

### Automated (red-green)

- `src/systems/chunk.test.ts` (extended):
  - "Chunk admits connectors and spawnSlots fields"
  - "loadChunks returns 8 chunks (was 6)"
  - "Chunks declare connectors at their edges"
- `src/systems/procgen.test.ts` (significant rewrite):
  - "stitch returns single-chunk map for target=1"
  - "stitch returns 2-chunk map with adjacent door tiles"
  - "stitch returns 3-chunk map with all chunks connected"
  - "stitched maps have no overlapping chunks (50 seeds)"
  - "coord normalization keeps all tiles within the map bounds"
  - "door tiles become floor in stitched output"
  - "stitch returns null for impossible configurations"
  - "generateMap is deterministic per seed"
  - "generateMap produces ≥ 2 unconnected connectors"
  - "generateMap produces variable dimensions across seeds"
  - "generateMap retries on bad seeds (testable via injection or counter)"
- `src/systems/run-state.test.ts` (extended):
  - "createRunState assigns enemies to chunk-authored spawn slots"
- `src/systems/enemy.test.ts` (refactored):
  - Remove `placeEnemiesOnMap` tests (function deleted).
  - Add tests for the new spawn-slot-based assignment helper if extracted.

### Manual play-test (verify)

- **Scenario "first big map":** open the production preview URL on iPhone Safari portrait. Confirm a multi-room map appears, larger than spec 0006's 5×10. Walk around, confirm walls actually block, find the alien, attack, take damage. No regression from spec 0004/0006.
- **Scenario "variation":** refresh 10 times. Note 3+ distinct shapes (different chunk counts, different room arrangements, different alien spawn positions).
- **Scenario "broken-build gate":** introduce a deliberate `bun run typecheck` error on a feature branch; confirm Workers Builds fails and no preview URL is published (ADR-0010).

## Open questions

_(empty — all six questions resolved 2026-04-27, defaults accepted: 3–4 chunks per map (`rng.intInRange(3, 5)`); 8-chunk library (3 entrance + 3 interior + 1 hallway + 1 corner); kind rename "back" → "interior"; chunk dimensions allowed 3..9 each axis; 10 retries before throw; `Day1Map.spawnSlots` field carries absolute coordinates of chunk-authored spawn slots. Spec body carries the canonical values.)_

## Done means

A user opens `https://three-days.<account>.workers.dev/` on iPhone Safari portrait and sees a multi-room map (3–4 chunks, ~10–14 tiles each axis, variable shape per refresh) centered in the viewport. Walls actually look like walls (not just edge borders). The alien spawns in one of the rooms in a position that feels deliberate, not arbitrary. Refreshing 10 times produces 3+ visibly distinct layouts. Movement, combat, end-turn, death overlay all still work as in spec 0004. `bun test` passes 130+ tests; `placeEnemiesOnMap` is gone (replaced by spawn slots). Spec 0008 (exits + Day chain) lands on a real apartment-shaped foundation.
