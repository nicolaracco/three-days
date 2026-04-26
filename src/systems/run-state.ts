/**
 * RunState — the player's run-in-progress. Pure reducers; no Phaser.
 *
 * Spec 0002 minimum: protagonist position + AP + map + seed + turn.
 * Future specs add enemies, inventory, run history, etc.
 */

import balance from "../data/balance.json";
import type { TilePos } from "./grid";
import { type Day1Map, loadDay1Map } from "./map";
import { apCostToReach } from "./movement";

export interface RunState {
  protagonist: {
    position: TilePos;
    currentAP: number;
    maxAP: number;
  };
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
    map,
    seed: opts.seed,
    turn: 1,
  };
}

/**
 * Move the protagonist to `target`, deducting AP. Returns a new state on
 * success; the input state is left unchanged. Returns a tagged error
 * result on failure.
 */
export function commitMove(state: RunState, target: TilePos): CommitMoveResult {
  const cost = apCostToReach(state.protagonist.position, target, state.map);
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

/** End the current turn: refill AP to max and increment the turn counter. */
export function endTurn(state: RunState): RunState {
  return {
    ...state,
    protagonist: {
      ...state.protagonist,
      currentAP: state.protagonist.maxAP,
    },
    turn: state.turn + 1,
  };
}
