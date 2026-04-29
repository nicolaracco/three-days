import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create(): void {
    // Spec 0013: pre-run trait picker between Boot and Run.
    this.scene.start("TraitsScene");
  }
}
