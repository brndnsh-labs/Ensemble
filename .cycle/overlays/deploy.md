## Topology

- **Both hosts** run on **`docker04`** (SSH alias **`docker04-admin`** for operator commands):
  edge **Caddy** terminates TLS and routes `/api/*` to the `<stack>-api` container and
  everything else to `<stack>-web`, the **`ensemble-web`** image — the v2 music stand's
  static export built at `/`, served by unprivileged nginx that owns its own cache and
  framing policy. Stacks live in `/opt/docker/<stack>/`; the released tags are the
  `ENSEMBLE_WEB_TAG=` / `ENSEMBLE_API_TAG=` lines in that directory's `.env`.
- **Test** — `ensembletest.brndn.zip` (web on host port `8094`). Private, low-ceremony —
  the pre-merge audition box.
- **Prod** — `ensemble.brndn.zip` (web on `8095`), since the 2026-09-22 cutover (#1357).
  **Continuously deployed** — a green PR merge (branch-protected) triggers the CI `deploy`
  job, which releases the merged commit to prod and then test. `/deploy-prod` is the
  manual break-glass path, not the normal route.
- **Releases** go through one scoped account, `ensemble-release`, whose key is a forced
  command accepting only `release <ensembletest|ensemble> <web|api> sha-<40 hex>`. CI holds
  that key; from a workstation the same script runs as
  `ssh docker04-admin 'sudo -n /usr/local/bin/ensemble-release <stack> web sha-<sha>'`.
- **Test deploys:** `scripts/deploy-test.sh [branch]` — needs the branch pushed and a clean
  tree. If `ensemble-web:sha-<sha>` doesn't exist it dispatches CI on the branch (the
  `web-image` job builds it after the `v2-checks` gate; `deploy` never releases a branch
  build), then releases the tag to ensembletest and checks `/build.json`. Budget ~15 min
  when a build is needed. An uncommitted tree can't be auditioned — commit and push it.
- **Prod break-glass:** re-run CI on `main` (`gh api -X POST
  repos/brndnsh-labs/Ensemble/actions/workflows/ci.yml/dispatches -f ref=main`); its
  `deploy` job releases `main`'s tags exactly as a merge does.

## Verify

**Free, and it's the whole trick:** every image serves `/build.json`, whose
`sourceRevision` is the full SHA it was built from. **There is no stored deploy ref** — the
running site is the only source of truth:
```sh
curl -s https://<ensembletest|ensemble>.brndn.zip/build.json | grep sourceRevision
```
Prod's independent pass additionally checks edge=200 on `/`, `/api/auth/session` = 401 (the
API is still routed), and a changed-surface spot-check.

## Rollback

Rollback is **release the previous good tag** — no rebuild, since every merged commit's
image stays in the registry:
```sh
ssh docker04-admin 'sudo -n /usr/local/bin/ensemble-release ensemble web sha-<prev-good-sha>'
```
`git revert` → PR → green → the CI `deploy` job releases it is the normal path; that also
keeps `main` and prod in agreement, which a hand-released old tag does not.

**Troubleshooting:** a stale `sourceRevision` after a reported-successful release is an
edge/browser cache (`curl -H 'Cache-Control: no-cache'`; `/build.json` is `no-store`).
Edge ≠ 200 with a healthy container is Caddy→`docker04` routing or the firewall
(`firewall/304.fw` in homelab-maintenance). A release that fails its health wait leaves
the previous tag running; `journalctl -t ensemble-release` on `docker04` has the reason.
