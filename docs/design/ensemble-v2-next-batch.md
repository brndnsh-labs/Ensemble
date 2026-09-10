# V2: filed cycle batches

Index of the bounded implementation children carved out of
[`ensemble-v2-sync.md`](ensemble-v2-sync.md)'s staged acceptance contracts, filed under
[milestone 15](https://github.com/brndnsh-labs/Ensemble/milestone/15) and parent
[#1172](https://github.com/brndnsh-labs/Ensemble/issues/1172).

This is an issue index, **not a second status tracker**. Each issue owns its acceptance criteria,
file boundaries, model labels, review requirements, prerequisites and verification receipts.
Read current GitHub state before picking work; do not infer readiness from this index.

Integrate serially on `feat/ensemble-v2-foundation` / draft PR #1173. Do not merge, enable
auto-merge, mark the PR ready, close implemented children, sync main or deploy production.
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

All five are implemented on the branch and sit at `status:in-review` per the branch-only
exception. They prove local behavior against injected fake transports; none of them is a live
server, an authenticated session, or an end-to-end sync claim.

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
| [#1189](https://github.com/brndnsh-labs/Ensemble/issues/1189) | Hashed, revocable sessions and same-origin checks | #1188 |
| [#1190](https://github.com/brndnsh-labs/Ensemble/issues/1190) | Passkey add/revoke behind a fresh-authentication requirement | #1189 |
| [#1191](https://github.com/brndnsh-labs/Ensemble/issues/1191) | Recovery-code enrollment, claim and atomic consumption | #1189 |
| [#1192](https://github.com/brndnsh-labs/Ensemble/issues/1192) | Bounded auth surface and the stage-2 threat-model review | #1188–#1191 |

The service lives at `prototypes/v2-api/` — a sibling of `prototypes/v2/`, not a subdirectory,
so the API sources stay out of the Next app's compilation and static-export config.

**Only #1187 is `status:ready`.** The rest are `status:blocked` on the chain above; promote each
to ready only when its prerequisite is implemented and verified on the branch. **None of
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

## Starting a fresh session

Read [the cross-provider handoff](../../prototypes/v2/CLAUDE.md), then one ready issue.
Give each fresh session a single issue, not a cycle across a whole stage.

The source [approved draft at 5c888d53](https://github.com/brndnsh-labs/Ensemble/blob/5c888d53712b63d7de74ef8079b22a43696fec01/docs/design/ensemble-v2-next-batch.md)
of the stage-1 batch is retained in Git history for provenance. Its unfiled wording and draft
letters are historical; use the live issues above, not the old draft, for implementation.
