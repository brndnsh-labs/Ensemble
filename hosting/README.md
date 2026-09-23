# Ensemble hosting: shared runtime, separate releases

Brandon's 2026-09-12 direction was to make test and production "simpler, faster, and more
consistent." **The production cutover completed 2026-09-13** and has proven stable: prod now
runs on `docker04` alongside test, and the old LXC hosts (115/116, 192.168.1.239/.224) have
been retired and deleted from Proxmox. This doc's staged-transition and gated-approval
language below is kept as historical record of how the migration was executed; the end state
it describes is now live.

**Since the v2 cutover (#1357) neither host serves `/` from the static layout below.** Both
run the `ensemble-web` image — the v2 stand built at `ENSEMBLE_V2_BASE=/` — and a release is a
tag bump, not a file transfer. The bind-mounted runtime is still installed and still holds its
last release, which is what makes pointing a host's Caddy handle back at it a one-line audition
path. #1358 deleted v1 and every script that published to this layout (`scripts/deploy.sh`,
`static-artifact.mjs`, `publish-static.sh`, `prototypes/v2/scripts/deploy.mjs`); the containers
and their last releases stay up only as the Caddy rollback until they are retired. Read the
static sections below as that frozen runtime, not as the site.

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
  .v2-previews/...            test: v2 audition releases (from the deleted `deploy.mjs test`)
  .v2-releases/...            prod: v2 releases — last written before the #1357 cutover; CI
                              publishes none of this any more
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

CI builds it in two places. `web-image` in `ci.yml` runs on a merge to `main`, beside
`api-image`, and on a `workflow_dispatch` of any ref (`scripts/deploy-test.sh`'s branch
audition, #1358): it builds the root export, pushes `:sha-<commit>` — plus `:main` on `main`
only — pulls the sha tag back and runs the smoke script against it. `v2-root-image` in `v2-root-base.yml` is the PR-time
proof that needs no registry — same build, `load: true` instead of `push`, same smoke script —
so a rule as easy to get wrong as the `/v2/sw.js` carve-out is provable on the pull request that
writes it. Neither one touches the required contexts. **Since the cutover (#1357) `deploy` does
`needs:` `web-image`**, which is the inverse of #1356's rule and for the same reason it was
written: this image is now the release, so a red build must stop it rather than be stepped
around. `v2-root-base.yml`'s path filter was broadened in the same change — from the base-path
machinery alone to `prototypes/v2/**`, `public/**`, `hosting/web/**` and the workflow file —
because `/` is now the base production serves, and `v2-suite` still builds `/v2`: without that,
most pull requests would have had no pre-merge proof of the shipped base at all.
`ensemble-web` is a public package, like
`ensemble-api`: docker04 pulls anonymously. (The image is pushed with `provenance: false`, so an
anonymous manifest probe has to send `Accept: application/vnd.oci.image.manifest.v1+json` — a
probe that offers only the index types gets a 404 that reads like "private".)

### Running and releasing the image (#1356, infra half)

`static/compose.yml` carries a `web` service beside `static`, and `render.mjs` renders it as
`<stack>-web` — the name `ensemble-release` derives from its `web` argument:

| | ensembletest | ensemble |
| --- | --- | --- |
| Host port (Caddy only, firewalled) | 8094 | 8095 |
| Tag variable in the stack's `.env` | `ENSEMBLE_WEB_TAG` | `ENSEMBLE_WEB_TAG` |
| Routed by Caddy | yes — the host's `/` | yes — the host's `/`, since the flip (#1357) |

It runs **beside** the bind-mounted runtime on its own port rather than replacing it, so moving a
host onto the image — and back — is one `reverse_proxy` line in Caddy and never a rebuild. No
environment, no volumes, no secrets; the same `read_only`, `cap_drop: [ALL]`,
`no-new-privileges`, `tmpfs: /tmp` posture as `static`; uid 101 is the image's default. The
healthcheck restates the image's own, command and timings, so the release step's health wait
is visible from the compose file. `render.mjs` now requires `ENSEMBLE_WEB_TAG` as well as `ENSEMBLE_API_TAG`; each
becomes a `${VAR:-<pinned>}` default the on-box `.env` overrides.

`ENSEMBLE_REGISTRATION` is the third rendered value and the only one with no on-box override:
the API reads `open`/`closed` from its environment (unset means closed) and caps sign-ups at
`ENSEMBLE_REGISTRATION_CAP` (unset means 25). `render.mjs` writes it literally into the recipe,
so whether a host takes sign-ups is a reviewed line in homelab-maintenance, never a value
somebody set on the box and forgot.

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
rendered default. So a release cannot half-happen: a tag that is not in the registry cannot
become healthy — the script fails, restores the previous tag, and the job is red with the host
still serving exactly what it served before.

**Since the cutover (#1357) the `web-release` job is gone and its work lives in `deploy`**, which
is now the one release job: one tailnet join, one scoped key, and for this commit's tag
`release <stack> api` then `release <stack> web` — **prod first, then test** — with each host's
public `/build.json` asserted to name that `sourceRevision` afterwards. "Released" means the
public origin serves it, not that a command exited 0, and a merge cannot report success without
both checks. Prod before test on purpose: the byte-level canary already ran in `web-image`
(the pushed tag pulled back and smoke-tested under the stack's own container flags), an absent
or unhealthy tag is non-destructive on either host, and a staging host — which an operator is
explicitly allowed to point elsewhere, see below — must not be able to withhold the product's
release. Within a stack, api before web: server before client.

A branch audition is a release too: `scripts/deploy-test.sh [branch]` makes sure
`ensemble-web:sha-<sha>` exists (dispatching CI to build it if not) and runs `release
ensembletest web sha-<sha>` as the operator, then checks the test host's `/build.json`. The next
merge's `deploy` puts the test host back on `main`.

### The #1357 flip checklist

**The workflow deliberately does not tolerate either order.** The in-repo half and the edge
change are one atomic switch wearing two hats, and each half is broken alone: with the PR merged
but Caddy still on the bind-mounted runtime, `deploy`'s prod `/build.json` check answers 404 and
the job goes red before the test release ever runs; with Caddy flipped but `main` still carrying
the old `deploy`, every subsequent merge dies on `scripts/deploy.sh prod`'s "routed to the
ensemble-web image" preflight. That is why step 1 is a merge freeze rather than an ordering
preference — it is what makes the window between steps 2 and 4 safe in the only direction it can
be walked.

**0. Prerequisites, all owner-side.**

- The prod stack must be **re-rendered and redeployed with the `web` service**. Both stacks are
  already re-rendered in homelab-maintenance, but prod's `web` container is **not started yet**:
  `bin/docker-deploy ensemble` is what starts it.
- **Firewall:** :8095 is deliberately closed in `firewall/304.fw` and must be opened to Caddy
  (the rule mirrors 8094's). `bin/firewall-deploy 304` applies it, but only inside the owner's
  JIT grant on the PVE host (`scripts/grant-admin.sh`, time-boxed) — an agent cannot open that
  window. Check from the Caddy box that :8095 answers before step 2, as the test-host flip did.
- **Prod registration opens with this PR** (owner decision 2026-09-20: open, at the API's
  default cap of 25). `ENSEMBLE_REGISTRATION` is rendered by `render.mjs` — `open` on both hosts
  from this commit — so it reaches the box the same way the `web` service does: re-render the
  prod recipe from this branch and `bin/docker-deploy ensemble`. Until that deploy, prod's API
  keeps answering `403 registration_closed`; the accounts UI does not depend on it, and a closed
  server still signs existing accounts in.
- **A manual rehearsal release** of `ensemble web sha-<current main>` through the release
  account, with the container healthy on :8095, before any edge change. This is the one step
  that proves the prod stack can run the image at all.
- **Rollback is already rehearsed** — on ensembletest, 2026-09-20: forward, back to the previous
  tag, and a missing-tag failure, each asserted against both the running image and the public
  `/build.json`. Rollback for prod is the same command with the previous tag.
- **The release gate already accepts `web`.** `ensemble-release` was re-provisioned 2026-09-20
  and takes `release <ensembletest|ensemble> web sha-<40 hex>` on both stacks, so this is a met
  prerequisite, not a to-do.

**1. Freeze merges to `main`.** See above: needed in both orders, for two different reasons.

**2. Flip prod Caddy's `/` to :8095**, with the same handle shape ensembletest already uses —
importing **neither** `default_app_policy` nor `ensemble_cache_policy`, because the image owns
its own cache and framing policy (see the section above). The `/api/*` handles sit above it and
do not change.

**3. Verify by hand, before merging anything:**

| Check | Expected |
| --- | --- |
| `https://ensemble.brndn.zip/build.json` | `sourceRevision` is the rehearsed commit |
| `https://ensemble.brndn.zip/v2/sw.js` | **200, a file** — no `Location` header (the carve-out) |
| `https://ensemble.brndn.zip/manifest.json` | 200 at that exact path, `no-cache` |
| `https://ensemble.brndn.zip/api/auth/session` | 401 — the API is still routed past the image |

**4. Merge the #1357 PR.** Its `deploy` job releases this commit's `ensemble-web` to prod, then
test, and asserts each origin's `/build.json`. Green means prod serves the merged commit.

**5. Lift the freeze** once that `deploy` is green.

The static root contains no database or credentials. Hidden paths, `/current`, and `/api/*`
return 404. Both environments used to serve the v2 music stand at `/v2/` from the `v2` symlink;
on production the scoped `ensemble-deploy` account (which owns the static root) created
`.v2-releases/` and the symlink itself, so no root provisioning was needed (#1207). Since the
cutover (#1357) neither hostname routes to any of that — the stand is served at `/` by the
image, and `/v2/*` is the edge redirect described above. The root
publisher never touches `v2`, and the v2 publisher never touches `current`. Missing files are real 404s,
never an SPA fallback. Service workers are no-store and mutable entry points no-cache.
Old releases are retained for rollback; no automatic deletion/retention job is introduced.
Retention is not a guarantee that old tabs can lazy-load old chunks through the current root.

## Build once, verify, publish (retired)

The v1 static-artifact pipeline this section described — `npm run build:size`, sealing with
`scripts/static-artifact.mjs`, publishing with `scripts/deploy.sh` and activating with
`scripts/publish-static.sh` — was deleted with v1 in #1358. The retained releases under
`/srv/ensemble-{test,prod}/www/.releases/` are still served by the static containers on
:8090/:8091, which is what makes the Caddy line a rollback; nothing publishes there any more.
Every release is now an image tag (above).

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
| `ensemble-release` | `API_RELEASE_SSH_KEY` | `release <ensembletest\|ensemble> <api\|web> sha-<40 hex>` | anything else — the key is `restrict,command=` to a gate script |

Since the cutover (#1357) CI uses only the second of those: the `deploy` job installs the
release key alone, and `DEPLOY_SSH_KEY`/`ensemble-deploy` are no longer referenced by any
workflow. The account and its key stay provisioned for the manual static path (and for #1358 to
retire) — CI simply has no step that reaches them.

The gate (`homelab-maintenance/docker/ensemble/release/ensemble-release-gate`) parses
`SSH_ORIGINAL_COMMAND`, refuses anything but that exact shape, and sudoes — via a sudoers rule
scoped to one path — into the root-owned `ensemble-release` script, which writes
the named service's tag into `/opt/docker/<stack>/.env`, recreates only that service and waits
for its healthcheck. An unhealthy result restores the previous tag and recreates again, so a bad
image fails the CI step without taking the service down. The account is in no `docker` group and
has no password; its home, key file and scripts are root-owned. Provisioning is
`docker/ensemble/release/provision.sh` (idempotent, run as root with the CI public key).

The `deploy` job releases prod then test, and only for the images `api-image` and `web-image`
built from the same commit (`deploy` `needs` both). A `workflow_dispatch`
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
