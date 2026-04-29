/**
 * Trait pool (spec 0013).
 *
 * Five traits per GDD §6.2; the player picks two at run start. The
 * loader is cached and validates that every JSON entry's `id` is in
 * the canonical `TraitId` union — typos turn into runtime errors at
 * boot rather than silent unknown-trait surfaces deeper in.
 */

import traitsJson from "../data/traits.json";

export type TraitId =
  | "athletic"
  | "hypochondriac"
  | "vigilant"
  | "resourceful"
  | "marksman";

export interface Trait {
  id: TraitId;
  name: string;
  description: string;
}

const KNOWN_TRAIT_IDS: ReadonlySet<TraitId> = new Set([
  "athletic",
  "hypochondriac",
  "vigilant",
  "resourceful",
  "marksman",
]);

let cached: Trait[] | null = null;

export function loadTraits(): Trait[] {
  if (cached !== null) return cached;
  cached = traitsJson.map((raw) => {
    const id = raw.id;
    if (!KNOWN_TRAIT_IDS.has(id as TraitId)) {
      throw new Error(`Unknown trait id in traits.json: ${id}`);
    }
    return {
      id: id as TraitId,
      name: raw.name,
      description: raw.description,
    };
  });
  return cached;
}

/** Look up a trait by id; throws on unknown ids (the canonical union). */
export function getTrait(id: TraitId): Trait {
  const t = loadTraits().find((t) => t.id === id);
  if (!t) throw new Error(`Trait not found: ${id}`);
  return t;
}
