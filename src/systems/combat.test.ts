import { test, expect, describe } from "bun:test";
import balance from "../data/balance.json";
import { type AttackParams, attackResult, commitAttack } from "./combat";
import { loadDay1Enemies } from "./enemy";
import { loadDay1Map } from "./map";
import { advanceTurn, createRunStateFromMap, type RunState } from "./run-state";

/**
 * Fixture state — uses the static 11×15 all-floor map and the static
 * enemy at (5, 11). Insulates these tests from procgen variance.
 */
function createRunState(): RunState {
  return createRunStateFromMap({
    seed: 1,
    map: loadDay1Map(),
    enemies: loadDay1Enemies(),
  });
}

/** Helper: place the protagonist adjacent to the enemy (ready to attack). */
function withPlayerAdjacent(state: RunState): RunState {
  const e = state.enemies[0];
  return {
    ...state,
    protagonist: {
      ...state.protagonist,
      position: { col: e.position.col, row: e.position.row - 1 },
    },
  };
}

const PLAYER_ATTACK: AttackParams = {
  attackerSide: "player",
  weaponId: "improvised-melee",
  targetId: "alien-1",
};

describe("attackResult", () => {
  test("ok=true with damage when target is adjacent and AP is sufficient", () => {
    const state = withPlayerAdjacent(createRunState());
    const result = attackResult(state, PLAYER_ATTACK);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.damage).toBe(1);
  });

  test("fails with 'out-of-range' when target is non-adjacent", () => {
    const state = createRunState(); // protagonist at (5, 7), enemy at (5, 11) — distance 4
    const result = attackResult(state, PLAYER_ATTACK);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("out-of-range");
  });

  test("fails with 'insufficient-ap' when attacker has < apCost", () => {
    const state: RunState = {
      ...withPlayerAdjacent(createRunState()),
      protagonist: {
        ...createRunState().protagonist,
        position: { col: 5, row: 10 },
        currentAP: 1, // less than ATTACK_AP_COST = 2
      },
    };
    const result = attackResult(state, PLAYER_ATTACK);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("insufficient-ap");
  });

  test("fails with 'no-target' when targetId doesn't resolve to an enemy or 'protagonist'", () => {
    const state = withPlayerAdjacent(createRunState());
    const result = attackResult(state, {
      attackerSide: "player",
      weaponId: "improvised-melee",
      targetId: "no-such-id",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("no-target");
  });

  test("fails with 'no-weapon' for an unknown weapon id", () => {
    const state = withPlayerAdjacent(createRunState());
    const result = attackResult(state, {
      attackerSide: "player",
      weaponId: "no-such-weapon",
      targetId: "alien-1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("no-weapon");
  });

  test("enemy attacker can target the protagonist when adjacent and AP is sufficient", () => {
    const initial = createRunState();
    // Move protagonist next to the enemy.
    const adjacent = withPlayerAdjacent(initial);
    // Enemies need enemy turn to have AP refilled (simulate by calling advanceTurn).
    const onEnemyTurn = advanceTurn(adjacent);
    const result = attackResult(onEnemyTurn, {
      attackerSide: "enemy",
      attackerId: "alien-1",
      weaponId: "improvised-melee",
      targetId: "protagonist",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.damage).toBe(1);
  });
});

describe("commitAttack", () => {
  test("happy path: target HP decremented, attacker AP decremented, killed=false on survival", () => {
    const state = withPlayerAdjacent(createRunState());
    const result = commitAttack(state, PLAYER_ATTACK);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.killed).toBe(false);
    expect(result.damage).toBe(1);
    const targetAfter = result.state.enemies[0];
    expect(targetAfter.currentHP).toBe(balance.ENEMY_HP - 1);
    expect(result.state.protagonist.currentAP).toBe(
      balance.MAX_AP - balance.ATTACK_AP_COST,
    );
  });

  test("killing blow: target removed from state.enemies, killed=true", () => {
    let state = withPlayerAdjacent(createRunState());
    // Drain enemy HP to 1 so the next hit kills.
    state = {
      ...state,
      enemies: state.enemies.map((e) => ({ ...e, currentHP: 1 })),
    };
    const result = commitAttack(state, PLAYER_ATTACK);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.killed).toBe(true);
    expect(result.state.enemies).toHaveLength(0);
  });

  test("input state is left unchanged (immutable)", () => {
    const state = withPlayerAdjacent(createRunState());
    const beforeEnemyHP = state.enemies[0].currentHP;
    const beforePlayerAP = state.protagonist.currentAP;
    commitAttack(state, PLAYER_ATTACK);
    expect(state.enemies[0].currentHP).toBe(beforeEnemyHP);
    expect(state.protagonist.currentAP).toBe(beforePlayerAP);
  });

  test("rejects with insufficient-ap; state unchanged", () => {
    const state: RunState = {
      ...withPlayerAdjacent(createRunState()),
      protagonist: {
        ...createRunState().protagonist,
        position: { col: 5, row: 10 },
        currentAP: 0,
      },
    };
    const result = commitAttack(state, PLAYER_ATTACK);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("insufficient-ap");
  });

  test("enemy attack: protagonist HP decremented; killed=true if HP would drop to 0", () => {
    const initial = createRunState();
    const adjacent = withPlayerAdjacent(initial);
    let state = advanceTurn(adjacent); // enemy turn, enemy AP refilled
    // Drain protagonist HP to 1 so the attack kills.
    state = {
      ...state,
      protagonist: { ...state.protagonist, currentHP: 1 },
    };
    const result = commitAttack(state, {
      attackerSide: "enemy",
      attackerId: "alien-1",
      weaponId: "improvised-melee",
      targetId: "protagonist",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.killed).toBe(true);
    expect(result.state.protagonist.currentHP).toBeLessThanOrEqual(0);
  });
});
