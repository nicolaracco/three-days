# Three Days — Game Design Document

**Version:** 0.3 (Mobile + Pipeline Revision)
**Status:** Concept lock
**Build budget:** 7 focused days, extendable to 10 if quality requires
**Platform:** Web browser — desktop landscape **and** iPhone Safari portrait. See ADR-0008.
**Distribution:** itch.io, free (ship target — Day 7). Cloudflare Pages preview pipeline during the build week. See ADR-0010.

---

## Table of Contents

1. [Summary](#1-summary)
2. [Goals](#2-goals)
3. [Design Pillars](#3-design-pillars)
4. [Product Framing](#4-product-framing)
5. [Core Loop](#5-core-loop)
6. [Character System](#6-character-system)
7. [Combat System](#7-combat-system)
8. [Procedural Generation](#8-procedural-generation)
9. [Exits as Relocation](#9-exits-as-relocation)
10. [Art and Audio](#10-art-and-audio)
11. [Technical Approach](#11-technical-approach)
12. [Quality Bar](#12-quality-bar)
13. [Build Plan](#13-build-plan)
14. [Success Criteria](#14-success-criteria)
15. [Risks](#15-risks)
16. [What This Project Is Not](#16-what-this-project-is-not)

---

## 1. Summary

Three Days is a 15–25 minute tactical roguelike played in a browser. The player controls a single civilian who must survive an alien invasion across two tactical maps: a procedurally generated apartment escape (Day 1) and a handcrafted final stand (Day 2). The exit chosen on Day 1 shapes Day 2.

The project simultaneously serves a learning agenda and a commercial quality bar. Both goals are real. They coexist by holding scope ruthlessly small while spending the freed time on quality.

**Not in this game:** recruits, base systems, LLM-driven content pipelines, quest systems, persistent progression. These are deliberate omissions to keep scope inside what can ship at quality in roughly a week.

---

## 2. Goals

### 2.1 Quality bar

A stranger plays a 20-minute run on itch.io and reports it as enjoyable. Combat feels responsive. Art and audio cohere. Information is legible. The game does not need favorable reviews or an audience; it needs to be the kind of small game a player would not regret having played. Section 12 makes this concrete.

### 2.2 Learning bar

| Learning area | What success looks like |
|---|---|
| Agentic dev workflow | Working CLAUDE.md, navigable project structure, felt sense of when to delegate to the agent versus drive manually |
| AI-assisted asset pipeline | Reproducible workflow from PixelLab generation through Aseprite cleanup to in-game tile usage, producing assets that meet the quality bar |
| Chunk-based procgen | Small but real implementation of map generation by stitching authored chunks; confidence about how the technique scales |
| Browser game architecture | Working tactical-roguelike loop in Phaser 3; felt opinion on the engine choice for any next, larger project |
| Shipping at quality | itch.io page, playable build that meets the quality bar, short devlog |

**Both bars must be met.** Shipping below the quality bar fails the quality goal. Hitting the quality bar by hand-authoring everything fails the learning goal. The discipline is to hold both at once and let scope absorb the tension.

---

## 3. Design Pillars

Every feature must serve at least one pillar. Features that serve none are out of scope.

- **Pillar 1 — Exits as relocation.** The first map has multiple exits, each leading to a different flavor of final stand. Strategic and tactical play are the same act.
- **Pillar 2 — Procedural assembly, authored components.** The first map is stitched from hand-authored chunks at runtime. The technique is small in scope but real, and scales beyond this project.
- **Pillar 3 — Quality before content.** Every system is smaller than it could be, and better than it had to be. When forced to choose between adding a thing and polishing what exists, the answer is always to polish.

---

## 4. Product Framing

| Attribute | Decision |
|---|---|
| Working title | Three Days (placeholder) |
| Genre | Tactical roguelike vignette |
| Platform | Web browser — desktop landscape and iPhone Safari portrait (ADR-0008) |
| Distribution | itch.io |
| Business model | Free |
| Run length | 15–25 minutes |
| Replays per player | 2–4 expected |
| Players | Single-player only |
| Localization | English only |
| Build budget | 7 focused days, extendable to 10 if quality requires |
| Audience expectation | A small game a stranger would enjoy a 20-minute run of |

---

## 5. Core Loop

### 5.1 The two days

A run is exactly two tactical maps, played in sequence.

- **Day 1 — Apartment interior, procedurally generated.** The player has just survived the first hours of the invasion. Aliens have entered the building. The player must navigate the apartment and find an exit. Two exits available.
- **Day 2 — The final stand, handcrafted.** Map flavor is determined by the Day 1 exit choice. No exits. An objective (survive N turns or eliminate a target) ends the run on completion or on protagonist death.

### 5.2 Per-map flow

**Day 1:** spawn at an entry point → navigate the procgen layout → encounter enemies → find the exits → choose one. Reaching an exit ends Day 1 and triggers a brief transition that names the protagonist's situation ("you reach the rooftop at dusk") before Day 2 loads.

**Day 2:** spawn on the handcrafted map with a clear objective shown in the HUD → hold or push as the situation demands → win or die. The run-end screen presents the run's summary.

### 5.3 Failure

Protagonist death ends the run on either day. There is no continue, no respawn, no save scumming. The run-end screen shows:
- Day the run ended
- Exit chosen (if Day 2 was reached)
- Kill count
- Protagonist's name, profession, traits

A "New Run" button starts a fresh seed and a fresh protagonist.

---

## 6. Character System

### 6.1 Generation

At the start of each run, the protagonist is generated from:
- A name from a name list (~30 names)
- A pre-invasion profession from a list of 6 (broker, teacher, mechanic, nurse, programmer, retiree)
- Two traits drawn from the trait pool

### 6.2 Trait pool

| Trait | Effect |
|---|---|
| Athletic | +1 movement AP per turn. Required to use `fire-escape` exits. |
| Hypochondriac | Starts with 2 medkits instead of 1. Loses 1 AP on the first turn after taking damage in each map. |
| Ex-military | +1 to hit on the first shot of each enemy encounter. Starts with a pistol (6 rounds) instead of an improvised melee weapon. |
| Hardened | +2 max HP. -1 max AP per turn (3 instead of 4). Survivability-versus-tempo tradeoff. |
| Resourceful | Starts with 1 flashbang and 1 extra ammo magazine. The starting room contains 1 additional consumable. |

Five traits with two per character produces ten combinations, all meaningfully distinct. The pool is intentionally narrow to keep balance achievable.

**Each trait must clearly affect at least one moment-to-moment decision.** Traits whose effects only matter in edge cases are cut.

### 6.3 What is NOT in the system

- No recruits, no squad. The protagonist is alone for the entire run.
- No trait transitions during a run.
- No synergies between traits.
- No upgrades.
- No civilian-to-cell progression. That belongs to the larger game.

---

## 7. Combat System

### 7.1 Specification

| Attribute | Decision |
|---|---|
| Camera | 2D top-down, fixed orientation |
| Grid | Square, single elevation |
| Action economy | AP pool per turn (default 4 protagonist, 3 enemies) |
| Action costs | Move 1 AP/tile, attack 2 AP, reload 2 AP, use item 1 AP |
| Cover | Two states: `full` and `none`. No half cover. |
| Hit feedback | Qualitative: `unlikely`, `risky`, `probable`, `certain`. Always shown on hover before commit. |
| Enemy types | 2: melee alien, ranged alien |
| Player weapons | 3: improvised melee, pistol (limited ammo), shotgun (very limited ammo, rare drop) |
| Items | 2: medkit (heal), flashbang (disable enemies for 1 turn) |

### 7.2 Combat feel — non-negotiable

Combat must feel responsive. This is not a polish item; it is a design requirement that gates the project. The specific bar is in [Section 12.1](#121-combat-feel). Combat that is functional but not responsive does not ship.

### 7.3 Enemy AI

**Trivial by design.**
- Melee aliens: path toward the player, attack when adjacent.
- Ranged aliens: path toward line-of-sight, shoot.
- No flanking, no morale, no group tactics.

AI complexity is one of the easiest places to overspend time in a tactical game; this game spends that time on combat feel instead.

---

## 8. Procedural Generation

### 8.1 Approach

Chunk-based assembly. The game ships with a small library of hand-authored room chunks. The runtime generator picks chunks, stitches them along compatible doorways, and places enemies and items in marked spawn slots.

**Only Day 1 is procedurally generated.** Day 2 (the final stand) loads a single handcrafted map. This is intentional: Day 2's dramatic weight benefits from authored layout, and removing it from procgen scope makes Day 1's procgen quality higher.

### 8.2 Chunk pool

| Day | Map type | Authoring requirement |
|---|---|---|
| Day 1 | Apartment interior | 8 chunks: living room, kitchen, bedroom, bathroom, hallway, stairwell, fire-escape access, balcony |
| Day 2 | Final stand (varies by exit) | 2 handcrafted maps — one for each exit type |

Two handcrafted Day 2 maps means Day 1's exit choice meaningfully changes the game's climax, not just its flavor. **This is the single most important quality investment in the project.**

### 8.3 What the generator MUST do

- Pick 5–7 chunks per map and stitch them along compatible doorways.
- Guarantee at least 2 reachable exits from the spawn point.
- Place enemies and items in pre-marked spawn slots within each chunk.
- Reject any layout that produces an unreachable exit, an unwinnable spawn, or visual inconsistency at chunk seams.

### 8.4 What the generator MUST NOT do

- No multi-floor stitching. Each map is single-elevation.
- No dynamic difficulty. Day 1 is tuned to a single curve.
- No procedural enemy behavior or weapon stats.
- No procedural narrative.

---

## 9. Exits as Relocation

### 9.1 The mechanic

The Day 1 map contains 2 exits. Reaching either exit ends Day 1 and triggers Day 2 with the corresponding handcrafted map and flavor.

### 9.2 Exit types

| Exit | Trait gate | Day 2 it leads to |
|---|---|---|
| `stairwell` | None | **The Lobby** — ground-level final stand, more cover, more melee enemies |
| `fire-escape` | Athletic only | **The Rooftop** — exposed final stand, less cover, more ranged enemies |

Two exits is the minimum that produces a meaningful choice. Choosing between three would not double the design value, but would double the authoring cost.

Each exit is clearly labeled on the map: type, trait gate, and a one-line tell of what it implies ("the rooftop is exposed but the alien presence below is heavier"). Players make the choice with **partial information**, not full and not blind.

### 9.3 The final stand has no exits

Day 2's handcrafted map contains zero exit tiles. The HUD shows the objective ("survive 8 turns" on the rooftop, "eliminate the alien commander" in the lobby). The player has been trained over Day 1 to look for exits; on Day 2, the absence of exits is the signal that the run's resolution is here.

---

## 10. Art and Audio

### 10.1 Visual style

2D top-down pixel art at 32x32 tile resolution. Generated using PixelLab and refined in Aseprite. Each asset must meet the coherence bar in [Section 12.3](#123-visual-coherence).

**Asset list:**
- 1 protagonist sprite, 4 directions, idle/walk/attack/hurt animations (16 sprites)
- 2 enemy sprites, 4 directions, idle/walk/attack/hurt animations (32 sprites)
- 1 tileset for apartment interiors (~24 tiles)
- 2 tilesets for the Day 2 maps (lobby ~16 tiles, rooftop ~16 tiles)
- UI elements: cursor, AP indicator, exit marker, objective marker, HP bar, item icons (~12 elements)

### 10.2 Audio

- 2 music tracks: ambient loop for Day 1, final-stand cue for Day 2
- ElevenLabs for SFX
- ElevenLabs or Beatoven for music

**SFX coverage (~22 total):**
- Player: footstep, melee swing, melee hit, gunshot, reload, hurt, death, item use, exit found
- Enemy: spotted, attack, hurt, death (per enemy type)
- UI: click, transition, low-health warning, victory, defeat

### 10.3 Asset budget

Asset generation and integration is allocated across Day 6 (audio + UI) and Day 7 (final art pass and ship). The goal is to ship with all real assets meeting the quality bar; if any asset fails the bar, the cut list ([Section 13.1](#131-the-cut-list)) governs whether to drop the feature or extend the timeline.

---

## 11. Technical Approach

### 11.1 Stack

| Layer | Choice |
|---|---|
| Language | TypeScript, strict mode |
| Engine | Phaser 3 |
| Build | Vite |
| State | Plain TypeScript classes; no Redux, no signals |
| Persistence | LocalStorage for run history only; no mid-run save |
| Hosting | itch.io static hosting |
| Repo | GitHub, public from Day 1 |

### 11.2 Code organization

```
src/
├── main.ts              entry point, Phaser game config
├── scenes/              Phaser scenes (Boot, Menu, Run, GameOver)
├── systems/             combat, AP, line-of-sight, exit detection, feedback
├── procgen/             chunk loader, stitching, enemy placement, validation
├── data/                JSON: traits, weapons, chunks, balance, names
└── ui/                  HUD, menus, dialog rendering
```

### 11.3 Agentic workflow setup

Day 1 morning is for setup, not coding. Non-negotiable Day 1 deliverables:
- Repo created and on GitHub (public)
- CLAUDE.md committed
- Dependencies installed
- Hello-world deployed to Cloudflare Pages production URL and verified on iPhone Safari portrait (ADR-0010)

itch.io is the **ship** target, not the preview target. The itch.io upload happens on Day 7 (see §13). Cloudflare Pages owns the iPhone test loop during the build week.

Game logic begins only after the dev environment is real.

---

## 12. Quality Bar

This section defines what "quality" concretely means. Every claim is testable. If a claim cannot be verified by playing the game, it is not in this section.

### 12.1 Combat feel

- **Hits and misses are unambiguous within 250 ms.** Every player attack produces a visible impact (hit flash on target, miss spark on tile) and an audio cue. Silent feedback is a bug.
- **Damage taken is unmistakable.** Taking damage produces a screen-edge flash, a hurt sprite frame, and a distinct SFX. The player never wonders "did I just take damage?"
- **AP cost is visible before commit.** Hovering an action shows its AP cost and projected hit chance. No hidden costs.
- **Enemy turns complete in under 2 seconds.** The player never waits for the game to think.
- **Hit-chance tells are stable.** "Probable" means roughly the same odds in every situation. The qualitative system is consistent enough that players develop accurate intuition over the course of a run.

### 12.2 Information design

The player always sees, **without searching**: current AP, max AP, current HP, max HP, equipped weapon and ammo, day number, turn number, current objective. None of these are hidden in submenus.

**Every game-relevant fact is either always-visible on the map or always-visible in the inspection panel for the current selection.** No fact is gated on hover or transient interaction. The same model runs on desktop and iPhone portrait. See ADR-0008 for the mechanism. Concretely:

- **Always-visible glyphs** render on the relevant tile or unit: enemy HP bar and threat-type icon; exit type icon, trait-gate icon, and one-line implication; item icon; cover marker.
- **Sticky inspection panel** (bottom-anchored on portrait, side on landscape) always shows the current selection's full details. Default selection at the start of every turn is the protagonist. Tap or click a different target to move the selection.
- **Action targeting projects every valid target's AP cost and qualitative hit-chance simultaneously** when the player enters a move/attack/item-use mode. There is no per-target hover-to-reveal step on either platform. Confirm is explicit (first tap stages, second tap commits).

### 12.3 Visual coherence

- **All sprite art comes from a single PixelLab session.** Style drift between sessions is the most common asset-pipeline failure. The protagonist, enemies, and UI characters must be generated together with the same style prompt. If a single asset fails the coherence bar, the entire set is regenerated, not just the failing asset.
- **Tile palette is constrained.** Each tileset uses ~16–24 colors. Tiles within a set share the palette. The two Day 2 tilesets may differ in palette but must share visual logic (same line weight, same shading model).
- **UI typography is consistent.** One pixel-friendly font for the HUD, one for body text. Two fonts maximum across the entire game.

### 12.4 Audio coverage

- **Every player action has an SFX.** Move, attack, miss, take damage, item use, exit found, level transition, death. Silent UI is a bug.
- **Every enemy action has an SFX.** Spotted, attack, hurt, death. The player should be able to close their eyes for a turn and have a rough idea of what happened.
- **Music supports without competing.** Ambient loops are mixed below SFX. The final-stand cue ducks for combat sounds. A player should never lose an SFX cue under music.

### 12.5 Onboarding

- **No tutorial pop-ups.** The first three turns of Day 1 are the tutorial: the spawn room is small, contains one melee alien, and on-screen hints surface controls as they become relevant.
- **Failure is legible.** When the protagonist dies, the run-end screen shows what killed them and on which turn. "You died" is not enough; "a ranged alien shot you from cover on turn 14" is the bar.

### 12.6 What is explicitly NOT a quality requirement

- Production polish beyond the bars above (particle effects, screen shake, animation flourishes are nice but not required).
- Accessibility features beyond readable contrast and remappable keys.
- Settings menus beyond audio sliders and key remap.
- Multiple difficulty modes.
- Cosmetic variety beyond what serves coherence.

These are out of scope because they are real polish — they would absorb time the project does not have.

---

## 13. Build Plan

Seven days, with explicit slack for quality work. Day-end criteria reference the quality bar in Section 12 — "playable" is not enough.

| Day | Focus | End-of-day criterion |
|---|---|---|
| **Day 1** | Setup, dev environment, combat skeleton | Phaser project compiles. Hello-world is live on Cloudflare Pages and verified on iPhone Safari portrait (ADR-0010). Click-to-move with AP works on a static map. One enemy pathfinds. CLAUDE.md is in the repo. |
| **Day 2** | Combat completion AND combat feel | [Section 12.1](#121-combat-feel) is met for the existing combat. Hits, misses, damage-taken all read in under 250 ms. AP costs visible on hover. Enemy turns under 2 seconds. **If feel is not met, Day 3 is also combat feel.** |
| **Day 3** | Procgen for Day 1 map | 8 apartment chunks authored. Stitcher produces valid maps with 2 reachable exits. Visual coherence at chunk seams is acceptable. Enemy and item placement works. |
| **Day 4** | Day chain + Day 2 handcrafted maps | Both Day 2 maps (lobby, rooftop) authored. Day 1 → Day 2 transition works. Run-end screen shows the right summary. [Section 12.5](#125-onboarding) is met for the first three turns of Day 1. |
| **Day 5** | Traits, character generation, information design pass | 5 traits implemented. 2-trait character generation works. All HUD elements from [Section 12.2](#122-information-design) visible without searching. Hover information implemented. |
| **Day 6** | Audio integration, UI polish, balance pass | [Section 12.4](#124-audio-coverage) is met. [Section 12.3](#123-visual-coherence) is at acceptable bar with placeholder art. Difficulty curve is tuned by 3+ test runs. |
| **Day 7** | Final art generation, ship | All real art is in place. [Section 12.3](#123-visual-coherence) is met at full quality. itch.io page is live. Devlog is published. |

### 13.1 The cut list

Pre-decided cuts to make if the quality bar is at risk. **Cuts are ordered from least painful to most painful — content cuts first, experience cuts last.**

1. **One enemy type.** Ship with melee aliens only. (Removes one tuning surface.)
2. **One trait.** Drop Resourceful, the most easily replaceable. (Reduces character variety.)
3. **Procgen for Day 1.** Replace with two handcrafted Day 1 maps. (Removes a learning goal but ships a better game.)
4. **One Day 2 map.** Both exits lead to the same handcrafted final stand with cosmetic differences. (Reduces Day 1's choice weight.)
5. **Item system.** Cut medkits and flashbangs entirely. (Reduces tactical depth significantly.)
6. **Cover system.** Replace with flat hit chances per range. (Last cut; removes a meaningful tactical layer.)

**Rule:** Cuts come from the **top** of this list, not the bottom. Every cut above the line is content; every cut below it is experience. **Experience cuts are last.**

### 13.2 Extending the timeline

If by end of Day 6 the quality bar is not met for any system already shipped, the project extends to Days 8–10 rather than shipping below the bar.

**Extension is not failure.** The seven-day frame is a guideline. The project's purpose is satisfied better by an eight-day shipped quality game than by a seven-day shipped mediocre one.

The hard limit is ten days. Beyond that, the cut list applies.

---

## 14. Success Criteria

### 14.1 The game ships
On itch.io, publicly playable, with a page that shows the game in a reasonable light. Binary.

### 14.2 The quality bar is met
Every claim in [Section 12](#12-quality-bar) is verifiable in the shipped build. The developer can sit a stranger in front of the game and know, before they play, that none of the bars will be obviously violated.

### 14.3 The mechanic is alive
Three runs reveal that the exit-choice-as-relocation mechanic produces meaningful decisions. A player who chose stairwell once and fire escape once should be able to articulate why those runs felt different.

### 14.4 The learning is consolidated
A 500–1500 word devlog covering: what worked in the agentic workflow, what surprised in the asset pipeline, what would be done differently.

### 14.5 What is NOT a success criterion
- Player count, ratings, or itch.io reception
- Long playtimes per player (a 20-minute game played twice is the design target)
- Comprehensive accessibility, localization, or settings
- Production polish beyond Section 12

---

## 15. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Combat does not feel good by end of Day 2 | **Critical** | Day 3 also becomes combat feel. Procgen slips a day. If by end of Day 3 combat still does not meet [Section 12.1](#121-combat-feel), the project extends to 8–10 days rather than ships below the bar. |
| Procgen produces incoherent or unplayable maps | **High** | Validation in the generator (reachable exits, no soft-locks). If quality is not met, fall back to handcrafted Day 1 maps via the cut list. |
| AI assets fail visual coherence ([Section 12.3](#123-visual-coherence)) | **High** | Single-session generation rule. If coherence fails, regenerate the entire set, not individual sprites. Budget two PixelLab sessions on Day 7 in case the first set is rejected. |
| Audio coverage incomplete by Day 6 | **Medium-High** | Audio is a Day 6 task with explicit coverage criteria. If a coverage gap is found on Day 7, ship with the gap — but record it as a known issue in the devlog. |
| Phaser learning curve eats Day 1 | **Medium** | Day 1 is intentionally minimal. Hello-world on itch.io is the only required deliverable. |
| Scope creep mid-week | **Medium** | Cut list in [Section 13.1](#131-the-cut-list) is the answer. Re-read it daily. "Just one more thing" is the failure mode. |
| Burnout across the build week | **Medium** | Plan one rest day if energy demands it. The schedule has slack via [Section 13.2](#132-extending-the-timeline). Quality work cannot be done by a tired developer. |

---

## 16. What This Project Is Not

A larger PRD (Last Light Cell) describes a more ambitious game built around the same mechanical ideas. The relationship between the two should be explicit so future-you does not confuse them.

Three Days is **not a prototype** of the larger game. It is a different product with different success criteria and a different scope. Some mechanical ideas — exits-as-relocation, trait-driven characters, chunk-based procgen — are shared because they are good ideas worth testing. Most of the larger game (recruits, base relocation, LLM content pipeline, doom track, full trait pool, civilian-to-cell progression) is absent and will not be added during this build.

If Three Days ships at the quality bar and the mechanic is alive, the larger PRD is the natural next project. If Three Days ships below the bar, the right next project is **not** Last Light Cell — it is another small project that holds a quality bar at smaller scope. **The smaller project earns the right to consider the larger one.**
