/**
 * RunState — the player's run-in-progress. Pure reducers; no Phaser.
 *
 * Spec 0003 adds `enemies` and `activeTurn`. The `endTurn` reducer from
 * spec 0002 is generalized into `advanceTurn`, which transitions the cycle
 * in either direction based on the current `activeTurn`.
 */

import balance from "../data/balance.json";
import { type Enemy, loadDay1Enemies } from "./enemy";
import type { TilePos } from "./grid";
import { type Day1Map, loadDay1Map } from "./map";
import { apCostToReach } from "./movement";

export type ActiveTurn = "player" | "enemy";

export interface RunState {
  protagonist: {
    position: TilePos;
    currentAP: number;
    maxAP: number;
  };
  enemies: Enemy[];
  activeTurn: ActiveTurn;
  map: Day1Map;
  seed: number;
  turn: number;
}

/** Tagged-union result for `commitMove`. Pure functional error handling. */
export type CommitMoveResult =
  | { ok: true; state: RunState }
  | { ok: false; reason: "insufficient-ap" | "off-map" };

/** Build a fresh `RunState` for a new run. Deterministic given the seed. */
export function createRunState(opts: { seed: number }): RunState {
  const map = loadDay1Map();
  return {
    protagonist: {
      position: map.start,
      currentAP: balance.MAX_AP,
      maxAP: balance.MAX_AP,
    },
    enemies: loadDay1Enemies(),
    activeTurn: "player",
    map,
    seed: opts.seed,
    turn: 1,
  };
}

/**
 * The set of tiles currently occupied by enemies — used as `blocked` input
 * to movement / pathfinding. Convenience helper to keep callers from
 * recomputing this everywhere.
 */
export function enemyTiles(state: RunState): TilePos[] {
  return state.enemies.map((e) => e.position);
}

/**
 * Move the protagonist to `target`, deducting AP. Returns a new state on
 * success; the input state is left unchanged. Returns a tagged error
 * result on failure. Enemy tiles are treated as blocked.
 */
export function commitMove(state: RunState, target: TilePos): CommitMoveResult {
  const cost = apCostToReach(
    state.protagonist.position,
    target,
    state.map,
    enemyTiles(state),
  );
  if (!Number.isFinite(cost)) {
    return { ok: false, reason: "off-map" };
  }
  if (cost > state.protagonist.currentAP) {
    return { ok: false, reason: "insufficient-ap" };
  }
  return {
    ok: true,
    state: {
      ...state,
      protagonist: {
        ...state.protagonist,
        position: target,
        currentAP: state.protagonist.currentAP - cost,
      },
    },
  };
}

/**
 * Advance the turn cycle one step. Direction is determined by
 * `state.activeTurn`:
 *
 * - **player → enemy**: switches active turn; refills each enemy's
 *   `currentAP` to `maxAP` so the AI has a budget to spend.
 * - **enemy → player**: switches active turn; refills the protagonist's
 *   `currentAP` to `maxAP`; increments `state.turn` (one full cycle = one
 *   turn).
 *
 * The scene calls this once when the player presses End Turn, then runs the
 * enemy turn (e.g. via `runEnemyTurn` from `turn.ts`), then calls this
 * again to hand control back.
 */
export function advanceTurn(state: RunState): RunState {
  if (state.activeTurn === "player") {
    return {
      ...state,
      activeTurn: "enemy",
      enemies: state.enemies.map((e) => ({ ...e, currentAP: e.maxAP })),
    };
  }
  return {
    ...state,
    activeTurn: "player",
    turn: state.turn + 1,
    protagonist: {
      ...state.protagonist,
      currentAP: state.protagonist.maxAP,
    },
  };
}
