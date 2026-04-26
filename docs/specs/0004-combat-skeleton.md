# Spec 0004: Combat skeleton (melee, HP, damage, death)

**Status:** Done
**Roadmap day:** GDD §13 Day 2 (combat completion half; combat feel polish lands in spec 0005)
**Owner:** Nicola
**Related ADRs:** ADR-0004 (layered architecture), ADR-0005 (tile/pixel coordinates), ADR-0007 (seeded RNG), ADR-0008 (UI architecture), ADR-0009 (testing discipline)

## Goal

Combat lands as a real mechanic. The protagonist can attack the adjacent enemy with an improvised melee weapon (2 AP, damage 1). The enemy attacks back when adjacent, on its turn (also 2 AP, damage 1). HP is tracked for both. The enemy despawns at HP 0; the protagonist's death freezes the scene with a "You died" overlay (restart is a later spec). Minimal visual feedback — hit flash on the target (within 250 ms) and HP bar updates — meets §12.1's baseline; full feel polish (qualitative hit-chance tells, audio coverage, hurt-frame art) is spec 0005.

## Why this, why now

GDD §13 Day 2 is "combat completion AND combat feel." The user approved splitting it: this spec lands the *skeleton* (logic, HP, damage, death, minimal feedback), and spec 0005 lands the *feel* polish. The split is honest — full §12.1 feel depends on real audio (Day 6 work) and real hurt-frame sprites (Day 7 work), neither of which exists yet. With placeholder visuals we can still meet §12.1's *timing* bar (hit feedback within 250 ms via a color flash); we can't yet meet its *audio* bar.

§12 sub-bars touched:

- **§12.1 combat feel** *(partially)*: hit/miss visual within 250 ms is met (color flash); damage taken produces a hurt tint + HP-bar update (no SFX yet — spec 0005); enemy turns under 2 s is met (one enemy, ≤ 1 attack + ≤ 3 moves at 200 ms each = ≤ 800 ms); AP cost visible before commit is met (panel shows "Attack 2 AP"); qualitative hit-chance tells are deferred (this spec uses a flat "certain" because there's no cover and no ranged — spec 0005 lights up the tells).
- **§12.2 information design**: HP, max HP, AP, max AP always visible (HUD + panel + on-sprite HP bars). No hover dependency.
- **§12.5 onboarding** *(partially)*: failure is legible — death overlay says "You died on turn N" with the killing entity. Full run-end summary is a later spec.

## Scope

### In scope

- **Weapons data.** `src/data/weapons.json`: one weapon for now — `{ id: "improvised-melee", damage: 1, range: 1, apCost: 2 }`. Schema in `systems/weapon.ts` exposes `Weapon` type and `loadWeapons()`.
- **Balance constants.** `src/data/balance.json` adds `PROTAGONIST_HP = 6`, `ENEMY_HP = 3`, `ATTACK_AP_COST = 2` (matches the weapon's apCost; centralized for consistency).
- **HP on units.** `RunState.protagonist` gains `currentHP` and `maxHP` fields. `Enemy` (in `systems/enemy.ts`) gains `currentHP` and `maxHP` fields.
- **`systems/combat.ts`** (new):
  - `attackResult(state, attackerKind, weaponId, targetId): { ok: boolean; damage: number; reason?: "out-of-range" | "insufficient-ap" | "no-weapon" | "no-target" }` — pure compute (no state mutation).
  - `commitAttack(state, attackerKind, weaponId, targetId): { ok: true; state: RunState; damage: number; killed: boolean } | { ok: false; reason: ... }` — pure reducer; applies damage, decrements attacker AP by `weapon.apCost`, removes the target if HP ≤ 0.
  - For spec 0004, attackerKind is `"player"` or `"enemy"`. Target id maps to the enemy's id when player attacks; for enemy attacks, the target is the protagonist (no id needed; convention: targetId is `"protagonist"` for the player).
- **Player attack flow.**
  1. Tap an *adjacent* enemy → selection moves to enemy. Panel shows enemy info + an **Attack** button (visible only when the player has ≥ `ATTACK_AP_COST` AP, target is adjacent, and `activeTurn === "player"`).
  2. Tap **Attack** → stages the attack. Panel button changes to **Confirm Attack** (yellow text). Enemy gets a yellow halo (same staged-target visual as for moves).
  3. Tap **Confirm Attack** OR tap the enemy again → commits via `commitAttack`. Damage applied. Hit flash on enemy (white, 200 ms). HP bar updates. AP decrements.
  4. If the enemy's HP reaches 0: sprite is destroyed; selection resets to protagonist; targeting overlay re-projects.
- **Enemy AI (extends spec 0003's pathfind-then-stop).** During the enemy's turn, before each step:
  - If adjacent to the protagonist AND `currentAP >= ATTACK_AP_COST` AND has any weapon (defaulting to melee for melee enemies): commit an attack on the protagonist; visible 200 ms pause; protagonist takes damage; hurt tint on protagonist (red, 200 ms).
  - Else fall through to the existing `enemyStep` (move toward protagonist).
  - When the enemy can neither attack nor move (out of AP), end-of-turn cycles to the next enemy / advances to player.
- **HP rendering.**
  - Above each unit's sprite, a thin HP bar (≤ 4 px tall, sized to tile width) showing `currentHP / maxHP`. Updates on damage.
  - HUD adds `HP X/Y` next to AP.
  - Panel shows HP/maxHP for protagonist and enemy.
- **Hit / hurt feedback.**
  - On a successful attack landing on a target: target sprite flashes to white (`fillColor = 0xffffff`) for 200 ms, then back to its base color. Single Phaser tween / `delayedCall`.
  - On a target taking damage (whether protagonist or enemy): target sprite tints red (`fillColor = 0xc05050`) for 200 ms, then back. Note these can overlap (the same hit produces both a "you hit them" flash and a "they got hurt" tint — for spec 0004 they are sequential or simultaneous; the manual play-test confirms it reads cleanly).
  - For spec 0004 simplicity: a single 200 ms flash from base → white-ish-red → base, applied to the target on damage. Combines hit-confirm and hurt-acknowledge in one cue. If the manual play-test reveals it's confusing, spec 0005 splits them.
- **Death.**
  - Enemy: when `currentHP <= 0`, the `Enemy` is removed from `state.enemies`. Sprite destroyed. If selected, selection resets to protagonist.
  - Protagonist: when `currentHP <= 0`, a fullscreen "You died" overlay appears (similar layer to the orientation overlay, but persistent). Text: "You died · Turn N · Killed by: Melee alien". All input is locked (the existing `isInputLocked` getter gains a `state.protagonist.currentHP <= 0` clause).
- **Turn-cycle interaction.** No structural change to `advanceTurn` from spec 0003. However: when the protagonist is dead, `advanceTurn` is a no-op (return state unchanged). Enemies don't need to act after the player's death; the scene's End Turn / step-loop short-circuits.
- **Tests** (red-green-verify per ADR-0009):
  - `combat.test.ts`: `attackResult` cases (ok, out-of-range, insufficient-ap, no-target); `commitAttack` happy path; `commitAttack` killing the target removes it from state.enemies and reports `killed: true`; `commitAttack` insufficient AP returns the right reason.
  - `enemy.test.ts` (extended): Enemy includes `currentHP` and `maxHP`; `loadDay1Enemies` initializes both to `ENEMY_HP`.
  - `run-state.test.ts` (extended): `createRunState` initializes protagonist `currentHP === maxHP === PROTAGONIST_HP`.
  - `turn.test.ts` (extended): when the enemy is adjacent + has AP ≥ `ATTACK_AP_COST`, `enemyStep` returns a state with the protagonist's HP decremented by `weapon.damage` and the enemy's AP decremented (and `moved: true` even though the enemy didn't move tile; treat "attacked" as moved-equivalent for the loop). Or: introduce a sibling `enemyAct` reducer that returns `{ kind: "moved" | "attacked"; state; ... }` — naming TBD by the implementer.

### Out of scope

- **Pistol, shotgun, reload.** Only melee in this spec. Ranged combat lands when ranged enemies do (later Day 1 substrate spec or Day 2's "Lobby/Rooftop" maps).
- **Items (medkit, flashbang).** Trait + item integration is its own spec (~Day 5).
- **Traits / character generation.** Same — Day 5.
- **Cover system.** Cover requires walls; walls land in spec 0005+ (procgen). Until then, hit chance is implicitly "certain."
- **Hit-chance qualitative tells UI** (`unlikely / risky / probable / certain` labels). Deferred to spec 0005 (combat feel polish) — pointless when there's only one outcome.
- **Multiple enemies / multiple weapons in the same turn.** One-on-one for now.
- **Audio (real SFX).** Real audio is Day 6 / its own spec. Spec 0004 emits `event:attack-hit` / `event:attack-miss` / `event:damage-taken` / `event:unit-died` so spec 0005 / the audio spec can wire SFX without scene rework.
- **Hurt-frame animations.** A tint is sufficient for spec 0004 — replace with sprite swap when real art lands (Day 7).
- **Run-end screen with full summary** (kill count, exits, profession). Death freezes the scene with the minimal overlay; the full summary is a later spec (run-history / Day 4's "Day chain + run-end" deliverable).
- **Restart button.** Page refresh = new run for now. Restart UI lands with the run-end screen.
- **Multi-turn AI behavior** beyond "attack if adjacent else step toward player." Trivial AI per GDD §7.3.
- **Misses.** Until hit chance exists (spec 0005), every attack is a hit. The `event:attack-miss` event is reserved but not fired.
- **A `quality-reviewer` pass on the diff** (separate workflow step).

## Inputs

- `src/data/weapons.json` — array of weapon definitions.
- `src/data/balance.json` — extended with `PROTAGONIST_HP`, `ENEMY_HP`, `ATTACK_AP_COST`.
- `src/data/day1-static-enemies.json` — unchanged. Enemies' HP is loaded from balance.
- User input: pointer events on `RunScene` (unchanged from spec 0003).

## Outputs / Effects

- Mutates `RunState.protagonist.currentHP` on damage.
- Mutates `RunState.enemies[i].currentHP` on damage; removes the enemy from `enemies` when `currentHP <= 0`.
- Mutates `RunState.protagonist.currentAP` and `RunState.enemies[i].currentAP` on attack commit.
- Emits `event:attack-staged` (payload: `{ attackerKind, weaponId, targetId }`).
- Emits `event:attack-committed` (payload: `{ attackerKind, weaponId, targetId, damage, killed }`).
- Emits `event:damage-taken` (payload: `{ targetId, damage, currentHP }`).
- Emits `event:unit-died` (payload: `{ unitId }`).
- Re-renders affected sprites (HP bars, hit/hurt flash, enemy despawn).

All events use Phaser's built-in `EventEmitter` (ADR-0002).

## Interaction (desktop + mobile, same model)

Per ADR-0008. No hover dependency.

- **Always-visible glyphs.** Protagonist + enemy sprites + HP bars (above each sprite). Reachable-tile overlays + AP cost labels (unchanged from spec 0003).
- **Inspection panel.** Selection model unchanged. New content:
  - Protagonist selection: name, AP/maxAP, HP/maxHP, position.
  - Enemy selection: kind ("Melee alien"), AP/maxAP, HP/maxHP, position.
  - Tile selection: unchanged.
  - **Action buttons in the panel** (right side, below the existing Confirm slot):
    - When an *adjacent* enemy is selected, `state.activeTurn === "player"`, and player has ≥ ATTACK_AP_COST AP: **Attack (2 AP)** button. Tap → stages the attack; button text becomes **Confirm Attack** (yellow); halo on enemy. Tap again or tap the enemy → commits.
    - When a *non-adjacent or non-enemy* tile is selected, no action buttons (panel just shows info).
- **Targeting projection.** Movement targeting unchanged. Attack targeting is degenerate in this spec (one weapon, range 1, single adjacent target) — no separate "attack mode" UI is needed; the Attack button on the enemy's panel is the affordance.
- **Confirm flow.** Two-step (tap-stage → tap-confirm) for both moves and attacks, mirroring spec 0002.
- **Hit areas.** End Turn / Confirm Move / Attack / Confirm Attack buttons all use `setInteractive` with ≥ 44 × 44 hit areas. Tile interaction unchanged (scene-level pointerdown).
- **Death overlay.** Fullscreen, blocks input. Single line of text. No buttons in spec 0004 (refresh page = new run).

## Acceptance criteria

### State + logic

- [ ] **[unit]** `data/weapons.json` defines `improvised-melee` with `damage: 1`, `range: 1`, `apCost: 2`. `loadWeapons()` returns it as a typed `Weapon`.
- [ ] **[unit]** `data/balance.json` defines `PROTAGONIST_HP = 6`, `ENEMY_HP = 3`, `ATTACK_AP_COST = 2`.
- [ ] **[unit]** `createRunState({ seed })` initializes `protagonist.currentHP === protagonist.maxHP === PROTAGONIST_HP`.
- [ ] **[unit]** `loadDay1Enemies()` initializes each enemy's `currentHP === maxHP === ENEMY_HP`.
- [ ] **[unit]** `attackResult(state, "player", "improvised-melee", enemyId)` returns `{ ok: true, damage: 1 }` when the enemy is adjacent and the player has ≥ 2 AP.
- [ ] **[unit]** `attackResult` returns `{ ok: false, reason: "out-of-range" }` when target is not adjacent (range 1).
- [ ] **[unit]** `attackResult` returns `{ ok: false, reason: "insufficient-ap" }` when attacker has < 2 AP.
- [ ] **[unit]** `commitAttack` happy path: returns ok=true; new state with target HP decremented by damage; attacker AP decremented by `apCost`; `killed: false` when target survives.
- [ ] **[unit]** `commitAttack` killing the target: target HP would go to 0 or below; new state has the enemy removed from `enemies`; reports `killed: true`.
- [ ] **[unit]** `commitAttack` is pure: input state unchanged.
- [ ] **[unit]** Enemy AI (in `enemyStep` or sibling `enemyAct`): when adjacent + AP ≥ 2, attacks; protagonist HP decrements by 1; enemy AP decrements by 2; reported as a non-move action.
- [ ] **[unit]** Enemy AI: when adjacent + AP < 2 + AP > 0, no-op for that enemy this turn (can't move closer, can't attack — wait it out).
- [ ] **[unit]** Enemy AI: when not adjacent + AP > 0, moves toward protagonist (existing behavior unchanged).

### Discipline (greppable)

- [ ] **[unit]** `rg "Math\\.random" src/` returns no hits (ADR-0007).
- [ ] **[unit]** `rg "(mousedown|mouseup|mousemove|touchstart|touchmove|touchend)" src/` returns no hits (ADR-0008).
- [ ] **[unit]** `rg "TILE_SIZE\\s*\\*" src/ | grep -v "systems/grid"` returns no hits (ADR-0005).
- [ ] **[unit]** `rg "from \"vitest\"|from 'vitest'" src/` returns no hits (ADR-0009).

### UI — desktop

- [ ] **[manual desktop]** On scene start, HUD shows `T1 · AP 4/4 · HP 6/6` and turn indicator "Your turn". Panel shows protagonist details including HP.
- [ ] **[manual desktop]** Each unit (protagonist + enemy) renders a thin HP bar above its sprite, segmented or proportional to currentHP/maxHP.
- [ ] **[manual desktop]** Tap the enemy → panel shows kind, AP, HP, position. If the enemy is adjacent and player has AP ≥ 2, an **Attack (2 AP)** button is visible in the panel.
- [ ] **[manual desktop]** Tap **Attack** → button text changes to **Confirm Attack**, enemy gets a yellow halo. Tap **Confirm Attack** OR tap the enemy → attack commits; enemy flashes; HP bar updates; player AP drops by 2.
- [ ] **[manual desktop]** With ENEMY_HP = 3 and damage = 1, three commits kill the enemy. On the killing blow, the enemy sprite disappears; selection resets to protagonist; targeting overlay re-projects from the protagonist's position.
- [ ] **[manual desktop]** End the turn while adjacent to the enemy. Enemy turn: enemy attacks (instead of moving). 200 ms pause. Protagonist takes damage (red tint, HP bar shrinks, HUD HP decrements). Indicator returns to "Your turn".
- [ ] **[manual desktop]** Walk toward the enemy enough times that the protagonist takes 6 damage. On the killing blow, "You died · Turn N · Killed by: Melee alien" overlay appears. All input locked. End Turn doesn't fire.
- [ ] **[manual desktop]** Reachable-tile targeting still excludes the enemy's tile (movement is unchanged from spec 0003).

### UI — iPhone Safari portrait

- [ ] **[manual iPhone]** All [manual desktop] criteria above hold on iPhone Safari portrait via the production preview URL.
- [ ] **[manual iPhone]** Attack / Confirm Attack buttons have ≥ 44 × 44 hit areas (no mis-taps).
- [ ] **[manual iPhone]** Hit flash + hurt tint animations are visible at portrait resolution; the visual flash on attack is unmistakable within ~250 ms.
- [ ] **[manual iPhone]** HP bars over sprites are readable at portrait size (≥ 4 px tall, full tile width, distinct color).
- [ ] **[manual iPhone]** Death overlay covers the screen and is readable.

### §12 sub-bars

- [ ] **[manual]** §12.1 (partial — see "Why this, why now"): hit/miss visual within 250 ms (single 200 ms flash after commit). AP cost visible before commit (panel button reads "Attack (2 AP)"). Enemy turns under 2 s (one enemy, max ~800 ms).
- [ ] **[manual]** §12.2 information design: HP, max HP, AP, max AP, turn number always visible. Panel reveals enemy details on tap.
- [ ] **[manual]** §12.5 onboarding (partial): failure is legible (death overlay names the killing entity). Run-end summary is a later spec.

## Test plan

### Automated (red-green)

- `src/systems/combat.test.ts`:
  - "attackResult ok when target adjacent and AP sufficient"
  - "attackResult fails with 'out-of-range' when target is non-adjacent"
  - "attackResult fails with 'insufficient-ap' when attacker has < apCost"
  - "attackResult fails with 'no-target' when targetId doesn't resolve"
  - "commitAttack reduces target HP by weapon damage; attacker AP by apCost; reports killed=false on survive"
  - "commitAttack on a target whose HP would hit 0 removes the target from state.enemies; reports killed=true"
  - "commitAttack is pure: input state unchanged"
- `src/systems/enemy.test.ts` (extended):
  - "Enemy includes currentHP and maxHP"
  - "loadDay1Enemies initializes both HP fields to ENEMY_HP"
- `src/systems/run-state.test.ts` (extended):
  - "createRunState initializes protagonist.currentHP === maxHP === PROTAGONIST_HP"
- `src/systems/turn.test.ts` (extended):
  - "enemy adjacent with AP ≥ 2 attacks instead of moving"
  - "enemy adjacent with AP < 2 does nothing this step"

### Manual play-test (verify)

- **Scenario "first kill":** Walk adjacent to the alien. Tap the alien. Tap Attack → Confirm Attack. Repeat three times. Alien despawns.
- **Scenario "first death":** Stand still adjacent to the alien (or let it close in). End turn. Alien attacks. Repeat across turns until "You died" appears. Confirm overlay text and input lock.
- **Scenario "AP exhaustion":** Move 4 tiles to deplete AP, then try to attack the (non-adjacent) enemy. Attack button doesn't appear (need AP and adjacency).
- **Scenario "non-adjacent attack":** Tap a non-adjacent enemy (move away first). No Attack button; only the basic enemy-info panel.
- **Scenario "broken-build gate":** Introduce a deliberate `bun run typecheck` error on a feature branch; confirm Workers Builds fails the Build step and no preview URL is published (ADR-0010).

## Open questions

_(empty — all six questions resolved 2026-04-26, defaults accepted: "You died · Turn N · Killed by: Melee alien" overlay copy; white flash on damage taken (single combined cue, spec 0005 can split if needed); enemyAct sibling reducer chooses attack-or-move; weapon id "improvised-melee" kebab-case. Spec body carries the canonical values.)_

## Done means

A user opens `https://three-days.<account>.workers.dev/` on iPhone Safari portrait. Sees the protagonist + alien + HP bars on each. Walks adjacent to the alien (one or two turns). Taps the alien — panel shows kind/AP/HP/position + Attack (2 AP) button. Taps Attack → Confirm Attack → alien flashes white, HP bar shrinks. After three commits the alien despawns. End turn while adjacent (after the alien respawn… wait, no, it's despawned now). User restarts via page refresh. New alien. Walks adjacent again, ends turn. Alien attacks; protagonist tints red; HUD HP drops to 5. Continues. Eventually protagonist dies; "You died · Turn N · Killed by: Melee alien" overlay appears; input locked. `bun test` passes the new `combat.test.ts` plus extensions to `enemy.test.ts`, `run-state.test.ts`, `turn.test.ts`. Combat is real; spec 0005 (combat feel polish — qualitative hit-chance tells UI, audio events wired to real SFX, hit/hurt cue split if needed) becomes the next move.
