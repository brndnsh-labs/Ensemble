# V2: filed cycle batches

Index of the bounded implementation children carved out of
[`ensemble-v2-sync.md`](ensemble-v2-sync.md)'s staged acceptance contracts, filed under
[milestone 15](https://github.com/brndnsh-labs/Ensemble/milestone/15) and parent
[#1172](https://github.com/brndnsh-labs/Ensemble/issues/1172).

This is an issue index, **not a second status tracker**. Each issue owns its acceptance criteria,
file boundaries, model labels, review requirements, prerequisites and verification receipts.
Read current GitHub state before picking work; do not infer readiness from this index.

Stage 1 and stage 2's implemented modules merged to `main` on 2026-09-12 via PR #1173; later
children use the normal branch/PR/auto-merge cycle. Merging releases nothing to users —
`prototypes/**` has no production deploy target — so stage gates and human gates still bind.
Shared tests/configs require one integration owner even when feature modules are disjoint.

## Stage 1 — local foundations (filed 2026-09-10, implemented)

Brandon approved this batch on 2026-09-10: "yes, go ahead and file these".

| Issue | Bounded deliverable |
| --- | --- |
| [#1178](https://github.com/brndnsh-labs/Ensemble/issues/1178) | Owner-scoped, bounded account-library listing |
| [#1182](https://github.com/brndnsh-labs/Ensemble/issues/1182) | Canonical Save-request validation boundary |
| [#1179](https://github.com/brndnsh-labs/Ensemble/issues/1179) | Semantic-chart persistence and retry contract tests |
| [#1180](https://github.com/brndnsh-labs/Ensemble/issues/1180) | Independent local/cloud/offline status facts |
| [#1181](https://github.com/brndnsh-labs/Ensemble/issues/1181) | One bounded account outbox pass; depends on #1178 |

All five are implemented and merged to `main`. They prove local behavior against injected fake
transports; none of them is a live server, an authenticated session, or an end-to-end sync claim.

## Stage 2 — authentication and recovery in isolation (filed 2026-09-10)

Shaped from `ensemble-v2-sync.md` stage 2 after Brandon's 2026-09-10 direction to open the
server axis and build the account API as a **separate Node service**, not Next route handlers.
The [ratified topology](ensemble-v2-sync.md) already settled the rest: a container on `docker04`,
`node:sqlite` in core, and `/api/*` as a path on the existing origin so WebAuthn RP ID and
session cookies stay origin-bound.

| Issue | Bounded deliverable | Depends on |
| --- | --- | --- |
| [#1187](https://github.com/brndnsh-labs/Ensemble/issues/1187) | Service skeleton, schema, migration runner, disposable-DB harness | — |
| [#1188](https://github.com/brndnsh-labs/Ensemble/issues/1188) | Registration and login ceremonies with bound challenge claims | #1187 |
| [#1189](https://github.com/brndnsh-labs/Ensemble/issues/1189) | Hashed, revocable sessions, same-origin checks, **and the HTTP layer on Hono** (amended 2026-09-10) | #1188 |
| [#1190](https://github.com/brndnsh-labs/Ensemble/issues/1190) | Passkey add/revoke behind a fresh-authentication requirement | #1189 |
| [#1191](https://github.com/brndnsh-labs/Ensemble/issues/1191) | Recovery-code enrollment, claim and atomic consumption | #1189 |
| [#1192](https://github.com/brndnsh-labs/Ensemble/issues/1192) | Bounded auth surface and the stage-2 threat-model review | #1188–#1191 |

No story originally owned the HTTP server; #1189 was amended on 2026-09-10 (ratified) to create
it on Hono. Its built-in CSRF middleware must be tested against the contract's header-less
request cases before it is relied on — see the amendment comment on #1189.

The service lives at `prototypes/v2-api/` — a sibling of `prototypes/v2/`, not a subdirectory,
so the API sources stay out of the Next app's compilation and static-export config.

**Readiness follows the chain above.** Promote each story to ready only when its prerequisite is
implemented and verified on the branch; read live labels rather than this sentence for the
current position. **None of
#1188–#1192 is unattended work** — every one is a frontier-tier authentication surface requiring
an independent correctness and security review with cold context, per the
[v2 handoff](../../prototypes/v2/CLAUDE.md). Do not pick them up in a `/burndown` or `/nightly`
run.

Stage 2 is deliberately **server-only**. No child touches `prototypes/v2/`, the browser client,
or the UI; wiring accounts into the product is stage 5, after the owner-bound revision API.

### Reuse assessment (read-only survey of `../songsiknow`, 2026-09-10)

Recorded here because two entries in `ensemble-v2-sync.md`'s reuse table promise more than the
sibling actually contains, and a reimplementer who assumes otherwise will design the wrong thing:

- **There is no server-side session store to borrow.** The sibling seals the whole session into
  an `iron-session` cookie: no token, no hash, no session table, and therefore no way to revoke
  one device without rotating the shared secret and destroying every session for every user.
  #1189 designs our session model from scratch.
- **There is no recovery-code flow at all** — no verifier, no single-use table, no atomic
  consumption, no replacement issuance. #1191 is written fresh.
- **The negative tests our contract demands are absent there.** Their suite mocks the WebAuthn
  verify call to always succeed, so wrong origin, wrong RP ID, challenge replay, concurrent
  claims and missing user verification are never exercised. #1188 writes them rather than porting.

What *is* genuinely reusable: the atomic delete-and-return challenge claim (one prepared
statement, so a concurrent second claim fails closed), the friendly WebAuthn error mapping, the
dependency-free sliding-window rate limiter, the metadata-only auth-failure recording, and the
schema habits — app-minted text keys, epoch-millisecond timestamps, explicit indexes on every
foreign key used in a `WHERE`, and an explicit account-deletion registry rather than trusting
`ON DELETE CASCADE`.

## Stage 3 — owner-bound revision API (filed 2026-09-14)

Shaped from `ensemble-v2-sync.md` stage 3 at Brandon's direction, following stage 2's pattern:
a foundation story, the core endpoint, a dedicated real-database concurrency proof, and an
exit gate mirroring #1192's. All four are blocked on #1192 landing — stage 3 needs verified
sessions to authenticate the caller before any of this can wire up for real.

| Issue | Bounded deliverable | Depends on |
| --- | --- | --- |
| [#1201](https://github.com/brndnsh-labs/Ensemble/issues/1201) | Owner-scoped document/receipt/tombstone schema and query layer | #1192 |
| [#1202](https://github.com/brndnsh-labs/Ensemble/issues/1202) | Atomic, idempotent Explicit Save endpoint (the six-step protocol) | #1201, #1192 |
| [#1203](https://github.com/brndnsh-labs/Ensemble/issues/1203) | Concurrency/idempotency proofs on a real disposable database | #1202 |
| [#1204](https://github.com/brndnsh-labs/Ensemble/issues/1204) | Stage-3 exit gate — independent authorization review | #1201–#1203 |

**None of #1202/#1204 is unattended work** — both are frontier-tier authorization/concurrency
surfaces requiring an independent correctness and security review with cold context, the same
requirement stage 2 placed on #1188–#1192. Do not pick them up in a `/burndown` or `/nightly` run.

Stage 3 is server-only, like stage 2: no child touches `prototypes/v2/`, the browser client, or
the UI. Wiring the document API into the product is stage 5, after library download/reconciliation
(stage 4) has something real to reconcile against.

## Starting a fresh session

Read [the cross-provider handoff](../../prototypes/v2/CLAUDE.md), then one ready issue.
Give each fresh session a single issue, not a cycle across a whole stage.

The source [approved draft at 5c888d53](https://github.com/brndnsh-labs/Ensemble/blob/5c888d53712b63d7de74ef8079b22a43696fec01/docs/design/ensemble-v2-next-batch.md)
of the stage-1 batch is retained in Git history for provenance. Its unfiled wording and draft
letters are historical; use the live issues above, not the old draft, for implementation.
