/**
 * Procgen — combine hand-authored chunks into a `Day1Map`.
 *
 * Spec 0005: 2-chunk vertical stitch. Picks one entrance + one back via
 * seeded RNG; vertical concatenation; door tiles become floor in the
 * stitched output. Spec 0006 generalizes this to multi-chunk stitching
 * with variable sizes, multiple exits, spawn slots.
 *
 * Pure function: `generateMap(rng)` returns a fresh `Day1Map`. Validates
 * connectivity before returning — any failure is a bug in the chunk
 * library, not a runtime concern.
 */

import { type ChunkTile, getChunksOfKind } from "./chunk";
import type { TilePos } from "./grid";
import type { Day1Map, Tile } from "./map";
import type { Rng } from "./rng";

/**
 * Build a fresh `Day1Map` by stitching one entrance chunk and one back
 * chunk vertically. Deterministic for a given `Rng` (and therefore for a
 * given seed via `createRng(seed)`).
 */
export function generateMap(rng: Rng): Day1Map {
  const entrance = rng.pickOne(getChunksOfKind("entrance"));
  const back = rng.pickOne(getChunksOfKind("back"));

  if (entrance.start === null) {
    throw new Error(
      `Entrance chunk ${entrance.id} has no start position — required for entrance kind`,
    );
  }
  if (entrance.width !== back.width) {
    throw new Error(
      `Chunk width mismatch: entrance ${entrance.id} is ${entrance.width}, back ${back.id} is ${back.width}`,
    );
  }

  const tiles: Tile[][] = [];
  for (const row of entrance.tiles) tiles.push(row.map(liftToMapTile));
  for (const row of back.tiles) tiles.push(row.map(liftToMapTile));

  const map: Day1Map = {
    width: entrance.width,
    height: entrance.height + back.height,
    start: entrance.start,
    tiles,
  };

  if (!isFullyConnected(map, map.start)) {
    throw new Error(
      `Generated map (entrance=${entrance.id}, back=${back.id}) is not fully connected`,
    );
  }

  return map;
}

/** Convert a chunk tile into a map tile — door becomes floor. */
function liftToMapTile(t: ChunkTile): Tile {
  if (t.kind === "door") return { kind: "floor" };
  return t;
}

/**
 * BFS from `from` over 4-connected floor tiles. Returns `true` iff every
 * floor tile in the map is reachable.
 */
export function isFullyConnected(map: Day1Map, from: TilePos): boolean {
  let totalFloors = 0;
  for (const row of map.tiles) {
    for (const tile of row) {
      if (tile.kind === "floor") totalFloors++;
    }
  }
  if (totalFloors === 0) return true;

  const visited = new Set<string>();
  const queue: TilePos[] = [];

  const push = (p: TilePos): void => {
    if (p.col < 0 || p.col >= map.width || p.row < 0 || p.row >= map.height) {
      return;
    }
    if (map.tiles[p.row][p.col].kind !== "floor") return;
    const key = `${p.col},${p.row}`;
    if (visited.has(key)) return;
    visited.add(key);
    queue.push(p);
  };

  push(from);
  while (queue.length > 0) {
    const cur = queue.shift() as TilePos;
    push({ col: cur.col + 1, row: cur.row });
    push({ col: cur.col - 1, row: cur.row });
    push({ col: cur.col, row: cur.row + 1 });
    push({ col: cur.col, row: cur.row - 1 });
  }

  return visited.size === totalFloors;
}
