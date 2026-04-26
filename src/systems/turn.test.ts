import { test, expect, describe } from "bun:test";
import balance from "../data/balance.json";
import { advanceTurn, createRunState, type RunState } from "./run-state";
import { enemyStep, runEnemyTurn } from "./turn";

/** Helper: get to the start of an enemy turn with all enemies refilled. */
function onEnemyTurn(seed = 1): RunState {
  return advanceTurn(createRunState({ seed }));
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

  test("no-op when already adjacent (path length 2)", () => {
    let state = onEnemyTurn();
    state = withProtagonistRelativeToEnemy(state, 0, -1);
    const before = state.enemies[0];
    const result = runEnemyTurn(state);
    expect(result.enemies[0].position).toEqual(before.position);
    expect(result.enemies[0].currentAP).toBe(before.currentAP); // no AP spent
  });
});
