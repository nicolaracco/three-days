/**
 * Movement logic — AP cost calculation and reachable-tile sets.
 *
 * Pure functions. No Phaser. Walls / blocking enemies will refine the
 * pathfinding model in spec 0003+; for now the map is all-floor and
 * costs are Manhattan-distance × `MOVE_COST_PER_TILE`.
 */

import balance from "../data/balance.json";
import type { TilePos } from "./grid";
import { tilesInRange } from "./grid";
import type { Day1Map } from "./map";

const MOVE_COST_PER_TILE = balance.MOVE_COST_PER_TILE;

/**
 * AP cost to reach `to` from `from`. Returns `Infinity` for off-map targets.
 *
 * Manhattan distance × per-tile cost. Walls don't exist in spec 0002; once
 * they do, this returns `Infinity` (or runs a real pathfinder) when no path
 * is reachable.
 */
export function apCostToReach(
  from: TilePos,
  to: TilePos,
  map: Day1Map,
): number {
  if (to.col < 0 || to.col >= map.width || to.row < 0 || to.row >= map.height) {
    return Infinity;
  }
  const dist = Math.abs(to.col - from.col) + Math.abs(to.row - from.row);
  return dist * MOVE_COST_PER_TILE;
}

/**
 * Every tile reachable from `from` within `ap` action points.
 *
 * In spec 0002 the map is all-floor with uniform 1 AP/tile cost, so the
 * reachable set is a Manhattan diamond clipped to map bounds — i.e.
 * `tilesInRange(from, ap, map)`. When walls and blocking enemies arrive
 * this becomes a BFS over the grid.
 */
export function reachableTiles(
  from: TilePos,
  ap: number,
  map: Day1Map,
): TilePos[] {
  return tilesInRange(from, Math.floor(ap / MOVE_COST_PER_TILE), map);
}
