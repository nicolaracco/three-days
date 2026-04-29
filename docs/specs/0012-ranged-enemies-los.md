# Spec 0012: Ranged enemies + line-of-sight

**Status:** Done
**Roadmap day:** GDD §13 Day 4 cleanup (closes the rooftop "more ranged enemies" gap that spec 0011 shipped as a known §12.3 deferral); also unblocks the Vigilant trait dependency for the Day-5 traits spec.
**Owner:** Nicola
**Related ADRs:** ADR-0004 (layered architecture), ADR-0005 (tile/pixel coordinates), ADR-0007 (seeded RNG), ADR-0008 (UI architecture — kind glyphs), ADR-0009 (testing discipline), ADR-0011 (world camera)

## Goal

Ranged aliens become a real second enemy kind. They shoot the protagonist when they have line-of-sight (LoS = unobstructed Bresenham line; walls block, floor and exit do not); when they don't, they path toward the nearest tile that does. Their sprite is visually distinct from melees (a square instead of a circle) and a brief red line draws shooter-to-target during each shot. The combat system gains an LoS check for any weapon with `range > 1` — adjacent melee attacks remain unaffected. Day-2 maps gain ranged distribution per GDD §9.2: lobby = 2 melee + 1 ranged + 1 commander, rooftop = 2 melee + 2 ranged.

## Why this, why now

Spec 0011 closed Day 4 functionally but left the §12.3 visual-coherence gap that the rooftop is supposed to feel exposed *because* of ranged threat — instead today's rooftop is just more melees. This spec closes that gap. It also unlocks the Vigilant trait dependency: Vigilant "sees enemy LoS cones," which is impossible without ranged enemies and an LoS system to project from. Implementing ranged + LoS now means traits in spec 0013 can launch with 4-of-5 fully wired (only Marksman/Resourceful's ammo remain blocked on player ranged weapons).

§12 sub-bars touched:
- **§12.1 Combat feel.** Two enemy kinds with different threat geometries — melee closes, ranged punishes standing still — adds the second tactical axis the player has to read every turn.
- **§12.3 Visual coherence.** The rooftop reads as "exposed and risky" rather than "more aliens."

## Scope

### In scope

- **`src/systems/los.ts`** — new module with two pure functions:
  - `hasLoS(from: TilePos, to: TilePos, map: Day1Map): boolean`. Bresenham walks every tile between `from` and `to` (exclusive of endpoints) and returns `false` if any of them is a wall. Floor and exit tiles are transparent. `from === to` returns `true` (degenerate; useful for "self-LoS" sanity).
  - `tilesAlongLine(from: TilePos, to: TilePos): TilePos[]` — full Bresenham trace, inclusive of endpoints, used by the renderer's shot-animation for routing the line through tile centers if needed.
- **Combat extension in `src/systems/combat.ts`.** `attackResult` checks LoS when `weapon.range > 1`. New failure reason added to the result union: `"no-line-of-sight"`. Range-1 weapons (melee) skip the LoS check entirely — adjacency is the only constraint, unchanged from spec 0004.
- **New weapon `alien-pistol`** in `src/data/weapons.json`: `damage: 1`, `range: 99`, `apCost: 2`. Range value is "unlimited within the map" (any value > the largest authored Day-2 dimension).
- **Ranged enemy AI in `src/systems/turn.ts`.** `enemyAct` branches on `enemy.kind`:
  - **`melee`** (existing behavior, unchanged) — adjacent + AP-sufficient → attack; else step toward player; else idle.
  - **`ranged`** (new) — `hasLoS(enemy, player) && AP >= weapon.apCost` → attack; else find the cheapest reachable walkable tile that has LoS to the player, step one tile along that path; else fall back to "step toward player" so a fully-walled-off ranged enemy still closes; else idle.
  - The "find a LoS tile" search reuses `bfs` from `pathfind.ts` over walkable tiles, scoring each candidate by path length, keeping the shortest-path tile with LoS. Caps the search at the map's tile count to bound worst case.
- **Renderer in `src/scenes/RunScene.ts`.**
  - **Distinct sprite.** Ranged enemies render as a 22×22 px square (`add.rectangle`) instead of a circle, same `enemyMelee` red. Stun tint applies (rectangle gets the muted-grey fill while `stunnedTurns > 0`).
  - **Shot animation.** When `enemyAct` returns `kind: "attacked"` and the attacker is ranged, draw a 2 px red line (`COLOR.enemyMelee`) from the attacker's tile center to the protagonist's tile center via a `Phaser.GameObjects.Line`. Tween the alpha from 1.0 → 0.0 over `FLASH_MS` (200 ms), destroy on complete. Plays alongside the existing protagonist hit-flash.
  - **Panel title.** Already handled by spec 0011's branch (`found.kind === "ranged" ? "Ranged alien" : ...`); this spec instantiates ranged enemies that hit that branch.
- **Day-2 map updates** (JSON only, no schema change):
  - `src/data/day2/lobby.json` — replace `lobby-melee-2` (col 4, row 5) with `lobby-ranged-1`: `kind: "ranged"`, `weaponId: "alien-pistol"`. Lobby end-state: 2 melee + 1 ranged + 1 commander.
  - `src/data/day2/rooftop.json` — replace `rooftop-melee-2` (col 1, row 4) with `rooftop-ranged-1` and `rooftop-melee-3` (col 8, row 6) with `rooftop-ranged-2`. Rooftop end-state: 2 melee + 2 ranged.
- **Tests.**
  - `src/systems/los.test.ts` (new) — `hasLoS` cases (clear horizontal, vertical, diagonal; wall-blocked; same-tile; floor/exit transparent).
  - `src/systems/combat.test.ts` extension — ranged attack rejected with `"no-line-of-sight"` when wall blocks; succeeds when clear; melee adjacent attack unaffected.
  - `src/systems/turn.test.ts` extension — ranged with LoS shoots; ranged without LoS but with reachable LoS tile moves toward it; ranged fully boxed in falls back to step-toward-player.
  - `src/systems/map.test.ts` extension — lobby has ≥ 1 ranged; rooftop has ≥ 2 ranged.

### Out of scope

- **Cover system.** GDD §7.1's `full | none` cover and the qualitative hit-chance feedback ("unlikely / risky / probable / certain") need their own spec and depend on map authoring conventions. Hit chance stays 100% for ranged in this spec; cover changes that contract.
- **Player ranged weapons** (pistol, shotgun, ammo, reload). Separate spec — unblocks Marksman + Resourceful's ammo when it lands.
- **Range cap shorter than the map.** "Unlimited within LoS" is the rule this spec; range = 99 in JSON. A balance pass can dial this down later if rooftop reads as too punishing in playtest.
- **Persistent LoS visualization** (cones, threat zones, "you're being watched" tint). Comes with the Vigilant trait — the trait *grants* LoS-cone vision per GDD §6.2. Until then, only the shot animation tells the player they were targeted.
- **Day-1 procgen ranged enemies.** Day-1 stays melee-only; chunk spawn slots don't carry a kind field. Adds authoring surface for negligible Day-1 gain.
- **Probabilistic hit feedback / qualitative tells.** GDD §7.1 list — needs cover; defer.
- **Sound effects.** Day-6 audio spec.
- **Real ranged-alien art.** Day-7 swap. Placeholder is the square sprite.

## Inputs

- `state.enemies` (kind branching in `enemyAct`).
- `state.map.tiles` (wall lookup for LoS).
- Weapon definitions in `weapons.json` (now with `alien-pistol`).

## Outputs / Effects

- New `los.ts` module exported and consumed by `combat.ts` and `turn.ts`.
- `commitAttack` / `attackResult` enforce LoS for `weapon.range > 1`.
- Enemy turn loop produces ranged shoot/move actions and shot animations.
- Day-2 maps load with ranged enemies present at the right positions.

## Interaction (desktop + mobile, same model)

Per ADR-0008.

- **Always-visible glyphs.** Ranged enemies use a square sprite as the kind glyph; melees keep their circle. The HP bar continues to mark the unit. The shot animation tells the player "you were just hit by that one."
- **Inspection panel.** Tapping a ranged alien shows `"Ranged alien"` (already wired in spec 0011's panel branch). HP/AP/position read the same way as melees.
- **Targeting.** No new player-side targeting modes — the protagonist is still melee-only this spec.
- **Confirm flow.** Unchanged.
- **Hit areas.** Unchanged — enemy sprites are tile-tap, not unit-tap.

## Acceptance criteria

### LoS

- [ ] **[unit]** `hasLoS(p, p, map) === true` (degenerate self-LoS).
- [ ] **[unit]** `hasLoS` returns `true` on a clear horizontal line, vertical line, and diagonal line over floor tiles.
- [ ] **[unit]** `hasLoS` returns `false` when a wall sits on any tile between `from` and `to` (exclusive of endpoints).
- [ ] **[unit]** `hasLoS` treats floor and exit as transparent; only `kind === "wall"` blocks.

### Combat

- [ ] **[unit]** `attackResult` returns `{ ok: false, reason: "no-line-of-sight" }` when `weapon.range > 1` and walls block the line.
- [ ] **[unit]** `attackResult` succeeds for adjacent melee even when a wall is "between" (range = 1 skips LoS).
- [ ] **[unit]** `commitAttack` with a ranged weapon hits when LoS is clear; HP/AP deductions are correct.

### AI

- [ ] **[unit]** A ranged enemy with clear LoS and AP ≥ `weapon.apCost` returns `kind: "attacked"`.
- [ ] **[unit]** A ranged enemy without LoS but with a reachable LoS tile returns `kind: "moved"` and the new position has shorter LoS-path-distance to the player than the prior position.
- [ ] **[unit]** A ranged enemy with no reachable LoS tile (boxed in by walls) falls back to "step toward player" — the same behavior as a melee enemy in that situation.
- [ ] **[unit]** Existing melee tests still pass — `enemyAct` branching on `kind` doesn't regress melees.

### Renderer

- [ ] **[manual]** Ranged enemies render as red squares; melees stay red circles; commander renders as a circle with the longer HP bar (commander is melee in this spec).
- [ ] **[manual]** When a ranged enemy fires, a red line draws from shooter to protagonist for ~200 ms, fading out.
- [ ] **[manual]** Stun tint applies to ranged sprites (square goes muted grey while stunned).

### Day-2 maps

- [ ] **[unit]** `loadDay2Map("lobby").enemies.filter(e => e.kind === "ranged").length >= 1`.
- [ ] **[unit]** `loadDay2Map("rooftop").enemies.filter(e => e.kind === "ranged").length >= 2`.
- [ ] **[manual]** Lobby retains the commander (`isCommander: true`) and at least one ranged alien is present in the central area.
- [ ] **[manual]** Rooftop has visible ranged aliens flanking the protagonist's start position.

### iPhone Safari portrait

- [ ] **[manual]** Square vs circle sprite distinction is readable at one arm's length without zoom.
- [ ] **[manual]** Shot animation visible (line draws and fades within the 200 ms window).

## Test plan

### Automated tests (red-green)

- `src/systems/los.test.ts` — five cases above for `hasLoS`.
- Extend `src/systems/combat.test.ts` — three cases for the LoS gating in `attackResult`.
- Extend `src/systems/turn.test.ts` — three cases for ranged AI (LoS attack, no-LoS-move-to-LoS, fully-boxed fallback).
- Extend `src/systems/map.test.ts` — two cases for Day-2 ranged distribution.

### Manual play-test (verify)

- **Scenario: lobby ranged engagement.**
  - Walk into the lobby via the stairwell. Observe the ranged alien in the center.
  - **Pass:** the ranged alien shoots when LoS exists (line draws); player takes 1 HP per shot; the player can move behind a pillar to break LoS and stop incoming fire.
  - **Targets:** desktop + iPhone Safari portrait.
- **Scenario: rooftop sustained pressure.**
  - Walk into the rooftop via the fire-escape. Observe two ranged aliens on the flanks.
  - **Pass:** ranged aliens shoot every turn they have LoS (which on the open rooftop is most turns); the player has to close on melees, kill rangers, and use a flashbang to control the engagement.
  - **Targets:** desktop + iPhone Safari portrait.
- **Scenario: stun a ranged alien.**
  - Adjacent flashbang on a ranged alien.
  - **Pass:** ranged alien turns muted grey, skips its next turn (no shot).
  - **Targets:** desktop.
- **Scenario: shot animation visibility.**
  - On any Day-2 map, end the player turn within LoS of a ranged alien.
  - **Pass:** the red line is visible from shooter to player for ~200 ms, then fades.
  - **Targets:** desktop + iPhone Safari portrait.
- **Scenario: regression — Day 1 melee unchanged.**
  - Play Day 1 to an exit, fight the static melee on the way.
  - **Pass:** melee behavior identical to spec 0011 — no spurious LoS check failures, no visual regressions.

## Open questions

All four resolved at proposal time:

- **Range cap.** Unlimited within LoS. `weapon.range = 99`. Balance dial via cover (later spec) rather than range cap.
- **AI sophistication.** Chase-to-LoS via BFS over walkable tiles, scoring by path length. Fallback to step-toward-player when no LoS tile is reachable.
- **Day-1 ranged.** No. Day-1 stays one melee per map; the variety lives on Day 2.
- **LoS visualization.** Shot animation only this spec; persistent cones land with the Vigilant trait.

## Done means

A user opens the preview URL, takes the fire-escape on Day 1, lands on the rooftop, and is immediately under fire from two ranged aliens flanking their start position. They use the medkit, throw a flashbang to neutralize one ranger, sprint behind a melee to break LoS on the other (where possible — the rooftop is largely exposed by design), and survive 8 turns. They take the stairwell on a different run, see one ranged alien in the lobby's central pillar room, kill it before approaching the commander, and finish the run. Every shot draws a red line shooter-to-player. The §12.3 visual-coherence gap from spec 0011 is closed, and the Vigilant trait's LoS dependency is unblocked for spec 0013+.
