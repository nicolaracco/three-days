import { test, expect, describe } from "bun:test";
import { loadChunks } from "./chunk";
import type { Day1Map, Tile } from "./map";
import { generateMap, isFullyConnected, stitch } from "./procgen";
import { createRng } from "./rng";

const library = loadChunks();

describe("stitch", () => {
  test("targetCount=1 returns a single entrance chunk at origin", () => {
    const result = stitch(createRng(1), library, 1);
    expect(result).not.toBeNull();
    if (result === null) throw new Error("unreachable");
    expect(result.placed).toHaveLength(1);
    expect(result.placed[0].chunk.kind).toBe("entrance");
    expect(result.placed[0].offset).toEqual({ col: 0, row: 0 });
  });

  test("targetCount=2 places a second chunk via a matching connector", () => {
    const result = stitch(createRng(1), library, 2);
    expect(result).not.toBeNull();
    if (result === null) throw new Error("unreachable");
    expect(result.placed).toHaveLength(2);
    // Second chunk must be interior.
    expect(result.placed[1].chunk.kind).toBe("interior");
  });

  test("targetCount=3 places three connected chunks without overlap", () => {
    let attempts = 0;
    let found = false;
    for (let s = 1; s <= 50 && !found; s++) {
      const result = stitch(createRng(s), library, 3);
      attempts++;
      if (result === null) continue;
      expect(result.placed).toHaveLength(3);
      // No overlap.
      for (let i = 0; i < result.placed.length; i++) {
        for (let j = i + 1; j < result.placed.length; j++) {
          const a = result.placed[i];
          const b = result.placed[j];
          const overlapX =
            a.offset.col < b.offset.col + b.chunk.width &&
            a.offset.col + a.chunk.width > b.offset.col;
          const overlapY =
            a.offset.row < b.offset.row + b.chunk.height &&
            a.offset.row + a.chunk.height > b.offset.row;
          expect(overlapX && overlapY).toBe(false);
        }
      }
      found = true;
    }
    expect(found).toBe(true);
    expect(attempts).toBeGreaterThan(0);
  });

  test("returns null when library has no entrance chunks", () => {
    const interiors = library.filter((c) => c.kind === "interior");
    const result = stitch(createRng(1), interiors, 1);
    expect(result).toBeNull();
  });

  test("returns null when targetCount < 1", () => {
    const result = stitch(createRng(1), library, 0);
    expect(result).toBeNull();
  });
});

describe("generateMap", () => {
  test("returns a Day1Map for every seed in 1..50", () => {
    for (let s = 1; s <= 50; s++) {
      const map = generateMap(createRng(s));
      expect(map.width).toBeGreaterThan(0);
      expect(map.height).toBeGreaterThan(0);
      expect(map.tiles).toHaveLength(map.height);
    }
  });

  test("is deterministic for the same seed", () => {
    const a = generateMap(createRng(42));
    const b = generateMap(createRng(42));
    expect(a).toEqual(b);
  });

  test("different seeds can produce different maps", () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 50; s++) {
      seen.add(JSON.stringify(generateMap(createRng(s))));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test("no door tiles appear in the stitched output (doors → floor or exit)", () => {
    const map = generateMap(createRng(1));
    const allowed = new Set(["floor", "wall", "exit"]);
    for (const row of map.tiles) {
      for (const tile of row) {
        expect(allowed.has(tile.kind)).toBe(true);
      }
    }
  });

  test("the start tile is always a floor tile", () => {
    for (let s = 1; s <= 20; s++) {
      const map = generateMap(createRng(s));
      expect(map.tiles[map.start.row][map.start.col].kind).toBe("floor");
    }
  });

  test("every map has at least 1 spawn slot on a floor tile", () => {
    for (let s = 1; s <= 20; s++) {
      const map = generateMap(createRng(s));
      expect(map.spawnSlots.length).toBeGreaterThanOrEqual(1);
      for (const slot of map.spawnSlots) {
        expect(map.tiles[slot.row][slot.col].kind).toBe("floor");
      }
    }
  });

  test("every map is fully connected from the start", () => {
    for (let s = 1; s <= 50; s++) {
      const map = generateMap(createRng(s));
      expect(isFullyConnected(map, map.start)).toBe(true);
    }
  });

  test("every map produces variable dimensions across seeds", () => {
    const dims = new Set<string>();
    for (let s = 1; s <= 50; s++) {
      const map = generateMap(createRng(s));
      dims.add(`${map.width}x${map.height}`);
    }
    expect(dims.size).toBeGreaterThan(1);
  });
});

describe("isFullyConnected", () => {
  test("returns true for a hand-crafted single-floor map", () => {
    const map: Day1Map = {
      width: 1,
      height: 1,
      start: { col: 0, row: 0 },
      tiles: [[{ kind: "floor" }]],
      spawnSlots: [],
      itemsOnMap: [],
    };
    expect(isFullyConnected(map, map.start)).toBe(true);
  });

  test("returns false for a hand-crafted disconnected map", () => {
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
      spawnSlots: [],
      itemsOnMap: [],
    };
    expect(isFullyConnected(map, map.start)).toBe(false);
  });

  test("returns true for a fully-connected hand-crafted map", () => {
    const tiles: Tile[][] = [
      [{ kind: "floor" }, { kind: "floor" }],
      [{ kind: "floor" }, { kind: "floor" }],
    ];
    const map: Day1Map = {
      width: 2,
      height: 2,
      start: { col: 0, row: 0 },
      tiles,
      spawnSlots: [],
      itemsOnMap: [],
    };
    expect(isFullyConnected(map, map.start)).toBe(true);
  });
});

describe("generateMap exits (spec 0009)", () => {
  test("every map has exactly 2 ExitTile cells", () => {
    for (let s = 1; s <= 50; s++) {
      const map = generateMap(createRng(s));
      let count = 0;
      for (const row of map.tiles) {
        for (const tile of row) if (tile.kind === "exit") count++;
      }
      expect(count).toBe(2);
    }
  });

  test("the two exits have distinct types (one stairwell, one fire-escape)", () => {
    for (let s = 1; s <= 50; s++) {
      const map = generateMap(createRng(s));
      const types: string[] = [];
      for (const row of map.tiles) {
        for (const tile of row) {
          if (tile.kind === "exit") types.push(tile.exitType);
        }
      }
      expect(types.length).toBe(2);
      expect(new Set(types)).toEqual(new Set(["stairwell", "fire-escape"]));
    }
  });

  test("fire-escape is gated by athletic; stairwell is ungated", () => {
    for (let s = 1; s <= 30; s++) {
      const map = generateMap(createRng(s));
      for (const row of map.tiles) {
        for (const tile of row) {
          if (tile.kind !== "exit") continue;
          if (tile.exitType === "fire-escape") {
            expect(tile.traitGate).toBe("athletic");
          } else {
            expect(tile.traitGate).toBeNull();
          }
        }
      }
    }
  });

  test("both exits are reachable from start", () => {
    for (let s = 1; s <= 50; s++) {
      const map = generateMap(createRng(s));
      // isFullyConnected (spec 0009) walks floor + exit tiles together;
      // if it returns true, every exit cell is reachable from start.
      expect(isFullyConnected(map, map.start)).toBe(true);
    }
  });

  test("same seed produces the same exit positions and types", () => {
    const a = generateMap(createRng(1234));
    const b = generateMap(createRng(1234));
    const exitsOf = (
      m: typeof a,
    ): Array<{
      col: number;
      row: number;
      type: string;
    }> => {
      const result: Array<{ col: number; row: number; type: string }> = [];
      for (let r = 0; r < m.height; r++) {
        for (let c = 0; c < m.width; c++) {
          const t = m.tiles[r][c];
          if (t.kind === "exit") {
            result.push({ col: c, row: r, type: t.exitType });
          }
        }
      }
      return result;
    };
    expect(exitsOf(a)).toEqual(exitsOf(b));
  });

  test("different seeds vary the type-to-position assignment", () => {
    // We can't guarantee positions differ across two arbitrary seeds, but
    // across 30 seeds the (position, type) pairs should not collapse to a
    // single value — that would mean RNG isn't shuffling the pairing.
    const seen = new Set<string>();
    for (let s = 1; s <= 30; s++) {
      const m = generateMap(createRng(s));
      for (let r = 0; r < m.height; r++) {
        for (let c = 0; c < m.width; c++) {
          const t = m.tiles[r][c];
          if (t.kind === "exit") {
            seen.add(`${c},${r},${t.exitType}`);
          }
        }
      }
    }
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe("generateMap items (spec 0010)", () => {
  test("itemsOnMap is populated with at least one item across realistic seeds", () => {
    // Author has placed item slots in 4 of 5 interior chunks; entrance
    // chunks have none. Worst-case 3-chunk maps include >= 1 interior,
    // so every map should carry at least one item.
    let totalAcrossSeeds = 0;
    for (let s = 1; s <= 30; s++) {
      const map = generateMap(createRng(s));
      expect(map.itemsOnMap.length).toBeGreaterThanOrEqual(1);
      totalAcrossSeeds += map.itemsOnMap.length;
    }
    // Sanity: across 30 maps we shouldn't be ~30 (the floor) — chunks
    // with item slots get used often enough to exceed the floor by a
    // healthy margin.
    expect(totalAcrossSeeds).toBeGreaterThan(30);
  });

  test("every item lands on a floor tile (not wall, not exit, in-bounds)", () => {
    for (let s = 1; s <= 30; s++) {
      const map = generateMap(createRng(s));
      for (const item of map.itemsOnMap) {
        expect(item.position.col).toBeGreaterThanOrEqual(0);
        expect(item.position.col).toBeLessThan(map.width);
        expect(item.position.row).toBeGreaterThanOrEqual(0);
        expect(item.position.row).toBeLessThan(map.height);
        expect(map.tiles[item.position.row][item.position.col].kind).toBe(
          "floor",
        );
      }
    }
  });

  test("same seed produces the same itemsOnMap (positions and kinds)", () => {
    const a = generateMap(createRng(2024));
    const b = generateMap(createRng(2024));
    expect(a.itemsOnMap).toEqual(b.itemsOnMap);
  });

  test("authored item kinds appear across seeds (both medkit and flashbang surface)", () => {
    const kinds = new Set<string>();
    for (let s = 1; s <= 30; s++) {
      const map = generateMap(createRng(s));
      for (const item of map.itemsOnMap) kinds.add(item.kind);
    }
    expect(kinds).toEqual(new Set(["medkit", "flashbang"]));
  });
});
