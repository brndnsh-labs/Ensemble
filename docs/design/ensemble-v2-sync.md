# Ensemble v2: account and offline songbook contract

Status: recovery policy and beginning staged implementation approved, 2026-09-09; GitHub #1172.
Brandon answered "sounds perfect, let's build it" to the passkeys plus recovery-code proposal.
Recorded in [the decision comment](https://github.com/brndnsh-labs/Ensemble/issues/1172#issuecomment-5605902584).
Hosting/operational ratification remains open. This is not a backend rollout, migration, or
production authorization; the existing test preview stays guest/local-only.

Brandon confirmed that import works and correctly explains why Minor Swing is unsupported.
That is import-boundary feedback, not acceptance of all playback or account behavior.
The next product slice is the original cross-device journey: save a chart on a laptop,
open it on a phone, and practice without a connection.

## Recommended product defaults

- Keep fast guest playback and the generous local songbook. Signing in never uploads
  existing local songs automatically: offer a selected-song or whole-songbook copy with
  a preview. Preserve the guest originals and record the copy mapping to make retries safe.
- Passkey-first accounts, with more than one passkey supported. Recommend a downloadable,
  high-entropy, single-use recovery code rather than passwords, mandatory email, or an
  operator identity-guessing reset. Brandon approved this recovery policy on 2026-09-09.
- Save commits locally and queues that exact version for the signed-in owner. An unsaved
  experiment never uploads. Show local safety, upload progress, and offline readiness as
  distinct states; a successful local commit is not yet a successful cloud backup.
- Automatically download the full cloud library and its required sound files, with
  visible progress, pause/retry, and a cancelable download queue. No per-song opt-in maze.
- Conflicts offer **Keep both** first. Never merge chord text or choose a winner using
  wall-clock timestamps. Keep the remote saved version, queued local version, and latest
  unsaved experiment available until the musician resolves them.
- On explicit sign-out, remove that account's local private data after a preflight that
  protects unsent saves and drafts. Cancel or export them first; discarding requires an
  explicit confirmation. Guest songs and public sound files are unaffected. Session expiry
  is different: retained offline songs remain usable, but uploads wait for reauthentication.
- No public profiles, passwords, payment tier, collaboration, or social feed in this slice.
  Stable snapshot sharing and the small admin surface follow the save/open/offline journey.

The explicit recovery approval unlocks staged implementation. Technical recommendations
below do not establish production hosting, backup retention, or a deployment go-ahead.

## What we can borrow from Songs I Know

Read-only source inspection on 2026-09-09; no claim that the sibling's current deployment
was independently verified in this checkpoint. Source paths below are relative to
`../songsiknow`; no secrets, runtime databases, or user records were read.

| Surface | Reuse | Ensemble-specific work |
| --- | --- | --- |
| `src/lib/auth/passkey-{register,login}.ts`, auth routes | SimpleWebAuthn ceremonies, one-time challenge claims, origin/RP checks, friendly browser errors | Separate RP, cookies, secrets and DB; bind challenge to ceremony/session/account; recovery and revocation tests |
| `src/lib/auth/session.ts`, `origin.ts`, `rate-limit.ts` | HttpOnly cookie handling, same-origin mutation checks, bounded abuse controls | Revocable sessions and account-state checks on every private route; no activity writes from generic session reads |
| `src/lib/db/schema.ts`, queries | SQLite/Drizzle patterns, explicit ownership predicates, transactions | Document revisions, durable outbox protocol, tombstones and idempotency; never reuse music-analysis or payment tables |
| Admin/feedback queries and routes | Small operator view, bounded feedback and operational diagnostics | Count foreground musical use, not automatic sync; exclude private chart contents from telemetry |
| `scripts/deploy.sh`, `ops/backup-db.sh` | Build/release verification, backup-before-migration, WAL-safe snapshots, health checks | Separate service/data roots and credentials; validate restoration and old-client coexistence before launch |

Do not copy WebRTC/P2P audio transfer, paid-sync checks, global auth redirects, or the
entire sibling application. Ensemble sync transfers small documents, not private stems.
Its public app shell must remain useful without a session or a reachable account server.

Two concrete non-drop-in findings:

1. The sibling calls `recordActivity` from `getSession`. Copying that would count our
   background library downloads as returning musicians.
2. Its Dockerfile pins Node 22 while its package engine and deployment script use Node 26.
   An existing Dockerfile is not a validated image or an apples-to-apples speed measurement.

## Ownership and storage

Keep the canonical versioned `ChartDocument` unchanged as the portable musical boundary.
Account ID, cloud revision, retry status, device identity, and recovery credentials do not
belong in exported charts or engine/worker state. Validate bounded input on both sides;
import source retained inside a chart is private content too.

Use a separate account-aware local store initially. Copy verified guest records from the
preview through an explicit flow; leave the original IndexedDB database and recovery keys
intact. Do not relabel existing records in place or read legacy v1 currentState/presets.
Local IDB changes later need blocked-upgrade, crash, quota and rollback tests.

| Record | Scope and authority |
| --- | --- |
| Guest song/recovery | Guest namespace; never uploaded without a copy/save gesture |
| Account document | `(ownerId, documentId)`; separate local commit revision and opaque server revision |
| Local experiment | Owner + document + writer; includes its base saved revision; never an outbox payload by accident |
| Queued Save | Owner + unique operation ID; immutable validated snapshot and predecessor/base reference |
| Server receipt | Owner + operation ID + request digest; fixed committed revision/result |
| Remote deletion | Owner + document ID + revision tombstone; old devices cannot recreate the same ID |
| Sound cache | Public, content-addressed bytes; readiness computed from actual required files |

Client-provided owner IDs are routing hints, never authorization. Every server query uses
the authenticated owner, including list, receipt lookup, update, delete, export and feedback.
Use deny-by-default request validation, payload/count limits, and same-origin checks for
cookie-authenticated mutations. Never cache private APIs, auth responses, or personalized HTML
in the service worker/CDN; responses are private/no-store. The offline cache has an explicit
allowlist of anonymous shell assets. Auth tokens and recovery codes stay out of localStorage.

## Explicit Save protocol

1. Apply and validate pending editor input. In one local transaction, compare the local
   revision and store the saved snapshot plus its immutable queued operation. Failure commits
   neither and retains the editor. Recovery and Save remain separate authorities.
2. Process operations in order per owner/document. Independent documents may proceed in
   bounded parallelism. Coordinate tabs with transactional claims; safety must survive
   duplicate senders, tab death, refresh, and browsers without a background-sync facility.
3. A queued operation refers to the last acknowledged server revision, or to its preceding
   local Save operation. Resolve a predecessor only from that operation's committed receipt,
   never from an unrelated download. Before first send, durably freeze the wire request;
   retry that same request and operation ID after an uncertain response.
4. The server atomically checks owner, operation receipt and expected revision, writes the
   document, and records the receipt. A repeated ID with identical bytes returns the original
   result; different bytes under the same ID are rejected. No timestamp last-write-wins.
   Creating requires absence and no tombstone; updating requires the exact server revision.
5. An acknowledgement updates sync metadata and advances that queue, not the open editor,
   current local saved document, or a newer queued snapshot. Local acknowledgement and queue
   advancement are atomic. A lost response is retried safely after reopening.
6. A revision conflict durably preserves the incoming remote version separately, blocks that
   document's dependent saves, and offers Keep both. It never substitutes the latest remote
   revision into the old request to force an overwrite. Keeping both creates a fresh document
   identity through an explicit resolution operation; it does not repurpose the failed ID.

Example: offline Save A queues A; edit B remains local; Save C queues C behind A; edit D
remains local. Reconnection commits A then C. Another device sees saved versions only;
this device still reopens D as unsaved. If A conflicts, A, C and D all survive and the
document queue pauses. Revert restores the latest explicit local Save, not an incidental
download or whichever acknowledgement arrived last.

For the first protocol, retain receipts and tombstones for the account lifetime. Limit abuse
with bounded requests/account storage and rate limits, not silent receipt expiry that can
turn an old offline retry into a new write. User-visible history is not promised by receipts;
they store identity/digest/result, not an unlimited duplicate chart archive.

## Downloads, offline readiness, and switching accounts

Fetch the library automatically after sign-in, reconnect, and foreground return. Use a
bounded paged change feed with a server watermark and explicit deletion records. Commit a
page and its cursor together. A partial download, invalid record, expired cursor or newer
schema never becomes an empty-library success. Preserve unsupported records without rewriting
them; explain that an app update is needed. Resetting a cursor cannot delete local work.

Remote updates may advance a clean local saved record, but cannot overwrite local drafts,
queued saves or an active chart. Keep the playing setup stable until the user adopts an
update or reopens. Dirty records receive a separate remote candidate for reconciliation.
Remote deletion removes a clean mirror; local divergent work is retained for export or an
explicit new-ID copy. A stale Save cannot resurrect the deleted cloud ID.

Offline-ready means the anonymous app shell is verified, documents are locally committed,
and every sound needed by the saved library and retained local work is verified. Account
presence, `navigator.onLine`, or a cached manifest alone proves none of those. Show separate
document and sound counts. Retry missing/corrupt files without replacing pinned voices or
claiming synthesis fallback sounds identical. Browser eviction can invalidate readiness;
recheck it and retain portable export even when the cloud is unavailable. Never promise
permanent browser storage or guaranteed background transfer while the browser is closed.

Every account-scoped asynchronous task captures an owner and local account-generation fence.
Switch/sign-out increments the fence, cancels work, stops playback, clears account-owned
runtime state, and prevents late callbacks from writing into the newly active account.
Each tab checks a durable fence before sending or committing; broadcast events only speed
notification. Account A's queue can never be rebound to B's session. An explicit request
owner must match the authenticated server owner, or the server rejects the request.

Offline sign-out can hide/clear local account data after the unsent-work preflight, but cannot
claim to have revoked a remote session. Persist a logout barrier; on reconnect, complete the
pending revocation before any private sync or new sign-in. Do not let a delayed logout of A
destroy a newly created session for B. Failure remains visible; online completion clears the
HttpOnly session cookie. Shared-device privacy is not satisfied by merely hiding the UI:
browser-local unencrypted data is not a secure vault against someone controlling that profile.

## Authentication and approved recovery direction

Recommend discoverable passkeys with consistent required user verification at registration,
login, and sensitive reauthentication. Unsupported devices keep guest/export access and get
an actionable explanation, not silently weaker verification. Test platform credentials,
security keys and cross-device flows; do not assume desktop availability from mobile success.
Use separate explicit test/prod RP IDs and canonical HTTPS origins; never broaden production
origin acceptance to make a test hostname work. No shared Songs I Know account database or SSO.

Challenge claims must be atomic, bounded, short-lived, and bound to the initiating ceremony
and session, plus the owner for adding a passkey. Check account/credential state again when
committing a login/enrollment. Issue a fresh session after authentication; store only a hashed
opaque session token server-side, with expiry/revocation and DB-backed admin authorization.
Never rely on a stale `isAdmin` cookie. Add passkey management and revoke-other-sessions.

Recovery proposal: generate a cryptographically random code, show/download once, store only
a one-way verifier, and require confirmation of keeping it before claiming setup is protected.
The code authorizes a short-lived recovery-only session, not immediate chart access. Completing
new-passkey enrollment atomically consumes it and revokes old credentials/sessions. Failed or
interrupted enrollment must not consume the only recovery route. Rate-limit attempts and
prevent concurrent claims/replay. Provide a replacement code after recovery and a safe retry
path if delivery is interrupted. Never put codes in URLs, logs, analytics, feedback or exports.

The approved product tradeoff: no email/password recovery and no support override based on
a username. Losing all usable passkeys and the code means no account recovery. Retained local
charts are still exportable, but exports do not establish ownership of a cloud account.
An already signed-in session alone must not be able to replace passkeys or recovery material
without fresh authentication. Recommend storing a second passkey before it is needed.

## Sharing, deletion, operations and privacy

Follow-up sharing publishes a detached, explicitly previewed snapshot, not a live document URL.
Use a non-guessable share capability, guest playback, independent keep-copy, and owner revocation.
Exclude raw import source and account metadata from the public snapshot unless a separately
reviewed feature explicitly requires it. Old v1 links stay valid. A revoked link cannot recall
copies that recipients already saved; make that limitation visible before publishing.

Cloud document deletion is an explicit online operation with a tombstone and recovery/export
preflight, not a side effect of removing a local download. Account deletion requires fresh auth,
revokes sessions/shares and deletes private cloud records. Disconnected devices cannot be
remotely wiped; on their next authenticated contact, reject the deleted identity and offer
export of any divergent local work before local cleanup. Define backup retention before launch
and do not advertise instant erasure from retained backups.

Recommend one Next.js Node service and one SQLite database on persistent local disk, with
the anonymous browser shell and existing engine kept separate from server-only dependencies.
Use same-origin API routes, a least-privilege service identity, data outside release directories,
explicit migrations, WAL-safe backup, off-host encrypted copies, and a tested restore procedure.
No billing or third-party auth service is required by this proposal.

An initial operational target to ratify before public accounts: backup at least every six
hours, keep seven days of recoverable copies, and prove restoration into an isolated environment.
Disclose the possible backup recovery window; do not imply every acknowledged save survives
total host loss. Never restore a backup over live data casually: old revisions, deletion
tombstones, consumed recovery codes and revoked sessions could otherwise become valid again.
A restore needs a new server epoch, old sessions/challenges invalidated, reconciliation mode,
and preserved local work before uploads resume; delete/recovery state needs separate review.

Admin should expose registrations and recent foreground activity, plus bounded error and
suggestion intake. Count Play, chart editing or an explicit Save once per coarse activity
window, not API polling, app installation, background downloads or passive account checks.
Guest retention remains unknown without an explicitly approved measurement design. Error
events use allowlisted codes/stages/build versions; no chart text/titles, import payloads,
private URLs, cookies, passkey material or stable device IDs. Feedback text is explicitly
submitted, bounded and escaped; warn users not to include private chart contents or credentials.

## Hosting feasibility and verification checkpoint

The current preview uses Next 16.3.4 with `output: 'export'`. Official documentation confirms
that static export cannot implement request-dependent account APIs; standalone output is a
Node deployment option, without making Docker mandatory. Retain the static audition while
building/testing the server mode separately. Its offline manifest must enumerate public
assets, never scan `.next` server output into a public cache.

Evidence collected locally on 2026-09-09 at application revision `f2c28fa8`:

- Existing exported preview occupies approximately 11 MiB on disk, including about 9 MiB
  of pack assets (`du -sh`, rounded allocated sizes; not compressed transfer measurements).
- `time npm run build --prefix prototypes/v2` passed in 12.389 seconds wall time, including
  root/preview typechecks, Next build and offline artifact assembly. This is one warm-cache
  local observation with installed dependencies, not a cold build or deployment comparison.
  The sandbox initially blocked Next's `git` subprocess; the unchanged command passed with
  approved local process access. No public latency estimate is inferred from this timing.
- Local Docker client and daemon report 29.8.0. No image was built or container started.
  The sibling's Node 22 image recipe is not an approved baseline for this Node 26 workspace.

Provisional recommendation: first validate a supervised standalone Node release with SQLite,
using the existing release/backup habits. Docker remains an optional packaging experiment.
Before final hosting ratification, compare cold build, warm no-op build, one-source-file rebuild,
artifact transfer, startup/health, migration and rollback on the same revision and target for
both candidates. Include native SQLite ABI compatibility, memory/disk use, volume ownership and
secret handling. No measured standalone-versus-Docker winner is claimed here; #1172 remains
open until this evidence and the product decisions are ratified.

## Staged implementation acceptance

#1177 is implemented on the v2 branch: separate account-local records, writer recovery,
transactional explicit-Save outbox, frozen retries, guarded acknowledgements and preserved
conflicts. It has native Chromium/WebKit storage tests with injected transports, not a live
account service or UI. Keep its review/delivery receipt distinct from deployment and user
acceptance. The [next batch](ensemble-v2-next-batch.md) breaks the immediate work into bounded
handoffs; the [v2 guide](../../prototypes/v2/CLAUDE.md) defines the common branch-only cycle.

Later stages below are **acceptance contracts, not ready-to-cycle tickets**. Shape each into
small implementation children with exact files, prerequisites and tests before scheduling.

1. **Local foundations:** bounded owner-only listing, request validation, independent status
   facts and one-pass outbox processing. Prove semantic v2 documents survive Save/retry as
   exactly as v1. No guest bootstrap, authentication or server wiring in those helpers.
2. **Authentication/recovery in isolation:** register/login/add/revoke passkeys, hashed revocable
   sessions and recovery-only enrollment on disposable data. Tests must reject wrong origin/RP,
   cross-account ceremonies, expired/replayed challenges, missing user verification and concurrent
   recovery claims; interruption cannot consume the sole recovery route. No real account launch
   until implementation choices and threat-model review are complete.
3. **Owner-bound revision API:** authenticated owner predicates on every read/write/receipt,
   atomic document+receipt transaction, same-byte duplicate success, changed-byte ID rejection,
   revision conflict and tombstone non-resurrection. Prove lost-response and concurrent-client
   behavior on a throwaway real database, not just a mock transport. API/auth responses are
   private/no-store and excluded from offline artifacts. This depends on verified auth and
   a selected server persistence implementation; it does not authorize live migrations.
4. **Library download/reconciliation:** bounded pages with transactional cursor advancement,
   dirty/active-chart preservation, explicit unsupported-version failures and tombstones.
   Guest copy is opt-in and retry-safe with originals retained. Keep both mints a fresh identity
   and preserves queued and unsaved versions. Test interrupted pages and owner switches before UI
   integration. Do not treat timestamps or receipt arrival as permission to overwrite a chart.
5. **Account/offline product integration:** on two independent browser contexts, Save A then C
   while unsaved D stays local; the other device receives only explicit Saves. Full-library
   downloads and required sound verification support offline cold start. Account switch, expired
   session and sign-out preflight preserve work and isolate owners; pending remote logout cannot
   destroy a later session. Preserve guest/legacy sentinels and instrument voices throughout.
6. **Test hosting and recovery rehearsal:** ratify topology/backup policy from measurements;
   verify immutable release identity, private-cache exclusions, WAL-safe backup, isolated restore,
   server epoch invalidation and rollback applicability. Then physical Edge/macOS and iPhone
   passkey/playback/eviction acceptance. No production cutover or destructive migration follows
   automatically from a green preview.
7. **Snapshots/admin:** after the save/open/offline journey, separately scope immutable public
   snapshots with revocation and stripped private source/metadata, plus registrations, foreground
   return activity and bounded error/suggestion intake. Old shares remain compatible; automatic
   polling must not count as returning use. Private chart text/URLs/credentials stay out of logs.

Required failure proofs: crash between local save and enqueue; server commit with lost reply;
duplicate senders; multiple offline Saves plus later unsaved edits; remote conflict/deletion;
account A response arriving after B signs in; offline logout and session expiry; quota failure;
unsupported document version; interrupted paged download; missing sound; service-worker update
during playback; server restore with old receipts. Every case must preserve authored content,
exclude foreign-owner data, and avoid falsely reporting cloud-save or offline-ready success.

## Reference evidence

- Existing Ensemble seams: `prototypes/v2/lib/repository.ts`, `lib/session.ts`,
  `scripts/offline.mjs`, `next.config.mjs`, and `public/songbook/` codecs.
- [Next.js static-export backend boundary](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/backend-for-frontend.mdx)
  and [standalone output/tracing](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/05-config/01-next-config-js/output.mdx),
  retrieved through Context7 on 2026-09-09. These establish framework options, not deployment proof.
- [SimpleWebAuthn configuration](https://github.com/masterkale/simplewebauthn/blob/master/_autodocs/configuration.md),
  retrieved through Context7 on 2026-09-09. The required-verification recovery policy above is
  an approved Ensemble product policy, not a claim that copying library defaults defines a complete auth system.
