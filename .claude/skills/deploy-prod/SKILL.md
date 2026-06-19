---
name: deploy-prod
description: Deploy the Ensemble app to PRODUCTION (ensemble.brndn.zip) the gated way — full validate + clean pushed main, show exactly what's shipping, pause for one explicit "go", then deploy and verify the public origin. PROD — more ceremony than /deploy-test; never auto-runs. A merge to main is NOT a prod deploy.
---

# Deploy to prod

Ship the current tree to **production** (`ensemble.brndn.zip`) the careful way. Prod is
the public origin, so this is **gated, not push-button**: run each step, but **stop for
an explicit "go" before the deploy** (the `rsync --delete` over the live web root is the
one irreversible act). Ensemble's runtime is simple — **static files, no DB, no service**
— so this is far lighter than a DB-backed app's ritual (no backup, no migrations, no
restart), but the public origin still earns the gate.

**Shared rules in `.claude/skills/DOCTRINE.md`** — §4 (gates), §5 (a prod deploy is an
always-brake, awake-only judgment call), §6 (deploy mechanics: `deploy-prod.sh` is
always a manual call; a merge to `main` ships nothing on its own), §8/§9 (branch/commit).

## Context (so a failure is legible)
- Target **`ensemble.brndn.zip`**: edge **Caddy** terminates TLS and reverse-proxies to
  **nginx**, which serves the app as **static files** from `/var/www/html/`. **No app
  server, no pm2, no DB.** nginx serves the new files the instant rsync finishes —
  nothing to restart, no migrations to run.
- Ops target: rsync over ssh to the scoped **`ensemble-admin`** alias (the
  least-privilege `claude` account, `IdentitiesOnly homelab_nginx`) →
  `/var/www/html/`; `--delete` mirrors the build.
- `scripts/deploy-prod.sh` builds (`vite build --mode production`), prints the footprint,
  rsyncs, then moves **`refs/deploys/prod`** to HEAD (best-effort origin push).
- **Verification is free:** `vite.config.ts` (`computeBuildRev`) bakes the revision into
  every asset filename (`main.<REV>.js`), so the live `index.html` names the exact build
  — the Ensemble equivalent of an `/api/version` SHA. Prod gates on a clean tree, so REV
  is the bare commit short SHA; the deploy script also echoes it (`📌 Built REV: …`).
  (A dirty tree would stamp `<head>-<sig>` — but prod refuses to ship dirty.)

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
   - **What's about to ship:** fetch the deploy refs and list the pending commits:
     ```sh
     git fetch -q origin '+refs/deploys/*:refs/deploys/*' 2>/dev/null || true
     git log --oneline refs/deploys/prod..HEAD 2>/dev/null || echo "(no prod deploy ref yet — this deploy sets it)"
     ```

2. **GATE — present the plan, get an explicit "go".** Lay out: the commit (SHA +
   subject) going live, the pending-commit list from step 1, that gates are green and
   the tree is clean, and that you'll `rsync --delete` to the live web root. **Wait for
   Brandon's explicit go. Do not touch the prod box until he confirms.** (A dry run is
   available first if useful: `./scripts/deploy-prod.sh --dry-run` builds + prints the
   footprint without syncing.)

3. **Deploy.** `./scripts/deploy-prod.sh`. Stream it. Non-zero exit (build or ssh) →
   report the failing step and **stop** — don't verify a half-deploy. (The `rm -rf dist`
   and the `refs/deploys/prod` move happen only after a successful rsync.)

4. **Verify — the public origin.**
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
   light **regression check** that the chart still renders
   (`curl -s https://ensemble.brndn.zip/ | grep -o '<div id="app"'` or a known stable
   marker). A **stale asset hash** means rsync didn't land or an edge cache is in front
   — not an app issue (there is no app process).

5. **Report** pass/fail. **Green only if** the edge returns **200** and the live asset
   hash equals the **deployed SHA**, and the spot-checks pass. Note that
   `refs/deploys/prod` now points at this commit, so `git log refs/deploys/prod..main`
   is the pending set going forward. **A merge to `main` is not a deploy** — this skill
   is the only thing that ships prod.

## If it goes wrong (rollback)
There's no DB and no migration, so rollback is **redeploy the previous good commit** —
static files only, fast and total:
```sh
git checkout <prev-good-sha>   # e.g. the commit refs/deploys/prod pointed at before
./scripts/deploy-prod.sh       # rebuilds + rsyncs the old bundle over the web root
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
