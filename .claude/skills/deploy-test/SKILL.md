---
name: deploy-test
description: Build and deploy the Ensemble app to the TEST environment (ensembletest.brndn.zip) via scripts/deploy.sh test, then a light confirm that the right build landed. TEST ONLY — low ceremony (a private box); does not touch prod. May run from the autonomous pipeline after a merge to main.
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
- `scripts/deploy.sh test` builds (`vite build --mode test`), prints the **Built REV** +
  footprint + the delta vs the live test site, rsyncs, then **re-verifies the live asset
  hash itself** (`✅ Verified live on TEST: …`). So the script already does the confirm;
  the step-3 curl below is just an independent double-check.
- **Verification is free:** `vite.config.ts` (`computeBuildRev`) bakes the revision into
  every asset filename (`index.<REV>.js`), so the deployed `index.html` names the exact
  build. REV is `git rev-parse --short HEAD` for a **clean** tree, and `<head>-<sig>`
  (short hash of the uncommitted diff) for a **dirty** tree — so a dirty audition build
  is stamped *honestly* and a redeploy after an edit flips the stamp. The deploy script
  echoes the exact REV it built (`📌 Built REV: …`); verify against that, not against
  bare `HEAD` (which only matches a clean tree). **No stored deploy ref** — the running
  site is the source of truth (§6).

## Steps (the default — keep it quick)

1. **Quick sanity** from the repo root:
   - `git status -sb` — note the branch + any uncommitted changes. **The build ships
     the working tree**, so dirty edits go to test (fine for iterating — just surface
     it). A dirty tree stamps `<head>-<sig>`, so the asset hash *does* attest the exact
     bytes now — no caveat needed. (Prefer a branch over dirty `main` for anything
     you'll keep, so the Built REV is a clean SHA.)
   - **What's shipping** is printed by the deploy itself — it curls the live test rev and
     lists `git log <live>..HEAD` (the `📦`/`🆕` lines), so no pre-flight ref dance needed.

2. **Deploy.** Run `./scripts/deploy.sh test` (or `npm run deploy:test`) and stream it.
   Non-zero exit (build, ssh, or the post-deploy verify) → report the failing step and
   **stop**. (`--dry-run`/`-whatif` builds without syncing; `--quiet` trims log noise —
   useful when the pipeline calls it.)

3. **Light confirm — the only check the default needs.** Curl the edge and check the
   deployed asset hash matches the **Built REV** the script printed:
   ```sh
   curl -s https://ensembletest.brndn.zip/ | grep -oE '\.[0-9a-f]{7,}(-[0-9a-f]+)?\.js' | head -1
   #   → should contain ".<Built REV>.js" (the 📌 line from the deploy)
   ```
   Green when the live hash equals the Built REV. That one call proves the build
   deployed, nginx is serving it over the edge (200), and the bundle is current. A
   **stale hash** = rsync didn't land or an edge/browser cache is in front — not an
   app issue (there's no app).

4. **Check-in — what to test (the point of a test deploy).** The session is headless
   (no audio/display), so *Brandon* is the ear/eyes — hand him a tight, per-change
   checklist instead of a bare SHA. **Derive it, don't invent it:**
   - **What shipped** = the delta the deploy already printed (`git log <live>..HEAD`,
     the `📦`/`🆕` lines). For each shipped issue, pull its **Acceptance** field
     (`gh issue view <n>` — Acceptance *is* "what should be true now") and its **Track**.
   - **Frame each item by Track** (one line each — what changed → how to verify):
     *musical* → by ear (what to listen for); *synth* → A/B the voice; *UI* → what to
     look at / interact with; *bundle* or **pure-internal/parity** (worker/export,
     types, coordination with no audible surface) → "nothing to eyeball — here's the
     **regression** to watch for" (name the thing that would break if it went wrong).
   - Keep it to the shipped change(s). No generic "click around" filler.

   **Verdict — only when there's an observable surface** (per Brandon's pref): if any
   shipped item is *musical / synth / UI* (or the diff touched an audible/visible path),
   ask via **AskUserQuestion**: **Works** · **Something's off** · **Haven't checked**.
   - **Works** → note it; hand back.
   - **Haven't checked** → leave the checklist; hand back (he'll eyeball later).
   - **Something's off** → **capture, then ask** (his pref): write down exactly what's
     wrong (his notes + the shipped delta/PR), *then* offer **file a regression issue
     (via `/intake` classification) · fix-forward · revert** and act on the pick. A
     post-merge "off" is a regression — don't let it evaporate.

   If **nothing observable** (pure-internal/parity), **skip the verdict menu** — print
   the checklist + the regression-to-watch line and hand back. (Honors "keep test light":
   no forced tap when there's nothing to see.)

5. **Report** one line: Built REV + that the live asset hash matches, then the check-in
   (checklist, and the verdict outcome if one was asked). Nothing more unless asked.

## Autonomous use (pipeline)
Per DOCTRINE §6, `/deploy-test` **may run unattended after a merge to `main`** — test
is a private box and the deploy is non-destructive (static rsync, no DB, no users).
When invoked that way: deploy `main`'s HEAD with `--quiet`, run the step-3 hash
confirm, and report the SHA. **Skip the step-4 verdict menu** (no one is awake to
answer) — but still **emit the derived checklist** as text so it lands in the morning
report / smoke-test list (this is exactly what `/nightly` folds in). **Prod is never
automatic** — see `/deploy-prod`.

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
