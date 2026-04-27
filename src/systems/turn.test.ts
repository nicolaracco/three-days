import { test, expect, describe } from "bun:test";
import balance from "../data/balance.json";
import { loadDay1Enemies } from "./enemy";
import { loadDay1Map } from "./map";
import { advanceTurn, createRunStateFromMap, type RunState } from "./run-state";
import { enemyAct, enemyStep, runEnemyTurn } from "./turn";

/**
 * Fixture state for tests that need shape-stable assertions.
 * Uses the static 11×15 all-floor map and the static enemy at (5, 11).
 */
function fixtureState(): RunState {
  return createRunStateFromMap({
    seed: 1,
    map: loadDay1Map(),
    enemies: loadDay1Enemies(),
  });
}

/** Helper: get to the start of an enemy turn with all enemies refilled. */
function onEnemyTurn(): RunState {
  return advanceTurn(fixtureState());
}

/** Helper: place the protagonist `n` tiles north of the (single) enemy. */
function withProtagonistRelativeToEnemy(
  state: RunState,
  dCol: number,
  dRow: number,
): RunState {
  const e = state.enemies[0];
  return {
    ...state,
    protagonist: {
      ...state.protagonist,
      position: { col: e.position.col + dCol, row: e.position.row + dRow },
    },
  };
}

describe("enemyStep", () => {
  test("moves the enemy one tile toward the protagonist when path > 2", () => {
    let state = onEnemyTurn();
    state = withProtagonistRelativeToEnemy(state, 0, -3); // 3 north
    const enemy = state.enemies[0];
    const startAP = enemy.currentAP;
    const startPos = enemy.position;
    const result = enemyStep(state, enemy.id);
    expect(result.moved).toBe(true);
    const moved = result.state.enemies[0];
    // One tile closer (north)
    expect(moved.position).toEqual({
      col: startPos.col,
      row: startPos.row - 1,
    });
    expect(moved.currentAP).toBe(startAP - 1);
  });

  test("returns moved=false when the enemy is already adjacent", () => {
    let state = onEnemyTurn();
    state = withProtagonistRelativeToEnemy(state, 0, -1); // adjacent north
    const enemy = state.enemies[0];
    const result = enemyStep(state, enemy.id);
    expect(result.moved).toBe(false);
    expect(result.state).toEqual(state);
  });

  test("returns moved=false when the enemy has 0 AP", () => {
    let state = onEnemyTurn();
    state = withProtagonistRelativeToEnemy(state, 0, -3);
    state = {
      ...state,
      enemies: state.enemies.map((e) => ({ ...e, currentAP: 0 })),
    };
    const result = enemyStep(state, state.enemies[0].id);
    expect(result.moved).toBe(false);
  });

  test("returns moved=false for an unknown enemyId", () => {
    const state = onEnemyTurn();
    const result = enemyStep(state, "no-such-id");
    expect(result.moved).toBe(false);
  });
});

describe("runEnemyTurn", () => {
  test("moves the enemy along its BFS path toward the protagonist", () => {
    let state = onEnemyTurn();
    state = withProtagonistRelativeToEnemy(state, 0, -10); // 10 north — far
    const enemy0 = state.enemies[0];
    const startPos = enemy0.position;
    const result = runEnemyTurn(state);
    const moved = result.enemies[0];
    // Enemy should have advanced 3 tiles north (limited by maxAP = 3).
    expect(moved.position).toEqual({
      col: startPos.col,
      row: startPos.row - balance.ENEMY_MAX_AP,
    });
    expect(moved.currentAP).toBe(0);
  });

  test("stops one tile away from the protagonist (never lands on the protagonist's tile)", () => {
    let state = onEnemyTurn();
    state = withProtagonistRelativeToEnemy(state, 0, -2); // 2 north — one step closes to adjacent
    const result = runEnemyTurn(state);
    const moved = result.enemies[0];
    const protag = result.protagonist.position;
    const dist =
      Math.abs(moved.position.col - protag.col) +
      Math.abs(moved.position.row - protag.row);
    expect(dist).toBe(1); // adjacent
    // Did not land on protagonist tile.
    expect(moved.position).not.toEqual(protag);
  });

  test("stops at AP = 0 even when not yet adjacent", () => {
    let state = onEnemyTurn();
    state = withProtagonistRelativeToEnemy(state, 0, -10);
    const result = runEnemyTurn(state);
    expect(result.enemies[0].currentAP).toBe(0);
    // Still far from protagonist (much further than 1).
    const moved = result.enemies[0];
    const protag = result.protagonist.position;
    const dist =
      Math.abs(moved.position.col - protag.col) +
      Math.abs(moved.position.row - protag.row);
    expect(dist).toBeGreaterThan(1);
  });

  test("attacks the protagonist when starting already adjacent (spec 0004)", () => {
    let state = onEnemyTurn();
    state = withProtagonistRelativeToEnemy(state, 0, -1);
    const beforePos = state.enemies[0].position;
    const beforePlayerHP = state.protagonist.currentHP;
    const result = runEnemyTurn(state);
    // Enemy stayed in place (doesn't need to move) but spent AP on attacks.
    expect(result.enemies[0].position).toEqual(beforePos);
    // Protagonist took at least one hit.
    expect(result.protagonist.currentHP).toBeLessThan(beforePlayerHP);
    // Enemy spent AP on the attack(s); should be < starting maxAP.
    expect(result.enemies[0].currentAP).toBeLessThan(result.enemies[0].maxAP);
  });
});

describe("enemyAct", () => {
  test("attacks when adjacent + AP ≥ apCost", () => {
    let state = onEnemyTurn();
    state = withProtagonistRelativeToEnemy(state, 0, -1);
    const beforeHP = state.protagonist.currentHP;
    const result = enemyAct(state, state.enemies[0].id);
    expect(result.kind).toBe("attacked");
    if (result.kind !== "attacked") throw new Error("unreachable");
    expect(result.state.protagonist.currentHP).toBe(beforeHP - result.damage);
    expect(result.attackerId).toBe(state.enemies[0].id);
  });

  test("moves toward the player when not adjacent", () => {
    let state = onEnemyTurn();
    state = withProtagonistRelativeToEnemy(state, 0, -3);
    const result = enemyAct(state, state.enemies[0].id);
    expect(result.kind).toBe("moved");
    if (result.kind !== "moved") throw new Error("unreachable");
    expect(result.from).toEqual(state.enemies[0].position);
    expect(result.to).not.toEqual(state.enemies[0].position);
  });

  test("idle when adjacent but AP < apCost (can't attack and can't usefully move)", () => {
    let state = onEnemyTurn();
    state = withProtagonistRelativeToEnemy(state, 0, -1);
    state = {
      ...state,
      enemies: state.enemies.map((e) => ({ ...e, currentAP: 1 })),
    };
    const result = enemyAct(state, state.enemies[0].id);
    expect(result.kind).toBe("idle");
  });

  test("idle when AP = 0", () => {
    let state = onEnemyTurn();
    state = withProtagonistRelativeToEnemy(state, 0, -3);
    state = {
      ...state,
      enemies: state.enemies.map((e) => ({ ...e, currentAP: 0 })),
    };
    const result = enemyAct(state, state.enemies[0].id);
    expect(result.kind).toBe("idle");
  });

  test("idle for an unknown enemyId", () => {
    const state = onEnemyTurn();
    const result = enemyAct(state, "no-such-id");
    expect(result.kind).toBe("idle");
  });
});
