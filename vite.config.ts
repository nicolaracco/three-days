import { execSync } from "node:child_process";
import { defineConfig } from "vite";

/**
 * Resolve the short commit SHA at build time. Spec 0008 fallback chain:
 *   1. `WORKERS_CI_COMMIT_SHA` (set by Cloudflare Workers Builds)
 *   2. `git rev-parse --short HEAD` (local builds inside a git checkout)
 *   3. literal `"dev"` (no env var, no git, no checkout)
 */
function resolveBuildSha(): string {
  const fromEnv = process.env.WORKERS_CI_COMMIT_SHA;
  if (fromEnv && fromEnv.length > 0) return fromEnv.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
  define: {
    __BUILD_SHA__: JSON.stringify(resolveBuildSha()),
  },
});
