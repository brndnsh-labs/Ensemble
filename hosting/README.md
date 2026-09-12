# Ensemble hosting: shared runtime, separate releases

Brandon's 2026-09-12 direction is to make test and production "simpler, faster, and more
consistent." This replaces the earlier plan to leave their static hosting divergent until
after v2. It approves implementation and preparation, not a production route cutover or a
public v2/account launch.

## One static layout

`static/compose.yml` and `static/nginx.conf` are the shared, digest-pinned, non-root runtime.
Only port, data directory and configuration path vary. No app rebuild or container restart is
needed to publish static files. The entire parent directory is mounted read-only, so nginx
sees atomic symlink changes instead of Docker pinning one release's inode.

```text
/srv/ensemble-{test,prod}/www/
  .ensemble-static-root       provisioning marker: ensemble-static-v1
  .releases/<revision>-<uuid>/ complete, checksum-verified static artifacts
  current -> .releases/...    atomic activation
  .v2-previews/...            test only; unchanged preview publisher
  v2 -> .v2-previews/...      test only
```

The static root contains no database or credentials. Hidden paths, `/current`, and `/api/*`
return 404. Production is not provisioned with a v2 preview. Missing files are real 404s,
never an SPA fallback. Service workers are no-store and mutable entry points no-cache.
Old releases are retained for rollback; no automatic deletion/retention job is introduced.
Retention is not a guarantee that old tabs can lazy-load old chunks through the current root.

## Build once, verify, publish

The ordinary production build emits `.ensemble-build.json` from Vite's resolved configuration,
including mode, source revision and whether the E2E bridge was enabled. Sealing cannot relabel
an earlier test/debug build. CI seals the output of `npm run ci`, uploads it under the exact
commit SHA, and downloads those bytes in the deploy job. Both existing required gates remain
dependencies. The deploy job needs Node, SSH and rsync, but no dependency install or rebuild.

```sh
# Build/seal once; a dirty audition artifact is allowed only on test.
npm run build:size
node scripts/static-artifact.mjs seal dist production
node scripts/static-artifact.mjs verify dist test

# Test now uses the new layout by default:
./scripts/deploy.sh test --artifact dist
# Or build and publish an audition in one command:
./scripts/deploy.sh test
```

Verification checks the checkout SHA, every artifact byte, unexpected files, symlinks, reserved
paths and transfer checksum list. Uploads use unique directories. The host checks SHA256 before
activation and uses a lock plus compare-and-swap: a concurrent loser fails rather than
overwriting the winning release. Canonical public HTML/revision and service-worker bytes/cache
policy still gate success. A failed transfer leaves the current release untouched; failure
after activation is reported as failure, retains evidence, and does not silently roll back.

Test defaults to atomic publishing after its verified conversion. Production still requires
`--atomic` at its separately gated cutover. Legacy publishing refuses any root containing the
new layout's marker, releases directory or current symlink, so an old command cannot erase
rollbacks. Existing production CD stays on the LXC until the separately approved cutover.

Rollback is a verified activation of the previous retained release using
`scripts/publish-static.sh activate ROOT PREVIOUS_RELEASE CURRENT_TARGET` through the same
scoped SSH account. Reverify public HTML and canonical worker; record the rollback and follow
with the corrective source change. Never downgrade browser data schemas incidentally.

## API is a separate service and a separate release

`prototypes/v2-api/Dockerfile` builds compiled Node 26 JavaScript, production dependencies and
migrations. No tsx, source/test tree, database or secret is baked into the runtime. The process
runs non-root. `/healthz` performs a read-only schema query and returns bounded readiness and
revision, without cookies or auth-rate-budget use. Keep it on the operator/container network.

The future same-origin `/api/*` route must point directly from Caddy to this separate service.
Static publishing never starts, restarts or migrates it. No API image publishing workflow or
public route is enabled by this change. In particular, this packaging branch is not a substitute
for the auth-hardening draft **#1196 / #1192**; combine and re-review those changes before any
public account endpoint is exposed.

Remaining API rollout requirements:

- Immutable GHCR image identity and a separate test-only Compose stack; runtime env/secrets
  via operator tooling, never chat or committed files. The database bind mount must be outside
  the static root and writable by UID 1000, with no test/prod sharing.
- Scoped Caddy client-IP sanitation and exact measured trusted socket peer; reject or safely
  canonicalize direct-origin callers. Do not trust caller-supplied X-Forwarded-For or blindly
  forward CF-Connecting-IP from a LAN request. Verify real routed independent rate budgets.
- Fresh disposable auth data for initial verification. Before durable accounts/songbooks,
  WAL-safe backup, actual restore rehearsal and backup-before-migrate must replace the current
  disposable-stage migrate-on-start assumption. Static rollback is not database rollback.

## Operator rollout and production gate

1. Reconcile the homelab mirror with the live **Ensemble-only** files before deploying. The
   inspected live test container uses `/opt/docker/ensembletest`, port 8090 and
   `/srv/ensemble-test/www`; this transition adds its missing stack/config mirror and records
   its already-live Caddy route without reloading the edge. Never deploy a stale whole
   Caddy/firewall file to introduce this change; reconcile the live firewall at preflight.
2. Rehearse the shared Compose runtime locally, including missing/hidden paths, cache headers,
   current-pointer swaps and test preview isolation. Provision test with its marker and an
   initial verified root release **before** changing nginx's root to `/site/current`. Preserve
   the existing preview and legacy root for rollback. Apply only the test stack through
   homelab config-as-code tooling, leaving its existing Caddy port unchanged.
3. Stage the same static runtime for production on a confirmed-unused port. Seed it with the
   exact currently live production bytes first, so hosting migration does not also release v2
   or unrelated app changes. Record the old route/runtime and exact rollback artifact.
4. Create a dedicated **non-sudo, non-Docker** deployment account with write access only to the
   production static release root. Reuse the existing CI public deploy key only after matching
   its fingerprint; never install it into docker04's full-admin `claude` account.
5. Update the narrow tailnet grant/test and CI host/user configuration together. The currently
   checked policy admits `tag:ci` only to `192.168.1.239:22`; the new destination is docker04
   `192.168.1.52:22`. The current tooling has no tailnet write credential: a policy-console
   application is an operator step. This is required before changing production CI's target.
6. Present exact images/config hashes, ports, public cache/SW verification, CI SSH proof,
   data impact (none for static hosting), and the rollback path. **Stop for production go.**
   After approval, update only the production route and enable `--atomic` in CD together.
   Keep the old LXC intact until the public and CI paths are verified; retirement is separate.

The current scoped PVE account could not read the live VM304 firewall (ordinary read denied;
`sudo -n` requires a grant). Production's new backend-port rule therefore still needs a fresh
PVE JIT window for read/validate/apply. No firewall edit or elevation was attempted by this work.

Test was converted on 2026-09-12 using the reviewed dirty audition artifact
`bd6af0b9-6704`. The container is healthy, non-root/read-only, with zero restarts; live config
hashes match these recipes. Public HTML and canonical worker bytes match the artifact, private
paths return 404, and the existing v2 fingerprint stayed unchanged. Old configuration files
are retained under `/srv/ensemble-test/hosting-backup-20260912-atomic`; old root files remain.
This is a test-only deployment receipt, not a production conversion or a claim of clean-commit
deployment. Production remains on the LXC.

This is a staged transition, not a claim that both environments have already been converted.
The final cutover should remove the legacy rsync path and the explicit migration flag once
both environments use the same layout; do not retain permanent dual deployment mechanisms.
