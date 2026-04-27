/**
 * Seeded RNG (ADR-0007).
 *
 * Implementation: mulberry32 — a small, fast, deterministic PRNG.
 * Same seed → identical sequence. The platform's global random source is
 * never consulted (per ADR-0007).
 *
 * Used by procgen (chunk picking), combat (hit rolls when variance lands
 * in spec 0006/0007), and any other gameplay decision that needs to be
 * reproducible from the run's seed.
 */

export interface Rng {
  /** Next value in `[0, 1)`. */
  next(): number;
  /** Integer in `[min, maxExclusive)`. Throws when `maxExclusive <= min`. */
  intInRange(min: number, maxExclusive: number): number;
  /** Uniformly pick one element from the array. Throws on empty. */
  pickOne<T>(items: readonly T[]): T;
  /** True with the given probability in `[0, 1]`. Edge values short-circuit. */
  roll01(probability: number): boolean;
}

/** Create an `Rng` seeded by `seed`. Same seed produces identical output. */
export function createRng(seed: number): Rng {
  // mulberry32 — small, deterministic PRNG.
  // https://en.wikipedia.org/wiki/Mersenne_Twister § "Other implementations"
  // (also widely cited as a good lightweight seedable PRNG for JS).
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const intInRange = (min: number, maxExclusive: number): number => {
    if (maxExclusive <= min) {
      throw new Error(
        `intInRange: maxExclusive (${maxExclusive}) must be > min (${min})`,
      );
    }
    return min + Math.floor(next() * (maxExclusive - min));
  };

  function pickOne<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("pickOne: empty array");
    }
    return items[intInRange(0, items.length)];
  }

  const roll01 = (probability: number): boolean => {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return next() < probability;
  };

  return { next, intInRange, pickOne, roll01 };
}
