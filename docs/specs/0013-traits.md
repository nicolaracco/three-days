# Spec 0013: Traits — character generation, pre-run picker, 4-of-5 wired

**Status:** In progress
**Roadmap day:** GDD §13 Day 5 (closes the "5 traits implemented · 2-trait character generation works" milestone modulo player ranged weapons; Marksman ships stubbed and lights up when its weapons land)
**Owner:** Nicola
**Related ADRs:** ADR-0002 (state model), ADR-0004 (layered architecture), ADR-0007 (seeded RNG), ADR-0008 (UI architecture — picker), ADR-0009 (testing discipline), ADR-0011 (world camera)

## Goal

Per GDD §6.1, every run begins with the player picking 2 of 5 traits. The trait choice modifies starting inventory, mid-run rules, and (for Athletic) which Day-1 exit is reachable. A new `TraitsScene` between `MenuScene` and `RunScene` shows the 5 trait cards, lets the player tap two, and starts the run carrying the chosen traits in `RunState`. Four traits ship fully wired (Athletic, Hypochondriac, Vigilant, Resourceful); Marksman ships stubbed in the pool with a "no effect yet — pending player ranged weapons" descriptor so the 5-trait promise from GDD §6.2 is honored without forcing this spec to wait on weapons.

## Why this, why now

GDD §13 Day 5 is "Traits, character generation, information design pass." The §13.1 cut list ranks traits at #2 — second-only-to-content cuts, which means traits are load-bearing for run identity. Adding character variety via traits is the highest-impact remaining change to the §12.1 combat-feel and §12.5 onboarding bars: each trait alters the run's first three turns measurably (different inventory, different reachable exits, different damage texture), and that's exactly the §12.5 "first three turns teach the game" lever. Spec 0012 just landed ranged enemies + LoS, which unblocks Vigilant's signature effect (LoS cones) — without that dependency, Vigilant would have been stub territory; with it, only Marksman remains stubbed.

§12 sub-bars touched:
- **§12.1 Combat feel.** Traits change the AP/inventory math from turn 1 — runs feel different.
- **§12.2 Information design.** The trait picker is itself an IA surface (no hover, always-visible card descriptions). Vigilant's persistent LoS cones add a glyphed threat layer per ADR-0008.
- **§12.5 Onboarding.** Picking traits = picking a starting hypothesis about how to play; the player learns the game by leaning into their trait choice.

## Scope

### In scope

- **`src/data/traits.json`** — 5 entries. Each:
  ```ts
  { id: TraitId; name: string; description: string; }
  ```
  Where `TraitId = "athletic" | "hypochondriac" | "vigilant" | "resourceful" | "marksman"`. Marksman's description appends `" (no effect yet — pending player ranged weapons)"`.
- **`src/systems/trait.ts`** — types and lookups:
  ```ts
  export type TraitId = "athletic" | "hypochondriac" | "vigilant" | "resourceful" | "marksman";
  export interface Trait { id: TraitId; name: string; description: string; }
  export function loadTraits(): Trait[];   // cached
  export function getTrait(id: TraitId): Trait;
  ```
- **`RunState.traits: TraitId[]`** — array of length 2. Threaded through `createRunState({ seed, traits })` and `createRunStateFromMap`.
- **Protagonist trait-state extensions:**
  ```ts
  protagonist.hypochondriacPenaltyPending: boolean;     // arm: damage taken; consume: next player turn
  protagonist.hypochondriacTriggeredThisMap: boolean;   // ensures one-shot per map
  ```
  Both reset to `false` on every map entry (Day 1 init + Day-2 transition).
- **Starting inventory derives from traits.** New baseline (per GDD §6.2's Hypochondriac wording "instead of 1"): **1 medkit, 0 flashbang** for any run. Trait modifiers stack:
  - **Hypochondriac** → starting medkit count = 2 (overrides baseline).
  - **Resourceful** → flashbang count = 1; appends one extra `medkit` `Item` to `state.itemsOnMap` at the protagonist's `start` tile (procgen Day-1 entrance, or Day-2 lobby/rooftop start).
  - All other traits leave inventory at baseline.
- **Athletic — fire-escape gate enforcement + turn-1 AP bonus:**
  - In `commitMove`, if the destination is an exit with `traitGate === "athletic"` and `state.traits.includes("athletic")` is `false`, reject with `{ ok: false, reason: "gated" }`. New failure reason added to `CommitMoveResult`.
  - `RunScene.refreshTargeting` filters out gated exits the player can't pass — they don't appear in the reachable overlay so the AP-cost preview stays honest.
  - `createRunStateFromMap` and `transitionToDay2`: if Athletic, set `protagonist.currentAP = maxAP + 1` for the first player turn of that map. `advanceTurn(enemy → player)` continues to refill to `maxAP` — the +1 only fires on map entry.
- **Hypochondriac — penalty after damage:**
  - In `commitAttack`, when an attack reduces protagonist HP and the player has Hypochondriac and `hypochondriacTriggeredThisMap === false`, set `hypochondriacPenaltyPending = true`.
  - In `advanceTurn` (enemy → player transition), if `hypochondriacPenaltyPending`, refill AP to `maxAP - 1` (instead of `maxAP`), clear pending, set triggered. The penalty fires exactly once per map.
- **Vigilant — LoS cones + heal block:**
  - `useMedkit` adds a new failure reason `"trait-blocked"` and rejects when `state.traits.includes("vigilant")`. The action button stays visible but commits as a no-op (mirrors the spec-0010 at-full-hp pattern).
  - `RunScene` renders persistent LoS cones: a `losConesLayer: Phaser.GameObjects.Container` is rebuilt on every state change. For each ranged enemy, every walkable tile that has `hasLoS(enemy.position, tile, map)` gets a tinted overlay (alpha 0.15, color `COLOR.enemyMelee`). Skipped entirely when Vigilant is not active so the rest-of-cast play stays uncluttered.
- **Resourceful — flashbang + entrance consumable:** handled at run-start by the inventory derivation above.
- **Marksman — stub:** included in the picker pool with the appended "(no effect yet)" tag. The trait carries no runtime side effect this spec; selection is honored, the trait shows in the panel's protagonist line on Day 2 inspection (a subtle hint that "your run carries this trait"), and a follow-up spec wires its effects when player ranged weapons land.
- **`TraitsScene`** in `src/scenes/TraitsScene.ts`:
  - Phaser scene wired into `main.ts`'s scene array between `MenuScene` and `RunScene`.
  - Layout: title text "Pick 2 traits" at top (~y = 40); five vertical trait cards (each ~340 × 84 px, gap 8 px, anchored from y = 80); selection counter "X / 2 selected" at bottom; "Start run" button at the very bottom (enabled when `X === 2`, disabled otherwise).
  - Each card shows name (16 px) + description (11 px wrapped). Tapping a card toggles its selection (subject to the cap of 2). Selected cards get a `COLOR.stagedHaloStroke` border; unselected stay with `COLOR.tileBorder`.
  - Hit areas: each card's tap zone is the full card rectangle (~340 × 84, well above 44 × 44 ADR-0008 minimum). The "Start run" button is at least 132 × 36.
  - On "Start run", calls `this.scene.start("RunScene", { traits: [...selectedIds] })`.
- **`MenuScene` rewire:** the existing "Start" button now calls `this.scene.start("TraitsScene")` instead of `RunScene`. No other Menu changes.
- **`RunScene.init(data)` extension:** accepts `{ initialState?, traits? }`. If `traits` is present, fresh-Day-1 `createRunState` is called with those traits. If `initialState` is present (Day-2 transition path from spec 0011), traits are carried by the existing state — the field is on `RunState` already.
- **Panel hint of active traits.** When the protagonist is selected on Day 2 (where the existing panel objective line replaces the inventory line), append the trait list onto the *first* line as a compact suffix: e.g. `"HP 5/6 · AP 4/4 · [Athletic, Hypochondriac]"`. Day 1's panel keeps its existing inventory line. This is the lightest-weight visible reminder that traits are active during play.

### Out of scope

- **Marksman's effects.** Pistol AP discount + shotgun ban depend on player ranged weapons that don't exist. Marksman ships in the pool but lights up in a follow-up spec (the player-ranged-weapons spec).
- **Trait re-roll / random pick.** GDD §6.1 mentions "picks (or rolls)"; this spec ships pick-only. A "Roll" button is a v2.
- **Trait swap mid-run.** Locked-in at run start.
- **Audio for trait selection / Vigilant cones / Hypochondriac penalty.** Day-6 audio spec.
- **Real picker art / themed trait icons.** Day-7 swap. Placeholder is text cards.
- **Cover system + qualitative hit chance.** Separate spec, deepens combat after traits.
- **Day-5 IA pass review.** Per GDD §13 Day 5, the day also includes "All HUD elements from §12.2 visible without searching." That's a manual play-test review, not a feature spec — handled outside this spec via a §12.2-checkpoint pass.
- **Localization.** Trait names + descriptions are English-only.
- **Marksman's "cannot wield shotguns" social-fiction cue.** Without shotguns, the rule is vacuous; no UI for it.

## Inputs

- `src/data/traits.json` (new).
- `RunState.traits` populated from `TraitsScene`'s selection.
- `state.protagonist` for HP/AP/inventory derivation.
- `state.enemies` filtered by `kind === "ranged"` for Vigilant cones.
- `state.map.tiles` for LoS lookups in Vigilant cones.

## Outputs / Effects

- New `src/data/traits.json` with 5 entries.
- New `src/systems/trait.ts` (types + loaders).
- New `src/scenes/TraitsScene.ts`.
- `RunState` gains `traits: TraitId[]`.
- `protagonist` gains `hypochondriacPenaltyPending`, `hypochondriacTriggeredThisMap`.
- `commitMove` adds `"gated"` failure reason.
- `useMedkit` adds `"trait-blocked"` failure reason.
- New `losConesLayer` in `RunScene` rendered when Vigilant is active.
- Starting inventory shifts from `{ medkit: 0, flashbang: 0 }` to `{ medkit: 1, flashbang: 0 }` baseline (matches GDD §6.2 implicit baseline).

## Interaction (desktop + mobile, same model)

Per ADR-0008.

- **Picker — always-visible glyphs:** every trait's name and full description are visible on the card without hover. Selected state is rendered as a colored border; the counter and Start button reflect the player's choices in real time.
- **Inspection panel during run:** the active trait list shows in the protagonist line on Day 2 (the smallest cost change to existing panel); Day 1 stays unchanged because traits don't change Day-1 panel readout meaningfully (their effects are inventory and turn-1 AP, both already visible).
- **Targeting:** the reachable overlay filters out Athletic-gated exits when Athletic is not picked. The player physically cannot stage a move onto a fire-escape without Athletic.
- **Confirm flow:** trait selection requires explicit "Start run" tap (does not auto-start when the second card is selected). Lets the player change their mind.
- **Hit areas:** trait cards are ~340 × 84 (well above 44 × 44). Start button ≥ 132 × 36 with 44-px hit padding.

## Acceptance criteria

### Picker

- [ ] **[unit]** `loadTraits()` returns the 5 trait records with `id`, `name`, `description`. Marksman's description includes the `(no effect yet)` tag.
- [ ] **[manual]** `TraitsScene` renders 5 cards; tapping a card toggles selection up to 2 max; Start button is disabled at 0 / 1 selections and enabled at 2.
- [ ] **[manual]** "Start run" launches a Day-1 procgen run carrying the two chosen trait IDs; the panel on Day 2 shows them in the protagonist line.
- [ ] **[manual]** On iPhone Safari portrait, all 5 cards fit on screen without overlap; descriptions wrap legibly at 11 px.

### Athletic

- [ ] **[unit]** `commitMove` rejects with `"gated"` when the destination tile is a fire-escape and `traits` does not include `"athletic"`.
- [ ] **[unit]** `commitMove` succeeds onto the same tile when `traits` includes `"athletic"`.
- [ ] **[unit]** `createRunStateFromMap` with `traits: ["athletic", ...]` sets `protagonist.currentAP === maxAP + 1`.
- [ ] **[manual]** Without Athletic: the fire-escape exit appears on the map but is not in the reachable overlay; tapping it does nothing. With Athletic: it's reachable and walking onto it transitions to the rooftop.

### Hypochondriac

- [ ] **[unit]** `createRunStateFromMap` with `traits: ["hypochondriac", ...]` starts with `inventory.medkit === 2`.
- [ ] **[unit]** Without Hypochondriac, baseline is `inventory.medkit === 1`.
- [ ] **[unit]** Taking damage with Hypochondriac arms `hypochondriacPenaltyPending`. After `advanceTurn` (enemy → player), `currentAP === maxAP - 1` and the penalty is consumed (`pending === false`, `triggered === true`).
- [ ] **[unit]** Taking damage *again* in the same map after the penalty has fired does NOT re-arm — it's one-shot per map.
- [ ] **[unit]** Day-2 transition resets both flags (penalty re-arms in the new map).

### Vigilant

- [ ] **[unit]** `useMedkit` rejects with `"trait-blocked"` when `traits` includes `"vigilant"`.
- [ ] **[manual]** With Vigilant: red-tinted overlay tiles fill every tile in any ranged alien's LoS. Cones update when ranged enemies move or die.
- [ ] **[manual]** Without Vigilant: no cones rendered; medkits work normally.

### Resourceful

- [ ] **[unit]** With Resourceful, starting inventory is `flashbang: 1` and `state.itemsOnMap` includes one extra medkit at `map.start`.
- [ ] **[unit]** Without Resourceful, no extra medkit appears.

### Marksman (stub)

- [ ] **[unit]** Marksman in the trait pool. Selectable. Carries no runtime effect this spec.
- [ ] **[manual]** A run with Marksman picked plays identically to a run without it (modulo whatever the *other* trait does), confirming the stub.

### Regressions

- [ ] **[unit]** All 186 existing tests continue to pass (modulo the 1-medkit-baseline change, which may affect a small number of run-state tests — those update to reflect the new baseline).

## Test plan

### Automated tests (red-green)

- `src/systems/trait.test.ts` (new) — `loadTraits` returns 5 records; lookup by id; Marksman description tag.
- `src/systems/run-state.test.ts` extension — Athletic AP bonus; Hypochondriac penalty arm/consume/reset cross map; Resourceful inventory + extra medkit; Vigilant medkit block.
- `src/systems/combat.test.ts` extension — Vigilant medkit block; Hypochondriac arming on damage taken.
- Existing `useMedkit` "at-full-hp" tests update to also cover the new `"trait-blocked"` reason.

### Manual play-test (verify)

- **Scenario: Athletic-only run.**
  - Pick Athletic + any other.
  - **Pass:** turn 1 starts at 5 AP (was 4); fire-escape walkable; rooftop reachable.
  - **Targets:** desktop + iPhone Safari portrait.
- **Scenario: no-Athletic run.**
  - Pick Hypochondriac + Resourceful (deliberately no Athletic).
  - **Pass:** fire-escape exit is visible but not in the reachable overlay; tapping it does nothing; only the stairwell works.
- **Scenario: Vigilant cones on rooftop.**
  - Pick Vigilant + any other; take fire-escape.
  - **Pass:** every tile a ranged alien can see lights up red-tinted; overlay updates as aliens move.
- **Scenario: Hypochondriac penalty.**
  - Pick Hypochondriac + any other; let an enemy hit you on Day 1.
  - **Pass:** next player turn starts with `currentAP === maxAP - 1`. Subsequent damage in the same map does *not* re-trigger the penalty. Day-2 transition re-arms.
- **Scenario: Resourceful inventory.**
  - Pick Resourceful + any other.
  - **Pass:** turn 1 inventory shows `Medkits: 1 · Flashbangs: 1` (baseline 1 + Resourceful's flashbang); a second medkit sits at the start tile and gets picked up on first move (or on the start tile if the player walks back to it).
- **Scenario: Marksman roleplay.**
  - Pick Marksman + Athletic.
  - **Pass:** run plays as Athletic-only mechanically; Marksman shows in the panel's trait list as a reminder.
- **Targets:** desktop + iPhone Safari portrait, all scenarios.

## Open questions

All three resolved at proposal time:

- **Marksman handling.** Stub in the pool with `(no effect yet — pending player ranged weapons)` appended to its description. Honors the 5-trait promise; the trait lights up when its weapons land.
- **Selection mode.** Pick only. The "Roll" button is a v2.
- **Vigilant cones.** Persistent. Every ranged-alien LoS tile gets a red-tinted overlay while Vigilant is active. Skipped entirely when Vigilant isn't picked.

## Done means

A user opens the preview URL, lands on the new `TraitsScene` after pressing Start, sees five trait cards with full descriptions visible without hover, taps two of them (the picker enforces the 2-cap and only enables Start when 2 are selected), and starts a Day-1 procgen run. The chosen traits show in the panel on Day 2; Athletic-only runs reach the rooftop, no-Athletic runs don't; Hypochondriac runs feel the AP penalty exactly once per map; Vigilant runs see the rooftop's threat zones literally tinted red; Resourceful runs start with a flashbang and an extra medkit at start. Marksman remains a roleplay choice that pays off in the next spec. The §13 Day-5 milestone "5 traits implemented · 2-trait character generation works" reads green except for Marksman's runtime effects, explicitly deferred.
