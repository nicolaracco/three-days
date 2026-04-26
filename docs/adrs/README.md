# Architecture Decision Records

ADRs capture *technical* decisions: stack, structure, conventions, mechanisms. They do **not** duplicate the GDD — design decisions (combat model, trait pool, run length, etc.) live there.

A new ADR is warranted when:

1. A choice is made that future code will be expected to honor.
2. The choice has at least one plausible alternative.
3. Reversing the choice would touch multiple files.

If those don't all apply, the rule probably belongs in `CLAUDE.md` or as a comment in the relevant file.

## Index

| #    | Title                              | Status   |
|------|------------------------------------|----------|
| 0001 | [Stack](0001-stack.md)             | Accepted |
| 0002 | [No state framework](0002-no-state-framework.md) | Accepted |
| 0003 | [Client-only architecture](0003-client-only.md) | Accepted |
| 0004 | [Persistence model](0004-persistence-model.md) | Accepted |
| 0005 | [Layered architecture](0005-layered-architecture.md) | Accepted |
| 0006 | [Tile/pixel coordinates](0006-tile-pixel-coordinates.md) | Accepted |
| 0007 | [Placeholder asset strategy](0007-placeholder-asset-strategy.md) | Accepted |
| 0008 | [Seeded RNG](0008-seeded-rng.md)   | Accepted |
| 0009 | [Mobile portrait support](0009-mobile-portrait-support.md) | Accepted |
| 0010 | [Testing discipline](0010-testing-discipline.md) | Accepted |
| 0011 | [Remote preview pipeline (Cloudflare Pages)](0011-preview-pipeline.md) | Accepted |

## Authoring

Copy `TEMPLATE.md` to `NNNN-kebab-title.md` using the next free number. Keep them short — an ADR longer than one screen is usually trying to be a design doc.
