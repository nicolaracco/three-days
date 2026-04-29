import { describe, expect, test } from "bun:test";
import { type TraitId, getTrait, loadTraits } from "./trait";

describe("loadTraits", () => {
  test("returns the 5 trait records with id, name, description", () => {
    const traits = loadTraits();
    expect(traits).toHaveLength(5);
    for (const t of traits) {
      expect(typeof t.id).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  test("includes the canonical 5 ids exactly", () => {
    const ids = loadTraits().map((t) => t.id);
    const expected: TraitId[] = [
      "athletic",
      "hypochondriac",
      "vigilant",
      "resourceful",
      "marksman",
    ];
    expect(new Set(ids)).toEqual(new Set(expected));
  });

  test("Marksman description includes the (no effect yet) tag", () => {
    const m = loadTraits().find((t) => t.id === "marksman");
    expect(m).toBeDefined();
    expect(m!.description.toLowerCase()).toContain("no effect yet");
  });
});

describe("getTrait", () => {
  test("returns the right record by id", () => {
    expect(getTrait("athletic").name).toBe("Athletic");
    expect(getTrait("vigilant").name).toBe("Vigilant");
  });
});
