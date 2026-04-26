# ADR-0010: Remote preview pipeline (Cloudflare Workers + Static Assets)

**Status:** Accepted
**Date:** 2026-04-26 (revised same day to track Cloudflare's product reorganization — see "Alternatives" / "Pages classic")

## Context

ADR-0008 makes iPhone Safari portrait a real ship target, and ADR-0009 makes the iPhone manual play-test a non-skippable step in red-green-verify. Both depend on a public URL that the developer can open on the phone, on demand, for any branch under development. itch.io is the *ship* target (GDD §11.1) but not a good *preview* target — uploads via butler are slow, drafts are single-URL and overwritten on every push, and there is no per-PR isolation.

The real need: push a feature branch from the laptop → a public HTTPS URL exists within ~60 seconds → open it on the phone → play.

In April 2026, Cloudflare rolled the older Pages product into Workers + Static Assets, with a unified git-based build experience called **Workers Builds**. New projects default to that flow. The ADR is written against Workers Builds; the legacy "Pages classic" flow is recorded under Alternatives.

## Decision

**Cloudflare Workers + Static Assets, deployed via Workers Builds**, connected to the GitHub repo with auto-deploy on every push.

### Topology

- One Cloudflare Worker: `three-days`.
- GitHub integration enabled — every push to any branch triggers a build + deploy.
- Production URL: `https://three-days.<account>.workers.dev` (mirrors `main`). `<account>` is the developer's Cloudflare account subdomain, set once when the workers.dev subdomain is enabled.
- Branch preview URLs: enabled by `"preview_urls": true` in `wrangler.jsonc`. Pattern: `https://<branch>-three-days.<account>.workers.dev` (Cloudflare slugs branches that contain `/`).
- Per-build URLs: Workers Builds shows the immutable URL for any specific build in the dashboard.
- Custom domains can be attached later, including a `pages.dev`-style alias if desired. Not load-bearing.

### Repo configuration: `wrangler.jsonc`

A `wrangler.jsonc` lives at the repo root. It tells `wrangler deploy` what to upload and how to serve it. Minimum content:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "three-days",
  "compatibility_date": "2026-04-26",
  "assets": {
    "directory": "./dist"
  },
  "preview_urls": true
}
```

- `assets.directory: ./dist` — Vite's build output (ADR-0001).
- `preview_urls: true` — per-branch preview URLs, the iPhone test loop's substrate.
- `compatibility_date` — locks Worker runtime semantics. Update only when intentionally adopting newer behavior.
- No `main` worker script: this is a pure static site; no Worker code is needed.

### Build configuration (Cloudflare dashboard)

- **Build command:** `bun install --frozen-lockfile && bun run typecheck && bun run lint && bun test && bun run build`
- **Deploy command:** `bunx wrangler deploy` (the dashboard's `npx wrangler deploy` default works equally — wrangler is on npm, fetched the same way by either; `bunx` is consistent with the rest of the toolchain).
- **Environment variable:** `BUN_VERSION` set to the value in `.bun-version` (currently `1.3.13`). No `.nvmrc` — there is no Node in the toolchain (ADR-0001).

The build command **deliberately runs typecheck, lint, and tests before producing `dist/`**. A failing typecheck, lint, or test fails the build, the deploy command never runs, and no preview URL is published. This is the gate ADR-0009 calls for; it lives here instead of in a separate CI system because it keeps the surface area to one tool.

### Workflow

1. `bun run dev` for fast local iteration.
2. `git push origin <branch>` → Workers Builds runs build then deploy → preview URL appears in the GitHub PR conversation (Cloudflare bot comment) and on the Workers dashboard.
3. Open the URL on iPhone Safari (paste, Continuity tab, or QR via the dashboard) → manual play-test the §12 sub-bars per the spec's Test plan.
4. Merge to `main` → production URL updates automatically.

### Day-7 ship is a separate path

Workers Builds stays as the preview target. The Day 7 ship target (GDD §13 Day 7) is itch.io, populated by uploading the same `dist/` artifact via butler. The two pipelines do not compete; Workers Builds is for "is this any good?", itch.io is for "is this what we shipped."

## Alternatives considered

- **Cloudflare Pages "classic" git integration (the ADR's previous draft).** Set framework preset to Vite, build command runs the build, output directory `dist/`, no deploy command needed (CF auto-deploys post-build). Rejected only because Cloudflare moved new projects to Workers Builds and is gradually retiring Pages classic. Functionally equivalent for our use case.
- **Netlify / Vercel.** Functionally equivalent — auto-preview-per-PR, free tier, Vite-friendly. Rejected for marginal reasons: Cloudflare's free-tier limits are higher and its CDN edge is the most relevant one for "load this on a phone, anywhere." Either alternative would slot into this ADR with one URL change.
- **GitHub Pages with peaceiris/actions-gh-pages.** Free, in-repo, but per-PR previews require nontrivial workflow YAML and the URLs are uglier (`*.github.io/<repo>/<branch>`). Rejected; not worth the setup tax.
- **itch.io draft channels via butler as the preview target.** Already the *ship* target, so the temptation is real. Rejected because draft channels are single-URL (overwritten on every push), butler uploads are 5–20× slower than Workers Builds, and the itch.io player is mediocre on mobile.
- **Local network only (Vite `--host`).** Free, fast, but every iPhone test requires the phone and laptop on the same network. Rejected — fragile, and it doesn't survive testing from a coffee shop.
- **GitHub Actions for CI status checks + Workers Builds for deploy.** Strictly more capable (separate green/red checks for typecheck, lint, test in the PR UI), but doubles configuration. Deferred to follow-up; the consolidated build command is enough for now.

## Consequences

- Positive: Iteration loop is real. Push → preview URL → iPhone test → merge.
- Positive: HTTPS by default — required for several Web APIs, and avoids iOS Safari's HTTP-only quirks.
- Positive: Failing tests block the build, the deploy command doesn't run, and no broken preview is published. The iPhone manual play-test never fights a known-broken build.
- Positive: `wrangler.jsonc` lives in the repo, so the deploy is reproducible without dashboard archaeology — anyone with the repo and a Cloudflare account can recreate the pipeline.
- Positive: Day 7 ship workflow is undisturbed. Workers Builds and itch.io do separate jobs.
- Negative: One external account to manage (Cloudflare). Free, but requires a sign-up and GitHub OAuth.
- Negative: URL pattern (`<account>.workers.dev`) is uglier than the old `pages.dev`. A custom domain or `pages.dev` alias can replace it later.
- Negative: The build runs `bun install` from cold every time. Workers Builds caches `node_modules`, but cold builds are ~30–60s; warm builds are ~10–20s. Bun's install is materially faster than pnpm's, so this is rarely a bottleneck.
- Negative: `bun test` runs in the Workers Builds CI environment, not locally; any DOM-touching test must work without devtools attached. ADR-0009's `bun test` setup must be CI-clean from Day 1.
- Negative: A failing test on a branch produces a no-deploy state — the developer must read Workers Builds logs to learn why. Mitigated by the consolidated build command running locally too (`bun run typecheck && bun run lint && bun test && bun run build` is what CI runs; if it passes locally, the deploy passes).

## Verification

- `wrangler.jsonc` exists at the repo root with `name: three-days`, `assets.directory: ./dist`, and `preview_urls: true`.
- A Cloudflare Worker named `three-days` exists, connected to the GitHub repo via Workers Builds.
- The dashboard's **Build command** matches the one in this ADR exactly.
- The dashboard's **Deploy command** is `bunx wrangler deploy` (or the default `npx wrangler deploy` — both work).
- The dashboard's **Environment variables** include `BUN_VERSION` matching `.bun-version`.
- A push to a feature branch produces a preview URL within ~60s of the push.
- The preview URL serves the latest `dist/` over HTTPS.
- Forcing a `bun test` failure on a branch causes the build to fail; no preview URL is published for the broken commit.
- The implementer agent's task report includes the preview URL for any UI-touching change.

## Setup steps (Day 1)

These are the one-time setup items for the GDD §13 Day 1 deliverables:

1. Create or sign in to a Cloudflare account.
2. In the dashboard, **Workers & Pages → Create → Connect to Git**. Select the `three-days` GitHub repo.
3. Configure: **Build command** = `bun install --frozen-lockfile && bun run typecheck && bun run lint && bun test && bun run build`; **Deploy command** = `bunx wrangler deploy`; environment variable `BUN_VERSION` set to the value in `.bun-version`. The output directory is implicit — `wrangler.jsonc` already specifies `assets.directory: ./dist`.
4. Save and Deploy. Confirm `https://three-days.<account>.workers.dev` serves the hello-world.
5. Push a throwaway branch. Confirm the per-branch preview URL serves it.
6. Open both URLs on iPhone Safari to confirm reachability.

Once these six steps work, the preview pipeline is "real" and ADR-0010 is honored.

## Follow-ups

- ~~GDD §13 Day 1 currently says *"Hello-world commit pushed to itch.io as draft."*~~ **Done (GDD v0.3, 2026-04-26):** Day 1's deliverable is now *"Hello-world deployed to Cloudflare's production URL and verified on iPhone Safari portrait."* itch.io is deferred to its native home — Day 7 (the ship target). Workers Builds owns the build-week iPhone test loop; itch.io owns the public ship.
- Optional: add a `.github/workflows/ci.yml` that runs typecheck/lint/test as separate PR status checks. The consolidated build command is enough for now; this is a quality-of-life upgrade, not a correctness one.
- Optional: automate the Day 7 itch.io upload via a GitHub Actions job using `butler push`. Requires `ITCH_API_KEY` in repo secrets. Defer to Day 6/7.
- Optional: attach a custom domain or a `pages.dev` alias to replace the `<account>.workers.dev` URL once the project has one. Free with Cloudflare; not load-bearing.
