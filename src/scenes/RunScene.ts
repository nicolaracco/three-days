/**
 * RunScene — the playable scene for spec 0002.
 *
 * Renders the static `Day1Map`, the protagonist, the action-targeting
 * projection (every reachable tile labeled with its AP cost,
 * simultaneously, per ADR-0008), the top HUD bar (turn + End Turn), the
 * sticky inspection panel (selection details + Confirm button when a
 * move is staged), and the orientation-lock overlay.
 *
 * Per ADR-0008: tile interaction goes through a single scene-level
 * `pointerdown` handler that calls `pixelToTile`. Tiles are dumb
 * rectangles — no `setInteractive` per tile. Buttons (irregular UI) keep
 * their own ≥ 44×44 hit areas.
 *
 * Per ADR-0004: scene logic stays thin. State changes call into pure
 * reducers in `systems/run-state.ts`; visuals refresh from the new
 * state.
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
  commitMove,
  createRunState,
  endTurn,
} from "../systems/run-state";

const TILE_SIZE = viewport.TILE_SIZE;
const MAP_WIDTH_TILES = 11;
const MAP_AREA_X = Math.floor(
  (viewport.WORKING_WIDTH - MAP_WIDTH_TILES * TILE_SIZE) / 2,
);
const MAP_AREA_Y = viewport.MAP_AREA_TOP;
const HUD_HEIGHT = viewport.HUD_HEIGHT;
const PANEL_HEIGHT = viewport.PANEL_HEIGHT;
const PANEL_Y = viewport.WORKING_HEIGHT - PANEL_HEIGHT;

const COLOR = {
  sceneBg: "#0a0a0a",
  floor: 0x2a2a2a,
  wall: 0x000000,
  tileBorder: 0x333333,
  protagonist: 0x4ec1f7,
  reachable: 0x4ec1f7,
  stagedHaloStroke: 0xffd166,
  hudBg: 0x111111,
  panelBg: 0x111111,
  buttonBg: 0x2a4a3a,
  buttonBgDisabled: 0x2a2a2a,
  text: "#ffffff",
  apLabel: "#ffd166",
  dim: "#888888",
} as const;

type Selection = { kind: "protagonist" } | { kind: "tile"; pos: TilePos };

export class RunScene extends Phaser.Scene {
  private state!: RunState;
  private gridCfg!: GridConfig;
  private staged: TilePos | null = null;
  private selection: Selection = { kind: "protagonist" };
  private isInputLocked = false;

  private targetingLayer!: Phaser.GameObjects.Container;
  private stagedLayer!: Phaser.GameObjects.Container;
  private protagonistSprite!: Phaser.GameObjects.Arc;

  private turnText!: Phaser.GameObjects.Text;
  private apText!: Phaser.GameObjects.Text;
  private endTurnRect!: Phaser.GameObjects.Rectangle;

  private panelTitle!: Phaser.GameObjects.Text;
  private panelLine1!: Phaser.GameObjects.Text;
  private panelLine2!: Phaser.GameObjects.Text;
  private confirmRect!: Phaser.GameObjects.Rectangle;
  private confirmLabel!: Phaser.GameObjects.Text;

  private orientationOverlay!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: "RunScene" });
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
    this.renderProtagonist();
    this.renderHUD();
    this.renderPanel();
    this.renderOrientationOverlay();

    this.input.on("pointerdown", this.handlePointerDown, this);
    this.events.on("selection-changed", this.refreshPanel, this);
    this.events.on("move-staged", this.refreshStagedHalo, this);
    this.events.on("move-committed", this.afterMove, this);
    this.events.on("turn-ended", this.afterTurn, this);

    this.scale.on("orientationchange", this.checkOrientation, this);
    this.checkOrientation();

    this.refreshTargeting();
    this.refreshPanel();
    this.refreshHUD();
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

    this.turnText = this.add.text(8, 12, "", {
      fontFamily: "monospace",
      fontSize: "16px",
      color: COLOR.text,
    });
    this.apText = this.add.text(120, 12, "", {
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
          44,
          btnW,
        ),
        Phaser.Geom.Rectangle.Contains,
      );
    this.endTurnRect.on("pointerdown", () => this.endTurnAction());
    this.add
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
      color: COLOR.dim,
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
    const { position, currentAP } = this.state.protagonist;
    const reachable = reachableTiles(
      position,
      currentAP,
      this.state.map,
    ).filter((t) => !(t.col === position.col && t.row === position.row));
    for (const tile of reachable) {
      const px = tileToPixel(tile, this.gridCfg);
      const cost = apCostToReach(position, tile, this.state.map);
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
    this.turnText.setText(`Turn ${this.state.turn}`);
    this.apText.setText(
      `AP ${this.state.protagonist.currentAP}/${this.state.protagonist.maxAP}`,
    );
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
    } else {
      const tile =
        this.state.map.tiles[this.selection.pos.row]?.[this.selection.pos.col];
      const kind = tile?.kind ?? "—";
      const cost = apCostToReach(
        this.state.protagonist.position,
        this.selection.pos,
        this.state.map,
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
      this.selection.pos.row === this.staged.row;
    this.confirmRect.setVisible(showConfirm);
    this.confirmLabel.setVisible(showConfirm);
  }

  // ----- Input handling -----

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.isInputLocked) return;
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

    const cost = apCostToReach(protagonist, tile, this.state.map);
    const reachable =
      Number.isFinite(cost) && cost <= this.state.protagonist.currentAP;

    if (!reachable) {
      this.setSelection({ kind: "tile", pos: tile });
      this.clearStaged();
      return;
    }

    // Reachable: stage or commit
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
    this.events.emit("selection-changed", {
      kind: sel.kind,
      target: sel.kind === "tile" ? sel.pos : null,
    });
  }

  private clearStaged(): void {
    this.staged = null;
    this.refreshStagedHalo();
    this.refreshConfirmVisibility();
  }

  private commitStaged(): void {
    if (!this.staged) return;
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
      cost: apCostToReach(from, target, this.state.map),
    });
  }

  private afterMove(): void {
    const px = tileToPixel(this.state.protagonist.position, this.gridCfg);
    this.protagonistSprite.setPosition(
      px.x + TILE_SIZE / 2,
      px.y + TILE_SIZE / 2,
    );
    this.refreshTargeting();
    this.refreshStagedHalo();
    this.refreshHUD();
  }

  private endTurnAction(): void {
    if (this.isInputLocked) return;
    this.state = endTurn(this.state);
    this.staged = null;
    this.setSelection({ kind: "protagonist" });
    this.events.emit("turn-ended", { turn: this.state.turn });
  }

  private afterTurn(): void {
    this.refreshHUD();
    this.refreshTargeting();
    this.refreshStagedHalo();
  }

  // ----- Orientation -----

  private checkOrientation(): void {
    const isPortrait = this.scale.isPortrait;
    this.orientationOverlay.setVisible(!isPortrait);
    this.isInputLocked = !isPortrait;
  }
}
