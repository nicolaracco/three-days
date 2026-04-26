/**
 * RunScene — the playable scene.
 *
 * Spec 0002 substrate (rendering, selection, action targeting, confirm
 * flow, orientation overlay) is unchanged. Spec 0003 adds:
 *
 * - One melee enemy on the map (placeholder warm-red circle).
 * - Tapping the enemy moves selection to it; panel shows kind / position / AP.
 * - The enemy's tile is excluded from the reachable set; targeting overlays
 *   skip it.
 * - Top HUD turn-order indicator ("Your turn" / "Enemy turn").
 * - End Turn flow: advanceTurn → step the enemy with a 200 ms delay between
 *   tile moves → advanceTurn back to the player.
 * - End Turn button is greyed and non-interactive during the enemy turn.
 * - Tile taps still update the selection during enemy turn (reads are free)
 *   but cannot stage or commit moves.
 *
 * Per ADR-0008: tile interaction goes through a single scene-level
 * `pointerdown` handler that calls `pixelToTile`. Tiles are dumb
 * rectangles — no `setInteractive` per tile. Buttons (irregular UI) keep
 * their own ≥ 44×44 hit areas.
 *
 * Per ADR-0004: scene logic stays thin. State changes call into pure
 * reducers in `systems/run-state.ts` and `systems/turn.ts`.
 */

import Phaser from "phaser";
import viewport from "../data/viewport.json";
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
import { enemyStep } from "../systems/turn";

const TILE_SIZE = viewport.TILE_SIZE;
const MAP_WIDTH_TILES = 11;
const MAP_AREA_X = Math.floor(
  (viewport.WORKING_WIDTH - MAP_WIDTH_TILES * TILE_SIZE) / 2,
);
const MAP_AREA_Y = viewport.MAP_AREA_TOP;
const HUD_HEIGHT = viewport.HUD_HEIGHT;
const PANEL_HEIGHT = viewport.PANEL_HEIGHT;
const PANEL_Y = viewport.WORKING_HEIGHT - PANEL_HEIGHT;

const ENEMY_STEP_DELAY_MS = 200;

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
  buttonBgDisabled: 0x2a2a2a,
  text: "#ffffff",
  textDim: "#888888",
  apLabel: "#ffd166",
  enemyTurnLabel: "#e57373",
} as const;

type Selection =
  | { kind: "protagonist" }
  | { kind: "tile"; pos: TilePos }
  | { kind: "enemy"; id: string };

export class RunScene extends Phaser.Scene {
  private state!: RunState;
  private gridCfg!: GridConfig;
  private staged: TilePos | null = null;
  private selection: Selection = { kind: "protagonist" };
  private isOrientationLocked = false;

  private targetingLayer!: Phaser.GameObjects.Container;
  private stagedLayer!: Phaser.GameObjects.Container;
  private protagonistSprite!: Phaser.GameObjects.Arc;
  private enemySprites: Map<string, Phaser.GameObjects.Arc> = new Map();

  private turnIndicatorText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private apText!: Phaser.GameObjects.Text;
  private endTurnRect!: Phaser.GameObjects.Rectangle;
  private endTurnLabelText!: Phaser.GameObjects.Text;

  private panelTitle!: Phaser.GameObjects.Text;
  private panelLine1!: Phaser.GameObjects.Text;
  private panelLine2!: Phaser.GameObjects.Text;
  private confirmRect!: Phaser.GameObjects.Rectangle;
  private confirmLabel!: Phaser.GameObjects.Text;

  private orientationOverlay!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: "RunScene" });
  }

  /** Single source of truth for "is the player allowed to interact?" */
  private get isInputLocked(): boolean {
    return this.isOrientationLocked || this.state.activeTurn === "enemy";
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

    this.input.on("pointerdown", this.handlePointerDown, this);
    this.events.on("selection-changed", this.refreshPanel, this);
    this.events.on("move-staged", this.refreshStagedHalo, this);
    this.events.on("move-committed", this.afterPlayerMove, this);
    this.events.on("turn-changed", this.afterTurnChange, this);
    this.events.on("enemy-moved", this.afterEnemyStep, this);

    this.scale.on("orientationchange", this.checkOrientation, this);
    this.checkOrientation();

    this.refreshTargeting();
    this.refreshPanel();
    this.refreshHUD();
    this.refreshTurnIndicator();
    this.refreshEndTurnVisual();
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
  }

  private renderHUD(): void {
    this.add
      .rectangle(0, 0, viewport.WORKING_WIDTH, HUD_HEIGHT, COLOR.hudBg)
      .setOrigin(0, 0);

    this.turnIndicatorText = this.add.text(8, 12, "", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: COLOR.text,
    });
    this.turnText = this.add.text(120, 12, "", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: COLOR.text,
    });
    this.apText = this.add.text(160, 12, "", {
      fontFamily: "monospace",
      fontSize: "16px",
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

    // Confirm button (hidden until a move is staged)
    const btnW = 96;
    const btnH = 36;
    const btnX = viewport.WORKING_WIDTH - btnW - 12;
    const btnY = PANEL_Y + (PANEL_HEIGHT - btnH) / 2;
    this.confirmRect = this.add
      .rectangle(btnX, btnY, btnW, btnH, COLOR.buttonBg)
      .setOrigin(0, 0)
      .setInteractive(
        new Phaser.Geom.Rectangle(0, 0, btnW, btnH),
        Phaser.Geom.Rectangle.Contains,
      )
      .setVisible(false);
    this.confirmRect.on("pointerdown", () => this.commitStaged());
    this.confirmLabel = this.add
      .text(btnX + btnW / 2, btnY + btnH / 2, "Confirm", {
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

  // ----- Refresh routines -----

  private refreshTargeting(): void {
    this.targetingLayer.removeAll(true);
    // Hide the targeting projection during the enemy's turn — the player
    // can't move, so showing reachable tiles would be misleading.
    if (this.state.activeTurn !== "player") return;
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
    const px = tileToPixel(this.staged, this.gridCfg);
    const halo = this.add
      .rectangle(px.x, px.y, TILE_SIZE, TILE_SIZE)
      .setOrigin(0, 0)
      .setStrokeStyle(3, COLOR.stagedHaloStroke);
    this.stagedLayer.add(halo);
  }

  private refreshHUD(): void {
    this.turnText.setText(`T${this.state.turn}`);
    this.apText.setText(
      `AP ${this.state.protagonist.currentAP}/${this.state.protagonist.maxAP}`,
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
    const enemyTurn = this.state.activeTurn === "enemy";
    this.endTurnRect.setFillStyle(
      enemyTurn ? COLOR.buttonBgDisabled : COLOR.buttonBg,
    );
    this.endTurnLabelText.setColor(enemyTurn ? COLOR.textDim : COLOR.text);
  }

  private refreshEnemySprites(): void {
    for (const enemy of this.state.enemies) {
      const sprite = this.enemySprites.get(enemy.id);
      if (!sprite) continue;
      const px = tileToPixel(enemy.position, this.gridCfg);
      sprite.setPosition(px.x + TILE_SIZE / 2, px.y + TILE_SIZE / 2);
    }
  }

  private refreshPanel(): void {
    if (this.selection.kind === "protagonist") {
      this.panelTitle.setText("Protagonist");
      this.panelLine1.setText(
        `AP ${this.state.protagonist.currentAP}/${this.state.protagonist.maxAP}`,
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
        this.panelLine1.setText(`AP ${found.currentAP}/${found.maxAP}`);
        this.panelLine2.setText(
          `Position (${found.position.col}, ${found.position.row})`,
        );
      } else {
        this.panelTitle.setText("Enemy");
        this.panelLine1.setText("(no longer present)");
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
    this.refreshConfirmVisibility();
  }

  private refreshConfirmVisibility(): void {
    const showConfirm =
      this.staged !== null &&
      this.selection.kind === "tile" &&
      this.selection.pos.col === this.staged.col &&
      this.selection.pos.row === this.staged.row &&
      this.state.activeTurn === "player";
    this.confirmRect.setVisible(showConfirm);
    this.confirmLabel.setVisible(showConfirm);
  }

  // ----- Input handling -----

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.isOrientationLocked) return;
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
      this.setSelection({ kind: "enemy", id: enemy.id });
      this.clearStaged();
      return;
    }

    // During enemy turn, taps still update selection (read-only) but
    // can't stage moves.
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
      this.staged !== null &&
      this.staged.col === tile.col &&
      this.staged.row === tile.row
    ) {
      this.commitStaged();
    } else {
      this.staged = tile;
      this.setSelection({ kind: "tile", pos: tile });
      this.events.emit("move-staged", { from: protagonist, to: tile, cost });
    }
  }

  private setSelection(sel: Selection): void {
    this.selection = sel;
    this.events.emit("selection-changed", { selection: sel });
  }

  private clearStaged(): void {
    this.staged = null;
    this.refreshStagedHalo();
    this.refreshConfirmVisibility();
  }

  private commitStaged(): void {
    if (!this.staged) return;
    if (this.state.activeTurn !== "player") return;
    const target = this.staged;
    const result = commitMove(this.state, target);
    if (!result.ok) return;
    const from = this.state.protagonist.position;
    this.state = result.state;
    this.staged = null;
    this.setSelection({ kind: "protagonist" });
    this.events.emit("move-committed", {
      from,
      to: target,
      cost: apCostToReach(from, target, this.state.map, enemyTiles(this.state)),
    });
  }

  private afterPlayerMove(): void {
    const px = tileToPixel(this.state.protagonist.position, this.gridCfg);
    this.protagonistSprite.setPosition(
      px.x + TILE_SIZE / 2,
      px.y + TILE_SIZE / 2,
    );
    this.refreshTargeting();
    this.refreshStagedHalo();
    this.refreshHUD();
  }

  // ----- Turn cycle -----

  private endTurnAction(): void {
    if (this.isInputLocked) return;
    if (this.state.activeTurn !== "player") return;
    // Player → enemy
    this.state = advanceTurn(this.state);
    this.staged = null;
    this.setSelection({ kind: "protagonist" });
    this.events.emit("turn-changed", {
      activeTurn: this.state.activeTurn,
      turn: this.state.turn,
    });
    this.startEnemyTurnLoop();
  }

  private afterTurnChange(): void {
    this.refreshTurnIndicator();
    this.refreshEndTurnVisual();
    this.refreshTargeting();
    this.refreshStagedHalo();
    this.refreshHUD();
  }

  private startEnemyTurnLoop(): void {
    this.runEnemiesSequentially(0);
  }

  private runEnemiesSequentially(enemyIndex: number): void {
    if (enemyIndex >= this.state.enemies.length) {
      this.finishEnemyTurn();
      return;
    }
    const enemy = this.state.enemies[enemyIndex];
    this.tryEnemyStep(enemy.id, enemyIndex);
  }

  private tryEnemyStep(enemyId: string, enemyIndex: number): void {
    const before = this.state.enemies.find((e) => e.id === enemyId)?.position;
    const result = enemyStep(this.state, enemyId);
    if (!result.moved) {
      this.runEnemiesSequentially(enemyIndex + 1);
      return;
    }
    this.state = result.state;
    const after = this.state.enemies.find((e) => e.id === enemyId)?.position;
    this.events.emit("enemy-moved", { enemyId, from: before, to: after });
    this.time.delayedCall(ENEMY_STEP_DELAY_MS, () =>
      this.tryEnemyStep(enemyId, enemyIndex),
    );
  }

  private afterEnemyStep(): void {
    this.refreshEnemySprites();
    // If the active selection is the moving enemy, refresh its panel.
    if (this.selection.kind === "enemy") {
      this.refreshPanel();
    }
  }

  private finishEnemyTurn(): void {
    // Enemy → player
    this.state = advanceTurn(this.state);
    this.events.emit("turn-changed", {
      activeTurn: this.state.activeTurn,
      turn: this.state.turn,
    });
    // Reset selection to the protagonist for a clean turn start.
    this.setSelection({ kind: "protagonist" });
  }

  // ----- Orientation -----

  private checkOrientation(): void {
    const isPortrait = this.scale.isPortrait;
    this.orientationOverlay.setVisible(!isPortrait);
    this.isOrientationLocked = !isPortrait;
  }
}
