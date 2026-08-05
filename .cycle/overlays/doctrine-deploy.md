**Static-file app, CD: `main` IS live.** `vite build` → `rsync --delete dist/` to
`/var/www/html/` on the box — no app server, no DB, no migrations, no restart; nginx
serves the new files the instant rsync finishes. `scripts/deploy.sh <test|prod>` owns
the mechanics for both.

**Prod is continuous.** A push to `main` only happens via a green PR merge (branch-
protected, required CI contexts `CI / checks` + `CI / e2e-tests`), so the CI `deploy`
job ships every merge to `ensemble.brndn.zip` automatically — including unattended
overnight `/burndown`/`/nightly` merges. `/deploy-prod` is now the manual break-glass
path (CI down, or forcing a known-good build), not the normal route.

**Environments:**
- **test** (`ensembletest.brndn.zip`) — the pre-merge audition box; deploy a branch here
  to hear/preview before merging, especially `status:needs-ear` work. Low ceremony, private.
- **prod** (`ensemble.brndn.zip`) — the public origin; CD on merge, or the gated manual
  `/deploy-prod` break-glass path.

**Verification is free, and it's the whole trick:** `vite.config.ts`'s `computeBuildRev`
bakes the revision into every asset filename (`index.<REV>.js`), so the live `index.html`
names the exact build. There is **no stored deploy ref** — the running site is the only
source of truth; `scripts/deploy.sh` curls it before (to print the real delta) and after
(to verify the right bundle landed).

**Rollback = roll forward:** no DB, no migration, so `git revert` → PR → green → the CI
deploy job redeploys (or a manual `workflow_dispatch` on `main`, no new commit).
