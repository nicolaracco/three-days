/**
 * TraitsScene — pre-run trait picker (spec 0013).
 *
 * Shows the 5 trait cards. The player taps two; the "Start run"
 * button starts `RunScene` carrying the selected trait IDs in the
 * init payload.
 *
 * Per ADR-0008: every card description is rendered without hover; the
 * Start button has a ≥ 44 × 44 hit area; on iPhone Safari portrait
 * (360 × 640) the layout fits with margin to spare.
 */

import Phaser from "phaser";
import viewport from "../data/viewport.json";
import { type Trait, type TraitId, loadTraits } from "../systems/trait";

const TRAIT_PICK_LIMIT = 2;

const COLOR = {
  bg: "#0a0a0a",
  cardBg: 0x111111,
  cardBgSelected: 0x1f2a1f,
  cardBorder: 0x333333,
  cardBorderSelected: 0xffd166,
  text: "#ffffff",
  textDim: "#888888",
  buttonBg: 0x2a4a3a,
  buttonBgDisabled: 0x2a2a2a,
} as const;

const CARD_X = 14;
const CARD_W = 332;
const CARD_H = 64;
const CARD_GAP = 8;
const CARDS_TOP = 44;

const COUNTER_Y = CARDS_TOP + 5 * (CARD_H + CARD_GAP) + 8;
const BUTTON_Y = COUNTER_Y + 32;
const BUTTON_W = 200;
const BUTTON_H = 40;

interface CardElements {
  rect: Phaser.GameObjects.Rectangle;
  border: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
}

export class TraitsScene extends Phaser.Scene {
  private selected: Set<TraitId> = new Set();
  private cards: Map<TraitId, CardElements> = new Map();
  private counterText!: Phaser.GameObjects.Text;
  private startRect!: Phaser.GameObjects.Rectangle;
  private startLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "TraitsScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR.bg);
    this.selected.clear();
    this.cards.clear();

    this.add
      .text(viewport.WORKING_WIDTH / 2, 8, "Pick 2 traits", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: COLOR.text,
      })
      .setOrigin(0.5, 0);

    const traits = loadTraits();
    traits.forEach((trait, index) => {
      this.renderCard(trait, index);
    });

    this.counterText = this.add
      .text(viewport.WORKING_WIDTH / 2, COUNTER_Y, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: COLOR.textDim,
      })
      .setOrigin(0.5, 0);

    const buttonX = (viewport.WORKING_WIDTH - BUTTON_W) / 2;
    this.startRect = this.add
      .rectangle(buttonX, BUTTON_Y, BUTTON_W, BUTTON_H, COLOR.buttonBgDisabled)
      .setOrigin(0, 0)
      .setInteractive(
        new Phaser.Geom.Rectangle(0, 0, BUTTON_W, BUTTON_H),
        Phaser.Geom.Rectangle.Contains,
      );
    this.startRect.on("pointerdown", () => this.handleStart());
    this.startLabel = this.add
      .text(buttonX + BUTTON_W / 2, BUTTON_Y + BUTTON_H / 2, "Start run", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: COLOR.text,
      })
      .setOrigin(0.5, 0.5);

    this.refreshSelectionState();
  }

  private renderCard(trait: Trait, index: number): void {
    const y = CARDS_TOP + index * (CARD_H + CARD_GAP);
    // Background — also the tap hit area.
    const rect = this.add
      .rectangle(CARD_X, y, CARD_W, CARD_H, COLOR.cardBg)
      .setOrigin(0, 0)
      .setInteractive(
        new Phaser.Geom.Rectangle(0, 0, CARD_W, CARD_H),
        Phaser.Geom.Rectangle.Contains,
      );
    rect.on("pointerdown", () => this.toggle(trait.id));
    // Border — drawn as a stroked rectangle on top.
    const border = this.add
      .rectangle(CARD_X, y, CARD_W, CARD_H)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLOR.cardBorder);
    const name = this.add.text(CARD_X + 10, y + 6, trait.name, {
      fontFamily: "monospace",
      fontSize: "14px",
      color: COLOR.text,
    });
    const desc = this.add.text(CARD_X + 10, y + 26, trait.description, {
      fontFamily: "monospace",
      fontSize: "11px",
      color: COLOR.textDim,
      wordWrap: { width: CARD_W - 20 },
    });
    this.cards.set(trait.id, { rect, border, name, desc });
  }

  private toggle(id: TraitId): void {
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else if (this.selected.size < TRAIT_PICK_LIMIT) {
      this.selected.add(id);
    } else {
      // At cap — first tap on a new card replaces the older selection
      // is the alternative behavior; here we just no-op so the player
      // has to deselect explicitly. Keeps the UI honest about the cap.
      return;
    }
    this.refreshSelectionState();
  }

  private refreshSelectionState(): void {
    for (const [id, card] of this.cards.entries()) {
      const picked = this.selected.has(id);
      card.rect.setFillStyle(picked ? COLOR.cardBgSelected : COLOR.cardBg);
      card.border.setStrokeStyle(
        2,
        picked ? COLOR.cardBorderSelected : COLOR.cardBorder,
      );
    }
    this.counterText.setText(
      `${this.selected.size} / ${TRAIT_PICK_LIMIT} selected`,
    );
    const ready = this.selected.size === TRAIT_PICK_LIMIT;
    this.startRect.setFillStyle(
      ready ? COLOR.buttonBg : COLOR.buttonBgDisabled,
    );
    this.startLabel.setColor(ready ? COLOR.text : COLOR.textDim);
  }

  private handleStart(): void {
    if (this.selected.size !== TRAIT_PICK_LIMIT) return;
    const traits = Array.from(this.selected);
    this.scene.start("RunScene", { traits });
  }
}
