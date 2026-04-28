# Spec 0009: Exits — `ExitTile`, two-exit guarantee, escape stub

**Status:** In progress
**Roadmap day:** GDD §13 Day 3 (closes the "2 reachable exits" criterion); stubs the Day-4 day chain.
**Owner:** Nicola
**Related ADRs:** ADR-0004 (layered architecture), ADR-0005 (tile/pixel coordinates), ADR-0007 (seeded RNG), ADR-0008 (UI architecture — exit glyphs, panel, selection), ADR-0011 (world camera)

## Goal

Every generated Day-1 map carries exactly two exits. Each exit is a distinct tile kind (`ExitTile`) with a type (stairwell or fire-escape) and an optional trait gate (Athletic for fire-escape per GDD §9.2). Exits are visible on the map (color + caption) and selectable in the inspection panel (type, gate, one-line tell). Walking onto an exit ends the run with an "escape" overlay reporting which exit was taken — a stub for Day-4's full Day-1 → Day-2 transition.

## Why this, why now

GDD §13 Day-3 end criterion: *"Stitcher produces valid maps with 2 reachable exits."* Spec 0007 left exits as a deferred follow-up, and §13 Day 4 ("Day chain + Day-2 handcrafted maps") is unblocked the moment exits become a real tile kind with a state-change effect. Without exits, the map has no goal and the run cannot resolve except by death.

§12 sub-bars touched:
- **§12.2 Information design.** ADR-0008 lists exit type icon + gate icon + always-visible caption as part of the always-visible glyph contract. This spec is where the contract starts being honored.
- **§12.5 Onboarding.** "Find the exit and decide which one to take" is the implicit Day-1 lesson. Without exits the lesson can't be taught.

## Scope

### In scope

- **`ExitTile` variant in `src/systems/map.ts`.** New shape:
  ```ts
  export interface ExitTile {
    kind: "exit";
    exitType: "stairwell" | "fire-escape";
    traitGate: "athletic" | null;
  }
  export type Tile = FloorTile | WallTile | ExitTile;
  ```
- **Procgen exit assignment in `src/systems/procgen.ts`.** After `stitch` succeeds and before `materialize` finishes, pick exactly 2 of `StitchResult.openConnectors` via the same `Rng` that produced the map (deterministic from seed). Materialization writes those two cells as `ExitTile` instead of `FloorTile`. Remaining `openConnectors` lift to `floor` as today (spec 0007 behaviour).
- **Type and gate assignment.** One picked exit becomes `{ exitType: "stairwell", traitGate: null }`; the other becomes `{ exitType: "fire-escape", traitGate: "athletic" }`. Type-to-connector pairing is RNG-shuffled so the stairwell isn't always the same connector.
- **Validation.** `generateMap` retries (within the existing retry cap) if `openConnectors.length < 2` — already the case from spec 0007's "≥ 2 unconnected connectors" check, so this only requires confirming the post-pick map still has both exits reachable from `start` via `isFullyConnected` (it must, since exits were `floor`-equivalent under spec 0007 connectivity).
- **Pathfinding treats exits as walkable.** `systems/pathfind.ts` (`bfs`) and `systems/movement.ts` (`reachableTiles`, `apCostToReach`) accept `kind === "exit"` as walkable in addition to `kind === "floor"`. AP cost per step is unchanged.
- **Renderer in `src/scenes/RunScene.ts`.** `renderMap` branches on exit kind:
  - **Color per type.** Stairwell tile: `0xffd166` (existing `apLabel` warm yellow — reuse, don't introduce). Fire-escape: `0x4ec1f7` (existing `protagonist` blue — reuse). Both rendered with the same border style as floor/wall.
  - **Trait-gate marker.** A small filled circle (radius 3 px) in the top-left corner of the tile when `traitGate === "athletic"`. Reuse `COLOR.stagedHaloStroke` for the marker.
  - **In-world caption.** A one-line text rendered at the world position just above the tile (inside the world layer, scrollFactor 1 so it tracks the camera per ADR-0011). Captions:
    - Stairwell: `"Stairwell — descent"`
    - Fire-escape: `"Fire-escape · Athletic"`
  - Caption font: monospace 10 px, color `COLOR.textDim`, origin `(0.5, 1)` so it sits above the tile centred horizontally.
- **Selection model extension in `RunScene`.** The existing `Selection` union is `protagonist | tile | enemy`; this spec adds nothing to the union. Tapping an exit tile uses the existing `kind: "tile"` selection. The panel branch for tile selection inspects `state.map.tiles[row][col]` and, if it's an `ExitTile`, renders an exit-specific layout:
  - **Title:** `"Exit — Stairwell"` or `"Exit — Fire-escape"`.
  - **Line 1:** `"Trait gate: Athletic"` or `"Trait gate: —"`.
  - **Line 2:** the same one-line tell as the world caption (so the caption isn't load-bearing for selection IA).
- **Walking onto an exit ends the run.** After `commitMove` succeeds and the move animation completes, `RunScene.afterPlayerMove` checks whether the protagonist's position is an `ExitTile`. If yes, set an `escaped` flag, freeze input, show an escape overlay (parallel to `deathOverlay`):
  - Title: `"You escaped"`
  - Body: `"Via {Stairwell | Fire-escape} · Turn {N}"`
  - Footer: `"Refresh to play another run"` (the same UX as death — no in-game restart yet).
- **Escape overlay** is implemented as `escapeOverlay` mirror of `deathOverlay`: full-screen black 0.94 alpha, centred text, depth 1001, scrollFactor 0. Only one of the two overlays is ever active at a time.
- **`isInputLocked` extension.** The getter gains `|| this.escapedThisRun` so taps stop after escape.

### Out of scope

- **Trait system / actual gating enforcement.** The Athletic gate is *displayed* but not enforced — any character can step onto the fire-escape this spec. Trait-aware blocking arrives with the trait system in Day 5; this spec leaves a TODO comment in the move-commit path so the gating insertion point is obvious.
- **Day-2 handcrafted maps and the real Day-1 → Day-2 transition.** Day 4 spec. The escape overlay is the stub.
- **Captured-by-enemy / forced-choice mechanics from GDD §9.** Day-4 + later.
- **Real exit art / themed visuals.** Day 7. Placeholder is colored tiles + small marker + monospace caption.
- **Restart in-place.** No "play again" button; "Refresh to play another run" matches the existing death-overlay pattern. A real restart UI is a later spec.
- **Multiple stairwells or multiple fire-escapes per map.** Always exactly one of each.
- **Visual differentiation of doors (chunk-internal connectors).** Cosmetic-only doors are deferred to a Day-5 IA-pass spec — this spec only touches exit tiles, not the chunk-authored door cells that lift to floor.

## Inputs

- `StitchResult.openConnectors` from `systems/procgen.ts` (already populated by spec 0007's stitcher).
- `RunState.seed` → the same `Rng` instance that drove stitching (deterministic exit placement per seed).
- `state.map.tiles[row][col]` for runtime tile-kind reads in selection / movement / render.

## Outputs / Effects

- Two `ExitTile` cells per generated map (otherwise no ExitTile, no exits).
- New world-space caption GameObject per exit (2 per map).
- New screen-space `escapeOverlay` container in `RunScene`.
- Panel content branches when the selected tile is an exit.
- After protagonist enters an exit, `RunScene` enters a terminal "escaped" state — input frozen, escape overlay visible.

## Interaction (desktop + mobile, same model)

Per ADR-0008.

- **Always-visible glyphs.** Each exit tile is colored by type, carries a gate marker (small circle) when traited, and shows a one-line caption above it in the world layer. All three are visible without selection or hover. Captions track the camera per ADR-0011.
- **Inspection panel.** Tapping an exit moves selection to the tile; panel shows type, gate, and the one-line tell. Tapping outside any unit/exit returns selection to the protagonist (existing behavior).
- **Targeting.** No new targeting mode. Walking to an exit uses the existing move-staging flow: tap once to stage (panel shows AP cost), tap again on the same tile or press "Confirm Move" to commit. The exit is treated as a normal walkable target by `reachableTiles`.
- **Confirm flow.** First tap stages the move, second tap commits — same as any other tile.
- **Hit areas.** No new hit areas (tile-tap goes through the existing scene-level `pointerdown` per ADR-0008).

## Acceptance criteria

### Procgen logic

- [ ] **[unit]** `generateMap(rng)` produces a map with exactly 2 `ExitTile` cells.
- [ ] **[unit]** The two exits have **different** `exitType`s (one stairwell, one fire-escape).
- [ ] **[unit]** The fire-escape exit has `traitGate === "athletic"`; the stairwell exit has `traitGate === null`.
- [ ] **[unit]** Both exits are reachable from `start` (BFS over walkable tiles, exits walkable).
- [ ] **[unit]** Same seed → same exit positions and same type assignment (deterministic).
- [ ] **[unit]** `bfs` and `reachableTiles` accept `kind === "exit"` as walkable.

### Renderer + selection

- [ ] **[manual]** On the deployed preview URL, each generated map shows two distinct colored tiles for exits, each with a caption above it ("Stairwell — descent" / "Fire-escape · Athletic"). Captions remain readable when the camera scrolls (ADR-0011 verification).
- [ ] **[manual]** Tapping an exit tile updates the inspection panel to show the type, the trait gate (Athletic or `—`), and the one-line tell. Tapping outside returns selection to the protagonist.
- [ ] **[manual]** The fire-escape carries the small circle gate marker in its top-left corner. The stairwell does not.
- [ ] **[manual]** The two captions don't overlap each other or the HUD/panel bands when the camera is at any scroll position. (If the procgen happens to place exits adjacent and the captions collide, raise a follow-up; do not block the spec.)

### Escape mechanic

- [ ] **[unit]** A unit test on `commitMove` confirms moving onto an `ExitTile` succeeds (it's a walkable target).
- [ ] **[manual]** Walking the protagonist onto an exit triggers a full-screen "You escaped" overlay within one move-step interval. The overlay reports which exit type and the turn number.
- [ ] **[manual]** After the escape overlay is shown, taps on the map / HUD / End Turn / panel buttons do nothing.
- [ ] **[manual]** Refreshing the page starts a new run with a different seed.

### iPhone Safari portrait

- [ ] **[manual]** All of the above on iPhone Safari portrait, via the preview URL (ADR-0010). Captions readable at one arm's length; gate marker visible without zooming.

## Test plan

### Automated tests (red-green)

- `src/systems/map.test.ts` (or similar) — assert `Tile` union admits exits and the renderer-relevant fields are typed.
- Extend `src/systems/procgen.test.ts`:
  - Generate 50 maps across seeded RNGs; assert each has exactly 2 exits, distinct types, correct gate assignment.
  - Determinism: two `generateMap(createRng(seed))` calls with the same seed produce identical exit positions and types.
  - Connectivity: both exits reachable from `start`.
- Extend `src/systems/pathfind.test.ts` (or `movement.test.ts`) — exit tiles walkable; AP costs to reach an exit match a floor-only equivalent map.

### Manual play-test (verify)

- **Scenario: see two exits.**
  - Open preview URL on iPhone Safari portrait, refresh until at least 3 different layouts have been seen.
  - **Pass:** every layout has exactly two distinct colored exit tiles with captions.
  - **Targets:** desktop + iPhone Safari portrait.
- **Scenario: select an exit.**
  - Tap a fire-escape exit on the map.
  - **Pass:** panel shows `"Exit — Fire-escape"` / `"Trait gate: Athletic"` / one-line tell.
  - **Targets:** desktop + iPhone Safari portrait.
- **Scenario: escape via stairwell.**
  - Walk the protagonist onto the stairwell.
  - **Pass:** escape overlay shows `"Via Stairwell · Turn N"` within ~250 ms of arriving on the tile. Subsequent taps do nothing.
  - **Targets:** desktop + iPhone Safari portrait.
- **Scenario: escape via fire-escape (no trait gating yet).**
  - Walk the protagonist onto the fire-escape.
  - **Pass:** same escape overlay, this time reporting `"Via Fire-escape · Turn N"`. The Athletic gate is not enforced this spec.
  - **Targets:** desktop only (gating UI parity is identical, no need to double-test).
- **Scenario: scrolled-state caption pin.**
  - On a map where an exit is far from the entrance, walk the protagonist toward it; observe whether the exit's caption stays anchored above the exit tile as the camera scrolls.
  - **Pass:** caption tracks the tile (scrolls with the world).
  - **Targets:** iPhone Safari portrait.

## Open questions

- **Caption collisions.** Two exits adjacent on the map could overlap captions. The spec accepts this as a known visual edge case (most layouts won't exhibit it given chunk topology), to be revisited if it shows up in playtest. If it does: shrink captions, abbreviate, or move to selection-only.
- **Forward references in spec 0007.** Spec 0007's "Out of scope" lines mention "spec 0008 introduces `ExitTile`". Now that 0008 is the build-version-tag, those references should be updated to "spec 0009". One-line edit; do at implementation time.

## Done means

The user opens the preview URL on iPhone Safari portrait, sees a procgen apartment with two visibly different exits — a yellow stairwell with a one-line "Stairwell — descent" caption above it, and a blue fire-escape with a small Athletic-gate dot and a "Fire-escape · Athletic" caption — refreshes a few times to confirm both exits always exist, taps one to read its panel detail, walks the protagonist onto it, and reads the "You escaped via {type}" overlay. The same flow works on desktop. Day 3's *"2 reachable exits"* roadmap criterion is now closed; Day 4 (real Day-1 → Day-2 transition) can land on top of this without re-shaping the tile model or the procgen output.
