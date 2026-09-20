# Ensemble hosting: shared runtime, separate releases

Brandon's 2026-09-12 direction was to make test and production "simpler, faster, and more
consistent." **The production cutover completed 2026-09-13** and has proven stable: prod now
runs on `docker04` alongside test, and the old LXC hosts (115/116, 192.168.1.239/.224) have
been retired and deleted from Proxmox. This doc's staged-transition and gated-approval
language below is kept as historical record of how the migration was executed; the end state
it describes is now live.

## One static layout

`static/compose.yml` and `static/nginx.conf` are the shared, digest-pinned, non-root runtime.
Only port, data directory and configuration path vary. No app rebuild or container restart is
needed to publish static files. The entire parent directory is mounted read-only, so nginx
sees atomic symlink changes instead of Docker pinning one release's inode.

```text
/opt/docker/{ensembletest,ensemble}/
  docker-compose.yml          rendered stack: static runtime + api service (#1217)
  .env                        ENSEMBLE_API_TAG= / ENSEMBLE_WEB_TAG= — written by the release step (#1219, #1356)
/var/lib/docker-data/{ensembletest,ensemble}/env/api.env   root-only API secret
/var/lib/docker/volumes/{ensembletest,ensemble}-api-data/   SQLite database (named volume)
/srv/ensemble-{test,prod}/www/
  .ensemble-static-root       provisioning marker: ensemble-static-v1
  .releases/<revision>-<uuid>/ complete, checksum-verified static artifacts
  current -> .releases/...    atomic activation
  .v2-previews/...            test: v2 audition releases (prototypes/v2/scripts/deploy.mjs test)
  .v2-releases/...            prod: v2 releases, published by the CI deploy job after `current`
  v2 -> .v2-{previews,releases}/...  atomic activation of the v2 music stand at /v2/
```

### What the cutover's edge config must do (#1355 → #1356)

The root-scope service worker and web manifest landed ahead of the web image, and they put five
hard requirements on whatever serves `/` after the flip. Getting any of them wrong strands a
returning browser on a shell that no longer exists, and a service worker is the one thing a
user cannot fix by reloading.

- **`/v2/sw.js` must be served as a FILE, never redirected.** The root build emits
  `out/v2/sw.js`: a tombstone that retires the beta's `/v2/`-scoped worker, forwards its windows
  to the same path without the prefix (query and fragment intact) and unregisters itself. It is
  the only way to reach a browser holding that worker, because that worker answers its whole
  scope from cache — a bookmarked `/v2/` never reaches the origin at all — and its ONE remaining
  request is the update check for `/v2/sw.js`, which the spec fetches with redirects disabled.
  So the blanket `/v2/* → /` redirect must carve out `/v2/sw.js`. Everything else under `/v2/`
  redirects as planned.
- **`/sw.js` and `/v2/sw.js` stay `no-store`**, as the current config already keeps the v1
  worker. The registration also asks for `updateViaCache: 'none'`, but the origin must not be
  the thing that pins a browser to the old script.
- **`/manifest.json` must keep being served at that exact path**, with `no-cache` like the other
  mutable entry points. It deliberately reuses v1's path, `id`, name and colours so an installed
  v1 PWA updates in place instead of becoming a second app; moving or renaming it mints a new
  identity.
- **The `/v2/* → /` redirect should carry the rest of the path and the query**: `/v2/x?y` →
  `/x?y`, which is what the tombstone does for the windows it can reach, so a browser gets the
  same destination either way. A blanket redirect to `/` throws away whichever old link the
  musician actually followed.
- **No SPA fallback.** The worker now serves the cached shell for a navigation the NETWORK
  refuses, which is an offline affordance, not a rewrite rule: online, a missing path must still
  be a real 404, exactly as this layout already promises.

One residual the edge cannot fix, recorded so it is not mistaken for a bug: a browser whose v1
caches were already evicted under storage pressure still holds v1's registration but offers the
new worker no evidence that it is replacing v1, so the update installs and WAITS until that
browser's last v1 tab closes, then activates normally. It self-heals at the next tab close, and
the alternative — skipping waiting on a timer, with no evidence — would risk swapping the code
out from under a running band. Waiting is the safe side of that trade.

A second one: the first root worker deletes every `ensemble-v2-preview-*` cache, including the
shell of a `/v2/` beta tab that is open at that moment. Online that tab's next navigation falls
through to the network, meets the redirect and lands on `/`; OFFLINE it gets a network-error page
until the device reconnects. The beta's cache was always going to be deleted at the cut.

### The `ensemble-web` image (#1356)

`hosting/web/` is the in-repo half of decision 1: a `Dockerfile`, the `nginx.conf` that answers
the five requirements above, and `smoke.mjs`, which turns each of them into an assertion against
a container that is actually running. Together they build
`ghcr.io/brndnsh-labs/ensemble-web:sha-<commit>` — the v2 stand exported at
`ENSEMBLE_V2_BASE=/` (#1354) inside `nginxinc/nginx-unprivileged`, digest-pinned the way
`static/compose.yml` pins nginx. At the cutover this image replaces the whole layout above: no
release directory, no `current` symlink, no `v2` symlink, because the release IS the tag and
rollback is the previous tag rather than a re-activation.

The Docker build context is `hosting/web`: three small files, of which the Dockerfile copies two
(`smoke.mjs` lives there because it belongs beside what it tests, and never enters the image).
The export itself arrives as a *named* build context, so the repository never becomes the
context and there is no `.dockerignore` to keep correct against a tree holding `node_modules`
and `.next`. Same prebuilt-artifact shape as `prototypes/v2-api/Dockerfile`; the bytes served
are the bytes the v2 gates ran against — and only those, since the Dockerfile empties the
document root first, which is what retires the base image's own `50x.html`.

```sh
ENSEMBLE_V2_BASE=/ npm run build --prefix prototypes/v2
docker build hosting/web --build-context site=prototypes/v2/out \
    --build-arg REVISION="$(git rev-parse HEAD)" --tag ensemble-web:local
node hosting/web/smoke.mjs ensemble-web:local "$(git rev-parse HEAD)"
```

`smoke.mjs` starts the container with `--read-only --tmpfs /tmp --cap-drop ALL --security-opt
no-new-privileges`, so the posture the stack runs containers under is proven rather than
assumed, and it speaks raw `node:http` rather than `fetch` because the assertions are about
status codes, `Location` and `Content-Encoding` — all three of which `fetch` hides by following,
decoding or both. It checks the root HTML and its `/_next/` references, `build.json`'s
`sourceRevision` and the image's `org.opencontainers.image.revision` label against the commit it
was built from, `/sw.js` and its `SCOPE`, the `/v2/sw.js` tombstone served as a file with no
`Location`, each `/v2/*` redirect's exact target **parsed** back to this origin rather than
prefix-tested, the manifest's `id`, immutable vs no-cache vs no-store policy, MIME types, byte
ranges and gzip on text but not on audio, an exact 404 for every deterministic refusal (missing
paths, `/api/*`, dotfiles, `/50x.html`) and 403-or-404 for the one directory case, uid 101, a
read-only root filesystem, and the image's own `HEALTHCHECK` command.

It was mutation-tested four ways, each of which fails it:

| Mutation | What the smoke reports |
| --- | --- |
| `/v2/sw.js` carve-out removed | `/v2/sw.js` answers 308 with `Location: /sw.js` instead of the tombstone |
| SPA `try_files … /index.html` fallback added | missing paths answer 200 with the app shell |
| `absolute_redirect on` | `Location: http://127.0.0.1/x/y?a=b` instead of `/x/y?a=b` |
| open-redirect guard removed from `$ensemble_v2_moved` | `/v2//evil.example/x` → `//evil.example/x`, which resolves to `http://evil.example` |

That last row is why the redirect assertion parses instead of testing a `/` prefix:
`'//evil.example/x'.startsWith('/')` is perfectly true, and an earlier version of this script
passed against a config that would have sent a returning musician off-origin.

What the config carries over from `static/nginx.conf`: the tmpfs pid/temp paths, `server_tokens
off`, the dotfile and `/api/*` 404s, the no-SPA-fallback `try_files`, and the no-store/no-cache
policy for workers and mutable entry points. What it drops, and why: the `/current` 404s and
`disable_symlinks off` were about a bind-mounted release directory that an image does not have,
and the second `location /v2/` document root is now the redirect. What it adds: the `/v2/sw.js`
carve-out, `absolute_redirect off` (this container speaks plain HTTP on a LAN port behind Caddy
and Cloudflare, so an absolute `Location` would publish that address to a public browser),
an open-redirect guard in front of it (a second separator right after `/v2/` means the rest of
the target is an authority, not a path), long-lived immutable caching for `/_next/static/`, gzip
for text only, and two of the three response headers `docs/SECURITY.md` F5 names as needing the
web-server layer: `X-Content-Type-Options: nosniff` and `frame-ancestors 'none'`. F5's third is
HSTS, which is deliberately not set here — it belongs to Caddy and is ignored over plain HTTP
anyway. `Referrer-Policy` is an addition of this config's own, not an F5 item. No brotli either —
the base image has no such module and this config does not add one.

CI builds it in two places. `web-image` in `ci.yml` runs on a merge to `main` only, beside
`api-image`: it builds the root export, pushes `:sha-<commit>` and `:main`, pulls the sha tag
back and runs the smoke script against it. `v2-root-image` in `v2-root-base.yml` is the PR-time
proof that needs no registry — same build, `load: true` instead of `push`, same smoke script —
so a rule as easy to get wrong as the `/v2/sw.js` carve-out is provable on the pull request that
writes it. Neither one touches the required contexts, and `deploy` deliberately does not
`needs:` the image job: the site is still published by the rsync/symlink path, and a red image
build must not hold up today's release. `ensemble-web` is a public package, like
`ensemble-api`: docker04 pulls anonymously. (The image is pushed with `provenance: false`, so an
anonymous manifest probe has to send `Accept: application/vnd.oci.image.manifest.v1+json` — a
probe that offers only the index types gets a 404 that reads like "private".)

### Running and releasing the image (#1356, infra half)

`static/compose.yml` carries a `web` service beside `static`, and `render.mjs` renders it as
`<stack>-web` — the name `ensemble-release` derives from its `web` argument:

| | ensembletest | ensemble |
| --- | --- | --- |
| Host port (Caddy only; 8095 stays CLOSED in the firewall until #1357) | 8094 | 8095 |
| Tag variable in the stack's `.env` | `ENSEMBLE_WEB_TAG` | `ENSEMBLE_WEB_TAG` |
| Routed by Caddy | yes — the host's `/` | not until the flip (#1357) |

It runs **beside** the bind-mounted runtime on its own port rather than replacing it, so moving a
host onto the image — and back — is one `reverse_proxy` line in Caddy and never a rebuild. No
environment, no volumes, no secrets; the same `read_only`, `cap_drop: [ALL]`,
`no-new-privileges`, `tmpfs: /tmp` posture as `static`; uid 101 is the image's default. The
healthcheck restates the image's own, command and timings, so the release step's health wait
is visible from the compose file. `render.mjs` now requires `ENSEMBLE_WEB_TAG` as well as `ENSEMBLE_API_TAG`; each
becomes a `${VAR:-<pinned>}` default the on-box `.env` overrides.

The Caddy handle for a host on the image imports **neither** `default_app_policy` nor
`ensemble_cache_policy`: both replace upstream headers, and the image owns its cache and framing
policy (`frame-ancestors 'none'` is stricter than the edge default; `X-Frame-Options` goes away
with the import, and `frame-ancestors` is what every current browser honours over it). HSTS
still comes from the site-level `security_headers`. The `/api/*` handles sit above it and are unchanged.

Releases go through the same forced command as the API — `release <stack> <api|web>
sha-<40 hex>` — and the root script keeps BOTH tags in `.env` (it rewrites one service's line
and carries every other line over), holds a per-stack lock for the whole run so an API and a web
release from one merge cannot interleave, waits for the container's healthcheck, and otherwise
recreates the service at the previous tag — or, on a first release with no previous tag, at the
rendered default. That closes the gap the image half recorded: `deploy` still does not
`needs:` `web-image`, but a release names a tag, and a tag that is not in the registry cannot
become healthy — the script fails, restores the previous tag, and the job is red.

CI's `web-release` job (`needs: [web-image, deploy]`, main only, not a required context)
releases each merge's image to **ensembletest only**, then asserts that
`https://ensembletest.brndn.zip/build.json` names that commit's `sourceRevision` — "released"
means the public origin serves it, not that a command exited 0. Production joins that loop at
the flip (#1357). Until then `scripts/deploy.sh test` and `deploy.mjs test` still publish to the
bind-mounted test runtime on :8090, which keeps running but is no longer what the hostname
routes to: a v1 audition on the test host means pointing Caddy back at :8090 first.

The static root contains no database or credentials. Hidden paths, `/current`, and `/api/*`
return 404. Both environments serve the v2 music stand at `/v2/` from the `v2` symlink; on
production the scoped `ensemble-deploy` account (which owns the static root) creates
`.v2-releases/` and the symlink itself, so no root provisioning was needed (#1207). The root
publisher never touches `v2`, and the v2 publisher never touches `current`. Missing files are real 404s,
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

Both environments default to atomic publishing (production since the 2026-09-13 cutover).
Legacy publishing refuses any root containing the new layout's marker, releases directory or
current symlink, so an old command cannot erase rollbacks. The pre-cutover non-atomic prod
transport (`scripts/deploy.sh`'s legacy rsync branch, the `PROD_DEPLOY_PROFILE` CI selector) has
been removed from the codebase — there is only the one path now.

Rollback is a verified activation of the previous retained release using
`scripts/publish-static.sh activate ROOT PREVIOUS_RELEASE CURRENT_TARGET` through the same
scoped SSH account. Reverify public HTML and canonical worker; record the rollback and follow
with the corrective source change. Never downgrade browser data schemas incidentally.

## API is a separate service and a separate release

`prototypes/v2-api/Dockerfile` packages the prebuilt esbuild bundle (`npm run build` in that
directory, run by CI before the image build — #1202), production dependencies and
migrations. No tsx, source/test tree, database or secret is baked into the runtime. The process
runs non-root. `/healthz` performs a read-only schema query and returns bounded readiness and
revision, without cookies or auth-rate-budget use. Keep it on the operator/container network.

The same-origin `/api/*` route points directly from Caddy to this separate service (#1218).
Static publishing never starts, restarts or migrates it.

### The `api` service in the shared stack (#1217)

`static/compose.yml` carries a second service, `api`, that `render.mjs` emits as
`ensembletest-api` / `ensemble-api` beside the static container in the same homelab stack:

| Setting | Test | Prod |
| --- | --- | --- |
| Image | `ghcr.io/brndnsh-labs/ensemble-api:${ENSEMBLE_API_TAG:-<pinned>}` | same |
| Host port (Caddy only, firewalled) | 8092 | 8093 |
| `ENSEMBLE_RP_ID` / `ENSEMBLE_ORIGIN` | `ensembletest.brndn.zip` | `ensemble.brndn.zip` |
| Database | named volume `ensembletest-api-data` at `/data` | `ensemble-api-data` |
| Secret env file (root, 0600) | `/var/lib/docker-data/ensembletest/env/api.env` | `/var/lib/docker-data/ensemble/env/api.env` |

The env file holds exactly one line, `ENSEMBLE_AUTH_IP_SECRET=<64 hex>`, generated on the box
with `openssl rand -hex 32`. Everything else is plain `environment:` in the recipe, including
the proxy-trust pair: `ENSEMBLE_AUTH_IP_HEADER=x-ensemble-client-ip` (lowercase — the API
validates the name) and `ENSEMBLE_AUTH_TRUSTED_PROXY_ADDRESSES=192.168.1.244`. That address is
Caddy's, and it is what the container actually sees as the socket peer: Docker DNATs published
ports without rewriting the source (measured in the static container's nginx log, 2026-09-15).
The API trusts the header from that peer alone; anything else is keyed on its own socket address.

**The two image tags are the only interpolations in a rendered stack, on purpose.** Render with
the tags to pin as the defaults — `ENSEMBLE_API_TAG=sha-<full sha> ENSEMBLE_WEB_TAG=sha-<full
sha> node hosting/static/render.mjs prod` (both are required since #1356) — and `docker compose
config` validates the file anywhere with no `.env` present, which is what `bin/docker-deploy`
does from `/tmp` on the box. On the box, `/opt/docker/<stack>/.env` holds the live
`ENSEMBLE_API_TAG=` and `ENSEMBLE_WEB_TAG=` lines written by the forced-command release step
(#1219); Compose reads it from the project directory (the compose file's directory), so a config
redeploy with `bin/docker-deploy` keeps the released tags rather than rolling a service back to
its render-time pin. Rendering runs Compose with `--no-env-resolution` so the `env_file` reference survives
into the output instead of being inlined (empty) at render time.

`/healthz` is reachable from docker04 only (`curl http://127.0.0.1:8092/healthz`); Caddy
routes `/api/*` and nothing else. One replica per environment: SQLite and the in-memory rate
limiter are not horizontally scaled.

Remaining API rollout requirements:

- Scoped Caddy client-IP sanitation on the `/api/*` route and the live spoof-resistance probes
  (#1218). Do not trust caller-supplied X-Forwarded-For or blindly forward CF-Connecting-IP from
  a LAN request. Verify real routed independent rate budgets.
- WAL-safe backup, actual restore rehearsal and backup-before-migrate (#1220) before durable
  accounts/songbooks replace the disposable-stage migrate-on-start assumption. Static rollback
  is not database rollback.

## Releasing the API from CI (#1219)

CI never gets a shell on docker04. Two scoped accounts, two keys, two jobs of work:

| Account | Key secret | Can do | Cannot do |
| --- | --- | --- | --- |
| `ensemble-deploy` | `DEPLOY_SSH_KEY` | write the production static root, activate `current` | sudo, Docker, test root, nginx config |
| `ensemble-release` | `API_RELEASE_SSH_KEY` | `release <ensembletest\|ensemble> api sha-<40 hex>` | anything else — the key is `restrict,command=` to a gate script |

The gate (`homelab-maintenance/docker/ensemble/release/ensemble-release-gate`) parses
`SSH_ORIGINAL_COMMAND`, refuses anything but that exact shape, and sudoes — via a sudoers rule
scoped to one path — into the root-owned `ensemble-release` script, which writes
`ENSEMBLE_API_TAG` into `/opt/docker/<stack>/.env`, recreates only the `api` service and waits
for its healthcheck. An unhealthy result restores the previous tag and recreates again, so a bad
image fails the CI step without taking the API down. The account is in no `docker` group and
has no password; its home, key file and scripts are root-owned. Provisioning is
`docker/ensemble/release/provision.sh` (idempotent, run as root with the CI public key).

The `deploy` job releases prod then test after the static publishes, and only for the image
`api-image` built from the same commit (`deploy` now `needs` that job). A `workflow_dispatch`
hosting probe exercises the release account negatively instead: shell, foreign stack, floating
tag, short tag and wrong service must all be refused.

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
This was a test-only deployment receipt at the time it was written — see the top of this doc
for the completed production cutover.

**Cutover complete (2026-09-13):** both environments now use the same docker04 atomic release
layout, and the legacy rsync path / `PROD_DEPLOY_PROFILE` migration selector have been removed
from `scripts/deploy.sh` and `.github/workflows/ci.yml`. The old LXC hosts (115/116) were
deleted from Proxmox the same day. Rollback for prod is now the same verified
previous-release activation described above, not a redeploy to a different host.
