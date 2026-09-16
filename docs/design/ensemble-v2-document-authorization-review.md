# Ensemble v2 document-API authorization review (stage-3 exit gate)

Scope: **authorization and IDOR on the owner-bound document API** — the surface stage 4 (library
download/reconciliation), stage 5 (conflict resolution) and stage 6 (sharing) all read and write
through. Sessions, passkeys, challenges, recovery and rate-limit design are **not** re-reviewed
here; they are covered by [`ensemble-v2-auth-threat-model.md`](ensemble-v2-auth-threat-model.md),
whose stage-2 exit receipt this document deliberately mirrors in shape.

This is the gate #1204 requires: stage 4 does not start until an authorization review of the
document API exists in writing, with every check explicitly evaluated — **pass or named gap,
nothing silently omitted** — and residual risks stated rather than closed rhetorically. It is the
stage-3 analogue of #1192's "no real account launch until implementation choices and threat-model
review are complete."

**Reviewed revision:** `main` @ `3a35808f` (#1248, which merged #1247's storage-quota race
proofs). Stage-3 stories under review: #1201 (owner-scoped schema and query layer), #1202
(Explicit Save endpoint), #1234 (per-owner storage quota), #1203 (concurrency proofs).

**Independence.** The stage-3 stories were implemented by Claude (Opus 5) in the sessions that
closed #1201/#1202/#1234/#1203. The review recorded here was performed by a **separate reviewer
that did not write them**, against merged `main`, explicitly instructed to treat this repo's code
comments as claims rather than evidence. It re-derived every load-bearing assertion from source
and ran its own mutations and runtime probes; the method column below says which. The author of
the stories wrote this document **from** that review and independently reproduced its one
material finding (see P1). That is the strongest independence available without a second human;
**final sign-off is Brandon's**, and this document is the artifact to sign off on.

## Exit receipt

| Contract requirement | Evidence / disposition |
| --- | --- |
| **1. No route derives `ownerId` from the request body or query params** | **Pass.** The document API is exactly **one route**: `POST /api/documents/save` (`prototypes/v2-api/src/http/documents.ts`), mounted in `src/http/app.ts`; the only other non-`/api` route is `/healthz`. `commitSave` receives `ownerId: session.claims.accountId`, and the decoded envelope's `ownerId` is referenced **nowhere** in the handler. The shared decoder (`prototypes/v2/lib/sync/request.ts`) *rejects* a body/session disagreement rather than correcting it — mutation-tested, 4 tests fail when that check is disabled — so it is defense in depth, not the load-bearing control. Any query string at all is refused `400` before the body is read. All nine exported statements in `src/db/documents.ts` fold `owner_id` into the WHERE clause or the inserted row, and all three tables are `PRIMARY KEY (owner_id, …)`. **There is no read or write reachable with only a `documentId`.** |
| **2. Every response on the document API is `private, no-store`** | **Pass, verified by runtime probe rather than by the 200-path test.** `securityHeaders()` is registered first on `'*'` and sets headers *after* `await next()`, so it wraps `app.notFound` and `app.onError` too. The reviewer drove the real app across `401`, `403`, `415`, `413` (on `/save` and on an unknown documents path), `429`, `400` (malformed and query-string refusal), `409` (all three kinds), `200`, and the unknown-path `404` in six spellings: **all four security headers correct on every one**. *Named gap (cosmetic):* `test/http/headers.test.ts`'s parameterized table targets `/api/auth/*`; the documents prefix is covered by the shared middleware, by three assertions in `documents-save.test.ts` (200/409/401) and by the probe, but not by a dedicated table in that file. |
| **3. `prototypes/v2/scripts/offline.mjs` does not enumerate or cache any document-API response** | **Pass, by reading both halves.** The allowlist is built purely by walking the Next static export plus copied packs, and every entry is `/v2/`-prefixed; no API path can enter, because nothing in the export *is* an API response. The generated service worker's fetch handler is triple-gated — it returns early unless `method === 'GET'` **and** same-origin **and** `pathname.startsWith('/v2/')` — and `POST /api/documents/save` fails two of the three. The sounds cache admits only pack-catalog entries with a matching SHA-256. **Stronger than the check asks:** the v2 client contains **zero** references to `/api/` anywhere; `lib/sync/send.ts` takes an injected transport and owns no URL. The document API is not wired to the client at all yet. |
| **4. The account-deletion registry covers `documents`/`receipts`/`tombstones`, and the drift guard fails if a table is added to neither list** | **Pass, proven non-vacuous against a real migration.** All three are in `ACCOUNT_DELETION_WIPED`, and the guard is bidirectional — unclassified table, classified-but-missing table, and duplicate classification. The reviewer added a real `migrations/0008_probe_drift.sql` creating an unclassified table: **two independent test files failed** (`test/db/documents.test.ts`, `test/http/auth-hardening.test.ts`). Classifying it returned the suite to green. Both directions proven, so the guard is not merely counting migrations. |
| **5. Stage 2/3 story acceptance holds under a fresh read of the merged code** | **Pass, with one named gap (P1).** `commitSave` is one `BEGIN IMMEDIATE` transaction running the protocol in order: receipt replay/mismatch → revision/tombstone decision → quota → document write → receipt write. Conflict is evaluated *before* quota deliberately, so an owner who is both full and stale gets the stale-revision answer (resolving it may be an update the cap permits). The "never refuse a write that does not grow the footprint" rule correctly requires `addedBytes > replacedBytes`. The concurrency proofs are real — separate OS processes, a two-file barrier, and a pause injected *inside* the transaction at the `mintRevision` seam — and the reviewer mutation-tested both load-bearing claims independently: a deferred `BEGIN` fails 7 of 9 proofs, and a quota read hoisted out of the transaction is caught **only** by the concurrency proofs while all 22 sequential quota tests still pass. The injectable-caps seam is itself guarded by a full-scale test of the shipped defaults. **Named gap: the quota bounds `documents` but not `receipts` — see P1.** |
| **6. Residual risks stated explicitly** | **Done** — see below. |

## Findings

No P0. No finding blocks stage 4.

### P1 — the per-owner storage quota does not bound what an owner accumulates: `receipts` is outside both caps

`readOwnerUsage` measures only `COUNT(*)` and `SUM(length(CAST(body AS BLOB)))` over `documents`.
A receipt is immutable for the account lifetime and never expired — deliberately, because
retention is what makes replay detection safe — is never measured, and grows by one row on **every
committed save**.

So repeatedly updating the *same* document with a fresh `operationId` and the correct
`expectedRevision` commits every time: the document count stays 1, the byte usage stays constant,
and neither cap can ever fire. Reproduced independently by the story author against the real
migrations, one document, UUID operation ids:

| saves | documents | receipts | what the quota sees | actual database file |
| --- | --- | --- | --- | --- |
| 20,000 | 1 | 20,000 | **1 document / 31 bytes** | **4.19 MiB** |

≈220 bytes of permanent on-disk growth per receipt with short ids (the reviewer measured ≈755
bytes using the grammar's 128-character ceiling for both ids), against two indexes. At the shipped
120 saves/min/identity that is **tens to ~120 MiB per day per identity, unbounded and permanent**,
while `readOwnerUsage` reports a number four orders of magnitude smaller.

This contradicts two places that currently say otherwise — `src/db/save.ts`'s cap comment
("neither bounds what one account accumulates") and `prototypes/v2-api/README.md` — both of which
describe the *documents* half as if it were the whole. Both are corrected in this change to point
at #1250. (The review named a third, `docs/design/ensemble-v2-sync.md`; re-checked, it makes no
such claim — it mentions the quota only as a client-side failure case to test.) The rate limiter
is keyed on client identity rather than account, so it is not a second bound on this.

**Disposition: named gap, routed, does not block stage 4.** It is resource exhaustion, not
authorization or IDOR — no cross-owner reach, no data disclosure. Blast radius is nil while
registration is closed (#1226). It **does** block opening registration: #1234 is the gate that is
supposed to make "per-owner storage is capped" true, and today that sentence is only half true.
The structurally right fix is to fold a receipt allowance into the accounting (or add a
`MAX_RECEIPTS_PER_OWNER`), **not** a retention sweep — expiring receipts is what would make replay
unsafe. Filed as #1250 against #1226.

### P2 — the route drift guard proves a policy entry, not authorization

`test/http/auth-hardening.test.ts`'s deny-by-default test compares registered document routes to
`Object.keys(DOCUMENT_POLICIES)` and nothing more; the reviewer confirmed it bites on a new
unpolicied document route. But a stage-4 `GET /api/documents/list` added *with* a policy entry and
*without* `requireSession` would pass every test in the repository. Nothing asserts that a
registered document route is session-gated, and the parameterized hardening cases iterate
`AUTH_POLICIES` only — `DOCUMENT_POLICIES` has no parameterized coverage, just hand-written
`/save` equivalents.

**Not a defect today** — there is one document route and it is gated. But stage 4 is precisely
when a second one appears, so the guard should exist *before* that route is written, not after.
Filed as #1251 against the stage-4 entry story.

### P3 — smaller items, none urgent

- **The `ownerId`-signature guard in `test/db/documents.test.ts` is blind to non-`function`
  exports.** It regexes `export function …`, so an `export const readById = (db, documentId) => …`
  would be silently unguarded. Non-vacuous for the current shape; one-word fix when convenient.
- **No HTTP-layer test holds two real sessions at once.** Cross-owner isolation is proven at the
  DB layer and the mismatched-envelope case is covered with a fabricated owner. The reviewer
  verified the property live with two real session tokens (same `documentId` under both owners →
  independent rows; same `operationId` → independent receipts; a cross-owner envelope → `400`,
  nothing written), so this is a coverage gap, not a defect.
- **`withTransaction`'s `ROLLBACK` can mask the original error** if the rollback itself throws.
  Diagnosability only; every path still ends at `500 internal_error` with no payload echo.
- **Informational:** `/api%2fdocuments%2fsave` skips the `/api/*` middleware chain, because Hono
  matches on the decoded single segment. Nothing is reachable — it lands on `app.notFound`, which
  still carries all four security headers — and an upstream proxy normalizing `%2f` restores the
  chain. Recorded so it is not rediscovered as a finding later.

## Residual risks

1. **Receipt growth is outside the quota** (P1). Zero exposure while registration is closed; must
   close before #1226.
2. **Global disk exhaustion is not bounded by a per-owner cap.** 256 MiB × N accounts, with no
   service-wide ceiling and no disk-pressure backstop. Fine at N≈1; a capacity decision the moment
   registration opens.
3. **Stage 4 adds the first document *reads*, which is where IDOR risk actually begins.**
   `listDocuments` and `deleteDocument` already exist and already fold `owner_id`, but have no
   route consumer — today's surface is genuinely one write route. The guard that would catch a
   stage-4 route wired without `requireSession` does not exist yet (P2).
4. **Tombstones are per `(owner_id, document_id)`** and `deleteDocument` is owner-scoped, so one
   owner's delete cannot reach another's id — but no delete *route* exists, so this is proven only
   at the DB layer. Re-verify when stage 4/5 exposes deletion over HTTP.
5. **The `(ownerId, operationId)` receipt space is per owner** — confirmed by probe, not assumed:
   two owners both using `op-1` produce independent receipts, and a reuse with different bytes
   raises `operation_mismatch` against the caller's **own** receipt, never the other owner's. No
   cross-owner collision and no existence oracle.
6. **No cross-owner oracle from the quota or the error taxonomy.** `quota_exceeded` goes on the
   wire bare — `limit`/`usage`/`cap` stop at the route — so it discloses nothing, not even the
   caller's own numbers. `readOwnerUsage` is a single indexed aggregate over the caller's own rows,
   so any timing signal reflects the caller's own library size. Probed directly: creating a
   `documentId` another owner already holds is indistinguishable from creating a fresh one.
7. **The offline artifact's safety rests partly on a path convention.** The service worker ignores
   `/api/*` because it only handles `/v2/`-prefixed GETs. If an API were ever mounted under
   `/v2/api/…`, GET responses would become cacheable. Not a risk today (POST-only, and the client
   has no API wiring), but stage 4's design should say so before anyone relocates the prefix.
8. **The digest is "the bytes this attempt sent", not a document identity.** The v1/v2
   canonicalization asymmetry is documented in `request.ts` and the reasoning holds; stage 5's
   conflict resolution must not treat the digest as document identity.
9. **`prototypes/v2-api/` has no deploy target.** None of this is exposed to the internet today,
   so these findings describe what stage 4 builds on, not live risk.

## Verdict

**Stage 3 may close**, subject to Brandon's sign-off.

The authorization and IDOR posture of the document API is sound, and on every load-bearing point
it was proven rather than read: the single route takes its owner exclusively from the session; the
query layer has no bare read-by-id to forget; all three tables are composite-keyed by owner; every
response on the prefix including the unknown-path 404 carries `private, no-store`; the offline
artifact cannot see an API response and the client is not wired to one; the deletion drift guard
bites on a real migration in both directions; and the transaction and concurrency proofs survive
the two mutations that would have made them theatre.

The P1 is a genuine gap in #1234's acceptance, but it is resource exhaustion rather than
authorization — named, measured, and routed to the gate it actually blocks (#1226, opening
registration), not to stage 4.
