---
name: deploy-prod
description: Deploy Ensemble to production — the gated ritual. Preflight (clean pushed main, what's actually shipping, any migration plan), then STOP for Brandon's explicit go, then deploy, then independently verify the public origin. Includes the rollback path. Never runs unattended. Usage `/deploy-prod`.
---
<!-- cycle:rendered template=skills/deploy-prod.md.tmpl hash=77f9fa34eadc — managed by the-cycle; edit the template, not this file -->

# /deploy-prod — ship to production

Goal: make the safe path automatic — **not** the decision to ship.

**Shared rules in `.agents/skills/DOCTRINE.md` — read it if not already in context.** This is the
one skill with a hard human gate. `/burndown`, `/cycle` and every unattended path are forbidden
from invoking it.

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

`./scripts/deploy.sh prod`

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
