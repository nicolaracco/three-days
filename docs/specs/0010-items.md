# Spec 0010: Items — medkit and flashbang

**Status:** In progress
**Roadmap day:** GDD §13 Day 3 (closes the "enemy and item placement works" criterion)
**Owner:** Nicola
**Related ADRs:** ADR-0004 (layered architecture), ADR-0005 (tile/pixel coordinates), ADR-0007 (seeded RNG), ADR-0008 (UI architecture — item glyphs, panel, selection), ADR-0011 (world camera)

## Goal

Two consumable items per GDD §7.1: **medkit** (heal protagonist by `ITEM_MEDKIT_HEAL` HP, capped at `maxHP`) and **flashbang** (stun every enemy in the protagonist's 4-neighborhood for 1 enemy turn). Items are picked up by walking onto them, tracked in a `protagonist.inventory` counter, and used through the same staged-then-confirmed action pattern as move/attack. Each chunk JSON gains an `itemSlots` field so authors place items in meaningful spots; procgen aggregates the slots and materializes one item per slot. Closes the §13 Day-3 "item placement works" criterion. Day-3 deliverable becomes complete; Day-4 (Day chain + Day-2 maps) lands on top.

## Why this, why now

GDD §7.1 lists items as a core combat-system component (alongside weapons and AP economy). §13 Day-3 names item placement as a closing criterion. ADR-0008's always-visible-glyph contract already includes "item icon rendered on the tile." Items are #5 of 6 on the §13.1 cut list, so by the rule "cuts come from the top," they stay unless cut pressure forces them out — which it has not. Without items the player has only one tactical lever (move + attack); items add a second axis of decision (heal-now vs save-for-later, stun this group vs that one) that pulls weight in the §12.1 combat-feel bar.

§12 sub-bars touched:
- **§12.1 Combat feel.** Item use is a 1-AP action with immediate effect; flashbang in particular gives the player a "save myself" tool that combat without items lacks.
- **§12.2 Information design.** Items on tiles, inventory in panel, stun marker over stunned enemies — all glyphed per ADR-0008.
- **§12.5 Onboarding.** "Pick up the green square, use it to heal" is implicit through visual coherence; no tutorial pop-up needed.

## Scope

### In scope

- **Item data model** in `src/systems/item.ts`:
  ```ts
  export type ItemKind = "medkit" | "flashbang";
  export interface Item { position: TilePos; kind: ItemKind; }
  ```
- **Inventory model** on `RunState.protagonist`:
  ```ts
  inventory: { medkit: number; flashbang: number };
  ```
  Initialized to `{ medkit: 0, flashbang: 0 }`. Trait-based starting inventory (Hypochondriac, Resourceful per GDD §6.2) is Day-5 territory and out of scope here.
- **Items on the runtime map** in `RunState.itemsOnMap: Item[]`. Initialized from `Day1Map.itemsOnMap` (procgen output). Items are removed from this array when picked up.
- **Chunk JSON `itemSlots` field.** Each chunk JSON gains:
  ```ts
  itemSlots: Array<{ col: number; row: number; kind: ItemKind }>
  ```
  Empty array allowed. Loader validates the kind. Existing 8 chunks each gain 0–1 item slots (a few medkits, a couple of flashbangs) so generated maps carry 1–3 items typically.
- **Procgen materialization.** `materialize` aggregates each placed chunk's `itemSlots` into a single `Day1Map.itemsOnMap` array (translated to absolute coordinates), parallel to the existing spawn-slot aggregation. No randomized subset; every authored slot is realized — chunks control density via what they author.
- **Pickup mechanic.** In `RunScene.afterPlayerMove`, after the existing exit-detection, check if the protagonist's position equals any item's position. If yes: increment the matching `inventory` counter, remove the item from `state.itemsOnMap`, refresh the panel + map. **No AP cost** for pickup — it's incidental to movement.
- **Stun model on enemies.** `Enemy.stunnedTurns: number`, initialized to 0. Stunned enemies are skipped during the enemy turn; `stunnedTurns` decrements once per enemy-turn entry whether they would have moved or not.
- **Use action** in `src/systems/run-state.ts` and `src/systems/turn.ts`:
  - `useMedkit(state): UseItemResult` — checks `inventory.medkit > 0`, `currentAP >= USE_ITEM_AP_COST`, **and `currentHP < maxHP`**; on success, heals `min(maxHP, currentHP + ITEM_MEDKIT_HEAL)`, decrements inventory and AP. Returns a tagged `{ ok: true, state }` / `{ ok: false, reason }` result. The `reason` union includes `"no-item" | "insufficient-ap" | "at-full-hp"`.
  - `useFlashbang(state): UseItemResult` — same precondition checks; on success, sets `stunnedTurns = 1` on every enemy whose position is at Manhattan distance 1 from the protagonist (4-neighbors), decrements inventory and AP. Affects 0 enemies if none adjacent — that's a wasted bang on the player; the spec accepts it.
- **Balance constants** added to `src/data/balance.json`:
  ```json
  "USE_ITEM_AP_COST": 1,
  "ITEM_MEDKIT_HEAL": 2
  ```
  Per GDD §7.1 ("use item 1 AP"); heal amount picked at 2 (≈ 33 % of `PROTAGONIST_HP = 6`).
- **Renderer in `RunScene`.**
  - **Items on map.** A small shape rendered above the floor tile at each `state.itemsOnMap` entry:
    - Medkit: filled square 12 × 12 px, centered on the tile, color `COLOR.hpBarFg` (existing green).
    - Flashbang: filled circle radius 6 px, centered on the tile, color `COLOR.stagedHaloStroke` (existing yellow).
    These are world-space objects and scroll with the camera.
  - **Stunned enemies.** While `stunnedTurns > 0`, the enemy circle's fill switches to a desaturated grey (`0x707070`, a one-off muted variant of the existing `enemyMelee` red — picked so it reads "out of action" rather than "different unit type"). The tint reverts on the cycle the stun expires. Implemented by tracking the stun state in `refreshEnemySprites` and re-applying the appropriate `setFillStyle` per render pass; no extra game object.
  - **Inventory in panel.** When the protagonist is selected, the panel's `line2` becomes `Medkits: N · Flashbangs: M` (replaces the existing `Position (col, row)` line — the protagonist sprite is visible on the map).
  - **Item-on-tile panel detail.** When the selected tile carries an item, the panel branches: title `Item — {Medkit|Flashbang}`, line1 = the move-cost line (existing Reachable/Out-of-range logic, since picking up requires walking there), line2 = a one-line tell (`Heals 2 HP` / `Stuns adjacent aliens for 1 turn`).
- **Action-area buttons for item use.** When the protagonist is selected and the action area is otherwise hidden:
  - 0 items in inventory → no buttons (action area stays hidden).
  - 1 item in inventory → single button at the existing `132 × 36` action-button position, label `Use Medkit (1 AP)` or `Use Flashbang (1 AP)`.
  - 2 items in inventory → two `62 × 36` buttons side by side in the same area, labels `Medkit (1)` / `Flash (1)`. Hit areas padded to ≥ 44 × 44 logical px (per ADR-0008).
  - Tap an item button → stage that item's use (action area collapses to one full-width `Confirm Use {item}` button, mirror of the existing confirm-move/confirm-attack pattern). Second tap on the confirm button commits; tapping any tile / unit cancels the stage.
  - Cap on item use: at most one item committed per turn cycle is **not** enforced — the player may chain item uses while AP allows.
- **`computeActionMode` extension.** New `ActionMode` variants: `"stage-medkit" | "stage-flashbang" | "confirm-medkit" | "confirm-flashbang"`, slotting into the existing mode-driven button rendering.
- **`Staged` extension.** `Staged` union gains `{ kind: "use-item"; itemKind: ItemKind }` so item staging is parallel to move/attack staging and benefits from the existing clear-on-other-selection logic.
- **Enemy turn loop in `runEnemiesSequentially`.** Before calling `enemyAct`, check `enemy.stunnedTurns > 0`. If yes: skip (no animation, no AP spend), decrement `stunnedTurns` on the state, and proceed to the next enemy. If 0: act as before (`enemyAct` returns `idle` / `moved` / `attacked`).
- **Tests.**
  - `src/systems/item.test.ts` (new) — pickup reducer (idempotent when no item at position; correct increment when one is there).
  - `src/systems/run-state.test.ts` extension — `useMedkit` (AP gating, inventory gating, heal cap at maxHP, AP decrement); `useFlashbang` (AP gating, inventory gating, only-adjacent-enemies stunned, AP decrement).
  - `src/systems/turn.test.ts` extension — stunned enemy is skipped and `stunnedTurns` decrements; same enemy is normal on the next turn.
  - `src/systems/procgen.test.ts` extension — every authored chunk slot is realized in `Day1Map.itemsOnMap`; positions translated correctly across negative-offset chunks.
  - `src/systems/chunk.test.ts` extension — `itemSlots` round-trip from JSON to typed Chunks.

### Out of scope

- **Trait-based starting inventory.** Hypochondriac (2 medkits start), Resourceful (1 flashbang + extra ammo) per GDD §6.2 — Day 5 territory.
- **Pistol / shotgun / ammo / reload.** GDD §7.1 lists three weapons; only improvised melee is implemented. Ranged weapons need their own spec (likely Day 4 alongside ranged enemies).
- **Item drops on enemy death.** Not in GDD; could be added later if balance pressure demands it.
- **Targeted flashbang.** GDD doesn't specify aim. Self-centered 4-neighbor AOE is the simplest interpretation; "throw the flashbang at a tile" can be a follow-up spec if playtest demands it.
- **Item stacking limits / max inventory.** Inventory is unbounded counters this spec. Cap can be added later if exploits emerge.
- **Trait-gated items.** None planned.
- **Item discard / drop.** Inventory is one-way: pickup, then use.
- **Real item art.** Day 7. Placeholder shapes are spec.
- **Audio for item use.** Day 6. SFX hooks are not in this spec.
- **Multi-tile pickup (line of items, e.g. "scatter").** One position one item.

## Inputs

- 8 chunk JSON files in `src/data/chunks/` — gain `itemSlots` field this spec.
- `RunState.seed` → already plumbed; same RNG drives map gen and is available for any future randomization (this spec doesn't add new RNG calls).
- `state.protagonist.position` for pickup detection and flashbang AOE center.
- `state.itemsOnMap` for pickup lookup and renderer.
- `state.enemies` (each with new `stunnedTurns`) for flashbang application and turn-loop skip.

## Outputs / Effects

- New `Day1Map.itemsOnMap: Item[]` field, populated by procgen.
- New `RunState.itemsOnMap: Item[]`, mutated as items are picked up.
- New `protagonist.inventory: { medkit: number; flashbang: number }`, mutated on pickup and use.
- New `Enemy.stunnedTurns: number`, mutated on flashbang and on enemy-turn entry.
- New world-space rendered shapes: one item-shape per `itemsOnMap` entry, one stun-marker per stunned enemy.
- New panel branches: protagonist line2 = inventory; tile selection with item present = item detail.
- New action-area button modes: stage / confirm medkit; stage / confirm flashbang.
- Healed protagonist on medkit use; reduced HP cap visibly via the existing HP bar refresh.
- Skipped enemy turns when stunned, visible via no movement + the stun marker fading the next cycle.

## Interaction (desktop + mobile, same model)

Per ADR-0008.

- **Always-visible glyphs.**
  - Each item on the map carries a colored shape on its tile, no hover required.
  - Each stunned enemy carries a small yellow marker until the stun ends.
  - The protagonist's inventory is in the panel whenever the protagonist is selected (which is the default selection at the start of every turn, per ADR-0008).
- **Inspection panel.**
  - Selecting a tile with an item shows item type + reachability + tell.
  - Selecting the protagonist shows HP/AP + inventory.
- **Targeting.**
  - Medkit: no tile selection required; staging itself is the "targeting." Self-targeted.
  - Flashbang: same — self-centered AOE, no tile selection. The 4-neighbor enemies are the implicit targets; if the player wants to confirm which enemies will be stunned, they read the map (adjacent enemy sprites). The spec accepts that this is inferred from position rather than highlighted; if playtest shows it's unclear, a follow-up adds halos over the affected enemies during stage.
- **Confirm flow.**
  - Tap item button → stage (action area collapses to the confirm button).
  - Tap confirm button → commit.
  - Tap outside (any tile, any unit, the same item button) → cancel stage.
- **Hit areas.** Item buttons have ≥ 44 × 44 logical px hit areas even when their visual is `62 × 36`, padded via the same `Phaser.Geom.Rectangle` trick as the End Turn button.

## Acceptance criteria

### Pickup

- [ ] **[unit]** A unit test on `pickupItemAt(state, position)` increments the matching inventory counter and removes the item from `state.itemsOnMap` when one is present at that position.
- [ ] **[unit]** Same call is a no-op (returns the input state unchanged) when no item is at the position.
- [ ] **[manual]** Walking the protagonist onto a medkit tile picks it up: the green square disappears from the tile, the inventory line in the panel reads `Medkits: 1 · Flashbangs: 0` immediately.
- [ ] **[manual]** Same for a flashbang: yellow circle gone, panel reads `Medkits: 0 · Flashbangs: 1`.

### Use — medkit

- [ ] **[unit]** `useMedkit(state)` rejects (`{ ok: false, reason: "no-item" }`) when `inventory.medkit === 0`.
- [ ] **[unit]** Rejects (`reason: "insufficient-ap"`) when `currentAP < USE_ITEM_AP_COST`.
- [ ] **[unit]** Rejects (`reason: "at-full-hp"`) when `currentHP === maxHP`. Inventory and AP unchanged.
- [ ] **[unit]** On success, heals by `ITEM_MEDKIT_HEAL`, capped at `maxHP`; decrements `inventory.medkit` and `currentAP` by the right amounts.
- [ ] **[manual]** Damage the protagonist (let an enemy hit), pick up a medkit, tap `Use Medkit (1 AP)`, tap confirm — HP bar fills, panel inventory drops, AP drops by 1 within ~250 ms.

### Use — flashbang

- [ ] **[unit]** `useFlashbang(state)` rejects with `"no-item"` and `"insufficient-ap"` symmetric to medkit.
- [ ] **[unit]** On success, every enemy in 4-neighbor positions of the protagonist gains `stunnedTurns = 1`; non-adjacent enemies are unchanged. Inventory and AP decrement.
- [ ] **[unit]** Wasted bang (no enemies adjacent) still decrements inventory and AP — the player chose to spend.
- [ ] **[manual]** Walk into melee range of an enemy, tap `Use Flashbang`, confirm — yellow stun marker appears above that enemy's tile, panel inventory drops, AP drops by 1.

### Stun behavior

- [ ] **[unit]** A stunned enemy in `runEnemiesSequentially` is skipped (no `enemyAct` call); their `stunnedTurns` decrements to 0.
- [ ] **[unit]** On the next enemy turn, the same enemy acts normally.
- [ ] **[manual]** End the player turn after using flashbang on an adjacent melee alien — the alien doesn't move or attack on its turn; on the cycle after that it acts normally and the stun marker is gone.

### Procgen + chunk authoring

- [ ] **[unit]** `loadChunks` round-trips `itemSlots` from JSON into typed `Chunk` objects with the right `kind` per slot.
- [ ] **[unit]** `Day1Map.itemsOnMap` aggregates all chunk-authored slots, translated to absolute coordinates after normalization.
- [ ] **[unit]** Same seed produces the same `itemsOnMap` (positions and kinds).
- [ ] **[manual]** Across 5+ refresh-generated maps, every map shows at least one item somewhere.

### Renderer + selection

- [ ] **[manual]** Items render as the right shape and color (green square / yellow circle) on the right tile.
- [ ] **[manual]** Tapping a tile with an item shows the item-detail panel (`Item — Medkit` / one-line tell / cost-to-reach).
- [ ] **[manual]** Action-area buttons appear when the protagonist is selected and inventory > 0; layout matches the 1-item / 2-item rule. Both buttons reachable with a thumb on iPhone Safari portrait.
- [ ] **[manual]** Tapping outside cancels a staged item use; the action area returns to the inventory-button view.

### iPhone Safari portrait

- [ ] **[manual]** All glyphs (item shapes, stun marker, inventory text) legible at one arm's length, no zoom required. If 12 × 12 / radius 6 is too small, bump in implementer's discretion and amend the spec.

## Test plan

### Automated tests (red-green)

- `src/systems/item.test.ts` — pickup reducer cases.
- Extend `src/systems/run-state.test.ts` — `useMedkit` / `useFlashbang` tagged-result cases (gate, success, edge cases).
- Extend `src/systems/turn.test.ts` — stunned-enemy skip + decrement; second-turn normal behavior.
- Extend `src/systems/procgen.test.ts` — `itemsOnMap` aggregation, determinism per seed, slot translation across negative-offset chunks.
- Extend `src/systems/chunk.test.ts` — `itemSlots` JSON round-trip; rejection of unknown kinds.

### Manual play-test (verify)

- **Scenario: pickup loop.** Walk to a visible item tile, observe pickup, observe panel inventory update.
  - **Pass:** item glyph gone, inventory increments by 1.
  - **Targets:** desktop + iPhone Safari portrait.
- **Scenario: medkit heal cap.** With protagonist at full HP, use a medkit. **Pass:** HP unchanged (already at cap), inventory still decrements (the player chose to use it). If this feels bad in playtest, add a precondition to reject use-at-cap; defer to feel.
- **Scenario: flashbang adjacency.** Use flashbang next to one melee alien but not another. **Pass:** only the adjacent alien shows the stun marker and skips its next turn.
- **Scenario: chained item use.** With 2 medkits and full AP, use both in the same turn. **Pass:** both AP costs deduct, inventory drops by 2, HP bar updates twice.
- **Scenario: caption / glyph collision.** On a tightly packed chunk, place an item and an exit visually close (not on the same tile — items on item slots, exits on connector positions, so collision is unlikely, but verify). **Pass:** both glyphs visible, neither overlaps the other.
- **Targets:** desktop + iPhone Safari portrait, all scenarios.

## Open questions

All three resolved at spec-approval time:

- **Use-at-cap medkit.** Reject. `useMedkit` returns `{ ok: false, reason: "at-full-hp" }` when `currentHP === maxHP`. Inventory and AP are unchanged; the action-area button does **not** trigger the wasted-state panel hint (it just no-ops on commit). The button itself stays visible and tappable; the rejection is surfaced via the same silent-no-op pattern as a move with insufficient AP — `commitMove` already returns a tagged result that the scene drops on the floor.
- **Stun visual.** Sprite tint. Stunned enemy sprites are repainted to the muted grey defined in **Renderer / stunned enemies** above. The cosmetic flash on hit (`flashSprite`) restores to the *current* color (grey while stunned, red otherwise) so a stunned-and-hit alien briefly flashes white then returns to grey.
- **Wasted-bang feedback.** Brief panel hint. When `useFlashbang` succeeds but stuns 0 enemies, the panel writes a one-shot transient line `"No enemies in range"` for ~1500 ms, then refreshes from the current selection. Implementation: a `transientPanelHintUntil: number` (Phaser scene time) member; `refreshPanel` checks it first and renders the hint instead of the selection-derived content while the timer is live, then a `delayedCall` clears it and forces a refresh. Selection changes during the hint window override it (the player's most recent action wins).

## Done means

The user opens the preview URL, walks to a green square on the floor, sees the panel inventory increment, walks adjacent to a melee alien, taps the flashbang button, taps confirm, sees the alien gain a yellow stun marker and skip its next turn. They walk to a medkit on a different chunk, pick it up, take a hit, use the medkit, see HP recover. All on iPhone Safari portrait at one arm's length, no zoom. The §13 Day-3 criterion "Enemy and item placement works" reads green.
