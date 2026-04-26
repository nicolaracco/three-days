import { test, expect, describe } from "bun:test";
import { loadDay1Map } from "./map";
import { apCostToReach, reachableTiles } from "./movement";

const map = loadDay1Map();
const start = map.start; // { col: 5, row: 7 } per the static map

describe("apCostToReach", () => {
  test("returns 0 for the start tile", () => {
    expect(apCostToReach(start, start, map)).toBe(0);
  });

  test("returns Manhattan distance for in-bounds targets", () => {
    expect(apCostToReach(start, { col: 5, row: 8 }, map)).toBe(1);
    expect(apCostToReach(start, { col: 7, row: 7 }, map)).toBe(2);
    expect(apCostToReach(start, { col: 5 + 3, row: 7 - 2 }, map)).toBe(5);
  });

  test("returns Infinity for off-map targets", () => {
    expect(apCostToReach(start, { col: -1, row: 0 }, map)).toBe(Infinity);
    expect(apCostToReach(start, { col: 0, row: -1 }, map)).toBe(Infinity);
    expect(apCostToReach(start, { col: map.width, row: 0 }, map)).toBe(
      Infinity,
    );
    expect(apCostToReach(start, { col: 0, row: map.height }, map)).toBe(
      Infinity,
    );
  });

  test("returns Infinity for blocked targets", () => {
    const blocked = [{ col: 5, row: 8 }];
    expect(apCostToReach(start, { col: 5, row: 8 }, map, blocked)).toBe(
      Infinity,
    );
    // A non-blocked target is unaffected.
    expect(apCostToReach(start, { col: 5, row: 9 }, map, blocked)).toBe(2);
  });
});

describe("reachableTiles", () => {
  test("range = 0 returns the start tile only", () => {
    const result = reachableTiles(start, 0, map);
    expect(result).toEqual([start]);
  });

  test("range = 4 from the center returns 41 tiles (full Manhattan diamond, no clipping)", () => {
    // start (5, 7) is far enough from edges that range-4 doesn't clip.
    const result = reachableTiles(start, 4, map);
    expect(result).toHaveLength(41);
  });

  test("range = 4 includes the start tile itself", () => {
    const result = reachableTiles(start, 4, map);
    expect(result).toContainEqual(start);
  });

  test("range clips to map bounds when starting near a corner", () => {
    const result = reachableTiles({ col: 0, row: 0 }, 2, map);
    expect(result).toHaveLength(6);
  });

  test("excludes blocked tiles from the reachable set", () => {
    const blocked = [{ col: 5, row: 8 }];
    const result = reachableTiles(start, 4, map, blocked);
    // Blocked tile must not appear; everything else from the Manhattan diamond stays.
    expect(result).not.toContainEqual({ col: 5, row: 8 });
    expect(result).toHaveLength(40); // 41 - 1
    expect(result).toContainEqual(start);
  });
});
