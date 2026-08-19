---
name: deploy-test
description: Deploy Ensemble to the test environment — low ceremony, for previewing a branch or an uncommitted tree before it merges. Runs the deploy, verifies the right build actually landed, and derives a per-change check-in list from what shipped. Usage `/deploy-test`.
---
<!-- cycle:rendered template=skills/deploy-test.md.tmpl hash=f96ec04a53b8 — managed by the-cycle; edit the template, not this file -->

# /deploy-test — put it on the test box

Goal: get the current work somewhere it can be looked at, with enough verification that a failure
is legible rather than mysterious.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Test is the
low-ceremony sibling of `/deploy-prod`: **no gate, no explicit go.** Deploying a branch here is how
by-eye work gets checked *before* it merges.

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

## Workflow

1. **Sanity.** `git status -sb` — know whether you're shipping a clean branch or a dirty tree.
   Both are legitimate here; say which.
2. **Deploy.** `./scripts/deploy.sh test` — stream the output rather than waiting silently, so a failure is
   visible where it happens.
3. **Verify the right build actually landed.** Don't infer success from a zero exit code — confirm
   the deployed artifact is the one you just built. If the build stamps a revision into the served
   output, read it back and compare; otherwise check whatever the deploy script itself reports.
   *A deploy that "succeeded" while serving the previous build is the failure mode this step
   exists for.*
4. **Derive the check-in list from what actually shipped** — the diff, plus each shipped issue's
   `Acceptance:` line. **Derive it; don't invent it.** No generic "click around and see if it
   works" filler: only *user-visible* surfaces earn a checkbox, and each one names what changed and
   what should now be true.
5. **Ask for a verdict** — via `AskUserQuestion`, with **Works** / **Something's off** / **Haven't checked**.

   Skip this step entirely when nothing observable shipped (a refactor, a test-only change);
   asking for a verdict on an invisible change trains people to click through.
6. **On "Something's off": capture, don't debug.** Get Brandon's description verbatim first
   — the raw words are the evidence. Then decide whether it's a fix-now or a `finding`.

## Edge cases

- **Deploy exits non-zero:** report the failing step and its output. Don't retry blindly.
- **Deploy succeeds but verification disagrees:** treat as a failure — something served the old
  build. Say so plainly rather than reporting success.
- **Dirty tree:** allowed here (that's the point of test), but state it, so nobody mistakes the
  deployed thing for a commit.
- **Nothing observable shipped:** deploy, report, skip the verdict.
