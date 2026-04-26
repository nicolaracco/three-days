import { test, expect, describe } from "bun:test";
import { type Tile, loadDay1Map } from "./map";

describe("loadDay1Map", () => {
  const map = loadDay1Map();

  test("matches the declared 11x15 shape", () => {
    expect(map.width).toBe(11);
    expect(map.height).toBe(15);
    expect(map.tiles).toHaveLength(15);
    for (const row of map.tiles) {
      expect(row).toHaveLength(11);
    }
  });

  test("start position is within bounds", () => {
    expect(map.start.col).toBeGreaterThanOrEqual(0);
    expect(map.start.col).toBeLessThan(map.width);
    expect(map.start.row).toBeGreaterThanOrEqual(0);
    expect(map.start.row).toBeLessThan(map.height);
  });

  test("every tile is a FloorTile in this spec (no walls yet)", () => {
    for (const row of map.tiles) {
      for (const tile of row) {
        expect(tile.kind).toBe("floor");
      }
    }
  });

  test("Tile tagged union admits FloorTile and WallTile", () => {
    const floor: Tile = { kind: "floor" };
    const wall: Tile = { kind: "wall" };
    expect(floor.kind).toBe("floor");
    expect(wall.kind).toBe("wall");
  });
});
