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
 *
 * Spec 0011 adds the day chain: `currentDay`, `day2MapKey`, and `runEnd`,
 * plus the `transitionToDay2` and `checkRunEnd` reducers. Day-2 maps are
 * handcrafted and reuse the `Day1Map` shape — the slight name mismatch
 * is deliberate scope discipline.
 */

import balance from "../data/balance.json";
import { type Enemy, loadDay1Enemies } from "./enemy";
import type { TilePos } from "./grid";
import { type Inventory, type Item, EMPTY_INVENTORY } from "./item";
import {
  type Day1Map,
  type Day2MapKey,
  type ExitType,
  loadDay2Map,
} from "./map";
import { bfs } from "./pathfind";
import { generateMap } from "./procgen";
import { createRng, type Rng } from "./rng";

export type ActiveTurn = "player" | "enemy";

/**
 * Spec 0011 — terminal run state. `null` while the run is in progress;
 * non-null once a win or loss condition has fired. The scene reads this
 * to lock input and render the run-end overlay.
 */
export type RunEnd =
  | { kind: "won"; reason: "commander-dead" | "survived" }
  | { kind: "lost"; reason: "killed" };

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
  /** Spec 0011 — `1` for procgen Day-1, `2` after `transitionToDay2`. */
  currentDay: 1 | 2;
  /** Spec 0011 — set when the day chain fires; `null` on Day 1. */
  day2MapKey: Day2MapKey | null;
  /** Spec 0011 — set by `checkRunEnd` once a win/loss bit is decided. */
  runEnd: RunEnd | null;
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
    currentDay: 1,
    day2MapKey: null,
    runEnd: null,
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

// ----- Day chain (spec 0011) -----

/**
 * Transition the run from Day 1 to Day 2. The protagonist's HP and
 * inventory carry forward; the map, enemies, items, and turn counter
 * reset to the Day-2 authored data. Pure: returns a fresh `RunState`.
 *
 * Caller guarantees `state.currentDay === 1` and the player has just
 * stepped onto an exit tile of `exitType`. Defensive checks live in
 * the scene, not here — the reducer trusts its input shape.
 */
export function transitionToDay2(
  state: RunState,
  exitType: ExitType,
): RunState {
  const key: Day2MapKey = exitType === "stairwell" ? "lobby" : "rooftop";
  const bundle = loadDay2Map(key);
  return {
    ...state,
    map: bundle.map,
    enemies: bundle.enemies,
    itemsOnMap: bundle.map.itemsOnMap.slice(),
    activeTurn: "player",
    turn: 1,
    currentDay: 2,
    day2MapKey: key,
    runEnd: null,
    protagonist: {
      ...state.protagonist,
      position: bundle.map.start,
      currentAP: state.protagonist.maxAP,
      // currentHP and inventory carry forward — players keep what they earned.
    },
  };
}

/**
 * Compute the run's terminal state. Idempotent — once `state.runEnd`
 * is set, subsequent calls return the input unchanged. The scene calls
 * this after every state mutation that could change a win/loss bit
 * (post-attack, post-enemy-turn, post-transition, post-medkit, etc.).
 *
 * Win conditions:
 *   - Day 2 lobby: `commander-dead` once no enemy with `isCommander`
 *     remains.
 *   - Day 2 rooftop: `survived` once `turn >= ROOFTOP_SURVIVE_TURNS`
 *     and the protagonist is alive.
 *
 * Loss condition (any day): `killed` once `currentHP <= 0`.
 *
 * Day 1 has no win condition — reaching an exit fires `transitionToDay2`,
 * not a win. So Day-1 returns either `lost` (HP <= 0) or unchanged.
 */
export function checkRunEnd(state: RunState): RunState {
  if (state.runEnd !== null) return state;
  if (state.protagonist.currentHP <= 0) {
    return { ...state, runEnd: { kind: "lost", reason: "killed" } };
  }
  if (state.currentDay === 2 && state.day2MapKey === "lobby") {
    const commanderAlive = state.enemies.some(
      (e) => e.isCommander && e.currentHP > 0,
    );
    if (!commanderAlive) {
      return { ...state, runEnd: { kind: "won", reason: "commander-dead" } };
    }
  }
  if (state.currentDay === 2 && state.day2MapKey === "rooftop") {
    // turn=1 at start of turn 1; advanceTurn (enemy→player) increments
    // turn, so turn=N+1 means N full cycles completed. The win fires at
    // start of turn (ROOFTOP_SURVIVE_TURNS + 1) — i.e. the player has
    // survived the full N-th turn.
    if (state.turn > balance.ROOFTOP_SURVIVE_TURNS) {
      return { ...state, runEnd: { kind: "won", reason: "survived" } };
    }
  }
  return state;
}
