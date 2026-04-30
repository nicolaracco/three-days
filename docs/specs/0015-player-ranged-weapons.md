# Spec 0015: Player ranged weapons (pistol) + projected hit-chance UI

**Status:** In progress
**Roadmap day:** GDD §13 Day 6 cleanup (closes the §7.1 player-weapon roster modulo shotgun + the Marksman trait stub from spec 0013); honors ADR-0008's projected-targeting contract for the first time on the attack side.
**Owner:** Nicola
**Related ADRs:** ADR-0004 (layered architecture), ADR-0005 (tile/pixel coordinates), ADR-0007 (seeded RNG), ADR-0008 (projected targeting), ADR-0009 (testing discipline), ADR-0011 (world camera)

## Goal

The protagonist gains a pistol alongside their existing melee. Pistol shots cost 2 AP (1 AP with Marksman), consume one round of pistol ammo per shot, and use the line-of-sight + cover + hit-chance pipeline from specs 0012/0014. A new reload action restores ammo from a magazine for 2 AP. Per ADR-0008, every enemy in pistol range with AP and ammo to spare gets a hit-chance halo + tier label drawn into the scene refresh — multiple targets visible at once, no hover required. Marksman lights up fully (its `(no effect yet)` description tag is removed). Resourceful's `+1 ammo magazine` is wired. Shotgun and pistol-pickup mechanics are deferred to follow-up specs.

## Why this, why now

GDD §7.1 lists three player weapons; we ship two of them. The pistol is the lower-cost of the remaining two; shotgun is "very limited ammo, rare drop" and depends on a pickup model that doesn't exist yet. Adding the pistol now:
- **Closes the Marksman trait** (last stubbed trait from spec 0013).
- **Activates ADR-0008's projected-targeting contract** for the first time on the attack side. We do this for movement (`reachableTiles` lights up tiles with AP costs); pistol is the first attack mode where it pays off.
- **Makes cover meaningful from the player side.** Cover currently affects only enemy ranged attacks. Player pistol shots now also experience hit-chance gating; cover between player and enemy reduces player's hit chance.

§12 sub-bars touched:
- **§12.1 Combat feel.** Player gains a real ranged option; the close/far + cover dance becomes a two-sided system.
- **§12.2 Information design.** Projected halos on every reachable target meet the ADR-0008 contract; the player sees their attack options at a glance.

## Scope

### In scope

- **New weapon `pistol`** in `src/data/weapons.json`:
  ```json
  { "id": "pistol", "name": "Pistol", "damage": 1, "range": 99, "apCost": 2 }
  ```
- **Protagonist ammo state.** New fields on `RunState.protagonist`:
  ```ts
  pistolAmmo: number;       // current rounds in chamber
  pistolMagazines: number;  // spare magazines
  ```
  Initialized at run start from balance + traits (see *Starting inventory*).
- **Balance constants** added to `src/data/balance.json`:
  ```json
  "PISTOL_MAG_SIZE": 6,
  "RELOAD_AP_COST": 2
  ```
- **Starting state derivation** in `createRunStateFromMap`:
  - Default: `pistolAmmo = PISTOL_MAG_SIZE` (6), `pistolMagazines = 1` (one spare).
  - Resourceful (per GDD §6.2): `pistolMagazines = 2` (one extra magazine on top of the default).
- **`commitAttack` extension** in `src/systems/combat.ts`:
  - When `params.weaponId === "pistol"` and `params.attackerSide === "player"`, additionally check `state.protagonist.pistolAmmo > 0` before attempting; reject with new `AttackFailure` reason `"no-ammo"`.
  - On a successful attack (regardless of hit/miss — same pattern as AP and rngState propagation per spec 0014), decrement `pistolAmmo` by 1.
  - Marksman's discount: pistol AP cost = 1 when `state.traits.includes("marksman")`. Look up via a small helper `pistolApCost(traits)` in run-state.ts that returns 1 or 2; `commitAttack` reads weapon.apCost as the *baseline* but overrides for player+pistol+Marksman before deducting.
- **`reloadPistol` reducer** in `src/systems/run-state.ts`:
  ```ts
  type ReloadResult =
    | { ok: true; state: RunState }
    | { ok: false; reason: "no-magazines" | "insufficient-ap" | "already-full" };
  ```
  Refills `pistolAmmo` to `PISTOL_MAG_SIZE`, decrements `pistolMagazines` by 1, decrements `currentAP` by `RELOAD_AP_COST`. Reload AP cost stays 2 even with Marksman (the trait discounts shots, not reloads, per GDD §6.2).
- **Player attack flow extensions** in `src/scenes/RunScene.ts`:
  - **Tap an enemy:**
    - Adjacent + AP ≥ melee cost → show melee attack button (existing flow).
    - Has LoS + AP ≥ pistolApCost(traits) + ammo > 0 → show pistol attack button (new).
    - Both apply (adjacent enemy in LoS with AP for both) → two action-area buttons side-by-side, mirroring spec 0010's medkit/flashbang two-button layout.
  - **Pistol staged → "Confirm Pistol" button.** Same stage-then-confirm pattern as melee/items.
  - **New `Staged.kind === "attack-pistol"` variant** alongside the existing `"attack"` (melee). The melee `attack` kind keeps its name for backward compat.
  - **Reload button.** When `pistolAmmo === 0 && pistolMagazines > 0 && currentAP >= RELOAD_AP_COST` and no other action staged, the action area shows a `Reload (2 AP)` button. Tap stages the reload (button label flips to `Confirm Reload`); confirm commits.
- **Projected hit-chance halos.** New `RunScene` method `refreshAttackHalos`. Called from `refreshAll`. Draws on a new `attackHalosLayer: Phaser.GameObjects.Container`:
  - Skipped if pistol unavailable (player turn ended, no AP, no ammo, or runEnd set).
  - For each enemy with LoS from the protagonist:
    - Compute `hitChance({ attacker, target, weaponRange: 99, cover: coverBetween(...) })`.
    - Render a 1 px ring around the enemy's tile (slightly larger than the sprite, color depends on tier; see below).
    - Render a small text label below the enemy showing the tier word: `"certain"` / `"probable"` / `"risky"` / `"unlikely"`. Color matches the ring.
  - Tier color encoding (re-uses palette):
    - certain → `COLOR.hpBarFg` (green)
    - probable → `COLOR.text` (white)
    - risky → `COLOR.exitGateMarker` (yellow)
    - unlikely → `COLOR.enemyMelee` (red)
  - Halos refresh on every state change (turn ends, player moves, ammo depletes). Skipped during animations to avoid flicker.
- **HUD ammo display.** A new compact ammo line on the HUD: `"P 6/6 · M 1"` (pistol ammo / mag size · magazines). Same font/style as the existing AP/HP lines. Replaces nothing; squeezed in at `(8, 38)` (a third HUD line — bumps HUD height from 40 to ~52 px) **OR** colocated next to AP at `(180, 22)`. Spec 0015 picks the colocated variant to avoid changing HUD layout: `apText` becomes `"AP 4/4 · P 6/6 M1"`.
- **Marksman descriptor update.** `src/data/traits.json` — strip the `(no effect yet — pending player ranged weapons)` tag from Marksman's description.
- **Tests.**
  - `src/systems/combat.test.ts` extension — pistol attack ok with ammo + AP; rejected with `"no-ammo"` when ammo=0; ammo decrements on hit *and* miss; Marksman discount drops AP cost to 1.
  - `src/systems/run-state.test.ts` extension — `reloadPistol` happy path + the three rejection reasons; Resourceful starts with 2 magazines; default starts with 1 magazine; Day-2 transition does not refill ammo (carry-forward).
  - `src/data/weapons.json` — pistol entry round-trips through `getWeapon`.

### Out of scope

- **Shotgun** — separate spec. Depends on a pickup mechanic ("rare drop" per GDD §7.1) that doesn't exist.
- **Pistol pickup** — player starts with the pistol equipped. Adding a pickup item adds an `ItemKind` and chunk authoring; defer.
- **Magazine pickup as a map item** — Resourceful's +1 starting magazine is the only way to get extras this spec. Without pickups the player has 12 shots before they're permanently dry; that's enough for a 20-minute run with intentional shooting. If playtest shows it's too tight, a follow-up adds magazine drops.
- **Out-of-ammo + out-of-magazines fallback UI.** Player just doesn't see pistol options. No "you're dry" hint this spec.
- **Marksman's "cannot wield shotguns".** Vacuous without shotgun. Will fire when the shotgun lands.
- **Projected hit-chance UI for *enemy* attacks.** Spec 0012's Vigilant cones already show enemy LoS; a per-enemy attack-chance projection on the protagonist would add complexity for limited gain.
- **Animations for the player firing the pistol** beyond what spec 0012 ships (the existing shot-line animation; this spec reuses it for the player's direction, attacker → target).
- **Sound effects.** Day-6 audio spec.
- **Multiple weapon-slot UI.** The protagonist's two weapons are implicit; the action button auto-picks based on context. No "switch weapon" toggle.

## Inputs

- `state.protagonist.pistolAmmo` / `pistolMagazines` (new fields).
- `state.traits` — Marksman discount, Resourceful ammo grant.
- `state.map.coverTiles` — cover lookup for hit-chance computation (spec 0014).
- `state.enemies` — projection of halos onto valid targets.

## Outputs / Effects

- New pistol weapon entry; new balance constants.
- New protagonist ammo / magazines state.
- New `reloadPistol` reducer.
- `commitAttack` adds `"no-ammo"` failure reason; ammo decrement on pistol attacks.
- `RunScene` gains attack-halos layer rendered when pistol is available; HUD shows compact ammo readout.
- New action mode + Staged variant for pistol attacks; reload button.
- Marksman trait description loses the stub tag.

## Interaction (desktop + mobile, same model)

Per ADR-0008.

- **Always-visible glyphs.** Hit-chance halos surround every reachable enemy when the player has pistol resources to fire. Tier color encodes the level; the text label spells it out.
- **Inspection panel.** Tapping an enemy still works as before (shows enemy detail). The action area now offers melee, pistol, or both — each labeled with its AP cost and (for pistol) tier.
- **Targeting.** Pistol stages exactly like melee: tap an enemy with a halo → "Confirm Pistol" appears → tap-confirm. Tap outside cancels.
- **Confirm flow.** Same as existing.
- **Hit areas.** Halos and labels are visual; the underlying enemy sprite is the tap target (no new touch-target geometry).

## Acceptance criteria

### Pistol weapon

- [ ] **[unit]** `getWeapon("pistol")` returns the new entry with damage 1, range 99, apCost 2.
- [ ] **[unit]** `commitAttack` with weaponId pistol, ammo > 0, sufficient AP + LoS succeeds; ammo decrements by 1; AP decrements by `pistolApCost(traits)`.
- [ ] **[unit]** Same call with ammo=0 rejects with `"no-ammo"`.
- [ ] **[unit]** Pistol miss still decrements ammo and AP (parity with spec 0014's miss path).
- [ ] **[unit]** Marksman: `pistolApCost(["marksman", ...])` returns 1; non-Marksman returns 2.

### Reload

- [ ] **[unit]** `reloadPistol` happy path: refills `pistolAmmo` to PISTOL_MAG_SIZE; decrements `pistolMagazines` by 1; decrements `currentAP` by 2.
- [ ] **[unit]** `reloadPistol` rejects `"no-magazines"` when `pistolMagazines === 0`.
- [ ] **[unit]** `reloadPistol` rejects `"insufficient-ap"` when `currentAP < 2`.
- [ ] **[unit]** `reloadPistol` rejects `"already-full"` when `pistolAmmo === PISTOL_MAG_SIZE`.

### Starting state

- [ ] **[unit]** Default run: `pistolAmmo === 6`, `pistolMagazines === 1`.
- [ ] **[unit]** Resourceful run: `pistolAmmo === 6`, `pistolMagazines === 2`.
- [ ] **[unit]** Day-2 transition does NOT refill ammo (carry-forward); `pistolMagazines` and `pistolAmmo` survive verbatim.

### Halos + UI

- [ ] **[manual]** With pistol available + AP + ammo, every enemy in LoS shows a colored ring + tier label.
- [ ] **[manual]** Tier colors match the spec mapping (certain green, probable white, risky yellow, unlikely red).
- [ ] **[manual]** Halos disappear when ammo runs out or AP drops below pistol cost.
- [ ] **[manual]** Reload button appears when `ammo === 0 && magazines > 0 && AP >= 2`. Tap → Confirm Reload → ammo refills.
- [ ] **[manual]** HUD ammo readout updates after every shot and reload.
- [ ] **[manual]** Tap an enemy with a halo → action-area shows `Confirm Pistol — <tier>`. Confirm commits.
- [ ] **[manual]** Tap an adjacent enemy in LoS → both melee and pistol buttons appear in the two-button layout from spec 0010.

### Marksman

- [ ] **[manual]** With Marksman picked, the pistol button reads `Pistol (1 AP) — <tier>`. Without Marksman, `Pistol (2 AP) — <tier>`.
- [ ] **[manual]** Marksman trait description in the picker no longer carries the `(no effect yet)` suffix.

### iPhone Safari portrait

- [ ] **[manual]** Halos + tier labels readable at one arm's length without zoom on the rooftop's exposed map (the densest projection scenario — 4 enemies, all in LoS).
- [ ] **[manual]** HUD ammo readout legible alongside AP at the existing 13 px font; doesn't truncate.

## Test plan

### Automated tests (red-green)

- `src/systems/combat.test.ts` extension — pistol attack happy + no-ammo + ammo decrement + Marksman discount.
- `src/systems/run-state.test.ts` extension — `reloadPistol` happy + 3 rejection reasons; Resourceful magazine count; Day-2 ammo carry-forward.
- `src/systems/weapon.test.ts` (existing) — pistol entry test (ID, damage, range, apCost).

### Manual play-test (verify)

- **Scenario: rooftop pistol fight.**
  - Pick any two traits (Marksman illustrative — pistol is 1 AP).
  - Take fire-escape → rooftop. Halos cover all 4 enemies; their tier labels reveal which to prioritize.
  - **Pass:** four halos render; player can tap any enemy and fire; ammo decrements on each shot.
- **Scenario: lobby cover from the attacking side.**
  - Take stairwell → lobby. Move to a position where a cover tile sits between you and the central ranger. Tap the ranger.
  - **Pass:** the halo + label read `risky` (cover at Manhattan ≤ 4) or `unlikely` (cover at distance > 4); confirms the cover model works for player attacks too.
- **Scenario: ammo exhaustion + reload.**
  - Fire 6 shots without reloading. Ammo drops to 0. Reload button appears. Reload. Ammo restores to 6.
  - **Pass:** magazines drops from 1 to 0; subsequent dry-pistol gives no halos and no reload button.
- **Scenario: Marksman discount.**
  - Pick Marksman. With AP 4 and full ammo, tap a ranged enemy in LoS twice in one turn.
  - **Pass:** both shots commit (1 AP each = 2 AP total, leaves 2 AP for a third shot or move).
- **Scenario: melee + pistol both available on adjacent enemy.**
  - Adjacent to a melee alien with AP 4 + ammo > 0.
  - **Pass:** action area shows two buttons (Melee + Pistol). Either fires correctly.

## Open questions

All five resolved at proposal time (per the user's "Perfect. Go ahead" approval):

- **Pistol availability.** Player starts with it equipped. No pickup item.
- **Ammo model.** 6 shots/magazine, 1 starting magazine (Resourceful → 2).
- **Reload cost.** 2 AP per GDD §7.1.
- **Marksman discount.** Pistol shots cost 1 AP (down from 2); reload stays 2 AP regardless.
- **UI mode.** Projected — every reachable enemy gets a halo + tier label simultaneously per ADR-0008.

## Done means

A user opens the preview URL on iPhone Safari portrait, picks Marksman + Resourceful, takes the fire-escape, lands on the rooftop with **18 shots** (6 ammo + 2 magazines × 6) and the pistol cost discounted to 1 AP. Every alien in LoS wears a colored halo; the player taps the most exposed one (probable, white halo), fires for 1 AP, watches the shot draw and the alien lose 1 HP. They reload after a magazine, switch to melee for an adjacent kill, finish the rooftop's 8 turns. The §13 Day-6 player-weapon contract is closed except for the shotgun, which lands in a follow-up spec when the pickup mechanic does. The Marksman trait is no longer stubbed.
