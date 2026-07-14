---
name: deploy-prod
description: Manual break-glass deploy of the Ensemble app to PRODUCTION (ensemble.brndn.zip) — for when CI is down or you need to force a known-good build off-pipeline. NORMAL deploys are automatic: a merge to main auto-ships via the CI deploy job (DOCTRINE §6, CD). This skill is the awake, gated fallback — full validate + clean tree, show exactly what's shipping, pause for one explicit "go", deploy, verify the public origin.
---

# Deploy to prod

**Normal deploys are automatic (CD).** `main` is continuously deployed — a green PR merge auto-ships
to `ensemble.brndn.zip` via the CI `deploy` job (DOCTRINE §6). **Reach for this skill only as
break-glass:** CI itself is down, or you need to force a known-good build off-pipeline (e.g. after a
prod box rebuild). First consider the lighter options — a `git revert` → PR (rollback = roll forward)
or a `workflow_dispatch` on `main` (redeploy current main, no new commit).

When you do run it: ship the current tree the careful way. Prod is the public origin, so this manual
path stays **gated, not push-button** — run each step, but **stop for an explicit "go" before the
deploy** (the `rsync --delete` over the live web root is the one irreversible act). Ensemble's runtime
is simple — **static files, no DB, no service** — so no backup / migrations / restart, but the public
origin still earns the gate.

**Shared rules in `.claude/skills/DOCTRINE.md`** — §4 (gates), §5 (autonomy), §6 (deploy mechanics:
prod is CD via the CI `deploy` job; this skill is the manual break-glass fallback), §8/§9 (branch/commit).

## Context (so a failure is legible)
- Target **`ensemble.brndn.zip`**: edge **Caddy** terminates TLS and reverse-proxies to
  **nginx**, which serves the app as **static files** from `/var/www/html/`. **No app
  server, no pm2, no DB.** nginx serves the new files the instant rsync finishes —
  nothing to restart, no migrations to run.
- Ops target: rsync over ssh to the scoped **`ensemble-admin`** alias (the
  least-privilege `claude` account, `IdentitiesOnly homelab_nginx`) →
  `/var/www/html/`; `--delete` mirrors the build.
- `scripts/deploy.sh prod` builds (`vite build --mode production`), prints the **Built REV**
  + footprint + the delta vs the live prod site, rsyncs, then **re-verifies the live asset
  hash itself**. It also **refuses a dirty tree** for prod (a built-in backstop to the
  pre-flight gate below).
- **Verification is free:** `vite.config.ts` (`computeBuildRev`) bakes the revision into
  every asset filename (`index.<REV>.js`), so the live `index.html` names the exact build
  — the Ensemble equivalent of an `/api/version` SHA. Prod gates on a clean tree, so REV
  is the bare commit short SHA; the deploy script echoes it (`📌 Built REV: …`) and the
  running site is the **only** source of truth (there is no stored deploy ref — §6).

## Steps

1. **Pre-flight — gates + clean state, then report.** Prod ships the working tree to a
   **public origin**, so require a clean, committed `main` pushed to origin:
   - `git status -sb` — must be on **`main`**, clean, and up to date with `origin/main`.
     Any uncommitted edits or non-`main` branch → surface loudly and **stop** (don't
     ship an unreviewed tree to prod).
   - **Full gate suite green** (§4): `npm run validate` (typecheck + knip + jscpd +
     format + `npm test`). A red gate → stop. (If HEAD is a just-merged `main` commit
     CI already ran this, but prod re-verifies locally — cheap insurance for the public
     origin.)
   - **What's about to ship:** read what's *actually* live on prod off the running site
     (the asset hash bakes the rev — there's no ref to trust), and list the delta:
     ```sh
     LIVE=$(curl -s "https://ensemble.brndn.zip/?cb=$(date +%s)" | grep -oE 'index\.[0-9a-f]{7,}(-[0-9a-f]+)?\.js' | head -1 | sed -E 's/^index\.//; s/\.js$//')
     git log --oneline "${LIVE%%-*}..HEAD" 2>/dev/null || echo "(live rev ${LIVE:-unknown} not a local commit)"
     ```
     A `./scripts/deploy.sh prod --dry-run` prints this same delta (its `📦`/`🆕` lines).

2. **GATE — present the plan, get an explicit "go".** Lay out: the commit (SHA +
   subject) going live, the pending-commit list from step 1, that gates are green and
   the tree is clean, and that you'll `rsync --delete` to the live web root. **Wait for
   Brandon's explicit go. Do not touch the prod box until he confirms.** (A dry run is
   available first if useful: `./scripts/deploy.sh prod --dry-run` builds + prints the
   delta + footprint without syncing.)

3. **Deploy.** `./scripts/deploy.sh prod` (or `npm run deploy:prod`). Stream it. Non-zero
   exit (build, dirty-tree refusal, ssh, or the post-deploy verify) → report the failing
   step and **stop** — don't verify a half-deploy. (The `rm -rf dist` happens only after a
   successful rsync.)

4. **Verify — the public origin.** The script already curls the live hash and fails if it
   ≠ the build, but re-confirm independently for the public origin:
   ```sh
   # (a) edge is serving:
   curl -s -o /dev/null -w '%{http_code}' https://ensemble.brndn.zip/        # expect 200
   # (b) the RIGHT build is live — asset hash must equal the Built REV (clean tree
   #     ⇒ HEAD's short SHA; the deploy printed it on the 📌 line):
   curl -s https://ensemble.brndn.zip/ | grep -oE '\.[0-9a-f]{7,}(-[0-9a-f]+)?\.js' | head -1
   #     → must contain ".$(git rev-parse --short HEAD).js"
   ```
   Then a **changed-surface spot-check**: if the release touched a visible surface,
   curl the page and grep for an expected string (e.g. a new control's label), and a
   light **regression check** that the page renders. **Note:** the app mounts client-side
   into a runtime-created container — there is *no* static `<div id="app">` to grep; use a
   real static marker like `<title>Ensemble` or `rel="manifest"`. A **stale asset hash**
   means rsync didn't land or an edge cache is in front — not an app issue (there is no
   app process).

5. **Report** pass/fail. **Green only if** the edge returns **200** and the live asset
   hash equals the **deployed SHA**, and the spot-checks pass. The live prod hash now ==
   HEAD, so `git log <live-prod-sha>..HEAD` (curl the origin to get it) is the pending set
   going forward — no ref to consult. (Normally the CI `deploy` job ships prod on merge; this
   manual run just brought prod to the current tree the same way.)

## If it goes wrong (rollback)
There's no DB and no migration, so rollback is **redeploy the previous good commit** —
static files only, fast and total:
```sh
git checkout <prev-good-sha>   # the previously-live SHA — the deploy's 📦 "Currently live" line
./scripts/deploy.sh prod       # rebuilds + rsyncs the old bundle over the web root
git checkout main
```
- **Edge ≠ 200 but the files are on the box** → it's the Caddy→nginx edge, not the
  build. Check nginx serves `/var/www/html` and Caddy is up; the deploy itself is fine.
- **Stale asset hash** → rsync didn't complete, or an edge/browser cache. Re-run the
  deploy; if the box has the new files, bust the edge cache.

## Why gated, not automatic
Prod is the public origin and the `rsync --delete` over the live web root is
irreversible in the moment. The single human gate (before the deploy) + the full local
validate are the whole point. Per DOCTRINE §5/§6, **the pipeline never deploys prod** —
it merges to `main`; shipping is always Brandon's awake `/deploy-prod` call. (`/deploy-test`
is the low-ceremony, pipeline-runnable counterpart.)
