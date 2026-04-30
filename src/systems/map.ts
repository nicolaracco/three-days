/**
 * Map data — `Tile` tagged union, `Day1Map` shape, and the loader for the
 * static Day-1 layout. Procedural generation arrives in spec 0003+.
 *
 * Spec 0009 adds `ExitTile` (with type + optional trait gate per GDD §9.2).
 * Exits are walkable; the static loader does not yet emit them — only
 * procgen picks two of `StitchResult.openConnectors` per map.
 *
 * Spec 0011 adds two handcrafted Day-2 maps (lobby, rooftop). They reuse
 * the `Day1Map` shape (no rename — the slight name mismatch is delib-
 * erate scope discipline) but embed their enemies inline rather than
 * relying on `loadDay1Enemies`.
 */

import balance from "../data/balance.json";
import day1MapJson from "../data/day1-static-map.json";
import day2LobbyJson from "../data/day2/lobby.json";
import day2RooftopJson from "../data/day2/rooftop.json";
import type { Enemy } from "./enemy";
import type { TilePos } from "./grid";
import type { Item, ItemKind } from "./item";

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
  /**
   * Spec 0010: items placed at chunk-authored item slots, translated to
   * absolute coordinates. Procgen-produced maps populate this; the
   * static fixture (`loadDay1Map`) returns an empty array.
   */
  itemsOnMap: Item[];
  /**
   * Spec 0014: tile positions that provide cover. A target whose
   * Bresenham line-of-fire passes through any of these is considered
   * covered. Authored per chunk for Day 1 and inline for Day 2.
   */
  coverTiles: TilePos[];
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
      row.map((kind) => liftTileKind(kind)),
    ),
    spawnSlots: [],
    itemsOnMap: [],
    coverTiles: [],
  };
}

/** Spec 0011 — handcrafted Day-2 map keys. */
export type Day2MapKey = "lobby" | "rooftop";

/** Spec 0011 — return shape for `loadDay2Map`. Bundles map + authored enemies. */
export interface Day2MapBundle {
  map: Day1Map;
  enemies: Enemy[];
  key: Day2MapKey;
}

interface RawDay2Enemy {
  id: string;
  kind: string;
  position: TilePos;
  weaponId: string;
  maxHP?: number;
  isCommander?: boolean;
}

interface RawDay2Item {
  kind: string;
  position: TilePos;
}

interface RawDay2Map {
  key: string;
  width: number;
  height: number;
  start: TilePos;
  tiles: string[][];
  itemsOnMap: RawDay2Item[];
  enemies: RawDay2Enemy[];
  /** Spec 0014 — optional; defaults to []. */
  coverTiles?: TilePos[];
}

/**
 * Load a handcrafted Day-2 map by key (`"lobby"` or `"rooftop"`).
 *
 * Returns the `Day1Map`-shaped grid plus the authored enemy list. Enemies
 * embed in the JSON rather than living in a sibling file (as Day-1 does)
 * so each Day-2 map is self-contained.
 */
export function loadDay2Map(key: Day2MapKey): Day2MapBundle {
  const raw: RawDay2Map = key === "lobby" ? day2LobbyJson : day2RooftopJson;
  const map: Day1Map = {
    width: raw.width,
    height: raw.height,
    start: raw.start,
    tiles: raw.tiles.map((row) => row.map((kind) => liftTileKind(kind))),
    spawnSlots: [],
    itemsOnMap: raw.itemsOnMap.map((i) => ({
      kind: liftItemKind(i.kind, raw.key),
      position: i.position,
    })),
    coverTiles: (raw.coverTiles ?? []).map((c) => ({ col: c.col, row: c.row })),
  };
  const enemies: Enemy[] = raw.enemies.map((e) => {
    if (e.kind !== "melee" && e.kind !== "ranged") {
      throw new Error(`Unknown enemy kind in day2/${raw.key}.json: ${e.kind}`);
    }
    const maxHP = e.maxHP ?? balance.ENEMY_HP;
    return {
      id: e.id,
      kind: e.kind,
      position: e.position,
      currentAP: balance.ENEMY_MAX_AP,
      maxAP: balance.ENEMY_MAX_AP,
      currentHP: maxHP,
      maxHP,
      weaponId: e.weaponId,
      stunnedTurns: 0,
      isCommander: e.isCommander ?? false,
    };
  });
  return { map, enemies, key };
}

function liftTileKind(kind: string): Tile {
  switch (kind) {
    case "floor":
      return { kind: "floor" } satisfies FloorTile;
    case "wall":
      return { kind: "wall" } satisfies WallTile;
    default:
      throw new Error(`Unknown tile kind in map JSON: ${kind}`);
  }
}

function liftItemKind(kind: string, mapKey: string): ItemKind {
  if (kind !== "medkit" && kind !== "flashbang") {
    throw new Error(`Unknown item kind in day2/${mapKey}.json: ${kind}`);
  }
  return kind;
}
