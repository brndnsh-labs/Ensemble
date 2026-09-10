# V2: next cycle batch — approval draft

Prepared 2026-09-10 against `feat/ensemble-v2-foundation` at `1dc55c84`.
These are **unfiled drafts**, not ready GitHub issues or a second status tracker. The intake
workflow requires Brandon to approve the shaped batch before filing. After filing, replace
the drafts with issue links; GitHub then owns status, dependencies and acceptance receipts.
Parent: [#1172](https://github.com/brndnsh-labs/Ensemble/issues/1172).

All five follow the [cross-provider handoff](../../prototypes/v2/CLAUDE.md). Integrate only on
the v2 branch / draft PR #1173; no main merge, auto-merge, issue closure or production. Baseline
#1177 is implemented on that branch, not merged. Its open status is not an unmet dependency.

## Batch and order

| Draft | Suggested routing | Initial status after approval | Prerequisite |
| --- | --- | --- | --- |
| A: Bounded account-library listing | model/balanced, size/m | ready | Existing #1177 code |
| B: Canonical Save-request decoder | model/balanced, size/m; frontier security reviewer | ready | Existing frozen wire contract |
| C: V2 document persistence contract tests | model/economy, size/s | ready | Existing #1177 code |
| D: Independent local/cloud/sound status model | model/balanced, size/s | ready | Existing sync product contract |
| E: One bounded account outbox pass | model/frontier, size/m | blocked | A integrated and verified |

Recommended first pickup: C to exercise the established contract, then A or B. A, B, C and
D have independent feature ownership below. Integrate serially; test registration/config
changes and common fixtures are not implicitly file-disjoint. E does not require a live API.
The approval authorizes these bounded contracts, not hosting, auth implementation or new music.

## A — feat(v2): list account-local songs with bounded owner-scoped pages

**Why:** `AccountSongbook.read` and `pending` require a known document ID. The future account
songbook and queue processor need bounded enumeration without scanning other owners' data.

**Touches:** `prototypes/v2/lib/sync/repository.ts`; a dedicated browser test file under
`tests/browser/`; explicit registration in `vitest.sync.config.ts`. No database version change.

**Fix:** Add `list(scope, { afterDocumentId?, limit? })` returning detached validated `SavedSong`
records plus `nextAfterDocumentId: string | null`. Default limit 50; only integers 1–100 are
accepted. Order by document ID using the existing compound key. The cursor is exclusive and
scoped by the captured owner/generation; it is a local pagination token, not authorization.
Use an owner-bounded IDB range and at most limit + 1 records to detect another page. Do not
load the entire database/library and filter afterward. An individual page is transactional;
separate pages do not promise a historical snapshot if the library changes between calls.

**Acceptance:**

- Empty owner returns an empty page/end cursor. More than two pages have deterministic order,
  no duplicate/omitted IDs for a stable dataset, and terminate. Other owners' records, including
  identical document IDs, never appear or cause validation failures in this owner's page.
- Invalid limit/cursor fails explicitly. Cursor at/past the last ID returns end-of-list.
- Every returned record passes the existing saved-record validator; malformed or future-version
  data in the fetched window rejects the page without an empty/partial success or any write.
- Mutating inputs/returned documents cannot retarget an awaited call or alter stored records.
  Stale account generation rejects; read failures preserve source data.
- Browser tests prove real IDB range/transaction behavior in Chromium and WebKit. Existing
  storage/outbox tests remain green; no index migration or guest-store access is introduced.

**Verification:** `npm run test:sync`, preview typecheck/build, then the implementation gates in
the handoff. Reviewer checks actual range bounds and stale-owner behavior, not only assertions.
**Stop:** a schema migration, deletion API or changed saved-record contract is needed.

## B — feat(v2): validate frozen Save requests at the server boundary

**Why:** The client freezes canonical JSON in `AccountSongbook.prepare`, and validates replies.
There is no reusable request decoder for the future owner-bound revision/receipt service.

**Touches:** new `prototypes/v2/lib/sync/request.ts` and
`tests/unit/songbook/sync-request.test.ts`. Reuse existing protocol and portable validators;
do not change `prepare`, stored operation bytes, the chart schema or existing client format.

**Fix:** Provide a pure decoder accepting the received body string and an independently
authenticated owner ID. Validate before any persistence. The owner parameter is a trusted
caller contract, not a new authentication implementation. Accept only protocol version 1 and
the current `prepare()` serialization (including its envelope keys/order).
Validate IDs, expected revision (null or existing opaque revision format), and v1/v2 document.
The trusted owner must equal `envelope.ownerId`; `document.id` must equal `envelope.documentId`.
Portable documents have no owner field: do not add or infer one. Reject unknown/duplicate keys, alternate serialization,
malformed JSON, unsupported versions, mismatched IDs and extra metadata. Reconstruct canonical
bytes for comparison, but return/hash the original accepted bytes; never silently rewrite a
request under an existing operation ID. Use a UTF-8 input ceiling of the canonical document
limit plus 4 KiB envelope allowance, and independently enforce the existing document limit.

**Acceptance:**

- Valid v1 and v2 requests in the exact existing `prepare` format round-trip, including Unicode
  and inert import source. Pin canonical bytes in fixtures; digest is SHA-256 of received bytes.
- Missing/foreign authenticated owner, envelope/document mismatch, invalid identifiers/revision,
  unknown protocol/document versions, duplicate/extra fields and noncanonical JSON reject.
- Byte limits are measured in UTF-8, tested at/over the ceiling; valid near-limit chart input
  still fits the envelope. No logging or returning chart/source/body content in error messages.
- The result is a detached validated document and owner/document/operation/revision/digest
  envelope. Extra caller properties cannot enter it; nothing is persisted or sent.
- Existing client wire/receipt tests remain unchanged and green. A reviewer checks positive
  compatibility as well as rejection coverage. Future routes must still authenticate, enforce
  same-origin policy, bound streaming input and use server-side ownership predicates.

**Verification:** targeted unit tests and preview typecheck/build, then handoff implementation
gates. Independent **frontier-tier security review** required before delivery; balanced routing
is for implementation, not permission to omit or downgrade this reviewer.
**Stop:** adapting wire bytes/schema, adding a route, choosing auth/session or database libraries,
or claiming this helper enforces authentication. Those require separate stories.

## C — test(v2): pin semantic-chart survival through Save and retry

**Why:** The native IDB suite currently exercises the outbox with legacy v1 charts. The v2
snapshot unit test does not prove exact semantic charts survive persistence and reopening.

**Touches:** `tests/browser/account-songbook.browser.test.ts` only. Use small synthetic v2
fixtures in that file, not personal exports or changes to production code. Existing two-engine
test registration already covers this file.

**Fix:** Add these production-seam contract cases using `AccountSongbook` and `sendNext`, not
mocked repository methods. Include rational chord durations, stable measure IDs, a key change,
repeat/ending directions and inert import source within canonical supported syntax.

**Acceptance:**

- Save A, recover unsaved B, Save C, recover unsaved D. Close/reopen the real database; send A
  then C. Compare every authored score/source field and frozen body to the expected snapshots;
  D remains the latest unsaved writer recovery after acknowledgements.
- Simulate server commit with lost response: retry after reopening has identical operation ID,
  body and digest. Acknowledgement never unfolds the score or overwrites newer local content.
- Caller mutation after save and mutation of a returned read/draft cannot alter stored score,
  source, pending snapshot or a subsequent read. Assert nested content, not just title/revision.
- Inject an unsupported saved-document version and a malformed draft record directly in the
  test database. Public reads fail explicitly; raw source records remain unchanged. Do not
  expect or implement automatic quarantine, migration, deletion or empty-library fallback.
- All new tests actually run in Chromium and WebKit with deterministic cleanup. Retain existing
  assertions; no sleeps, skips, retries or relaxed assertions to hide failure.

**Verification:** `npm run test:sync`, then the handoff implementation gates.
**Stop:** if a test exposes a reproducible implementation defect, report its smallest reproducer
and failed contract. Do not encode current broken behavior or broaden this test-only story.

## D — feat(v2): separate local-save, cloud and sound status facts

**Why:** The approved sync contract separates local safety, cloud confirmation and offline
readiness. A single saved/online badge would mislead users after offline Save or later edits.

**Touches:** new `prototypes/v2/lib/sync/status.ts` and
`tests/unit/songbook/sync-status.test.ts`. Pure presentation model only; no account UI wiring,
fetching, storage reads, polling, timers, audio changes or changes to `app/ensemble.tsx`.

**Fix:** Define a typed projection of independently supplied facts into three separate status
results, not one priority badge. Require explicit unknown/error inputs; absent evidence cannot
default to success. The view model will be the account UI's contract in the later integration
slice. Do not infer status by comparing timestamps, navigator connectivity or document text.

Pin this public type shape (names may not be silently changed by a later consumer):

```ts
type Progress = { required: number | null; verified: number | null };
type StatusFacts = {
  local: {
    savedRevision: number | null | 'unknown';
    editing: 'clean' | 'dirty';
    lastSave: 'idle' | 'failed';
    recovery: 'unknown' | 'none' | 'confirmed' | 'failed';
  };
  cloud: {
    observation: null | {
      remoteRevision: string | null;
      pendingCount: number;
      conflict: boolean;
    };
    activity: 'idle' | 'sending' | 'reauth' | 'retry';
  };
  offline: {
    shell: 'unknown' | 'verified' | 'missing';
    documents: Progress;
    sounds: Progress;
  };
};
type StatusView = {
  local: StatusFacts['local'] & {
    status: 'save-failed' | 'unsaved' | 'unknown' | 'saved';
  };
  cloud: {
    status: 'unknown' | 'conflict' | 'queued' | 'sending' | 'confirmed' | 'not-uploaded';
    pendingCount: number | null;
    activity: StatusFacts['cloud']['activity'];
  };
  offline: StatusFacts['offline'] & { status: 'unknown' | 'incomplete' | 'ready' };
};
// Public entrypoint: projectSyncStatus(facts: StatusFacts): StatusView
```

Each row below is ordered **first matching condition wins**, within its own independent result.

| Result | Ordered conditions → status |
| --- | --- |
| Local | last Save failed → save-failed; dirty editor → unsaved; unknown saved revision → unknown; null saved revision → unsaved; otherwise → saved |
| Cloud | null observation → unknown; conflict → conflict; pending > 0 + sending → sending; pending > 0 → queued; non-null remote revision → confirmed; otherwise → not-uploaded |
| Offline | shell missing or any known verified < required → incomplete; unknown shell or any null count → unknown; otherwise → ready |

Return detached copies of retained facts. Local recovery remains separate even after save-failed;
cloud activity remains a separate wait/progress reason even when status is conflict or unknown.
Only known revision/count values are nonnegative safe integers; remote revisions use the existing
validator. Reject negative/unsafe counts, verified > known required, conflict with zero pending,
and sending without an observed positive queue. A null count is unknown, not zero. An explicit
aborted download is represented by its remaining verified counts or unknown facts, not a new
claim of readiness; this helper does not own transfer lifecycle state.

**Acceptance:**

- Local status distinguishes uncommitted editing, confirmed local commit, and failed/unknown
  persistence. A failed new Save can acknowledge an older saved version without claiming the
  current editor is saved. Draft recovery confirmation is distinct from explicit Save.
- Cloud status: unknown/unavailable stays unknown; preserved conflict wins over queued/sending;
  nonempty pending queue is never confirmed; confirmed requires an observed remote revision and
  an observed empty queue. No remote revision + empty queue is not uploaded. Unsaved editing
  remains a separate local fact and never silently becomes an upload candidate.
- Authentication-required and transport retry are explicit wait reasons, not lost-work or
  confirmed-upload states. A transient failure cannot erase a conflict or queued-save count.
- Offline status requires verified shell, committed document availability and verified required
  sounds. Report document and sound progress separately. Unknown is not zero; zero sounds is
  complete only when the required set is known empty. Account presence alone proves nothing.
- Table-driven tests cover offline Save A → edit B → Save C → edit D → A/C acknowledgements,
  plus conflict, failed local write, expired session, partial/missing sound and invalidated
  readiness. Inputs/outputs contain no chart text, credentials or owner IDs.

**Verification:** targeted unit tests and preview typecheck/build, then handoff implementation
gates. Review the state table against the sync contract; no visible UI/device claim in this slice.
**Stop:** an input would require guessing an unknown fact, inventing conflict-resolution UX or
changing the recovery/Save authority. Surface that gap before implementing a workaround.

## E — feat(v2): process one bounded account outbox pass

**Why:** `sendNext` advances one known document. A future foreground account host needs a
bounded sweep that does not starve other songs behind a conflict or accidentally change owners.

**Dependency:** A must be integrated on the v2 branch with a passing receipt. File as blocked;
only mark ready after verifying the real listing API and adapting the concrete test setup.

**Touches:** new `prototypes/v2/lib/sync/drain.ts`, a dedicated browser test file under
`tests/browser/`, and explicit registration in `vitest.sync.config.ts`. Reuse `sendNext`/listing;
do not change repository transaction semantics, stored bytes or the wire protocol.

**Fix:** One caller-driven pass, not a background service. Accept captured scope, injected
transport, optional abort signal and exclusive resume cursor. Walk at most one page of 25
songs and call `sendNext` at most once per visited document, sequentially. Return typed counts
for idle/committed/conflict/retry and the last safely visited cursor (null at confirmed end).
The host can continue with another call; do not retain hidden cursors, schedule retries, drain
a busy song forever or start from app bootstrap. New/changed IDs missed during a changing
library are picked up on the next full sweep; this is not a change-feed completeness promise.

Pin the entrypoint/result contract:

```ts
type OutboxPassResult = {
  kind: 'complete' | 'more' | 'retry' | 'aborted';
  resumeAfterDocumentId: string | null;
  counts: { idle: number; committed: number; conflict: number; retry: number };
};
// runOutboxPass(songbook, scope, transport,
//   options?: { afterDocumentId?: string; signal?: AbortSignal }): Promise<OutboxPassResult>
```

Initialize the resume position to the incoming cursor, or null for the start. Counts start at
zero. The cursor only advances after an idle/committed/conflict result; every returned sendNext
outcome increments its own count. An abort after a settled call wins over retry/more/complete,
but does not erase that call's count or roll back its acknowledgement. Invalid identifiers,
storage/validation failures and stale scope reject rather than returning fabricated progress.

| Event | Result and cursor |
| --- | --- |
| Idle, committed or conflict | Count it and advance to that document; continue if not aborted |
| Transport retry | Count retry; return retry with cursor before that document (incoming cursor/null if first) |
| Abort before/during listing | Return aborted with incoming cursor/null and zero counts; no sends |
| Abort while send settles | Await its existing guarded outcome; count it; advance only for idle/committed/conflict; return aborted |
| Page exhausted, another page exists | Return more with last visited document ID |
| Page exhausted, no next page | Return complete with null cursor; a later full sweep starts at the beginning |

Abort never hides a storage/stale-owner failure from an in-flight call: that failure still rejects.

**Acceptance:**

- A song whose head conflicts does not block a different song. Multiple queued Saves for one
  song stay ordered; one pass sends only its head. No draft/recovery becomes a request.
- At most 25 sends occur per pass, never concurrent within a pass. Returned cursor lets the
  next call reach later songs without resending already visited ones in a stable dataset.
- A transport retry ends this pass; cursor remains before the failed song so resumption retries
  the same frozen operation. No automatic timer, infinite loop or busy retry is introduced.
- Cancellation prevents starting another send, including cancellation during page loading.
  An already-sent request can still settle through `sendNext`'s guarded acknowledgement; never
  claim it was canceled remotely. Report aborted state distinctly from complete.
- Owner switch/stale generation or storage/validation error rejects and starts no further
  send. Late callbacks cannot acknowledge into another owner's scope. Caller mutation cannot
  retarget the pass. An HTTP transport will separately have to verify server session ownership.
- Two simultaneous passes may deliver the same operation; tests require identical bytes and
  safe acknowledgement, not exactly-once networking. Lost replies survive close/reopen.
- Real IDB tests in both engines cover progress, conflict isolation, resume, retry, cancellation,
  caller mutation, owner switching and duplicate passes. Test using an injected fake transport;
  do not claim cloud integration. Independent frontier-tier concurrency/security review required.

**Verification:** `npm run test:sync`, preview typecheck/build, then handoff implementation gates.
**Stop:** live credentials/routes, new locks or database migrations, automatic bootstrap sync,
sign-out deletion, conflict resolution, downloads or new retry policy beyond this one-pass API.
