# Spec NNNN: <Feature title>

**Status:** Draft | Approved | In progress | Done | Cancelled
**Roadmap day:** GDD §13 Day N
**Owner:** <name>
**Related ADRs:** ADR-XXXX, ADR-YYYY

## Goal

One paragraph. What this feature delivers, in plain English. The reader should be able to repeat the goal back without reading the rest.

## Why this, why now

Two to four sentences linking the feature to a GDD pillar (§3), a quality-bar sub-bar (§12), or a roadmap deliverable (§13). If the link isn't load-bearing, the spec probably shouldn't exist.

## Scope

### In scope

Bullet list of *exactly* what this spec covers.

### Out of scope

Bullet list of things a reader might assume are included but are not. Naming what's *out* prevents quiet scope creep.

## Inputs

What this feature reads from. Examples:

- `data/balance.json` for AP costs
- `RunState.seed` for RNG initialization
- User input: pointer events on `RunScene` (unified mouse + touch — see ADR-0008)

## Outputs / Effects

What state changes, what gets rendered, what events fire. Examples:

- Mutates `RunState.units[i].hp`
- Emits `event:damage-dealt` with `{ targetId, amount, source }`
- Renders hit/miss FX in `scenes/run.ts`

## Interaction (desktop + mobile, same model)

Required for any UI-touching spec. Per ADR-0008, desktop and mobile share one model — selection-driven, no hover dependency. Specify:

- **Always-visible glyphs.** What the feature renders directly onto tiles or units (HP bar, threat icon, exit type, gate icon, item icon, cover marker, AP cost label, hit-chance label). Anything that *could* have been hover-revealed must be listed here or in the panel item below.
- **Inspection panel.** What the panel shows when this feature is the current selection. Include the panel's content for every selectable thing the feature introduces.
- **Targeting (if applicable).** When the player enters this feature's action mode (move, attack, item-use), what is rendered onto every valid target tile *simultaneously* — not on hover.
- **Confirm flow.** First tap stages, second tap on the same target commits. Specify the cancel path (tap outside, escape key on desktop).
- **Hit areas.** Touch targets ≥ 44 × 44 logical px. Note any element where this is non-trivial.

If the feature is pure logic with no UI, write "N/A" here and move on.

## Acceptance criteria

Checklist tied to behavior the user (or a reviewer) can verify. Each criterion is testable. Mark each criterion as **[unit]** (covered by an automated test) or **[manual]** (verified by play-test). A criterion may have both. Example:

- [ ] **[unit]** Selecting an attack with insufficient AP is rejected; emits `event:action-denied` with reason `"insufficient-ap"`.
- [ ] **[unit + manual]** On hit, target HP decrements, and a hit flash + SFX play within 250 ms.
- [ ] **[manual]** In attack-targeting mode, every valid target tile shows AP cost and qualitative hit chance simultaneously, on iPhone portrait, with no off-screen overlap and labels readable at the working portrait resolution.

If the spec touches a GDD §12 sub-bar, list which sub-bar(s) and the specific bar lines this satisfies.

## Test plan

Per ADR-0009, the test plan splits the criteria explicitly:

### Automated tests (red-green)

- Unit tests in `systems/<area>.test.ts`: list the cases. Each case ties to one or more `[unit]` criteria above.
- Property tests in `procgen/<area>.test.ts` if applicable.

### Manual play-test (verify)

For every `[manual]` criterion, list the scenario:

- **Scenario name:** what to do.
- **Pass condition:** what the tester must observe (timing, SFX presence, on-screen text, hit area reachability with a thumb).
- **Targets:** desktop browser **and** iPhone Safari portrait via the preview URL (ADR-0010), unless the criterion is platform-specific.

If a sub-bar of §12 applies (12.1 combat feel, 12.2 information design, 12.3 visual coherence, 12.4 audio coverage, 12.5 onboarding), cite the exact bar line and how it's checked.

## Open questions

Bullet list of things that need a decision before implementation. Empty list = ready to implement. Don't suppress questions — surfacing them is the whole point of a spec.

## Done means

One paragraph. The shippable result. If this spec is finished, what does the player see / experience on desktop *and* on iPhone portrait?
