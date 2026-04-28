/**
 * Build-time metadata. `__BUILD_SHA__` is replaced by Vite's `define`
 * (see `vite.config.ts`) at production build and during `bun run dev`.
 *
 * Bun's test runner does not run Vite, so the global is undefined at
 * test time — the try/catch resolves it to `"dev"` instead of a
 * ReferenceError. Keep this module Phaser-free so tests can import it
 * without dragging in the rendering layer.
 */

declare const __BUILD_SHA__: string;

function readBuildSha(): string {
  try {
    return __BUILD_SHA__;
  } catch {
    return "dev";
  }
}

export const BUILD_SHA: string = readBuildSha();
