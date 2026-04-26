/**
 * Movement logic — AP cost calculation and reachable-tile sets.
 *
 * Pure functions. No Phaser. Costs are BFS path length on the 4-connected
 * grid, accounting for walls (when they land in spec 0005+) and runtime
 * occupants in `blocked` (e.g. enemies). For the all-floor spec-0003 map
 * with one enemy, BFS distance equals Manhattan distance everywhere
 * except for tiles whose direct route is blocked — there the BFS detour
 * cost is the honest number to show the player.
 */

import balance from "../data/balance.json";
import { tilesInRange, type TilePos } from "./grid";
import type { Day1Map } from "./map";
import { bfs } from "./pathfind";

const MOVE_COST_PER_TILE = balance.MOVE_COST_PER_TILE;

function isBlocked(t: TilePos, blocked: TilePos[]): boolean {
  return blocked.some((b) => b.col === t.col && b.row === t.row);
}

/**
 * AP cost to reach `to` from `from`, accounting for walls and `blocked`
 * tiles. Returns `Infinity` for off-map targets, blocked targets, or any
 * target with no valid path.
 *
 * The cost is `(path.length - 1) * MOVE_COST_PER_TILE`, where path is the
 * BFS shortest path. With `MOVE_COST_PER_TILE = 1` this equals "tiles
 * traversed."
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
  const path = bfs(from, to, map, blocked);
  if (path === null) return Infinity;
  return (path.length - 1) * MOVE_COST_PER_TILE;
}

/**
 * Every tile reachable from `from` within `ap` action points, accounting
 * for walls and `blocked` tiles. The `from` tile itself is included.
 *
 * Implementation: take Manhattan-radius candidates as an upper bound, then
 * filter by BFS cost. Honest under detours (an enemy in the way correctly
 * extends the cost or removes the tile from the set entirely).
 */
export function reachableTiles(
  from: TilePos,
  ap: number,
  map: Day1Map,
  blocked: TilePos[] = [],
): TilePos[] {
  const candidates = tilesInRange(
    from,
    Math.floor(ap / MOVE_COST_PER_TILE),
    map,
  );
  return candidates.filter((t) => {
    if (t.col === from.col && t.row === from.row) return true;
    const cost = apCostToReach(from, t, map, blocked);
    return Number.isFinite(cost) && cost <= ap;
  });
}
