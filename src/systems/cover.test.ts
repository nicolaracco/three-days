import { describe, expect, test } from "bun:test";
import {
  type HitChance,
  coverBetween,
  hitChance,
  hitChanceProbability,
} from "./cover";
import type { Day1Map } from "./map";

const allFloor = (
  width: number,
  height: number,
  coverTiles: { col: number; row: number }[] = [],
): Day1Map => ({
  width,
  height,
  start: { col: 0, row: 0 },
  tiles: Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ kind: "floor" }) as const),
  ),
  spawnSlots: [],
  itemsOnMap: [],
  coverTiles,
});

describe("coverBetween", () => {
  test("returns 'none' for same tile", () => {
    const map = allFloor(5, 5, [{ col: 2, row: 2 }]);
    expect(coverBetween({ col: 2, row: 2 }, { col: 2, row: 2 }, map)).toBe(
      "none",
    );
  });

  test("returns 'none' for adjacent tiles regardless of cover (no in-between)", () => {
    const map = allFloor(5, 5, [
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ]);
    expect(coverBetween({ col: 1, row: 1 }, { col: 2, row: 1 }, map)).toBe(
      "none",
    );
  });

  test("returns 'full' when a cover tile sits on the line between from and to", () => {
    const map = allFloor(7, 3, [{ col: 3, row: 1 }]);
    expect(coverBetween({ col: 0, row: 1 }, { col: 6, row: 1 }, map)).toBe(
      "full",
    );
  });

  test("excludes endpoints — a cover tile AT from or to does not count", () => {
    const map = allFloor(5, 3, [{ col: 4, row: 1 }]);
    expect(coverBetween({ col: 0, row: 1 }, { col: 4, row: 1 }, map)).toBe(
      "none",
    );
  });

  test("returns 'full' on diagonal lines too", () => {
    const map = allFloor(5, 5, [{ col: 2, row: 2 }]);
    expect(coverBetween({ col: 0, row: 0 }, { col: 4, row: 4 }, map)).toBe(
      "full",
    );
  });

  test("returns 'none' when no cover tiles are authored", () => {
    const map = allFloor(7, 3);
    expect(coverBetween({ col: 0, row: 1 }, { col: 6, row: 1 }, map)).toBe(
      "none",
    );
  });
});

describe("hitChance", () => {
  const attacker = { col: 0, row: 0 };

  test("returns 'certain' for range 1 (melee), regardless of cover", () => {
    expect(
      hitChance({
        attacker,
        target: { col: 1, row: 0 },
        weaponRange: 1,
        cover: "full",
      }),
    ).toBe("certain");
  });

  test("returns 'probable' for ranged, no cover", () => {
    expect(
      hitChance({
        attacker,
        target: { col: 5, row: 0 },
        weaponRange: 99,
        cover: "none",
      }),
    ).toBe("probable");
  });

  test("returns 'risky' for ranged, cover present, Manhattan distance <= 4", () => {
    expect(
      hitChance({
        attacker,
        target: { col: 4, row: 0 },
        weaponRange: 99,
        cover: "full",
      }),
    ).toBe("risky");
  });

  test("returns 'unlikely' for ranged, cover present, Manhattan distance > 4", () => {
    expect(
      hitChance({
        attacker,
        target: { col: 8, row: 0 },
        weaponRange: 99,
        cover: "full",
      }),
    ).toBe("unlikely");
  });

  test("Manhattan distance is the boundary; 4 is risky, 5 is unlikely", () => {
    expect(
      hitChance({
        attacker,
        target: { col: 2, row: 2 },
        weaponRange: 99,
        cover: "full",
      }),
    ).toBe("risky");
    expect(
      hitChance({
        attacker,
        target: { col: 3, row: 2 },
        weaponRange: 99,
        cover: "full",
      }),
    ).toBe("unlikely");
  });
});

describe("hitChanceProbability", () => {
  test("maps each tier to its locked decision percentage", () => {
    const cases: Array<[HitChance, number]> = [
      ["certain", 1.0],
      ["probable", 0.75],
      ["risky", 0.5],
      ["unlikely", 0.25],
    ];
    for (const [level, prob] of cases) {
      expect(hitChanceProbability(level)).toBe(prob);
    }
  });
});
