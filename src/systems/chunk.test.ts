import { test, expect, describe } from "bun:test";
import {
  type Chunk,
  type ChunkTile,
  type Connector,
  getChunksOfKind,
  loadChunks,
  oppositeSide,
} from "./chunk";

describe("loadChunks", () => {
  const chunks = loadChunks();

  test("returns 8 chunks (3 entrance + 5 interior)", () => {
    expect(chunks).toHaveLength(8);
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

  test("entrance chunks have a non-null start; interior chunks do not", () => {
    for (const c of chunks) {
      if (c.kind === "entrance") {
        expect(c.start).not.toBeNull();
      } else {
        expect(c.start).toBeNull();
      }
    }
  });

  test("every chunk has at least one connector", () => {
    for (const c of chunks) {
      expect(c.connectors.length).toBeGreaterThan(0);
    }
  });

  test("each connector position holds a door tile in the chunk grid", () => {
    for (const c of chunks) {
      for (const conn of c.connectors) {
        const tile = c.tiles[conn.row][conn.col];
        expect(tile.kind).toBe("door");
      }
    }
  });

  test("interior chunks have at least one spawn slot; entrance chunks have none", () => {
    for (const c of chunks) {
      if (c.kind === "entrance") {
        expect(c.spawnSlots).toHaveLength(0);
      } else {
        expect(c.spawnSlots.length).toBeGreaterThan(0);
      }
    }
  });

  test("each spawn slot is on a floor tile", () => {
    for (const c of chunks) {
      for (const slot of c.spawnSlots) {
        const tile = c.tiles[slot.row][slot.col];
        expect(tile.kind).toBe("floor");
      }
    }
  });
});

describe("getChunksOfKind", () => {
  test("returns 3 entrance chunks and 5 interior chunks", () => {
    expect(getChunksOfKind("entrance")).toHaveLength(3);
    expect(getChunksOfKind("interior")).toHaveLength(5);
  });
});

describe("oppositeSide", () => {
  test("pairs n↔s and e↔w", () => {
    expect(oppositeSide("n")).toBe("s");
    expect(oppositeSide("s")).toBe("n");
    expect(oppositeSide("e")).toBe("w");
    expect(oppositeSide("w")).toBe("e");
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
  test("admits a typed entrance literal with all required fields", () => {
    const conn: Connector = { side: "s", col: 0, row: 0 };
    const c: Chunk = {
      id: "test",
      kind: "entrance",
      width: 1,
      height: 1,
      start: { col: 0, row: 0 },
      spawnSlots: [],
      itemSlots: [],
      coverTiles: [],
      connectors: [conn],
      tiles: [[{ kind: "door" }]],
    };
    expect(c.id).toBe("test");
    expect(c.connectors[0].side).toBe("s");
  });
});

describe("loadChunks itemSlots (spec 0010)", () => {
  const chunks = loadChunks();

  test("every chunk has an itemSlots field (empty array allowed)", () => {
    for (const c of chunks) {
      expect(Array.isArray(c.itemSlots)).toBe(true);
    }
  });

  test("authored itemSlots use only known kinds (medkit | flashbang)", () => {
    for (const c of chunks) {
      for (const slot of c.itemSlots) {
        expect(["medkit", "flashbang"]).toContain(slot.kind);
      }
    }
  });

  test("at least one chunk has each kind authored across the library", () => {
    const kinds = new Set<string>();
    for (const c of chunks) {
      for (const s of c.itemSlots) kinds.add(s.kind);
    }
    expect(kinds).toEqual(new Set(["medkit", "flashbang"]));
  });

  test("authored item slots sit on floor tiles (no walls, no doors)", () => {
    for (const c of chunks) {
      for (const slot of c.itemSlots) {
        const tile = c.tiles[slot.row][slot.col];
        expect(tile.kind).toBe("floor");
      }
    }
  });
});
