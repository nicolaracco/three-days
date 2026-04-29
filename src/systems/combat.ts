/**
 * Combat — pure compute (`attackResult`) and pure reducer (`commitAttack`).
 *
 * Spec 0004 covers melee only. Hit chance is implicitly "certain" (no
 * cover, no qualitative tells UI yet — both land in spec 0005). On hit,
 * the target loses `weapon.damage` HP; on a killing blow the target is
 * removed from `state.enemies` (or, for the protagonist, simply has
 * HP ≤ 0 and the scene shows the death overlay).
 *
 * Spec 0012 adds an LoS gate for any weapon with `range > 1`. Adjacent
 * (range 1) attacks skip the check — melee through walls is impossible
 * by adjacency anyway, and the LoS algorithm has nothing in-between to
 * inspect.
 */

import type { TilePos } from "./grid";
import { hasLoS } from "./los";
import type { RunState } from "./run-state";
import { getWeapon } from "./weapon";

export interface AttackParams {
  attackerSide: "player" | "enemy";
  /** Required when `attackerSide === "enemy"`; identifies the attacking enemy. */
  attackerId?: string;
  weaponId: string;
  /** `"protagonist"` for player-target, otherwise an enemy id. */
  targetId: string;
}

type AttackFailure = {
  ok: false;
  reason:
    | "out-of-range"
    | "insufficient-ap"
    | "no-weapon"
    | "no-target"
    | "no-line-of-sight";
};

export type AttackResult = { ok: true; damage: number } | AttackFailure;

export type CommitAttackResult =
  | { ok: true; state: RunState; damage: number; killed: boolean }
  | AttackFailure;

interface ResolvedActor {
  position: TilePos;
  currentAP: number;
  currentHP: number;
}

function resolveAttacker(
  state: RunState,
  params: AttackParams,
): ResolvedActor | null {
  if (params.attackerSide === "player") {
    return state.protagonist;
  }
  const enemy = state.enemies.find((e) => e.id === params.attackerId);
  return enemy ?? null;
}

function resolveTarget(
  state: RunState,
  targetId: string,
): ResolvedActor | null {
  if (targetId === "protagonist") return state.protagonist;
  return state.enemies.find((e) => e.id === targetId) ?? null;
}

/** Pure: compute whether `params` describes a valid attack. No state change. */
export function attackResult(
  state: RunState,
  params: AttackParams,
): AttackResult {
  const weapon = getWeapon(params.weaponId);
  if (!weapon) return { ok: false, reason: "no-weapon" };

  const attacker = resolveAttacker(state, params);
  if (!attacker) return { ok: false, reason: "no-target" };

  const target = resolveTarget(state, params.targetId);
  if (!target) return { ok: false, reason: "no-target" };

  if (attacker.currentAP < weapon.apCost) {
    return { ok: false, reason: "insufficient-ap" };
  }

  const dist =
    Math.abs(attacker.position.col - target.position.col) +
    Math.abs(attacker.position.row - target.position.row);
  if (dist === 0 || dist > weapon.range) {
    return { ok: false, reason: "out-of-range" };
  }

  // Spec 0012: ranged weapons (range > 1) need an unobstructed line.
  // Adjacent melee skips the check — adjacency is the only constraint.
  if (
    weapon.range > 1 &&
    !hasLoS(attacker.position, target.position, state.map)
  ) {
    return { ok: false, reason: "no-line-of-sight" };
  }

  return { ok: true, damage: weapon.damage };
}

/**
 * Pure reducer: apply an attack and return a new state.
 *
 * On success: attacker AP -= weapon.apCost; target HP -= weapon.damage.
 * If the target is an enemy and its HP drops to 0 or below, it is removed
 * from `state.enemies` and `killed: true`. If the target is the
 * protagonist and HP drops to 0 or below, HP is left negative for the
 * scene to detect — we do NOT remove the protagonist from state.
 */
export function commitAttack(
  state: RunState,
  params: AttackParams,
): CommitAttackResult {
  const result = attackResult(state, params);
  if (!result.ok) return result;
  const weapon = getWeapon(params.weaponId);
  if (!weapon) return { ok: false, reason: "no-weapon" };

  const damage = result.damage;
  let nextProtagonist = state.protagonist;
  let nextEnemies = state.enemies;
  let killed = false;

  // Attacker AP deduction.
  if (params.attackerSide === "player") {
    nextProtagonist = {
      ...nextProtagonist,
      currentAP: nextProtagonist.currentAP - weapon.apCost,
    };
  } else {
    nextEnemies = nextEnemies.map((e) =>
      e.id === params.attackerId
        ? { ...e, currentAP: e.currentAP - weapon.apCost }
        : e,
    );
  }

  // Target HP application.
  if (params.targetId === "protagonist") {
    const newHP = nextProtagonist.currentHP - damage;
    nextProtagonist = { ...nextProtagonist, currentHP: newHP };
    killed = newHP <= 0;
    // Spec 0013: Hypochondriac arms the once-per-map AP penalty on
    // first damage taken. If already triggered this map, no re-arm.
    if (
      damage > 0 &&
      state.traits.includes("hypochondriac") &&
      !nextProtagonist.hypochondriacTriggeredThisMap
    ) {
      nextProtagonist = {
        ...nextProtagonist,
        hypochondriacPenaltyPending: true,
      };
    }
  } else {
    const targetIndex = nextEnemies.findIndex((e) => e.id === params.targetId);
    if (targetIndex === -1) return { ok: false, reason: "no-target" };
    const target = nextEnemies[targetIndex];
    const newHP = target.currentHP - damage;
    killed = newHP <= 0;
    if (killed) {
      nextEnemies = nextEnemies.filter((e) => e.id !== params.targetId);
    } else {
      nextEnemies = nextEnemies.map((e) =>
        e.id === params.targetId ? { ...e, currentHP: newHP } : e,
      );
    }
  }

  return {
    ok: true,
    state: {
      ...state,
      protagonist: nextProtagonist,
      enemies: nextEnemies,
    },
    damage,
    killed,
  };
}
