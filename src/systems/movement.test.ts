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
  });

  test("returns BFS-detour cost when a non-blocked target requires routing around a block", () => {
    // start = (5, 7); blocking the direct south step at (5, 8).
    // Manhattan distance to (5, 9) is 2, but the BFS detour goes
    // (5,7)→(4,7)→(4,8)→(4,9)→(5,9) = 4 steps. The cost is 4, not 2.
    const blocked = [{ col: 5, row: 8 }];
    expect(apCostToReach(start, { col: 5, row: 9 }, map, blocked)).toBe(4);
  });

  test("non-blocked target with no block in the way matches Manhattan distance", () => {
    const blocked = [{ col: 5, row: 8 }];
    expect(apCostToReach(start, { col: 7, row: 7 }, map, blocked)).toBe(2);
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
    // Blocked tile must not appear.
    expect(result).not.toContainEqual({ col: 5, row: 8 });
    // (5, 10) was Manhattan-3 but BFS-5 (must detour around the blocker)
    // — correctly filtered out at AP = 4.
    expect(result).not.toContainEqual({ col: 5, row: 10 });
    // (5, 11) was Manhattan-4 but BFS-6 — also out.
    expect(result).not.toContainEqual({ col: 5, row: 11 });
    // Tiles unaffected by the detour are still in.
    expect(result).toContainEqual(start);
    expect(result).toContainEqual({ col: 5, row: 9 }); // BFS-4, just barely
    // 41 (full diamond) − 1 (blocked) − 1 (5,10) − 1 (5,11) = 38.
    expect(result).toHaveLength(38);
  });
});
