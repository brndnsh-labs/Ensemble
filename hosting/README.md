# Ensemble hosting: one recipe, two stacks, releases are image tags

Test and production run on `docker04` from one reviewed recipe, `static/compose.yml`
(`render.mjs` materializes it per environment): an `api` service and a `web` service, each an
immutable image. A release is a tag bump. There is no bind-mounted site, no release directory
and no file transfer; the earlier `static` nginx container, its `www` directories and the
`ensemble-deploy` account were retired 2026-10-13 (#1384).

Rollback is the previous `ensemble-web` / `ensemble-api` tag, which `ensemble-release` restores
on its own when a new tag is unhealthy (below), or `git revert` and a PR for a bad commit.

## The stacks

```text
/opt/docker/{ensembletest,ensemble}/
  docker-compose.yml          rendered stack: api + web services
  .env                        ENSEMBLE_API_TAG= / ENSEMBLE_WEB_TAG= — written by the release step (#1219, #1356)
/var/lib/docker-data/{ensembletest,ensemble}/env/api.env   root-only API secret
/var/lib/docker/volumes/{ensembletest,ensemble}-api-data/   SQLite database (named volume)
```

### What the edge config must do

The site-root service worker and web manifest put four hard requirements on whatever serves
`/`. Getting one wrong strands an installed browser on a shell that no longer exists, and a
service worker is the one thing a user cannot fix by reloading.

- **`/sw.js` stays `no-store`.** The registration also asks for `updateViaCache: 'none'`, but
  the origin must not be the thing that pins a browser to the old script.
- **`/manifest.json` must keep being served at that exact path**, with `no-cache` like the other
  mutable entry points, and its `id: '/'` must never change: that `id` is the installed app's
  identity, and a new one makes a second app on the home screen.
- **No SPA fallback.** The worker serves the cached shell for a navigation the NETWORK refuses,
  which is an offline affordance, not a rewrite rule: online, a missing path must still be a
  real 404.
- **`/v2/...` is a plain 404** like any other missing path. The old beta path, its `/v2/sw.js`
  tombstone and the `/v2/* → /` redirect were retired in #1742 once no device still held the
  beta's worker.

### The `ensemble-web` image (#1356)

`hosting/web/` is the in-repo half of decision 1: a `Dockerfile`, the `nginx.conf` that answers
the four requirements above, and `smoke.mjs`, which turns each of them into an assertion against
a container that is actually running. Together they build
`ghcr.io/brndnsh-labs/ensemble-web:sha-<commit>` — the v2 stand exported at
`/` (#1734) inside `nginxinc/nginx-unprivileged`, the base image is pinned
by digest in `hosting/web/Dockerfile`. There is no release directory or symlink, because the
release IS the tag and rollback is the previous tag.

The Docker build context is `hosting/web`: three small files, of which the Dockerfile copies two
(`smoke.mjs` lives there because it belongs beside what it tests, and never enters the image).
The export itself arrives as a *named* build context, so the repository never becomes the
context and there is no `.dockerignore` to keep correct against a tree holding `node_modules`
and `.next`. Same prebuilt-artifact shape as `prototypes/v2-api/Dockerfile`; the bytes served
are the bytes the v2 gates ran against — and only those, since the Dockerfile empties the
document root first, which is what retires the base image's own `50x.html`.

```sh
npm run build --prefix prototypes/v2
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
was built from, `/sw.js` and its `SCOPE`, the manifest's `id`, immutable vs no-cache vs no-store
policy, MIME types, byte ranges and gzip on text but not on audio, an exact 404 with no
`Location` for every deterministic refusal (missing paths, `/api/*`, dotfiles, `/50x.html`, and
the retired `/v2/...` path in every shape, the open-redirect ones included) and 403-or-404 for
the one directory case, uid 101, a read-only root filesystem, and the image's own `HEALTHCHECK`
command. An SPA `try_files … /index.html` fallback fails it: missing paths answer 200 with the
app shell.

What the config does: tmpfs pid/temp paths, `server_tokens off`, the dotfile and `/api/*` 404s,
the no-SPA-fallback `try_files`, and the no-store/no-cache policy for the worker and mutable
entry points, over a single document root. Beyond that: `absolute_redirect off` (this container
speaks plain HTTP on a LAN port behind Caddy and Cloudflare, so the one redirect nginx still
makes on its own — a directory request without its trailing slash — must not publish that
address to a public browser), long-lived immutable caching for `/_next/static/`, gzip
for text only, and two of the three response headers `docs/SECURITY.md` F5 names as needing the
web-server layer: `X-Content-Type-Options: nosniff` and `frame-ancestors 'none'`. F5's third is
HSTS, which is deliberately not set here — it belongs to Caddy and is ignored over plain HTTP
anyway. `Referrer-Policy` is an addition of this config's own, not an F5 item. No brotli either —
the base image has no such module and this config does not add one.

CI builds it in two places. `web-image` in `ci.yml` runs on a merge to `main`, beside
`api-image`, and on a `workflow_dispatch` of any ref (`scripts/deploy-test.sh`'s branch
audition, #1358): it builds the root export, pushes `:sha-<commit>` — plus `:main` on `main`
only — pulls the sha tag back and runs the smoke script against it. `v2-root-image.yml` is the PR-time
proof that needs no registry — same build, `load: true` instead of `push`, same smoke script —
so an edge rule is provable on the pull request that writes it. Neither one touches the required contexts. **Since the cutover (#1357) `deploy` does
`needs:` `web-image`**, which is the inverse of #1356's rule and for the same reason it was
written: this image is now the release, so a red build must stop it rather than be stepped
around. Since #1400 the root build's Playwright suite is part of the required `v2-suite`
itself, which builds at `/`; the PR-time workflow keeps only the image smoke test.
`ensemble-web` is a public package, like
`ensemble-api`: docker04 pulls anonymously. (The image is pushed with `provenance: false`, so an
anonymous manifest probe has to send `Accept: application/vnd.oci.image.manifest.v1+json` — a
probe that offers only the index types gets a 404 that reads like "private".)

### Running and releasing the image (#1356, infra half)

`static/compose.yml` carries the `web` service, and `render.mjs` renders it as
`<stack>-web` — the name `ensemble-release` derives from its `web` argument:

| | ensembletest | ensemble |
| --- | --- | --- |
| Host port (Caddy only, firewalled) | 8094 | 8095 |
| Tag variable in the stack's `.env` | `ENSEMBLE_WEB_TAG` | `ENSEMBLE_WEB_TAG` |
| Routed by Caddy | yes — the host's `/` | yes — the host's `/`, since the flip (#1357) |

No environment, no volumes, no secrets; `read_only`, `cap_drop: [ALL]`, `no-new-privileges`
and `tmpfs: /tmp`; uid 101 is the image's default. The
healthcheck restates the image's own, command and timings, so the release step's health wait
is visible from the compose file. `render.mjs` now requires `ENSEMBLE_WEB_TAG` as well as `ENSEMBLE_API_TAG`; each
becomes a `${VAR:-<pinned>}` default the on-box `.env` overrides.

`ENSEMBLE_REGISTRATION` is the third rendered value and the only one with no on-box override:
the API reads `open`/`closed` from its environment (unset means closed) and caps sign-ups at
`ENSEMBLE_REGISTRATION_CAP` (unset means 25). `render.mjs` writes it literally into the recipe,
so whether a host takes sign-ups is a reviewed line in homelab-maintenance, never a value
somebody set on the box and forgot.

`ENSEMBLE_ADMIN_ACCOUNT_IDS` (#1717) is the opposite case on purpose: it names who can read
`/admin`, which is a fact about a person's account rather than about the host, so it is NOT in
the recipe. It lives in the stack's root-only `api.env` beside `ENSEMBLE_AUTH_IP_SECRET`, which
the `env_file` above already loads; unset means nobody. Adding an id is one line in that file
plus recreating the API container (`docker compose up -d --force-recreate <stack>-api`); the id
is what `GET /api/auth/session` answers while that account is signed in.

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
or unhealthy tag is non-destructive on either host, and a staging host — which an operator may point
elsewhere for an audition — must not be able to withhold the product's release. Within a stack, api before web: server before client.

A branch audition is a release too: `scripts/deploy-test.sh [branch]` makes sure
`ensemble-web:sha-<sha>` exists (dispatching CI to build it if not) and runs `release
ensembletest web sha-<sha>` as the operator, then checks the test host's `/build.json`. The next
merge's `deploy` puts the test host back on `main`.

## API is a separate service and a separate release

`prototypes/v2-api/Dockerfile` packages the prebuilt esbuild bundle (`npm run build` in that
directory, run by CI before the image build — #1202), production dependencies and
migrations. No tsx, source/test tree, database or secret is baked into the runtime. The process
runs non-root. `/healthz` performs a read-only schema query and returns bounded readiness and
revision, without cookies or auth-rate-budget use. Keep it on the operator/container network.

The same-origin `/api/*` route points directly from Caddy to this separate service (#1218).
Releasing the web image never starts, restarts or migrates it.

### The `api` service in the shared stack (#1217)

`static/compose.yml` carries a second service, `api`, that `render.mjs` emits as
`ensembletest-api` / `ensemble-api` beside the web container in the same homelab stack:

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
ports without rewriting the source (measured 2026-09-15).
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
  accounts/songbooks replace the disposable-stage migrate-on-start assumption. A tag rollback
  is not a database rollback.

## Releasing the API from CI (#1219)

CI never gets a shell on docker04. One scoped account, one key:

| Account | Key secret | Can do | Cannot do |
| --- | --- | --- | --- |
| `ensemble-release` | `API_RELEASE_SSH_KEY` | `release <ensembletest\|ensemble> <api\|web> sha-<40 hex>` | anything else — the key is `restrict,command=` to a gate script |

The gate (`homelab-maintenance/docker/ensemble/release/ensemble-release-gate`) parses
`SSH_ORIGINAL_COMMAND`, refuses anything but that exact shape, and sudoes — via a sudoers rule
scoped to one path — into the root-owned `ensemble-release` script, which writes
the named service's tag into `/opt/docker/<stack>/.env`, recreates only that service and waits
for its healthcheck. An unhealthy result restores the previous tag and recreates again, so a bad
image fails the CI step without taking the service down. The account is in no `docker` group and
has no password; its home, key file and scripts are root-owned. Provisioning is
`homelab-maintenance/docker/ensemble/release/provision.sh` (idempotent, run as root with the CI public key).

The `deploy` job releases prod then test, and only for the images `api-image` and `web-image`
built from the same commit (`deploy` `needs` both). A `workflow_dispatch`
hosting probe exercises the release account negatively instead: shell, foreign stack, floating
tag, short tag and wrong service must all be refused.
