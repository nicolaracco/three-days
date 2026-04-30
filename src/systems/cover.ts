/**
 * Cover + qualitative hit chance (spec 0014).
 *
 * Cover is a per-tile authoring layer (`Day1Map.coverTiles`); a covered
 * target is one whose Bresenham line from an attacker passes through
 * any cover tile. The four hit-chance levels (`certain | probable |
 * risky | unlikely`) collapse range and cover into a qualitative scale
 * matching GDD §7.1; their probabilities (1.0 / 0.75 / 0.5 / 0.25) are
 * applied at attack-commit time by `combat.commitAttack` against the
 * per-state RNG.
 *
 * Pure / Phaser-free.
 */

import type { TilePos } from "./grid";
import { tilesAlongLine } from "./los";
import type { Day1Map } from "./map";

export type CoverState = "full" | "none";

export type HitChance = "certain" | "probable" | "risky" | "unlikely";

/** Manhattan threshold for "risky" vs "unlikely" when cover is in play. */
const COVER_CLOSE_DISTANCE = 4;

/**
 * `"full"` if any tile *strictly between* `from` and `to` is in
 * `map.coverTiles`. Endpoints are excluded — a cover tile *at* the
 * shooter's or target's position is irrelevant. Returns `"none"` when
 * nothing on the line provides cover.
 */
export function coverBetween(
  from: TilePos,
  to: TilePos,
  map: Day1Map,
): CoverState {
  const line = tilesAlongLine(from, to);
  if (line.length <= 2) return "none"; // adjacent or same-tile — no in-between
  for (let i = 1; i < line.length - 1; i++) {
    const t = line[i];
    if (map.coverTiles.some((c) => c.col === t.col && c.row === t.row)) {
      return "full";
    }
  }
  return "none";
}

export interface HitChanceArgs {
  attacker: TilePos;
  target: TilePos;
  weaponRange: number;
  cover: CoverState;
}

/**
 * Resolve the qualitative hit-chance level for an attack. Per spec 0014:
 *  - `certain`: melee (range 1) — bypasses cover entirely.
 *  - `probable`: ranged, no cover.
 *  - `risky`: ranged, cover, Manhattan distance ≤ 4.
 *  - `unlikely`: ranged, cover, Manhattan distance > 4.
 *
 * Caller is responsible for the LoS check (spec 0012) — `hitChance`
 * assumes a shot is being fired and only quantifies how likely it is to
 * land.
 */
export function hitChance(args: HitChanceArgs): HitChance {
  if (args.weaponRange <= 1) return "certain";
  if (args.cover === "none") return "probable";
  const dist =
    Math.abs(args.attacker.col - args.target.col) +
    Math.abs(args.attacker.row - args.target.row);
  return dist <= COVER_CLOSE_DISTANCE ? "risky" : "unlikely";
}

/** Probability mapping per spec 0014 (locked decisions). */
export function hitChanceProbability(level: HitChance): number {
  switch (level) {
    case "certain":
      return 1.0;
    case "probable":
      return 0.75;
    case "risky":
      return 0.5;
    case "unlikely":
      return 0.25;
  }
}
