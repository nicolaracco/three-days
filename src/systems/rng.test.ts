import { test, expect, describe } from "bun:test";
import { createRng } from "./rng";

describe("createRng + next", () => {
  test("same seed produces identical sequence over 100 calls", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  test("next returns values in [0, 1)", () => {
    const rng = createRng(42);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("different seeds produce different first 10 values", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 10; i++) {
      seqA.push(a.next());
      seqB.push(b.next());
    }
    expect(seqA).not.toEqual(seqB);
  });
});

describe("intInRange", () => {
  test("returns values in [min, maxExclusive) over many samples", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.intInRange(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  test("intInRange(0, 1) always returns 0", () => {
    const rng = createRng(100);
    for (let i = 0; i < 50; i++) {
      expect(rng.intInRange(0, 1)).toBe(0);
    }
  });

  test("throws when maxExclusive <= min", () => {
    const rng = createRng(1);
    expect(() => rng.intInRange(5, 5)).toThrow();
    expect(() => rng.intInRange(10, 5)).toThrow();
  });
});

describe("pickOne", () => {
  test("returns an element of the input", () => {
    const rng = createRng(42);
    const items = ["a", "b", "c", "d"] as const;
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pickOne(items));
    }
  });

  test("returns the only element when items has length 1", () => {
    const rng = createRng(1);
    expect(rng.pickOne(["only"])).toBe("only");
  });

  test("throws on an empty array", () => {
    const rng = createRng(1);
    expect(() => rng.pickOne([])).toThrow();
  });
});

describe("roll01", () => {
  test("roll01(0) always returns false", () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      expect(rng.roll01(0)).toBe(false);
    }
  });

  test("roll01(1) always returns true", () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      expect(rng.roll01(1)).toBe(true);
    }
  });

  test("roll01(0.5) produces a roughly mixed distribution", () => {
    const rng = createRng(99);
    let trues = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      if (rng.roll01(0.5)) trues++;
    }
    // Loose sanity check: expect within 30%–70% of total
    expect(trues).toBeGreaterThan(total * 0.3);
    expect(trues).toBeLessThan(total * 0.7);
  });
});
