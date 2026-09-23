**Container-image app, CD: `main` IS live.** Both hosts serve the `ensemble-web` image — the
v2 music stand's static export on unprivileged nginx — beside the `ensemble-api` container,
on `docker04`. A release is a **tag**, not a file transfer: `release <stack> <web|api>
sha-<40 hex>` through the forced-command `ensemble-release` account, which rewrites the
stack's `.env` and waits for the container to be healthy. No migration step beyond the API's
own, nothing to rsync.

**Prod is continuous.** A push to `main` only happens via a green PR merge (branch-protected,
required CI contexts `checks` + `e2e-tests` + `v2-checks`), and the CI `deploy` job releases
every merged commit's tags to `ensemble.brndn.zip` and then `ensembletest.brndn.zip` —
including unattended overnight `/burndown`/`/nightly` merges. `/deploy-prod` is the manual
break-glass path (re-run CI on `main`), not the normal route.

**Environments:**
- **test** (`ensembletest.brndn.zip`) — the pre-merge audition box. `scripts/deploy-test.sh`
  builds a pushed branch's image in CI (if its tag doesn't exist yet) and releases it there,
  especially for `status:needs-ear` work. Low ceremony, private. The next merge to `main`
  puts it back on `main`.
- **prod** (`ensemble.brndn.zip`) — the public origin; CD on merge, or the gated manual
  `/deploy-prod` break-glass path.

**Verification is free, and it's the whole trick:** every image serves `/build.json`, whose
`sourceRevision` is the full commit SHA it was built from. There is **no stored deploy ref** —
the running site is the only source of truth, and both the CI `deploy` job and
`scripts/deploy-test.sh` curl it after a release.

**Rollback = roll forward:** `git revert` → PR → green → the CI `deploy` job releases it. An
immediate rollback is the previous tag through the same release command on the box.
