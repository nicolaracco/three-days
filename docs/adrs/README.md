# Architecture Decision Records

ADRs capture *technical* decisions: stack, structure, conventions, mechanisms. They do **not** duplicate the GDD — design decisions (combat model, trait pool, run length, etc.) live there.

A new ADR is warranted when:

1. A choice is made that future code will be expected to honor.
2. The choice has at least one plausible alternative.
3. Reversing the choice would touch multiple files.

If those don't all apply, the rule probably belongs in `CLAUDE.md` or as a comment in the relevant file.

## Index

| #    | Title                                                                  | Status   |
|------|------------------------------------------------------------------------|----------|
| 0001 | [Stack](0001-stack.md)                                                 | Accepted |
| 0002 | [No state framework](0002-no-state-framework.md)                       | Accepted |
| 0003 | [Client-only architecture (with persistence model)](0003-client-architecture.md) | Accepted |
| 0004 | [Layered architecture](0004-layered-architecture.md)                   | Accepted |
| 0005 | [Tile/pixel coordinates](0005-tile-pixel-coordinates.md)               | Accepted |
| 0006 | [Placeholder asset strategy](0006-placeholder-asset-strategy.md)       | Accepted |
| 0007 | [Seeded RNG](0007-seeded-rng.md)                                       | Accepted |
| 0008 | [UI architecture (platform, input, information design)](0008-ui-architecture.md) | Accepted |
| 0009 | [Testing discipline](0009-testing-discipline.md)                       | Accepted |
| 0010 | [Remote preview pipeline (Cloudflare Workers + Static Assets)](0010-preview-pipeline.md) | Accepted |
| 0011 | [World camera with screen-space UI overlays](0011-world-camera.md)     | Accepted |

## Authoring

Copy `TEMPLATE.md` to `NNNN-kebab-title.md` using the next free number. Keep them short — an ADR longer than one screen is usually trying to be a design doc.

## Verification — who runs the checks, and when

Each ADR ends with a **Verification** section: a list of greppable, file-pointable checks that prove the codebase is honoring the decision.

- The `quality-reviewer` agent (`.claude/agents/quality-reviewer.md`) runs the checks against the diff at PR time, before any merge to `main`.
- The `implementer` agent runs the relevant ADR's checks on its own diff before reporting a task done.
- The developer can re-run the checks at any time as a sanity sweep — `quality-reviewer` is invoked via the `/code-review` slash command.

If a Verification check is too vague to be run mechanically, the ADR is incomplete; sharpen it. If a check requires manual play-test (true for some §12 sub-bars under ADR-0008 / ADR-0009), say so explicitly and reference the spec's Test plan.

## Numbering convention

Numbers in this index are **stable from now on**. The earlier renumbering (during architectural foundation work) was a one-time correction; subsequent ADRs receive the next free number and existing numbers do not shift. References in commits, comments, and docs can be trusted.

If an ADR is superseded, mark it `Superseded by ADR-XXXX` in its frontmatter rather than renumbering or deleting it.
