/**
 * Movement logic — AP cost calculation and reachable-tile sets.
 *
 * Pure functions. No Phaser. Walls (spec 0005+) and runtime occupants
 * (enemies — passed via `blocked`) refine reachability. For the all-floor
 * spec-0003 map without walls and with one enemy, costs are still
 * Manhattan-distance × `MOVE_COST_PER_TILE`; when walls land this switches
 * to a BFS over the grid.
 */

import balance from "../data/balance.json";
import type { TilePos } from "./grid";
import { tilesInRange } from "./grid";
import type { Day1Map } from "./map";

const MOVE_COST_PER_TILE = balance.MOVE_COST_PER_TILE;

function isBlocked(t: TilePos, blocked: TilePos[]): boolean {
  return blocked.some((b) => b.col === t.col && b.row === t.row);
}

/**
 * AP cost to reach `to` from `from`. Returns `Infinity` for off-map targets
 * and for any target listed in `blocked` (e.g. an enemy's tile).
 */
export function apCostToReach(
  from: TilePos,
  to: TilePos,
  map: Day1Map,
  blocked: TilePos[] = [],
): number {
  if (to.col < 0 || to.col >= map.width || to.row < 0 || to.row >= map.height) {
    return Infinity;
  }
  if (isBlocked(to, blocked)) {
    return Infinity;
  }
  const dist = Math.abs(to.col - from.col) + Math.abs(to.row - from.row);
  return dist * MOVE_COST_PER_TILE;
}

/**
 * Every tile reachable from `from` within `ap` action points, excluding any
 * tile listed in `blocked`. The `from` tile itself is included (a no-op
 * move costs 0 AP).
 */
export function reachableTiles(
  from: TilePos,
  ap: number,
  map: Day1Map,
  blocked: TilePos[] = [],
): TilePos[] {
  const inRange = tilesInRange(from, Math.floor(ap / MOVE_COST_PER_TILE), map);
  if (blocked.length === 0) return inRange;
  return inRange.filter((t) => !isBlocked(t, blocked));
}
