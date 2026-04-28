/**
 * Procgen — connector-based multi-chunk stitcher (spec 0007).
 *
 * Picks an entrance chunk + 2-3 interior chunks via seeded RNG. Stitches
 * them by matching connectors (compatible opposite sides) and computing
 * placement offsets so door tiles end up adjacent. Uses bounding-box
 * collision detection to prevent overlap. Translates final coordinates
 * so the resulting map's origin is `(0, 0)`. Validates connectivity and
 * the presence of unconnected connectors (exit candidates) + at least
 * one spawn slot. Retries up to 10 times on failure.
 *
 * Pure function: `generateMap(rng)` returns a fresh `Day1Map`. The retry
 * loop consumes RNG calls deterministically — same seed → same output.
 */

import {
  type Chunk,
  type ChunkTile,
  type Connector,
  type ConnectorSide,
  loadChunks,
  oppositeSide,
} from "./chunk";
import type { TilePos } from "./grid";
import type { Day1Map, Tile } from "./map";
import type { Rng } from "./rng";

const RETRY_CAP = 10;

interface PlacedChunk {
  chunk: Chunk;
  /** Absolute offset where the chunk's (0, 0) lives in the stitched grid. */
  offset: TilePos;
}

interface OpenConnector {
  placedIdx: number;
  connector: Connector;
  /** Absolute position of the door tile in the (yet-unnormalized) grid. */
  absPos: TilePos;
}

export interface StitchResult {
  placed: PlacedChunk[];
  /** Connectors that remain unconnected — candidate exits in spec 0008. */
  openConnectors: OpenConnector[];
}

/**
 * Stitch `targetCount` chunks together. Returns `null` on failure (caller
 * may retry with a different RNG state).
 */
export function stitch(
  rng: Rng,
  library: Chunk[],
  targetCount: number,
): StitchResult | null {
  const entrances = library.filter((c) => c.kind === "entrance");
  const interiors = library.filter((c) => c.kind === "interior");
  if (entrances.length === 0) return null;
  if (targetCount < 1) return null;

  // Place entrance at origin.
  const entrance = rng.pickOne(entrances);
  const placed: PlacedChunk[] = [
    { chunk: entrance, offset: { col: 0, row: 0 } },
  ];
  let open: OpenConnector[] = entrance.connectors.map((c) => ({
    placedIdx: 0,
    connector: c,
    absPos: { col: c.col, row: c.row },
  }));

  for (let i = 1; i < targetCount; i++) {
    if (open.length === 0) return null;
    // Try open connectors in random order; first one that fits wins.
    const shuffledOpen = shuffle(open, rng);
    let added = false;
    for (const oc of shuffledOpen) {
      const candidate = pickFittingChunk(oc, interiors, placed, rng);
      if (candidate === null) continue;
      // Place it.
      placed.push({ chunk: candidate.chunk, offset: candidate.offset });
      // Remove the consumed open connector.
      open = open.filter((x) => x !== oc);
      // Remove the candidate's matched connector from its open set.
      const matchedSide = oppositeSide(oc.connector.side);
      const newPlacedIdx = placed.length - 1;
      for (const conn of candidate.chunk.connectors) {
        // Skip the one we just used: same side AND same chunk-local pos as the matched connector.
        if (
          conn.side === matchedSide &&
          conn.col === candidate.matchedConnector.col &&
          conn.row === candidate.matchedConnector.row
        ) {
          continue;
        }
        open.push({
          placedIdx: newPlacedIdx,
          connector: conn,
          absPos: {
            col: candidate.offset.col + conn.col,
            row: candidate.offset.row + conn.row,
          },
        });
      }
      added = true;
      break;
    }
    if (!added) return null;
  }

  return { placed, openConnectors: open };
}

interface FittingChunk {
  chunk: Chunk;
  offset: TilePos;
  matchedConnector: Connector;
}

/** Find an interior chunk + connector that fits the given open connector. */
function pickFittingChunk(
  oc: OpenConnector,
  interiors: Chunk[],
  placed: PlacedChunk[],
  rng: Rng,
): FittingChunk | null {
  const wantedSide = oppositeSide(oc.connector.side);
  const candidates = shuffle(interiors, rng);
  for (const candidate of candidates) {
    const matchingConns = candidate.connectors.filter(
      (c) => c.side === wantedSide,
    );
    const shuffledConns = shuffle(matchingConns, rng);
    for (const cConn of shuffledConns) {
      const offset = computePlacement(oc.absPos, oc.connector.side, cConn);
      if (collides(candidate, offset, placed)) continue;
      return { chunk: candidate, offset, matchedConnector: cConn };
    }
  }
  return null;
}

/** Compute the offset at which `candidate` should be placed so its
 *  connector aligns with the open connector's door + 1 in the open
 *  connector's direction. See spec for derivation per side. */
function computePlacement(
  openAbs: TilePos,
  openSide: ConnectorSide,
  cConn: Connector,
): TilePos {
  switch (openSide) {
    case "s":
      // candidate's door (n side, row 0) sits one row south of openAbs.
      return {
        col: openAbs.col - cConn.col,
        row: openAbs.row + 1 - cConn.row,
      };
    case "n":
      // candidate's door (s side, row = height-1) sits one row north.
      return {
        col: openAbs.col - cConn.col,
        row: openAbs.row - 1 - cConn.row,
      };
    case "e":
      // candidate's door (w side, col 0) sits one col east.
      return {
        col: openAbs.col + 1 - cConn.col,
        row: openAbs.row - cConn.row,
      };
    case "w":
      // candidate's door (e side, col = width-1) sits one col west.
      return {
        col: openAbs.col - 1 - cConn.col,
        row: openAbs.row - cConn.row,
      };
  }
}

/** Bounding-box collision against all already-placed chunks. */
function collides(
  candidate: Chunk,
  offset: TilePos,
  placed: PlacedChunk[],
): boolean {
  const cMinX = offset.col;
  const cMaxX = offset.col + candidate.width; // exclusive
  const cMinY = offset.row;
  const cMaxY = offset.row + candidate.height; // exclusive
  for (const p of placed) {
    const pMinX = p.offset.col;
    const pMaxX = p.offset.col + p.chunk.width;
    const pMinY = p.offset.row;
    const pMaxY = p.offset.row + p.chunk.height;
    const overlapX = cMinX < pMaxX && cMaxX > pMinX;
    const overlapY = cMinY < pMaxY && cMaxY > pMinY;
    if (overlapX && overlapY) return true;
  }
  return false;
}

function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng.intInRange(0, i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Build a `Day1Map` by stitching 3-4 chunks. Retries up to `RETRY_CAP`
 * times if a particular pick fails connectivity / exit / spawn-slot
 * validation. Throws after exhausting retries.
 */
export function generateMap(rng: Rng): Day1Map {
  const library = loadChunks();
  for (let attempt = 0; attempt < RETRY_CAP; attempt++) {
    const targetCount = rng.intInRange(3, 5); // 3 or 4
    const result = stitch(rng, library, targetCount);
    if (result === null) continue;
    const map = materialize(result);
    if (map === null) continue;
    if (!isFullyConnected(map, map.start)) continue;
    if (result.openConnectors.length < 2) continue;
    if (map.spawnSlots.length === 0) continue;
    return map;
  }
  throw new Error(`generateMap: gave up after ${RETRY_CAP} retries`);
}

/**
 * Convert a `StitchResult` into a `Day1Map`: normalize coordinates so
 * the top-left is `(0, 0)`, allocate a tile grid sized to the bounding
 * box, blit each chunk's tiles into the grid, lift door tiles to floor,
 * compute spawn slots in absolute coordinates, return.
 */
function materialize(result: StitchResult): Day1Map | null {
  if (result.placed.length === 0) return null;

  // Compute bounding box.
  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = -Infinity;
  let maxRow = -Infinity;
  for (const p of result.placed) {
    minCol = Math.min(minCol, p.offset.col);
    minRow = Math.min(minRow, p.offset.row);
    maxCol = Math.max(maxCol, p.offset.col + p.chunk.width);
    maxRow = Math.max(maxRow, p.offset.row + p.chunk.height);
  }
  const width = maxCol - minCol;
  const height = maxRow - minRow;

  // Allocate empty (wall) grid.
  const tiles: Tile[][] = [];
  for (let r = 0; r < height; r++) {
    const row: Tile[] = [];
    for (let c = 0; c < width; c++) row.push({ kind: "wall" });
    tiles.push(row);
  }

  // Blit each chunk.
  for (const p of result.placed) {
    const baseCol = p.offset.col - minCol;
    const baseRow = p.offset.row - minRow;
    for (let r = 0; r < p.chunk.height; r++) {
      for (let c = 0; c < p.chunk.width; c++) {
        tiles[baseRow + r][baseCol + c] = liftToMapTile(p.chunk.tiles[r][c]);
      }
    }
  }

  // Translate the entrance chunk's start to absolute coordinates.
  const entrance = result.placed[0]; // entrance is always placed first
  if (entrance.chunk.start === null) return null;
  const start: TilePos = {
    col: entrance.offset.col - minCol + entrance.chunk.start.col,
    row: entrance.offset.row - minRow + entrance.chunk.start.row,
  };

  // Translate every chunk's spawn slots to absolute coordinates.
  const spawnSlots: TilePos[] = [];
  for (const p of result.placed) {
    for (const s of p.chunk.spawnSlots) {
      spawnSlots.push({
        col: p.offset.col - minCol + s.col,
        row: p.offset.row - minRow + s.row,
      });
    }
  }

  return { width, height, start, tiles, spawnSlots };
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
