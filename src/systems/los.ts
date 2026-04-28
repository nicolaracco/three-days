/**
 * Line of sight (spec 0012).
 *
 * Pure tile-grid LoS. Walls block; floor and exit are transparent. The
 * algorithm is Bresenham's line, walking every tile between `from` and
 * `to` (exclusive of endpoints). Endpoints aren't checked — a ranged
 * alien on a floor tile shooting a target on a floor tile shouldn't
 * reject "yourself" or "the target you're aiming at" as obstructions.
 *
 * Phaser-free; consumed by `combat.ts` for the LoS-gated attack check
 * and by `turn.ts` for the ranged-enemy AI's "do I have a shot?" /
 * "where should I move to get a shot?" decisions.
 */

import type { TilePos } from "./grid";
import type { Day1Map } from "./map";

/**
 * Trace the Bresenham line from `from` to `to` over the grid. Returns
 * the full sequence of tiles, inclusive of both endpoints. Same-tile
 * input collapses to a single-element array.
 */
export function tilesAlongLine(from: TilePos, to: TilePos): TilePos[] {
  const result: TilePos[] = [];
  let x0 = from.col;
  let y0 = from.row;
  const x1 = to.col;
  const y1 = to.row;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  // Cap iterations defensively — Bresenham terminates in `max(dx, dy) + 1`
  // steps, but the cap protects against pathological non-integer inputs.
  const maxSteps = dx + dy + 2;
  for (let step = 0; step <= maxSteps; step++) {
    result.push({ col: x0, row: y0 });
    if (x0 === x1 && y0 === y1) return result;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return result;
}

/**
 * `true` iff every tile *between* `from` and `to` (exclusive of both
 * endpoints) is non-wall. Floor and exit tiles are transparent; only
 * `kind === "wall"` blocks the line.
 *
 * `from === to` returns `true` (degenerate self-LoS — useful as a
 * sanity case for callers that don't pre-filter).
 */
export function hasLoS(from: TilePos, to: TilePos, map: Day1Map): boolean {
  const line = tilesAlongLine(from, to);
  if (line.length <= 2) return true; // adjacent or same-tile — no in-between
  for (let i = 1; i < line.length - 1; i++) {
    const t = line[i];
    if (t.col < 0 || t.col >= map.width || t.row < 0 || t.row >= map.height) {
      return false; // off-map tiles count as blocking
    }
    if (map.tiles[t.row][t.col].kind === "wall") return false;
  }
  return true;
}
