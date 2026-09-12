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
lands here** — only the stage gate, #1192, remains in the stage-2 batch; see
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
| `src/auth/rate-limit.ts` | `createRateLimiter({ max, windowMs })` (#1191) — a factory-produced, in-memory sliding-window limiter, ported from `../../songsiknow/src/lib/auth/rate-limit.ts` with one adaptation: `check(key, now)` takes `now` as a required argument, never `Date.now()`. Guards `POST /api/auth/recovery/claim`. Correctness assumption: a single-container deployment — see the module doc comment and `src/http/app.ts`'s `recoveryClaimRateLimitIpHeader` option below. |
| `src/auth/recovery.ts` | `enrollRecoveryCode` / `confirmRecoveryCode` / `claimRecoveryCode` / `readLiveRecoverySession` / `startRecoveryEnrollPasskey` / `verifyRecoveryEnrollPasskey` (#1191) — see "Recovery codes and the recovery-only session (#1191)" below. |
| `src/auth/reauth.ts` | `startReauth` / `verifyReauth` (#1190) — step-up re-authentication. `allowCredentials` is the account's own credentials (unlike login's empty/usernameless list); the challenge binds `account_id` AND `session_id`; verify shares `assertion-commit.ts`'s core with login. Success does not itself rotate the session — the caller (the HTTP route) does that via `finishAuthentication`. |
| `src/auth/passkeys.ts` | `startAddPasskey` / `verifyAddPasskey` / `revokePasskey` / `listPasskeys` (#1190). Add-passkey requires a FRESH session (checked at options AND re-checked inside the verify commit transaction) and binds `account_id` + `session_id` into the challenge; an already-registered credential on the same account is a no-op (`alreadyRegistered: true`), on another account it's `credential_exists`. `revokePasskey` is one synchronous transaction: fresh check, owner-scoped lookup, last-credential guard (owner-scoped SELECT/DELETE and account-scoped session revocation — never trust `id`/`credential_id` alone), revoke every session the credential created, delete. `listPasskeys` never returns the public key or counter. |
| `src/auth/session.ts` | `issueSession` / `readSession` / `revokeSession` / `revokeOtherSessions` — hashed, revocable, 30-day-absolute sessions (#1189). `readSession` performs zero database writes. #1190 adds an optional `credentialId` argument to `issueSession` (defaulting to `null`, so every pre-#1190 call keeps its exact behavior) and a `credentialId` field to `SessionClaims`, recording which credential's ceremony created the session. #1191 adds two more optional trailing arguments, `purpose` (`'standard' \| 'recovery'`, default `'standard'`) and `recoveryCodeId` (default `null`) — same additive discipline, every pre-#1191 call unchanged. `purpose` is the enforcement mechanism for the recovery-only session's privilege boundary; see below. |
| `src/auth/index.ts` | Barrel re-export of the above. |
| `src/http/app.ts` | `createApp({ db, config, now?, sessionTtlMs?, recoveryClaimRateLimitIpHeader? })` — the Hono app factory. No module-level state. Wires security headers, `bodyLimit`, the same-origin guard, the JSON-only guard, every `/api/auth/*` route, and the collapsed error mapping. `finishAuthentication` (the fixation-defense revoke-then-issue) also records the credential id on the freshly-minted session (#1190). `requireSession` (#1190, tightened by #1191) refuses a `purpose: 'recovery'` session identically to a missing/invalid one; `requireRecoverySession` (#1191) is its exact inverse, used only by the two `recovery/enroll-passkey/*` routes. `recoveryClaimRateLimitIpHeader` (#1191, unset by default) names a request header to trust for the recovery-claim rate limiter's per-caller key instead of the raw socket address — see the option's doc comment for why this app never guesses a proxy header to trust on its own, and the "Recovery codes" section below for why leaving it unset behind a shared proxy/tunnel is a real denial-of-recovery risk. |
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
  throw. `revokeOtherSessions` returns the count revoked.

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
- **Rate limiting** (`src/auth/rate-limit.ts`): `POST /api/auth/recovery/claim` is capped at 10
  attempts per 10-minute sliding window, checked BEFORE any database lookup so a rate-limited
  caller learns nothing about a code's validity. **Known deployment-blocking gap, found in
  adversarial review**: the limiter keys by caller IP, and the default (`getConnInfo`'s raw
  socket address) collapses to ONE shared bucket for every caller sitting behind a single shared
  reverse proxy or tunnel — in that topology, a handful of bogus requests denies recovery to
  every account, not just the attacker's. `createApp`'s `recoveryClaimRateLimitIpHeader` option
  exists to fix this (trust a named header instead of the socket address) but is unset by
  default, because this standalone prototype has no fixed deployment topology yet for anyone to
  have verified which header, if any, a future front door actually strips/overwrites for
  external callers. **Whoever deploys this service behind any shared proxy hop MUST set this
  option to that proxy's verified client-IP header before going live** — leaving it unset in that
  topology is a real denial-of-recovery vector, not merely an imprecise rate limit.
- **Never logged.** The raw code is a SQL bind parameter's hash input, never the parameter
  itself, at every call site; no thrown error, log line, or response body other than the one-time
  `enroll` response ever carries it.

## Commands

Run from this directory, or via `npm run test:api` from the repo root:

```sh
npm install       # first run only
npm run typecheck
npm test          # typecheck + production build + vitest, node environment, no browser
npm run build     # src/*.ts -> dist/*.js, NodeNext resolution, no runtime TS loader
npm start         # node dist/server.js — needs ENSEMBLE_RP_ID, ENSEMBLE_RP_NAME, ENSEMBLE_ORIGIN,
                  # ENSEMBLE_DB_PATH (a file, never :memory:); optional PORT (8080), HOST (0.0.0.0)
npm run dev       # tsx src/server.ts, development only
```

Production uses compiled JavaScript. The process smoke tests execute `dist/server.js` with plain
Node, including migration discovery, startup validation, readiness and persistence across restart.

Dependencies are pinned exact (`--save-exact`): `hono@4.13.7`, `@hono/node-server@2.1.1`, both
zero-runtime-dependency, alongside `@simplewebauthn/server@14.0.1`.

## Container artifact

Build from the repository root with the API directory as the context:

```sh
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

**Packaging is not approval to expose accounts.** Public routing still requires #1192's
auth-hardening code and verified proxy trust contract. The container does not guess a trusted
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
