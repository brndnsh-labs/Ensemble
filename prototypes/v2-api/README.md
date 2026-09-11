# Ensemble v2 account API

Stage 2 of the [account/sync contract](../../docs/design/ensemble-v2-sync.md). A standalone Node
service — a sibling of `prototypes/v2/`, not a subdirectory of it, so its sources stay out of the
Next app's compilation and static-export config.

**#1187** (story 1 of 6) laid the substrate: package skeleton, schema, migration runner and a
disposable-database test harness. **#1188** (story 2 of 6) added the WebAuthn registration and
login ceremony modules (`src/auth/`) and migration `0002`. **No session issuance, no passkey
add/revoke, no recovery-code logic, and no wiring to `prototypes/v2/` or `public/` land here** —
see the stage-2 batch in
[`docs/design/ensemble-v2-next-batch.md`](../../docs/design/ensemble-v2-next-batch.md) (#1189-#1192)
for where those land, each blocked on the story before it.

## Layout

| Path | Responsibility |
| --- | --- |
| `src/db/connection.ts` | Opens a `node:sqlite` `DatabaseSync` and sets `journal_mode=WAL`, `busy_timeout`, `foreign_keys=ON` explicitly. |
| `src/db/transaction.ts` | `withTransaction(db, fn)` — `node:sqlite` has no built-in `db.transaction()` helper; every multi-statement write must use this. |
| `src/db/migrate.ts` | Hand-rolled, content-addressed migration runner. Depends only on `node:fs`/`node:crypto`/`node:sqlite`, deliberately not on any migration-authoring toolkit. |
| `migrations/*.sql` | Schema, applied in filename order. `0001_init.sql` creates `accounts`, `credentials`, `challenges`, `sessions`, `recovery_codes`. `0002_challenge_ceremony_hash.sql` adds `challenges.ceremony_hash` (+ its unique index) for #1188's ceremony-token binding. |
| `src/auth/config.ts` | `createWebAuthnConfig({ rpId, rpName, origin })` — validates and freezes ceremony config. The origin must already be canonical, and `rpId` must **exactly** equal its hostname (no parent-domain relaxation; separate environments use separate RP IDs). Always passed as an argument; never a module-level `process.env` read. |
| `src/auth/challenges.ts` | `claimChallenge` — the one `DELETE ... RETURNING *` atomic challenge claim — plus ceremony-token minting/hashing and the expired-row sweep. |
| `src/auth/request-guard.ts` | `isMalformedCeremonyRequest(input)` — the shallow shape guard both verify functions run first, synchronously, before the challenge claim, so a malformed request returns `malformed_request` without consuming the ceremony token. |
| `src/auth/credential-row.ts` | Shared `credentials` row shape, transports JSON encode/decode, and the duplicate-credential-id error classifier. |
| `src/auth/registration.ts` | `startRegistration` / `verifyRegistration` — discoverable-passkey registration against the real `@simplewebauthn/server` verify path. |
| `src/auth/login.ts` | `startLogin` / `verifyLogin` — usernameless login, the counter-regression-safe commit. |
| `src/auth/index.ts` | Barrel re-export of the above. |
| `test/helpers/test-db.ts` | `createTestDatabase()` — a fresh on-disk (never `:memory:`, which can't hold WAL mode) SQLite file per test, migrated for real. |
| `test/helpers/soft-authenticator.ts` | `createSoftAuthenticator({ rpId, origin })` — a software WebAuthn authenticator that builds real ES256 registration/assertion responses (`node:crypto` + `isoCBOR`/`isoBase64URL`) so ceremony tests exercise the actual library verify path, not a mock. Controllable origin, RP ID, UV flag, counter, `userHandle` and signing key pair. |

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

## Commands

Run from this directory, or via `npm run test:api` from the repo root:

```sh
npm install       # first run only
npm run typecheck
npm test          # typecheck + vitest, node environment, no browser
```

## Why `node:sqlite`, not `better-sqlite3`

Node 26 ships SQLite in core, including the `backup` API a later stage needs for WAL-safe
snapshots. See the [ratified topology](../../docs/design/ensemble-v2-sync.md#ratified-topology-decision-2026-09-10)
and [`prototypes/v2/CLAUDE.md`](../v2/CLAUDE.md) for the full rationale, including the verified
gaps in the stock API this project works around (no `db.transaction()`, `busy_timeout` defaults
to 0, rows come back `[Object: null prototype]`).
