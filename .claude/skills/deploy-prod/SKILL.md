---
name: deploy-prod
description: Deploy Ensemble to production — the gated ritual. Preflight (clean pushed main, what's actually shipping, any migration plan), then STOP for Brandon's explicit go, then deploy, then independently verify the public origin. Includes the rollback path. Never runs unattended. Usage `/deploy-prod`.
---
<!-- cycle:rendered template=skills/deploy-prod.md.tmpl hash=ca5463e72e78 — managed by the-cycle; edit the template, not this file -->

# /deploy-prod — ship to production

Goal: make the safe path automatic — **not** the decision to ship.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** This is the
one skill with a hard human gate. `/burndown`, `/cycle` and every unattended path are forbidden
from invoking it.

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

## 1. Preflight (read-only)

- **Clean tree, on `main`, pushed.** A dirty or unpushed tree means the thing you're about to ship
  isn't the thing in the repo. Refuse.
- **Gates green** (§4).
- **Show exactly what's shipping.** Diff against what's *live*, not against the last tag or a
  stored ref — a stored deploy ref drifts silently and will happily lie to you. Read the live
  revision from the running origin and `git log <live>..HEAD`.
- **Any data migration in the pending set → surface it before the gate**, with what it does and
  whether it's reversible. A migration is a §5 always-brake surface in its own right.

## 2. THE GATE

Present the preflight and **stop.** Wait for one explicit "go" from Brandon in this turn.

Not a go: general enthusiasm, approval of the *code*, a merged PR, or an earlier "ship it" about
something else. Approval of the work is not approval of the deploy. If you're unsure whether you
have a go, you don't.

## 3. Deploy

`gh api -X POST repos/brndnsh-labs/Ensemble/actions/workflows/ci.yml/dispatches -f ref=main`

What that command does — and does *not* — do is the `deploy` overlay's job to say. Don't
assume it takes a backup, runs migrations, or waits for a healthy result; assume none of
those unless the overlay says otherwise.

## 4. Verify independently

Don't trust the deploy script's own success report — check the **public origin** yourself:

- It responds (and with the right status).
- The served build **is the one you just deployed** — compare the revision, don't assume.
- Spot-check one surface that actually changed in this deploy.

Report green only if all of those hold. "The script said OK" is not verification.

## 5. Report + rollback

State what shipped, the live revision, and the verification results.

**Rollback = roll forward.** `git revert` → PR → green → deploy again. Reverting the deploy in
place leaves the repo and the box disagreeing about reality, which is worse than the bug you're
rolling back.

## Why this one is gated

Everything else in this pipeline is auto-merged on green because a wrong merge is cheap to walk
back. Prod is different: it's the one place where a mistake is visible to real users on someone
else's schedule. The gate isn't distrust of the pipeline — it's an acknowledgment that the *cost
function* changes here, and the person who owns the consequences should be the one who says go.

## Edge cases

- **Preflight fails:** stop, report which check. Never "deploy anyway."
- **Deploy fails partway:** say exactly which step, and whether a migration ran. Do not retry
  blindly — a half-applied migration needs a decision, not a rerun.
- **Verification disagrees with the deploy script:** trust the origin. Report as a failure.
- **Asked to deploy unattended** (from `/burndown`, an overnight lane, or a chained skill):
  **refuse.** Report that prod needs an explicit invocation.
