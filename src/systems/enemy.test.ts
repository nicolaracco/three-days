import { test, expect, describe } from "bun:test";
import balance from "../data/balance.json";
import { type Enemy, loadDay1Enemies, placeEnemiesOnMap } from "./enemy";
import { generateMap } from "./procgen";
import { createRng } from "./rng";

describe("loadDay1Enemies", () => {
  const enemies = loadDay1Enemies();

  test("returns one enemy per the static spawn data", () => {
    expect(enemies).toHaveLength(1);
  });

  test("the enemy is melee, has the configured spawn position, and full AP", () => {
    const e = enemies[0];
    expect(e.kind).toBe("melee");
    expect(e.position).toEqual({ col: 5, row: 11 });
    expect(e.currentAP).toBe(balance.ENEMY_MAX_AP);
    expect(e.maxAP).toBe(balance.ENEMY_MAX_AP);
    expect(e.id).toBe("alien-1");
  });

  test("the enemy starts at full HP", () => {
    const e = enemies[0];
    expect(e.currentHP).toBe(balance.ENEMY_HP);
    expect(e.maxHP).toBe(balance.ENEMY_HP);
  });

  test("the enemy carries a weapon id from the spawn data", () => {
    const e = enemies[0];
    expect(e.weaponId).toBe("improvised-melee");
  });
});

describe("Enemy union", () => {
  test("admits both melee and ranged kinds", () => {
    const melee: Enemy = {
      id: "m",
      kind: "melee",
      position: { col: 0, row: 0 },
      currentAP: 3,
      maxAP: 3,
      currentHP: 3,
      maxHP: 3,
      weaponId: "improvised-melee",
    };
    const ranged: Enemy = {
      id: "r",
      kind: "ranged",
      position: { col: 0, row: 0 },
      currentAP: 3,
      maxAP: 3,
      currentHP: 3,
      maxHP: 3,
      weaponId: "improvised-melee",
    };
    expect(melee.kind).toBe("melee");
    expect(ranged.kind).toBe("ranged");
  });
});

describe("placeEnemiesOnMap", () => {
  test("places each enemy on a floor tile", () => {
    for (let s = 1; s <= 20; s++) {
      const rng = createRng(s);
      const map = generateMap(rng);
      const placed = placeEnemiesOnMap(loadDay1Enemies(), map, rng);
      for (const e of placed) {
        const tile = map.tiles[e.position.row][e.position.col];
        expect(tile.kind).toBe("floor");
      }
    }
  });

  test("places enemies in the back half of the map (row >= map.height / 2)", () => {
    for (let s = 1; s <= 20; s++) {
      const rng = createRng(s);
      const map = generateMap(rng);
      const placed = placeEnemiesOnMap(loadDay1Enemies(), map, rng);
      for (const e of placed) {
        expect(e.position.row).toBeGreaterThanOrEqual(map.height / 2);
      }
    }
  });

  test("never places an enemy on map.start nor 4-adjacent to it", () => {
    for (let s = 1; s <= 20; s++) {
      const rng = createRng(s);
      const map = generateMap(rng);
      const placed = placeEnemiesOnMap(loadDay1Enemies(), map, rng);
      for (const e of placed) {
        const dist =
          Math.abs(e.position.col - map.start.col) +
          Math.abs(e.position.row - map.start.row);
        expect(dist).toBeGreaterThan(1);
      }
    }
  });

  test("preserves enemy id, kind, AP, HP, weaponId", () => {
    const rng = createRng(7);
    const map = generateMap(rng);
    const base = loadDay1Enemies();
    const placed = placeEnemiesOnMap(base, map, rng);
    expect(placed).toHaveLength(base.length);
    for (let i = 0; i < placed.length; i++) {
      expect(placed[i].id).toBe(base[i].id);
      expect(placed[i].kind).toBe(base[i].kind);
      expect(placed[i].currentAP).toBe(base[i].currentAP);
      expect(placed[i].maxAP).toBe(base[i].maxAP);
      expect(placed[i].currentHP).toBe(base[i].currentHP);
      expect(placed[i].maxHP).toBe(base[i].maxHP);
      expect(placed[i].weaponId).toBe(base[i].weaponId);
    }
  });

  test("different seeds can produce different enemy positions", () => {
    const positions = new Set<string>();
    for (let s = 1; s <= 50; s++) {
      const rng = createRng(s);
      const map = generateMap(rng);
      const placed = placeEnemiesOnMap(loadDay1Enemies(), map, rng);
      positions.add(`${placed[0].position.col},${placed[0].position.row}`);
    }
    expect(positions.size).toBeGreaterThan(1);
  });
});
