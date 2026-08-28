# Songbook — durable chart documents

**Status:** Accepted architecture; foundation work begins in issue #1029. Later phases remain
design targets and must ship as separately reviewed stories.
**Date:** 2026-08-26
**Goal:** Let a musician keep, reopen, share, and back up multiple songs without making the live
arranger state, browser storage, or share URL into accidental document formats.

This design deliberately starts below the Songbook UI. The first requirement is not a list of
saved songs; it is a lossless, versioned boundary between a song, the workspace around it, and
the engine currently playing it.

---

## 1. The current boundary is not a document

`saveCurrentState()` currently serializes a hand-maintained selection of global slices into the
single `ensemble_currentState` local-storage entry. Hydration maintains a second hand-written
field list. That arrangement has three structural problems:

1. **Writer/reader drift loses authored state silently.** Before #1029, section-local
   `targetIntensity` and `instruments` were written inside `sections` but discarded by
   `validateSections`; `arranger.grouping` and `complexity` were never written. A field's
   presence in hydration is not by itself proof that it belongs in a document: the current
   `bandIntensity` is realized auto-conductor state and deliberately remains runtime-only.
2. **One payload mixes different lifetimes.** Musical content, device choices, visual
   preferences, session-start defaults, and runtime state do not all belong to a song.
3. **The storage shape is doing three jobs.** It is simultaneously a crash-recovery snapshot,
   an implicit document, and the source for a future library. Changing it in place would make
   rollback and old-client coexistence needlessly destructive.

The existing share URL is not the answer. It is intentionally compact and suitable for handing
someone a playable arrangement; it is not a lossless archive or a mutable document identity.

---

## 2. Four explicit models

Songbook separates four things that happen to live in the same state tree today.

### `ChartDocument`

The durable, portable musical artifact. Its settled core is the arrangement (including section
overrides, key/mode, and meter/grouping), reproducibility inputs (song seed, seed policy, and
authored groove pattern), and the band's authored interpretation (tempo, complexity, genre/feel,
lane enablement, sound-source choices, styles, octaves, density, and phrasing).

Meter grouping is semantic content, not display metadata. A custom partition such as 5/4 `2+3`
must become the effective meter used by playback accents, generation, exports, and visual timing;
if it is invalid, every consumer falls back to the selected meter's canonical grouping.

It does **not** contain transport position, live audio nodes, generated worker maps, undo history,
open panels, or browser/device identities.

```ts
interface ChartDocument {
    schemaVersion: number;
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    revision: number;
    chart: ChartContent;
}
```

The envelope fields are storage concerns; `chart` is the lossless content also written to a
portable `.ensemble` file. Derived state—including progression maps and `sectionSeedMap`, which
is a memo of `(sectionId, songSeed)`—is rebuilt, never serialized.

### `WorkspacePreferences`

Settings that should follow the musician rather than the song: palette/mode, visual aids,
count-in and practice defaults, the output master volume, MIDI device IDs and latency, local
audio muting, and similar browser/device choices. Preferences have their own versioned record.

The canonical ownership table is enforced by `public/songbook/state-ownership.ts`. It is typed
against every top-level live-state field, so adding a state field without choosing exactly one
owner fails typecheck. The legacy writer has a separate behavioral reachability guard; this keeps
its compatibility payload unchanged without making the new codecs depend on that old shape.

| Owner | Canonical fields |
| :--- | :--- |
| `ChartDocument` | Sections and overrides; key/mode; meter/grouping; **notation**; tempo; complexity; song seed and policy; genre/feel; authored groove pattern; lane enablement, source choice, style, octave, density, phrasing, **volume, and reverb**. |
| `WorkspacePreferences` | Palette/mode; visual aids; count-in and practice defaults; output master volume; **session timer and song mode**; MIDI device IDs, latency, local audio muting, octave offsets, velocity sensitivity, and **channel mappings**. |
| `RuntimeState` / derived | Transport and practice progress; current `bandIntensity`; the current forced-on-at-boot `autoIntensity` behavior; `sectionSeedMap`; generated arranger/worker maps; audio handles; undo and transient UI. Version 1 has no authored starting-intensity or manual-vs-auto field. |

`public/songbook/types.ts` owns the semantic version-1 shapes. `public/songbook/codec.ts` validates
the complete untrusted candidate before returning a detached typed value; unknown future versions
remain recoverable source data rather than being coerced into version-1 defaults. Structural
limits run first: 1 MiB serialized input, depth 32, 100,000 visited nodes, and 500 sections.

### `DocumentSession`

The workspace's relationship to the content currently in memory:

```ts
type DocumentOrigin =
    | { kind: 'draft' }
    | { kind: 'local'; documentId: string; baseRevision: number }
    | { kind: 'shared' };

interface DocumentSession {
    sessionId: string;
    origin: DocumentOrigin;
    dirty: boolean;
}

interface ActiveSessionRecord {
    schemaVersion: number;
    /** Collision-resistant identity for one browser-tab writer. */
    sessionId: string;
    origin: DocumentOrigin;
    /** Present for a draft/shared chart or unsaved local edits; absent for a clean local pointer. */
    recoveryChart: ChartContent | null;
    capturedAt: string;
}

interface ActiveSessionPointer {
    schemaVersion: number;
    sessionId: string;
    updatedAt: string;
}
```

A named local document has identity and a revision. A new song is a draft until the musician
names or explicitly keeps it. A share link is detached: opening one never gains permission to
overwrite a sender's or an existing local document. Its first durable action is **Keep a copy**.

`ActiveSessionRecord` is a separate, versioned crash-recovery record, never a Songbook list
entry. Recovery is writer-scoped, not a singleton: each tab mints a collision-resistant
`sessionId`, keeps it stable for that browsing context, and writes only its namespaced record.
A small `ActiveSessionPointer` identifies the most recently active session but is never the only
way to discover recovery data. A synchronous `ActiveSessionStore` owns validated enumeration,
read, write, and clear boundaries: clean local sessions store only the document pointer and base
revision; drafts, shared charts, and dirty local sessions also store a bounded recovery snapshot.
After a document write succeeds, the tab advances the last-active pointer and clears only the
redundant snapshot in its own record. It must never overwrite or clear another session's record.

On boot the store enumerates all bounded session records and orders them by `capturedAt`, newest
first, using the last-active pointer only to break timestamp ties. For each record in order it
restores `recoveryChart` when present or reads the clean local document pointer otherwise; the
first readable candidate becomes active. Every non-selected recovery remains available as an
explicitly recoverable draft/conflict copy. Corrupt or future-version records remain quarantined
and downloadable. Session IDs are writer identities, not imported chart data; an implementation
that persists them through reload must detect a cloned live identity and rotate it before the
first write.

### `RuntimeState`

Transport, conductor progress, generated maps, worker cursors, audio handles, transient UI, and
undo history remain runtime-only. Opening a document derives fresh runtime state from
`ChartDocument + WorkspacePreferences`; runtime state is never the persistence authority.

---

## 3. Lifecycle rules

- **Boot:** try session records in deterministic newest-first order, restoring each record's
  recovery snapshot when present or its clean local document otherwise. If no session candidate
  is readable, restore the compatibility session as a draft; otherwise start the normal default
  draft. Preserve non-selected recoveries rather than silently deleting them.
- **New Song:** create a new draft. Starter templates may seed it, but their current
  Replace/Append/Undo behavior inside an open chart remains available.
- **Keep/rename:** assign or update local identity without changing the chart content.
- **Open:** validate the complete candidate first, then replace the runtime in one transaction.
- **Autosave:** a named local document may autosave with revision checking. A draft retains
  crash recovery but does not silently become a library entry.
- **Shared content:** always opens detached. Keeping it mints a new local ID and revision zero.
- **Delete:** removes only the selected local record after an explicit confirmation. Deleting
  the active record leaves its in-memory content as a draft so the chart does not vanish.

The library must expose honest states: draft, saved, dirty, shared copy, conflict copy, and
unreadable/recoverable record. "Saved" may only be shown after write-and-read-back succeeds.

Boot precedence is explicit: order all session records by `capturedAt` with the last-active
pointer as a tie-breaker, then validate each record and restore its recovery snapshot when
present or read its clean local pointer otherwise. Use the first readable candidate. Only after
all session candidates fail does boot import the legacy compatibility session as a draft, then
fall back to the default draft. A corrupt recovery record is retained as downloadable evidence
and skipped—it is never interpreted as an empty library or allowed to overwrite a readable
document.

---

## 4. One atomic open transaction

Opening a chart is not a series of ordinary field dispatches. Partial application could put the
main thread, worker, and UI on different songs. A later story introduces one `LOAD_DOCUMENT`
transaction with this order:

1. Decode, migrate, and validate the entire document without mutating live state.
2. Stop or safely suspend transport and capture the current session for rollback.
3. Replace all document-owned slice fields as one reducer/orchestrator operation.
4. Rebuild progression and derived arranger maps.
5. Perform a full worker sync, then flush buffers in the repository's canonical order.
6. Commit the `DocumentSession` identity only after every prior step succeeds.
7. On failure, restore the captured session and report a typed, user-actionable result.

No repository adapter may reach into live slices. It reads and writes `ChartDocument`; the load
transaction owns conversion to runtime state.

---

## 5. Repository boundary and backend decision

Application code depends on a small asynchronous repository interface, not on `localStorage` or
IndexedDB directly:

```ts
type DocumentWrite = Pick<ChartDocument, 'schemaVersion' | 'id' | 'title' | 'chart'>;

interface SongbookRepository {
    list(): Promise<RepositoryResult<DocumentListEntry[]>>;
    read(id: string): Promise<RepositoryResult<ChartDocument>>;
    write(
        document: DocumentWrite,
        expectedRevision: number | null,
    ): Promise<RepositoryResult<ChartDocument>>;
    remove(id: string, expectedRevision: number): Promise<RepositoryResult<void>>;
}
```

The repository owns revision and timestamp assignment inside the same transaction as the
compare-and-put. `expectedRevision: null` is create-only and conflicts if the ID already exists;
a successful create stores revision zero and assigns both timestamps. A numeric expectation must
equal the stored revision; success stores `expectedRevision + 1`, preserves the original
`createdAt`, assigns `updatedAt`, and returns the exact committed record. Callers cannot propose
their own revision or timestamps.

Results distinguish `not-found`, `conflict`, `quota`, `unavailable`, `invalid`, and `unknown`.
`DocumentListEntry` represents either a readable summary or an unreadable/recoverable record, so
callers cannot mistake unavailable storage, corruption, or missing data for an empty library.

The initial implementation should use self-contained records and discover them by enumerating the
repository's document namespace. It should **not** add a separately maintained title/index record
until measurements show enumeration is a real problem; an index creates another writer/reader
consistency boundary.

The authoritative multi-writer backend must provide atomic compare-and-put:

- Native IndexedDB transactions are the baseline once revision-aware multi-tab writes ship.
- A local-storage adapter is acceptable only as the legacy compatibility/recovery journal or for
  an explicitly single-writer prototype. Separate `getItem`/`setItem` revision checks and
  write/read-back cannot make a multi-tab write atomic.
- A different backend may satisfy the same contract with a proven locking/fencing mechanism.
  UI and document codecs must not change with that decision.

Audio, rendered WAV files, and MIDI exports are not embedded in Songbook records.

---

## 6. Versioning, migration, and rollback

Every document and preferences record carries an integer `schemaVersion`. Migrations are pure,
ordered functions from one validated shape to the next. A migration never mutates its input and
never deletes the only readable copy.

The single `ensemble_currentState` entry is a compatibility source, not something the first
Songbook release may rename or delete. Migration proceeds conservatively:

1. Read and validate the legacy session using the same field validators used by normal loading.
2. Compute a migration fingerprint so retries are idempotent.
3. Write a new document record, read it back, and compare its canonical content.
4. Only then point the new active-session record at it.
5. Keep the verified legacy key unchanged as a compatibility and rollback journal while old
   builds remain supported. New builds do not continuously shadow-write Songbook edits into it.

The migration fingerprint records the legacy payload that was imported. If an old build later
changes that key, a new build imports the divergence as a clearly named recovered draft/conflict
copy; it never folds it into or overwrites an existing Songbook revision. Cross-version concurrent
editing of one logical chart is not supported. During the coexistence window, downgrading opens
the last legacy snapshot rather than the latest Songbook edit, so `.ensemble` export is the
lossless handoff to an old or different installation. Likewise, a failed read-back leaves the
legacy session untouched and active.

Legacy deletion is a separate, explicitly approved story after at least one rollback-compatible
release and successful migration/conflict tests. It must never occur in the same release that
first writes the new format.

---

## 7. Multiple tabs and conflicts

Each write supplies the revision it was based on. A mismatched revision is a conflict, not a
last-writer-wins success. `storage` events or `BroadcastChannel` may provide early notification,
but correctness comes from an atomic revision check and write at the repository boundary. Those
notification channels do not serialize writes.

When another tab advances the active document:

- a clean tab may reload after notifying the musician;
- a dirty tab keeps its content in its own session-scoped recovery record and offers the remote
  version separately;
- resolving by "keep mine" creates a conflict copy unless the user explicitly chooses to
  replace the newer revision.

Bare local storage cannot provide that compare-and-swap. It remains useful for synchronous crash
recovery and downgrade compatibility, but not as the authoritative multi-writer document store.

---

## 8. Portable backup is part of the document contract

Songbook must be usable without trusting one browser profile forever. Export writes the canonical
versioned document envelope as a lossless `.ensemble` JSON file; import validates and previews it
before minting a new local identity. Unknown future versions are preserved as unreadable files,
not partially loaded or coerced into defaults.

Before `JSON.parse`, import rejects a file whose byte size exceeds 1 MiB. Immediately after parse
and before migration, an iterative structural validator rejects documents nested more than 32
levels, object graphs with more than 100,000 visited nodes, and charts with more than 500
sections. Existing field limits still apply (including 100-character labels, 1,000-character
progressions, and 64-character seeds), and migration may execute at most the finite schema gap
to the current version. A rejection occurs before preview or live-state mutation and leaves the
source file untouched. These are codec constants with boundary tests, not UI-only checks.

Share URLs stay compact and social. `.ensemble` stays lossless and archival. Neither is an
implementation detail of the other, though both may reuse field-level validators.

---

## 9. Delivery sequence and brake gates

1. **Foundation (#1029):** document this contract and repair additive loss in the existing
   `currentState` round-trip. No key migration, deletion, or multi-record UI.
2. **Canonical codecs (#1044):** typed document/preferences codecs and a field-ownership
   manifest with behavioral round-trip and exact-boundary tests. This stage is pure: it writes no
   records and never reads or mutates live state.
3. **Repository + compatibility bridge:** write self-contained records behind the repository,
   keep/read-back the legacy recovery journal, detect divergent old-client writes, and prove
   retry/rollback behavior.
4. **Atomic runtime load:** add `LOAD_DOCUMENT`, derived-state rebuild, worker resync, rollback,
   and during-playback tests.
5. **Songbook UI:** list, name, open, copy, delete, import, and export with honest error states.
6. **Entry-point integration:** make New Song, starters, and shared links obey the lifecycle rules
   without removing the current in-place arrangement tools.
7. **Legacy retirement:** only after the compatibility window and explicit owner approval.

Stories 2–7 touch persisted state or the state/worker contract and therefore always take the
repository's brake path. Storage migration, record deletion, and `LOAD_DOCUMENT` must each be
reviewed independently; bundling them removes the rollback boundaries this design is meant to
create.

---

## 10. Foundation invariant

The current persistence writer and hydrator remain parallel compatibility lists until the later
repository/bridge story replaces their authority. Their guardrail is therefore behavioral:

> Every valid field covered by the foundation contract survives
> `save -> JSON serialization -> hydrate`, malformed fields are bounded or rejected according to
> their live contract, and a legacy payload with no new field receives the existing default.

#1029 adds that proof for section intensity/instrument overrides, grouping, and complexity while
continuing to write only `ensemble_currentState`. Realized auto-conductor intensity remains
runtime-only until a distinct authored starting-intensity policy exists.
