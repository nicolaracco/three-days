import { describe, expect, test } from "bun:test";
import {
  type Inventory,
  type Item,
  EMPTY_INVENTORY,
  pickupItemAt,
} from "./item";

interface TinyState {
  protagonist: { inventory: Inventory };
  itemsOnMap: Item[];
}

const fixture = (items: Item[]): TinyState => ({
  protagonist: { inventory: { ...EMPTY_INVENTORY } },
  itemsOnMap: items,
});

describe("pickupItemAt", () => {
  test("returns the input state unchanged when no item is at the position", () => {
    const s = fixture([]);
    const result = pickupItemAt(s, { col: 3, row: 2 });
    expect(result.picked).toBeNull();
    expect(result.state).toBe(s);
    expect(result.state.itemsOnMap).toHaveLength(0);
    expect(result.state.protagonist.inventory).toEqual(EMPTY_INVENTORY);
  });

  test("removes the item and increments the matching inventory counter", () => {
    const s = fixture([
      { kind: "medkit", position: { col: 3, row: 2 } },
      { kind: "flashbang", position: { col: 1, row: 1 } },
    ]);
    const result = pickupItemAt(s, { col: 3, row: 2 });
    expect(result.picked).toBe("medkit");
    expect(result.state.itemsOnMap).toHaveLength(1);
    expect(result.state.itemsOnMap[0].kind).toBe("flashbang");
    expect(result.state.protagonist.inventory.medkit).toBe(1);
    expect(result.state.protagonist.inventory.flashbang).toBe(0);
  });

  test("does not mutate the input state", () => {
    const s = fixture([{ kind: "medkit", position: { col: 0, row: 0 } }]);
    pickupItemAt(s, { col: 0, row: 0 });
    expect(s.itemsOnMap).toHaveLength(1);
    expect(s.protagonist.inventory.medkit).toBe(0);
  });
});
