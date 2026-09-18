# Ensemble v2 account API

Stage 2 of the [account/sync contract](../../docs/design/ensemble-v2-sync.md). A standalone Node
service — a sibling of `prototypes/v2/`, not a subdirectory of it, so its sources stay out of the
Next app's compilation and static-export config.

**#1187** (story 1 of 6) laid the substrate: package skeleton, schema, migration runner and a
disposable-database test harness. **#1188** (story 2 of 6) added the WebAuthn registration and
login ceremony modules (`src/auth/`) and migration `0002`. **#1189** (story 3 of 6) added the
session model (`src/auth/session.ts`, migration `0003`) and — per its ratified scope amendment —
the entire HTTP layer on Hono (`src/http/`, `src/server.ts`): this is the first story where the
service is actually reachable over a socket. **#1190** (story 4 of 6) added passkey management
(add/list/revoke) and step-up re-authentication, gated by a single fresh-authentication predicate
(`src/auth/fresh-auth.ts`, migration `0004`) — see "Passkey management and step-up
re-authentication (#1190)" below. **#1191** (story 5 of 6) added single-use recovery codes —
enroll/confirm/claim, and a restricted recovery-only session that can do nothing but enroll one
new passkey (`src/auth/recovery.ts`, `src/auth/rate-limit.ts`, migration `0005`) — see "Recovery
codes and the recovery-only session (#1191)" below. **No wiring to `prototypes/v2/` or `public/`
lands here**. **#1192** adds bounded endpoint policies, per-route HMAC-IP rate limits,
metadata-only security events (migration `0006`), a deletion-coverage registry and the
[threat model](../../docs/design/ensemble-v2-auth-threat-model.md). **Its stage-exit gate remains
open:** read-only live proxy probes found direct-origin client-IP spoofing, and the actual API
route/socket identity is not built or verified. See the explicit receipt in that document and
[`docs/design/ensemble-v2-next-batch.md`](../../docs/design/ensemble-v2-next-batch.md).

## Layout

| Path | Responsibility |
| --- | --- |
| `src/db/connection.ts` | Opens a `node:sqlite` `DatabaseSync` and sets `journal_mode=WAL`, `busy_timeout`, `foreign_keys=ON` explicitly. |
| `src/db/transaction.ts` | `withTransaction(db, fn)` — `node:sqlite` has no built-in `db.transaction()` helper; every multi-statement write must use this. |
| `src/db/migrate.ts` | Hand-rolled, content-addressed migration runner. Depends only on `node:fs`/`node:crypto`/`node:sqlite`, deliberately not on any migration-authoring toolkit. |
| `migrations/*.sql` | Schema, applied in filename order. `0001_init.sql` creates `accounts`, `credentials`, `challenges`, `sessions`, `recovery_codes`. `0002_challenge_ceremony_hash.sql` adds `challenges.ceremony_hash` (+ its unique index) for #1188's ceremony-token binding. `0003_session_token_hash.sql` adds `sessions.token_hash` (+ its unique index) for #1189's session token model. `0004_passkey_management_bindings.sql` adds `sessions.credential_id` (nullable, `ON DELETE SET NULL`, indexed) and `challenges.session_id` (nullable, no FK) for #1190. `0005_recovery_session_and_code_state.sql` adds `sessions.purpose`/`recovery_code_id`, `recovery_codes.confirmed_at`/`claimed_at`, and a unique index on `recovery_codes.code_hash`, for #1191. |
| `src/auth/config.ts` | `createWebAuthnConfig({ rpId, rpName, origin })` — validates and freezes ceremony config. The origin must already be canonical, and `rpId` must **exactly** equal its hostname (no parent-domain relaxation; separate environments use separate RP IDs). Always passed as an argument; never a module-level `process.env` read. |
| `src/auth/challenges.ts` | `claimChallenge` — the one `DELETE ... RETURNING *` atomic challenge claim — plus ceremony-token minting/hashing and the expired-row sweep. `ChallengeType` is `'registration' \| 'login' \| 'reauth' \| 'add_passkey' \| 'recovery_enroll'` (`reauth`/`add_passkey` added by #1190, `recovery_enroll` by #1191 — the one ceremony a recovery-only session is ever allowed to start). |
| `src/auth/request-guard.ts` | `isMalformedCeremonyRequest(input)` — the shallow shape guard both verify functions run first, synchronously, before the challenge claim, so a malformed request returns `malformed_request` without consuming the ceremony token. |
| `src/auth/credential-row.ts` | Shared `credentials` row shape, transports JSON encode/decode, and the duplicate-credential-id error classifier. |
| `src/auth/registration.ts` | `startRegistration` / `verifyRegistration` — discoverable-passkey registration against the real `@simplewebauthn/server` verify path. |
| `src/auth/login.ts` | `startLogin` / `verifyLogin` — usernameless login. Its own verify-and-commit core is `src/auth/assertion-commit.ts` (#1190), shared with reauth. |
| `src/auth/assertion-commit.ts` | `verifyAssertionAndCommitCounter` (#1190) — the counter-regression-safe assertion verify + commit, extracted out of #1188's `verifyLogin` so #1190's `verifyReauth` can share it instead of copying it. `login.ts`'s own tests are the regression guard that the extraction changed nothing. |
| `src/auth/fresh-auth.ts` | `isFreshlyAuthenticated` / `FRESH_AUTH_WINDOW_MS` (#1190) — the ONE "freshly authenticated" predicate: one SQL read requiring the session to belong to the account, be unrevoked, unexpired, created within the last 10 minutes, and to have been created by a passkey ceremony (`credential_id IS NOT NULL`). Called at add-passkey options, inside the add-passkey commit transaction, and as the first step inside `revokePasskey`'s transaction. |
| `src/auth/recovery-material.ts` | `hasEnrolledRecoveryMaterial` — "does this account have at least one CONFIRMED, unconsumed `recovery_codes` row." Introduced narrow by #1190 (just `consumed_at IS NULL`) for `revokePasskey`'s last-credential guard; tightened by #1191 to also require `confirmed_at IS NOT NULL` — an enrolled-but-never-proven-possessed code must not stand in as a safety net. |
| `src/auth/rate-limit.ts` | Factory-produced, single-process sliding-window limiter with injectable time, 10,000-key cap and shared overflow bucket. Every auth route has an independent budget through `src/http/auth-policy.ts`. |
| `src/http/auth-policy.ts` | Exhaustive route registry: allowlisted bounded request shapes and independent rate limits; unknown endpoints/fields/query input fail closed. |
| `src/http/client-identity.ts` | Domain-separated HMAC-SHA256 caller keys, canonical IPs, and an explicitly configured header trusted only from exact immediate proxy peers. Upstream sanitization must be verified separately. |
| `src/auth/security-events.ts` | Best-effort metadata-only event recording, fixed error descriptions, 30-day/10,000-row retention bounds. |
| `src/db/account-deletion-registry.ts` | The wipe order as `{ table, column }` pairs plus the retained/global classification; drift guard covers every table, including no-FK challenges. `deleteAccount` walks this list — nothing else may restate it. |
| `src/auth/account-deletion.ts` | `deleteAccount` (#1271) — one `BEGIN IMMEDIATE` transaction: fresh-auth check, the registry's wipe, then one metadata-only `account_deleted` event registering the deleted identity. See "Account deletion (#1271, stage 7)" below. |
| `src/auth/recovery.ts` | `enrollRecoveryCode` / `confirmRecoveryCode` / `claimRecoveryCode` / `readLiveRecoverySession` / `startRecoveryEnrollPasskey` / `verifyRecoveryEnrollPasskey` (#1191) — see "Recovery codes and the recovery-only session (#1191)" below. |
| `src/auth/reauth.ts` | `startReauth` / `verifyReauth` (#1190) — step-up re-authentication. `allowCredentials` is the account's own credentials (unlike login's empty/usernameless list); the challenge binds `account_id` AND `session_id`; verify shares `assertion-commit.ts`'s core with login. Success does not itself rotate the session — the caller (the HTTP route) does that via `finishAuthentication`. |
| `src/auth/passkeys.ts` | `startAddPasskey` / `verifyAddPasskey` / `revokePasskey` / `listPasskeys` (#1190). Add-passkey requires a FRESH session (checked at options AND re-checked inside the verify commit transaction) and binds `account_id` + `session_id` into the challenge; an already-registered credential on the same account is a no-op (`alreadyRegistered: true`), on another account it's `credential_exists`. `revokePasskey` is one synchronous transaction: fresh check, owner-scoped lookup, last-credential guard (owner-scoped SELECT/DELETE and account-scoped session revocation — never trust `id`/`credential_id` alone), revoke every session the credential created, delete. `listPasskeys` never returns the public key or counter. |
| `src/auth/session.ts` | `issueSession` / `readSession` / `revokeSession` / `revokeOtherSessions` — hashed, revocable, 30-day-absolute sessions (#1189). `readSession` performs zero database writes. #1190 adds an optional `credentialId` argument to `issueSession` (defaulting to `null`, so every pre-#1190 call keeps its exact behavior) and a `credentialId` field to `SessionClaims`, recording which credential's ceremony created the session. #1191 adds two more optional trailing arguments, `purpose` (`'standard' \| 'recovery'`, default `'standard'`) and `recoveryCodeId` (default `null`) — same additive discipline, every pre-#1191 call unchanged. `purpose` is the enforcement mechanism for the recovery-only session's privilege boundary; see below. |
| `src/auth/index.ts` | Barrel re-export of the above. |
| `src/http/app.ts` | `createApp({ db, config, now?, sessionTtlMs?, clientIdentity? })` — Hono factory wiring headers, guards, endpoint policy and audit recording. Standard/recovery session-purpose guards remain distinct; successful authentication rotates the session. |
| `src/http/same-origin.ts` | `sameOriginGuard(config)` — our own CSRF defense (never `hono/csrf`, which does not satisfy the contract — see the module doc comment). |
| `src/http/content-type.ts` | `jsonOnlyGuard()` / `requestHasBody()` — 415 on a body-carrying unsafe method that isn't `application/json`. |
| `src/http/cookies.ts` | Ceremony/session cookie transport — names, `__Host-` prefixing, and attributes, all derived from `config.origin`. |
| `src/http/headers.ts` | `securityHeaders()` — `Cache-Control`, CSP, `X-Content-Type-Options`, `Referrer-Policy` on every `/api/*` response, including 404/413/415/403/500. |
| `src/http/errors.ts` | `sendError` / `ceremonyFailureResponse` / `revokePasskeyFailureResponse` / `recoveryActionFailureResponse` (#1191) — the collapsed `{ error: <code> }` taxonomy. `malformed_request` is 400; `fresh_auth_required` (add-passkey, and #1191's enroll/confirm) is 403; every other ceremony failure reason, including #1190's `session_mismatch` and #1191's `recovery_session_invalid`/`account_not_found`/`recovery_code_not_found`, is `401 authentication_failed`. `revokePasskey`'s own reasons map separately: `fresh_auth_required` 403, `not_found` 404, `last_credential` 409. `recoveryActionFailureResponse` (enroll/confirm): `fresh_auth_required` 403, `not_found` 404. `rate_limited` (#1191, the recovery-claim limiter) is 429. |
| `src/server.ts` | The only file that reads `process.env`. Builds config, opens the database, runs migrations, starts `@hono/node-server`, and closes the database on `SIGTERM`/`SIGINT`. |
| `test/helpers/test-db.ts` | `createTestDatabase()` — a fresh on-disk (never `:memory:`, which can't hold WAL mode) SQLite file per test, migrated for real. |
| `test/helpers/soft-authenticator.ts` | `createSoftAuthenticator({ rpId, origin })` — a software WebAuthn authenticator that builds real ES256 registration/assertion responses (`node:crypto` + `isoCBOR`/`isoBase64URL`) so ceremony tests exercise the actual library verify path, not a mock. Controllable origin, RP ID, UV flag, counter, `userHandle` and signing key pair. |
| `test/helpers/cookie-jar.ts` | `createCookieJar()` — a minimal same-origin cookie jar for `app.request()` HTTP tests, using `Headers#getSetCookie()` rather than a naive comma-split. |

## WebAuthn ceremonies (#1188)

Registration and login are library modules only — no HTTP layer, no cookies, no sessions.
Callers pass `(db, config, input)`; routes and session issuance land in #1189. Both `verify*`
functions return a typed `{ ok: true, accountId, credentialId }` or `{ ok: false, reason }`
result — the library's verify calls throw on rejection, and every throw is caught before it can
escape as success. Neither function issues a session.

Key decisions (see the #1188 issue and its orchestrator decision comment for the full rationale):

- **Ceremony binding without a session.** `startRegistration`/`startLogin` mint a random 32-byte
  ceremony token, returned only to the caller; the `challenges` row stores just its SHA-256 hash.
  `verifyRegistration`/`verifyLogin` require the token back.
- **Atomic challenge claim.** `claimChallenge` is a single `DELETE ... RETURNING *` prepared
  statement, executed synchronously before the first `await` in each verify function — this is
  what makes two concurrent claims of the same ceremony token resolve to exactly one success.
- **`expectedRPID` is explicit at both verify call sites.** It is optional on
  `verifyRegistrationResponse` and omitting it silently disables the RP ID check entirely
  (measured against the installed v14.0.1) — never omit it.
- **`requireUserVerification: true` is explicit at both verify call sites**, matching the
  `userVerification: 'required'` requested at options time. Never rely on the library's default.
- **Monotonic signing counter under concurrency.** The login commit uses a single conditional
  `UPDATE ... WHERE sign_count < ? OR (? = 0 AND sign_count = 0)` so a synced passkey's `0 -> 0`
  counter always succeeds while a real regression (or a losing side of a concurrent-commit race)
  is rejected with zero rows changed.

## Sessions and the HTTP layer (#1189)

This story adds the session model and — per its ratified scope amendment — the entire HTTP
server. The service is reachable over a real socket for the first time here.

**Session model** (`src/auth/session.ts`):

- A session token is 32 random bytes, base64url-encoded (43 characters); only its SHA-256 hex
  digest is stored, in `sessions.token_hash` (unique index). `sessions.id` is a separate random
  identifier, so revoking a session never needs its raw token.
- Lifetime is 30 days, **absolute** — no sliding renewal, because the contract forbids writes on
  the read path and sliding expiry would need one.
- `readSession` performs **zero writes** — one `SELECT`, requiring `revoked_at IS NULL`,
  `expires_at > now`, and that the owning account row still exists (via a `JOIN`).
- `revokeSession` is owner-scoped: presenting a foreign `accountId` is a silent no-op, never a
  throw. `revokeOtherSessions` returns the count revoked, and only ever revokes `'standard'`
  sessions — a live `'recovery'` session on another device survives "sign out other devices"
  (#1296), since it already can't read anything and expires on its own.

**HTTP layer** (`src/http/`, `src/server.ts`), built on Hono `4.13.7` + `@hono/node-server`
`2.1.1` — zero additional runtime dependencies:

- **Never `hono/csrf`.** Measured against the installed version: it only checks form-like content
  types and never consults `Referer`, so a header-less or foreign-origin JSON mutation passes
  straight through it. `src/http/same-origin.ts` implements the sibling's `isSameOrigin` shape
  instead — `Sec-Fetch-Site` must be exactly `same-origin` when present, `Origin` must equal
  `config.origin` exactly when present (never the request URL — the container's internal
  `http://` origin behind Caddy), falling back to a parsed `Referer`, and failing closed
  (`403 forbidden_origin`) when both are absent.
- **`bodyLimit(64 KB)` needs a real socket to prove.** In-memory `app.request()` traffic never
  reproduces real HTTP framing (no auto Content-Length, and `bodyLimit`'s Content-Length branch
  trusts a declared length without re-checking actual bytes read). `test/http/body-limit.socket.test.ts`
  starts a real `@hono/node-server` instance and drives it with raw `node:net` sockets.
  Test authors sending a body through `app.request()` must set an explicit `Content-Length`
  header themselves — fetch's `Request` never surfaces a computed one via `.headers`.
- **Collapsed error taxonomy** (`src/http/errors.ts`): every response body is `{ "error": "<code>" }`.
  Every ceremony failure reason except `malformed_request` becomes `401 authentication_failed` —
  a probing client cannot tell "wrong signature" from "credential does not exist."
- **Cookies** (`src/http/cookies.ts`): `ensemble_ceremony` and `ensemble_session`, `HttpOnly`,
  `SameSite=Strict`, `Path=/`. An `https:` config gets the `__Host-` prefix and `Secure`; the
  `http://localhost` development config drops both (the `__Host-` prefix is a browser-enforced
  contract requiring `Secure`, which plain HTTP cannot satisfy).
- **Fixation defense** lives in `src/http/app.ts`'s `finishAuthentication`, not in `session.ts`:
  on every successful verify, it revokes any session presented on that same request (by that
  session's own owner, from `readSession`) before minting the fresh one.
- **Routes** are all under `/api/auth`: `POST register/{options,verify}`, `POST
  login/{options,verify}`, `GET session`, `POST logout` (idempotent, `204`), `POST
  sessions/revoke-others` (requires a session, `204`). #1190 adds passkey management and
  step-up reauth routes — see below.
- **Security headers** (`src/http/headers.ts`) are registered on `'*'`, so they land on every
  response the process sends — a path outside `/api`, `app.notFound`'s 404 and `app.onError`'s
  500 included.
- **Guard order:** security headers, then same-origin, then JSON-only, then `bodyLimit`. Neither
  guard reads the body, so a cross-origin or wrong-type request is refused on headers alone
  before `bodyLimit` would drain an unsized stream. `SAFE_METHODS` (`GET`/`HEAD`/`OPTIONS`,
  `src/http/http-safe-methods.ts`) is the one exemption list both guards share; every other
  method, `PURGE` included, is gated.

## Passkey management and step-up re-authentication (#1190)

Adding or revoking a credential is a sensitive operation. A valid session alone is not enough —
the contract requires a RECENT user-verified ceremony, so a stolen or borrowed logged-in session
cannot be silently promoted into permanent account takeover by enrolling an attacker's passkey
and revoking the owner's.

- **The fresh-authentication rule** (`src/auth/fresh-auth.ts`): `isFreshlyAuthenticated(db,
  sessionId, accountId, now)` is the ONE implementation of "fresh" in this service — a single SQL
  read requiring the session to belong to the account, be unrevoked, unexpired, **created within
  the last 10 minutes** (`FRESH_AUTH_WINDOW_MS`), and to have been created by a real passkey
  ceremony (`credential_id IS NOT NULL`). Every session is created by a user-verified ceremony
  (registration, login, or reauth), so a brand-new session is fresh for 10 minutes from the
  moment it's issued — enrolling a second passkey immediately after signup works with zero
  friction. The predicate is checked in three places: at `passkeys/options` (before any ceremony
  starts), again inside `passkeys/verify`'s commit transaction (the WebAuthn ceremony's
  real-world await — the user physically touching a key — is exactly the window a session can go
  stale in), and as the first step inside `revokePasskey`'s transaction. `credential_id IS NOT
  NULL` fails safe for #1191's future recovery session, which has none.
  **Known residual risk:** a session picked up within 10 minutes of the owner's login can still
  add a passkey, sign in with it and revoke the owner's. No bounded window closes that; the
  mitigation (security events for passkey add/revoke) is carried on #1192.
- **Step-up re-authentication** (`src/auth/reauth.ts`): `POST /api/auth/reauth/options` requires
  a valid (not necessarily fresh) session and returns authentication options scoped to that
  account's own credentials (`allowCredentials`, unlike login's empty/usernameless list). The
  challenge binds both `account_id` and `session_id`. `POST /api/auth/reauth/verify` requires the
  presented session to be EXACTLY the bound one, for the bound account, then shares
  `assertion-commit.ts`'s verify-and-commit core with login. On success it rotates the session
  (revokes the presented one, issues a fresh one with `credential_id` set) via the same
  `finishAuthentication` fixation defense register/login use — a step-up is a privilege change,
  so the token is renewed rather than a flag stamped on the old row.
- **Adding a passkey** (`src/auth/passkeys.ts`): `POST /api/auth/passkeys/options` requires a
  FRESH session; its options reuse the account's existing WebAuthn user handle (`userID`, decoded
  back from the account id) and set `excludeCredentials` to the account's current credentials.
  `POST /api/auth/passkeys/verify` order is: shape guard, claim the challenge, require the
  presented session to be exactly the bound session for the bound account, verify the response,
  then commit — re-checking freshness and account existence inside the same transaction before
  inserting. An authenticator already registered on the SAME account is a clean no-op
  (`alreadyRegistered: true`, never overwriting the stored public key or counter); already
  registered on ANOTHER account is `credential_exists`.
- **Revoking a passkey** (`POST /api/auth/passkeys/revoke`, body `{ credentialId }`): one
  synchronous transaction, in order — fresh check (a stale session gets `403` whether or not the
  target exists, so it can't be used to probe for ids); owner-scoped lookup (a nonexistent
  credential and one belonging to another account return an IDENTICAL `404 not_found`, with no
  side effects either way); the last-credential guard (`409 last_credential` unless
  `hasEnrolledRecoveryMaterial` — at least one CONFIRMED, unconsumed `recovery_codes` row — says otherwise);
  revoke every session that credential created (a lost device's passkey being revoked must end
  that device's sessions, not only block its future logins); delete. The response is `200
  { signedOut }`, and the session cookie is cleared when the revoked credential turns out to have
  been the one that created the CURRENT session.
- **Listing passkeys** (`GET /api/auth/passkeys`): requires a session, but not a fresh one —
  listing is not a sensitive write, and it's the prerequisite for revoking by id. Returns `id`,
  `createdAt`, `lastUsedAt`, `transports` and `current` (whether this credential created the
  requesting session) — never the public key or counter.
  #1192 bounds account credentials to 32, checked before add options and inside the add commit;
  `409 credential_limit` allows the client to explain that an existing key must be removed first.
- **New error codes** (`src/http/errors.ts`): `403 fresh_auth_required` and `409
  last_credential`. Everything else — including the new `session_mismatch` ceremony-binding
  failure — collapses into the existing `401 authentication_failed` / `400 malformed_request`
  taxonomy, for the same anti-probing reason as #1189's decision 14.
- **Shared, not copied**: `src/auth/assertion-commit.ts` extracts the assertion-verify-and-commit
  core (counter-regression handling included) out of #1188's `verifyLogin` so `verifyReauth` can
  reuse it. `verifyLogin`'s own public behavior, and every #1188 test, is unchanged.

## Recovery codes and the recovery-only session (#1191)

This is the only account-recovery mechanism the service has — no email reset, no operator
override. A single-use, high-entropy code is the sole thing standing between a lost device and a
permanently gone account, so its failure modes bias hard toward "the code stays usable" over
"the recovery completed."

- **Enroll, then prove possession, before it counts.** `POST /api/auth/recovery/enroll` (fresh-
  auth-gated, same gate as add-passkey) mints a code and returns the raw value exactly once —
  only its SHA-256 hash is ever stored. `hasEnrolledRecoveryMaterial` does not report the account
  protected yet: `POST /api/auth/recovery/confirm` must present that same code back before
  `confirmed_at` is set. Calling `enroll` again (an interrupted download, or rotating a code on
  purpose) replaces any existing LIVE row outright — at most one unconsumed code per account.
- **The privilege boundary is a session field, not an accident of which routes check freshness.**
  A recovery code authorizes ONLY enrolling one new passkey — not chart access, not any other
  sensitive operation. `sessions.purpose` (migration `0005`) is `'standard'` for every session
  register/login/reauth/passkey-add ever mint, or `'recovery'` for the one a successful
  `POST /api/auth/recovery/claim` mints. `requireSession` (`src/http/app.ts`) refuses a live
  `'recovery'` session identically to a missing/invalid one — this covers every existing
  session-reading route, `GET /api/auth/session`/`POST /api/auth/logout`/`POST
  /api/auth/sessions/revoke-others` included (those three predate `requireSession` and were
  refactored onto it for exactly this reason). `requireRecoverySession` is the sole exception,
  used only by `POST /api/auth/recovery/enroll-passkey/{options,verify}`.
- **Claiming is one atomic statement.** `claimRecoveryCode` is a single `UPDATE ... SET
  claimed_at = ? WHERE ... RETURNING`, the same synchronous-`node:sqlite`-has-no-interleaved-
  statements discipline `claimChallenge` established in #1188 — two concurrent claims of the same
  code can never both succeed. The `claimed_at` lock self-expires after `RECOVERY_SESSION_TTL_MS`
  (10 minutes, the same constant as the recovery-only session's own lifetime): if the enrollment
  ceremony it authorized never completes, the code becomes reclaimable the instant that session
  would have died anyway — no separate sweep or unclaim step.
- **Consume-and-enroll is one transaction, in this order:** re-check the recovery session is
  still live, re-check the account exists, consume the code (`UPDATE ... WHERE consumed_at IS
  NULL`, aborting closed if it doesn't affect exactly one row), revoke every live session on the
  account (the recovery session included — no special-casing needed), delete every existing
  credential, insert the new one. Any abort rolls back everything, INCLUDING the consume step —
  this is what makes an interrupted or failed enrollment leave the code still usable, the single
  most important property in this story. On success, `POST
  /api/auth/recovery/enroll-passkey/verify` calls `finishAuthentication` (unlike ordinary
  add-passkey, which deliberately doesn't) — completing recovery genuinely is a fresh
  authentication event, and the resulting session is immediately fresh, so the client can enroll
  a replacement recovery code right away via the same enroll/confirm pair.
- **Rate limiting**: recovery claim retains 10 attempts per ten minutes; all auth endpoints now
  have independent budgets. Keys are HMACs, never raw IPs. Proxy mode replaces the old unsafe
  header-only option with `clientIdentity: { secret, header, trustedProxyAddresses }`, and
  requires verified upstream sanitization. Current Caddy static-route probes preserved a
  direct-origin spoofed CF header: selecting that header today is unsafe even when the socket
  peer is Caddy. Socket-only mode behind a shared proxy instead collapses callers into one
  bucket. The threat model names both failure modes and the required API-scoped operator work.
- **Never logged.** The raw code is a SQL bind parameter's hash input, never the parameter
  itself, at every call site; no thrown error, log line, or response body other than the one-time
  `enroll` response ever carries it.

## Explicit Save endpoint (#1202, stage 3 story 2)

`POST /api/documents/save` is protocol step 4 of
[`ensemble-v2-sync.md`](../../docs/design/ensemble-v2-sync.md#explicit-save-protocol): the
server atomically checks owner, operation receipt and expected revision, writes the document
and records the receipt. Owner-scoped storage is #1201's `src/db/documents.ts`; the decision
table is `src/db/save.ts` (`commitSave`, one `withTransaction`); the route is
`src/http/documents.ts`.

| Situation | Reply |
| --- | --- |
| Create (`expectedRevision: null`), id absent, no tombstone | `200 { …receipt, revision, kind: 'committed' }` |
| Update with the exact current revision | `200 … kind: 'committed'` (new revision) |
| Same operation id, same bytes (retry after an uncertain response) | the original `200`, no second write, no new revision |
| Same operation id, different bytes or document | `409 { error: 'operation_mismatch' }` — never overwritten |
| Stale revision, create over an existing id | `409 { …receipt, revision: <current>, kind: 'conflict', remote: { revision, document } }` |
| Create or update over a tombstone; update of an id the owner never had | `409 … kind: 'conflict', remote: null` |
| Any decoder refusal — including an envelope `ownerId` that is not the session's account | `400 { error: 'malformed_request' }` |
| Owner at a storage cap (#1234) — create at `MAX_DOCUMENTS_PER_OWNER`, or a write crossing `MAX_BYTES_PER_OWNER` | `409 { error: 'quota_exceeded' }` — nothing written |

Design points worth knowing before changing it:

- **Concurrency is proven by processes, not argued.** `test/db/save-concurrency.test.ts` (#1203)
  races real OS processes, each with its own `DatabaseSync` handle on one WAL file, released
  from a two-file barrier in `test/helpers/save-worker.ts`. `node:sqlite` is synchronous, so two
  connections in ONE process serialize on the interpreter and can never interleave — a
  same-process concurrency test passes with or without `BEGIN IMMEDIATE`. Every assertion is an
  invariant that holds whichever racer wins, so the race decides who and the protocol decides
  what. Verified by mutation: swapping `BEGIN IMMEDIATE` for a deferred `BEGIN` is caught every
  run.

  The wall-clock proofs and the SEQUENCED one cover each other's weaknesses, which is why both
  are there. The wall-clock proofs race for real but need cores to spare: measured on two loaded
  cores the racers enter 3-8ms apart while each transaction takes ~0.3ms, so they stop
  overlapping and the deferred-`BEGIN` mutation slipped through 4 runs in 12. The sequenced
  proof pauses a racer INSIDE the transaction at the `mintRevision` seam — after the reads,
  before the first write, exactly when a transaction holds nothing but a read snapshot — so the
  parent sequences the interleaving instead of hoping for it. On those same two loaded cores it
  catches the mutation 8 times out of 8 on its own. Do not delete it as redundant.
- **The storage caps are injectable so they can be raced (#1247).** `SaveDependencies` carries
  optional `maxDocumentsPerOwner`/`maxBytesPerOwner`, defaulting to the shipped constants;
  production passes neither, and `test/db/save.test.ts`'s first quota case proves the defaults
  at full scale so forgetting to inject one can never quietly relax the gate. The reason for the
  seam is that the quota's own claim — "a concurrent writer cannot slip past a cap this read just
  saw" — needs two racers AT the cap, and the byte cap is 256 MiB: unreachable in a test without
  lowering it. `save-concurrency.test.ts` now races both caps and asserts the owner's final usage
  never lands past the cap, which is the exact damage the bug does.

  Verified by mutation — hoisting the usage read out of `withTransaction`, on two loaded cores:

  | proof | catches the hoist |
  | --- | --- |
  | four racers for the last document slot (wall clock) | 3/6 |
  | sequenced at the document cap | 6/6 |
  | sequenced at the byte cap | 6/6 |
  | all 239 sequential `save`/HTTP tests | **0** |

  The wall-clock case is the realistic one and the sequenced ones are the reliable ones, the same
  pairing the proofs above need and for the same reason; keep both. Nothing outside this file
  catches the hoist at all. Lowering the caps in the sequential cases also cut `save.test.ts`
  from ~4.2s to ~0.6s, since each full-scale byte case pushed 256 MiB through SQLite.
- **The quota is per owner, lives inside the transaction, and bounds the TOTAL — bodies plus
  retained receipts (#1250).** `MAX_DOCUMENTS_PER_OWNER` (2,000) and `MAX_BYTES_PER_OWNER`
  (256 MiB) in `src/db/save.ts` bound what one account accumulates. It did not always: #1234
  shipped measuring `documents` alone, so re-saving ONE document with fresh operation ids grew
  the database without limit — every commit leaves a permanent receipt, and receipts are never
  expired because that retention is what makes a replayed operation id detectable. Measured
  before the fix: 20,000 saves = 20,000 receipts = 4.19 MiB on disk, reported as 31 bytes.
  `RECEIPT_COST_BYTES` (768, the measured worst case at the id grammar's 128-character ceiling,
  rounded up) is the flat charge per receipt; flat rather than per-row because a per-row formula
  would have to be written twice, once in SQL and once in TypeScript, and those two copies drift.
  **Counting this write's own receipt in `addedBytes` is load-bearing, not bookkeeping:** measured
  against body bytes alone, an equal-size re-save has `addedBytes === replacedBytes`, so the
  "never refuse a write that does not grow the footprint" clause waved it through unconditionally
  — which is precisely the unbounded loop. `readOwnerUsage` returns the breakdown
  (`documentBytes`/`receiptBytes`) so which half filled the budget is visible. The rest of this
  bullet describes the document half;
  `MAX_SAVE_REQUEST_BYTES` bounds one request and `DOCUMENT_POLICIES` bounds one identity's
  rate, and neither of those bounds the total. Checked AFTER the conflict decision, so an owner
  at the cap with a stale revision still hears about the stale revision — resolving it may be an
  update, which the cap allows. A committed receipt replays regardless of the cap (the write
  already happened), and a write that does not increase the footprint is never refused, so an
  account somehow over the cap is not frozen out of the edits that shrink it back under. That
  rule is only "does not grow" — one such write need not land under the cap, it just may not
  push further over. The reply carries no numbers (see the taxonomy note in `src/http/errors.ts`
  and #1245).
- **The owner is the session's account id, full stop.** The envelope's `ownerId` is a routing
  hint that must AGREE with it; a disagreement is refused, never "corrected".
- **One decoder, one codec.** The route decodes with `prototypes/v2/lib/sync/request.ts` —
  the exact mirror of the client's `prepare()` — which pins the canonical serialization and
  digests the received bytes. That module pulls the `public/songbook` codecs in, which is why
  this package is bundled with esbuild (`build.mjs`) rather than emitted per file, and why
  `tsconfig.json` lists `DOM` in `lib` (type positions only).
- **Receipts are recorded for committed saves only.** A conflict changes nothing on the
  server and re-evaluates identically on retry (a revision is minted fresh per commit and never
  reappears), while letting the retry see the *current* remote version to resolve against.
- **No timestamp last-write-wins.** A conflict carries the current version back; it never
  substitutes the current revision into the request.
- The `/api/*` 64 KB body limit is path-gated off `/api/documents/`; this route applies
  `MAX_SAVE_REQUEST_BYTES` (the 1 MiB document limit plus a 4 KiB envelope allowance) itself.
  Per-identity budget: 120 saves/min after the session check (`DOCUMENT_POLICIES`), on top of
  the shared 300/min transport budget.

Tests: `test/db/save.test.ts` (decision table, deterministic revisions, rollback via a
trigger that fails the receipt insert) and `test/http/documents-save.test.ts` (the route over
`app.request()` with a real passkey session and bodies frozen exactly as `prepare()` freezes
them).

## Library read routes (#1259, stage 3)

`GET /api/documents` and `GET /api/documents/:id` are the whole of **S1** in
[`ensemble-v2-rollout.md`](../../docs/design/ensemble-v2-rollout.md) decision 9: the client
pages an `(id, revision, deleted)` manifest, diffs it against its local records, and downloads
the ids whose revision moved. There is deliberately **no** change feed, watermark or
cursor-expiry machinery — do not add one. The manifest query is `listManifest` in
`src/db/documents.ts`; both routes live in `src/http/documents.ts` beside Save.

| Request | Reply |
| --- | --- |
| `GET /api/documents` | `200 { documents: [{ documentId, revision, deleted, bytes }], nextAfterDocumentId }` |
| `GET /api/documents?after=<id>&limit=<n>` | the next page; `nextAfterDocumentId` is `null` exactly at the end of the library |
| `GET /api/documents/:id` | `200 { documentId, revision, document }` — the stored bytes verbatim |
| Absent id, tombstoned id, or another owner's id | `404 { error: 'not_found' }` — one status, one body, all three |
| Unknown or repeated query key, `limit` outside `1..MAX_LIST_LIMIT` or not an exact integer, `after`/`:id` outside the identifier grammar | `400 { error: 'malformed_request' }` |
| No session, or a recovery-purpose session | `401 { error: 'unauthenticated' }` |
| Past the per-identity budget (30/min manifest, 180/min download) | `429 { error: 'rate_limited' }` with `Retry-After` |
| Stored body that is not one well-formed JSON object | `500 { error: 'internal_error' }` — nothing echoed |

Design points worth knowing before changing it:

- **The manifest is ordered by `document_id`, not `updated_at`, and that is the whole
  stability argument.** `listDocuments` (`updated_at DESC` with an `OFFSET`) is a
  "recently edited" view and is unusable as a manifest cursor: every Save rewrites `updated_at`,
  so a document can cross an offset boundary between two page fetches and be skipped or returned
  twice. Keyset paging on the immutable id means a concurrent Save can change a row's `revision`
  but can never move it past the cursor. A create *below* the cursor is missed by the pass in
  progress and picked up by the next one — exactly what a diff tolerates, and why decision 9
  needs no watermark. Proven in `test/http/documents-read.test.ts` by paging a real database
  while real Saves (one update of an already-returned id, one fresh create) land between the
  pages; mutation-proved by making the cursor inclusive (`>=`) and by taking `nextAfter` from the
  lookahead row, each of which the test catches. **Do not "unify" the two list functions** — they
  have opposite ordering requirements.
- **Tombstones are manifest rows, not omissions.** A deleted id comes back as
  `deleted: true, bytes: 0`, in its own id position, carrying the revision it died at, because
  the client needs it to drop a clean local mirror. The single ordered page is a `UNION ALL` over
  `documents` and `tombstones` with a `NOT EXISTS` that makes "at most one row per id" a property
  of the query rather than an assumption about future writers. No schema change was needed.
- **A tombstoned id is a `404` on the download, not a deleted marker.** The manifest is where a
  client learns an id was deleted; it never has to download one to find out. Keeping the download
  to one shape is also what makes absent, tombstoned and foreign genuinely indistinguishable —
  and that indistinguishability is *structural*, not a branch: `readDocument` folds the owner
  into the SQL and a deleted document has no row, so all three paths reach the same
  `sendError(c, 404, 'not_found')` with nothing to get wrong later. The test asserts the status
  AND the response text are equal, not merely both 404.
- **The download splices the stored TEXT in verbatim** rather than parsing and re-serializing it.
  What `commitSave` stored is exactly the document bytes the client froze and this service
  digested (`decodeSaveRequest` refuses anything that is not that canonical serialization), and a
  `JSON.parse` → `JSON.stringify` round trip is not guaranteed to reproduce them byte for byte —
  an object with integer-like keys comes back reordered. Save's *conflict* reply parses instead,
  because there the document is nested in a reply built from computed values; that is not an
  inconsistency to unify in this direction.
  **Splicing is only safe while the body is one well-formed JSON object, so the read site checks
  it** (review F3): it parses purely as a validity check, discards the result, and still sends the
  verbatim text. The guarantee lives in `save.ts`/`decodeSaveRequest`; this is the backstop,
  because it was asserted nowhere at the read site and a body of `{"a":1},"injected":true` written
  through `writeDocument` spliced into a reply with a smuggled top-level key. A bare parse is not
  enough — `1`, `"x"` and `[]` are valid JSON values that would shape-shift the `document`
  member, so a plain object is required. A failing row is a broken server, not a bad request:
  `500 internal_error`, body never echoed, and the manifest still lists the row.
- **A safe method is exempt from same-origin and JSON-only, and that does not open a cross-site
  read.** `sameOriginGuard`/`jsonOnlyGuard` gate unsafe methods only (`http-safe-methods.ts`), so
  neither runs on a `GET`. The session cookie is `__Host-`-prefixed and `SameSite=Strict`
  (`src/http/cookies.ts`), so a cross-site navigation or `fetch` carries no credentials at all
  and these routes answer it `401`; there is no CORS middleware anywhere in this service, so a
  foreign page's reader never sees a body even when a browser sends the request; and
  `securityHeaders` puts `Cache-Control: private, no-store` on every response, asserted per route
  in the tests. Extending the unsafe-method guards to `GET` would take nothing away from an
  attacker and would refuse the app's own fetch on a page load that sends no `Origin`.
- **`limit` is rejected, not clamped, at the HTTP boundary** (`listManifest` still clamps, as
  defense in depth for a future in-process caller). Deny-by-default, the same posture as
  `auth-policy.ts`'s exact-key-set check: a client that asked for 10,000 rows has a bug, and
  answering 500 teaches it the wrong page size. Repeated keys are refused for the same reason —
  `?limit=1&limit=500` must not resolve to whichever one `get` happens to return. In
  `listManifest` the clamp floor is **1, not 0** (review F5): an empty page with
  `nextAfter: null` reads as *end of library*, so a caller whose computed page size came out
  zero would diff a whole library away against it.
- **Guard order is Save's, unchanged:** session → syntactic refusal → this route's own budget →
  the database. The budget is spent only by an authenticated identity, so an anonymous caller
  can never exhaust one.
- **The 300/min transport budget is SHARED, and per-route budgets are ceilings under it, not a
  sub-budget that sums to it** (review F1 — the P1 of the review). `transportRateLimitGuard`'s
  300/min covers every `/api/*` request from one identity, **`/api/auth/*` included**, and it is
  keyed by **network identity, not by account** — two accounts behind one NAT share it, and so do
  two tabs of one account, and so does every device behind one carrier gateway or shared Wi-Fi.
  So a per-route budget is only a promise the caller can keep while the shared ceiling still has
  room, and this table does not keep that promise as an invariant: the four current budgets sum
  to 30 + 180 + 120 + 30 = 360/min, already over 300 before `/api/auth/*` is counted at all —
  Save's own 120 is what breaks it. The #1259 review demonstrated the consequence directly: a
  client that spent both documented read budgets in one window got `429` on its next
  `GET /api/auth/session` **and** on Save, both of which it is entitled to. **Treat any `429`
  from this service as a signal to back off across the whole origin**, with the response's
  `Retry-After` — the next request to a *different* route is just as likely to be refused, and a
  client paced to stay under one route's number can still be over the shared one.
  Cold-start arithmetic for a full 2,000-document library: 4 manifest pages at
  `MAX_LIST_LIMIT`, then 2,000 downloads at 180/min ≈ **11 minutes**, paced. That is deliberate —
  a full library is a one-time cost on a new device, and the alternative is starving the account
  routes it takes to stay signed in while it happens.
- **`GET /api/documents` keeps the 64 KB `/api/*` body limit.** The exemption in `src/http/app.ts`
  is the prefix *with* its trailing slash, so the bare mount path is not exempt, and both
  limiters match it — which is fine, the lower ceiling wins and the route reads no body. Review
  F2 proved over a real socket that exempting the bare path too (which the first cut did, for
  comment symmetry) only raised the ceiling an **unauthenticated** caller can make this process
  buffer on that path from 64 KB to ~1 MiB, in exchange for nothing. Don't widen it again.
- **Wire vocabulary follows the client's.** `documentId` matches the Save reply, and
  `nextAfterDocumentId` is the name `SongPage` already uses for this cursor in
  `prototypes/v2/lib/sync/repository.ts`, so the transport and the local store speak one
  language. (The issue's draft wrote `id`/`nextAfter`; the API-wide names won.)

Tests: `test/http/documents-read.test.ts` (both routes over `app.request()` with two real
passkey accounts, every document written through the real Save route — including the
cross-owner tombstone case and the three malformed stored bodies) and the `listManifest`
case in `test/db/documents.test.ts` (tombstone interleaving, owner scoping, cursor exclusivity,
UTF-8 `bytes`, the clamp floor). The deny-by-default pair in `test/http/auth-hardening.test.ts`
covers both new routes automatically, since it is parameterized over `DOCUMENT_POLICIES`.

## Document delete (#1260, stage 3)

`POST /api/documents/delete` is the sync contract's deletion rule
([`ensemble-v2-sync.md`](../../docs/design/ensemble-v2-sync.md), *Sharing, deletion, operations
and privacy*): "cloud document deletion is an explicit online operation with a tombstone …, not a
side effect of removing a local download", and "a stale Save cannot resurrect the deleted cloud
ID". The decision table is `commitDelete` in `src/db/document-delete.ts` (one `withTransaction`,
`BEGIN IMMEDIATE`); the request decoder is `src/http/document-delete-request.ts`; the route lives
in `src/http/documents.ts` beside Save and the read routes.

The request body is the Save envelope's field *names* minus its document, in one canonical order:

```json
{"ownerId":"…","documentId":"…","operationId":"…","expectedRevision":"…"}
```

| Situation | Reply |
| --- | --- |
| `expectedRevision` equals the current revision | `200 { …receipt, revision: <the revision it died at>, kind: 'deleted' }` — row gone, tombstone written, receipt recorded |
| Same operation id, same bytes (retry after an uncertain response) | the original `200`, byte for byte; nothing deleted twice |
| Same operation id, different bytes or a different document — including an id a **Save** committed | `409 { error: 'operation_mismatch' }` |
| A different operation id, id already deleted | `200 … kind: 'deleted'` at the tombstone's revision; no receipt, no second tombstone, `expectedRevision` not consulted |
| Stale `expectedRevision`, id still live | `409 { …receipt, revision: <current>, kind: 'conflict', remote: { revision, document } }` — nothing deleted, no receipt |
| Id absent with no tombstone, or another owner's id | `404 { error: 'not_found' }` — one status, one body, both; nothing written at all |
| Any decoder refusal — reordered/unknown/missing keys, added whitespace, `expectedRevision: null`, an envelope `ownerId` that is not the session's account, any query string | `400 { error: 'malformed_request' }` |
| No session, or a recovery-purpose session | `401 { error: 'unauthenticated' }` |
| Body above `MAX_DELETE_REQUEST_BYTES` (1 KiB) | `413 { error: 'payload_too_large' }` |
| Past the per-identity budget (30/min) | `429 { error: 'rate_limited' }` with `Retry-After` |

Design points worth knowing before changing it:

- **It is Save's decision order, line for line:** receipt → current state → expected revision →
  write, all inside one `BEGIN IMMEDIATE` transaction on the session's account id. A delete writes
  the same three tables the Save protocol owns, so it has to be idempotent the same way and refuse
  a stale base the same way. Divergence between `commitDelete` and `commitSave` is a bug in one of
  them, not a local style choice. One id per operation, too: one operation id is one receipt, and a
  partially-applied bulk delete could not replay honestly. Account deletion is #1271's own story.
- **Two things are deliberately NOT Save's.** There is no `expectedRevision: null` form — `null`
  means "this operation creates the document" and there is nothing to create — and a conflict here
  always carries a `remote` version, because the cases where Save answers `remote: null` (absent,
  tombstoned) are answered by `404`/idempotent-`deleted` before the revision check.
- **The already-deleted answer is idempotent, and it writes NO receipt.** A tombstone is
  terminal: there is no newer version to offer for Keep-both and nothing the caller could do with
  a refusal except ask again, so a second device's queued delete is told the truth (the
  tombstone's revision) rather than refused. `expectedRevision` is not consulted on that path for
  the same reason. No receipt is written because none is needed: the tombstone's revision is
  immutable (`commitSave`'s non-resurrection check refuses both a create and a stale update
  against it), so a retry — this exact request again, or a fresh operation id from a third caller
  — re-derives the identical reply from one indexed primary-key read of the tombstone alone.
  Writing a receipt here anyway would have let an owner holding a single tombstone mint an
  unbounded number of charged rows by resending fresh operation ids forever; this path is the
  fix for exactly that. It mirrors the `404` path, which also writes **nothing**: in both cases
  nothing happened that a receipt needs to remember, so a retry stays free.
- **One operation id is one operation, across both endpoints.** Receipts are one namespace per
  owner, so reusing a Save's operation id for a delete must be refused — and it is, by the digest
  comparison alone, with no discriminator column: the digest covers the whole request body, and a
  four-key delete envelope can never serialize to a six-key Save envelope's bytes. "Same id,
  different operation" is therefore always "same id, different bytes".
- **Deleting is exempt from the storage quota's refusal, and only from the refusal.** The
  tombstone and the receipt a delete leaves are both **charged** by `readOwnerUsage` (new in
  #1260 — see the next bullet), so the accounting stays honest.
  But `commitDelete` has no quota gate: Save's "an owner over the cap may not grow" clause would
  refuse a delete whose freed body is smaller than the 1,536 bytes it leaves behind, which is
  exactly the owner who most needs to delete something. Deletion is the only operation that gives
  document bytes back, so making it refusable by the cap would lock an account at the cap out of
  its own remedy. This is NOT the residual rollout decision 11 / #1256 accepted for receipts —
  that decision covered an unbounded fresh-operation-id loop against one tombstone, and the
  already-deleted path above closes exactly that loop by writing no receipt. What remains is
  smaller: the only receipt a delete can still leave requires a *live* document to delete, which
  requires a charged, refusable `commitSave` create that already passed the quota gate — so
  delete-side receipt growth is bounded by how many live documents an owner is permitted to hold,
  not by an unbounded loop. Proven at the *shipped* caps in both suites (document cap and byte
  cap), not at an injected one, because `commitDelete` takes no caps to inject.
- **Tombstones are now charged against the byte cap**, which the stage-3 authorization review
  asked for at exactly this point: "when stage 4/5 ships a delete route, charge tombstones the way
  receipts are charged so the cap keeps meaning what it says" (residual risk 4). They are charged
  at the receipt's rate and by `RECEIPT_COST_BYTES` itself, not a second constant — a tombstone
  row is strictly smaller than a receipt row (four columns to six, one secondary index to two), so
  that measured worst case over-charges it in the safe direction, and the "one number cannot
  drift" rule that put the receipt size in `src/db/documents.ts` forbids a near-identical second
  one. It closes no unbounded hole (the tombstone insert is an upsert keyed on
  `(owner, document)`, so re-deleting adds no rows, and a fresh id costs a charged receipt to
  create); it makes the cap mean what it says in real disk.
- **The tombstone carries the revision the document died at**, per `deleteDocument`'s existing
  contract — never a freshly minted one, and `commitDelete` mints nothing at all. That is the
  revision `commitSave`'s non-resurrection reply answers with (`revision: <tombstone>`,
  `remote: null`) — but it is only a revision the CALLING client would recognise when that client
  was current at the moment of deletion. A client holding rev-1 after a second device saved
  rev-2 and then deleted the id gets back `conflict rev-2, remote: null`, and rev-2 is not a
  revision the first client ever saw. #1270's client must not build recognition logic on this
  value; the only safe use of it is recording it as the id's terminal revision.
- **A 1 KiB body limit, applied by the route itself.** The whole `/api/documents/` prefix is
  exempt from the parent app's 64 KB limit so a Save can carry a chart, and the sub-app's
  catch-all then bounds the prefix at `MAX_SAVE_REQUEST_BYTES` (~1 MiB). A delete request is **653
  bytes** at its legal maximum (three 128-character identifiers and a 200-character revision, from
  character sets that need no JSON escaping), so it applies `MAX_DELETE_REQUEST_BYTES` nested
  inside that one. Registered with `routes.use('/delete', …)`, not as a second handler argument:
  `routes.post(path, limiter, handler)` registers the path **twice** in `app.routes` and breaks the
  route-drift test's comparison, while `use` registers as `ALL`, which that test filters out.
  Proven over a real socket (`test/http/body-limit.socket.test.ts`) on both the Content-Length and
  the chunked branch, because `bodyLimit`'s Content-Length branch trusts a *declared* length and
  only Node's HTTP parser enforces framing — and the same 4 KB body reaching the Save route proves
  the small limit belongs to `/delete` alone.
- **There is no client producer yet.** `prototypes/v2/lib/sync/protocol.ts` has no delete operation
  type and no tombstone receipt shape (checked, not assumed), so this is the smallest **server**
  contract for #1270 to mirror, and the decoder lives in this package rather than in the shared
  sync module — putting a request shape in the shared bundle before the client produces it would
  be inventing the client's half from the server side. It borrows the shared *validators*
  (`identifier`, `remoteRevision`, `digest`) so the ids and revisions it accepts are exactly the
  language the Save path writes. Open choices for #1270 to settle: the reply's
  `kind: 'deleted'` (the client's `reply()` validator currently accepts only
  `committed`/`conflict`); the absence of a `protocolVersion` field — the exact-key-set check
  already makes adding any field a breaking change an old server refuses rather than misreads,
  which is the property a version field buys; and the contract's "recovery/export preflight"
  (`ensemble-v2-sync.md`'s deletion paragraph) — this server enforces the tombstone and the
  non-resurrection rule, but the preflight itself (warning the user, offering an export, before
  the delete is even sent) is entirely client-owned and unenforced here. #1270 has to decide
  where that lives; this route will delete on request the moment it is asked, with no server-side
  confirmation step of its own.

Tests: `test/db/document-delete.test.ts` (the decision table, the storage accounting, the
transaction rollback, and non-resurrection after a *real* delete),
`test/db/document-delete-concurrency.test.ts` (four real OS processes racing one revision, under
different operation ids and under one duplicated id — the harness and the reason for it are
`save-concurrency.test.ts`'s; there is no sequenced variant, deliberately, because every assertion
here is an invariant that survives non-overlap and `commitDelete` has no `mintRevision` seam to
pause at), and
`test/http/documents-delete.test.ts` (the route over `app.request()` with two real passkey
accounts and every document written by a real Save). `test/http/auth-hardening.test.ts` covers the
new route automatically, since it is parameterized over `DOCUMENT_POLICIES`.

## Account deletion (#1271, stage 7)

`POST /api/auth/account/delete` is the way out the accounts contract requires before accounts
ship (DECISION 2026-09-17). One route, one transaction, no body, `204` on success.

- **Gated on the SAME fresh-authentication predicate as add/revoke passkey and recovery enroll**,
  checked inside the deletion transaction (`src/auth/account-deletion.ts`) rather than only at the
  HTTP boundary — the write and the read that authorizes it see one database state. A valid but
  stale session gets `403 fresh_auth_required`, which the client answers with its one step-up
  retry (`withFreshAuth`). No new error code: the taxonomy is unchanged, so the client's
  `ApiErrorCode` copy needed no edit. `requireSession` refuses a recovery-purpose session here
  like everywhere else — a recovery code authorizes enrolling one passkey, never deleting.
- **The wipe consumes the registry, it does not restate it.**
  `src/db/account-deletion-registry.ts`'s `ACCOUNT_DELETION_WIPED` is now an ordered list of
  `{ table, column }` pairs, and `deleteAccount` walks exactly that list — the only interpolated
  identifiers in this service's SQL, and deliberately so, because a hand-written statement list
  can drift from `assertAccountDeletionCoverage`, which still fails on any table nobody
  classifies. Order is children-before-parents (`foreign_keys=ON`), `accounts` last.
- **The deleted identity is registered as one metadata-only `account_deleted` security event** —
  account id and timestamp, no credential, no chart, no request data — written INSIDE the same
  transaction, after the wipe has emptied this account's audit history. A rolled-back deletion
  therefore leaves no record claiming it happened, and that single row is the only trace the
  service keeps. It ages out under `recordSecurityEvent`'s existing 30-day/10,000-row bounds like
  every other event.
- **What refuses a disconnected device is absence, not a flag.** No session row, no credential
  row, no account row: every authenticated route answers `401 unauthenticated` for the old cookie
  (`readSession` finds nothing, and its `JOIN accounts` is a second reason it would find nothing),
  a late queued Save from another context is refused rather than recreating a document, and a
  login ceremony with the old passkey fails `credential_not_found`. There is deliberately NO
  credential-level blocklist: the same authenticator must be able to register a brand-new account
  afterwards, and it can, because the row holding its credential id is gone.
- **Rate limit**: `policy('empty', 10, 10 * minute)` — well below the ceremony routes, because
  this is a once-in-a-lifetime action already behind a passkey ceremony, but not tighter than
  `10`: the client's own step-up retry (`withFreshAuth`) spends two requests per stale-session
  attempt (`403 fresh_auth_required` then the re-proved retry), so two dismissed platform
  prompts plus one real deletion already spends 6.
- **Backups are out of scope, and the client says so.** Nightly snapshots age out on their own
  schedule; the account page's copy discloses that rather than promising an erasure this route
  cannot deliver.

Tests: `test/http/account-delete.test.ts` (real migrated database, real ceremonies, injected
clock) — the unauthenticated and stale-session refusals with a row-count proof that nothing
changed, the full wipe with a second account untouched beside it, every route answering
signed-out for the old cookie including a late Save, and the same passkey registering a brand-new
account afterwards. `test/http/auth-hardening.test.ts` covers the route automatically, since it
is parameterized over `AUTH_POLICIES` (route/policy parity, unknown-field refusal, rate
threshold).

## Commands

Run from this directory, or via `npm run test:api` from the repo root:

```sh
npm install       # first run only
npm run typecheck
npm test          # typecheck + production build + vitest, node environment, no browser
npm run build     # esbuild bundle -> dist/server.js (+ .map); see build.mjs — inlines the
                  # shared public/ songbook codecs the Save endpoint decodes with (#1202)
npm start         # node dist/server.js — needs ENSEMBLE_RP_ID, ENSEMBLE_RP_NAME, ENSEMBLE_ORIGIN,
                  # ENSEMBLE_DB_PATH (a file, never :memory:), ENSEMBLE_AUTH_IP_SECRET (>=32 bytes)
                  # optional PORT (8080), HOST (0.0.0.0), ENSEMBLE_REGISTRATION (closed),
                  # ENSEMBLE_REGISTRATION_CAP (25); verified proxy configuration below
npm run dev       # tsx src/server.ts, development only
```

Production uses the esbuild bundle. The process smoke tests execute `dist/server.js` with plain
Node, including migration discovery, startup validation, readiness and persistence across restart.

Proxy mode requires both `ENSEMBLE_AUTH_IP_HEADER` (lowercase header name) and
`ENSEMBLE_AUTH_TRUSTED_PROXY_ADDRESSES` (comma-separated exact immediate socket IPs).
There is no default Cloudflare/XFF header. Generate the HMAC secret randomly and provision it
through operator tooling, never source control or chat. All identity configuration is validated
before database creation. Passing configuration validation does not clear the live proxy gate.

Dependencies are pinned exact (`--save-exact`): `hono@4.13.7`, `@hono/node-server@2.1.1`, both
zero-runtime-dependency, alongside `@simplewebauthn/server@14.0.1`.

## Container artifact

Bundle first, then build from the repository root with the API directory as the context — the
image copies `dist/` rather than compiling (the bundle inlines shared code from outside the
context, see `build.mjs`):

```sh
npm run build --prefix prototypes/v2-api
docker build --build-arg REVISION="$(git rev-parse HEAD)" \
    -t ensemble-v2-api:local prototypes/v2-api
```

The multi-stage `Dockerfile` uses Node 26, lockfile-first cached dependency layers, and only
production dependencies in the final image. It runs `node dist/server.js` as `node` (UID/GID
1000), with no TypeScript source, tests, credentials or local databases in the runtime image.
`.dockerignore` allows only explicit build inputs into the context. Migrations are copied to
`/app/migrations`, which the compiled entrypoint resolves independently of its working directory.

The container's internal port is **8080**; change the host-side mapping, not `PORT`/`HOST`, so
the built-in loopback healthcheck continues to work. Mount the database directory at `/data`,
owned by UID/GID 1000 before startup. The default database is `/data/ensemble.sqlite`; its WAL
and SHM sidecars must live on the same persistent mount. The application tree can be read-only;
all database writes stay in that directory. Supply origin/RP configuration and any subsequently
required auth secrets at runtime, never as build arguments. Use one API replica: SQLite and
the in-memory rate limiter are not a horizontally scaled service.

`GET /healthz` (and bodyless `HEAD`) performs a read-only query against migration metadata and
returns `{ "status": "ok", "revision": "<full SHA>" }`, or a bounded 503
`{ "status": "unavailable" }` on database failure. It inherits the private/no-store security
headers, never sets a cookie, and sits outside authentication rate-limit routes. Configure
`REVISION` at image build time; local builds default to `development`. Any runtime override of
`ENSEMBLE_BUILD_REVISION` must be a full lowercase Git SHA or `development`, validated before
opening the database. The OCI revision label records the build argument independently.
Expose only `/api/*` through Caddy; keep `/healthz` on the container/operator network.

### Published image (#1216)

CI publishes this Dockerfile on every merge to `main` as
`ghcr.io/brndnsh-labs/ensemble-api:sha-<commit>` (plus a moving `:main` tag), then pulls the
`sha-` tag back and asserts `/healthz` answers `ok` with that exact revision before the job
passes. The package is public, so docker04 pulls it without a credential. Nothing runs the image
yet; the docker04 stacks (#1217) and the forced-command release step (#1219) consume it. See
[`docs/design/ensemble-v2-rollout.md`](../../docs/design/ensemble-v2-rollout.md).

**Registration is closed by deployment policy.** `ENSEMBLE_REGISTRATION` must be exactly `open`
or `closed`; unset means closed, so a fresh environment never accepts accounts by omission. Closed
answers `403 registration_closed` from `register/options` and `register/verify` (after the same
guards and rate limits as every route) and changes nothing else — login, sessions, passkey
management and recovery keep working for existing accounts. Both deployed stacks run closed until
the product wires accounts in (phase 3 of the rollout); the flip is one env line plus a release.

**A service-wide registration cap backstops the per-owner storage caps (#1272 — DECISION
2026-09-17 on #1256).** `MAX_BYTES_PER_OWNER` (`src/db/save.ts`, 256 MiB) bounds one account's
footprint, but nothing bounded how many accounts could exist — an unbounded account count has no
disk ceiling at all. `ENSEMBLE_REGISTRATION_CAP` sets that ceiling: at or above this many existing
accounts, `register/options` and `register/verify` answer the SAME `403 registration_closed` as
the closed-by-policy case above, so **reaching the cap looks identical to closed registration to
a client** — no new branch, no distinct error code. It defaults to `25` when unset (worst case
25 × 256 MiB = **6.4 GiB**); size it against the box's real free disk before raising it, not
because one deployment happened to fill up. Malformed values fail loudly at startup with the same
digits-only validation as `PORT` (no sign, decimal point, exponent, hex prefix, or surrounding
whitespace) — `0` and negative values are rejected too, since a cap of zero or less can never
admit a registration. So is anything that is not a safe integer: a long enough digit string
passes the shape check and parses to `Infinity`, which would silently remove the cap. The check is enforced twice: a cheap count in `register/options` refuses
early, and the authoritative count runs INSIDE the same database transaction that inserts the new
account, so two registrations racing at cap-minus-one cannot both succeed. Existing accounts are
completely unaffected at the cap — login, sessions, saves and adding a second passkey all keep
working.

**The API is publicly routed since 2026-09-15** (#1217 stacks, #1218 Caddy split with the verified
proxy-trust receipt in the threat model). No account UI exists yet; the routes answer, nothing calls them. The container does not guess a trusted
client-IP header. Startup currently applies migrations; before valuable persistent accounts
exist, add the approved backup-before-migrate and restore rehearsal. Image rollback alone
does not reverse a database migration, and an image tag is not proof that an older binary can
read a newer schema. No live database migration or deployment is part of building this image.

## Why `node:sqlite`, not `better-sqlite3`

Node 26 ships SQLite in core, including the `backup` API a later stage needs for WAL-safe
snapshots. See the [ratified topology](../../docs/design/ensemble-v2-sync.md#ratified-topology-decision-2026-09-10)
and [`prototypes/v2/CLAUDE.md`](../v2/CLAUDE.md) for the full rationale, including the verified
gaps in the stock API this project works around (no `db.transaction()`, `busy_timeout` defaults
to 0, rows come back `[Object: null prototype]`).
