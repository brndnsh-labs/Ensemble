---
name: deploy-test
description: Deploy Ensemble to the test environment — low ceremony, for previewing a branch or an uncommitted tree before it merges. Runs the deploy, verifies the right build landed, and lists what to check from what actually shipped. Usage `/deploy-test`.
---
<!-- cycle:rendered template=skills/deploy-test.md.tmpl hash=8838d061dc85 — managed by the-cycle; edit the template, not this file -->

# /deploy-test — put it on the test box

**Shared rules in `.agents/skills/DOCTRINE.md`.** Test is the low-ceremony sibling of `/deploy-prod`:
no gate, no explicit go — a test box is cheap to get wrong. Never point this at production.

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

1. **Sanity:** `git status -sb` — say whether you're shipping a clean branch or a dirty tree (both
   are fine here).
2. **Deploy:** `./scripts/deploy-test.sh`, streaming the output.
3. **Verify the right build landed** — read back the served revision if the build stamps one;
   otherwise check what the deploy script reports. A "successful" deploy still serving the old
   build is the failure this step exists for.
4. **List what to check**, derived from the diff and each shipped issue's Acceptance — only
   user-visible surfaces, each naming what changed and what should now be true. Nothing
   observable shipped → skip this and step 5.
5. **Ask for a verdict** directly in chat, offering **Works** / **Something's off** / **Haven't checked**.
   On "something's off", capture Brandon's words verbatim before diagnosing, then fix now or
   file a `finding`.

Deploy exits non-zero → report the failing step; don't retry blindly.
