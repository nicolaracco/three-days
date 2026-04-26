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
import balance from "../data/balance.json";
import viewport from "../data/viewport.json";
import { commitAttack } from "../systems/combat";
import {
  type GridConfig,
  type TilePos,
  isInMapArea,
  pixelToTile,
  tileToPixel,
} from "../systems/grid";
import { apCostToReach, reachableTiles } from "../systems/movement";
import {
  type RunState,
  advanceTurn,
  commitMove,
  createRunState,
  enemyTiles,
} from "../systems/run-state";
import { enemyAct } from "../systems/turn";

const TILE_SIZE = viewport.TILE_SIZE;
const MAP_WIDTH_TILES = 11;
const MAP_AREA_X = Math.floor(
  (viewport.WORKING_WIDTH - MAP_WIDTH_TILES * TILE_SIZE) / 2,
);
const MAP_AREA_Y = viewport.MAP_AREA_TOP;
const HUD_HEIGHT = viewport.HUD_HEIGHT;
const PANEL_HEIGHT = viewport.PANEL_HEIGHT;
const PANEL_Y = viewport.WORKING_HEIGHT - PANEL_HEIGHT;

/** Per-step delay for both player and enemy tile-by-tile movement (ms). */
const MOVE_STEP_DELAY_MS = 200;
/** Duration of the white hit/hurt flash on a damaged unit (ms). */
const FLASH_MS = 200;

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
} as const;

type Selection =
  | { kind: "protagonist" }
  | { kind: "tile"; pos: TilePos }
  | { kind: "enemy"; id: string };

type Staged =
  | { kind: "move"; pos: TilePos }
  | { kind: "attack"; targetId: string };

type ActionMode = "confirm-move" | "confirm-attack" | "stage-attack" | "hidden";

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
  private currentActionMode: ActionMode = "hidden";

  private orientationOverlay!: Phaser.GameObjects.Container;
  private deathOverlay!: Phaser.GameObjects.Container;
  private deathOverlayText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "RunScene" });
  }

  /** Single source of truth for "is the player allowed to interact?" */
  private get isInputLocked(): boolean {
    return (
      this.isOrientationLocked ||
      this.state.activeTurn === "enemy" ||
      this.isAnimating ||
      this.state.protagonist.currentHP <= 0
    );
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR.sceneBg);
    this.state = createRunState({ seed: Date.now() });
    this.gridCfg = {
      offset: { x: MAP_AREA_X, y: MAP_AREA_Y },
      tileSize: TILE_SIZE,
    };

    this.renderMap();
    this.targetingLayer = this.add.container(0, 0);
    this.stagedLayer = this.add.container(0, 0);
    this.renderEnemies();
    this.renderProtagonist();
    this.renderHUD();
    this.renderPanel();
    this.renderOrientationOverlay();
    this.renderDeathOverlay();

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
        const fill = tile.kind === "floor" ? COLOR.floor : COLOR.wall;
        this.add
          .rectangle(px.x, px.y, TILE_SIZE, TILE_SIZE, fill)
          .setOrigin(0, 0)
          .setStrokeStyle(1, COLOR.tileBorder);
      }
    }
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
    this.add
      .rectangle(0, 0, viewport.WORKING_WIDTH, HUD_HEIGHT, COLOR.hudBg)
      .setOrigin(0, 0);

    this.turnIndicatorText = this.add.text(8, 4, "", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: COLOR.text,
    });
    this.hpText = this.add.text(8, 22, "", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: COLOR.text,
    });
    this.turnText = this.add.text(120, 4, "", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: COLOR.text,
    });
    this.apText = this.add.text(120, 22, "", {
      fontFamily: "monospace",
      fontSize: "13px",
      color: COLOR.text,
    });

    // End Turn button — keep its own hit area ≥ 44×44 (visual is smaller)
    const btnW = 88;
    const btnH = 28;
    const btnX = viewport.WORKING_WIDTH - btnW - 8;
    const btnY = (HUD_HEIGHT - btnH) / 2;
    this.endTurnRect = this.add
      .rectangle(btnX, btnY, btnW, btnH, COLOR.buttonBg)
      .setOrigin(0, 0)
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
      .setOrigin(0.5, 0.5);
  }

  private renderPanel(): void {
    this.add
      .rectangle(
        0,
        PANEL_Y,
        viewport.WORKING_WIDTH,
        PANEL_HEIGHT,
        COLOR.panelBg,
      )
      .setOrigin(0, 0)
      .setStrokeStyle(1, COLOR.tileBorder);

    this.panelTitle = this.add.text(12, PANEL_Y + 12, "", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: COLOR.text,
    });
    this.panelLine1 = this.add.text(12, PANEL_Y + 36, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: COLOR.text,
    });
    this.panelLine2 = this.add.text(12, PANEL_Y + 56, "", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: COLOR.textDim,
    });

    // Single action button slot. Text and color change with mode:
    //   "Confirm Move" — when a move is staged
    //   "Confirm Attack" — when an attack is staged
    //   "Attack (2 AP)" — when an adjacent enemy is selected and AP allows
    //   hidden — otherwise
    const btnW = 132;
    const btnH = 36;
    const btnX = viewport.WORKING_WIDTH - btnW - 12;
    const btnY = PANEL_Y + (PANEL_HEIGHT - btnH) / 2;
    this.actionRect = this.add
      .rectangle(btnX, btnY, btnW, btnH, COLOR.buttonBg)
      .setOrigin(0, 0)
      .setInteractive(
        new Phaser.Geom.Rectangle(0, 0, btnW, btnH),
        Phaser.Geom.Rectangle.Contains,
      )
      .setVisible(false);
    this.actionRect.on("pointerdown", () => this.handleActionButton());
    this.actionLabel = this.add
      .text(btnX + btnW / 2, btnY + btnH / 2, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: COLOR.text,
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false);
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
    this.orientationOverlay.setDepth(1000).setVisible(false);
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
    this.deathOverlay.setDepth(1001).setVisible(false);
  }

  // ----- Refresh routines -----

  private refreshAll(): void {
    this.refreshTargeting();
    this.refreshHpBars();
    this.refreshHUD();
    this.refreshTurnIndicator();
    this.refreshEndTurnVisual();
    this.refreshPanel();
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
    if (!this.staged) return null;
    if (this.staged.kind === "move") return this.staged.pos;
    const targetId = this.staged.targetId;
    const e = this.state.enemies.find((x) => x.id === targetId);
    return e?.position ?? null;
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
    // Update positions of surviving enemies.
    for (const enemy of this.state.enemies) {
      const sprite = this.enemySprites.get(enemy.id);
      if (!sprite) continue;
      const px = tileToPixel(enemy.position, this.gridCfg);
      sprite.setPosition(px.x + TILE_SIZE / 2, px.y + TILE_SIZE / 2);
      const bar = this.enemyHpBars.get(enemy.id);
      if (bar) {
        const barX = px.x + (TILE_SIZE - HP_BAR_WIDTH) / 2;
        const barY = px.y + HP_BAR_OFFSET_Y;
        bar.bg.setPosition(barX, barY);
        bar.fg.setPosition(barX, barY);
      }
    }
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
    if (this.selection.kind === "protagonist") {
      this.panelTitle.setText("Protagonist");
      this.panelLine1.setText(
        `HP ${Math.max(0, this.state.protagonist.currentHP)}/${this.state.protagonist.maxHP} · AP ${this.state.protagonist.currentAP}/${this.state.protagonist.maxAP}`,
      );
      this.panelLine2.setText(
        `Position (${this.state.protagonist.position.col}, ${this.state.protagonist.position.row})`,
      );
    } else if (this.selection.kind === "enemy") {
      const enemyId = this.selection.id;
      const found = this.state.enemies.find((e) => e.id === enemyId);
      if (found) {
        this.panelTitle.setText(
          found.kind === "melee" ? "Melee alien" : "Ranged alien",
        );
        this.panelLine1.setText(
          `HP ${Math.max(0, found.currentHP)}/${found.maxHP} · AP ${found.currentAP}/${found.maxAP}`,
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
      const tile =
        this.state.map.tiles[this.selection.pos.row]?.[this.selection.pos.col];
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
    this.refreshActionButton();
    this.refreshStagedHalo();
  }

  private refreshActionButton(): void {
    const mode = this.computeActionMode();
    this.currentActionMode = mode;
    if (mode === "hidden") {
      this.actionRect.setVisible(false);
      this.actionLabel.setVisible(false);
      return;
    }
    this.actionRect.setVisible(true);
    this.actionLabel.setVisible(true);
    if (mode === "confirm-move") {
      this.actionLabel.setText("Confirm Move").setColor(COLOR.text);
      this.actionRect.setFillStyle(COLOR.buttonBg);
    } else if (mode === "confirm-attack") {
      this.actionLabel.setText("Confirm Attack").setColor(COLOR.text);
      this.actionRect.setFillStyle(COLOR.buttonBgAttack);
    } else {
      this.actionLabel
        .setText(`Attack (${balance.ATTACK_AP_COST} AP)`)
        .setColor(COLOR.text);
      this.actionRect.setFillStyle(COLOR.buttonBgAttack);
    }
  }

  private computeActionMode(): ActionMode {
    if (this.state.activeTurn !== "player") return "hidden";
    if (this.state.protagonist.currentHP <= 0) return "hidden";
    if (this.staged?.kind === "move") {
      if (
        this.selection.kind === "tile" &&
        this.selection.pos.col === this.staged.pos.col &&
        this.selection.pos.row === this.staged.pos.row
      ) {
        return "confirm-move";
      }
      return "hidden";
    }
    if (this.staged?.kind === "attack") {
      if (
        this.selection.kind === "enemy" &&
        this.selection.id === this.staged.targetId
      ) {
        return "confirm-attack";
      }
      return "hidden";
    }
    // No stage: maybe show "Attack (2 AP)" if selection is an adjacent enemy
    // and player has the AP.
    if (this.selection.kind === "enemy") {
      const enemyId = this.selection.id;
      const target = this.state.enemies.find((e) => e.id === enemyId);
      if (!target) return "hidden";
      const dist =
        Math.abs(target.position.col - this.state.protagonist.position.col) +
        Math.abs(target.position.row - this.state.protagonist.position.row);
      if (
        dist === 1 &&
        this.state.protagonist.currentAP >= balance.ATTACK_AP_COST
      ) {
        return "stage-attack";
      }
    }
    return "hidden";
  }

  // ----- Input handling -----

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.isOrientationLocked) return;
    if (this.isAnimating) return;
    if (this.state.protagonist.currentHP <= 0) return;
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

  /** Single click handler for the panel action button. */
  private handleActionButton(): void {
    if (this.isInputLocked) return;
    switch (this.currentActionMode) {
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
      case "hidden":
        break;
    }
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
    const px = tileToPixel(this.state.protagonist.position, this.gridCfg);
    this.protagonistSprite.setPosition(
      px.x + TILE_SIZE / 2,
      px.y + TILE_SIZE / 2,
    );
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
      this.flashSprite(targetSprite, COLOR.enemyMelee);
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
