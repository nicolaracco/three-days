import { test, expect, describe } from "bun:test";
import balance from "../data/balance.json";
import { advanceTurn, commitMove, createRunState } from "./run-state";

describe("createRunState", () => {
  const state = createRunState({ seed: 12345 });

  test("seeds correctly and starts at the map's start position", () => {
    expect(state.seed).toBe(12345);
    expect(state.protagonist.position).toEqual(state.map.start);
    expect(state.protagonist.currentAP).toBe(balance.MAX_AP);
    expect(state.protagonist.maxAP).toBe(balance.MAX_AP);
    expect(state.turn).toBe(1);
  });

  test("starts with activeTurn = 'player' and the static enemies populated", () => {
    expect(state.activeTurn).toBe("player");
    expect(state.enemies.length).toBeGreaterThan(0);
    expect(state.enemies[0].kind).toBe("melee");
  });

  test("protagonist starts at full HP with the improvised-melee weapon equipped", () => {
    expect(state.protagonist.currentHP).toBe(balance.PROTAGONIST_HP);
    expect(state.protagonist.maxHP).toBe(balance.PROTAGONIST_HP);
    expect(state.protagonist.weaponId).toBe("improvised-melee");
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

  test("happy path: returns the BFS path inclusive of both endpoints", () => {
    const state = createRunState({ seed: 1 });
    const target = {
      col: state.protagonist.position.col + 2,
      row: state.protagonist.position.row,
    };
    const result = commitMove(state, target);
    if (!result.ok) throw new Error("unreachable");
    // path length === cost + 1; first tile is the protagonist's pre-move
    // position; last tile is the target.
    expect(result.path).toHaveLength(3);
    expect(result.path[0]).toEqual(state.protagonist.position);
    expect(result.path[result.path.length - 1]).toEqual(target);
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

  test("rejects a move onto an enemy tile (treats enemy as blocked)", () => {
    const state = createRunState({ seed: 1 });
    const enemy = state.enemies[0];
    const result = commitMove(state, enemy.position);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("off-map");
  });
});

describe("advanceTurn", () => {
  test("player → enemy: switches active turn and refills each enemy's AP", () => {
    const state = createRunState({ seed: 1 });
    // Drain an enemy's AP so we can verify the refill.
    const drained = {
      ...state,
      enemies: state.enemies.map((e) => ({ ...e, currentAP: 0 })),
    };
    const next = advanceTurn(drained);
    expect(next.activeTurn).toBe("enemy");
    for (const e of next.enemies) {
      expect(e.currentAP).toBe(e.maxAP);
    }
    // Protagonist AP is NOT refilled on this transition.
    expect(next.protagonist.currentAP).toBe(state.protagonist.currentAP);
    // Turn counter does not yet advance — full cycle = one turn.
    expect(next.turn).toBe(state.turn);
  });

  test("enemy → player: refills protagonist AP, increments turn, switches active turn", () => {
    const state = createRunState({ seed: 1 });
    const onEnemyTurn = {
      ...state,
      activeTurn: "enemy" as const,
      protagonist: { ...state.protagonist, currentAP: 0 },
    };
    const next = advanceTurn(onEnemyTurn);
    expect(next.activeTurn).toBe("player");
    expect(next.protagonist.currentAP).toBe(state.protagonist.maxAP);
    expect(next.turn).toBe(state.turn + 1);
  });

  test("input state is left unchanged (immutable)", () => {
    const state = createRunState({ seed: 1 });
    const beforeActiveTurn = state.activeTurn;
    advanceTurn(state);
    expect(state.activeTurn).toBe(beforeActiveTurn);
  });
});
