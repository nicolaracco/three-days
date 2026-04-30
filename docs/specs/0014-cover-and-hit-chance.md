# Spec 0014: Cover system + qualitative hit chance

**Status:** In progress
**Roadmap day:** GDD §13 Day 6 cleanup (closes the §7.1 cover/hit-chance contract before audio + balance polish); covers the rooftop "exposed" feel from §9.2 quantitatively.
**Owner:** Nicola
**Related ADRs:** ADR-0004 (layered architecture), ADR-0005 (tile/pixel coordinates), ADR-0007 (seeded RNG), ADR-0008 (UI architecture — always-visible glyphs), ADR-0009 (testing discipline)

## Goal

Per GDD §7.1, attacks resolve through one of four qualitative hit-chance levels: **certain**, **probable**, **risky**, **unlikely**. Cover comes in two states (full or none). Spec 0014 adds the cover authoring layer (chunk JSON gains `coverTiles`; Day-2 maps add cover positions inline), the LoS-line cover check (a "full cover" tile between attacker and target makes the target covered), and the qualitative-tier computation as a pure function. Attack commits roll a per-state seeded RNG against the tier's probability — misses cost AP but no damage. The lobby gains 4–6 authored cover tiles flanking the existing pillars; the rooftop stays exposed (zero cover) per GDD §9.2. Player-side hit-chance UI is deferred — the player still wields melee only (range 1 bypasses cover, always certain), so the chance pipeline is exercised entirely through *enemy* ranged attacks until player ranged weapons land.

## Why this, why now

GDD §7.1 lists cover and qualitative hit chance as core combat-system contracts. Without them, every successful enemy ranged attack hits, which makes the rooftop's "exposed" feel a nominal label rather than a tactical reality. The §12.1 combat-feel bar wants attacks to *read*: a covered protagonist should feel safer, an exposed protagonist should feel desperate, and the rooftop should pressure the player toward closing or stunning rangers. Cover + hit chance is the single change that turns spec 0012's ranged combat from "every shot hits" into the GDD's intended push-and-pull. It also closes one of two remaining §7.1 contracts (cover and qualitative tells); the other (hit-chance UI on player attacks) is gated on player ranged weapons.

§12 sub-bars touched:
- **§12.1 Combat feel.** Misses + cover make ranged combat texturally different from melee; the player has reasons to position behind a pillar.
- **§12.3 Visual coherence.** Authored cover tiles (a low stripe at the bottom of the tile) make the lobby read as "ground-floor with chest-high obstructions" instead of "open room with random walls."

## Scope

### In scope

- **`Day1Map.coverTiles: TilePos[]`** — set of tile positions that provide cover. Authored at chunk level (Day-1, currently empty in this spec — see Out of scope) and inlined per Day-2 map.
- **Chunk JSON `coverTiles` field** — optional array of `{ col, row }`. Default `[]`. Loader validates positions are inside chunk bounds. Procgen aggregates per-chunk slots into `Day1Map.coverTiles` translated to absolute coordinates (parallel to `spawnSlots` and `itemSlots`).
- **Day-2 JSON `coverTiles` field** — same shape, top-level. `loadDay2Map` lifts directly. Lobby authors 6 cover tiles at the perimeter of the central pillar groups; rooftop authors `[]`.
- **`src/systems/cover.ts`** — pure functions:
  - `coverBetween(from: TilePos, to: TilePos, map: Day1Map): "full" | "none"`. Walks the Bresenham line between `from` and `to` (excluding both endpoints), returns `"full"` if any tile in `coverTiles` lies on the line, otherwise `"none"`.
  - `hitChance(args): "certain" | "probable" | "risky" | "unlikely"`. Inputs: attacker position, target position, weapon range, cover state, LoS state. Rules:
    - `weapon.range === 1` → `certain` (melee bypasses cover entirely).
    - `weapon.range > 1`, no LoS → no shot fires (handled by spec 0012's `attackResult` rejection); `hitChance` not called in that path.
    - `weapon.range > 1`, LoS clear, cover === "none" → `probable`.
    - `weapon.range > 1`, LoS clear, cover === "full", Manhattan distance ≤ 4 → `risky`.
    - `weapon.range > 1`, LoS clear, cover === "full", Manhattan distance > 4 → `unlikely`.
  - `hitChanceProbability(level): number`. Returns `1.0 / 0.75 / 0.50 / 0.25` for `certain / probable / risky / unlikely`.
- **Per-state RNG plumbing:**
  - `RunState.rngState: number` — the mulberry32 internal state that powers per-attack hit rolls. Initialized from `state.seed` via `createRunStateFromMap` / `createRunState`. Carried through `transitionToDay2` (not reset — Day-1 RNG is consumed by procgen and the same stream continues into Day-2 attacks).
  - `src/systems/rng.ts` gains `nextRoll01(state: number): { value: number; nextState: number }` returning a 0..1 float and the new internal state. Pure.
- **`commitAttack` rolls per-attack:**
  - After the existing LoS / range / AP checks, but before applying damage, look up the hit chance via `hitChance(...)`.
  - Pull a roll from `state.rngState`. If the roll exceeds `hitChanceProbability(level)`, the attack is a *miss*: AP is still deducted, but no damage applies, no kill, no hypochondriac arming.
  - Return shape extends: `{ ok: true; state; damage; killed; hit: boolean; level: HitChance }`. Existing callers that destructure `damage` / `killed` continue to work; new `hit` and `level` fields are additive.
  - Rng state is propagated into `state.rngState` regardless of hit/miss.
- **Renderer in `src/scenes/RunScene.ts`:**
  - **Cover-tile glyph.** When `renderMap` paints a tile that's in `state.map.coverTiles`, draw an additional `Phaser.GameObjects.Rectangle` 24 px wide × 3 px tall, anchored at the bottom-center of the tile, color `COLOR.tileBorder`. Reads as "low wall." World-space (scrolls with camera).
  - **Miss flash.** When `commitAttack` returns `hit: false`, the existing protagonist-flash callsite skips the white flash on miss, but the existing shot-line animation (spec 0012) still draws — so the player sees "the shot went out, you didn't take damage." A small `MISS` text floats up briefly from the protagonist's tile (alpha 1 → 0 over `FLASH_MS`) so the miss is unambiguous. Color `COLOR.text`.
- **Tests.**
  - `src/systems/cover.test.ts` (new) — `coverBetween` (clear, single cover, multiple covers, endpoints excluded); `hitChance` for each tier branch; `hitChanceProbability` mapping.
  - `src/systems/rng.test.ts` extension — `nextRoll01` is reproducible (same input → same output) and threads state correctly across calls.
  - `src/systems/combat.test.ts` extension — `commitAttack` roll path: `hit: true` when probability == 1.0 (e.g., melee certain); `hit: false` when probability < 1.0 and the rolled value is above the threshold; AP deducts on miss; no damage on miss; rngState propagates.
  - `src/systems/map.test.ts` extension — lobby has at least 4 cover tiles; rooftop has zero.

### Out of scope

- **Player-side hit-chance UI.** Per ADR-0008's projected-targeting contract, hit-chance labels show on every valid target when the player enters attack mode. The player wields melee only this spec, so the only label that would render is "certain" on adjacent targets — a vacuous UI that lands when player ranged weapons (separate spec) do.
- **Player ranged weapons** (pistol, shotgun, ammo, reload). Marksman trait still stubbed.
- **Half cover.** GDD §7.1 explicitly excludes; only `full | none`.
- **Cover degradation / breakable cover.** Out — fixed throughout the run.
- **Multiple cover tiles on a single line stacking.** First cover tile encountered = `"full"`; further cover doesn't lower hit chance further.
- **Cover for chunks-authored Day-1.** Day-1's single melee enemy doesn't shoot, so cover would be cosmetic. Skip the chunk authoring surface this spec.
- **LoS cones (Vigilant) reflecting cover.** Vigilant currently shows every LoS-bearing tile in red 0.15-alpha; this spec doesn't differentiate "covered" vs "exposed" within the cone. A follow-up could split the tint.
- **Sound effects** for hit / miss / cover-hit.
- **Real cover art** (sandbags, low walls, knocked-over chairs). Day-7 swap. Placeholder is the bottom stripe.
- **Differentiated cover sources** (cover tile vs adjacent wall behaving as cover). One concept this spec: explicit `coverTiles`. Walls remain pure LoS blockers.

## Inputs

- `state.map.coverTiles` (new field, populated at construction).
- `state.rngState` (new field, threaded through reducers).
- Authored chunk + Day-2 JSON cover positions.

## Outputs / Effects

- New `src/systems/cover.ts` module.
- New `src/data/day2/lobby.json` `coverTiles` array (rooftop's stays empty / absent).
- New optional `coverTiles` field on chunk JSON; loader rejects out-of-bounds positions.
- `Day1Map` gains `coverTiles: TilePos[]`.
- `RunState` gains `rngState: number`.
- `commitAttack` returns `hit: boolean` and `level: HitChance` in success cases; rolls + applies damage probabilistically.
- Renderer paints a low-stripe glyph on every cover tile.
- A `MISS` floater on the protagonist for missed shots.

## Interaction (desktop + mobile, same model)

Per ADR-0008.

- **Always-visible glyphs.** Cover tiles carry the bottom-stripe glyph; the player can scan for cover at a glance.
- **Inspection panel.** Tapping a cover tile shows the tile-detail line as before (kind = floor in this spec; cover is a layer on top, not a tile-kind change). A future spec can promote cover to a panel surface ("Tile (X, Y) · Cover available") if it reads useful in playtest.
- **Targeting.** Reachable overlay unchanged — cover doesn't gate reachability. Player melee attacks always hit (no probabilistic miss for melee), so the player UI doesn't change this spec.
- **Confirm flow.** Unchanged.
- **Hit areas.** No new buttons.

## Acceptance criteria

### Cover module

- [ ] **[unit]** `coverBetween(p, p, map)` returns `"none"` (no in-between tiles).
- [ ] **[unit]** `coverBetween` returns `"full"` when at least one tile on the Bresenham line is in `coverTiles`.
- [ ] **[unit]** `coverBetween` excludes the endpoints — a cover tile *at* `from` or `to` doesn't count.
- [ ] **[unit]** `hitChance` returns `certain` for any range-1 weapon regardless of cover.
- [ ] **[unit]** `hitChance` returns `probable` for range > 1, no cover.
- [ ] **[unit]** `hitChance` returns `risky` for range > 1, cover present, Manhattan distance ≤ 4.
- [ ] **[unit]** `hitChance` returns `unlikely` for range > 1, cover present, Manhattan distance > 4.
- [ ] **[unit]** `hitChanceProbability` mapping: certain=1.0, probable=0.75, risky=0.5, unlikely=0.25.

### RNG

- [ ] **[unit]** `nextRoll01(state)` is pure: same input state → same value and nextState.
- [ ] **[unit]** Threading `nextRoll01` across multiple calls produces a sequence whose values are uniformly distributed (sanity: 1000 rolls, ratio of values < 0.5 within ±5% of 0.5).

### Combat — roll path

- [ ] **[unit]** `commitAttack` returns `hit: true` and applies damage when level is `certain` (probability 1.0).
- [ ] **[unit]** `commitAttack` returns `hit: false` when the roll exceeds the level's probability — no damage applied, AP still deducted, `killed: false`, hypochondriac arming skipped, rngState advanced.
- [ ] **[unit]** `commitAttack` is deterministic: identical input state → identical output (including hit/miss outcome) given the threaded `rngState`.

### Authoring

- [ ] **[unit]** `loadDay2Map("lobby").map.coverTiles.length >= 4`.
- [ ] **[unit]** `loadDay2Map("rooftop").map.coverTiles.length === 0`.
- [ ] **[unit]** Procgen aggregates chunk-authored cover slots into `Day1Map.coverTiles` (test runs over a few seeds; spec 0014 ships zero authored cover at chunk level so the result is `[]`, but the plumbing is verified).

### Renderer

- [ ] **[manual]** Cover tiles in the lobby render with a visible bottom stripe; floor and walls do not.
- [ ] **[manual]** When a ranged alien attacks the protagonist behind cover, the shot animation still draws but a `MISS` floater appears on misses; HP unchanged on miss.
- [ ] **[manual]** Hit/miss feels readable at one arm's length on iPhone Safari portrait — both the shot animation and the MISS floater are visible.

### Distribution

- [ ] **[manual]** The lobby's central pillars are flanked by cover tiles the player can stand behind to reduce incoming hit chance. The fight feels different from spec 0013's all-hit version.
- [ ] **[manual]** The rooftop is unchanged tactically — no cover means full ranged punishment continues. The player still relies on flashbangs and closing distance.

## Test plan

### Automated tests (red-green)

- `src/systems/cover.test.ts` — cases listed in Acceptance criteria.
- `src/systems/rng.test.ts` extension — `nextRoll01` reproducibility + uniformity sanity.
- `src/systems/combat.test.ts` extension — three roll-path cases.
- `src/systems/map.test.ts` extension — lobby/rooftop cover counts + procgen plumbing for chunk cover slots.

### Manual play-test (verify)

- **Scenario: covered lobby fight.**
  - Pick any two traits (Vigilant + something is illustrative because cones make cover positions obvious).
  - Take stairwell → lobby. Position behind a cover tile (the bottom-stripe one) and let the central ranger fire a few times.
  - **Pass:** at least one MISS appears; HP stays higher than it would have without cover.
- **Scenario: exposed rooftop punishment.**
  - Take fire-escape → rooftop. Stand still through 2 enemy turns.
  - **Pass:** every ranged attack with LoS hits (probable = 0.75 means most do); the rooftop demands closing or breaking sightlines.
- **Scenario: melee always hits.**
  - Adjacent attack on any enemy.
  - **Pass:** every adjacent commit hits — no MISS — even adjacent to a cover tile.
- **Scenario: determinism.**
  - Refresh the same `Date.now()`-equivalent seed twice (or use the existing seed-determinism guard) and play the same actions.
  - **Pass:** the same attacks resolve to the same hit/miss outcomes. (This is exercised by the unit test more than by manual testing.)

## Open questions

All three resolved at proposal time:

- **Probabilities.** 100 / 75 / 50 / 25 for certain / probable / risky / unlikely.
- **Range threshold.** Manhattan distance ≤ 4 = `risky`; > 4 = `unlikely`.
- **Cover visualization.** Bottom-anchored 24 × 3 px stripe in `COLOR.tileBorder` per cover tile.

## Done means

A user opens the preview URL on iPhone Safari portrait, picks two traits, takes the stairwell, lands in the lobby, and sees low stripes flanking the central pillars — the cover positions. They duck behind one and the central ranger fires, sometimes drawing a MISS floater. They feel the difference between standing behind cover (more turns to plan) and standing in the open (every shot lands). On the rooftop, no stripes appear and pressure stays high. The §13 Day-6 cover/hit-chance contract from §7.1 is closed except for the player-side hit-chance UI, which lands with player ranged weapons.
