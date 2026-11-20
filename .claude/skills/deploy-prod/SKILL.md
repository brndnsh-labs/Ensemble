---
name: deploy-prod
description: Deploy ensemble to production — preflight (clean pushed main, exactly what's shipping, any migration), then STOP for Brandon's explicit go, then deploy and independently verify the public origin. Never runs unattended. Usage `/deploy-prod`.
---
<!-- cycle:rendered template=skills/deploy-prod.md.tmpl hash=16f63399dce9 — managed by the-cycle; edit the template, not this file -->

# /deploy-prod — ship to production

**Shared rules in `.claude/skills/DOCTRINE.md`.** The one skill with a hard human gate: `/cycle --all`
and every unattended path are forbidden from invoking it (§5).

**Environments.** Test is https://ensembletest.brndn.zip, production https://ensemble.brndn.zip. Each says what it serves at `/build.json` (the commit, written into the image by `pnpm image`).

**Test** is not deployed by hand: every merge or push to `main` runs the `ci` workflow, which builds the image, pushes it under `sha-<commit>` and releases it to the test site.

**Production** is the same workflow run by hand from the tip of `main`: `gh workflow run ci -f production=true`. It checks and builds again, releases to test, then to production. The box pulls the tag, waits for the container to be healthy and puts the previous one back if it is not. There is no data migration: the app is a static site, and what a player keeps lives in their browser.

**Preflight here.** What is live: `curl -s https://ensemble.brndn.zip/build.json`, then `git log <that commit>..origin/main --oneline`. Say whether the range touches what the app keeps in the browser or the service worker (§5): that is where a release can cost Brandon his saved charts. Check the test site already serves the tip of `main` and that anything `status:needs-ear` in the range is called out as unheard.

**Verify.** Watch the run (`gh run watch <id> -i 30`), then read `/build.json` on the public production origin yourself and confirm it names the commit. Load the site once (`node scripts/look.ts <out.png> 390x844 https://ensemble.brndn.zip`) and, for the journeys, `SMOKE_URL=https://ensemble.brndn.zip pnpm smoke`.

**Never** work on the host directly from here; the release account can run exactly one command and that is the whole path.

## 1. Preflight (read-only)

- Clean tree, on `main`, pushed — otherwise what you'd ship isn't what's in the repo. Refuse.
- Gates green (§4).
- **Exactly what's shipping:** diff against what's *live* — read the running revision from the origin
  and `git log <live>..HEAD` — not against a tag or stored ref, which drift silently.
- Any data migration pending → say what it does and whether it's reversible.

## 2. The gate

Present the preflight and **stop.** Wait for one explicit "go" from Brandon in this turn.
Enthusiasm, approval of the code, a merged PR, or an earlier "ship it" about something else is not a
go. If you're unsure whether you have one, you don't.

## 3. Deploy

`gh workflow run ci -f production=true`

What that command does — backups, migrations, health waits — is the `deploy` overlay's job to say;
assume none of them unless it does.

## 4. Verify independently

Check the **public origin**, not the script's success message: it responds with the right status,
it serves the revision you just deployed, and one surface that changed in this deploy works.

## 5. Report + rollback

State what shipped, the live revision, and the verification. **Rollback = roll forward:** `git revert`
→ PR → green → deploy again; reverting in place leaves the repo and the box disagreeing.

- **Deploy fails partway:** say exactly which step and whether a migration ran. Don't retry
  blindly — a half-applied migration needs a decision.
- **Verification disagrees with the deploy script:** trust the origin; report a failure.
