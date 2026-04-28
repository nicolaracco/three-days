/**
 * Map data — `Tile` tagged union, `Day1Map` shape, and the loader for the
 * static Day-1 layout. Procedural generation arrives in spec 0003+.
 *
 * Spec 0009 adds `ExitTile` (with type + optional trait gate per GDD §9.2).
 * Exits are walkable; the static loader does not yet emit them — only
 * procgen picks two of `StitchResult.openConnectors` per map.
 */

import type { TilePos } from "./grid";
import day1MapJson from "../data/day1-static-map.json";

export interface FloorTile {
  kind: "floor";
}

export interface WallTile {
  kind: "wall";
}

export type ExitType = "stairwell" | "fire-escape";
export type TraitGate = "athletic" | null;

export interface ExitTile {
  kind: "exit";
  exitType: ExitType;
  traitGate: TraitGate;
}

export type Tile = FloorTile | WallTile | ExitTile;

export interface Day1Map {
  width: number;
  height: number;
  start: TilePos;
  /** Indexed [row][col] to match human-readable JSON authoring order. */
  tiles: Tile[][];
  /**
   * Absolute positions where enemies can spawn. Procgen-produced maps
   * carry the union of all chunk-authored spawn slots; the static fixture
   * map (`loadDay1Map`) returns an empty array (tests that use the fixture
   * pass `loadDay1Enemies()` with hardcoded positions instead).
   */
  spawnSlots: TilePos[];
}

/**
 * Load the static Day-1 map from `data/day1-static-map.json`.
 *
 * The JSON stores tiles as kind strings (`"floor"`, `"wall"`); this loader
 * lifts them into the `Tile` tagged-union shape that `systems/` expects.
 */
export function loadDay1Map(): Day1Map {
  return {
    width: day1MapJson.width,
    height: day1MapJson.height,
    start: day1MapJson.start,
    tiles: day1MapJson.tiles.map((row) =>
      row.map((kind) => {
        switch (kind) {
          case "floor":
            return { kind: "floor" } satisfies FloorTile;
          case "wall":
            return { kind: "wall" } satisfies WallTile;
          default:
            throw new Error(
              `Unknown tile kind in day1-static-map.json: ${kind}`,
            );
        }
      }),
    ),
    spawnSlots: [],
  };
}
