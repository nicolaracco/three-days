# ADR-0010: Remote preview pipeline (Cloudflare Pages)

**Status:** Accepted
**Date:** 2026-04-26

## Context

ADR-0008 makes iPhone Safari portrait a real ship target, and ADR-0009 makes the iPhone manual play-test a non-skippable step in red-green-verify. Both depend on a public URL that the developer can open on the phone, on demand, for any branch under development. itch.io is the *ship* target (GDD §11.1) but not a good *preview* target — uploads via butler are slow, drafts are single-URL and overwritten on every push, and there is no per-PR isolation.

The real need: push a feature branch from the laptop → a public HTTPS URL exists within ~60 seconds → open it on the phone → play.

## Decision

**Cloudflare Pages**, connected to the GitHub repo with auto-deploy on every push.

### Topology

- One Cloudflare Pages project: `three-days`.
- GitHub integration enabled — every push to any branch triggers a build.
- Production URL: `https://three-days.pages.dev` (mirrors `main`).
- Branch preview URLs: `https://<branch-name>.three-days.pages.dev` (alphanumeric branches; CF Pages slugs the rest).
- Per-build URLs: `https://<commit-hash>.three-days.pages.dev` (immutable, useful for sharing a specific commit).

### Build configuration

- **Framework preset:** Vite.
- **Build command:** `bun install --frozen-lockfile && bun run typecheck && bun run lint && bun test && bun run build`
- **Output directory:** `dist/`
- **Bun version:** pinned via the `BUN_VERSION` environment variable in the CF Pages dashboard, matching the project's `.bun-version` file (Day 1 setup item). No `.nvmrc` — there is no Node in the toolchain (ADR-0001).

The build command **deliberately runs typecheck, lint, and tests before the build**. A failing typecheck, lint, or test fails the deploy — no broken preview. This is the gate ADR-0009 calls for; it lives here instead of in a separate CI system because it keeps the surface area to one tool.

### Workflow

1. `bun run dev` for fast local iteration.
2. `git push origin <branch>` → CF Pages builds → preview URL appears in the GitHub PR conversation (CF Pages bot comment) and on the CF Pages dashboard.
3. Open the URL on iPhone Safari (paste, Continuity tab, or QR via the dashboard) → manual play-test the §12 sub-bars per the spec's Test plan.
4. Merge to `main` → production URL updates automatically.

### Day-7 ship is a separate path

CF Pages stays as the preview target. The Day 7 ship target (GDD §13 Day 7) is itch.io, populated by uploading the same `dist/` artifact via butler. The two pipelines do not compete; CF Pages is for "is this any good?", itch.io is for "is this what we shipped."

## Alternatives considered

- **Netlify / Vercel.** Functionally equivalent — auto-preview-per-PR, free tier, Vite-friendly. Rejected for marginal reasons: Cloudflare's free-tier limits are higher and its CDN edge is the most relevant one for "load this on a phone, anywhere." Either alternative would slot into this ADR with one URL change.
- **GitHub Pages with peaceiris/actions-gh-pages.** Free, in-repo, but per-PR previews require nontrivial workflow YAML and the URLs are uglier (`*.github.io/<repo>/<branch>`). Rejected; not worth the setup tax.
- **itch.io draft channels via butler as the preview target.** Already the *ship* target, so the temptation is real. Rejected because draft channels are single-URL (overwritten on every push), butler uploads are 5–20× slower than CF Pages, and the itch.io player is mediocre on mobile.
- **Local network only (Vite `--host`).** Free, fast, but every iPhone test requires the phone and laptop on the same network. Rejected — fragile, and it doesn't survive testing from a coffee shop.
- **GitHub Actions for CI status checks + CF Pages for deploy.** Strictly more capable (separate green/red checks for typecheck, lint, test in the PR UI), but doubles configuration. Deferred to follow-up; the consolidated build command is enough for now.

## Consequences

- Positive: Iteration loop is real. Push → preview URL → iPhone test → merge.
- Positive: HTTPS by default — required for several Web APIs, and avoids iOS Safari's HTTP-only quirks.
- Positive: Failing tests block the preview, so the iPhone manual play-test never fights a known-broken build.
- Positive: Day 7 ship workflow is undisturbed. CF Pages and itch.io do separate jobs.
- Negative: One external account to manage (Cloudflare). Free, but requires a sign-up and GitHub OAuth.
- Negative: The build runs `bun install` from cold every time. CF Pages caches `node_modules`, but cold builds are ~30–60s; warm builds are ~10–20s. Bun's install is materially faster than pnpm's, so this is rarely a bottleneck.
- Negative: `bun test` runs in CF Pages's CI environment, not locally; any DOM-touching test must work without devtools attached. ADR-0009's `bun test` setup must be CI-clean from Day 1.
- Negative: A failing test on a branch produces a no-deploy state — the developer must read CF Pages logs to learn why. Mitigated by the consolidated build command running locally too (`bun run typecheck && bun run lint && bun test && bun run build` is what CI runs; if it passes locally, the deploy passes).

## Verification

- A Cloudflare Pages project named `three-days` exists, connected to the GitHub repo.
- The build command in CF Pages dashboard exactly matches the one in this ADR.
- A push to a feature branch produces a preview URL within ~60s of the push.
- The preview URL serves the latest `dist/` over HTTPS.
- Forcing a `bun test` failure on a branch causes the deploy to fail; no preview URL is published for the broken commit.
- The implementer agent's task report includes the preview URL for any UI-touching change.

## Setup steps (Day 1)

These are the one-time setup items for the GDD §13 Day 1 deliverables:

1. Create or sign in to a Cloudflare account.
2. Create a Pages project named `three-days`. Connect it to the GitHub repo.
3. Configure: framework preset Vite; build command `bun install --frozen-lockfile && bun run typecheck && bun run lint && bun test && bun run build`; output `dist/`. Set `BUN_VERSION` env var to match the repo's `.bun-version`.
4. Push a hello-world commit to `main`. Confirm `https://three-days.pages.dev` serves it.
5. Push a throwaway branch. Confirm `https://<branch>.three-days.pages.dev` serves it.
6. Open both URLs on iPhone Safari to confirm reachability.

Once these six steps work, the preview pipeline is "real" and ADR-0010 is honored.

## Follow-ups

- ~~GDD §13 Day 1 currently says *"Hello-world commit pushed to itch.io as draft."*~~ **Done (GDD v0.3, 2026-04-26):** Day 1's deliverable is now *"Hello-world deployed to Cloudflare Pages production URL and verified on iPhone Safari portrait."* itch.io is deferred to its native home — Day 7 (the ship target). CF Pages owns the build-week iPhone test loop; itch.io owns the public ship.
- Optional: add a `.github/workflows/ci.yml` that runs typecheck/lint/test as separate PR status checks. CF Pages's consolidated build is enough for now; this is a quality-of-life upgrade, not a correctness one.
- Optional: automate the Day 7 itch.io upload via a GitHub Actions job using `butler push`. Requires `ITCH_API_KEY` in repo secrets. Defer to Day 6/7.
- Optional: a custom domain (e.g. `three-days.example.com`) once the project has one. Free with Cloudflare; not load-bearing.
