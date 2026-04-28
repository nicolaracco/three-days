import { test, expect, describe } from "bun:test";
import balance from "../data/balance.json";
import { type Tile, loadDay1Map, loadDay2Map } from "./map";

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

describe("loadDay2Map (spec 0011)", () => {
  test("lobby returns a well-formed map with a commander", () => {
    const { map, enemies, key } = loadDay2Map("lobby");
    expect(key).toBe("lobby");
    expect(map.width).toBeGreaterThan(0);
    expect(map.height).toBeGreaterThan(0);
    expect(map.tiles).toHaveLength(map.height);
    for (const row of map.tiles) expect(row).toHaveLength(map.width);
    // Commander present with the boosted HP from the JSON.
    const commander = enemies.find((e) => e.isCommander);
    expect(commander).toBeDefined();
    expect(commander!.maxHP).toBe(balance.COMMANDER_HP);
    expect(commander!.currentHP).toBe(balance.COMMANDER_HP);
    expect(commander!.stunnedTurns).toBe(0);
  });

  test("rooftop returns a well-formed map with no commander but more enemies", () => {
    const lobby = loadDay2Map("lobby");
    const { map, enemies } = loadDay2Map("rooftop");
    expect(map.width).toBeGreaterThan(0);
    expect(map.height).toBeGreaterThan(0);
    expect(enemies.some((e) => e.isCommander)).toBe(false);
    // GDD §9.2: rooftop has more enemies than the lobby (proxy for
    // "more ranged enemies" until ranged ships).
    expect(enemies.length).toBeGreaterThan(lobby.enemies.length);
  });

  test("Day-2 maps contain zero exit tiles per GDD §9.3", () => {
    for (const key of ["lobby", "rooftop"] as const) {
      const { map } = loadDay2Map(key);
      for (const row of map.tiles) {
        for (const tile of row) {
          expect(tile.kind === "exit").toBe(false);
        }
      }
    }
  });

  test("start positions are inside the map and on a floor tile", () => {
    for (const key of ["lobby", "rooftop"] as const) {
      const { map } = loadDay2Map(key);
      expect(map.start.col).toBeGreaterThanOrEqual(0);
      expect(map.start.col).toBeLessThan(map.width);
      expect(map.start.row).toBeGreaterThanOrEqual(0);
      expect(map.start.row).toBeLessThan(map.height);
      expect(map.tiles[map.start.row][map.start.col].kind).toBe("floor");
    }
  });

  test("authored items land on floor tiles", () => {
    for (const key of ["lobby", "rooftop"] as const) {
      const { map } = loadDay2Map(key);
      for (const item of map.itemsOnMap) {
        expect(map.tiles[item.position.row][item.position.col].kind).toBe(
          "floor",
        );
      }
    }
  });

  test("authored enemies land on floor tiles", () => {
    for (const key of ["lobby", "rooftop"] as const) {
      const { map, enemies } = loadDay2Map(key);
      for (const enemy of enemies) {
        expect(map.tiles[enemy.position.row][enemy.position.col].kind).toBe(
          "floor",
        );
      }
    }
  });
});
