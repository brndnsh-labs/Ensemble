## Topology

- **Test** — `ensembletest.brndn.zip`: edge **Caddy** terminates TLS, reverse-proxies to
  **nginx**, which serves the app as **static files** out of `/var/www/html/`. No app
  server, no DB — nginx serves the new files the instant rsync finishes, nothing to
  restart. SSH alias **`ensembletest-admin`** (least-privilege `claude` account,
  `IdentitiesOnly homelab_nginx`). Private, low-ceremony — the pre-merge audition box.
- **Prod** — `ensemble.brndn.zip`: same static-file topology, SSH alias
  **`ensemble-admin`**. **Continuously deployed** — a green PR merge (branch-protected)
  triggers the CI `deploy` job, which ships automatically. `/deploy-prod` is the manual
  break-glass path (CI down, or forcing a known-good build), not the normal route.
- Both: `scripts/deploy.sh <test|prod>` builds (`vite build --mode <test|production>`),
  prints the **Built REV** + footprint + the delta vs. the live site, `rsync --delete`s,
  then **re-verifies the live asset hash itself** — the script's own exit code already
  confirms the deploy. Prod additionally **refuses a dirty tree**.

## Verify

**Free, and it's the whole trick:** `vite.config.ts`'s `computeBuildRev` bakes the
revision into every asset filename (`index.<REV>.js`), so the live `index.html` names
the exact build — REV is the clean commit SHA on prod, or `<head>-<sig>` (hash of the
uncommitted diff) on a dirty test build, so an audition build is stamped honestly.
**There is no stored deploy ref** — the running site is the only source of truth; both
before (to print the real delta) and after (to verify the right bundle landed) reads go
straight to the live asset hash, e.g.:
```sh
curl -s https://<test|prod-host>/ | grep -oE '\.[0-9a-f]{7,}(-[0-9a-f]+)?\.js' | head -1
```
Prod's independent pass additionally checks edge=200 and a changed-surface spot-check
(use a real static marker like `<title>Ensemble` or `rel="manifest"` — the app mounts
client-side, there's no static `<div id="app">` to grep).

## Rollback

No DB, no migration, so rollback is always **redeploy the previous good commit**:
```sh
git checkout <prev-good-sha>   # the deploy's 📦 "Currently live" line
./scripts/deploy.sh prod       # rebuilds + rsyncs the old bundle over the web root
git checkout main
```
`git revert` → PR → green → the CI `deploy` job redeploys is the normal path; a manual
`workflow_dispatch` on `main` redeploys current `main` with no new commit.

**Troubleshooting:** a stale asset hash with a reported-successful rsync is an
edge/browser cache, not a real failure (`curl -H 'Cache-Control: no-cache'` to
re-check — hashed assets are immutable, `index.html` should be no-cache). Edge ≠ 200 is
the Caddy→nginx edge, not the build — there's no app process to crash. rsync/ssh
failures are the SSH alias/key; the build succeeded locally, nothing shipped.
