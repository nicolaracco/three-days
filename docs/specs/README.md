# Specs

Specs translate a roadmap item (GDD §13) into a contract a reviewer can use to decide whether the implementation is done. They are the mechanism by which "scope creep" or "quality-bar drift" become explicit decisions instead of accidents.

## Authoring discipline

- Specs are written **just-in-time**, not all at once. Stay one or two specs ahead of implementation. The roadmap moves; specs written far in advance go stale.
- One spec per shippable feature. If the spec covers more than one feature, split it.
- A spec exists when work starts on its feature, not before.
- A spec stops being authoritative when its status is `Done`. After that, the code is the source of truth and the spec is a historical artifact.

## Workflow

1. The `spec-author` agent (`.claude/agents/spec-author.md`) drafts a spec from a GDD §13 day item.
2. The user approves the spec (status → `Approved`).
3. The `implementer` agent (`.claude/agents/implementer.md`) takes an approved spec and writes code, **only** what the spec describes.
4. The `quality-reviewer` agent verifies the diff against the spec's acceptance criteria and the GDD §12 quality bar.

## Numbering

Specs are numbered in the order they're authored, not in the order of the roadmap: `0001-…`, `0002-…`. The `Roadmap day` field in the spec frontmatter records which §13 day item it serves.

## Index

| #    | Title                                                                              | Status | Roadmap day |
|------|------------------------------------------------------------------------------------|--------|-------------|
| 0001 | [Project scaffold and Cloudflare preview pipeline](0001-project-scaffold-and-preview.md) | Done     | §13 Day 1   |
| 0002 | [Click-to-move with AP on a static map](0002-click-to-move-with-ap.md)                  | Done     | §13 Day 1   |
| 0003 | [One enemy pathfinds](0003-one-enemy-pathfinds.md)                                      | Done     | §13 Day 1   |
| 0004 | [Combat skeleton (melee, HP, damage, death)](0004-combat-skeleton.md)                   | Done     | §13 Day 2   |
| 0005 | [Procgen foundation (chunks + RNG + stitcher + validator)](0005-procgen-foundation.md)  | Done     | §13 Day 3   |
| 0006 | [Live procgen integration](0006-live-procgen-integration.md)                            | Done     | §13 Day 3   |
| 0007 | [Full procgen (connectors, multi-chunk, spawn slots)](0007-full-procgen.md)             | Done     | §13 Day 3   |
| 0008 | [Build version tag](0008-build-version-tag.md)                                          | Done     | N/A — dev ergonomics |
| 0009 | [Exits — `ExitTile`, two-exit guarantee, escape stub](0009-exits.md)                    | Done     | §13 Day 3 |
| 0010 | [Items — medkit and flashbang](0010-items.md)                                           | Done     | §13 Day 3 |
| 0011 | [Day chain — Day-2 maps, transition, objectives, run-end](0011-day-chain.md)            | Done     | §13 Day 4 |
| 0012 | [Ranged enemies + line-of-sight](0012-ranged-enemies-los.md)                            | Done     | §13 Day 4 |
