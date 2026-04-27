/**
 * Enemy data — tagged union over `kind` ("melee" | "ranged"), spawn loader,
 * and a procgen-aware placement helper.
 *
 * Spec 0003 only instantiates `melee`; `ranged` is reserved so future specs
 * (e.g. Day-2 rooftop encounters) don't reshape the union. Spec 0004 adds
 * HP fields and a `weaponId` so combat (`systems/combat.ts`) has a target.
 * Spec 0006 adds `placeEnemiesOnMap` — chooses a random valid floor tile in
 * the back half of a procgen map for each enemy. Spec 0007 will move spawn
 * positions into chunk metadata; this function is a runtime mitigation
 * that lets the loaded `day1-static-enemies.json` survive the procgen swap.
 */

import balance from "../data/balance.json";
import day1Enemies from "../data/day1-static-enemies.json";
import type { TilePos } from "./grid";
import type { Day1Map } from "./map";
import type { Rng } from "./rng";

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
    };
  });
}

/**
 * Re-position each base enemy onto a procgen-aware random floor tile in
 * the back half of `map`, avoiding `map.start` and tiles 4-adjacent to it.
 *
 * Other enemy fields (id, kind, AP, HP, weaponId) are preserved. Two
 * enemies in the same call may end up on the same tile (acceptable for
 * the spec-0006 single-enemy case; multi-enemy uniqueness lands with
 * spawn slots in spec 0007).
 *
 * Throws if no eligible tile exists — defensive; the spec-0006 chunk
 * library is hand-authored so this never fires in practice.
 */
export function placeEnemiesOnMap(
  baseEnemies: readonly Enemy[],
  map: Day1Map,
  rng: Rng,
): Enemy[] {
  const eligible: TilePos[] = [];
  const backHalfStart = Math.ceil(map.height / 2);
  for (let row = backHalfStart; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.tiles[row][col].kind !== "floor") continue;
      const dist =
        Math.abs(col - map.start.col) + Math.abs(row - map.start.row);
      if (dist <= 1) continue;
      eligible.push({ col, row });
    }
  }
  if (eligible.length === 0) {
    throw new Error(
      `placeEnemiesOnMap: no eligible floor tile in the back half of the map`,
    );
  }
  return baseEnemies.map((e) => ({ ...e, position: rng.pickOne(eligible) }));
}
