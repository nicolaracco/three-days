/**
 * Chunk format and loaders for procgen.
 *
 * Chunks are small hand-authored grids that the stitcher combines into a
 * `Day1Map`. The chunk-authoring vocabulary admits `door` tiles (which
 * mark connection slots); the stitcher turns those into `floor` in the
 * stitched output. Walls are walls; floors are walkable.
 *
 * Spec 0005 ships four 5×5 chunks (2 entrance variants, 2 back variants).
 * Spec 0006 grows this to the GDD §8.2 catalog and supports variable
 * chunk dimensions.
 */

import entranceA from "../data/chunks/entrance-room-a.json";
import entranceB from "../data/chunks/entrance-room-b.json";
import backA from "../data/chunks/back-room-a.json";
import backB from "../data/chunks/back-room-b.json";
import type { TilePos } from "./grid";
import type { FloorTile, WallTile } from "./map";

export interface DoorTile {
  kind: "door";
}

/**
 * Tile kinds valid in chunk authoring. The stitched `Day1Map` uses the
 * narrower `Tile` (floor | wall) — door tiles are converted to floor by
 * `procgen.generateMap`.
 */
export type ChunkTile = FloorTile | WallTile | DoorTile;

export type ChunkKind = "entrance" | "back";

export interface Chunk {
  id: string;
  kind: ChunkKind;
  width: number;
  height: number;
  /** Spawn position inside the chunk (entrance only). `null` for back chunks. */
  start: TilePos | null;
  /** Indexed [row][col] to match human-readable JSON authoring order. */
  tiles: ChunkTile[][];
}

const RAW_CHUNKS = [entranceA, entranceB, backA, backB];

let cached: Chunk[] | null = null;

/** Lift the four hand-authored chunk JSONs into typed `Chunk` instances. */
export function loadChunks(): Chunk[] {
  if (cached !== null) return cached;
  cached = RAW_CHUNKS.map((raw) => liftChunk(raw));
  return cached;
}

/** Convenience filter — `loadChunks().filter(c => c.kind === kind)`. */
export function getChunksOfKind(kind: ChunkKind): Chunk[] {
  return loadChunks().filter((c) => c.kind === kind);
}

interface RawChunk {
  id: string;
  kind: string;
  width: number;
  height: number;
  start: TilePos | null;
  tiles: string[][];
}

function liftChunk(raw: RawChunk): Chunk {
  if (raw.kind !== "entrance" && raw.kind !== "back") {
    throw new Error(`Unknown chunk kind in ${raw.id}: ${raw.kind}`);
  }
  if (raw.tiles.length !== raw.height) {
    throw new Error(
      `Chunk ${raw.id}: tiles has ${raw.tiles.length} rows but height is ${raw.height}`,
    );
  }
  for (let r = 0; r < raw.tiles.length; r++) {
    if (raw.tiles[r].length !== raw.width) {
      throw new Error(
        `Chunk ${raw.id}: row ${r} has ${raw.tiles[r].length} cols but width is ${raw.width}`,
      );
    }
  }
  return {
    id: raw.id,
    kind: raw.kind,
    width: raw.width,
    height: raw.height,
    start: raw.start,
    tiles: raw.tiles.map((row) => row.map((s) => liftTile(s, raw.id))),
  };
}

function liftTile(s: string, chunkId: string): ChunkTile {
  switch (s) {
    case "floor":
      return { kind: "floor" };
    case "wall":
      return { kind: "wall" };
    case "door":
      return { kind: "door" };
    default:
      throw new Error(`Unknown tile kind '${s}' in chunk ${chunkId}`);
  }
}
