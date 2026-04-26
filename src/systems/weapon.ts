/**
 * Weapon definitions and lookup.
 *
 * Spec 0004 only instantiates one weapon (improvised-melee). Pistol and
 * shotgun are reserved for later specs (when ranged combat or trait
 * loadouts arrive). The shape is a plain record loaded from JSON.
 */

import weaponsJson from "../data/weapons.json";

export interface Weapon {
  id: string;
  name: string;
  /** Damage dealt to a target on a successful hit. */
  damage: number;
  /** Manhattan tile range (1 = adjacent only). */
  range: number;
  /** AP cost to commit one attack. */
  apCost: number;
}

let cached: Weapon[] | null = null;

/** All weapons defined in `data/weapons.json`. Cached after first call. */
export function loadWeapons(): Weapon[] {
  if (cached !== null) return cached;
  cached = weaponsJson.map((raw) => ({
    id: raw.id,
    name: raw.name,
    damage: raw.damage,
    range: raw.range,
    apCost: raw.apCost,
  }));
  return cached;
}

/** Look up a weapon by id; returns `null` for unknown ids. */
export function getWeapon(id: string): Weapon | null {
  return loadWeapons().find((w) => w.id === id) ?? null;
}
