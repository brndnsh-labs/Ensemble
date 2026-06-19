---
name: deploy-test
description: Build and deploy the Ensemble app to the TEST environment (ensembletest.brndn.zip) via scripts/deploy-test.sh, then a light confirm that the right build landed. TEST ONLY — low ceremony (a private box); does not touch prod. May run from the autonomous pipeline after a merge to main.
---

# Deploy to test

Deploy the current working tree to the **test** box and confirm it landed. Test is a
private, single-user environment — **keep this light.** Ceremony is for prod
(`/deploy-prod`). Mirrors the proven songsiknow split, adapted to Ensemble's much
simpler runtime: **static files, no service, no DB.**

**Shared rules in `.claude/skills/DOCTRINE.md`** — §6 (deploy mechanics: this is the
staging push; prod is the gated awake-only call) and §4 (gates).

## Context (so a failure is legible)
- Target **`ensembletest.brndn.zip`**: an edge **Caddy** terminates TLS and reverse-
  proxies to **nginx**, which serves the app as **static files** out of
  `/var/www/html/`. There is **no app server, no pm2, no DB** — nginx serves the new
  files the instant rsync finishes; nothing to restart.
- Ops target: rsync over ssh to the scoped **`ensembletest-admin`** alias (the
  least-privilege `claude` account, `IdentitiesOnly homelab_nginx`) →
  `/var/www/html/`; the `--delete` mirrors the build, so stale files are pruned.
- `scripts/deploy-test.sh` builds (`vite build --mode test`), prints the bundle
  footprint, rsyncs, then moves **`refs/deploys/test`** to HEAD. It does **not**
  verify itself — on test, "the right asset hash is up" is all the check needs to be.
- **Verification is free:** `vite.config.ts` bakes `git rev-parse --short HEAD` (REV)
  into every asset filename (`main.<REV>.js`), so the deployed `index.html` names the
  exact build. No `/api/version` endpoint needed.

## Steps (the default — keep it quick)

1. **Quick sanity** from the repo root:
   - `git status -sb` — note the branch + any uncommitted changes. **The build ships
     the working tree**, so dirty edits go to test (fine for iterating — just surface
     it). Note: REV is baked from `HEAD`, so a dirty tree's asset hash still equals
     `HEAD`; the hash confirms HEAD landed but can't attest the uncommitted edits.
   - (Optional) what's shipping since the last test deploy:
     `git fetch -q origin '+refs/deploys/*:refs/deploys/*' 2>/dev/null || true` then
     `git log --oneline refs/deploys/test..HEAD` (or "(no test deploy ref yet)").

2. **Deploy.** Run `./scripts/deploy-test.sh` and stream it. Non-zero exit (build or
   ssh) → report the failing step and **stop**. (`--dry-run`/`-whatif` builds without
   syncing; `--quiet` trims log noise — useful when the pipeline calls it.)

3. **Light confirm — the only check the default needs.** Curl the edge and check the
   deployed asset hash matches HEAD:
   ```sh
   curl -s https://ensembletest.brndn.zip/ | grep -oE '\.[0-9a-f]{7,}\.js' | head -1
   #   → should contain ".$(git rev-parse --short HEAD).js"
   ```
   Green when the hash equals `git rev-parse --short HEAD`. That one call proves the
   build deployed, nginx is serving it over the edge (200), and the bundle is current.
   A **stale hash** = rsync didn't land or an edge/browser cache is in front — not an
   app issue (there's no app). Done — hand back.

4. **Report** one line: deployed SHA + that the live asset hash matches. Nothing more
   unless asked.

## Autonomous use (pipeline)
Per DOCTRINE §6, `/deploy-test` **may run unattended after a merge to `main`** — test
is a private box and the deploy is non-destructive (static rsync, no DB, no users).
When invoked that way: deploy `main`'s HEAD with `--quiet`, run the step-3 hash
confirm, and report the SHA. **Prod is never automatic** — see `/deploy-prod`.

## Troubleshooting (only when the confirm fails)
- **Hash stale but rsync reported success** → edge/browser cache. `index.html` should
  be served no-cache; hashed assets are immutable. Re-curl with `-H 'Cache-Control:
  no-cache'`; if still stale, check the Caddy/nginx cache headers on the box.
- **Edge ≠ 200** → it's the Caddy→nginx edge, not the build (there's no app process to
  crash). Check nginx is serving `/var/www/html` and Caddy is up.
- **rsync/ssh fails** → the `ensembletest-admin` ssh alias / `claude` key; the build
  succeeded locally, nothing shipped.

## Prod is a separate skill
Prod lives in **`/deploy-prod`** — stricter and gated (full `validate` + clean pushed
`main` → one explicit "go" → deploy → verify public origin). Keep them distinct: test
is low-ceremony and pipeline-runnable; **prod is an awake, manual, gated call.**
