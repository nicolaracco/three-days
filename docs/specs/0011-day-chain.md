# Spec 0011: Day chain — Day-2 handcrafted maps, transition, objectives, run-end summary

**Status:** In progress
**Roadmap day:** GDD §13 Day 4 (closes the Day-4 milestone except for ranged-enemy and cover work, both deferred to their own specs)
**Owner:** Nicola
**Related ADRs:** ADR-0004 (layered architecture), ADR-0005 (tile/pixel coordinates), ADR-0007 (seeded RNG), ADR-0008 (UI architecture — HUD, panel, selection), ADR-0009 (testing discipline), ADR-0011 (world camera)

## Goal

Reaching a Day-1 exit no longer ends the run. It carries the protagonist into Day 2, a handcrafted map whose identity is determined by the exit (stairwell → lobby, fire-escape → rooftop). Each Day-2 map carries its own enemies and a single objective: lobby = "eliminate the alien commander," rooftop = "survive 8 turns." Reaching the objective wins the run; protagonist death loses it. A unified run-end overlay replaces today's escape / death overlays and reports a faithful summary (which day, which Day-2 map if reached, win or loss, turn number).

## Why this, why now

GDD §13 Day-4 end criterion: *"Both Day 2 maps (lobby, rooftop) authored. Day 1 → Day 2 transition works. Run-end screen shows the right summary."* §9 (Exits as Relocation) is the design contract this spec implements. Today the run resolves at the Day-1 exit with a stub overlay; without Day 2 the player has no climax and the choice between exits has no consequence beyond a label. Spec 0011 closes the loop: Day-1 procgen → meaningful exit choice → handcrafted Day-2 final stand → win or loss → summary.

§12 sub-bars touched:
- **§12.5 Onboarding.** "Find the exit, pick which one to take, fight to the objective" becomes a complete arc instead of a fragment.
- **§12.2 Information design.** Day-2 maps add an objective HUD line and a per-protagonist objective in the panel, both glyphed per ADR-0008 (no hover, always-visible).
- **§12.1 Combat feel.** Indirectly: the commander is a real fight beat with a different difficulty profile (more HP, the player has to work for the kill).

## Scope

### In scope

- **`RunState.currentDay: 1 | 2`.** Initialized to 1; flipped to 2 by the transition reducer. Used by HUD/panel branches and the win-check.
- **`RunState.day2MapKey: "lobby" | "rooftop" | null`.** `null` on Day 1; set to `lobby` or `rooftop` when the transition fires. Drives the "you cleared the X" line in the run-end summary.
- **`RunState.runEnd: { kind: "won" | "lost"; reason: string } | null`.** Set by win/loss checks. Once non-null, input is locked and the run-end overlay is visible.
- **Two handcrafted Day-2 maps** in `src/data/day2/lobby.json` and `src/data/day2/rooftop.json`. Same shape as `Day1Map` (no rename — see Open questions). Hand-authored ~10×10 grids with no exit tiles, no item slots, no spawn slots — instead, each map embeds its enemies inline (see next bullet). Optional sprinkle of items (medkit/flashbang) is allowed at author discretion via the existing `itemsOnMap` field; both maps ship with one medkit each so the player can patch up on arrival.
- **Inline enemy authoring** in Day-2 map JSON. Each map carries an `enemies: AuthoredEnemy[]` field where each entry has `{ id, kind, position, weaponId, maxHP?, isCommander? }`. `maxHP` defaults to `balance.ENEMY_HP`; `isCommander` defaults to `false`. The lobby map authors the commander with `maxHP: 6` and `isCommander: true`. New helper `loadDay2Map(key)` returns `{ map, enemies }`.
- **Commander enemy.** Implemented as a regular `melee` enemy with `isCommander: true` and `maxHP = balance.COMMANDER_HP` (= 6). New balance constant. No new `EnemyKind` value — adding `"commander"` would require new combat plumbing for negligible gain.
- **Transition reducer** `transitionToDay2(state, exitType): RunState` in `src/systems/run-state.ts`:
  - Loads the appropriate Day-2 map by `exitType` (stairwell → lobby, fire-escape → rooftop).
  - Resets `currentAP = maxAP`, `turn = 1`, `currentDay = 2`, `day2MapKey = "lobby" | "rooftop"`, `staged = null` (logical — staged lives on the scene, not RunState; the scene clears it).
  - Carries protagonist `currentHP` and `inventory` forward (the player keeps what they earned).
  - Replaces `enemies`, `itemsOnMap`, `map`, `start`-position with the Day-2 map's authored data.
- **Win-check reducer** `checkRunEnd(state): RunState` in `src/systems/run-state.ts`:
  - On Day 1: only the protagonist-death loss triggers. (Existing behavior; no Day-1 win.)
  - On Day 2 lobby: if no enemy with `isCommander === true` is alive, set `runEnd = { kind: "won", reason: "commander-dead" }`.
  - On Day 2 rooftop: if `turn >= ROOFTOP_SURVIVE_TURNS` (= 8) **and** protagonist alive at the start of a fresh player turn, set `runEnd = { kind: "won", reason: "survived" }`.
  - Loss (any day): if `protagonist.currentHP <= 0`, set `runEnd = { kind: "lost", reason: "killed" }`.
  - The reducer is idempotent — once `runEnd` is set, subsequent calls return the input unchanged.
  - Called by the scene after every state mutation that could change a win/loss bit (post-attack, post-enemy-turn, post-transition, post-medkit, etc.).
- **Balance constants** added to `src/data/balance.json`:
  ```json
  "COMMANDER_HP": 6,
  "ROOFTOP_SURVIVE_TURNS": 8
  ```
- **Scene wiring in `src/scenes/RunScene.ts`.**
  - `afterPlayerMove` no longer calls `handleEscape`; instead it calls `handleExitWalkOnto(tile)` which fires the transition reducer, replaces the entire scene state, and re-renders all world layers (map, items, enemies, protagonist).
  - The existing escape overlay is removed. A unified `runEndOverlay` with `runEndOverlayText` takes its place. Both `handleProtagonistDeath` and the new win path write into the unified overlay.
  - `isInputLocked` getter gains `state.runEnd !== null` (replaces `escapedVia !== null`).
  - HUD: when `currentDay === 2`, the turn-indicator text is prefixed with `"D2 · "` (e.g. `"D2 · Your turn"`, `"D2 · Enemy"`).
  - Panel (protagonist selection): when `currentDay === 2`, `panelLine2` shows the objective brief instead of the inventory line. Inventory is still readable via the action-area item buttons.
- **Objective copy.**
  - HUD prefix on Day 2: `"D2 · Your turn"` / `"D2 · Enemy"`.
  - Panel line2 (Day 2, lobby, protagonist selected): `"Eliminate the commander"`.
  - Panel line2 (Day 2, rooftop, protagonist selected): `"Survive — N/8 turns"`. `N` is the current turn (clamped to 8).
  - Run-end overlay copy:
    - Win lobby: `"You survived\nDay 2 · Lobby · Turn N\n\nRefresh to play another run"`.
    - Win rooftop: `"You survived\nDay 2 · Rooftop · Turn N\n\nRefresh to play another run"`.
    - Lose Day 1: `"You died\nDay 1 · Turn N\n\nRefresh to play another run"`.
    - Lose Day 2: `"You died\nDay 2 · {Lobby|Rooftop} · Turn N\n\nRefresh to play another run"`.
- **Map authoring conventions** (encoded in the JSON files, not in code):
  - Lobby ~10×10. Authored to feel like a small ground-floor lobby: a central open area with cover-suggesting wall pillars (no actual cover system yet — just visual coherence), 3 melee enemies including the commander.
  - Rooftop ~10×10. Authored to feel exposed: large open floor, perimeter walls, 4 melee enemies (proxy for the GDD's "more ranged enemies" — ranged itself is deferred). Player must hold for 8 turns.
- **Tests.**
  - `src/systems/run-state.test.ts` extension — `transitionToDay2` (loads correct map per exit type, resets turn, preserves HP and inventory); `checkRunEnd` (each branch: idle, win-lobby, win-rooftop, loss).
  - `src/systems/map.test.ts` extension — Day-2 map loaders return well-formed maps with at least 1 enemy and the lobby includes a commander.
  - Existing tests adjusted as needed for the new `RunState` fields.

### Out of scope

- **Ranged enemies.** GDD §9.2 says rooftop has "more ranged enemies"; spec 0011 ships melee everywhere. Tracked as a known §12.3 gap, follow-up spec.
- **Cover system.** GDD §7.1 specifies `full | none` cover with hit-chance impact. Out of scope here; rooftop's "exposed" feel is conveyed visually only. Follow-up spec.
- **Trait gates** (Athletic for fire-escape per GDD §9.2). Both exits are walkable; the gate marker is decorative only. Trait enforcement waits for the trait system (Day 5).
- **Pistol / shotgun / ranged weapons.** GDD §7.1; protagonist still wields improvised melee.
- **Real Day-2 art / themed visuals.** Day 7 spec.
- **Mid-run save** (ADR-0003). Refresh to retry, same as today.
- **Restart in place.** No "Play Again" button — the run-end overlay says "Refresh to play another run."
- **Multiple Day-2 map variants per exit type.** One lobby, one rooftop. Variation can land later if playtest demands replayability on Day 2.
- **Day-2 procgen.** GDD §8.1 explicitly excludes Day-2 from procgen. Spec 0011 honors that.
- **A `Day1Map`-→-`Map` mechanical rename.** Day-2 reuses the `Day1Map` shape; the slight name-mismatch is deliberate scope discipline.

## Inputs

- The Day-1 exit walk path in `RunScene.afterPlayerMove` (today calls `handleEscape`; spec 0011 swaps to `handleExitWalkOnto` → `transitionToDay2`).
- `ExitTile.exitType` to pick the Day-2 map.
- The two new JSON files in `src/data/day2/`.
- `state.protagonist.currentHP` and `state.protagonist.inventory` carried into Day 2.

## Outputs / Effects

- New JSON: `src/data/day2/lobby.json`, `src/data/day2/rooftop.json`.
- New runtime fields on `RunState`: `currentDay`, `day2MapKey`, `runEnd`.
- New balance constants: `COMMANDER_HP`, `ROOFTOP_SURVIVE_TURNS`.
- New helpers: `loadDay2Map(key)` in `src/systems/map.ts` (or a new `src/systems/day2.ts` if the loader logic gets weighty — spec accepts either).
- New `Enemy.isCommander: boolean` field (default false; populated only via Day-2 authoring).
- New `transitionToDay2(state, exitType)` and `checkRunEnd(state)` reducers in `run-state.ts`.
- Removed: `escapeOverlay` and `deathOverlay` are replaced by a single `runEndOverlay` (one container, depth 1001, scrollFactor 0).
- HUD turn-indicator gains a `"D2 · "` prefix on Day 2.
- Panel protagonist line2 shows the objective on Day 2 instead of the inventory line.

## Interaction (desktop + mobile, same model)

Per ADR-0008.

- **Always-visible glyphs.** No new glyphs introduced. The commander's longer HP bar is its visual marker; selecting it shows `"Alien commander"` in the panel title (vs `"Melee alien"` for normal enemies).
- **Inspection panel.**
  - Selecting the commander shows `"Alien commander"` title with HP/AP and position.
  - Selecting any tile / enemy / item works the same as Day 1.
- **Targeting.** No new targeting modes. Day-2 plays exactly like Day 1: move, attack, items, end turn.
- **Confirm flow.** Same as Day 1 throughout.
- **Hit areas.** No new buttons in this spec.

## Acceptance criteria

### Transition

- [ ] **[unit]** `transitionToDay2(state, "stairwell")` produces a state with `currentDay = 2`, `day2MapKey = "lobby"`, `turn = 1`, `currentAP = maxAP`, and the lobby map loaded.
- [ ] **[unit]** `transitionToDay2(state, "fire-escape")` produces the rooftop equivalent.
- [ ] **[unit]** Protagonist `currentHP` and `inventory` are carried forward unchanged.
- [ ] **[unit]** Day-2 enemies are populated from the map JSON with `stunnedTurns = 0`.
- [ ] **[manual]** Walking onto a stairwell exit on Day 1 transitions to a small lobby map with the commander visible. Movement, combat, items, end-turn all work.
- [ ] **[manual]** Walking onto a fire-escape exit on Day 1 transitions to a small rooftop map. Same controls.

### Objectives

- [ ] **[unit]** `checkRunEnd` for the lobby returns `runEnd = { kind: "won", reason: "commander-dead" }` once the commander is gone, and unchanged otherwise.
- [ ] **[unit]** `checkRunEnd` for the rooftop returns `runEnd = { kind: "won", reason: "survived" }` once `turn >= ROOFTOP_SURVIVE_TURNS` and protagonist alive.
- [ ] **[unit]** `checkRunEnd` returns `runEnd = { kind: "lost", reason: "killed" }` when `currentHP <= 0`, on either day.
- [ ] **[unit]** `checkRunEnd` is idempotent — calling it twice does not change a non-null `runEnd`.
- [ ] **[manual]** Lobby: kill the commander → run-end "You survived" overlay within ~250 ms.
- [ ] **[manual]** Rooftop: end turn 8 cycles → run-end "You survived" overlay.

### Loss

- [ ] **[manual]** Die on Day 1 (let melee aliens finish you) → run-end "You died · Day 1 · Turn N".
- [ ] **[manual]** Die on Day 2 → run-end "You died · Day 2 · {Lobby|Rooftop} · Turn N".

### HUD + panel

- [ ] **[manual]** On Day 2, the HUD turn-indicator reads `"D2 · Your turn"` / `"D2 · Enemy"`.
- [ ] **[manual]** On Day 2 lobby, selecting the protagonist shows `"Eliminate the commander"` in the panel.
- [ ] **[manual]** On Day 2 rooftop, selecting the protagonist shows `"Survive — N/8 turns"` (N updates each turn).
- [ ] **[manual]** On Day 1, panel line2 still reads `"Medkits: N · Flashbangs: M"` — Day-1 behavior is unchanged.

### iPhone Safari portrait

- [ ] **[manual]** All of the above on iPhone Safari portrait. Run-end overlay copy is readable at one arm's length without zooming. The objective text fits at 14 px in the panel without truncation on either Day-2 map.

## Test plan

### Automated tests (red-green)

- `src/systems/run-state.test.ts`:
  - `transitionToDay2` — both exit types; HP/inventory carry-forward; turn reset; commander present in lobby.
  - `checkRunEnd` — each branch (idle, win-lobby, win-rooftop, loss-Day-1, loss-Day-2, idempotency).
- `src/systems/map.test.ts`:
  - `loadDay2Map("lobby")` returns a well-formed `Day1Map` plus an enemy list including a commander.
  - `loadDay2Map("rooftop")` returns a well-formed map with > 1 enemy.
  - Day-2 maps have **zero** exit tiles (per GDD §9.3).

### Manual play-test (verify)

- **Scenario: stairwell → lobby clear.**
  - Refresh until you spawn a Day-1 map; walk to a stairwell; observe transition; engage the commander; defeat all enemies including the commander.
  - **Pass:** run-end overlay reads `"You survived · Day 2 · Lobby · Turn N"` within 250 ms of the commander's death.
  - **Targets:** desktop + iPhone Safari portrait.
- **Scenario: fire-escape → rooftop hold.**
  - Walk to a fire-escape exit; observe transition to rooftop; survive 8 full turns.
  - **Pass:** run-end overlay reads `"You survived · Day 2 · Rooftop · Turn 8"` after the 8th turn ends.
  - **Targets:** desktop + iPhone Safari portrait.
- **Scenario: Day-1 death.** Stand still until enemies kill you.
  - **Pass:** overlay reads `"You died · Day 1 · Turn N"`.
- **Scenario: Day-2 death.** Transition to a Day-2 map and let the commander or rooftop wave finish you.
  - **Pass:** overlay reads `"You died · Day 2 · {Lobby|Rooftop} · Turn N"`.
- **Scenario: HP and inventory carry-forward.**
  - Take damage and pick up a medkit on Day 1; transition.
  - **Pass:** Day-2 starts with the same HP and the same inventory.
- **Scenario: input lock.** Once any run-end overlay is shown, taps on map / panel / End Turn do nothing.
- **Targets:** desktop + iPhone Safari portrait, all scenarios.

## Open questions

All four resolved at proposal time:

- **Commander HP** = 6 (`COMMANDER_HP = 6`). Twice the baseline; meaningful fight without crossing into a "boss" tuning curve.
- **Rooftop turn count** = 8 (`ROOFTOP_SURVIVE_TURNS = 8`). Per GDD §9.3.
- **Day-2 map size** = ~10 × 10 each. Smaller than typical Day-1 stitched maps; final-stand should feel claustrophobic, not sprawling.
- **`Day1Map`-→-`Map` rename** = no, not in this spec. The shape is reused for Day 2 without renaming. A mechanical rename can land in its own follow-up spec if/when the name starts hurting.

## Done means

A user opens the preview URL on iPhone Safari portrait. They play a Day-1 procgen map, find a stairwell, walk to it, see the screen transition to a small handcrafted lobby with melee aliens and a visibly tougher commander (longer HP bar). They take damage, use a medkit they picked up earlier, drop the commander, read `"You survived · Day 2 · Lobby · Turn N"` on the run-end overlay, and refresh. They play another run, take the fire-escape this time, land on a rooftop map, hold for 8 turns, and read `"You survived · Day 2 · Rooftop · Turn 8"`. Day-1 death and Day-2 death paths both report the right summary. The §13 Day-4 criterion ("Both Day 2 maps authored. Day 1 → Day 2 transition works. Run-end screen shows the right summary") reads green.
