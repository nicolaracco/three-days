---
description: Audit the current build against GDD Section 12 (Quality Bar)
allowed-tools: Read, Bash(git ls-files:*), Bash(rg:*), Bash(grep:*), Glob, Grep
---

Walk the current build against GDD Section 12 sub-by-sub. For each subsection, report PASS / FAIL / N/A (not yet implemented), with one-line evidence.

Sections:

- 12.1 Combat feel — hit/miss feedback under 250 ms, damage flash + hurt frame + SFX, AP cost visible on hover, enemy turns < 2 s, stable qualitative hit-chance tells.
- 12.2 Information design — AP, max AP, HP, max HP, weapon, ammo, day, turn, objective always visible. Hover reveals tile / enemy / exit details.
- 12.3 Visual coherence — single palette per tileset, two fonts max.
- 12.4 Audio coverage — every player action, enemy action, UI interaction has SFX; music ducks for SFX.
- 12.5 Onboarding — no tutorial pop-ups; failure is legible.

Steps:

1. Read `docs/three-days-gdd.md` Section 12 to ground the bar.
2. For each subsection, scan the relevant files (`systems/`, `scenes/`, `ui/`, `data/`, `public/assets/`).
3. Output a table:

   ```
   | Subsection | Status | Evidence |
   ```

4. End with a one-paragraph summary: which subsections need attention, what the highest-priority gap is.

Do not invent passes. If a subsection is not yet implemented, mark N/A and say what would constitute a pass.
