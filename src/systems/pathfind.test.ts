import { test, expect, describe } from "bun:test";
import { loadDay1Map } from "./map";
import { bfs } from "./pathfind";

const map = loadDay1Map();

describe("bfs", () => {
  test("returns the trivial path [from] when from === to", () => {
    const path = bfs({ col: 5, row: 7 }, { col: 5, row: 7 }, map, []);
    expect(path).toEqual([{ col: 5, row: 7 }]);
  });

  test("finds a shortest 4-connected path on an all-floor map (length = Manhattan + 1)", () => {
    const from = { col: 5, row: 7 };
    const to = { col: 8, row: 9 };
    const path = bfs(from, to, map, []);
    expect(path).not.toBeNull();
    if (path === null) throw new Error("unreachable");
    // Manhattan distance from (5,7) to (8,9) = 3 + 2 = 5; path includes endpoints = 6
    expect(path).toHaveLength(6);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    // Every consecutive pair must be 4-adjacent
    for (let i = 1; i < path.length; i++) {
      const dCol = Math.abs(path[i].col - path[i - 1].col);
      const dRow = Math.abs(path[i].row - path[i - 1].row);
      expect(dCol + dRow).toBe(1);
    }
  });

  test("routes around a blocked tile when an alternate path exists", () => {
    const from = { col: 5, row: 7 };
    const to = { col: 5, row: 9 };
    // Block the direct south step (5, 8)
    const path = bfs(from, to, map, [{ col: 5, row: 8 }]);
    expect(path).not.toBeNull();
    if (path === null) throw new Error("unreachable");
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    // Path should not include the blocked tile
    expect(path).not.toContainEqual({ col: 5, row: 8 });
  });

  test("returns null when the target is fully encircled by blocked tiles", () => {
    const from = { col: 5, row: 7 };
    const to = { col: 0, row: 0 };
    // Encircle the corner: block the only two cells the BFS could approach from
    const blocked = [
      { col: 1, row: 0 },
      { col: 0, row: 1 },
    ];
    const path = bfs(from, to, map, blocked);
    expect(path).toBeNull();
  });

  test("returns null when the start itself is blocked (degenerate)", () => {
    const from = { col: 5, row: 7 };
    const to = { col: 6, row: 7 };
    const path = bfs(from, to, map, [from]);
    expect(path).toBeNull();
  });
});
