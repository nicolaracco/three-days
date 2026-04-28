/**
 * BFS pathfinding over the 4-connected grid.
 *
 * Pure function. Walls (when they land in spec 0005+) are read off the map's
 * tile data; runtime occupants (enemies, the protagonist when relevant) are
 * passed in via `blocked`. Returns the shortest path inclusive of both
 * endpoints, or `null` when no path exists.
 *
 * BFS is sufficient for the all-floor 11×15 map (~165 tiles) — the spec
 * deliberately defers A* until terrain costs vary or perf demands it.
 */

import type { TilePos } from "./grid";
import type { Day1Map } from "./map";

const DIRECTIONS: ReadonlyArray<{ dCol: number; dRow: number }> = [
  { dCol: 0, dRow: -1 },
  { dCol: 1, dRow: 0 },
  { dCol: 0, dRow: 1 },
  { dCol: -1, dRow: 0 },
];

function key(t: TilePos): string {
  return `${t.col},${t.row}`;
}

function isBlocked(t: TilePos, blocked: TilePos[]): boolean {
  return blocked.some((b) => b.col === t.col && b.row === t.row);
}

function isWalkable(t: TilePos, map: Day1Map): boolean {
  if (t.col < 0 || t.col >= map.width || t.row < 0 || t.row >= map.height) {
    return false;
  }
  const kind = map.tiles[t.row][t.col].kind;
  // Spec 0009: exits are walkable. Stepping onto one ends the run; that
  // higher-level effect is the scene's concern, not pathfind's.
  return kind === "floor" || kind === "exit";
}

/**
 * Shortest 4-connected path from `from` to `to` on `map`, avoiding `blocked`.
 *
 * Returns `null` when no path exists (including when `from` itself is in
 * `blocked` — a degenerate case that BFS can't begin from).
 */
export function bfs(
  from: TilePos,
  to: TilePos,
  map: Day1Map,
  blocked: TilePos[],
): TilePos[] | null {
  if (isBlocked(from, blocked)) return null;
  if (!isWalkable(from, map) || !isWalkable(to, map)) return null;
  if (from.col === to.col && from.row === to.row) return [from];

  const visited = new Set<string>([key(from)]);
  const cameFrom = new Map<string, TilePos>();
  const queue: TilePos[] = [from];

  while (queue.length > 0) {
    const current = queue.shift() as TilePos;
    for (const { dCol, dRow } of DIRECTIONS) {
      const next: TilePos = {
        col: current.col + dCol,
        row: current.row + dRow,
      };
      const k = key(next);
      if (visited.has(k)) continue;
      if (!isWalkable(next, map)) continue;
      // The destination tile is allowed even if listed in `blocked` (callers
      // sometimes want a path *to* the blocking entity, e.g. enemy AI
      // pathing toward the protagonist's tile). Intermediate blocks are not.
      const isDestination = next.col === to.col && next.row === to.row;
      if (!isDestination && isBlocked(next, blocked)) continue;
      visited.add(k);
      cameFrom.set(k, current);
      if (isDestination) {
        // Reconstruct
        const path: TilePos[] = [next];
        let cursor = current;
        while (!(cursor.col === from.col && cursor.row === from.row)) {
          path.unshift(cursor);
          const parent = cameFrom.get(key(cursor));
          if (!parent) return null; // defensive — shouldn't happen
          cursor = parent;
        }
        path.unshift(from);
        return path;
      }
      queue.push(next);
    }
  }

  return null;
}
