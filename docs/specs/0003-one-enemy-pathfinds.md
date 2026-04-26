# Spec 0003: One enemy pathfinds

**Status:** Done
**Roadmap day:** GDD §13 Day 1 (closing the Day-1 deliverables; combat lands in spec 0004+ on Day 2)
**Owner:** Nicola
**Related ADRs:** ADR-0004 (layered architecture), ADR-0005 (tile/pixel coordinates), ADR-0007 (seeded RNG), ADR-0008 (UI architecture), ADR-0009 (testing discipline)

## Goal

A single melee alien spawns on the `Day1Map` at a fixed position. The player can tap it to inspect it (panel shows its kind, AP, position). The player cannot move onto its tile. After the player ends their turn, control passes to the enemy: it pathfinds toward the player via BFS over the grid, moves tile-by-tile up to its `maxAP` of 3, and stops adjacent to the player (no attack — combat is a future spec). Control returns to the player, AP refills, the targeting overlay re-projects from the new positions. A turn-order indicator on the HUD always shows whose turn it is.

## Why this, why now

GDD §13 Day 1 lists "One enemy pathfinds" as the last Day-1 deliverable. The substrate (RunState, grid, movement) shipped in spec 0002; this spec exercises the turn-cycle structure and the BFS pathfinding API that combat (Day 2 / spec 0004+) will rely on. Pathfinding without combat is the smallest meaningful slice — it lets the turn cycle, enemy AI loop, and player-vs-enemy occupancy rules be designed and tested in isolation, before combat math piles onto the same scene.

§12 sub-bars touched: **§12.2 information design** (enemy is always visible; inspection panel reveals its details on tap; no hover dependency). §12.1 combat feel is **not yet on the line** — combat math doesn't exist until spec 0004.

## Scope

### In scope

- **Enemy data type.** `systems/enemy.ts` exports `Enemy` (`{ id: string; kind: "melee" | "ranged"; position: TilePos; currentAP: number; maxAP: number }`). Only `kind: "melee"` is instantiated in this spec; the `"ranged"` arm is reserved so future specs don't reshape the union.
- **Static enemy spawn data.** `src/data/day1-static-enemies.json`: an array of one enemy with `kind: "melee"`, a fixed spawn `TilePos`, and `maxAP: 3` (per GDD §7.1). Loaded by `enemy.ts`.
- **`RunState` extension.** Add `enemies: Enemy[]` and `activeTurn: "player" | "enemy"` fields. `createRunState` initializes `enemies` from `data/day1-static-enemies.json` and `activeTurn: "player"`.
- **BFS pathfinding.** `systems/pathfind.ts` exports `bfs(from: TilePos, to: TilePos, map: Day1Map, blocked: TilePos[]): TilePos[] | null`. Returns the shortest path from `from` to `to` (inclusive of both endpoints) traversing 4-connected tiles, stepping over `floor` only, avoiding `blocked` tiles. Returns `null` when no path exists. The all-floor map of spec 0002+0003 makes BFS trivially correct; the API is shaped right for walls (spec 0005+) and multiple enemies (spec 0004+).
- **Enemy turn execution.** `systems/turn.ts` exports `runEnemyTurn(state: RunState): RunState`. Iterates over enemies; for each, runs BFS toward the protagonist's tile (with the enemy's own tile excluded from `blocked` so the BFS starts), then walks the path one tile at a time, decrementing `currentAP` per step, stopping when (a) AP exhausted, (b) the next step would land on the protagonist (so the enemy stops one tile away), or (c) no path exists. Returns the new state with each enemy's `position` and `currentAP` updated.
- **Turn cycle.** Replace `endTurn` from spec 0002 with a turn-cycle reducer that:
  1. On player → enemy transition: sets `activeTurn = "enemy"`, refills each enemy's `currentAP` to `maxAP`, returns the state for the scene to animate the enemy turn.
  2. On enemy → player transition (after `runEnemyTurn` finishes): sets `activeTurn = "player"`, refills the protagonist's `currentAP` to `maxAP`, increments `state.turn`.
- **Player movement honors enemy occupancy.** `systems/movement.ts` extends `reachableTiles` to accept a `blocked: TilePos[]` parameter and exclude those tiles. `apCostToReach` returns `Infinity` for any tile in `blocked`. Adjacent tiles to enemies remain reachable; the enemy's own tile is not.
- **`RunScene` updates.**
  - Renders enemies (placeholder: filled square or distinct-color circle, distinguishable from the protagonist; e.g., red `#e57373`).
  - Tapping an enemy moves selection to it; panel shows enemy details (kind, position, AP). No staging — enemies are inspectable, not movable-to.
  - Tapping a non-protagonist non-enemy tile keeps the spec-0002 behavior.
  - Targeting overlay excludes enemy tiles (player can't move onto them).
  - HUD adds a turn-order indicator (placeholder text: "Your turn" / "Enemy turn") above the End Turn button or somewhere similarly visible.
  - End Turn button is disabled (greyed + non-clickable) during enemy turn.
  - During enemy turn, the scene plays through `runEnemyTurn` step-by-step: each enemy step has a brief visible delay (~200 ms) so the player sees the move; after all enemies have finished, the cycle returns to the player.
- **Tests** (red-green-verify per ADR-0009):
  - `pathfind.test.ts` — BFS happy path; BFS through `blocked`; BFS returns null on isolated target.
  - `enemy.test.ts` — `Enemy` shape; `loadDay1Enemies()` returns one melee enemy at the configured position.
  - `turn.test.ts` — `runEnemyTurn` moves the enemy toward the player up to AP; stops adjacent; doesn't enter player tile.
  - `movement.test.ts` (extended) — `reachableTiles` excludes blocked tiles; `apCostToReach` returns Infinity for blocked.
  - `run-state.test.ts` (extended) — `createRunState` includes the enemy and `activeTurn === "player"`; turn-cycle transitions update the active turn and refill AP correctly.

### Out of scope

- Combat: player attack, enemy attack, HP, damage, hit chance, weapons, items. Spec 0004 (Day 2 lead).
- §12.1 combat feel: timings, damage flash, hurt frames, SFX. Spec 0004+.
- Multiple enemies (one is enough to exercise the turn cycle).
- Ranged enemies (the `"ranged"` arm of the `Enemy` union is reserved but not instantiated).
- Enemy death / despawn (no combat = no death).
- A\* pathfinding (BFS is sufficient and faster to implement; A\* lands when terrain costs vary or perf demands it).
- Line-of-sight / fog of war (not needed until ranged enemies + combat).
- Audio cue when the enemy moves (audio is its own §12.4 spec; deferred).
- Animations / tweens for enemy movement beyond the per-step delay (instant-teleport-with-delay is sufficient; tween polish is a §12.1 concern).
- Threat-type glyph on the enemy sprite (per ADR-0008's IA model). With one enemy of one kind, the inspection panel carries the threat info; the dedicated glyph icon lands when the placeholder atlas does (per ADR-0006 follow-up open question).
- Save / persistence (ADR-0003 unchanged).
- A `quality-reviewer` pass on the diff (separate workflow step).

## Inputs

- `src/data/day1-static-enemies.json` — array of one enemy with kind, spawn `TilePos`, maxAP.
- `src/data/balance.json` — adds `ENEMY_MAX_AP = 3` (per GDD §7.1). Existing `MAX_AP` stays as the protagonist's maxAP.
- `src/data/day1-static-map.json` — unchanged from spec 0002.
- User input: pointer events on `RunScene` (scene-level pointerdown unchanged from 0002).

## Outputs / Effects

- Mutates `RunState.enemies[i].position` and `.currentAP` on enemy turn.
- Mutates `RunState.activeTurn` on turn transitions.
- Mutates `RunState.turn` on the enemy → player transition (one full cycle = one turn).
- Refills protagonist `currentAP` on enemy → player transition.
- Refills each enemy's `currentAP` on player → enemy transition.
- Emits `event:turn-changed` (payload: `{ activeTurn: "player" | "enemy"; turn: number }`) on every transition.
- Emits `event:enemy-moved` (payload: `{ enemyId: string; from: TilePos; to: TilePos }`) for each step the enemy takes.
- Re-renders the targeting overlay after every commit (player), every enemy step, and every turn transition.

All events use Phaser's built-in `EventEmitter` (ADR-0002).

## Interaction (desktop + mobile, same model)

Per ADR-0008, no hover dependency.

- **Always-visible glyphs.** Protagonist (unchanged). Enemy sprite (new). AP-cost labels on every reachable tile (unchanged; now excludes enemy tiles). Staged-target halo (unchanged). Turn-order indicator on the HUD (new).
- **Inspection panel.** Tapping the enemy moves selection to it; panel shows: name (placeholder `"Melee alien"`), kind, position, AP/maxAP. Tapping the protagonist or a tile behaves as in spec 0002. Confirm button still appears only when a move is staged.
- **Targeting projection.** Same as spec 0002, but the enemy's tile is excluded from the reachable set. Player can move *adjacent* to the enemy, just not onto it.
- **Confirm flow.** Unchanged from spec 0002.
- **Turn flow.** During the enemy turn: input is locked (the End Turn button is disabled visually; map tile taps still update selection but do not stage; enemy sprite animates step-by-step at ~200 ms intervals). When the enemy turn finishes, the lock releases and "Your turn" returns.
- **Hit areas.** Tile interaction unchanged (scene-level pointerdown + pixelToTile). Buttons keep their own ≥ 44×44 hit areas.

## Acceptance criteria

### State + logic

- [ ] **[unit]** `RunState` includes `enemies: Enemy[]` and `activeTurn: "player" | "enemy"`. `createRunState` returns `activeTurn: "player"` and `enemies` populated from `data/day1-static-enemies.json`.
- [ ] **[unit]** `Enemy` is a tagged union over `kind: "melee" | "ranged"`; only `melee` is instantiated in the static spawn data.
- [ ] **[unit]** `bfs(from, to, map, [])` returns the shortest 4-connected path on an all-floor map; length equals Manhattan distance + 1 (path includes both endpoints).
- [ ] **[unit]** `bfs(from, to, map, [intermediateBlock])` finds an alternate path when one exists; returns `null` when no path exists (e.g., the target is fully encircled by blocked tiles).
- [ ] **[unit]** `runEnemyTurn(state)` moves each enemy along its BFS path toward the protagonist, decrementing AP per step; the enemy stops one tile away from the protagonist (BFS path length ≥ 2 means at least one step taken; length === 1 means already adjacent and no step is taken).
- [ ] **[unit]** `runEnemyTurn` never lands an enemy on the protagonist's tile.
- [ ] **[unit]** `runEnemyTurn` stops at AP = 0 even if the enemy is not yet adjacent.
- [ ] **[unit]** Turn-cycle transitions: player→enemy refills enemy AP and sets `activeTurn = "enemy"`. Enemy→player refills protagonist AP, increments `state.turn`, sets `activeTurn = "player"`.
- [ ] **[unit]** `reachableTiles(from, ap, map, blocked)` excludes any tile in `blocked` from the result. `apCostToReach(from, blockedTile, map, [blockedTile])` returns `Infinity`.

### Discipline (greppable)

- [ ] **[unit]** `rg "Math\\.random" src/` returns no hits (ADR-0007).
- [ ] **[unit]** `rg "(mousedown|mouseup|mousemove|touchstart|touchmove|touchend)" src/` returns no hits (ADR-0008).
- [ ] **[unit]** `rg "TILE_SIZE\\s*\\*" src/ | grep -v "systems/grid"` returns no hits (ADR-0005).
- [ ] **[unit]** `rg "from \"vitest\"|from 'vitest'" src/` returns no hits (ADR-0009).

### UI — desktop

- [ ] **[manual desktop]** On scene start, the enemy sprite is visible at its spawn tile, distinct color from the protagonist; the turn-order indicator on the HUD reads "Your turn".
- [ ] **[manual desktop]** Tapping the enemy moves selection to it; the inspection panel shows kind, position, AP/maxAP.
- [ ] **[manual desktop]** The enemy's tile is *not* highlighted as reachable; tapping it changes selection but never stages a move.
- [ ] **[manual desktop]** Tiles adjacent to the enemy *are* highlighted as reachable (the enemy is the only blocker; surrounding tiles are valid moves).
- [ ] **[manual desktop]** Pressing End Turn disables the End Turn button; turn-order indicator changes to "Enemy turn".
- [ ] **[manual desktop]** The enemy moves step-by-step toward the protagonist with a visible ~200 ms delay between steps. Each step is observable.
- [ ] **[manual desktop]** The enemy stops adjacent to the protagonist (or when its AP hits 0); it never lands on the protagonist's tile.
- [ ] **[manual desktop]** When the enemy turn finishes, the turn-order indicator returns to "Your turn"; protagonist AP refills to 4; targeting overlay re-projects from the new positions.

### UI — iPhone Safari portrait

- [ ] **[manual iPhone]** All [manual desktop] criteria above hold on iPhone Safari portrait via the production preview URL.
- [ ] **[manual iPhone]** Enemy sprite is clearly distinguishable from the protagonist at portrait resolution.
- [ ] **[manual iPhone]** Turn-order indicator is readable.
- [ ] **[manual iPhone]** During enemy turn, taps on the map update selection (panel changes) but never trigger a stage. The lockout is felt, not jarring.

### §12 sub-bars

- [ ] **[manual]** §12.2 information design — enemy always visible; tapping reveals its details in the panel; no hover relied on. Tapping anywhere updates the panel within 100 ms.

## Test plan

### Automated (red-green)

- `src/systems/pathfind.test.ts`:
  - "BFS finds the shortest path on an all-floor map (length = Manhattan + 1)"
  - "BFS routes around a blocked tile when an alternate path exists"
  - "BFS returns null when the target is fully encircled by blocked tiles"
  - "BFS returns the trivial path [from] when from === to"
- `src/systems/enemy.test.ts`:
  - "loadDay1Enemies returns one melee enemy at the configured spawn"
  - "Enemy union admits both melee and ranged kinds"
- `src/systems/turn.test.ts`:
  - "runEnemyTurn moves the enemy along its BFS path toward the protagonist"
  - "runEnemyTurn stops one tile away from the protagonist"
  - "runEnemyTurn stops at AP = 0 even when not yet adjacent"
  - "runEnemyTurn is a no-op when the enemy is already adjacent (path length 1)"
- `src/systems/movement.test.ts` (extended):
  - "reachableTiles with a blocked tile excludes it from the result"
  - "apCostToReach to a blocked tile returns Infinity"
- `src/systems/run-state.test.ts` (extended):
  - "createRunState includes enemies and activeTurn === 'player'"
  - "advanceTurn (or whatever the cycle reducer is named) transitions player → enemy and refills enemy AP"
  - "advanceTurn transitions enemy → player, refills protagonist AP, increments turn"

### Manual play-test (verify)

- **Scenario "first contact":** open the production URL on iPhone Safari portrait. Tap the enemy. Panel updates. Tap the protagonist. Panel resets. Move the protagonist toward the enemy along reachable tiles; confirm the enemy's tile is not in the reachable set, but the surrounding tiles are.
- **Scenario "enemy turn":** end turn. Indicator changes. Enemy moves step-by-step (visibly, ~200 ms per step). Stops adjacent. Indicator changes back. AP refills. Targeting re-projects.
- **Scenario "stalemate at adjacency":** start a turn already adjacent to the enemy. End turn. Enemy makes no move (path length 1). Cycle returns immediately.
- **Scenario "AP exhaustion":** position the protagonist 5+ tiles away from the enemy. End turn. Enemy moves 3 tiles (its maxAP), still not adjacent, indicator returns. Verify enemy's `currentAP === 0` displayed in panel when tapped.

§12.2 wording: "the player always sees, without searching" — verifier walks through panel + always-visible enemy sprite + reachable-tile labels. Nothing hidden.

## Open questions

_(empty — all six questions resolved 2026-04-26, defaults accepted: enemy spawn at (5,11); 200 ms per-step delay; warm-red `#e57373` circle smaller than protagonist; turn-order indicator on top HUD as plain text; threat-type glyph deferred until multi-kind or atlas; `endTurn` → `advanceTurn` rename. Spec body carries the canonical values.)_

## Done means

A user opens `https://three-days.<account>.workers.dev/` on iPhone Safari portrait. Sees the protagonist and one melee alien (red circle) on the map. Taps the alien — panel updates with kind, position, AP. Taps a tile adjacent to the alien — halo, Confirm. Taps Confirm — protagonist moves there. Taps End Turn. Indicator changes to "Enemy turn"; the alien steps toward the protagonist over ~600 ms (3 visible steps). The alien stops adjacent (doesn't land on the protagonist). Indicator returns to "Your turn"; protagonist AP refills; targeting re-projects. `bun test` passes the new `pathfind.test.ts`, `enemy.test.ts`, `turn.test.ts`, plus the extensions to `movement.test.ts` and `run-state.test.ts`. The Day-1 deliverables in GDD §13 are all closed; spec 0004 (combat skeleton + feel — the Day-2 work) becomes the natural next move.
