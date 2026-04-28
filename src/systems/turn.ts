/**
 * Turn execution — enemy AI step / act / run-to-completion.
 *
 * - `enemyStep` is the **move-only** primitive: walks one tile along the
 *   BFS path toward the protagonist, or returns `moved: false`.
 * - `enemyAct` is the **decision** layer (spec 0004+): if the enemy can
 *   attack (adjacent + AP ≥ weapon.apCost), it commits the attack;
 *   otherwise it falls back to `enemyStep`. Returns a tagged-union so
 *   the scene knows whether to play a hit-flash or a move-tween.
 * - `runEnemyTurn` loops `enemyAct` per enemy until each is idle.
 */

import { commitAttack } from "./combat";
import type { TilePos } from "./grid";
import { hasLoS } from "./los";
import { bfs } from "./pathfind";
import type { RunState } from "./run-state";

export interface EnemyStepResult {
  state: RunState;
  moved: boolean;
}

export type EnemyActResult =
  | {
      kind: "attacked";
      state: RunState;
      attackerId: string;
      damage: number;
      killed: boolean;
    }
  | {
      kind: "moved";
      state: RunState;
      enemyId: string;
      from: TilePos;
      to: TilePos;
    }
  | { kind: "idle"; state: RunState; enemyId: string };

function tilesOfOtherEnemies(state: RunState, exceptId: string): TilePos[] {
  return state.enemies.filter((e) => e.id !== exceptId).map((e) => e.position);
}

/**
 * Advance one enemy by at most one tile toward the protagonist (move-only).
 *
 * Returns `moved: false` when the enemy can't or shouldn't move:
 * - Unknown enemyId.
 * - Enemy has 0 AP.
 * - Enemy is already adjacent to the protagonist (path length 2).
 * - No path exists.
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
 * Spec 0012: step a ranged enemy one tile toward the *nearest reachable
 * walkable tile that has LoS to the protagonist*. Falls back to
 * `moved: false` when no LoS-bearing tile is reachable — the caller
 * (`enemyAct`) then drops to `enemyStep` so the alien still closes.
 *
 * The BFS expands from the enemy's tile, checking each newly-visited
 * tile for LoS to the player; the first hit (BFS = shortest path)
 * wins. `cameFrom` is then walked backward to find the first step.
 */
function enemyStepTowardLoS(state: RunState, enemyId: string): EnemyStepResult {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return { state, moved: false };
  if (enemy.currentAP <= 0) return { state, moved: false };

  const blocked = tilesOfOtherEnemies(state, enemyId);
  const player = state.protagonist.position;
  const map = state.map;
  const width = map.width;
  const height = map.height;
  const startKey = `${enemy.position.col},${enemy.position.row}`;
  const visited = new Set<string>([startKey]);
  const cameFrom = new Map<string, TilePos>();
  const queue: TilePos[] = [enemy.position];
  let target: TilePos | null = null;

  while (queue.length > 0) {
    const cur = queue.shift() as TilePos;
    if (!(cur.col === enemy.position.col && cur.row === enemy.position.row)) {
      if (hasLoS(cur, player, map)) {
        target = cur;
        break;
      }
    }
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next: TilePos = { col: cur.col + dc, row: cur.row + dr };
      if (
        next.col < 0 ||
        next.col >= width ||
        next.row < 0 ||
        next.row >= height
      )
        continue;
      const k = `${next.col},${next.row}`;
      if (visited.has(k)) continue;
      const tile = map.tiles[next.row][next.col];
      if (tile.kind !== "floor" && tile.kind !== "exit") continue;
      if (next.col === player.col && next.row === player.row) continue;
      if (blocked.some((b) => b.col === next.col && b.row === next.row))
        continue;
      visited.add(k);
      cameFrom.set(k, cur);
      queue.push(next);
    }
  }

  if (!target) return { state, moved: false };

  // Walk cameFrom from `target` back to the enemy; the tile whose parent
  // is the enemy is the first step.
  let cursor: TilePos = target;
  let prev: TilePos = target;
  while (
    !(cursor.col === enemy.position.col && cursor.row === enemy.position.row)
  ) {
    prev = cursor;
    const parent = cameFrom.get(`${cursor.col},${cursor.row}`);
    if (!parent) return { state, moved: false };
    cursor = parent;
  }

  return {
    state: {
      ...state,
      enemies: state.enemies.map((e) =>
        e.id === enemyId
          ? { ...e, position: prev, currentAP: e.currentAP - 1 }
          : e,
      ),
    },
    moved: true,
  };
}

/**
 * Decide and apply one enemy action: attack if adjacent + AP-sufficient,
 * else move one tile, else idle.
 *
 * Returns the new state plus a `kind` discriminator so callers (the scene)
 * can react: animate a hit flash for `"attacked"`, animate a sprite move
 * for `"moved"`, advance to the next enemy for `"idle"`.
 */
export function enemyAct(state: RunState, enemyId: string): EnemyActResult {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return { kind: "idle", state, enemyId };
  if (enemy.currentAP <= 0) return { kind: "idle", state, enemyId };

  // Try attack first.
  const attack = commitAttack(state, {
    attackerSide: "enemy",
    attackerId: enemyId,
    weaponId: enemy.weaponId,
    targetId: "protagonist",
  });
  if (attack.ok) {
    return {
      kind: "attacked",
      state: attack.state,
      attackerId: enemyId,
      damage: attack.damage,
      killed: attack.killed,
    };
  }

  // Else try a move step. Spec 0012: ranged enemies prefer to move
  // toward the nearest LoS tile so they can shoot next turn; if no
  // LoS tile is reachable (boxed in), fall back to "step toward
  // player" so they still close. Melees use the existing chase.
  let stepResult = { state, moved: false };
  if (enemy.kind === "ranged") {
    stepResult = enemyStepTowardLoS(state, enemyId);
  }
  if (!stepResult.moved) {
    stepResult = enemyStep(state, enemyId);
  }
  if (stepResult.moved) {
    const moved = stepResult.state.enemies.find((e) => e.id === enemyId);
    return {
      kind: "moved",
      state: stepResult.state,
      enemyId,
      from: enemy.position,
      to: moved?.position ?? enemy.position,
    };
  }

  return { kind: "idle", state, enemyId };
}

/**
 * Run every enemy's full turn to completion.
 *
 * For each enemy in order, call `enemyAct` repeatedly until the enemy is
 * idle. Returns the final state. Stops early if the protagonist's HP
 * drops to 0 — no more enemies should act after the player has died.
 *
 * The scene typically calls `enemyAct` itself in a loop with a per-step
 * delay so that moves and attacks are visible. `runEnemyTurn` is the
 * headless equivalent.
 */
export function runEnemyTurn(state: RunState): RunState {
  let current = state;
  for (const enemy of state.enemies) {
    while (true) {
      if (current.protagonist.currentHP <= 0) return current;
      const result = enemyAct(current, enemy.id);
      if (result.kind === "idle") break;
      current = result.state;
    }
  }
  return current;
}
