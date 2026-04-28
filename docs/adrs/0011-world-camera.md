# ADR-0011: World camera with screen-space UI overlays

**Status:** Accepted (retroactive — see Follow-ups)
**Date:** 2026-04-28

## Context

Spec 0007 lifted procgen from a single hand-authored chunk to a connector-stitched library, so a generated `Day1Map` can exceed the playable viewport in either dimension. GDD §8.3 calls for 5–7 chunks per Day-1 map; that is incompatible with a 11×15 tile cap at the working resolution chosen by ADR-0008 (360 × 640 with 32 px tiles, leaving a 480 px map-area band between HUD and panel).

Spec 0006 centered the map within the viewport, which produced negative pixel offsets — and therefore tiles rendered partially off-screen — once spec 0007 lifted the size cap. Two responses were on the table: shrink procgen back to the viewport, or render in world space and scroll the view. The first kills the GDD's apartment-sized levels; the second is a one-time architectural decision that future scenes (Day-2's hand-authored final stand, future procgen features, any new scene that exceeds the viewport) inherit.

## Decision

The playable scene renders the world in world coordinates, with the main camera following the protagonist. UI is rendered in screen space via `setScrollFactor(0)` so it stays pinned regardless of camera scroll.

Mechanisms:

- **Per-axis placement.** Compute `mapPxW` / `mapPxH` from the map. On axes where the map fits inside the relevant viewport band, the map is centered (placement offset stored in `GridConfig`). On axes where it doesn't, the map is pinned to the top-left of the band so the camera can scroll across the rest. The two axes are decided independently so a tall, narrow map and a short, wide one each get the right behavior.
- **Camera bounds and follow.** `cameras.main.setBounds(0, 0, boundsW, boundsH)` where `boundsW = fitsX ? WORKING_WIDTH : mapPxW` and `boundsH = fitsY ? WORKING_HEIGHT : MAP_AREA_TOP + mapPxH + PANEL_HEIGHT`. `cameras.main.startFollow(protagonistSprite, true)` keeps the protagonist roughly centered; Phaser clamps to bounds at edges so HUD and panel stay visible.
- **Screen-space UI overlays.** Every HUD element, every panel element, both action buttons, and both full-screen overlays (`orientationOverlay`, `deathOverlay`) call `setScrollFactor(0)`. They render in screen space; the world scrolls beneath them. Containers receive the call once; that suffices for their children.
- **Pointer band gating.** The scene-level `pointerdown` handler rejects taps where `pointer.y < HUD_HEIGHT` or `pointer.y >= PANEL_Y` *before* converting to world coordinates. Without this gate, a tap on the HUD with the camera scrolled down would resolve `pointer.worldY` to a tile hidden beneath the HUD overlay — an invisible interaction the player cannot anticipate.

Tile rendering, pathfinding, enemy logic, and any other game code remain in world space and are unaffected. `pointer.worldX` / `pointer.worldY` already account for camera scroll, so `pixelToTile` keeps working unchanged after the band gate above.

## Alternatives considered

- **Cap procgen output to the viewport (11×15 tiles).** Initial draft. Rejected because it breaks GDD §8.3 (5–7 chunks per map at 5×5 tile chunks already exceeds 11 tiles in one dimension), and Day-2's hand-authored final stand will be larger still.
- **Multi-camera setup: a dedicated UI camera that ignores world objects, plus a world camera that ignores UI.** Cleaner separation. Rejected as scaffolding for the same observable behavior — `setScrollFactor(0)` on a known-small set of UI nodes is one line per node and avoids carrying a parallel camera through every scene that grows UI.
- **Shrink tiles to fit larger maps in the viewport.** Rejected. ADR-0005 already binds tile size to the portrait-glyph-legibility constraint from ADR-0008; shrinking tiles regresses §12.2 information design.
- **Don't follow the protagonist; let the player pan the camera manually.** Rejected. Pan input on a touch device collides with tap-to-act (ADR-0008) and adds discovery cost the GDD does not budget for. Auto-follow with bounds is the standard tactical-roguelike pattern.

## Consequences

- Positive: GDD §8.3 (apartment-sized maps) becomes feasible without changing the working resolution, the tile size, or the information-design contract from ADR-0008.
- Positive: One camera + a small set of `setScrollFactor(0)` calls. Cheap to add, cheap to read.
- Positive: The protagonist is always on screen during their own turn; the player never loses the avatar to scroll state.
- Positive: Day-2's hand-authored final stand inherits this for free.
- Negative: Every new UI element added to a world-rendering scene must remember to call `setScrollFactor(0)`. The failure mode (UI appears to drift) is loud, but it's a footgun on the floor.
- Negative: Every new world-pointer handler must remember to gate on the screen-space HUD/panel band before resolving world coordinates. Same footgun shape.
- Negative: Manual UI play-test now has to cover the *scrolled* state on iPhone Safari portrait, not just the start state. Specifically: panning to map edges must keep HUD/panel visible and tap-routable.

## Verification

- `src/scenes/RunScene.ts` calls `this.cameras.main.setBounds(...)` and `this.cameras.main.startFollow(this.protagonistSprite, ...)` in `create()`.
- `rg "setScrollFactor\(0\)" src/scenes/` returns at least one hit per HUD element, panel element, action button, and full-screen overlay container in every scene that uses world coordinates. A reviewer who removes any of those lines and runs the game on a map larger than the viewport must see UI drift with the camera.
- The scene-level `pointerdown` handler rejects pointer events outside the screen-space map band (`pointer.y < HUD_HEIGHT || pointer.y >= PANEL_Y`) **before** calling `pixelToTile`. Verifiable with a unit test on the handler or by play-testing a tap on the End Turn button while scrolled.
- Manual play-test (per ADR-0008 + ADR-0009) on iPhone Safari portrait: walk the protagonist from one edge of a multi-chunk map to the other; HUD and panel must stay pinned; tapping buttons in either band must hit the buttons, not a tile beneath them.

## Follow-ups

- This ADR is **retroactive**: the implementation landed in commit `2d471f0` ("fix(run-scene): camera follows protagonist for off-viewport maps") on 2026-04-28 *before* the architectural decision was written down. The rule going forward (and recorded in Claude's memory): non-trivial architectural changes get an ADR or spec drafted before implementation, not after. The user explicitly raised this; this Follow-up is the audit trail.
- When Day-2 lands its hand-authored map, re-verify that the per-axis placement and bounds computation behave correctly for a map that is wider but not taller than the viewport (or vice versa). The current procgen happens to produce both-axis-overflowing maps most of the time, so the asymmetric cases are under-tested.
- If a future scene grows a non-trivial UI surface (e.g. an inventory grid, a multi-line objective bar), reconsider the multi-camera alternative once the count of `setScrollFactor(0)` call sites exceeds ~15 in any one scene. The threshold is pragmatic; the goal is to keep the screen-space-vs-world-space split obvious to a reader.
