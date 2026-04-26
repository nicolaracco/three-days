# ADR-0008: UI architecture (platform support, input, information design)

**Status:** Accepted
**Date:** 2026-04-26

## Context

This ADR is the single source of truth for the game's UI architecture. It records three coupled decisions that emerged together:

1. **Platform support.** The GDD (§4) originally listed "desktop only." That decision is reversed: the game must be playable on iPhone in portrait orientation as well as desktop landscape. The developer test loop depends on iPhone-readiness (see ADR-0010 for the preview pipeline), and portability widens the audience for the §14.2 "stranger plays a 20-minute run" success criterion.
2. **Input model.** Phaser 3 unifies mouse and touch into pointer events, so the input layer is mostly free; the costs are viewport scaling, hit-area sizing, and orientation handling.
3. **Information design.** GDD §12.2 originally said hovering tiles, enemies, and exits surfaces AP cost, hit chance, threat level, and Day-2 implications. There is no hover on touch, and the right answer is not to fake one — it is to redesign the information layer so hover isn't needed on **any** device. The IA decision applies to desktop and mobile identically.

These three decisions live together because they were made together and they reinforce each other. Splitting them would obscure the fact that the IA model is what makes the platform support feasible without a per-device UX path.

## Decision

The game ships playable on:

1. **Desktop browser, landscape** (mouse + keyboard) — the primary development target.
2. **iPhone Safari, portrait orientation** (touch only) — the remote test target and a real ship target.

Mechanisms:

- **Viewport.** `Phaser.Scale.FIT` with a logical resolution authored for portrait (`360 × 640` working spec; revisit on first device test). `autoCenter: CENTER_BOTH`. `min`/`max` sized so a desktop browser shows the canvas at a reasonable size without rebuilding the layout.
- **Orientation.** Portrait only on mobile. If the phone is rotated to landscape, an overlay says "rotate to portrait" and pauses the game. No separate landscape layout — that is a different game.
- **Input.** Pointer events only. The codebase never reads `mouse-*` or `touch-*` directly; both go through `pointerdown`, `pointerup`, `pointermove`. Hit areas are sized for **touch first**: minimum 44 × 44 logical px (Apple HIG). A mouse cursor shrinks to fit; a fingertip cannot grow.
- **Information design — no hover dependency, anywhere.** The codebase carries no information that disappears when the cursor moves, and no information that requires a hover to reveal. The same model runs on desktop and mobile. Three mechanisms:
  1. **Always-visible glyphs on the map.** Anything a player would previously have hovered to learn is rendered onto the relevant tile or unit:
     - **Enemy:** HP bar above sprite; threat-type glyph (melee fang / ranged crosshair) on or adjacent to the sprite; facing arrow if relevant.
     - **Exit:** type icon (stairwell vs fire-escape) baked into the tile art; trait-gate icon (Athletic emblem) overlaid where the gate applies; a single-line caption shown next to the exit while it is on screen — not on hover.
     - **Item on tile:** the item's icon is rendered on the tile.
     - **Tile context** (cover, blocked sight): glyphed on the tile.
  2. **Sticky inspection panel.** A fixed HUD region (bottom of screen in portrait, side in landscape) always shows the *current selection's* full details. Selection persists until the player picks another target. At the start of every turn, default selection is the protagonist. Tapping (or clicking) a tile, enemy, or exit moves the selection and updates the panel. Tapping outside any target returns the selection to the protagonist.
  3. **Action targeting projects all costs at once.** When the player enters an action mode (move / attack), every valid target is highlighted and labeled with its AP cost and qualitative hit-chance simultaneously. The player tap-confirms one target. There is no per-target hover-to-reveal step on either platform.
  Confirmation is explicit: a first tap on a valid target stages it; a second tap on the same target commits, or the on-screen confirm button commits. Tapping a different valid target restages. Tap outside cancels.
- **Reading distance.** Text is sized for a phone held in the hand. Body text minimum 14 logical px at the working resolution. The HUD uses one bigger pixel font; the spec already says two fonts max (GDD §12.3).

## Alternatives considered

- **Desktop only, ship to itch.io as the GDD originally said.** Rejected because the developer needs to test on iPhone during the build week — testing on a phone implies the game runs on a phone, and we may as well support it as a real target instead of a half-broken one.
- **Landscape on mobile.** Common for tactical games. Rejected because the user explicitly wants portrait, and portrait is what one reaches for on a phone in real use.
- **Native iOS app.** Massively out of scope for a 7-day browser project.
- **Hover on desktop, tap-preview on mobile (separate UX paths).** Two code paths, two test matrices, two onboarding stories. Rejected — and rejected even before the mobile constraint, because hover-to-reveal forces every player to sweep the cursor across each tile to learn what's on the map.
- **Tap-preview / tap-commit as a hover replacement.** Earlier draft of this ADR. Rejected: it preserves hover's worst property (information is transient and revealed one-target-at-a-time), it just retriggers via tap. Once tap-preview is the answer, "always-visible glyphs + selection panel + projected targeting" is strictly better.
- **Long-press preview, single-tap commit.** Considered. Rejected: long-press is slower, harder to discover, and conflicts with iOS Safari's text-selection / context-menu defaults.

## Consequences

- Positive: A wider real audience.
- Positive: The remote test loop (ADR-0010) is a real test, not a desktop simulation.
- Positive: One UX model on every device. No "did this work on touch but not mouse?" gap; no per-platform code path; no per-platform regression. Test scenarios collapse.
- Positive: First-time players see AP costs, threat levels, and exit implications without doing anything — strict improvement to onboarding (§12.5). Hover required players to first learn that they should hover.
- Positive: Skilled play is faster, not slower. Targeting mode shows every valid target's cost and hit-chance at once; a player makes a comparative decision instead of a sequential hunt-and-hover.
- Positive: No transient information. Anything that mattered remains visible until the player intentionally moves on.
- Negative: GDD §4 ("Platform: desktop only") and §12.2 (hover-driven information) need amendment. This ADR is the source of truth until the GDD is updated; an editing pass should follow. The §12.2 wording becomes: *every game-relevant fact is either always-visible on the map (glyphed onto a tile or unit) or always-visible in the inspection panel for the current selection.* No fact is gated on hover or transient interaction.
- Negative: HUD layout has to fit a portrait aspect AND host a permanent inspection panel. The day/turn/objective/HP/AP block can't use a wide top bar; expect a stacked layout with the inspection panel bottom-anchored where thumbs reach.
- Negative: Tile art has to carry more glyph load (HP bar, threat icon, exit type, gate icon, item icon, cover marker). ADR-0006's placeholder atlas needs to be scoped accordingly; Day 7's real-art swap inherits that glyph language.
- Negative: Asset placement and tile size need to be chosen with portrait constraint in mind. Tile size on a 360-wide canvas constrains how many columns are visible; small tiles make glyphs harder to read. The trade-off lives in `data/balance.json` and the placeholder atlas spec.
- Negative: Audio (GDD §12.4) on iOS Safari requires a user-initiated gesture before the AudioContext starts. The Boot scene needs a "tap to start" gate; `bun run dev` on desktop hides this requirement, so the iPhone is the only place this is verified.

## Verification

- Game config sets `scale.mode = Phaser.Scale.FIT` and `scale.autoCenter = Phaser.Scale.CENTER_BOTH` at a portrait working resolution.
- `rg "mousedown|mouseup|mousemove|touchstart|touchmove|touchend" src/` returns no game-logic results — only Phaser-internal callbacks.
- `rg "pointerover|pointerout" src/` returns no UI-state-mutation results. Hover-trigger handlers may exist for pure cosmetic purposes (e.g. cursor-shape change), but no game-relevant fact is gated behind one. A reviewer must be able to disable all hover handlers and still play with full information.
- All interactive UI elements have a hit area ≥ 44 × 44 logical px (assertable in unit tests for UI components).
- The HUD includes a persistent inspection panel that always shows the current selection's details. There is exactly one "current selection" at any moment; the default is the protagonist.
- Tile and unit rendering includes the always-visible glyphs (enemy HP bar, threat icon, exit type icon + gate icon, item icon, cover marker). These are part of `data/sprites.json` (or equivalent) frame indices, not hover-triggered overlays.
- Action-targeting mode highlights and labels **every** valid target simultaneously. Verifiable with a screenshot test or a manual play-test scenario in the spec.
- A `Manual play-test` block in every UI-touching spec includes "iPhone Safari portrait" as a test scenario.
- The Boot scene has a user-gesture audio unlock.
- An orientation-lock overlay exists and is wired in the relevant scene.

## Follow-ups

- Edit GDD §4 ("Platform") and §12.2 (information design) to reflect this ADR. Out of scope for this ADR; tracked separately.
- §12.2's contract is reworded as: *every game-relevant fact is either always-visible on the map (glyphed onto a tile or unit) or always-visible in the inspection panel for the current selection.* Hover and "tap-to-reveal" are both rejected.
- The placeholder atlas spec (ADR-0006) needs frame-index allocations for the new glyph set (HP bar, threat icons, exit type icons, gate icons, item icons, cover markers). A small spec under `docs/specs/` should capture the atlas layout once Day 1 begins.
