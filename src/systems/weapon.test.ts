import { test, expect, describe } from "bun:test";
import { type Weapon, getWeapon, loadWeapons } from "./weapon";

describe("loadWeapons", () => {
  const weapons = loadWeapons();

  test("returns at least one weapon", () => {
    expect(weapons.length).toBeGreaterThan(0);
  });

  test("includes the improvised-melee weapon with the documented stats", () => {
    const w = weapons.find((x) => x.id === "improvised-melee");
    expect(w).toBeDefined();
    expect(w?.damage).toBe(1);
    expect(w?.range).toBe(1);
    expect(w?.apCost).toBe(2);
  });
});

describe("getWeapon", () => {
  test("returns the weapon for a known id", () => {
    const w = getWeapon("improvised-melee");
    expect(w).not.toBeNull();
    expect(w?.id).toBe("improvised-melee");
  });

  test("returns null for an unknown id", () => {
    const w = getWeapon("no-such-weapon");
    expect(w).toBeNull();
  });
});

describe("Weapon shape", () => {
  test("admits a typed weapon literal", () => {
    const w: Weapon = {
      id: "test",
      name: "Test",
      damage: 1,
      range: 1,
      apCost: 1,
    };
    expect(w.id).toBe("test");
  });
});
