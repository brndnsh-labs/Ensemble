# Ensemble v2 account API

Stage 2 of the [account/sync contract](../../docs/design/ensemble-v2-sync.md), story 1 of 6
(#1187). A standalone Node service — a sibling of `prototypes/v2/`, not a subdirectory of it, so
its sources stay out of the Next app's compilation and static-export config.

This story is the substrate only: package skeleton, schema, migration runner and a
disposable-database test harness. **No WebAuthn ceremonies, no session issuance, no passkey
add/revoke, no recovery-code logic, and no wiring to `prototypes/v2/` or `public/` land here** —
see the stage-2 batch in
[`docs/design/ensemble-v2-next-batch.md`](../../docs/design/ensemble-v2-next-batch.md) (#1188-#1192)
for where those land, each blocked on the story before it.

## Layout

| Path | Responsibility |
| --- | --- |
| `src/db/connection.ts` | Opens a `node:sqlite` `DatabaseSync` and sets `journal_mode=WAL`, `busy_timeout`, `foreign_keys=ON` explicitly. |
| `src/db/transaction.ts` | `withTransaction(db, fn)` — `node:sqlite` has no built-in `db.transaction()` helper; every multi-statement write must use this. |
| `src/db/migrate.ts` | Hand-rolled, content-addressed migration runner. Depends only on `node:fs`/`node:crypto`/`node:sqlite`, deliberately not on any migration-authoring toolkit. |
| `migrations/*.sql` | Schema, applied in filename order. `0001_init.sql` creates `accounts`, `credentials`, `challenges`, `sessions`, `recovery_codes`. |
| `test/helpers/test-db.ts` | `createTestDatabase()` — a fresh on-disk (never `:memory:`, which can't hold WAL mode) SQLite file per test, migrated for real. |

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
