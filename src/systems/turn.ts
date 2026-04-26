/**
 * Turn execution — enemy AI step / run-to-completion.
 *
 * Spec 0003 only covers movement: each enemy walks toward the protagonist
 * along its BFS path, one tile at a time, stopping adjacent (no attack —
 * combat lands in spec 0004+) or when AP runs out.
 *
 * `enemyStep` advances one enemy by one tile (used by the scene to
 * animate moves with a per-step delay). `runEnemyTurn` runs all enemies
 * to completion in one go (used in tests and headless contexts).
 */

import type { TilePos } from "./grid";
import { bfs } from "./pathfind";
import type { RunState } from "./run-state";

export interface EnemyStepResult {
  state: RunState;
  moved: boolean;
}

function tilesOfOtherEnemies(state: RunState, exceptId: string): TilePos[] {
  return state.enemies.filter((e) => e.id !== exceptId).map((e) => e.position);
}

/**
 * Advance one enemy by at most one tile toward the protagonist.
 *
 * Returns `moved: false` when the enemy can't or shouldn't act:
 * - Unknown enemyId.
 * - Enemy has 0 AP.
 * - Enemy is already adjacent to the protagonist (path length 2).
 * - No path exists (e.g. fully blocked by other enemies).
 *
 * Returns a fresh `RunState` with the enemy moved one tile and its AP
 * decremented otherwise. The input state is left unchanged.
 */
export function enemyStep(state: RunState, enemyId: string): EnemyStepResult {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return { state, moved: false };
  if (enemy.currentAP <= 0) return { state, moved: false };

  const blocked = tilesOfOtherEnemies(state, enemyId);
  const path = bfs(
    enemy.position,
    state.protagonist.position,
    state.map,
    blocked,
  );
  if (!path || path.length <= 2) {
    // path === null: unreachable. path.length === 1: enemy on protagonist (impossible).
    // path.length === 2: already adjacent — don't step (would land on protagonist).
    return { state, moved: false };
  }

  const nextStep = path[1];
  return {
    state: {
      ...state,
      enemies: state.enemies.map((e) =>
        e.id === enemyId
          ? { ...e, position: nextStep, currentAP: e.currentAP - 1 }
          : e,
      ),
    },
    moved: true,
  };
}

/**
 * Run every enemy's full turn to completion.
 *
 * For each enemy in order, call `enemyStep` repeatedly until the enemy
 * stops (adjacent, no AP, or no path). Returns the final state.
 *
 * The scene typically prefers calling `enemyStep` itself in a loop with
 * a per-step delay so that moves are visible. `runEnemyTurn` is the
 * headless equivalent — used in tests and for any future "fast-forward"
 * mode.
 */
export function runEnemyTurn(state: RunState): RunState {
  let current = state;
  for (const enemy of state.enemies) {
    while (true) {
      const result = enemyStep(current, enemy.id);
      if (!result.moved) break;
      current = result.state;
    }
  }
  return current;
}
