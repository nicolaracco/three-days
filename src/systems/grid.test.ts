import { test, expect, describe } from "bun:test";
import {
  type GridConfig,
  type TilePos,
  isInMapArea,
  pixelToTile,
  tileToPixel,
  tilesInRange,
} from "./grid";

const cfg: GridConfig = {
  offset: { x: 4, y: 40 },
  tileSize: 32,
};

const bounds = { width: 11, height: 15 };

describe("tileToPixel / pixelToTile", () => {
  test("tileToPixel returns offset.x + col * tileSize, offset.y + row * tileSize", () => {
    expect(tileToPixel({ col: 0, row: 0 }, cfg)).toEqual({ x: 4, y: 40 });
    expect(tileToPixel({ col: 5, row: 7 }, cfg)).toEqual({
      x: 4 + 5 * 32,
      y: 40 + 7 * 32,
    });
  });

  test("pixelToTile returns the tile under the pixel", () => {
    expect(pixelToTile({ x: 4, y: 40 }, cfg)).toEqual({ col: 0, row: 0 });
    expect(
      pixelToTile({ x: 4 + 5 * 32 + 10, y: 40 + 7 * 32 + 10 }, cfg),
    ).toEqual({ col: 5, row: 7 });
  });

  test("round-trip: pixelToTile(tileToPixel(t)) returns t for any tile within bounds", () => {
    for (let col = 0; col < bounds.width; col++) {
      for (let row = 0; row < bounds.height; row++) {
        const t: TilePos = { col, row };
        expect(pixelToTile(tileToPixel(t, cfg), cfg)).toEqual(t);
      }
    }
  });
});

describe("isInMapArea", () => {
  test("returns true for pixels inside the map rectangle", () => {
    expect(isInMapArea({ x: 4, y: 40 }, bounds, cfg)).toBe(true);
    expect(isInMapArea({ x: 4 + 5 * 32, y: 40 + 5 * 32 }, bounds, cfg)).toBe(
      true,
    );
  });

  test("returns false for pixels outside the map rectangle", () => {
    expect(isInMapArea({ x: 0, y: 0 }, bounds, cfg)).toBe(false); // above map
    expect(isInMapArea({ x: 4 + 11 * 32 + 1, y: 100 }, bounds, cfg)).toBe(
      false,
    ); // right of map
    expect(isInMapArea({ x: 100, y: 40 + 15 * 32 + 1 }, bounds, cfg)).toBe(
      false,
    ); // below map
    expect(isInMapArea({ x: 3, y: 100 }, bounds, cfg)).toBe(false); // left of map
  });
});

describe("tilesInRange", () => {
  test("range = 0 returns the start tile only", () => {
    const result = tilesInRange({ col: 5, row: 7 }, 0, bounds);
    expect(result).toEqual([{ col: 5, row: 7 }]);
  });

  test("range = 1 returns the start tile plus the four cardinals", () => {
    const result = tilesInRange({ col: 5, row: 7 }, 1, bounds);
    const sorted = result
      .slice()
      .sort((a, b) => a.row - b.row || a.col - b.col);
    expect(sorted).toEqual([
      { col: 5, row: 6 },
      { col: 4, row: 7 },
      { col: 5, row: 7 },
      { col: 6, row: 7 },
      { col: 5, row: 8 },
    ]);
  });

  test("range = 4 returns a Manhattan diamond of 41 tiles for a center start (no clipping)", () => {
    // 1 + 4 + 8 + 12 + 16 = 41 tiles in a Manhattan diamond of radius 4
    const result = tilesInRange({ col: 5, row: 7 }, 4, bounds);
    expect(result).toHaveLength(41);
  });

  test("range clips to map bounds at edges", () => {
    const result = tilesInRange({ col: 0, row: 0 }, 2, bounds);
    // From corner with range 2, only tiles where col + row <= 2 inside the quadrant
    // Manhattan-2 diamond restricted to col >= 0 and row >= 0:
    // (0,0), (1,0), (2,0), (0,1), (1,1), (0,2) — 6 tiles
    expect(result).toHaveLength(6);
    const sorted = result
      .slice()
      .sort((a, b) => a.row - b.row || a.col - b.col);
    expect(sorted).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 0, row: 2 },
    ]);
  });
});
