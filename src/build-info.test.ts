import { describe, expect, test } from "bun:test";
import { BUILD_SHA } from "./build-info";

describe("BUILD_SHA", () => {
  test("is a non-empty string", () => {
    expect(typeof BUILD_SHA).toBe("string");
    expect(BUILD_SHA.length).toBeGreaterThan(0);
  });

  test("is short enough to render in a small UI slot", () => {
    // The render slot in `RunScene` panel bottom-right (spec 0008) is sized
    // for a 7-char short SHA. Cap at 8 to allow for the literal `"dev"`
    // fallback while still catching an unintended full 40-char SHA.
    expect(BUILD_SHA.length).toBeLessThanOrEqual(8);
  });
});
