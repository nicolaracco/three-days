import { test, expect, describe } from "bun:test";
import balance from "../data/balance.json";
import { loadDay1Enemies } from "./enemy";
import { loadDay1Map } from "./map";
import { generateMap } from "./procgen";
import { createRng } from "./rng";
import {
  advanceTurn,
  commitMove,
  createRunState,
  createRunStateFromMap,
  useFlashbang,
  useMedkit,
} from "./run-state";

/**
 * Fixture state — built against the static 11×15 all-floor map and the
 * static enemy spawn at (5, 11). Used by tests that assert specific
 * positions; insulates them from procgen output.
 */
function fixtureState() {
  return createRunStateFromMap({
    seed: 1,
    map: loadDay1Map(),
    enemies: loadDay1Enemies(),
  });
}

describe("createRunState (procgen runtime)", () => {
  test("seeds correctly and starts at the map's start position", () => {
    const state = createRunState({ seed: 12345 });
    expect(state.seed).toBe(12345);
    expect(state.protagonist.position).toEqual(state.map.start);
    expect(state.protagonist.currentAP).toBe(balance.MAX_AP);
    expect(state.protagonist.maxAP).toBe(balance.MAX_AP);
    expect(state.turn).toBe(1);
  });

  test("starts with activeTurn = 'player' and at least one enemy populated", () => {
    const state = createRunState({ seed: 12345 });
    expect(state.activeTurn).toBe("player");
    expect(state.enemies.length).toBeGreaterThan(0);
    expect(state.enemies[0].kind).toBe("melee");
  });

  test("protagonist starts at full HP with the improvised-melee weapon equipped", () => {
    const state = createRunState({ seed: 12345 });
    expect(state.protagonist.currentHP).toBe(balance.PROTAGONIST_HP);
    expect(state.protagonist.maxHP).toBe(balance.PROTAGONIST_HP);
    expect(state.protagonist.weaponId).toBe("improvised-melee");
  });

  test("two states with the same seed are structurally equal", () => {
    const a = createRunState({ seed: 7 });
    const b = createRunState({ seed: 7 });
    expect(a).toEqual(b);
  });

  test("uses procgen — state.map equals generateMap(createRng(seed))", () => {
    const seed = 99;
    const expected = generateMap(createRng(seed));
    const state = createRunState({ seed });
    expect(state.map).toEqual(expected);
  });

  test("places the enemy on a floor tile in the procgen map (not a wall)", () => {
    for (let s = 1; s <= 20; s++) {
      const state = createRunState({ seed: s });
      const e = state.enemies[0];
      expect(state.map.tiles[e.position.row][e.position.col].kind).toBe(
        "floor",
      );
    }
  });
});

describe("createRunStateFromMap", () => {
  test("uses the supplied map and starts the protagonist at map.start", () => {
    const map = loadDay1Map();
    const state = createRunStateFromMap({
      seed: 42,
      map,
      enemies: loadDay1Enemies(),
    });
    expect(state.map).toBe(map);
    expect(state.protagonist.position).toEqual(map.start);
    expect(state.seed).toBe(42);
    expect(state.activeTurn).toBe("player");
  });

  test("falls back to loadDay1Enemies when enemies arg is omitted", () => {
    const map = loadDay1Map();
    const state = createRunStateFromMap({ seed: 1, map });
    expect(state.enemies).toEqual(loadDay1Enemies());
  });
});

describe("commitMove", () => {
  test("happy path: returns ok=true and a new state with updated position and AP", () => {
    const state = fixtureState();
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
    const state = fixtureState();
    const target = {
      col: state.protagonist.position.col + 2,
      row: state.protagonist.position.row,
    };
    const result = commitMove(state, target);
    if (!result.ok) throw new Error("unreachable");
    expect(result.path).toHaveLength(3);
    expect(result.path[0]).toEqual(state.protagonist.position);
    expect(result.path[result.path.length - 1]).toEqual(target);
  });

  test("happy path leaves the input state unchanged (immutable)", () => {
    const state = fixtureState();
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
    const state = fixtureState();
    // Manhattan distance from (5, 7) to (0, 0) is 12, > MAX_AP (4). All
    // tiles in between are floor on the static fixture, so the BFS path
    // exists; the cost just exceeds AP.
    const target = { col: 0, row: 0 };
    const result = commitMove(state, target);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("insufficient-ap");
  });

  test("off-map target: returns ok=false with reason 'off-map'", () => {
    const state = fixtureState();
    const target = { col: -1, row: 0 };
    const result = commitMove(state, target);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("off-map");
  });

  test("rejects a move onto an enemy tile (treats enemy as blocked)", () => {
    const state = fixtureState();
    const enemy = state.enemies[0];
    const result = commitMove(state, enemy.position);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("off-map");
  });
});

describe("advanceTurn", () => {
  test("player → enemy: switches active turn and refills each enemy's AP", () => {
    const state = fixtureState();
    const drained = {
      ...state,
      enemies: state.enemies.map((e) => ({ ...e, currentAP: 0 })),
    };
    const next = advanceTurn(drained);
    expect(next.activeTurn).toBe("enemy");
    for (const e of next.enemies) {
      expect(e.currentAP).toBe(e.maxAP);
    }
    expect(next.protagonist.currentAP).toBe(state.protagonist.currentAP);
    expect(next.turn).toBe(state.turn);
  });

  test("enemy → player: refills protagonist AP, increments turn, switches active turn", () => {
    const state = fixtureState();
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
    const state = fixtureState();
    const beforeActiveTurn = state.activeTurn;
    advanceTurn(state);
    expect(state.activeTurn).toBe(beforeActiveTurn);
  });
});

describe("useMedkit (spec 0010)", () => {
  test("rejects with 'no-item' when inventory is empty", () => {
    const state = fixtureState();
    const result = useMedkit(state);
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("no-item");
  });

  test("rejects with 'insufficient-ap' when below USE_ITEM_AP_COST", () => {
    const base = fixtureState();
    const state = {
      ...base,
      protagonist: {
        ...base.protagonist,
        currentHP: 1,
        currentAP: 0,
        inventory: { medkit: 1, flashbang: 0 },
      },
    };
    const result = useMedkit(state);
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("insufficient-ap");
  });

  test("rejects with 'at-full-hp' when already at max HP (open question 1)", () => {
    const base = fixtureState();
    const state = {
      ...base,
      protagonist: {
        ...base.protagonist,
        inventory: { medkit: 1, flashbang: 0 },
      },
    };
    expect(state.protagonist.currentHP).toBe(state.protagonist.maxHP);
    const result = useMedkit(state);
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("at-full-hp");
  });

  test("on success heals by ITEM_MEDKIT_HEAL, decrements inventory + AP", () => {
    const base = fixtureState();
    const state = {
      ...base,
      protagonist: {
        ...base.protagonist,
        currentHP: 1,
        inventory: { medkit: 1, flashbang: 0 },
      },
    };
    const result = useMedkit(state);
    if (!result.ok) throw new Error("expected success");
    expect(result.state.protagonist.currentHP).toBe(
      Math.min(state.protagonist.maxHP, 1 + balance.ITEM_MEDKIT_HEAL),
    );
    expect(result.state.protagonist.currentAP).toBe(
      state.protagonist.currentAP - balance.USE_ITEM_AP_COST,
    );
    expect(result.state.protagonist.inventory.medkit).toBe(0);
  });

  test("heal is capped at maxHP", () => {
    const base = fixtureState();
    const state = {
      ...base,
      protagonist: {
        ...base.protagonist,
        currentHP: base.protagonist.maxHP - 1,
        inventory: { medkit: 1, flashbang: 0 },
      },
    };
    const result = useMedkit(state);
    if (!result.ok) throw new Error("expected success");
    expect(result.state.protagonist.currentHP).toBe(state.protagonist.maxHP);
  });
});

describe("useFlashbang (spec 0010)", () => {
  test("rejects with 'no-item' when inventory is empty", () => {
    const state = fixtureState();
    const result = useFlashbang(state);
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("no-item");
  });

  test("rejects with 'insufficient-ap' when below USE_ITEM_AP_COST", () => {
    const base = fixtureState();
    const state = {
      ...base,
      protagonist: {
        ...base.protagonist,
        currentAP: 0,
        inventory: { medkit: 0, flashbang: 1 },
      },
    };
    const result = useFlashbang(state);
    if (result.ok) throw new Error("expected rejection");
    expect(result.reason).toBe("insufficient-ap");
  });

  test("stuns only enemies in 4-neighbor positions; non-adjacent unchanged", () => {
    const base = fixtureState();
    const state = {
      ...base,
      protagonist: {
        ...base.protagonist,
        position: { col: 5, row: 5 },
        inventory: { medkit: 0, flashbang: 1 },
      },
      enemies: [
        // Adjacent — stunned
        { ...base.enemies[0], id: "adj", position: { col: 5, row: 6 } },
        // Diagonal — NOT stunned (Manhattan 2)
        { ...base.enemies[0], id: "diag", position: { col: 6, row: 6 } },
        // Far — NOT stunned
        { ...base.enemies[0], id: "far", position: { col: 0, row: 0 } },
      ],
    };
    const result = useFlashbang(state);
    if (!result.ok) throw new Error("expected success");
    expect(result.stunned).toBe(1);
    const byId = (id: string) => result.state.enemies.find((e) => e.id === id)!;
    expect(byId("adj").stunnedTurns).toBe(1);
    expect(byId("diag").stunnedTurns).toBe(0);
    expect(byId("far").stunnedTurns).toBe(0);
    expect(result.state.protagonist.currentAP).toBe(
      state.protagonist.currentAP - balance.USE_ITEM_AP_COST,
    );
    expect(result.state.protagonist.inventory.flashbang).toBe(0);
  });

  test("wasted bang (no enemies adjacent) still decrements inventory and AP", () => {
    const base = fixtureState();
    const state = {
      ...base,
      protagonist: {
        ...base.protagonist,
        position: { col: 5, row: 5 },
        inventory: { medkit: 0, flashbang: 1 },
      },
      enemies: [
        { ...base.enemies[0], id: "far", position: { col: 0, row: 0 } },
      ],
    };
    const result = useFlashbang(state);
    if (!result.ok) throw new Error("expected success");
    expect(result.stunned).toBe(0);
    expect(result.state.protagonist.inventory.flashbang).toBe(0);
    expect(result.state.protagonist.currentAP).toBe(
      state.protagonist.currentAP - balance.USE_ITEM_AP_COST,
    );
  });
});
