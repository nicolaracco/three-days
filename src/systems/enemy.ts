/**
 * Enemy data — tagged union over `kind` ("melee" | "ranged") + spawn
 * loader.
 *
 * Spec 0003 only instantiates `melee`; `ranged` is reserved so future specs
 * (e.g. Day-2 rooftop encounters) don't reshape the union. Spec 0004 adds
 * HP fields and a `weaponId` so combat (`systems/combat.ts`) has a target.
 * Spec 0007 introduces chunk-authored spawn slots: `assignSpawnSlots` in
 * `systems/run-state.ts` is now the placement entry point, replacing the
 * spec-0006 runtime `placeEnemiesOnMap` mitigation.
 */

import balance from "../data/balance.json";
import day1Enemies from "../data/day1-static-enemies.json";
import type { TilePos } from "./grid";

export type EnemyKind = "melee" | "ranged";

export interface Enemy {
  id: string;
  kind: EnemyKind;
  position: TilePos;
  currentAP: number;
  maxAP: number;
  currentHP: number;
  maxHP: number;
  weaponId: string;
  /**
   * Spec 0010 — turns the enemy will be skipped during the enemy turn.
   * Decremented once per skip; zero means "act normally." Initialized
   * to 0 by `loadDay1Enemies`.
   */
  stunnedTurns: number;
}

/**
 * Lift the static spawn JSON into typed `Enemy` instances at full AP and
 * full HP, with the weapon id from the JSON entry.
 */
export function loadDay1Enemies(): Enemy[] {
  return day1Enemies.map((raw) => {
    const kind = raw.kind;
    if (kind !== "melee" && kind !== "ranged") {
      throw new Error(
        `Unknown enemy kind in day1-static-enemies.json: ${kind}`,
      );
    }
    return {
      id: raw.id,
      kind,
      position: raw.position,
      currentAP: balance.ENEMY_MAX_AP,
      maxAP: balance.ENEMY_MAX_AP,
      currentHP: balance.ENEMY_HP,
      maxHP: balance.ENEMY_HP,
      weaponId: raw.weaponId,
      stunnedTurns: 0,
    };
  });
}
