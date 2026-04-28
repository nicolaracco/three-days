import { describe, expect, test } from "bun:test";
import type { Day1Map } from "./map";
import { hasLoS, tilesAlongLine } from "./los";

const allFloor = (width: number, height: number): Day1Map => ({
  width,
  height,
  start: { col: 0, row: 0 },
  tiles: Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ kind: "floor" }) as const),
  ),
  spawnSlots: [],
  itemsOnMap: [],
});

describe("tilesAlongLine", () => {
  test("collapses to a single tile when from === to", () => {
    const line = tilesAlongLine({ col: 3, row: 3 }, { col: 3, row: 3 });
    expect(line).toEqual([{ col: 3, row: 3 }]);
  });

  test("traces a horizontal line inclusive of endpoints", () => {
    const line = tilesAlongLine({ col: 1, row: 2 }, { col: 4, row: 2 });
    expect(line).toEqual([
      { col: 1, row: 2 },
      { col: 2, row: 2 },
      { col: 3, row: 2 },
      { col: 4, row: 2 },
    ]);
  });

  test("traces a perfect diagonal", () => {
    const line = tilesAlongLine({ col: 0, row: 0 }, { col: 3, row: 3 });
    expect(line).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 1 },
      { col: 2, row: 2 },
      { col: 3, row: 3 },
    ]);
  });
});

describe("hasLoS", () => {
  test("self-LoS is true (degenerate)", () => {
    const map = allFloor(5, 5);
    expect(hasLoS({ col: 2, row: 2 }, { col: 2, row: 2 }, map)).toBe(true);
  });

  test("adjacent tiles have LoS regardless of walls (no in-between)", () => {
    const map = allFloor(5, 5);
    expect(hasLoS({ col: 1, row: 1 }, { col: 2, row: 1 }, map)).toBe(true);
  });

  test("clear horizontal line over floor returns true", () => {
    const map = allFloor(7, 3);
    expect(hasLoS({ col: 0, row: 1 }, { col: 6, row: 1 }, map)).toBe(true);
  });

  test("clear vertical line over floor returns true", () => {
    const map = allFloor(3, 7);
    expect(hasLoS({ col: 1, row: 0 }, { col: 1, row: 6 }, map)).toBe(true);
  });

  test("clear diagonal line over floor returns true", () => {
    const map = allFloor(5, 5);
    expect(hasLoS({ col: 0, row: 0 }, { col: 4, row: 4 }, map)).toBe(true);
  });

  test("a wall on the line blocks LoS", () => {
    const map = allFloor(7, 3);
    map.tiles[1][3] = { kind: "wall" };
    expect(hasLoS({ col: 0, row: 1 }, { col: 6, row: 1 }, map)).toBe(false);
  });

  test("a wall at the endpoint does NOT block LoS (endpoints are excluded)", () => {
    const map = allFloor(5, 3);
    map.tiles[1][4] = { kind: "wall" };
    // Shooter at (0,1) targeting (4,1): line cells in between are (1..3, 1)
    // — all floor. Endpoint (4,1) is wall but we don't check it.
    expect(hasLoS({ col: 0, row: 1 }, { col: 4, row: 1 }, map)).toBe(true);
  });

  test("exit tiles are transparent (do not block)", () => {
    const map = allFloor(5, 3);
    map.tiles[1][2] = {
      kind: "exit",
      exitType: "stairwell",
      traitGate: null,
    };
    expect(hasLoS({ col: 0, row: 1 }, { col: 4, row: 1 }, map)).toBe(true);
  });
});
