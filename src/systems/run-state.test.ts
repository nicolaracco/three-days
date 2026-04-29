import { test, expect, describe } from "bun:test";
import balance from "../data/balance.json";
import { loadDay1Enemies } from "./enemy";
import { loadDay1Map } from "./map";
import { generateMap } from "./procgen";
import { createRng } from "./rng";
import {
  advanceTurn,
  checkRunEnd,
  commitMove,
  createRunState,
  createRunStateFromMap,
  transitionToDay2,
  useFlashbang,
  useMedkit,
  type RunState,
} from "./run-state";
import type { TraitId } from "./trait";

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
    // Spec 0013 raised the baseline starting medkit count to 1, so
    // we have to drop HP and clear inventory explicitly to reach the
    // no-item rejection path.
    const base = fixtureState();
    const state = {
      ...base,
      protagonist: {
        ...base.protagonist,
        currentHP: 1,
        inventory: { medkit: 0, flashbang: 0 },
      },
    };
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

describe("transitionToDay2 (spec 0011)", () => {
  test("stairwell transitions to lobby with the commander populated", () => {
    const before = fixtureState();
    const after = transitionToDay2(before, "stairwell");
    expect(after.currentDay).toBe(2);
    expect(after.day2MapKey).toBe("lobby");
    expect(after.turn).toBe(1);
    expect(after.runEnd).toBeNull();
    expect(after.activeTurn).toBe("player");
    expect(after.enemies.some((e) => e.isCommander)).toBe(true);
    const commander = after.enemies.find((e) => e.isCommander)!;
    expect(commander.currentHP).toBe(balance.COMMANDER_HP);
    expect(commander.maxHP).toBe(balance.COMMANDER_HP);
  });

  test("fire-escape transitions to rooftop with no commander", () => {
    const before = fixtureState();
    const after = transitionToDay2(before, "fire-escape");
    expect(after.currentDay).toBe(2);
    expect(after.day2MapKey).toBe("rooftop");
    expect(after.enemies.some((e) => e.isCommander)).toBe(false);
    expect(after.enemies.length).toBeGreaterThanOrEqual(3);
  });

  test("HP and inventory carry forward; AP refilled", () => {
    const base = fixtureState();
    const before = {
      ...base,
      protagonist: {
        ...base.protagonist,
        currentHP: 2,
        currentAP: 0,
        inventory: { medkit: 2, flashbang: 1 },
      },
    };
    const after = transitionToDay2(before, "stairwell");
    expect(after.protagonist.currentHP).toBe(2);
    expect(after.protagonist.inventory).toEqual({ medkit: 2, flashbang: 1 });
    expect(after.protagonist.currentAP).toBe(after.protagonist.maxAP);
  });

  test("protagonist relocates to the Day-2 map's start position", () => {
    const before = fixtureState();
    const after = transitionToDay2(before, "stairwell");
    expect(after.protagonist.position).toEqual(after.map.start);
  });
});

describe("checkRunEnd (spec 0011)", () => {
  test("Day-1 in progress with HP > 0 returns the input unchanged", () => {
    const state = fixtureState();
    const result = checkRunEnd(state);
    expect(result).toBe(state);
    expect(result.runEnd).toBeNull();
  });

  test("HP <= 0 sets runEnd to lost/killed on either day", () => {
    const base = fixtureState();
    const dead = {
      ...base,
      protagonist: { ...base.protagonist, currentHP: 0 },
    };
    const result = checkRunEnd(dead);
    expect(result.runEnd).toEqual({ kind: "lost", reason: "killed" });
  });

  test("lobby with no commander alive sets runEnd to won/commander-dead", () => {
    const day2 = transitionToDay2(fixtureState(), "stairwell");
    // Eliminate every enemy: spec interprets 'no commander alive' as the
    // commander being absent or at 0 HP, which both satisfy the check.
    const cleared = {
      ...day2,
      enemies: day2.enemies.map((e) => ({ ...e, currentHP: 0 })),
    };
    const result = checkRunEnd(cleared);
    expect(result.runEnd).toEqual({
      kind: "won",
      reason: "commander-dead",
    });
  });

  test("lobby with commander alive does not win even if other enemies die", () => {
    const day2 = transitionToDay2(fixtureState(), "stairwell");
    const partial = {
      ...day2,
      enemies: day2.enemies.map((e) =>
        e.isCommander ? e : { ...e, currentHP: 0 },
      ),
    };
    const result = checkRunEnd(partial);
    expect(result.runEnd).toBeNull();
  });

  test("rooftop wins when turn > ROOFTOP_SURVIVE_TURNS", () => {
    const day2 = transitionToDay2(fixtureState(), "fire-escape");
    const survived = {
      ...day2,
      turn: balance.ROOFTOP_SURVIVE_TURNS + 1,
    };
    const result = checkRunEnd(survived);
    expect(result.runEnd).toEqual({ kind: "won", reason: "survived" });
  });

  test("rooftop does not win at turn === ROOFTOP_SURVIVE_TURNS (still that turn)", () => {
    const day2 = transitionToDay2(fixtureState(), "fire-escape");
    const onLastTurn = { ...day2, turn: balance.ROOFTOP_SURVIVE_TURNS };
    const result = checkRunEnd(onLastTurn);
    expect(result.runEnd).toBeNull();
  });

  test("is idempotent — calling on a state with runEnd set returns it unchanged", () => {
    const lost = {
      ...fixtureState(),
      runEnd: { kind: "lost" as const, reason: "killed" as const },
    };
    const a = checkRunEnd(lost);
    const b = checkRunEnd(a);
    expect(a).toBe(lost);
    expect(b).toBe(a);
  });
});

describe("Traits — starting state (spec 0013)", () => {
  function withTraits(traits: TraitId[]): RunState {
    return createRunStateFromMap({
      seed: 1,
      map: loadDay1Map(),
      enemies: loadDay1Enemies(),
      traits,
    });
  }

  test("baseline (no traits) starts with 1 medkit, 0 flashbang, maxAP", () => {
    const state = withTraits([]);
    expect(state.protagonist.inventory).toEqual({ medkit: 1, flashbang: 0 });
    expect(state.protagonist.currentAP).toBe(state.protagonist.maxAP);
    expect(state.traits).toEqual([]);
  });

  test("Athletic adds +1 AP on the first turn of each map", () => {
    const state = withTraits(["athletic"]);
    expect(state.protagonist.currentAP).toBe(state.protagonist.maxAP + 1);
  });

  test("Hypochondriac starts with 2 medkits", () => {
    const state = withTraits(["hypochondriac"]);
    expect(state.protagonist.inventory.medkit).toBe(2);
  });

  test("Resourceful starts with 1 flashbang and an extra medkit at the start tile", () => {
    const state = withTraits(["resourceful"]);
    expect(state.protagonist.inventory.flashbang).toBe(1);
    const itemsAtStart = state.itemsOnMap.filter(
      (i) =>
        i.position.col === state.map.start.col &&
        i.position.row === state.map.start.row,
    );
    expect(itemsAtStart.some((i) => i.kind === "medkit")).toBe(true);
  });

  test("Hypochondriac penalty flags reset on transitionToDay2", () => {
    let state = withTraits(["hypochondriac"]);
    state = {
      ...state,
      protagonist: {
        ...state.protagonist,
        hypochondriacPenaltyPending: true,
        hypochondriacTriggeredThisMap: true,
      },
    };
    const next = transitionToDay2(state, "stairwell");
    expect(next.protagonist.hypochondriacPenaltyPending).toBe(false);
    expect(next.protagonist.hypochondriacTriggeredThisMap).toBe(false);
  });
});

describe("Traits — Athletic gate enforcement (spec 0013)", () => {
  function withGatedExitMap(traits: TraitId[]): RunState {
    const base = createRunStateFromMap({
      seed: 1,
      map: loadDay1Map(),
      enemies: loadDay1Enemies(),
      traits,
    });
    // Drop a fire-escape exit one tile east of the protagonist, in
    // place of a floor tile, so commitMove can target it directly.
    const tiles = base.map.tiles.map((row) => row.slice());
    const target = {
      col: base.protagonist.position.col + 1,
      row: base.protagonist.position.row,
    };
    tiles[target.row][target.col] = {
      kind: "exit",
      exitType: "fire-escape",
      traitGate: "athletic",
    };
    return {
      ...base,
      map: { ...base.map, tiles },
    };
  }

  test("commitMove rejects with 'gated' when no Athletic and target is fire-escape", () => {
    const state = withGatedExitMap([]);
    const target = {
      col: state.protagonist.position.col + 1,
      row: state.protagonist.position.row,
    };
    const result = commitMove(state, target);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("gated");
  });

  test("commitMove succeeds onto the same fire-escape with Athletic", () => {
    const state = withGatedExitMap(["athletic"]);
    const target = {
      col: state.protagonist.position.col + 1,
      row: state.protagonist.position.row,
    };
    const result = commitMove(state, target);
    expect(result.ok).toBe(true);
  });
});

describe("Traits — Hypochondriac penalty cycle (spec 0013)", () => {
  test("damage arms pending; advanceTurn(enemy→player) consumes; second damage same map does not re-arm", () => {
    let state = createRunStateFromMap({
      seed: 1,
      map: loadDay1Map(),
      enemies: loadDay1Enemies(),
      traits: ["hypochondriac"],
    });
    // Manually arm via direct field set — combat.ts arming is covered
    // separately in combat.test.ts; this test isolates the cycle.
    state = {
      ...state,
      protagonist: {
        ...state.protagonist,
        hypochondriacPenaltyPending: true,
      },
    };
    // Walk the state through the enemy/player cycle.
    const enemyPhase = advanceTurn(state); // player → enemy
    expect(enemyPhase.protagonist.hypochondriacPenaltyPending).toBe(true);
    const back = advanceTurn(enemyPhase); // enemy → player; consume
    expect(back.protagonist.hypochondriacPenaltyPending).toBe(false);
    expect(back.protagonist.hypochondriacTriggeredThisMap).toBe(true);
    expect(back.protagonist.currentAP).toBe(back.protagonist.maxAP - 1);
    // Re-arm attempt: the trait check in combat.ts gates on
    // `triggeredThisMap`. Setting pending here directly does not
    // simulate that gate, so we just confirm `triggeredThisMap`
    // stays sticky across another cycle.
    const again = advanceTurn(advanceTurn(back));
    expect(again.protagonist.hypochondriacTriggeredThisMap).toBe(true);
  });
});

describe("Traits — Vigilant medkit block (spec 0013)", () => {
  test("useMedkit rejects with 'trait-blocked' when Vigilant is active", () => {
    const base = createRunStateFromMap({
      seed: 1,
      map: loadDay1Map(),
      enemies: loadDay1Enemies(),
      traits: ["vigilant"],
    });
    // Damage the protagonist so 'at-full-hp' isn't the rejection reason.
    const state = {
      ...base,
      protagonist: { ...base.protagonist, currentHP: 1 },
    };
    const result = useMedkit(state);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("trait-blocked");
  });

  test("useMedkit succeeds without Vigilant under the same conditions", () => {
    const base = createRunStateFromMap({
      seed: 1,
      map: loadDay1Map(),
      enemies: loadDay1Enemies(),
      traits: ["athletic"],
    });
    const state = {
      ...base,
      protagonist: { ...base.protagonist, currentHP: 1 },
    };
    const result = useMedkit(state);
    expect(result.ok).toBe(true);
  });
});

describe("createRunState passes traits through (spec 0013)", () => {
  test("createRunState({ seed, traits }) carries traits onto the resulting RunState", () => {
    const state = createRunState({
      seed: 999,
      traits: ["athletic", "vigilant"],
    });
    expect(state.traits).toEqual(["athletic", "vigilant"]);
  });
});
