/**
 * Enemy data — tagged union over `kind` ("melee" | "ranged"), spawn loader.
 *
 * Spec 0003 only instantiates `melee`; `ranged` is reserved so future specs
 * (e.g. Day-2 rooftop encounters) don't reshape the union.
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
}

/** Lift the static spawn JSON into typed `Enemy` instances at full AP. */
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
    };
  });
}
