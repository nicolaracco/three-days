# Spec 0006: Live procgen integration (2-chunk maps in `createRunState`)

**Status:** Draft
**Roadmap day:** GDD §13 Day 3 (procgen, second half — multi-chunk + connectors + full library defer to spec 0007+)
**Owner:** Nicola
**Related ADRs:** ADR-0004 (layered architecture), ADR-0005 (tile/pixel coordinates), ADR-0007 (seeded RNG), ADR-0008 (UI architecture), ADR-0009 (testing discipline)

## Goal

Procgen becomes visible. `createRunState` swaps `loadDay1Map()` for `generateMap(createRng(seed))`. The chunk library grows from 4 → 6 (3 entrance variants + 3 back variants, 9 unique combinations). The enemy moves to a procgen-aware random floor tile in the back chunk via the same RNG. Tests that currently assume the static map shape get refactored through a new `createRunStateFromMap({ seed, map })` helper that lets test code hand in a fixture map. The user opens the production URL on iPhone Safari portrait and sees a different small 5×10 map on each refresh — the first time procgen output is observable in the deployed game.

## Why this, why now

GDD §13 Day 3 is "procgen for Day 1." Spec 0005 landed the *machinery* (RNG + chunks + stitcher + validator) as invisible infrastructure. Spec 0006 makes it visible — the smallest meaningful step toward the GDD §3 pillar 2 deliverable (*procedural assembly, authored components*) actually being on screen. Multi-chunk stitching (5–7 chunks per GDD §8.3), variable chunk sizes, connector-based alignment, and the full 8-chunk library per GDD §8.2 stay deferred to spec 0007+ — those add real complexity and a visibly different chunk-format API, and bundling them into 0006 would push the spec past the size we've been keeping for clean review cycles.

§12 sub-bars touched: **§12.3 Visual coherence** lightly (the procgen 5×10 map is smaller than the 11×15 viewport area; centering keeps it visually intentional rather than lopsided). **§12.5 Onboarding** unchanged — the player still understands what to do; the visible procgen variation is a small addition the player just notices over multiple runs.

## Scope

### In scope

- **Two more chunks.** `src/data/chunks/entrance-room-c.json` and `back-room-c.json`, both 5×5, same door-position convention as the existing four (south door at col 2 for entrance, north door at col 2 for back). Different interior layouts so each combination produces a recognisable run. Chunk library grows 4 → 6; 3 × 3 = 9 unique combinations.
- **`createRunStateFromMap({ seed, map, enemies? }): RunState`** in `systems/run-state.ts`. New factory: takes an explicit `Day1Map` + optional `enemies`, returns a `RunState`. Used by tests and by `createRunState` (which now delegates).
- **`createRunState({ seed })` rewired.** Internally:
  1. `const rng = createRng(opts.seed);`
  2. `const map = generateMap(rng);`
  3. `const enemies = placeEnemiesOnMap(loadDay1Enemies(), map, rng);` (see below)
  4. `return createRunStateFromMap({ seed: opts.seed, map, enemies });`
- **`placeEnemiesOnMap(baseEnemies, map, rng)`** in `systems/enemy.ts` (or a dedicated `systems/spawn.ts` if it grows). For each base enemy: pick a random floor tile in the back chunk (rows ≥ `map.height / 2`) that is not `map.start` and not 4-adjacent to `map.start`, via `rng.pickOne(eligibleTiles)`. Returns enemies with updated positions; `currentHP`, `maxHP`, `weaponId`, `kind`, `id` are unchanged. Spec 0007 will replace this with proper spawn slots authored into chunk metadata.
- **Test refactor (the main lift).** Tests that currently call `createRunState({ seed })` and depend on the static map's layout (specific positions, enemy at (5,11), col + 2 reachable, etc.) refactor to call `createRunStateFromMap({ seed: 1, map: loadDay1Map(), enemies: loadDay1Enemies() })`. Approximate counts: run-state.test.ts (~10 cases), combat.test.ts (~10 cases), turn.test.ts (~13 cases). Tests that *don't* care about specific map shapes (e.g. createRunState seed determinism) keep using `createRunState`.
- **`day1-static-map.json` is preserved as a TEST fixture only.** `loadDay1Map()` stays in `systems/map.ts`. Runtime no longer calls it. A code comment on `loadDay1Map` notes its new role: "Test fixture; runtime uses procgen via `generateMap`." Spec 0007 may delete it once enough chunks exist that fixture-style testing is no longer needed.
- **Scene centering for smaller maps.** `RunScene.create` computes `gridCfg.offset` from the actual map dimensions:
  ```ts
  const mapPxW = state.map.width * TILE_SIZE;
  const mapPxH = state.map.height * TILE_SIZE;
  const mapAreaPxH = WORKING_HEIGHT - HUD_HEIGHT - PANEL_HEIGHT; // 480
  const offsetX = Math.floor((WORKING_WIDTH - mapPxW) / 2);
  const offsetY = MAP_AREA_TOP + Math.floor((mapAreaPxH - mapPxH) / 2);
  ```
  The 5×10 procgen map renders centered in both axes within the 480 px map-area band. The 11×15 fixture map (used in tests, not at runtime) would still render at offset (4, 40) by the same math, matching its previous layout exactly.

### Out of scope

- **Multi-chunk (>2) per map.** The vertical-stack stitcher from spec 0005 stays; spec 0007 introduces multi-chunk + connectors.
- **Variable chunk dimensions.** All chunks remain 5×5 in spec 0006.
- **Connector-based stitching with `n/s/e/w` matching.** Spec 0007.
- **Multiple reachable exits per GDD §8.3.** Spec 0007 once chunk-graph has multiple terminals.
- **Full 8-chunk library per GDD §8.2** (living room, kitchen, bedroom, etc.). Spec 0007 grows the catalog and adds chunk-kind variety.
- **Spawn slots in chunk metadata.** Spec 0006's `placeEnemiesOnMap` is a runtime mitigation; spawn slots are spec 0007.
- **Re-roll on bad seeds.** With 6 hand-authored chunks all guaranteed compatible, the validator never trips. Re-roll lands when the chunk graph has incompatibility risks (spec 0007).
- **Run-history persistence** per ADR-0003. Each refresh is a new run; we don't yet record the seed that produced an interesting run.
- **A `quality-reviewer` pass** (separate workflow step).

## Inputs

- `src/data/chunks/*.json` — six chunk definitions (4 existing + 2 new).
- `src/data/balance.json`, `src/data/viewport.json` — unchanged.
- `RunState.seed` — already plumbed; now actually feeds procgen.

## Outputs / Effects

- **Live game changes** for the first time since spec 0005 landed:
  - `RunState.map` is now a procgen-produced 5×10 map (not the 11×15 static map).
  - `RunState.enemies[0].position` is randomized per seed within the back chunk.
- **Map area renders centered** in the 11×15 viewport band, with empty space around the smaller procgen map.
- All other gameplay (movement, combat, turn cycle, animations, HP bars, panel, HUD, orientation overlay, death overlay) continues to work — the scene reads from `state.map` and was already shape-agnostic.

## Interaction (desktop + mobile, same model)

Per ADR-0008. No new UI. The user notices:

- The map is smaller (5×10 instead of 11×15).
- The map is centered in the viewport area.
- Each refresh produces a different layout (one of 9 chunk combinations).
- The alien spawns somewhere in the bottom half, in a different position per seed.

All input handling (scene-level pointerdown + pixelToTile) is unchanged; the smaller map area and recomputed offset are absorbed by the existing GridConfig pattern.

## Acceptance criteria

### State + logic

- [ ] **[unit]** `loadChunks()` now returns 6 chunks (3 entrance + 3 back).
- [ ] **[unit]** `getChunksOfKind("entrance")` returns 3, `getChunksOfKind("back")` returns 3.
- [ ] **[unit]** `createRunStateFromMap({ seed, map, enemies })` returns a `RunState` with the supplied map + enemies, protagonist at `map.start`, AP/HP at full from `balance`, `activeTurn === "player"`, `turn === 1`, `seed === seed`.
- [ ] **[unit]** `createRunState({ seed: 1 })` produces a state whose `map` is `generateMap(createRng(1))` — assert structural equality.
- [ ] **[unit]** `createRunState({ seed })` is deterministic — same seed yields the same map and the same enemy positions.
- [ ] **[unit]** `placeEnemiesOnMap` places each enemy on a tile in the back chunk (row ≥ `map.height / 2`).
- [ ] **[unit]** `placeEnemiesOnMap` never places an enemy on `map.start` or 4-adjacent to it.
- [ ] **[unit]** `placeEnemiesOnMap` always places enemies on `floor` tiles (never wall).
- [ ] **[unit]** Different seeds can produce different enemy positions (sample 50 seeds; > 1 distinct position).

### Discipline (greppable)

- [ ] **[unit]** `rg "Math\\.random" src/` returns no hits.
- [ ] **[unit]** `rg "(mousedown|mouseup|mousemove|touchstart|touchmove|touchend)" src/` returns no hits.
- [ ] **[unit]** `rg "TILE_SIZE\\s*\\*" src/ | grep -v "systems/grid"` returns no hits.
- [ ] **[unit]** `rg "from \"vitest\"|from 'vitest'" src/` returns no hits.

### Test refactor

- [ ] **[unit]** `bun test` passes after refactoring run-state.test.ts, combat.test.ts, turn.test.ts to use `createRunStateFromMap` with the static map fixture.
- [ ] **[unit]** No test calls `createRunState` and then asserts a specific protagonist or enemy *position* (such tests now use `createRunStateFromMap` with the fixture map for deterministic shapes).
- [ ] **[unit]** `loadDay1Map()` and `loadDay1Enemies()` still pass their existing tests (unchanged).

### UI — desktop

- [ ] **[manual desktop]** `bun run dev` opens the scene. The map is 5×10, centered horizontally and vertically in the 480 px map-area band.
- [ ] **[manual desktop]** Refreshing the page produces a visibly different map shape across multiple refreshes (over say 10 refreshes, see at least 2–3 distinct layouts).
- [ ] **[manual desktop]** The enemy is visible in the bottom half of the map, placed on a floor tile, never on the protagonist's start tile.
- [ ] **[manual desktop]** All combat scenarios from spec 0004 still work — walk to the enemy, attack, take a hit, end turn, etc.

### UI — iPhone Safari portrait

- [ ] **[manual iPhone]** All [manual desktop] criteria above hold on iPhone Safari portrait via the production preview URL.
- [ ] **[manual iPhone]** The smaller map's centering looks intentional (not a layout bug) — the empty space around it doesn't draw attention.

### §12 sub-bars

- [ ] **[manual]** §12.3 visual coherence — placeholder visuals (rects, circle, text) still consistent across the map and the empty surround.

## Test plan

### Automated (red-green)

- `src/systems/chunk.test.ts` (extended):
  - "loadChunks returns 6 chunks (was 4)"
  - "3 entrance, 3 back"
- `src/systems/run-state.test.ts` (refactored + new):
  - Refactor existing position-dependent tests to `createRunStateFromMap`.
  - "createRunState produces a state whose map equals generateMap(createRng(seed))"
  - "createRunState is deterministic — same seed yields equal states (map + enemies)"
  - "createRunStateFromMap accepts an explicit map and enemies"
- `src/systems/enemy.test.ts` (extended):
  - "placeEnemiesOnMap places each enemy in the back half"
  - "placeEnemiesOnMap avoids start and start-adjacent tiles"
  - "placeEnemiesOnMap always lands on floor tiles"
  - "different seeds can produce different enemy positions"
- `src/systems/combat.test.ts` (refactored):
  - Adjust `withPlayerAdjacent` and similar helpers to operate on a known fixture map.
- `src/systems/turn.test.ts` (refactored):
  - Same — fixture map for shape-stable assertions.

### Manual play-test (verify)

- **Scenario "first procgen run":** open the production preview URL on iPhone Safari portrait. Confirm a 5×10 map appears centered in the viewport, with the protagonist near the top, an alien in the bottom half. Walk to the alien (might require 5–6 moves with the smaller map). Attack, take a hit, etc. — combat still works.
- **Scenario "variation":** refresh the page 10 times. Note the layout differences. Confirm you see at least 2 visibly distinct layouts (we have 9 possible combinations × randomized enemy position).
- **Scenario "no regression":** all spec 0004 acceptance criteria still pass at this smaller map size — death overlay, end-turn, hit flash, etc.
- **Scenario "broken-build gate":** introduce a deliberate `bun run typecheck` error on a feature branch; confirm Workers Builds fails and no preview URL is published (ADR-0010).

## Open questions

_(empty — both questions resolved 2026-04-27, defaults accepted: chunk library 4 → 6 for visible variety; enemy placement via RNG on back-half floor tiles avoiding start. Spec body carries the canonical values.)_

## Done means

A user opens `https://three-days.<account>.workers.dev/` on iPhone Safari portrait and sees a small 5×10 map centered in the viewport, with the protagonist near the top in one of three entrance-room layouts, the alien in the bottom half in one of three back-room layouts. Refreshing the page produces a different combination most of the time (9 possible × random enemy position). Movement, combat, end-turn, death overlay all work exactly as in spec 0004. `bun test` passes 130+ tests (was 107 in spec 0005; +9 enemy placement, +2 chunk library, +3 createRunState rewiring, plus the test refactor doesn't add new cases but moves them onto fixture maps). Spec 0007's task list now reads roughly: "multi-chunk stitcher with connector graph, ≥2 reachable exits validator, full GDD §8.2 chunk library, spawn slots in chunk metadata, larger maps that fill the 11×15 viewport, re-roll on bad seeds."
