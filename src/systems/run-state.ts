/**
 * RunState — the player's run-in-progress. Pure reducers; no Phaser.
 *
 * Spec 0003 adds `enemies` and `activeTurn`. The `endTurn` reducer from
 * spec 0002 is generalized into `advanceTurn`, which transitions the cycle
 * in either direction based on the current `activeTurn`.
 *
 * Spec 0010 adds `protagonist.inventory` and `itemsOnMap`, and exposes
 * `useMedkit` / `useFlashbang` reducers that mutate them along with AP
 * and HP.
 */

import balance from "../data/balance.json";
import { type Enemy, loadDay1Enemies } from "./enemy";
import type { TilePos } from "./grid";
import { type Inventory, type Item, EMPTY_INVENTORY } from "./item";
import type { Day1Map } from "./map";
import { bfs } from "./pathfind";
import { generateMap } from "./procgen";
import { createRng, type Rng } from "./rng";

export type ActiveTurn = "player" | "enemy";

export interface RunState {
  protagonist: {
    position: TilePos;
    currentAP: number;
    maxAP: number;
    currentHP: number;
    maxHP: number;
    weaponId: string;
    inventory: Inventory;
  };
  enemies: Enemy[];
  itemsOnMap: Item[];
  activeTurn: ActiveTurn;
  map: Day1Map;
  seed: number;
  turn: number;
}

/**
 * Tagged-union result for `commitMove`. Pure functional error handling.
 *
 * On success, `path` is the BFS-shortest tile sequence from the
 * protagonist's pre-move position to `target`, inclusive of both
 * endpoints. The scene uses it to animate the move tile-by-tile;
 * its length minus one equals the AP cost spent.
 */
export type CommitMoveResult =
  | { ok: true; state: RunState; path: TilePos[] }
  | { ok: false; reason: "insufficient-ap" | "off-map" };

/**
 * Build a fresh `RunState` from an explicit `map` and `enemies`.
 *
 * Used by tests (which want shape-stable assertions against a fixture map)
 * and by `createRunState` (which produces the runtime procgen map and
 * delegates here for the rest of the state shape).
 */
export function createRunStateFromMap(opts: {
  seed: number;
  map: Day1Map;
  enemies?: Enemy[];
  itemsOnMap?: Item[];
}): RunState {
  return {
    protagonist: {
      position: opts.map.start,
      currentAP: balance.MAX_AP,
      maxAP: balance.MAX_AP,
      currentHP: balance.PROTAGONIST_HP,
      maxHP: balance.PROTAGONIST_HP,
      weaponId: "improvised-melee",
      inventory: { ...EMPTY_INVENTORY },
    },
    enemies: opts.enemies ?? loadDay1Enemies(),
    itemsOnMap: opts.itemsOnMap ?? opts.map.itemsOnMap.slice(),
    activeTurn: "player",
    map: opts.map,
    seed: opts.seed,
    turn: 1,
  };
}

/**
 * Build a fresh `RunState` for a new run via procgen. Deterministic given
 * the seed: same seed produces the same map and enemy positions. The
 * runtime entry point — used by `RunScene.create`.
 */
export function createRunState(opts: { seed: number }): RunState {
  const rng = createRng(opts.seed);
  const map = generateMap(rng);
  const enemies = assignSpawnSlots(loadDay1Enemies(), map, rng);
  return createRunStateFromMap({ seed: opts.seed, map, enemies });
}

/**
 * Assign each base enemy to a chunk-authored spawn slot, picking without
 * replacement via the same RNG that produced the map. The number of base
 * enemies must not exceed `map.spawnSlots.length`.
 */
function assignSpawnSlots(
  baseEnemies: readonly Enemy[],
  map: Day1Map,
  rng: Rng,
): Enemy[] {
  if (map.spawnSlots.length < baseEnemies.length) {
    throw new Error(
      `assignSpawnSlots: map has ${map.spawnSlots.length} spawn slots but ${baseEnemies.length} enemies need placement`,
    );
  }
  const available = [...map.spawnSlots];
  return baseEnemies.map((e) => {
    const idx = rng.intInRange(0, available.length);
    const pos = available[idx];
    available.splice(idx, 1);
    return { ...e, position: pos };
  });
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
 * success along with the BFS path the protagonist traversed; the input
 * state is left unchanged. Returns a tagged error result on failure.
 *
 * Enemy tiles are treated as blocked. Cost is BFS path length, so a
 * detour around an enemy correctly bills more AP than the Manhattan
 * straight line would suggest.
 */
export function commitMove(state: RunState, target: TilePos): CommitMoveResult {
  const blocked = enemyTiles(state);
  // Off-map?
  if (
    target.col < 0 ||
    target.col >= state.map.width ||
    target.row < 0 ||
    target.row >= state.map.height
  ) {
    return { ok: false, reason: "off-map" };
  }
  // Target on an enemy or otherwise blocked?
  if (blocked.some((b) => b.col === target.col && b.row === target.row)) {
    return { ok: false, reason: "off-map" };
  }
  // Path exists?
  const path = bfs(state.protagonist.position, target, state.map, blocked);
  if (path === null) {
    return { ok: false, reason: "off-map" };
  }
  const cost = path.length - 1;
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
    path,
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

// ----- Items (spec 0010) -----

/**
 * Tagged result for `useMedkit` / `useFlashbang`. The reasons are
 * disjoint per item:
 *   - `useMedkit`: `"no-item" | "insufficient-ap" | "at-full-hp"`
 *   - `useFlashbang`: `"no-item" | "insufficient-ap"`
 *
 * Captured in a single union for ergonomics; callers narrow on `ok`
 * and on the specific reason as needed.
 */
export type UseItemResult =
  | { ok: true; state: RunState; stunned: number }
  | { ok: false; reason: "no-item" | "insufficient-ap" | "at-full-hp" };

/**
 * Heal the protagonist by `ITEM_MEDKIT_HEAL` (capped at `maxHP`),
 * decrement `inventory.medkit`, decrement `currentAP`. Rejects if no
 * medkit, no AP, or already at full HP (per spec 0010 open-question
 * resolution: at-full-hp use is a no-op rejection, not a wasted item).
 */
export function useMedkit(state: RunState): UseItemResult {
  const p = state.protagonist;
  if (p.inventory.medkit <= 0) return { ok: false, reason: "no-item" };
  if (p.currentAP < balance.USE_ITEM_AP_COST) {
    return { ok: false, reason: "insufficient-ap" };
  }
  if (p.currentHP >= p.maxHP) return { ok: false, reason: "at-full-hp" };
  const nextHP = Math.min(p.maxHP, p.currentHP + balance.ITEM_MEDKIT_HEAL);
  return {
    ok: true,
    stunned: 0,
    state: {
      ...state,
      protagonist: {
        ...p,
        currentHP: nextHP,
        currentAP: p.currentAP - balance.USE_ITEM_AP_COST,
        inventory: { ...p.inventory, medkit: p.inventory.medkit - 1 },
      },
    },
  };
}

/**
 * Stun every enemy in the protagonist's 4-neighborhood for one enemy
 * turn (`stunnedTurns = 1`). Decrement `inventory.flashbang` and
 * `currentAP` even if no enemies were adjacent — the player chose to
 * spend; the wasted-bang feedback is the scene's concern (spec 0010).
 */
export function useFlashbang(state: RunState): UseItemResult {
  const p = state.protagonist;
  if (p.inventory.flashbang <= 0) return { ok: false, reason: "no-item" };
  if (p.currentAP < balance.USE_ITEM_AP_COST) {
    return { ok: false, reason: "insufficient-ap" };
  }
  let stunnedCount = 0;
  const nextEnemies = state.enemies.map((e) => {
    const dx = Math.abs(e.position.col - p.position.col);
    const dy = Math.abs(e.position.row - p.position.row);
    if (dx + dy === 1) {
      stunnedCount++;
      return { ...e, stunnedTurns: 1 };
    }
    return e;
  });
  return {
    ok: true,
    stunned: stunnedCount,
    state: {
      ...state,
      enemies: nextEnemies,
      protagonist: {
        ...p,
        currentAP: p.currentAP - balance.USE_ITEM_AP_COST,
        inventory: { ...p.inventory, flashbang: p.inventory.flashbang - 1 },
      },
    },
  };
}
