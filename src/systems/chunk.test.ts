import { test, expect, describe } from "bun:test";
import {
  type Chunk,
  type ChunkTile,
  getChunksOfKind,
  loadChunks,
} from "./chunk";

describe("loadChunks", () => {
  const chunks = loadChunks();

  test("returns 4 chunks", () => {
    expect(chunks).toHaveLength(4);
  });

  test("each chunk has matching width/height and tiles dimensions", () => {
    for (const c of chunks) {
      expect(c.tiles).toHaveLength(c.height);
      for (const row of c.tiles) {
        expect(row).toHaveLength(c.width);
      }
    }
  });

  test("each chunk's tile kinds are wall/floor/door only", () => {
    for (const c of chunks) {
      for (const row of c.tiles) {
        for (const tile of row) {
          expect(["wall", "floor", "door"]).toContain(tile.kind);
        }
      }
    }
  });

  test("entrance chunks have a non-null start; back chunks do not", () => {
    for (const c of chunks) {
      if (c.kind === "entrance") {
        expect(c.start).not.toBeNull();
      } else {
        expect(c.start).toBeNull();
      }
    }
  });

  test("entrance chunks have at least one south-edge door (row = height - 1)", () => {
    const entrances = chunks.filter((c) => c.kind === "entrance");
    for (const c of entrances) {
      const lastRow = c.tiles[c.height - 1];
      const doorCount = lastRow.filter((t) => t.kind === "door").length;
      expect(doorCount).toBeGreaterThanOrEqual(1);
    }
  });

  test("back chunks have at least one north-edge door (row = 0)", () => {
    const backs = chunks.filter((c) => c.kind === "back");
    for (const c of backs) {
      const firstRow = c.tiles[0];
      const doorCount = firstRow.filter((t) => t.kind === "door").length;
      expect(doorCount).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("getChunksOfKind", () => {
  test("returns 2 entrance chunks and 2 back chunks", () => {
    expect(getChunksOfKind("entrance")).toHaveLength(2);
    expect(getChunksOfKind("back")).toHaveLength(2);
  });
});

describe("ChunkTile union", () => {
  test("admits floor, wall, and door variants", () => {
    const f: ChunkTile = { kind: "floor" };
    const w: ChunkTile = { kind: "wall" };
    const d: ChunkTile = { kind: "door" };
    expect(f.kind).toBe("floor");
    expect(w.kind).toBe("wall");
    expect(d.kind).toBe("door");
  });
});

describe("Chunk type", () => {
  test("admits a typed entrance literal", () => {
    const c: Chunk = {
      id: "test",
      kind: "entrance",
      width: 1,
      height: 1,
      start: { col: 0, row: 0 },
      tiles: [[{ kind: "floor" }]],
    };
    expect(c.id).toBe("test");
  });
});
