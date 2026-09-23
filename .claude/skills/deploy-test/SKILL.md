---
name: deploy-test
description: Deploy Ensemble to the test environment — low ceremony, for previewing a branch or an uncommitted tree before it merges. Runs the deploy, verifies the right build actually landed, and derives a per-change check-in list from what shipped. Usage `/deploy-test`.
---
<!-- cycle:rendered template=skills/deploy-test.md.tmpl hash=050bef34f198 — managed by the-cycle; edit the template, not this file -->

# /deploy-test — put it on the test box

Goal: get the current work somewhere it can be looked at, with enough verification that a failure
is legible rather than mysterious.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Test is the
low-ceremony sibling of `/deploy-prod`: **no gate, no explicit go.** Deploying a branch here is how
by-eye work gets checked *before* it merges.

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

## Workflow

1. **Sanity.** `git status -sb` — know whether you're shipping a clean branch or a dirty tree.
   Both are legitimate here; say which.
2. **Deploy.** `./scripts/deploy-test.sh` — stream the output rather than waiting silently, so a failure is
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
