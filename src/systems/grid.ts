/**
 * Grid coordinate utilities (ADR-0005).
 *
 * Tile space (col, row) for game logic; pixel space (x, y) for rendering.
 * All `* TILE_SIZE` math is centralized here. Callers pass a `GridConfig`
 * carrying the map's render offset and tile size, so this module is pure
 * and Phaser-free.
 */

export interface TilePos {
  col: number;
  row: number;
}

export interface PixelPos {
  x: number;
  y: number;
}

export interface GridConfig {
  /** Top-left of the map area in scene-space pixels. */
  offset: PixelPos;
  /** Edge length of one tile in pixels. */
  tileSize: number;
}

/** Top-left pixel of the given tile in scene-space coordinates. */
export function tileToPixel(tile: TilePos, cfg: GridConfig): PixelPos {
  return {
    x: cfg.offset.x + tile.col * cfg.tileSize,
    y: cfg.offset.y + tile.row * cfg.tileSize,
  };
}

/**
 * Tile under the given scene-space pixel.
 *
 * The result may be outside map bounds (negative col/row, or beyond
 * map width/height); callers should validate against bounds when that
 * matters.
 */
export function pixelToTile(pixel: PixelPos, cfg: GridConfig): TilePos {
  return {
    col: Math.floor((pixel.x - cfg.offset.x) / cfg.tileSize),
    row: Math.floor((pixel.y - cfg.offset.y) / cfg.tileSize),
  };
}

/** Is the pixel inside the map rectangle? */
export function isInMapArea(
  pixel: PixelPos,
  bounds: { width: number; height: number },
  cfg: GridConfig,
): boolean {
  const localX = pixel.x - cfg.offset.x;
  const localY = pixel.y - cfg.offset.y;
  return (
    localX >= 0 &&
    localX < bounds.width * cfg.tileSize &&
    localY >= 0 &&
    localY < bounds.height * cfg.tileSize
  );
}

/**
 * All tiles within Manhattan range of `from`, clipped to map bounds.
 *
 * Pure geometry: does not consider walls, occupants, or AP costs. For
 * gameplay-aware reachability use `movement.reachableTiles`.
 */
export function tilesInRange(
  from: TilePos,
  range: number,
  bounds: { width: number; height: number },
): TilePos[] {
  const result: TilePos[] = [];
  for (let dRow = -range; dRow <= range; dRow++) {
    const remaining = range - Math.abs(dRow);
    for (let dCol = -remaining; dCol <= remaining; dCol++) {
      const col = from.col + dCol;
      const row = from.row + dRow;
      if (col < 0 || col >= bounds.width || row < 0 || row >= bounds.height)
        continue;
      result.push({ col, row });
    }
  }
  return result;
}
