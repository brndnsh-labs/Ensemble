# Ensemble v2 rollout: from beta stand to the site

**DECISION 2026-09-15.** Brandon set the goal: v2 becomes the Ensemble site, hosted on
docker04 as containers like every other first-party app, with accounts that store a library on
our server. He gave broad latitude to run the work once the decisions below were made. This
document is the durable record of those decisions and the phase plan; the live tracker is the
GitHub milestones it names. It supersedes the "no production cutover is authorized" language in
[`ensemble-v2.md`](ensemble-v2.md) and [`ensemble-v2-sync.md`](ensemble-v2-sync.md) — the
cutover is now authorized *as the end of this plan*, gated by the acceptance in each phase, not by
a further product decision.

## Decisions

1. **Hosting shape: immutable images for both halves.** CI publishes
   `ghcr.io/brndnsh-labs/ensemble-api:sha-<commit>` (the account API, Node 26, `node:sqlite`)
   and, at cutover, `ghcr.io/brndnsh-labs/ensemble-web:sha-<commit>` (the static export served by
   an unprivileged nginx image). Deploy is a tag bump plus `docker compose up`; rollback is the
   previous tag. Test and prod are the same two-service stack with different env files. The
   rsync/symlink static publish path (`hosting/README.md`) keeps serving `/` and `/v2/` until the
   web image lands at cutover, then retires. This extends the 2026-09-10 topology decision in
   `ensemble-v2-sync.md` (API as a container, API as a path on the same origin, `node:sqlite`,
   compose healthchecks, ported backups) — none of that changes.
2. **CI releases through a forced command, never a shell.** docker04 gets a dedicated release
   account whose SSH key is `restrict,command="ensemble-release"`. The script accepts only
   `<stack> <service> sha-<40 hex>`, writes the stack's env file, runs compose for that service
   and waits for the healthcheck. CI holds no docker socket, no sudo, no interactive access.
3. **Parity bar: core parity.** Before v2 takes `/` it must have: share links (its own, and
   opening v1's `?s=` links), import of v1 local data (`ensemble_userPresets`, current state)
   as a one-time, source-preserving copy, the full instrument/sound settings inventory, MIDI and
   audio export, the section practice loop, and offline install (service worker + manifest at
   root scope). Visualizer, MIDI in/out and the manual ship after cutover as v2 features.
4. **v1 retirement: hard cut.** The day v2 takes `/`, v1 is gone. No `/v1/` grace path. This
   puts the whole weight on decision 3's import and share-link compatibility, so both are
   cutover-blocking acceptance with fixture-backed tests, not best-effort.
5. **Infra execution: Claude runs docker04 and Caddy changes** through `docker04-admin` and the
   homelab-maintenance scripts (`bin/docker-deploy`, `bin/caddy-deploy`). Brandon supplies
   secrets on request: the API identity HMAC secret, and restic/B2 credentials. GHCR packages for
   this public repo are public, so docker04 needs no pull credential for them.
6. **Review gates stay.** The API stages keep the independent, cold-context review each exit
   gate requires (#1192, #1204 and their successors). Those reviews run as fresh reviewer agents
   with the story's contract and no producer context; Brandon is not asked to re-approve each
   stage. A P0 finding, a destructive data operation on real user data, or a genuinely ambiguous
   product choice still stops and surfaces (DOCTRINE §5).

## Phases

Each phase is a GitHub milestone. Stories are filed with Why / Touches / Fix / Acceptance and
picked through the normal work loop. Phases 3 and 4 interleave; 1 → 2 → 3 and 5 are sequential.

| Phase | Milestone | Exit |
| --- | --- | --- |
| 1. API online | V2 — API online | `ensemble-api` image built by CI, running on docker04 for test and prod behind Caddy `/api/*` with verified client identity, nightly backups, monitored; #1192's unmet row closed. |
| 2. Document API | V2 — API online | Stage 3 (#1201–#1204): owner-bound documents, receipts, tombstones; atomic idempotent Save; concurrency proofs on a real database; independent authorization review. |
| 3. Accounts in the product | V2 — accounts in the product | Stages 4–6 of `ensemble-v2-sync.md`: sign-in/recovery/passkey UI, library list and download, Save to cloud, local/cloud/offline status, Keep-both conflicts, account switch and sign-out, two-device and cold-start proofs on physical devices. |
| 4. Parity | V2 — parity | Decision 3's list, each as its own story, plus the v2 share-link and section-loop issues already filed (#1212, #1211). |
| 5. Cutover | V2 — cutover | `ensemble-web` image; v2 built at basePath `/`; service-worker handover from v1's worker; Caddy and compose switched; v1 source, its deploy path, `hosting/static` and the v1 CI jobs deleted; CLAUDE.md, AI_MAP.md and docs rewritten for the one app. |

## Phase 1 stories (filed 2026-09-15)

- **#1216 CI builds and publishes the API image.** A required `api-checks` context runs the API's
  typecheck, build and Vitest suite on every PR; on `main`, `docker/build-push-action` publishes
  `ensemble-api:sha-<commit>` from the `prototypes/v2-api` context with the `REVISION` build arg.
- **#1217 API service in the docker04 stacks.** `hosting/static/render.mjs` grows an `api` service
  (named volume for `/data`, root-only env file for secrets, healthcheck, memory/pids limits,
  host ports 8092 test / 8093 prod bound to the LAN address Caddy reaches), rendered into
  homelab-maintenance's `ensembletest` and `ensemble` stacks and deployed. uptime-kuma monitors
  each container's `/healthz` from inside the docker network.
- **#1218 Caddy API path split with verified client identity.** `/api/*` on both hosts proxies to the
  API port and overwrites `X-Ensemble-Client-IP` from Caddy's verified client IP (Cloudflare
  peers via `CF-Connecting-IP`, otherwise the real socket peer); the API trusts that header only
  from Caddy's exact address. Acceptance is the live probe set the threat model demands: edge and
  direct-origin spoof attempts do not alter identity, two legitimate callers get independent
  rate buckets, and `/healthz` is not reachable publicly.
- **#1219 Forced-command release path.** The `ensemble-release` account and script on docker04; a CI
  deploy step that releases the API to prod on every `main` merge (test follows `main` too
  until a branch-audition need appears). Negative tests: a malformed tag, a foreign stack name
  and a bare shell attempt are all refused.
- **#1220 Backups.** Nightly WAL-safe `sqlite3 .backup` of each API database, gzipped and rotated on
  docker04 ahead of the Proxmox Backup Server window that already carries the VM offsite to B2
  (no restic job — one monitored backup system), with a documented and rehearsed restore.
- **#1192 stage-2 exit.** Re-scoped to depend on #1216–#1218; its receipt gains the
  live-probe evidence and closes.

## Out of scope for this plan

- Snapshot sharing with revocation, admin surfaces and privacy-safe metrics (stage 7). Filed when
  phase 3 ships; a share *link* (#1212) is a client-only URL and is in phase 4.
- Any change to the musical engine, the worker contract or the sound packs. v2 bundles
  `public/` engine code unchanged; the shared-runtime extraction noted in
  `prototypes/v2/README.md` happens in phase 5 as part of deleting the v1 shell, not before.
