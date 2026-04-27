import { test, expect, describe } from "bun:test";
import { getChunksOfKind } from "./chunk";
import type { Day1Map, Tile } from "./map";
import { generateMap, isFullyConnected } from "./procgen";
import { createRng } from "./rng";

describe("generateMap", () => {
  test("returns a 5×10 Day1Map", () => {
    const map = generateMap(createRng(1));
    expect(map.width).toBe(5);
    expect(map.height).toBe(10);
    expect(map.tiles).toHaveLength(10);
    for (const row of map.tiles) {
      expect(row).toHaveLength(5);
    }
  });

  test("is deterministic for the same seed", () => {
    const a = generateMap(createRng(42));
    const b = generateMap(createRng(42));
    expect(a).toEqual(b);
  });

  test("different seeds can produce different maps over a sample", () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 50; s++) {
      seen.add(JSON.stringify(generateMap(createRng(s))));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test("no door tiles appear in the stitched output (doors → floor)", () => {
    const map = generateMap(createRng(1));
    for (const row of map.tiles) {
      for (const tile of row) {
        // Day1Map.Tile is "floor" | "wall" only — but we double-check at runtime
        // that the procgen step lifted door → floor.
        expect((tile as Tile).kind === "floor" || tile.kind === "wall").toBe(
          true,
        );
        expect(tile.kind).not.toBe("door");
      }
    }
  });

  test("start matches the chosen entrance chunk's start (top-of-stitched)", () => {
    const map = generateMap(createRng(1));
    // The entrance chunk is stitched at the top with no offset, so its
    // local start equals the map start.
    const entrances = getChunksOfKind("entrance");
    const matchingEntrance = entrances.find(
      (e) =>
        e.start !== null &&
        e.start.col === map.start.col &&
        e.start.row === map.start.row,
    );
    expect(matchingEntrance).toBeDefined();
  });

  test("the start tile is a floor tile in the generated map", () => {
    for (let s = 1; s <= 10; s++) {
      const map = generateMap(createRng(s));
      const startTile = map.tiles[map.start.row][map.start.col];
      expect(startTile.kind).toBe("floor");
    }
  });
});

describe("isFullyConnected", () => {
  test("returns true for every generated map", () => {
    for (let s = 1; s <= 50; s++) {
      const map = generateMap(createRng(s));
      expect(isFullyConnected(map, map.start)).toBe(true);
    }
  });

  test("returns false for a hand-crafted disconnected map", () => {
    // 3×3 with two floor tiles separated by a wall row.
    const tiles: Tile[][] = [
      [{ kind: "floor" }, { kind: "wall" }, { kind: "floor" }],
      [{ kind: "wall" }, { kind: "wall" }, { kind: "wall" }],
      [{ kind: "floor" }, { kind: "wall" }, { kind: "floor" }],
    ];
    const map: Day1Map = {
      width: 3,
      height: 3,
      start: { col: 0, row: 0 },
      tiles,
    };
    expect(isFullyConnected(map, map.start)).toBe(false);
  });

  test("returns true for a hand-crafted single-floor map", () => {
    const map: Day1Map = {
      width: 1,
      height: 1,
      start: { col: 0, row: 0 },
      tiles: [[{ kind: "floor" }]],
    };
    expect(isFullyConnected(map, map.start)).toBe(true);
  });
});
