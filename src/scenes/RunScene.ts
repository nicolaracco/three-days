/**
 * RunScene — the playable scene.
 *
 * Substrate from spec 0001/0002/0003: rendering, selection, action
 * targeting, confirm flow, orientation overlay, enemy pathfinding, turn
 * cycle, player tile-by-tile movement animation.
 *
 * Spec 0004 adds:
 * - HP bars above each unit (placeholder bg + fg rectangles).
 * - Player attack flow: tap an adjacent enemy → "Attack (2 AP)" button
 *   in the panel → stages the attack → tap again or "Confirm Attack" →
 *   commits via commitAttack. White flash on the damaged target.
 * - Single action-button slot in the panel (Move / Attack / Confirm).
 * - Enemy turn loop now uses enemyAct (attack-when-adjacent, else move).
 * - Death overlay when the protagonist's HP drops to 0.
 *
 * Per ADR-0008: tile interaction goes through a single scene-level
 * `pointerdown` handler that calls `pixelToTile`. Tiles are dumb
 * rectangles — no `setInteractive` per tile. Buttons (irregular UI) keep
 * their own ≥ 44×44 hit areas.
 *
 * Per ADR-0004: scene logic stays thin. State changes call into pure
 * reducers in `systems/run-state.ts`, `systems/combat.ts`, `systems/turn.ts`.
 */

import Phaser from "phaser";
import { BUILD_SHA } from "../build-info";
import balance from "../data/balance.json";
import viewport from "../data/viewport.json";
import type { Enemy } from "../systems/enemy";
import { commitAttack } from "../systems/combat";
import {
  type GridConfig,
  type TilePos,
  isInMapArea,
  pixelToTile,
  tileToPixel,
} from "../systems/grid";
import { type ItemKind, pickupItemAt } from "../systems/item";
import type { ExitTile } from "../systems/map";
import { apCostToReach, reachableTiles } from "../systems/movement";
import {
  type RunState,
  advanceTurn,
  commitMove,
  createRunState,
  enemyTiles,
  useFlashbang,
  useMedkit,
} from "../systems/run-state";
import { enemyAct } from "../systems/turn";

const TILE_SIZE = viewport.TILE_SIZE;
const MAP_AREA_TOP = viewport.MAP_AREA_TOP;
const HUD_HEIGHT = viewport.HUD_HEIGHT;
const PANEL_HEIGHT = viewport.PANEL_HEIGHT;
const PANEL_Y = viewport.WORKING_HEIGHT - PANEL_HEIGHT;
const MAP_AREA_HEIGHT = viewport.WORKING_HEIGHT - HUD_HEIGHT - PANEL_HEIGHT;

/** Per-step delay for both player and enemy tile-by-tile movement (ms). */
const MOVE_STEP_DELAY_MS = 200;
/** Duration of the white hit/hurt flash on a damaged unit (ms). */
const FLASH_MS = 200;
/** Duration the wasted-bang panel hint stays visible before refresh (ms). */
const TRANSIENT_HINT_MS = 1500;

const COLOR = {
  sceneBg: "#0a0a0a",
  floor: 0x2a2a2a,
  wall: 0x000000,
  tileBorder: 0x333333,
  protagonist: 0x4ec1f7,
  enemyMelee: 0xe57373,
  reachable: 0x4ec1f7,
  stagedHaloStroke: 0xffd166,
  hudBg: 0x111111,
  panelBg: 0x111111,
  buttonBg: 0x2a4a3a,
  buttonBgAttack: 0x4a2a2a,
  buttonBgDisabled: 0x2a2a2a,
  text: "#ffffff",
  textDim: "#888888",
  apLabel: "#ffd166",
  enemyTurnLabel: "#e57373",
  hpBarBg: 0x000000,
  hpBarFg: 0x6abf6a,
  hpBarFgEnemy: 0xc05050,
  flash: 0xffffff,
  // Spec 0009: reuse existing palette entries for exit tiles. Yellow
  // (apLabel/stagedHaloStroke family) for the stairwell, blue
  // (protagonist family) for the fire-escape — visually distinct, no
  // new color introduced.
  exitStairwell: 0xffd166,
  exitFireEscape: 0x4ec1f7,
  exitGateMarker: 0xffd166,
  // Spec 0010: item glyphs and the stunned-enemy tint. Reuse hpBarFg
  // green for medkits and stagedHaloStroke yellow for flashbangs.
  // `enemyStunned` is the muted-grey variant of `enemyMelee` — reads
  // "out of action" without introducing a third unit color.
  itemMedkit: 0x6abf6a,
  itemFlashbang: 0xffd166,
  enemyStunned: 0x707070,
} as const;

const EXIT_CAPTION: Record<ExitTile["exitType"], string> = {
  stairwell: "Stairwell — descent",
  "fire-escape": "Fire-escape · Athletic",
};

const EXIT_TITLE: Record<ExitTile["exitType"], string> = {
  stairwell: "Exit — Stairwell",
  "fire-escape": "Exit — Fire-escape",
};

function tileFillColor(tile: { kind: "floor" | "wall" } | ExitTile): number {
  switch (tile.kind) {
    case "floor":
      return COLOR.floor;
    case "wall":
      return COLOR.wall;
    case "exit":
      return tile.exitType === "stairwell"
        ? COLOR.exitStairwell
        : COLOR.exitFireEscape;
  }
}

type Selection =
  | { kind: "protagonist" }
  | { kind: "tile"; pos: TilePos }
  | { kind: "enemy"; id: string };

type Staged =
  | { kind: "move"; pos: TilePos }
  | { kind: "attack"; targetId: string }
  | { kind: "use-item"; itemKind: ItemKind };

type ActionMode =
  | "confirm-move"
  | "confirm-attack"
  | "stage-attack"
  | "stage-medkit"
  | "stage-flashbang"
  | "confirm-medkit"
  | "confirm-flashbang"
  | "hidden";

interface ActionSlot {
  mode: ActionMode;
  label: string;
  fill: number;
}

interface HpBar {
  bg: Phaser.GameObjects.Rectangle;
  fg: Phaser.GameObjects.Rectangle;
  baseColor: number;
}

const HP_BAR_WIDTH = TILE_SIZE - 8;
const HP_BAR_HEIGHT = 4;
const HP_BAR_OFFSET_Y = -8;

export class RunScene extends Phaser.Scene {
  private state!: RunState;
  private gridCfg!: GridConfig;
  private staged: Staged | null = null;
  private selection: Selection = { kind: "protagonist" };
  private isOrientationLocked = false;
  private isAnimating = false;

  private targetingLayer!: Phaser.GameObjects.Container;
  private stagedLayer!: Phaser.GameObjects.Container;
  private itemsLayer!: Phaser.GameObjects.Container;
  private protagonistSprite!: Phaser.GameObjects.Arc;
  private protagonistHpBar!: HpBar;
  private enemySprites: Map<string, Phaser.GameObjects.Arc> = new Map();
  private enemyHpBars: Map<string, HpBar> = new Map();

  private turnIndicatorText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private apText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private endTurnRect!: Phaser.GameObjects.Rectangle;
  private endTurnLabelText!: Phaser.GameObjects.Text;

  private panelTitle!: Phaser.GameObjects.Text;
  private panelLine1!: Phaser.GameObjects.Text;
  private panelLine2!: Phaser.GameObjects.Text;
  private actionRect!: Phaser.GameObjects.Rectangle;
  private actionLabel!: Phaser.GameObjects.Text;
  private actionRect2!: Phaser.GameObjects.Rectangle;
  private actionLabel2!: Phaser.GameObjects.Text;
  /** First action-area slot's mode. `hidden` collapses the slot. */
  private currentActionMode: ActionMode = "hidden";
  /** Second action-area slot's mode (only set when two item buttons fit). */
  private currentActionMode2: ActionMode = "hidden";
  /**
   * Spec 0010: when set to a non-zero scene-time value, `refreshPanel`
   * renders the transient hint string instead of the selection-derived
   * content. Cleared by a `delayedCall` after `TRANSIENT_HINT_MS`.
   */
  private transientPanelHintUntil = 0;
  private transientPanelHint = "";

  private orientationOverlay!: Phaser.GameObjects.Container;
  private deathOverlay!: Phaser.GameObjects.Container;
  private deathOverlayText!: Phaser.GameObjects.Text;
  private escapeOverlay!: Phaser.GameObjects.Container;
  private escapeOverlayText!: Phaser.GameObjects.Text;
  /** Set when the protagonist steps onto an exit. Freezes input. */
  private escapedVia: ExitTile["exitType"] | null = null;

  constructor() {
    super({ key: "RunScene" });
  }

  /** Single source of truth for "is the player allowed to interact?" */
  private get isInputLocked(): boolean {
    return (
      this.isOrientationLocked ||
      this.state.activeTurn === "enemy" ||
      this.isAnimating ||
      this.state.protagonist.currentHP <= 0 ||
      this.escapedVia !== null
    );
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR.sceneBg);
    this.state = createRunState({ seed: Date.now() });

    // Map placement is per-axis: center within the viewport / map-area band
    // when the map is smaller, otherwise pin at the top-left of the band so
    // the camera can scroll across the rest. Camera bounds (set after the
    // protagonist sprite exists) match the chosen placement so scroll only
    // happens on axes that actually need it.
    const mapPxW = this.state.map.width * TILE_SIZE;
    const mapPxH = this.state.map.height * TILE_SIZE;
    const fitsX = mapPxW <= viewport.WORKING_WIDTH;
    const fitsY = mapPxH <= MAP_AREA_HEIGHT;
    const offsetX = fitsX
      ? Math.floor((viewport.WORKING_WIDTH - mapPxW) / 2)
      : 0;
    const offsetY =
      MAP_AREA_TOP + (fitsY ? Math.floor((MAP_AREA_HEIGHT - mapPxH) / 2) : 0);
    this.gridCfg = {
      offset: { x: offsetX, y: offsetY },
      tileSize: TILE_SIZE,
    };

    this.renderMap();
    this.targetingLayer = this.add.container(0, 0);
    this.stagedLayer = this.add.container(0, 0);
    this.itemsLayer = this.add.container(0, 0);
    this.renderEnemies();
    this.renderProtagonist();
    this.renderHUD();
    this.renderPanel();
    this.renderOrientationOverlay();
    this.renderDeathOverlay();
    this.renderEscapeOverlay();

    // Configure camera scroll. Bounds are exactly the viewport when the map
    // fits, so scroll is clamped to (0, 0); otherwise extended by the map's
    // overflow on the relevant axis. `startFollow` centers the protagonist
    // and Phaser clamps to bounds at the edges, so HUD and panel always
    // remain visible at the top/bottom of the screen.
    const boundsW = fitsX ? viewport.WORKING_WIDTH : mapPxW;
    const boundsH = fitsY
      ? viewport.WORKING_HEIGHT
      : MAP_AREA_TOP + mapPxH + PANEL_HEIGHT;
    this.cameras.main.setBounds(0, 0, boundsW, boundsH);
    this.cameras.main.startFollow(this.protagonistSprite, true);

    this.input.on("pointerdown", this.handlePointerDown, this);

    this.scale.on("orientationchange", this.checkOrientation, this);
    this.checkOrientation();

    this.refreshAll();
  }

  // ----- Static rendering -----

  private renderMap(): void {
    for (let row = 0; row < this.state.map.height; row++) {
      for (let col = 0; col < this.state.map.width; col++) {
        const tile = this.state.map.tiles[row][col];
        const px = tileToPixel({ col, row }, this.gridCfg);
        const fill = tileFillColor(tile);
        this.add
          .rectangle(px.x, px.y, TILE_SIZE, TILE_SIZE, fill)
          .setOrigin(0, 0)
          .setStrokeStyle(1, COLOR.tileBorder);
        if (tile.kind === "exit") {
          this.renderExitDecorations(tile, { col, row }, px);
        }
      }
    }
  }

  /**
   * Per spec 0009 + ADR-0008: a trait-gate marker (small filled circle)
   * in the top-left of the tile when gated, and a one-line caption
   * rendered above the tile in world space (scrollFactor 1, so it
   * tracks the camera per ADR-0011).
   */
  private renderExitDecorations(
    tile: ExitTile,
    _pos: TilePos,
    px: { x: number; y: number },
  ): void {
    if (tile.traitGate === "athletic") {
      this.add.circle(px.x + 6, px.y + 6, 3, COLOR.exitGateMarker);
    }
    const caption = EXIT_CAPTION[tile.exitType];
    this.add
      .text(px.x + TILE_SIZE / 2, px.y - 2, caption, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: COLOR.textDim,
      })
      .setOrigin(0.5, 1);
  }

  private renderEnemies(): void {
    for (const enemy of this.state.enemies) {
      const px = tileToPixel(enemy.position, this.gridCfg);
      const sprite = this.add.circle(
        px.x + TILE_SIZE / 2,
        px.y + TILE_SIZE / 2,
        TILE_SIZE / 2 - 6,
        COLOR.enemyMelee,
      );
      this.enemySprites.set(enemy.id, sprite);
      const bar = this.makeHpBar(px, COLOR.hpBarFgEnemy);
      this.enemyHpBars.set(enemy.id, bar);
    }
  }

  private renderProtagonist(): void {
    const px = tileToPixel(this.state.protagonist.position, this.gridCfg);
    this.protagonistSprite = this.add.circle(
      px.x + TILE_SIZE / 2,
      px.y + TILE_SIZE / 2,
      TILE_SIZE / 2 - 4,
      COLOR.protagonist,
    );
    this.protagonistHpBar = this.makeHpBar(px, COLOR.hpBarFg);
  }

  private makeHpBar(tilePx: { x: number; y: number }, fgColor: number): HpBar {
    const x = tilePx.x + (TILE_SIZE - HP_BAR_WIDTH) / 2;
    const y = tilePx.y + HP_BAR_OFFSET_Y;
    const bg = this.add
      .rectangle(x, y, HP_BAR_WIDTH, HP_BAR_HEIGHT, COLOR.hpBarBg)
      .setOrigin(0, 0)
      .setStrokeStyle(1, COLOR.tileBorder);
    const fg = this.add
      .rectangle(x, y, HP_BAR_WIDTH, HP_BAR_HEIGHT, fgColor)
      .setOrigin(0, 0);
    return { bg, fg, baseColor: fgColor };
  }

  private renderHUD(): void {
    // HUD lives in screen space (scrollFactor 0), so it stays at the top of
    // the viewport even when the camera scrolls a larger map.
    this.add
      .rectangle(0, 0, viewport.WORKING_WIDTH, HUD_HEIGHT, COLOR.hudBg)
      .setOrigin(0, 0)
      .setScrollFactor(0);

    this.turnIndicatorText = this.add
      .text(8, 4, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: COLOR.text,
      })
      .setScrollFactor(0);
    this.hpText = this.add
      .text(8, 22, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: COLOR.text,
      })
      .setScrollFactor(0);
    this.turnText = this.add
      .text(120, 4, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: COLOR.text,
      })
      .setScrollFactor(0);
    this.apText = this.add
      .text(120, 22, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: COLOR.text,
      })
      .setScrollFactor(0);

    // End Turn button — keep its own hit area ≥ 44×44 (visual is smaller)
    const btnW = 88;
    const btnH = 28;
    const btnX = viewport.WORKING_WIDTH - btnW - 8;
    const btnY = (HUD_HEIGHT - btnH) / 2;
    this.endTurnRect = this.add
      .rectangle(btnX, btnY, btnW, btnH, COLOR.buttonBg)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setInteractive(
        new Phaser.Geom.Rectangle(
          -((44 - btnW) / 2),
          -((44 - btnH) / 2),
          Math.max(44, btnW),
          Math.max(44, btnH),
        ),
        Phaser.Geom.Rectangle.Contains,
      );
    this.endTurnRect.on("pointerdown", () => this.endTurnAction());
    this.endTurnLabelText = this.add
      .text(btnX + btnW / 2, btnY + btnH / 2, "End Turn", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: COLOR.text,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0);
  }

  private renderPanel(): void {
    // Panel lives in screen space (scrollFactor 0), pinned to the bottom of
    // the viewport regardless of camera scroll.
    this.add
      .rectangle(
        0,
        PANEL_Y,
        viewport.WORKING_WIDTH,
        PANEL_HEIGHT,
        COLOR.panelBg,
      )
      .setOrigin(0, 0)
      .setStrokeStyle(1, COLOR.tileBorder)
      .setScrollFactor(0);

    this.panelTitle = this.add
      .text(12, PANEL_Y + 12, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: COLOR.text,
      })
      .setScrollFactor(0);
    this.panelLine1 = this.add
      .text(12, PANEL_Y + 36, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: COLOR.text,
      })
      .setScrollFactor(0);
    this.panelLine2 = this.add
      .text(12, PANEL_Y + 56, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: COLOR.textDim,
      })
      .setScrollFactor(0);

    // Two action-area button slots. The primary slot (`actionRect`) is the
    // existing single 132×36 button; the secondary slot (`actionRect2`)
    // appears beside it only when two item buttons need to fit. Layout
    // and visibility are recomputed on every refresh — see
    // `refreshActionButton`.
    const btnW = 132;
    const btnH = 36;
    const btnX = viewport.WORKING_WIDTH - btnW - 12;
    const btnY = PANEL_Y + (PANEL_HEIGHT - btnH) / 2;
    this.actionRect = this.add
      .rectangle(btnX, btnY, btnW, btnH, COLOR.buttonBg)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setInteractive(
        new Phaser.Geom.Rectangle(0, 0, btnW, btnH),
        Phaser.Geom.Rectangle.Contains,
      )
      .setVisible(false);
    this.actionRect.on("pointerdown", () => this.handleActionButton(1));
    this.actionLabel = this.add
      .text(btnX + btnW / 2, btnY + btnH / 2, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: COLOR.text,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setVisible(false);
    this.actionRect2 = this.add
      .rectangle(0, btnY, 62, btnH, COLOR.buttonBg)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setInteractive(
        // Padded hit area — visual is 62×36, hit is 62×44 (≥ ADR-0008 min).
        new Phaser.Geom.Rectangle(0, -4, 62, 44),
        Phaser.Geom.Rectangle.Contains,
      )
      .setVisible(false);
    this.actionRect2.on("pointerdown", () => this.handleActionButton(2));
    this.actionLabel2 = this.add
      .text(0, btnY + btnH / 2, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: COLOR.text,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setVisible(false);

    // Build SHA tag (spec 0008): bottom-right of the panel, anchored at
    // origin (1, 1), screen-fixed so it survives camera scroll under
    // ADR-0011. Placed below the action button's vertical band so it
    // never overlaps any of the button's modes.
    this.add
      .text(viewport.WORKING_WIDTH - 6, PANEL_Y + PANEL_HEIGHT - 4, BUILD_SHA, {
        fontFamily: "monospace",
        fontSize: "9px",
        color: COLOR.textDim,
      })
      .setOrigin(1, 1)
      .setScrollFactor(0);
  }

  private renderOrientationOverlay(): void {
    const bg = this.add
      .rectangle(
        0,
        0,
        viewport.WORKING_WIDTH,
        viewport.WORKING_HEIGHT,
        0x000000,
        0.92,
      )
      .setOrigin(0, 0);
    const text = this.add
      .text(
        viewport.WORKING_WIDTH / 2,
        viewport.WORKING_HEIGHT / 2,
        "Rotate to portrait",
        {
          fontFamily: "monospace",
          fontSize: "20px",
          color: COLOR.text,
        },
      )
      .setOrigin(0.5, 0.5);
    this.orientationOverlay = this.add.container(0, 0, [bg, text]);
    this.orientationOverlay.setDepth(1000).setScrollFactor(0).setVisible(false);
  }

  private renderDeathOverlay(): void {
    const bg = this.add
      .rectangle(
        0,
        0,
        viewport.WORKING_WIDTH,
        viewport.WORKING_HEIGHT,
        0x000000,
        0.94,
      )
      .setOrigin(0, 0);
    this.deathOverlayText = this.add
      .text(viewport.WORKING_WIDTH / 2, viewport.WORKING_HEIGHT / 2, "", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: COLOR.text,
        align: "center",
        wordWrap: { width: viewport.WORKING_WIDTH - 32 },
      })
      .setOrigin(0.5, 0.5);
    this.deathOverlay = this.add.container(0, 0, [bg, this.deathOverlayText]);
    this.deathOverlay.setDepth(1001).setScrollFactor(0).setVisible(false);
  }

  private renderEscapeOverlay(): void {
    const bg = this.add
      .rectangle(
        0,
        0,
        viewport.WORKING_WIDTH,
        viewport.WORKING_HEIGHT,
        0x000000,
        0.94,
      )
      .setOrigin(0, 0);
    this.escapeOverlayText = this.add
      .text(viewport.WORKING_WIDTH / 2, viewport.WORKING_HEIGHT / 2, "", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: COLOR.text,
        align: "center",
        wordWrap: { width: viewport.WORKING_WIDTH - 32 },
      })
      .setOrigin(0.5, 0.5);
    this.escapeOverlay = this.add.container(0, 0, [bg, this.escapeOverlayText]);
    this.escapeOverlay.setDepth(1001).setScrollFactor(0).setVisible(false);
  }

  // ----- Refresh routines -----

  private refreshAll(): void {
    this.refreshTargeting();
    this.refreshHpBars();
    this.refreshHUD();
    this.refreshTurnIndicator();
    this.refreshEndTurnVisual();
    this.refreshItems();
    this.refreshEnemySprites();
    this.refreshPanel();
  }

  /**
   * Spec 0010: re-render every item in `state.itemsOnMap`. Cheap to
   * tear down and rebuild — items are picked up rarely (a few per run)
   * and the layer's child count is at most ~5.
   */
  private refreshItems(): void {
    this.itemsLayer.removeAll(true);
    for (const item of this.state.itemsOnMap) {
      const px = tileToPixel(item.position, this.gridCfg);
      const cx = px.x + TILE_SIZE / 2;
      const cy = px.y + TILE_SIZE / 2;
      const glyph =
        item.kind === "medkit"
          ? this.add
              .rectangle(cx, cy, 12, 12, COLOR.itemMedkit)
              .setOrigin(0.5, 0.5)
          : this.add.circle(cx, cy, 6, COLOR.itemFlashbang);
      this.itemsLayer.add(glyph);
    }
  }

  private refreshTargeting(): void {
    this.targetingLayer.removeAll(true);
    if (this.state.activeTurn !== "player") return;
    if (this.state.protagonist.currentHP <= 0) return;
    const { position, currentAP } = this.state.protagonist;
    const blocked = enemyTiles(this.state);
    const reachable = reachableTiles(
      position,
      currentAP,
      this.state.map,
      blocked,
    ).filter((t) => !(t.col === position.col && t.row === position.row));
    for (const tile of reachable) {
      const px = tileToPixel(tile, this.gridCfg);
      const cost = apCostToReach(position, tile, this.state.map, blocked);
      const overlay = this.add
        .rectangle(px.x, px.y, TILE_SIZE, TILE_SIZE, COLOR.reachable, 0.18)
        .setOrigin(0, 0);
      const label = this.add
        .text(px.x + TILE_SIZE / 2, px.y + TILE_SIZE / 2, String(cost), {
          fontFamily: "monospace",
          fontSize: "16px",
          color: COLOR.apLabel,
        })
        .setOrigin(0.5, 0.5);
      this.targetingLayer.add([overlay, label]);
    }
  }

  private refreshStagedHalo(): void {
    this.stagedLayer.removeAll(true);
    if (!this.staged) return;
    const tile = this.getStagedTile();
    if (!tile) return;
    const px = tileToPixel(tile, this.gridCfg);
    const halo = this.add
      .rectangle(px.x, px.y, TILE_SIZE, TILE_SIZE)
      .setOrigin(0, 0)
      .setStrokeStyle(3, COLOR.stagedHaloStroke);
    this.stagedLayer.add(halo);
  }

  private getStagedTile(): TilePos | null {
    const staged = this.staged;
    if (!staged) return null;
    if (staged.kind === "move") return staged.pos;
    if (staged.kind === "attack") {
      const e = this.state.enemies.find((x) => x.id === staged.targetId);
      return e?.position ?? null;
    }
    // "use-item" — self-targeted, no halo tile.
    return null;
  }

  private refreshHUD(): void {
    this.turnText.setText(`T${this.state.turn}`);
    this.apText.setText(
      `AP ${this.state.protagonist.currentAP}/${this.state.protagonist.maxAP}`,
    );
    this.hpText.setText(
      `HP ${Math.max(0, this.state.protagonist.currentHP)}/${this.state.protagonist.maxHP}`,
    );
  }

  private refreshTurnIndicator(): void {
    if (this.state.activeTurn === "player") {
      this.turnIndicatorText.setText("Your turn").setColor(COLOR.text);
    } else {
      this.turnIndicatorText
        .setText("Enemy turn")
        .setColor(COLOR.enemyTurnLabel);
    }
  }

  private refreshEndTurnVisual(): void {
    const disabled =
      this.state.activeTurn === "enemy" ||
      this.state.protagonist.currentHP <= 0;
    this.endTurnRect.setFillStyle(
      disabled ? COLOR.buttonBgDisabled : COLOR.buttonBg,
    );
    this.endTurnLabelText.setColor(disabled ? COLOR.textDim : COLOR.text);
  }

  private refreshEnemySprites(): void {
    // Despawn destroyed enemies' sprites + bars.
    const liveIds = new Set(this.state.enemies.map((e) => e.id));
    for (const id of Array.from(this.enemySprites.keys())) {
      if (!liveIds.has(id)) {
        this.enemySprites.get(id)?.destroy();
        this.enemySprites.delete(id);
        const bar = this.enemyHpBars.get(id);
        bar?.bg.destroy();
        bar?.fg.destroy();
        this.enemyHpBars.delete(id);
      }
    }
    // Update positions and stun tint of surviving enemies.
    for (const enemy of this.state.enemies) {
      const sprite = this.enemySprites.get(enemy.id);
      if (!sprite) continue;
      const px = tileToPixel(enemy.position, this.gridCfg);
      sprite.setPosition(px.x + TILE_SIZE / 2, px.y + TILE_SIZE / 2);
      sprite.setFillStyle(this.enemyFillColor(enemy));
      const bar = this.enemyHpBars.get(enemy.id);
      if (bar) {
        const barX = px.x + (TILE_SIZE - HP_BAR_WIDTH) / 2;
        const barY = px.y + HP_BAR_OFFSET_Y;
        bar.bg.setPosition(barX, barY);
        bar.fg.setPosition(barX, barY);
      }
    }
  }

  /**
   * Spec 0010: stunned enemies render in a muted grey to read "out of
   * action" without introducing a third unit color. Used by both
   * `refreshEnemySprites` and post-flash restoration.
   */
  private enemyFillColor(enemy: Enemy): number {
    return enemy.stunnedTurns > 0 ? COLOR.enemyStunned : COLOR.enemyMelee;
  }

  private refreshHpBars(): void {
    // Protagonist
    const px = tileToPixel(this.state.protagonist.position, this.gridCfg);
    const protagonistBarX = px.x + (TILE_SIZE - HP_BAR_WIDTH) / 2;
    const protagonistBarY = px.y + HP_BAR_OFFSET_Y;
    this.protagonistHpBar.bg.setPosition(protagonistBarX, protagonistBarY);
    this.protagonistHpBar.fg.setPosition(protagonistBarX, protagonistBarY);
    const protRatio =
      this.state.protagonist.maxHP === 0
        ? 0
        : Math.max(0, this.state.protagonist.currentHP) /
          this.state.protagonist.maxHP;
    this.protagonistHpBar.fg.setSize(HP_BAR_WIDTH * protRatio, HP_BAR_HEIGHT);

    // Enemies
    for (const enemy of this.state.enemies) {
      const bar = this.enemyHpBars.get(enemy.id);
      if (!bar) continue;
      const ratio =
        enemy.maxHP === 0 ? 0 : Math.max(0, enemy.currentHP) / enemy.maxHP;
      bar.fg.setSize(HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT);
    }
  }

  private refreshPanel(): void {
    // Spec 0010: a live transient hint (from a wasted-bang feedback)
    // overrides the selection-derived content for its duration.
    if (
      this.transientPanelHintUntil > 0 &&
      this.time.now < this.transientPanelHintUntil
    ) {
      this.panelTitle.setText("");
      this.panelLine1.setText(this.transientPanelHint);
      this.panelLine2.setText("");
      this.refreshActionButton();
      this.refreshStagedHalo();
      return;
    }

    if (this.selection.kind === "protagonist") {
      const inv = this.state.protagonist.inventory;
      this.panelTitle.setText("Protagonist");
      this.panelLine1.setText(
        `HP ${Math.max(0, this.state.protagonist.currentHP)}/${this.state.protagonist.maxHP} · AP ${this.state.protagonist.currentAP}/${this.state.protagonist.maxAP}`,
      );
      this.panelLine2.setText(
        `Medkits: ${inv.medkit} · Flashbangs: ${inv.flashbang}`,
      );
    } else if (this.selection.kind === "enemy") {
      const enemyId = this.selection.id;
      const found = this.state.enemies.find((e) => e.id === enemyId);
      if (found) {
        this.panelTitle.setText(
          found.kind === "melee" ? "Melee alien" : "Ranged alien",
        );
        const stunSuffix = found.stunnedTurns > 0 ? " · Stunned" : "";
        this.panelLine1.setText(
          `HP ${Math.max(0, found.currentHP)}/${found.maxHP} · AP ${found.currentAP}/${found.maxAP}${stunSuffix}`,
        );
        this.panelLine2.setText(
          `Position (${found.position.col}, ${found.position.row})`,
        );
      } else {
        this.panelTitle.setText("Enemy");
        this.panelLine1.setText("(despawned)");
        this.panelLine2.setText("");
      }
    } else {
      const selPos = this.selection.pos;
      const tile = this.state.map.tiles[selPos.row]?.[selPos.col];
      const itemHere = this.state.itemsOnMap.find(
        (i) => i.position.col === selPos.col && i.position.row === selPos.row,
      );
      if (tile && tile.kind === "exit") {
        this.panelTitle.setText(EXIT_TITLE[tile.exitType]);
        this.panelLine1.setText(
          `Trait gate: ${tile.traitGate === "athletic" ? "Athletic" : "—"}`,
        );
        this.panelLine2.setText(EXIT_CAPTION[tile.exitType]);
      } else if (itemHere) {
        const cost = apCostToReach(
          this.state.protagonist.position,
          this.selection.pos,
          this.state.map,
          enemyTiles(this.state),
        );
        const reachable =
          Number.isFinite(cost) &&
          cost <= this.state.protagonist.currentAP &&
          cost > 0;
        this.panelTitle.setText(
          itemHere.kind === "medkit" ? "Item — Medkit" : "Item — Flashbang",
        );
        this.panelLine1.setText(
          reachable ? `Reachable · cost ${cost} AP` : "Out of range",
        );
        this.panelLine2.setText(
          itemHere.kind === "medkit"
            ? `Heals ${balance.ITEM_MEDKIT_HEAL} HP on use`
            : "Stuns adjacent aliens for 1 turn",
        );
      } else {
        const kind = tile?.kind ?? "—";
        const cost = apCostToReach(
          this.state.protagonist.position,
          this.selection.pos,
          this.state.map,
          enemyTiles(this.state),
        );
        const reachable =
          Number.isFinite(cost) &&
          cost <= this.state.protagonist.currentAP &&
          cost > 0;
        this.panelTitle.setText(
          `Tile (${this.selection.pos.col}, ${this.selection.pos.row})`,
        );
        this.panelLine1.setText(`Kind: ${kind}`);
        this.panelLine2.setText(
          reachable ? `Reachable · cost ${cost} AP` : "Out of range",
        );
      }
    }
    this.refreshActionButton();
    this.refreshStagedHalo();
  }

  private refreshActionButton(): void {
    const slots = this.computeActionSlots();
    this.currentActionMode = slots[0]?.mode ?? "hidden";
    this.currentActionMode2 = slots[1]?.mode ?? "hidden";
    const btnW = 132;
    const btnH = 36;
    const baseX = viewport.WORKING_WIDTH - btnW - 12;
    const btnY = PANEL_Y + (PANEL_HEIGHT - btnH) / 2;
    if (slots.length === 0) {
      this.actionRect.setVisible(false);
      this.actionLabel.setVisible(false);
      this.actionRect2.setVisible(false);
      this.actionLabel2.setVisible(false);
      return;
    }
    if (slots.length === 1) {
      const s = slots[0];
      this.actionRect
        .setVisible(true)
        .setPosition(baseX, btnY)
        .setSize(btnW, btnH)
        .setFillStyle(s.fill);
      this.actionLabel
        .setVisible(true)
        .setPosition(baseX + btnW / 2, btnY + btnH / 2)
        .setText(s.label)
        .setFontSize("16px")
        .setColor(COLOR.text);
      this.actionRect2.setVisible(false);
      this.actionLabel2.setVisible(false);
      return;
    }
    // Two slots — split the 132 px area into two 62 px buttons with an 8 px gap.
    const halfW = 62;
    const gap = 8;
    const x1 = baseX;
    const x2 = baseX + halfW + gap;
    const a = slots[0];
    const b = slots[1];
    this.actionRect
      .setVisible(true)
      .setPosition(x1, btnY)
      .setSize(halfW, btnH)
      .setFillStyle(a.fill);
    this.actionLabel
      .setVisible(true)
      .setPosition(x1 + halfW / 2, btnY + btnH / 2)
      .setText(a.label)
      .setFontSize("13px")
      .setColor(COLOR.text);
    this.actionRect2
      .setVisible(true)
      .setPosition(x2, btnY)
      .setSize(halfW, btnH)
      .setFillStyle(b.fill);
    this.actionLabel2
      .setVisible(true)
      .setPosition(x2 + halfW / 2, btnY + btnH / 2)
      .setText(b.label);
  }

  /**
   * Compute the 0–2 buttons that should be visible in the action area
   * for the current state. The first slot is the "primary" button at the
   * existing 132 px position; if a second slot is present, both shrink
   * to 62 px side-by-side (per spec 0010 layout rule).
   */
  private computeActionSlots(): ActionSlot[] {
    if (this.state.activeTurn !== "player") return [];
    if (this.state.protagonist.currentHP <= 0) return [];
    // Staged actions always collapse to a single confirm button.
    if (this.staged?.kind === "move") {
      if (
        this.selection.kind === "tile" &&
        this.selection.pos.col === this.staged.pos.col &&
        this.selection.pos.row === this.staged.pos.row
      ) {
        return [
          { mode: "confirm-move", label: "Confirm Move", fill: COLOR.buttonBg },
        ];
      }
      return [];
    }
    if (this.staged?.kind === "attack") {
      if (
        this.selection.kind === "enemy" &&
        this.selection.id === this.staged.targetId
      ) {
        return [
          {
            mode: "confirm-attack",
            label: "Confirm Attack",
            fill: COLOR.buttonBgAttack,
          },
        ];
      }
      return [];
    }
    if (this.staged?.kind === "use-item") {
      const itemKind = this.staged.itemKind;
      const label = itemKind === "medkit" ? "Confirm Medkit" : "Confirm Flash";
      const mode: ActionMode =
        itemKind === "medkit" ? "confirm-medkit" : "confirm-flashbang";
      return [{ mode, label, fill: COLOR.buttonBg }];
    }
    // No stage. Prefer adjacent-enemy attack stage if applicable.
    if (this.selection.kind === "enemy") {
      const target = this.state.enemies.find(
        (e) => e.id === (this.selection as { id: string }).id,
      );
      if (target) {
        const dist =
          Math.abs(target.position.col - this.state.protagonist.position.col) +
          Math.abs(target.position.row - this.state.protagonist.position.row);
        if (
          dist === 1 &&
          this.state.protagonist.currentAP >= balance.ATTACK_AP_COST
        ) {
          return [
            {
              mode: "stage-attack",
              label: `Attack (${balance.ATTACK_AP_COST} AP)`,
              fill: COLOR.buttonBgAttack,
            },
          ];
        }
      }
    }
    // Otherwise — protagonist selected and no stage — surface item-use
    // buttons for whatever the player carries.
    if (this.selection.kind === "protagonist") {
      const slots: ActionSlot[] = [];
      const inv = this.state.protagonist.inventory;
      const canMedkit =
        inv.medkit > 0 &&
        this.state.protagonist.currentAP >= balance.USE_ITEM_AP_COST &&
        this.state.protagonist.currentHP < this.state.protagonist.maxHP;
      const canFlash =
        inv.flashbang > 0 &&
        this.state.protagonist.currentAP >= balance.USE_ITEM_AP_COST;
      // Long-form labels when only one button is present; short-form when
      // both fit. Refresh chooses the layout based on slot count.
      if (canMedkit && canFlash) {
        slots.push({
          mode: "stage-medkit",
          label: `Med ×${inv.medkit}`,
          fill: COLOR.buttonBg,
        });
        slots.push({
          mode: "stage-flashbang",
          label: `Flash ×${inv.flashbang}`,
          fill: COLOR.buttonBg,
        });
      } else if (canMedkit) {
        slots.push({
          mode: "stage-medkit",
          label: `Use Medkit (${balance.USE_ITEM_AP_COST} AP)`,
          fill: COLOR.buttonBg,
        });
      } else if (canFlash) {
        slots.push({
          mode: "stage-flashbang",
          label: `Use Flashbang (${balance.USE_ITEM_AP_COST} AP)`,
          fill: COLOR.buttonBg,
        });
      }
      return slots;
    }
    return [];
  }

  // ----- Input handling -----

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.isOrientationLocked) return;
    if (this.isAnimating) return;
    if (this.state.protagonist.currentHP <= 0) return;
    // Reject taps that landed in the screen-space HUD or panel band: these
    // are scrollFactor(0) overlays that obscure whatever map tiles happen
    // to sit beneath them in world space, so pointer.worldY would point at
    // a tile the user couldn't actually see.
    if (pointer.y < HUD_HEIGHT || pointer.y >= PANEL_Y) return;
    const px = { x: pointer.worldX, y: pointer.worldY };
    if (
      !isInMapArea(
        px,
        { width: this.state.map.width, height: this.state.map.height },
        this.gridCfg,
      )
    ) {
      return;
    }
    const tile = pixelToTile(px, this.gridCfg);
    this.handleTileTap(tile);
  }

  private handleTileTap(tile: TilePos): void {
    const protagonist = this.state.protagonist.position;
    const onProtagonist =
      tile.col === protagonist.col && tile.row === protagonist.row;

    if (onProtagonist) {
      this.setSelection({ kind: "protagonist" });
      this.clearStaged();
      return;
    }

    // Enemy tap?
    const enemy = this.state.enemies.find(
      (e) => e.position.col === tile.col && e.position.row === tile.row,
    );
    if (enemy) {
      // If the enemy is already staged for attack and we tap them again → commit.
      if (
        this.staged?.kind === "attack" &&
        this.staged.targetId === enemy.id &&
        this.state.activeTurn === "player"
      ) {
        this.commitStagedAttack();
        return;
      }
      this.setSelection({ kind: "enemy", id: enemy.id });
      this.clearStaged();
      return;
    }

    // During enemy turn, taps still update selection (read-only).
    if (this.state.activeTurn === "enemy") {
      this.setSelection({ kind: "tile", pos: tile });
      this.clearStaged();
      return;
    }

    const cost = apCostToReach(
      protagonist,
      tile,
      this.state.map,
      enemyTiles(this.state),
    );
    const reachable =
      Number.isFinite(cost) && cost <= this.state.protagonist.currentAP;

    if (!reachable) {
      this.setSelection({ kind: "tile", pos: tile });
      this.clearStaged();
      return;
    }

    if (
      this.staged?.kind === "move" &&
      this.staged.pos.col === tile.col &&
      this.staged.pos.row === tile.row
    ) {
      this.commitStagedMove();
    } else {
      this.staged = { kind: "move", pos: tile };
      this.setSelection({ kind: "tile", pos: tile });
      this.refreshStagedHalo();
      this.refreshActionButton();
    }
  }

  private setSelection(sel: Selection): void {
    this.selection = sel;
    this.refreshPanel();
  }

  private clearStaged(): void {
    this.staged = null;
    this.refreshStagedHalo();
    this.refreshActionButton();
  }

  /**
   * Click handler for the panel action buttons. Slot 1 is the primary
   * button (`actionRect`); slot 2 is the optional secondary button
   * (`actionRect2`) used by the two-item layout. Dispatch is by the
   * mode currently held in the corresponding `currentActionMode` /
   * `currentActionMode2` field, set by `refreshActionButton`.
   */
  private handleActionButton(slot: 1 | 2): void {
    if (this.isInputLocked) return;
    const mode = slot === 1 ? this.currentActionMode : this.currentActionMode2;
    switch (mode) {
      case "confirm-move":
        this.commitStagedMove();
        break;
      case "confirm-attack":
        this.commitStagedAttack();
        break;
      case "stage-attack":
        if (this.selection.kind === "enemy") {
          this.staged = { kind: "attack", targetId: this.selection.id };
          this.refreshStagedHalo();
          this.refreshActionButton();
        }
        break;
      case "stage-medkit":
        this.staged = { kind: "use-item", itemKind: "medkit" };
        this.refreshActionButton();
        break;
      case "stage-flashbang":
        this.staged = { kind: "use-item", itemKind: "flashbang" };
        this.refreshActionButton();
        break;
      case "confirm-medkit":
        this.commitUseMedkit();
        break;
      case "confirm-flashbang":
        this.commitUseFlashbang();
        break;
      case "hidden":
        break;
    }
  }

  // ----- Item use commits (spec 0010) -----

  private commitUseMedkit(): void {
    if (this.staged?.kind !== "use-item" || this.staged.itemKind !== "medkit")
      return;
    if (this.state.activeTurn !== "player") return;
    const result = useMedkit(this.state);
    if (!result.ok) {
      // Preserve the staged item for "insufficient-ap" / "no-item" — the
      // player can still cancel by tapping elsewhere. `at-full-hp` clears
      // the stage so the user isn't stuck with a button that won't fire.
      if (result.reason === "at-full-hp") {
        this.staged = null;
        this.refreshAll();
      }
      return;
    }
    this.state = result.state;
    this.staged = null;
    this.refreshAll();
  }

  private commitUseFlashbang(): void {
    if (
      this.staged?.kind !== "use-item" ||
      this.staged.itemKind !== "flashbang"
    )
      return;
    if (this.state.activeTurn !== "player") return;
    const result = useFlashbang(this.state);
    if (!result.ok) return;
    this.state = result.state;
    this.staged = null;
    if (result.stunned === 0) {
      this.showTransientPanelHint("No enemies in range");
    }
    this.refreshAll();
  }

  /**
   * Spec 0010: render `text` in the panel for `TRANSIENT_HINT_MS` ms,
   * then refresh from the current selection. Selection changes during
   * the hint window override it (the user's most recent action wins).
   */
  private showTransientPanelHint(text: string): void {
    this.transientPanelHint = text;
    this.transientPanelHintUntil = this.time.now + TRANSIENT_HINT_MS;
    this.refreshPanel();
    this.time.delayedCall(TRANSIENT_HINT_MS, () => {
      // Only refresh if we haven't been overridden by another hint or a
      // selection change. The until-timestamp tells us whether we're
      // still the most recent hint.
      if (this.time.now >= this.transientPanelHintUntil) {
        this.transientPanelHintUntil = 0;
        this.transientPanelHint = "";
        this.refreshPanel();
      }
    });
  }

  // ----- Player move -----

  private commitStagedMove(): void {
    if (this.staged?.kind !== "move") return;
    if (this.state.activeTurn !== "player") return;
    if (this.isAnimating) return;
    const target = this.staged.pos;
    const result = commitMove(this.state, target);
    if (!result.ok) return;
    this.staged = null;
    this.setSelection({ kind: "protagonist" });
    this.startPlayerMoveAnimation(result.path, result.state);
  }

  private startPlayerMoveAnimation(
    path: TilePos[],
    finalState: RunState,
  ): void {
    if (path.length < 2) {
      this.state = finalState;
      this.afterPlayerMove();
      return;
    }
    this.isAnimating = true;
    this.targetingLayer.removeAll(true);
    this.refreshActionButton();
    this.advancePlayerStep(path, finalState, 1);
  }

  private advancePlayerStep(
    path: TilePos[],
    finalState: RunState,
    index: number,
  ): void {
    if (index >= path.length) {
      this.state = finalState;
      this.isAnimating = false;
      this.afterPlayerMove();
      return;
    }
    const totalCost = path.length - 1;
    this.state = {
      ...finalState,
      protagonist: {
        ...finalState.protagonist,
        position: path[index],
        currentAP: finalState.protagonist.currentAP + (totalCost - index),
      },
    };
    const px = tileToPixel(path[index], this.gridCfg);
    this.protagonistSprite.setPosition(
      px.x + TILE_SIZE / 2,
      px.y + TILE_SIZE / 2,
    );
    this.refreshHUD();
    this.refreshHpBars();
    this.refreshPanel();
    this.time.delayedCall(MOVE_STEP_DELAY_MS, () =>
      this.advancePlayerStep(path, finalState, index + 1),
    );
  }

  private afterPlayerMove(): void {
    // Spec 0010: pick up any item at the protagonist's destination tile
    // before refreshing or running the exit check, so a single move can
    // collect an item *and* end the run on a connector tile if those
    // happen to coincide.
    const pickup = pickupItemAt(this.state, this.state.protagonist.position);
    this.state = pickup.state;

    const px = tileToPixel(this.state.protagonist.position, this.gridCfg);
    this.protagonistSprite.setPosition(
      px.x + TILE_SIZE / 2,
      px.y + TILE_SIZE / 2,
    );
    this.refreshAll();
    // Spec 0009: stepping onto an exit ends the run. Trait gating is
    // displayed but not enforced this spec — TODO when traits land.
    const { col, row } = this.state.protagonist.position;
    const tile = this.state.map.tiles[row]?.[col];
    if (tile && tile.kind === "exit") {
      this.handleEscape(tile);
    }
  }

  // ----- Escape -----

  private handleEscape(tile: ExitTile): void {
    this.escapedVia = tile.exitType;
    const label = tile.exitType === "stairwell" ? "Stairwell" : "Fire-escape";
    this.escapeOverlayText.setText(
      `You escaped\nVia ${label} · Turn ${this.state.turn}\n\nRefresh to play another run`,
    );
    this.escapeOverlay.setVisible(true);
    this.refreshAll();
  }

  // ----- Player attack -----

  private commitStagedAttack(): void {
    if (this.staged?.kind !== "attack") return;
    if (this.state.activeTurn !== "player") return;
    if (this.isAnimating) return;
    const targetId = this.staged.targetId;
    const result = commitAttack(this.state, {
      attackerSide: "player",
      weaponId: this.state.protagonist.weaponId,
      targetId,
    });
    if (!result.ok) return;
    this.state = result.state;
    this.staged = null;
    // If the target survived, keep them selected so the player can chain
    // hits without re-tapping; if killed, reset to protagonist.
    if (result.killed) {
      this.setSelection({ kind: "protagonist" });
    }
    this.isAnimating = true;
    const targetSprite = this.enemySprites.get(targetId);
    if (targetSprite) {
      // Spec 0010: a stunned-and-hit alien must restore to grey, not red,
      // so resolve the post-flash color from current state at flash-end.
      const targetEnemy = this.state.enemies.find((e) => e.id === targetId);
      const restoreColor = targetEnemy
        ? this.enemyFillColor(targetEnemy)
        : COLOR.enemyMelee;
      this.flashSprite(targetSprite, restoreColor);
    }
    this.refreshHpBars();
    this.refreshEnemySprites();
    this.refreshHUD();
    this.refreshPanel();
    this.time.delayedCall(FLASH_MS, () => {
      this.isAnimating = false;
      this.refreshAll();
    });
  }

  private flashSprite(sprite: Phaser.GameObjects.Arc, baseColor: number): void {
    sprite.setFillStyle(COLOR.flash);
    this.time.delayedCall(FLASH_MS, () => {
      // Defensive: sprite may have been destroyed if the unit died.
      if (sprite.active) sprite.setFillStyle(baseColor);
    });
  }

  // ----- Turn cycle -----

  private endTurnAction(): void {
    if (this.isInputLocked) return;
    if (this.state.activeTurn !== "player") return;
    this.state = advanceTurn(this.state);
    this.staged = null;
    this.setSelection({ kind: "protagonist" });
    this.refreshTurnIndicator();
    this.refreshEndTurnVisual();
    this.refreshTargeting();
    this.refreshHUD();
    this.startEnemyTurnLoop();
  }

  private startEnemyTurnLoop(): void {
    this.runEnemiesSequentially(0);
  }

  private runEnemiesSequentially(enemyIndex: number): void {
    if (this.state.protagonist.currentHP <= 0) {
      this.handleProtagonistDeath();
      return;
    }
    if (enemyIndex >= this.state.enemies.length) {
      this.finishEnemyTurn();
      return;
    }
    const enemy = this.state.enemies[enemyIndex];
    // Spec 0010: stunned enemies skip their turn entirely. Decrement on
    // skip so the stun wears off after exactly one enemy phase.
    if (enemy.stunnedTurns > 0) {
      this.state = {
        ...this.state,
        enemies: this.state.enemies.map((e) =>
          e.id === enemy.id ? { ...e, stunnedTurns: e.stunnedTurns - 1 } : e,
        ),
      };
      this.refreshEnemySprites();
      if (this.selection.kind === "enemy" && this.selection.id === enemy.id) {
        this.refreshPanel();
      }
      this.runEnemiesSequentially(enemyIndex + 1);
      return;
    }
    this.tryEnemyAct(enemy.id, enemyIndex);
  }

  private tryEnemyAct(enemyId: string, enemyIndex: number): void {
    const result = enemyAct(this.state, enemyId);
    if (result.kind === "idle") {
      this.runEnemiesSequentially(enemyIndex + 1);
      return;
    }
    this.state = result.state;
    if (result.kind === "moved") {
      this.refreshEnemySprites();
      this.refreshHpBars();
      if (this.selection.kind === "enemy") this.refreshPanel();
      this.time.delayedCall(MOVE_STEP_DELAY_MS, () =>
        this.tryEnemyAct(enemyId, enemyIndex),
      );
    } else {
      // attacked
      this.flashSprite(this.protagonistSprite, COLOR.protagonist);
      this.refreshHpBars();
      this.refreshHUD();
      if (this.selection.kind === "protagonist") this.refreshPanel();
      this.time.delayedCall(FLASH_MS, () => {
        if (this.state.protagonist.currentHP <= 0) {
          this.handleProtagonistDeath();
          return;
        }
        this.tryEnemyAct(enemyId, enemyIndex);
      });
    }
  }

  private finishEnemyTurn(): void {
    if (this.state.protagonist.currentHP <= 0) {
      this.handleProtagonistDeath();
      return;
    }
    this.state = advanceTurn(this.state);
    this.setSelection({ kind: "protagonist" });
    this.refreshAll();
  }

  // ----- Death -----

  private handleProtagonistDeath(): void {
    const killer =
      this.state.enemies[0]?.kind === "melee"
        ? "Melee alien"
        : (this.state.enemies[0]?.kind ?? "Unknown");
    this.deathOverlayText.setText(
      `You died · Turn ${this.state.turn} · Killed by: ${killer}`,
    );
    this.deathOverlay.setVisible(true);
    this.refreshAll();
  }

  // ----- Orientation -----

  private checkOrientation(): void {
    const isPortrait = this.scale.isPortrait;
    this.orientationOverlay.setVisible(!isPortrait);
    this.isOrientationLocked = !isPortrait;
  }
}
