import { test, expect, describe } from "bun:test";
import balance from "../data/balance.json";
import { type Enemy, loadDay1Enemies } from "./enemy";

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
