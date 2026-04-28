/**
 * Chunk format and loaders for procgen.
 *
 * Chunks are small hand-authored grids that the stitcher combines into a
 * `Day1Map`. The chunk-authoring vocabulary admits `door` tiles (which
 * mark connection slots); the stitcher turns those into `floor` in the
 * stitched output. Walls are walls; floors are walkable.
 *
 * Spec 0007 adds two metadata fields to each chunk:
 * - `connectors`: where on the chunk's edges other chunks can attach
 *   (used by the connector-based stitcher).
 * - `spawnSlots`: chunk-local positions where an enemy can spawn
 *   (replaces the spec-0006 runtime `placeEnemiesOnMap`).
 *
 * `kind` is `"entrance" | "interior"` — entrance chunks have a `start`
 * position (the protagonist spawns there); interior chunks don't.
 */

import alcoveSE from "../data/chunks/alcove-se.json";
import entranceA from "../data/chunks/entrance-room-a.json";
import entranceB from "../data/chunks/entrance-room-b.json";
import entranceC from "../data/chunks/entrance-room-c.json";
import hallwayH from "../data/chunks/hallway-h.json";
import interiorA from "../data/chunks/interior-room-a.json";
import interiorB from "../data/chunks/interior-room-b.json";
import interiorC from "../data/chunks/interior-room-c.json";
import type { TilePos } from "./grid";
import type { ItemKind } from "./item";
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

export type ChunkKind = "entrance" | "interior";

export type ConnectorSide = "n" | "s" | "e" | "w";

export interface Connector {
  side: ConnectorSide;
  /** Chunk-local column where the door tile lives. */
  col: number;
  /** Chunk-local row where the door tile lives. */
  row: number;
}

/**
 * Spec 0010: a chunk-local slot that materializes into one `Item` on
 * `Day1Map.itemsOnMap`. Authors place these on floor tiles inside the
 * chunk; procgen translates them to absolute coordinates.
 */
export interface ItemSlot {
  col: number;
  row: number;
  kind: ItemKind;
}

export interface Chunk {
  id: string;
  kind: ChunkKind;
  width: number;
  height: number;
  /** Spawn position inside the chunk (entrance only). `null` for interior chunks. */
  start: TilePos | null;
  /** Chunk-local positions where enemies can spawn. */
  spawnSlots: TilePos[];
  /** Chunk-local item placements (spec 0010). Empty array allowed. */
  itemSlots: ItemSlot[];
  /** Edges where this chunk can connect to other chunks. */
  connectors: Connector[];
  /** Indexed [row][col] to match human-readable JSON authoring order. */
  tiles: ChunkTile[][];
}

const RAW_CHUNKS = [
  entranceA,
  entranceB,
  entranceC,
  interiorA,
  interiorB,
  interiorC,
  hallwayH,
  alcoveSE,
];

let cached: Chunk[] | null = null;

/** Lift the hand-authored chunk JSONs into typed `Chunk` instances. */
export function loadChunks(): Chunk[] {
  if (cached !== null) return cached;
  cached = RAW_CHUNKS.map((raw) => liftChunk(raw));
  return cached;
}

/** Convenience filter — `loadChunks().filter(c => c.kind === kind)`. */
export function getChunksOfKind(kind: ChunkKind): Chunk[] {
  return loadChunks().filter((c) => c.kind === kind);
}

/** Returns the side that an opposite connector must have to connect. */
export function oppositeSide(s: ConnectorSide): ConnectorSide {
  switch (s) {
    case "n":
      return "s";
    case "s":
      return "n";
    case "e":
      return "w";
    case "w":
      return "e";
  }
}

interface RawConnector {
  side: string;
  col: number;
  row: number;
}

interface RawItemSlot {
  col: number;
  row: number;
  kind: string;
}

interface RawChunk {
  id: string;
  kind: string;
  width: number;
  height: number;
  start: TilePos | null;
  spawnSlots: TilePos[];
  itemSlots?: RawItemSlot[];
  connectors: RawConnector[];
  tiles: string[][];
}

function liftChunk(raw: RawChunk): Chunk {
  if (raw.kind !== "entrance" && raw.kind !== "interior") {
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
  for (const c of raw.connectors) {
    if (c.side !== "n" && c.side !== "s" && c.side !== "e" && c.side !== "w") {
      throw new Error(
        `Chunk ${raw.id}: connector has invalid side '${c.side}'`,
      );
    }
  }
  const itemSlots: ItemSlot[] = (raw.itemSlots ?? []).map((s) => {
    if (s.kind !== "medkit" && s.kind !== "flashbang") {
      throw new Error(
        `Chunk ${raw.id}: itemSlot at (${s.col}, ${s.row}) has invalid kind '${s.kind}'`,
      );
    }
    return { col: s.col, row: s.row, kind: s.kind };
  });
  return {
    id: raw.id,
    kind: raw.kind,
    width: raw.width,
    height: raw.height,
    start: raw.start,
    spawnSlots: raw.spawnSlots,
    itemSlots,
    connectors: raw.connectors as Connector[],
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
