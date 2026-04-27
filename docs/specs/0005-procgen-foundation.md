# Spec 0005: Procgen foundation — chunks, RNG, stitcher, validator

**Status:** Approved
**Roadmap day:** GDD §13 Day 3 (procgen, first half — library + live integration in spec 0006)
**Owner:** Nicola
**Related ADRs:** ADR-0004 (layered architecture), ADR-0005 (tile/pixel coordinates), ADR-0007 (seeded RNG), ADR-0009 (testing discipline)

## Goal

The project gains the *machinery* for procgen — a seeded RNG, a chunk data format, four hand-authored 5×5 chunks, a stitcher that combines chunks into a `Day1Map`, and a validator that proves connectivity. `generateMap(rng)` produces a deterministic, valid 2-chunk map. There is **no live integration** in this spec — `createRunState` still uses the static `data/day1-static-map.json`, the player sees no UX change, and the existing test surface is undisturbed. Spec 0006 grows the chunk library, swaps procgen into `createRunState`, restores enemy spawning via spawn slots, and finishes the migration.

## Why this, why now

GDD §13 Day 3 is "procgen for Day 1." Pillar 2 (*procedural assembly, authored components*, GDD §3) and learning bar §2.2 (*chunk-based procgen*) hinge on this. Splitting it in two:

- This spec lands the foundation as **isolated machinery** with full unit-test coverage. The existing game keeps working.
- Spec 0006 grows the chunk library to the GDD §8.2 catalog (8 apartment chunks), threads procgen through `createRunState`, refactors the runtime test fixtures, restores enemies via spawn slots, and adds multiple-exit validation.

The split is honest: integrating procgen into `createRunState` now would break ~10 existing tests that assume the static map's layout. Doing the test refactor *together* with the chunk-library expansion (where the work is naturally bigger anyway) keeps each spec's scope tight.

This spec also pays a debt: ADR-0007 (seeded RNG) has been on the books since the foundation but no `systems/rng.ts` actually exists yet. `RunState.seed` is stored but never consumed by an RNG primitive. Procgen forces the issue — chunk picking needs a real RNG.

§12 sub-bars touched: **none directly**. This is foundation work; §12.2 / §12.3 land in spec 0006 when the user sees the procgen output. The implicit obligation is that spec 0006 doesn't have to redesign anything from this spec — the chunk format and stitcher API have to be right.

## Scope

### In scope

- **Seeded RNG (ADR-0007 finally honored).** `systems/rng.ts` exports:
  - `createRng(seed: number): Rng` — factory.
  - `Rng` interface: `next(): number` (returns `[0, 1)` like `Math.random()`); `intInRange(min: number, maxExclusive: number): number`; `pickOne<T>(items: readonly T[]): T`; `roll01(probability: number): boolean`.
  - Implementation: a simple deterministic PRNG (mulberry32 or sfc32 — pick one and stick with it). Same seed → identical sequence. No use of `Math.random` anywhere.
  - 5–7 unit tests covering each primitive's contract + determinism.
- **Chunk data format.** `data/chunks/*.json` — each chunk is a small grid with metadata. Schema:
  ```jsonc
  {
    "id": "entrance-room-a",
    "kind": "entrance" | "back",
    "width": 5,
    "height": 5,
    // For entrance chunks: where the protagonist spawns inside the chunk.
    "start": { "col": 2, "row": 1 } | null,
    // 2D grid: "wall", "floor", or "door". Doors mark connection slots
    // and become floor in the stitched output.
    "tiles": [
      ["wall", "wall", "wall", "wall", "wall"],
      ["wall", "floor", "floor", "floor", "wall"],
      ["wall", "floor", "floor", "floor", "wall"],
      ["wall", "floor", "floor", "floor", "wall"],
      ["wall", "wall", "door", "wall", "wall"]
    ]
  }
  ```
- **Four hand-authored chunks** in `src/data/chunks/`:
  - `entrance-room-a.json` — 5×5 walled room, single south door at `(col=2, row=4)`, `start` at `(col=2, row=1)`.
  - `entrance-room-b.json` — same shape, different interior wall placement (e.g. one inner pillar) so layouts visibly differ.
  - `back-room-a.json` — 5×5 walled room, single north door at `(col=2, row=0)`, no `start`.
  - `back-room-b.json` — same shape, different interior layout.
- **`systems/chunk.ts`** (new):
  - `Tile` union extends to include `DoorTile` (kind `"door"`). Door tiles in chunk data become `FloorTile` in the stitched map.
  - `Chunk` type matching the JSON schema.
  - `loadChunks(): Chunk[]` — loads all `data/chunks/*.json` and validates the shape.
  - `getChunksOfKind(kind): Chunk[]` — convenience filter.
- **`systems/procgen.ts`** (new):
  - `generateMap(rng: Rng): Day1Map` — pure function. Picks one entrance chunk and one back chunk via `rng.pickOne`. Stitches them vertically: entrance at top (rows 0..4), back at bottom (rows 5..9). The two doors become floor tiles. The `start` of the entrance chunk becomes the `Day1Map.start`. Returns a `Day1Map` of size 5×10.
  - Validates connectivity before returning: every floor tile must be reachable from `start` via 4-connected BFS over floor tiles. If a chunk pair fails the validator, throw — for spec 0005 the four hand-authored chunks are guaranteed compatible, so this is a defensive assert.
- **Connectivity validator.** `systems/procgen.ts` exports `isFullyConnected(map: Day1Map, from: TilePos): boolean`. Used internally by `generateMap` and exposed for testing.
- **Tests** (per ADR-0009 red-green-verify):
  - `rng.test.ts`: `createRng` determinism, `intInRange` bounds, `pickOne` returns an element of the input, `roll01` distributions (loose), seed independence (different seeds → different sequences).
  - `chunk.test.ts`: `loadChunks` returns the four hand-authored entries; chunks pass schema validation; `Tile` union accepts the door kind.
  - `procgen.test.ts`: `generateMap` with the same seed returns the same map (deterministic); the result is a valid `Day1Map` (5×10, walls outside, doors converted to floor); the start position matches the chosen entrance chunk's start (translated into stitched coordinates); `isFullyConnected` returns true; with a hand-crafted disconnected map, the validator returns false.

### Out of scope

- **Live integration into `createRunState`.** The runtime game keeps using `loadDay1Map` from spec 0002. Procgen is callable but unused by the scene.
- **Full chunk library** (8 apartment chunks per GDD §8.2). Spec 0006.
- **Multiple chunks per map** (more than 2). Spec 0006.
- **Variable chunk dimensions.** All chunks are 5×5 in spec 0005 to keep the stitcher's geometry trivial. Spec 0006 introduces variable widths/heights and proper connector alignment.
- **Spawn slots for enemies** in chunk metadata. Enemies stay loaded from `data/day1-static-enemies.json` against the static map. Spec 0006 moves spawn into chunks.
- **Multiple exits per map.** GDD §8.3's "≥ 2 reachable exits" constraint is a spec-0006 / spec-0007 deliverable. Spec 0005's stitched map has no exits.
- **Re-roll on bad seeds.** Validator throws; the four hand-authored chunks are guaranteed compatible so this never fires in practice. Re-roll logic lands when the chunk library is large enough for incompatibilities to be possible (spec 0006).
- **Day 2 / handcrafted maps.** Day 2 territory.
- **Procgen of enemies, items, character traits.** Items/traits are §13 Day 5; enemies stay static.
- **Runtime UI changes** (no scene update; no HUD addition; no panel addition).
- **A `quality-reviewer` pass** (separate workflow step).

## Inputs

- `src/data/chunks/*.json` — four chunk definitions.
- `RunState.seed` — already carried since spec 0002. Procgen consumes it via `createRng(seed)` when called.
- No user input changes (this spec ships no UI surface).

## Outputs / Effects

- **No mutation of `RunState`.** Procgen is a pure compute layer. The scene doesn't call it in spec 0005.
- New module exports: `createRng`, `loadChunks`, `getChunksOfKind`, `generateMap`, `isFullyConnected`.
- Tile union grows to admit `DoorTile` (chunk authoring vocabulary; not visible in stitched maps).

## Interaction (desktop + mobile, same model)

N/A — spec 0005 ships no UI. Per ADR-0008, the next spec (0006) inherits all interaction concerns when procgen lands in the scene.

## Acceptance criteria

### State + logic

- [ ] **[unit]** `createRng(seed)` returns an object with the documented methods. Two calls with the same seed produce identical sequences for the first 100 calls of `next()`.
- [ ] **[unit]** `intInRange(min, maxExclusive)` returns a value in `[min, maxExclusive)` for every call (sample 100 calls).
- [ ] **[unit]** `pickOne([])` throws (or returns a tagged error — pick one and stick with it); `pickOne([single])` returns the single element.
- [ ] **[unit]** `roll01(0)` always returns `false`; `roll01(1)` always returns `true`; `roll01(0.5)` returns a mix over many calls (loose statistical assertion — e.g. between 30% and 70% true over 1000 calls is fine for a sanity check).
- [ ] **[unit]** Different seeds produce different first values (or, more robustly, different sequences over 100 calls — sample two seeds, diff).
- [ ] **[unit]** `loadChunks()` returns 4 chunks: 2 entrance, 2 back. Each is a valid `Chunk` (width/height match `tiles` shape; tile strings are `wall`, `floor`, or `door`).
- [ ] **[unit]** `getChunksOfKind("entrance")` returns 2 chunks; `getChunksOfKind("back")` returns 2 chunks.
- [ ] **[unit]** `Tile` union admits `DoorTile`; tagged-union exhaustiveness still holds in callers that switch on `tile.kind`.
- [ ] **[unit]** `generateMap(createRng(1))` returns a `Day1Map` with `width === 5`, `height === 10`, valid `tiles` 2D array.
- [ ] **[unit]** `generateMap(createRng(1))` is deterministic — calling twice with `createRng(1)` returns structurally equal maps.
- [ ] **[unit]** Different seeds can produce different chunk pairs (sample seeds 1 and 2, diff the resulting maps).
- [ ] **[unit]** Door tiles in chunks become `floor` tiles in the stitched output (no `door` kind appears in the resulting `Day1Map.tiles`).
- [ ] **[unit]** Stitched map's `start` equals the entrance chunk's start position (entrance chunk is stitched at the top with no offset, so chunk-local coords are map-global coords).
- [ ] **[unit]** `isFullyConnected(map, map.start)` returns `true` for every output of `generateMap`.
- [ ] **[unit]** `isFullyConnected` returns `false` for a hand-crafted map with isolated floor regions.

### Discipline (greppable)

- [ ] **[unit]** `rg "Math\\.random" src/` returns no hits (ADR-0007 — finally enforced for real now that `rng.ts` exists).
- [ ] **[unit]** `rg "(mousedown|mouseup|mousemove|touchstart|touchmove|touchend)" src/` returns no hits.
- [ ] **[unit]** `rg "TILE_SIZE\\s*\\*" src/ | grep -v "systems/grid"` returns no hits.
- [ ] **[unit]** `rg "from \"vitest\"|from 'vitest'" src/` returns no hits.

### UI — desktop + iPhone

No UI changes in this spec. The live game continues to load the static `data/day1-static-map.json`. Manual play-test scenarios from spec 0004 still hold.

- [ ] **[manual desktop]** Existing combat scenarios from spec 0004 still work (smoke check — no regression).
- [ ] **[manual iPhone]** Same.

## Test plan

### Automated (red-green)

- `src/systems/rng.test.ts`:
  - "createRng with the same seed produces an identical sequence"
  - "intInRange returns a value in [min, maxExclusive) over many samples"
  - "pickOne returns an element of the input; throws on empty"
  - "roll01 honors p=0 and p=1; rough mid-range distribution"
  - "different seeds produce different sequences"
- `src/systems/chunk.test.ts`:
  - "loadChunks returns the four hand-authored entries with valid shapes"
  - "getChunksOfKind filters correctly"
  - "Tile union admits DoorTile"
- `src/systems/procgen.test.ts`:
  - "generateMap returns a 5×10 Day1Map"
  - "generateMap is deterministic given the same seed"
  - "different seeds can produce different maps"
  - "stitched map has no door tiles (doors become floor)"
  - "stitched map's start matches the chosen entrance chunk"
  - "isFullyConnected is true for every generated map"
  - "isFullyConnected is false for a hand-crafted disconnected map"

### Manual play-test (verify)

- **Scenario "no regression":** open the production preview URL on iPhone Safari portrait. Confirm the spec 0004 combat skeleton still works exactly as before — same map, alien at the same spot, attacks land, etc. This is a smoke check that spec 0005 didn't accidentally change runtime behavior.
- **Scenario "broken-build gate":** introduce a deliberate `bun run typecheck` error on a feature branch; confirm Workers Builds fails the Build step and no preview URL is published (ADR-0010).

## Open questions

_(empty — all five questions resolved 2026-04-27, defaults accepted: mulberry32 PRNG; 5×5 chunks; 2 chunks per map; `pickOne([])` throws; door represented as `kind: "door"` in chunk JSON, becomes `floor` in stitched output. Spec body carries the canonical values.)_

## Done means

`bun test` passes a new `rng.test.ts`, `chunk.test.ts`, and `procgen.test.ts` (15+ new tests across them). The repo has four chunk JSON files. `generateMap(createRng(seed))` produces a valid 5×10 map with deterministic output for any given seed and connected floor space — verifiable by any developer in the REPL or test runner. The live game on the production URL is unchanged (same combat skeleton experience as spec 0004 — confirmed via the no-regression smoke test). Spec 0006's task list now reads roughly: "expand chunks to 8, support variable sizes + multi-chunk stitching + multiple exits, replace `loadDay1Map` in `createRunState`, refactor any tests that depend on map shape, restore enemy spawn via spawn slots."
