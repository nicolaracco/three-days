# Spec 0002: Click-to-move with AP on a static map

**Status:** Approved
**Roadmap day:** GDD §13 Day 1 (interactive deliverable; substrate landed in spec 0001)
**Owner:** Nicola
**Related ADRs:** ADR-0004 (layered architecture), ADR-0005 (tile/pixel coordinates), ADR-0007 (seeded RNG), ADR-0008 (UI architecture), ADR-0009 (testing discipline)

## Goal

The protagonist appears on a small static `Day1Map`. Reachable tiles within the protagonist's current AP are highlighted, each labelled with its AP cost. Tapping a reachable tile stages a move; tapping the staged tile (or a confirm button) commits it; the protagonist moves; AP decrements. An "End Turn" button refills AP. The first concrete `RunState` lands in `systems/`. ADR-0008's IA model (sticky inspection panel, simultaneous cost projection on every valid target, no hover dependency) is exercised end-to-end on real game state. No enemies, no combat, no procgen.

## Why this, why now

GDD §13 Day 1 lists "Click-to-move with AP works on a static map" as a Day-1 deliverable. The substrate landed in spec 0001; this spec turns the hello-world into a playable thing. ADR-0008 and ADR-0009 stay theoretical until a real interaction lands — without `RunState`, `systems/grid.ts`, the inspection panel, and the action-targeting projection, every subsequent spec has nothing to plug into. Spec 0003 (one enemy pathfinds) directly depends on the systems this spec creates.

§12 sub-bars touched: **§12.2 Information design** (the IA model is on the line for the first time — AP, max AP visible always; every reachable tile labelled simultaneously). **§12.3 Visual coherence**, lightly (placeholder visuals must not look broken).

## Scope

### In scope

- **Static map data.** `src/data/day1-static-map.json`: 11 columns × 15 rows of tiles, all `"floor"` for now. A `start` field naming the protagonist's spawn `TilePos`. Schema enforced by a TS type imported into `systems/`.
- **`Tile` tagged union.** `type Tile = FloorTile | WallTile`. Only `FloorTile` is used in this spec; `WallTile` is reserved for the type so future specs don't reshape the union.
- **Balance constants.** `src/data/balance.json`: `MAX_AP = 4`, `MOVE_COST_PER_TILE = 1`. Both per GDD §7.1.
- **`RunState` (minimum viable).** `systems/run-state.ts` exports a `RunState` type and a `createRunState({ seed }: { seed: number }): RunState` factory. Fields: `protagonist: { position: TilePos; currentAP: number; maxAP: number }`, `map: Day1Map`, `seed: number`, `turn: number`. No history list, no enemy state, no inventory yet.
- **Coordinate system (ADR-0005).** `systems/grid.ts` exports `TilePos`, `PixelPos`, `tileToPixel`, `pixelToTile`, plus a `tilesInRange(from, range, map): TilePos[]` helper. Tile size lives in `data/viewport.json` as `TILE_SIZE = 32` (matches GDD §10.1's 32×32 art). No inline `* TILE_SIZE` math anywhere except `systems/grid.ts`.
- **Movement logic.** `systems/movement.ts` exports:
  - `apCostToReach(from: TilePos, to: TilePos, map: Day1Map): number` — Manhattan distance × `MOVE_COST_PER_TILE` for now. Returns `Infinity` for unreachable targets (e.g. blocked by walls when those exist). Pathfinding is deliberately trivial; A\* lands when walls / blocking enemies do.
  - `reachableTiles(from: TilePos, ap: number, map: Day1Map): TilePos[]` — every tile whose `apCostToReach` is `≤ ap`.
  - `commitMove(state: RunState, target: TilePos): RunState` — pure reducer. Asserts the target is reachable; throws (or returns a tagged-error result; pick one and stick with it) on insufficient AP.
- **`RunScene` (replaces `MenuScene` as the active scene).** Renders:
  - The static map (placeholder: rectangles, color per tile type — floor `#222`, walls `#000` though no walls in this spec).
  - The protagonist (placeholder: filled circle, distinct color, on its `position`).
  - **Action-targeting projection** (ADR-0008): every reachable tile gets a semi-transparent overlay and a centered AP-cost label. *All reachable tiles, simultaneously*. No hover. Re-projected after every move and turn change.
  - **Top HUD bar** (40 px): turn number, "End Turn" button (≥ 44×44 logical px hit area).
  - **Sticky inspection panel** (bottom 120 px). Default selection is the protagonist; panel shows name (placeholder `"Protagonist"`), `currentAP` / `maxAP`, position. Tapping any tile (reachable or not) moves selection to that tile; panel updates with that tile's info (`(col, row)`, walkability). Tapping the protagonist resets selection back to the protagonist.
  - The map area is the middle band (480 px tall, centered horizontally — 11 cols × 32 px = 352 px, with 4 px margin each side).
- **Confirm / cancel flow.** First tap on a reachable tile stages the move (shows a target reticle/halo). Second tap on the same tile commits OR a dedicated "Confirm" button in the bottom panel commits. Tap on a different reachable tile re-stages. Tap outside the map or on the protagonist cancels.
- **Pointer events only (ADR-0008).** All input goes through `pointerdown`. `rg "(mousedown|mouseup|mousemove|touchstart|touchmove|touchend)" src/` returns nothing.
- **Tile interaction via scene-level pointer handler.** A single `scene.input.on("pointerdown", ...)` handler on `RunScene` converts pointer position to `TilePos` via `pixelToTile` (`systems/grid.ts`), then dispatches based on what's at that tile. Tile rectangles are dumb visuals — no `setInteractive` per tile. The entire map area is implicitly tappable: every tap lands in exactly one tile (no dead zones, no overlapping hit areas), and the 32×32 visual tile is irrelevant to hit testing because the grid math is exact. This avoids creating ~165 interactive game objects and keeps Phaser coupling thin (ADR-0004).
- **Buttons keep their own hit areas (≥ 44×44 logical px).** "End Turn" and "Confirm" are irregular UI elements (not part of the tile grid), so they use `setInteractive` with a Rectangle hit area sized to ≥ 44×44 even if the visual is smaller.
- **Orientation-lock overlay.** Phaser overlay that blocks input and shows "Rotate to portrait" text when the device is in landscape. Disappears on return to portrait. Only fires on touch devices (`scene.scale.isPortrait` check).
- **Tests.** Per ADR-0009 red-green-verify:
  - `systems/grid.test.ts` — `tileToPixel`/`pixelToTile` round-trip; `tilesInRange` correctness.
  - `systems/movement.test.ts` — `apCostToReach`, `reachableTiles`, edge cases (start tile, full-AP range).
  - `systems/run-state.test.ts` — `createRunState`, `commitMove` happy path + insufficient-AP error.
- **Visual placeholders only.** No `placeholder.png` atlas yet; the rendering uses Phaser graphics primitives (`scene.add.rectangle`, `scene.add.circle`, `scene.add.text`). The atlas (per ADR-0006 follow-up open question) lands when art density actually requires it — likely once enemies or items appear.

### Out of scope

- Enemies / pathfinding / line of sight — spec 0003.
- Combat, weapons, items, traits, character generation.
- A\* or Dijkstra pathfinding (Manhattan is fine until walls appear).
- Multiple maps, Day 2, exits, doors.
- Save / persistence (ADR-0003: no mid-run save anyway).
- Audio.
- Real placeholder atlas (deferred per ADR-0006 follow-up — atlas lands when needed).
- A `quality-reviewer` pass on the diff (separate workflow step).
- Run-end / death / respawn.
- Animations beyond an instant teleport on commit (a tween from start to end is a polish item; not blocking).

## Inputs

- `src/data/day1-static-map.json` — map shape + start position.
- `src/data/balance.json` — `MAX_AP`, `MOVE_COST_PER_TILE`.
- `src/data/viewport.json` — `WORKING_WIDTH`, `WORKING_HEIGHT`, `TILE_SIZE`.
- User input: `pointerdown` events on `RunScene`. Pointer position converted to `TilePos` via `pixelToTile`.

## Outputs / Effects

- Mutates `RunState.protagonist.position` and `RunState.protagonist.currentAP` on `commitMove`.
- Increments `RunState.turn` on `End Turn` and refills `currentAP` to `maxAP`.
- Emits `event:selection-changed` (payload: `{ kind: "protagonist" | "tile", target: TilePos | null }`) when selection moves. The inspection panel listens.
- Emits `event:move-staged` (payload: `{ from: TilePos; to: TilePos; cost: number }`) when a target is staged; UI listens to draw the staged-target halo.
- Emits `event:move-committed` (payload: `{ from: TilePos; to: TilePos; cost: number }`) on commit.
- Emits `event:turn-ended` (payload: `{ turn: number }`) on End Turn.
- Re-renders the action-targeting overlay after every move-commit and every turn-change.

All events use Phaser's built-in `EventEmitter` (ADR-0002).

## Interaction (desktop + mobile, same model)

Per ADR-0008 — selection-driven, no hover dependency, identical desktop and mobile.

- **Always-visible glyphs.** Protagonist sprite. AP-cost labels on every reachable tile. Reachable-tile semi-transparent overlay. Staged-target halo.
- **Inspection panel (bottom 120 px).** Always shows current selection's full details. For protagonist: name, AP/maxAP, position. For tile: `(col, row)`, walkability ("floor" / "wall"), reachable-from-protagonist y/n. Confirm button appears in the panel only when a move is staged (otherwise hidden).
- **Targeting (move mode is the default — only action this spec).** Every reachable tile shows its AP cost simultaneously. No move button needed in this spec because move is the only action; specs that add attack/reload/item-use will introduce explicit mode buttons.
- **Confirm flow.** First tap on a reachable tile = stage (halo + Confirm button visible). Second tap on same tile, or tap on Confirm button = commit. Tap on a different reachable tile = restage. Tap on a non-reachable tile = selection moves to that tile, staged move clears. Tap on protagonist = selection resets, staged move clears.
- **Hit areas.** Tile hits are resolved by a scene-level `pointerdown` handler that calls `pixelToTile(pointer)` — every pixel in the map area maps to exactly one tile, so the 32×32 visual size is irrelevant to hit-testing accuracy. End Turn and Confirm buttons (irregular UI, not the tile grid) use per-button `setInteractive` Rectangle hit areas ≥ 44×44 logical px.

## Acceptance criteria

Mark each as **[unit]**, **[manual desktop]**, **[manual iPhone]**, or a combination.

### State + logic

- [ ] **[unit]** `createRunState({ seed: 12345 })` returns a `RunState` with the protagonist at the map's `start` position, `currentAP === 4`, `maxAP === 4`, `seed === 12345`, `turn === 1`.
- [ ] **[unit]** `Day1Map` loaded from `data/day1-static-map.json` matches the declared shape (11×15, all floor for this spec) and has a valid `start` position within bounds.
- [ ] **[unit]** `data/balance.json` defines `MAX_AP = 4` and `MOVE_COST_PER_TILE = 1`. No magic numbers in `systems/` for these.
- [ ] **[unit]** `apCostToReach(from, to, map)` returns Manhattan distance × 1 for reachable targets; the start tile costs 0; an off-map target returns `Infinity`.
- [ ] **[unit]** `reachableTiles(from, 4, map)` returns exactly the tiles whose Manhattan distance from `from` is ≤ 4 (clipped to map bounds), and includes the start tile itself.
- [ ] **[unit]** `commitMove(state, validTarget)` returns a new `RunState` (immutability or sufficient defensive copying — pick one) with the protagonist at the target and `currentAP -= cost`.
- [ ] **[unit]** `commitMove(state, unreachableTarget)` throws (or returns a tagged-error result; consistent with the chosen style) and does not mutate state.
- [ ] **[unit]** `tileToPixel(t).x === t.col * TILE_SIZE`-equivalent is centralized in `systems/grid.ts`; no other file performs this math.

### Discipline (greppable)

- [ ] **[unit]** `rg "Math\\.random" src/` returns no hits (ADR-0007).
- [ ] **[unit]** `rg "(mousedown|mouseup|mousemove|touchstart|touchmove|touchend)" src/` returns no hits (ADR-0008).
- [ ] **[unit]** `rg "TILE_SIZE\\s*\\*" src/ | grep -v "systems/grid"` returns no hits (ADR-0005).
- [ ] **[unit]** `rg "from \"vitest\"|from 'vitest'" src/` returns no hits (ADR-0009).

### UI — desktop

- [ ] **[manual desktop]** `bun run dev` opens `RunScene`. Protagonist visible at the start tile; map rendered; HUD top bar with turn = 1; bottom inspection panel showing protagonist's AP 4/4 and position.
- [ ] **[manual desktop]** Every tile within Manhattan distance 4 of the protagonist shows a translucent overlay and an AP-cost label, simultaneously, on scene start.
- [ ] **[manual desktop]** Clicking a reachable tile shows the staged-target halo; the Confirm button becomes visible in the panel.
- [ ] **[manual desktop]** Clicking the staged tile a second time commits the move; protagonist moves there; AP decrements by the cost; targeting overlay re-projects from the new position.
- [ ] **[manual desktop]** Clicking the Confirm button commits the staged move (alternative path).
- [ ] **[manual desktop]** Clicking a different reachable tile re-stages.
- [ ] **[manual desktop]** Clicking a non-reachable tile updates the panel with that tile's info; staged move clears (no commit).
- [ ] **[manual desktop]** Clicking the protagonist resets selection to the protagonist; staged move clears.
- [ ] **[manual desktop]** When AP = 0, no tiles are highlighted; the inspection panel still shows AP 0/4. End Turn button is the only path forward.
- [ ] **[manual desktop]** Pressing End Turn refills AP to 4, increments turn counter; targeting overlay re-projects.

### UI — iPhone Safari portrait

- [ ] **[manual iPhone]** All [manual desktop] criteria above hold on iPhone Safari portrait via the production preview URL (`three-days.<account>.workers.dev`).
- [ ] **[manual iPhone]** Tile taps register reliably with a thumb. The whole map area is tappable (scene-level pointerdown + `pixelToTile`), so a tap anywhere on the map snaps cleanly to its enclosing tile. No accidental commits from sloppy taps.
- [ ] **[manual iPhone]** AP-cost labels on reachable tiles are readable at the working portrait resolution (font ≥ 14 logical px).
- [ ] **[manual iPhone]** Inspection panel stays bottom-anchored; thumb-reachable.
- [ ] **[manual iPhone]** Rotating the device to landscape shows the orientation-lock overlay and pauses input. Rotating back to portrait clears the overlay; scene resumes.

### §12 sub-bars

- [ ] **[manual]** §12.2 information design — AP, max AP, turn number always visible. Tapping any tile or the protagonist updates the inspection panel within 100 ms (no perceived lag). Every reachable tile's AP cost is visible without searching.
- [ ] **[manual]** §12.3 visual coherence — placeholder visuals (rects, circle, text) do not look broken; consistent palette across map, protagonist, UI.

## Test plan

### Automated (red-green)

- `src/systems/grid.test.ts`:
  - "tileToPixel and pixelToTile round-trip"
  - "tilesInRange (range = 0) returns the start tile only"
  - "tilesInRange (range = 4) returns the expected diamond, clipped to map bounds"
- `src/systems/movement.test.ts`:
  - "apCostToReach returns 0 for the start tile"
  - "apCostToReach returns Manhattan distance × 1"
  - "apCostToReach returns Infinity for off-map targets"
  - "reachableTiles within 4 AP returns the diamond"
  - "reachableTiles within 0 AP returns only the start tile"
- `src/systems/run-state.test.ts`:
  - "createRunState seeds correctly and starts at the map's start position"
  - "commitMove on a valid target updates position and AP"
  - "commitMove on an unreachable target rejects (throws or tagged error) and leaves state unchanged"

Each test maps to one or more `[unit]` criteria above; the implementer's report cites both.

### Manual play-test (verify)

- **Scenario "first move":** open the production URL on iPhone Safari portrait. Tap a reachable tile. Halo appears + Confirm button. Tap the same tile. Protagonist moves. AP decrements correctly.
- **Scenario "exhaust AP":** make moves until `currentAP === 0`. Confirm no further tiles are highlighted. Inspection panel still legible. Tap End Turn. AP refills to 4; turn counter increments; targeting re-projects.
- **Scenario "selection vs move":** tap a non-reachable tile (e.g., across the map). Panel updates with that tile's info; no halo; no commit. Tap protagonist → selection resets. Tap reachable tile → halo. Tap elsewhere → halo clears.
- **Scenario "orientation lock":** rotate iPhone to landscape mid-game. Overlay appears, scene pauses. Rotate back to portrait. Overlay disappears. State preserved.
- **Scenario "broken-build gate":** introduce a deliberate `bun run typecheck` error on a feature branch; confirm Workers Builds fails the Build step and no preview URL is published (ADR-0010).

§12.2 wording: "the player always sees, without searching" — tester walks through the panel + reachable-tile labels once on iPhone, confirms nothing is hidden.

## Open questions

_(empty — all five questions resolved 2026-04-26, defaults accepted: tile size 32 / map 11×15, tagged-union `Result` for `commitMove`, Confirm button in bottom inspection panel, protagonist start position fixed in the map JSON. Spec body carries the canonical values.)_

## Done means

A user opens `https://three-days.<account>.workers.dev/` on iPhone Safari portrait and sees a small grid with the protagonist on the start tile, every reachable tile within 4 AP highlighted with its cost label, and a bottom panel showing "Protagonist · 4/4 AP · (col, row)". They tap a tile two squares away — halo appears, Confirm button appears in the panel — they tap Confirm, the protagonist moves there, AP drops to 2, and reachable tiles re-project from the new position. They exhaust AP, tap End Turn, AP refills, the turn counter increments. Rotating the device to landscape pauses the game with an overlay. `bun run typecheck`, `bun run lint`, `bun test`, `bun run build` all succeed locally and on Workers Builds. The repo now has a real `RunState`, `systems/grid.ts`, `systems/movement.ts`, and a `RunScene` — substrate that spec 0003 (one enemy pathfinds) can plug into without architectural surprises.
