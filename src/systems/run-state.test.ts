import { test, expect, describe } from "bun:test";
import balance from "../data/balance.json";
import { commitMove, createRunState, endTurn } from "./run-state";

describe("createRunState", () => {
  const state = createRunState({ seed: 12345 });

  test("seeds correctly and starts at the map's start position", () => {
    expect(state.seed).toBe(12345);
    expect(state.protagonist.position).toEqual(state.map.start);
    expect(state.protagonist.currentAP).toBe(balance.MAX_AP);
    expect(state.protagonist.maxAP).toBe(balance.MAX_AP);
    expect(state.turn).toBe(1);
  });

  test("two states with the same seed are structurally equal", () => {
    const a = createRunState({ seed: 7 });
    const b = createRunState({ seed: 7 });
    expect(a).toEqual(b);
  });
});

describe("commitMove", () => {
  test("happy path: returns ok=true and a new state with updated position and AP", () => {
    const state = createRunState({ seed: 1 });
    const target = {
      col: state.protagonist.position.col + 2,
      row: state.protagonist.position.row,
    };
    const result = commitMove(state, target);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.state.protagonist.position).toEqual(target);
    expect(result.state.protagonist.currentAP).toBe(balance.MAX_AP - 2);
  });

  test("happy path leaves the input state unchanged (immutable)", () => {
    const state = createRunState({ seed: 1 });
    const before = state.protagonist.position;
    const beforeAP = state.protagonist.currentAP;
    const target = {
      col: state.protagonist.position.col + 1,
      row: state.protagonist.position.row,
    };
    commitMove(state, target);
    expect(state.protagonist.position).toEqual(before);
    expect(state.protagonist.currentAP).toBe(beforeAP);
  });

  test("insufficient AP: returns ok=false with reason 'insufficient-ap'", () => {
    const state = createRunState({ seed: 1 });
    // Manhattan distance > MAX_AP
    const target = { col: 0, row: 0 };
    const result = commitMove(state, target);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("insufficient-ap");
  });

  test("off-map target: returns ok=false with reason 'off-map'", () => {
    const state = createRunState({ seed: 1 });
    const target = { col: -1, row: 0 };
    const result = commitMove(state, target);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("off-map");
  });
});

describe("endTurn", () => {
  test("refills AP to maxAP and increments turn", () => {
    const state = createRunState({ seed: 1 });
    const moved = commitMove(state, {
      col: state.protagonist.position.col + 2,
      row: state.protagonist.position.row,
    });
    if (!moved.ok) throw new Error("setup move failed");
    const next = endTurn(moved.state);
    expect(next.protagonist.currentAP).toBe(balance.MAX_AP);
    expect(next.turn).toBe(state.turn + 1);
    expect(next.protagonist.position).toEqual(moved.state.protagonist.position);
  });
});
