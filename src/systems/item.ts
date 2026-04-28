/**
 * Item types and pickup reducer (spec 0010).
 *
 * Items live as runtime instances in `RunState.itemsOnMap` (parallel to
 * `enemies`), not as a tile-kind. The tile underneath an item is plain
 * floor; the item is a render overlay and a pickup-on-walk trigger.
 *
 * `pickupItemAt` is idempotent when no item is at the queried position —
 * makes it safe to call unconditionally from `afterPlayerMove`.
 */

import type { TilePos } from "./grid";

export type ItemKind = "medkit" | "flashbang";

export interface Item {
  position: TilePos;
  kind: ItemKind;
}

export interface Inventory {
  medkit: number;
  flashbang: number;
}

export const EMPTY_INVENTORY: Inventory = { medkit: 0, flashbang: 0 };

/**
 * Result of a `pickupItemAt` call. `picked` is the item kind picked up,
 * or `null` if there was no item at the queried position. The caller
 * uses `picked` for log messaging / SFX hooks; the new `state` is the
 * authoritative result either way.
 */
export interface PickupResult<S> {
  state: S;
  picked: ItemKind | null;
}

/**
 * Generic pickup helper. The `state`-shape parameter is left abstract so
 * the run-state module can call it without a circular import — both
 * `RunState` and the test fixtures share the same minimal contract:
 * a `protagonist.inventory` and an `itemsOnMap` array.
 */
export function pickupItemAt<
  S extends {
    protagonist: { inventory: Inventory };
    itemsOnMap: Item[];
  },
>(state: S, at: TilePos): PickupResult<S> {
  const idx = state.itemsOnMap.findIndex(
    (i) => i.position.col === at.col && i.position.row === at.row,
  );
  if (idx < 0) return { state, picked: null };
  const item = state.itemsOnMap[idx];
  const nextItems = state.itemsOnMap.slice();
  nextItems.splice(idx, 1);
  const nextInventory: Inventory = {
    ...state.protagonist.inventory,
    [item.kind]: state.protagonist.inventory[item.kind] + 1,
  };
  return {
    state: {
      ...state,
      protagonist: { ...state.protagonist, inventory: nextInventory },
      itemsOnMap: nextItems,
    },
    picked: item.kind,
  };
}
