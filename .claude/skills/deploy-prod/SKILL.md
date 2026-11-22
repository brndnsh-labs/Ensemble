---
name: deploy-prod
description: Deploy ensemble to production — preflight (clean pushed main, exactly what's shipping, any migration), then STOP for Brandon's explicit go, then deploy and independently verify the public origin. Never runs unattended. Usage `/deploy-prod`.
---
<!-- cycle:rendered template=skills/deploy-prod.md.tmpl hash=20f0392451fd — managed by the-cycle; edit the template, not this file -->

# /deploy-prod — ship to production

**Shared rules in `.claude/skills/DOCTRINE.md`.** The one skill with a hard human gate: `/cycle --all`
and every unattended path are forbidden from invoking it (§5).

**Environments.** Test is https://ensembletest.brndn.zip, production https://ensemble.brndn.zip. Each says what it serves at `/build.json` (the commit, written into the image by `pnpm image`).

**Neither is deployed by hand.** Every merge or push to `main` runs the `ci` workflow, which builds the image, pushes it under `sha-<commit>`, releases it to the test site, runs the smoke journeys against that site, and then releases the same image to production. A step that fails stops the run there and production keeps what it had.

**This skill is for putting production on a named commit**: putting it back when what a merge released is wrong and the fix is not a quick revert. `gh workflow run ci -f commit=<sha>` builds nothing: it releases the image that commit already has (only a commit pushed to `main` has one; the run refuses any other before it touches the host), to production, and to the test site too with `-f test=true`. It does not run the journeys. The box pulls the tag, waits for the container to be healthy and puts the previous one back if it is not. **The next merge to `main` moves production forward again**, so say that in the report, and if `main` itself is the problem the revert still has to land. There is no data migration: the app is a static site, and what a player keeps lives in their browser.

**Preflight here.** Nothing releasing or waiting to (`gh run list --workflow ci --limit 5`): a merge's release that is already waiting runs after the restore and undoes it. What is live: `curl -s https://ensemble.brndn.zip/build.json`. What going to the named commit changes: `git log <named>..<live> --oneline` going back (or `<live>..<named>` going forward). Say whether the range touches what the app keeps in the browser or the service worker (§5): an older build reading what a newer one stored is where this can cost Brandon his saved charts. The "clean tree, on `main`, pushed" check below does not apply: nothing local is shipped.

**Verify.** Watch the run (`gh run watch <id> -i 30`), then read `/build.json` on the public production origin yourself and confirm it names the commit. Load the site once (`node scripts/look.ts <out.png> 390x844 https://ensemble.brndn.zip`) and, for the journeys, `SMOKE_URL=https://ensemble.brndn.zip pnpm smoke` (run from a checkout of the commit that was released, since the journeys belong to their commit).

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

`gh workflow run ci -f commit=<all 40 characters of the commit to put production on>`

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
