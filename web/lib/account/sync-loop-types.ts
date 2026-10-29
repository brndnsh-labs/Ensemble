import type { HomeSlice } from '../home';
import type {
    ChartDocument,
    CollectionDocument,
    SavedCollection,
    SavedSong,
} from '../sync/protocol';
import type {
    AdoptedRemoteVersion,
    CollectionListing,
    KeepBothResolution,
} from '../sync/repository';
import type { Progress } from '../sync/status';

/**
 * Why the last pass could not finish sending. Never a raw server code or exception text.
 *
 * `too-large` is deliberately its own reason rather than a second spelling of `quota`: a full
 * library is fixed by deleting a song in the cloud and a chart the server will not accept is not
 * fixed by anything the musician can do to their account, so the two must not be one word.
 *
 * `refused` is the third of that family (#1268 patch review P1): the account read the request,
 * answered definitively about THESE bytes, and will answer the same way forever — an operation id
 * already spent on something else (`operation_mismatch`), or an id it has no row and no tombstone
 * for (`not_found`). Every other reason here is a wait; this one is not, and saying "we'll try
 * again" about it is the one sentence this surface must not produce.
 *
 * `too-large` and `refused` are also the only reasons that are facts about ONE document —
 * `drain()` steps over that song and keeps sending the rest, which no other reason permits.
 */
export type SyncFailureReason =
    | 'expired'
    | 'offline'
    | 'rate-limited'
    | 'quota'
    | 'too-large'
    | 'refused'
    | 'server';

export interface SyncFailure {
    reason: SyncFailureReason;
    message: string;
}

/** The cloud side of one document, read from storage — never inferred from a request result. */
export interface CloudObservation {
    remoteRevision: string | null;
    pendingCount: number;
    /** See `StatusFacts['cloud']['observation']` in `sync/status.ts` for what each term means. */
    conflict: 'none' | 'version' | 'gone';
    /**
     * Why the queued Save at the head of this document's outbox was permanently refused (#1298),
     * read durably off the operation's own `status`/`reason` — never re-derived from whichever
     * document a transient pass-level `failure` last happened to name. Null when the head is not
     * refused. Distinct from `conflict`: a conflict is a two-sided version disagreement the
     * musician resolves with Keep-both; a refusal is a verdict about the REQUEST itself (payload
     * size, or an id/operation combination the account will never accept) that a retry cannot fix
     * — the two never apply to the same head at once, since only one status wins it.
     */
    refused: null | 'too-large' | 'refused';
}

/** `RemoteOutcome['kind']`, restated here so a reader of this loop's public surface never has to
 * follow an import into `sync/protocol.ts` to know what a candidate's `kind` can be. */
export type RemoteCandidateKind = 'version' | 'deleted' | 'unsupported';

/**
 * A remote advance this device preserved BESIDE a held record rather than applying it — either
 * `reconcile`'s `'candidate'` answer (#1310) or its `'retained-deleted'`/`'unsupported'` ones
 * (#1362) — published so the product can say so.
 *
 * All three `kind`s are here now (#1362; a `'version'`-only list was the pre-existing gap this
 * closes). Each reader picks what its own surface may say and do with a row, and only ONE thing
 * differs by kind at the call sites that matter: `kind: 'version'` is the sole adoptable shape —
 * `AccountSongbook.adoptRemoteVersion` refuses anything else outright — because a `'deleted'`
 * candidate names an id the account no longer holds at all, and an `'unsupported'` one is a body
 * this build cannot even read; "offer to replace your song with THIS" would be a sentence about a
 * document that does not exist in the form it claims, for both. Neither is ever paired with "Use
 * the account's version".
 *
 * The revision travels with the id because a `version` adoption is a compare-and-swap against it:
 * the musician answers about the version they were shown, never about whichever one a pass has
 * landed since. See `AccountSongbook.adoptRemoteVersion`.
 */
export interface RemoteUpdate {
    documentId: string;
    revision: string;
    kind: RemoteCandidateKind;
}

export interface SyncSnapshot {
    /** The account this loop is attached to, or null while signed out. */
    owner: string | null;
    /** True while a pass is in flight. */
    running: boolean;
    /** True while that pass is in its outbox half — the only honest basis for "sending". */
    sending: boolean;
    /**
     * Set when the last pass could not send, cleared by a pass that got everything out. It always
     * describes a Save that IS safely on this device: the outbox never discards a queued
     * operation, whatever the server said.
     */
    failure: SyncFailure | null;
    /** Cloud facts for the watched document; null when nothing is watched or nothing observed. */
    observation: CloudObservation | null;
    /**
     * Every remote advance this account holds preserved beside a held record (#1310), in document
     * order. Empty is a real answer — "nothing is waiting" — and it is what a detached loop
     * publishes, because a candidate is a fact about an account this device is no longer reading.
     *
     * ONE library-wide list rather than a per-document flag beside the observation, because both
     * readers need it and they need different halves: the songbook marks a ROW per id, and the
     * stand needs the watched document's REVISION to adopt against. A second copy of the same fact
     * on the observation is a second thing to keep in agreement — and `CloudObservation` is passed
     * to `projectSyncStatus` verbatim, whose reader is deny-by-default on unknown keys.
     */
    candidates: readonly RemoteUpdate[];
    /** `offline.documents` for `status.ts`. Unobserved until a download pages the manifest. */
    documents: Progress;
    /**
     * Collection Saves still in this account's outbox here (#1477), across every collection — the
     * one cloud fact about collections, because a collection is never on the stand and so never
     * the watched document the observation describes. The chip counts it beside the chart's own
     * queue, and it is zero when nothing is attached.
     */
    collectionSaves: number;
    /**
     * How many SONGS have a Save in this account's outbox here (#1478) — the chart on the stand's
     * own queue among them. One song's Save is the observation's to describe; this is what the
     * chip counts when more than that is waiting, as it is for the whole drain of a playlist
     * import. Zero when nothing is attached.
     */
    songsWaiting: number;
    /**
     * Bumped whenever a pass changed this account's stored SONGS, so a list can re-read. Never for
     * a collection alone (#1477 review R1): that re-read validates every song in the library, and
     * a star uploading must not cost a 2,000-song songbook that.
     */
    libraryVersion: number;
    /**
     * Bumped whenever this account's stored COLLECTIONS moved under a reader — a collection Save
     * committed, a conflict merged, a download adopted or removed one (#1477 review R1). What the
     * collections' own reader (`app/use-collections.ts`) re-reads on.
     */
    collectionsVersion: number;
}

/**
 * What one explicit cloud deletion did (#1270). `message` is always a sentence a musician can read.
 *
 * `retained` is the honest half of a successful delete: the cloud copy is gone, and this device
 * kept its own because a draft, a queued Save or the open chart meant dropping it would destroy
 * work that exists nowhere else.
 */
export type CloudDeleteResult =
    | { kind: 'deleted'; retained: boolean; message: string }
    /** Nothing was deleted. `retry` is true only when trying the same thing again could work. */
    | { kind: 'refused'; retry: boolean; message: string };

/**
 * What signing out would cost this device (#1269), read from storage rather than inferred.
 *
 * Two counts, never one total: a queued Save is work the musician committed and the cloud has not
 * taken yet, an unsaved draft is an experiment they never committed at all. They are protected the
 * same way — export, or send what can still be sent — but they are not the same sentence, and a
 * combined number would make the preflight unable to say which one is at stake.
 */
export interface SignOutPreflight {
    /** Every document this account holds here — what sign-out removes, and whose recovery slots go. */
    documentIds: string[];
    /**
     * The songs that hold work the account has not got: a queued Save, an unsaved draft, or both.
     * A subset of `documentIds`, and the exact set a preflight export needs to write out — the
     * rest of the library is already safe in the cloud and comes back on the next sign-in.
     */
    atRisk: string[];
    /**
     * Song rows this device holds that this build cannot read (a text chart, retired in #1740, or
     * a corrupt row), with their stored bytes. Signing out removes them, and nothing can read them
     * back, so each is also in `documentIds` and `atRisk`, and the export writes `raw` as it is.
     */
    unreadable: Array<{ documentId: string; raw: string }>;
    /** Committed versions still in the outbox, across the whole library. */
    unsentSaves: number;
    /**
     * How many of `unsentSaves` a permanent refusal (#1298) has stranded — a subset, never a
     * separate pile, and it counts a refused head's whole queue rather than only the marked row,
     * because `prepare()` never advances past that head.
     *
     * The preflight has to tell these apart because its two protective offers are not equally true
     * of both: "Sync now" is the move that can empty an ordinary queue before it is discarded, and
     * against a refused head it is a button that provably cannot do anything, since `prepare()`
     * answers `'refused'` for it without sending. Export is the only thing that saves those bytes,
     * and the step has to say so rather than offering a retry that will not run.
     */
    refusedSaves: number;
    /**
     * Collection Saves still in the outbox (#1477) — a star, a song added to a set list, a rename.
     * Counted apart from `unsentSaves` because they are not songs: there is no file to export for
     * one, so the step can only say what signing out discards and offer the sync that sends it.
     */
    unsentCollections: number;
    /** How many of `unsentCollections` sit behind a permanently refused head (`refusedSaves`'s rule). */
    refusedCollections: number;
    /**
     * Unsaved experiments this device kept for account songs, read from the account database's
     * `drafts` store — which since #1299 is where an account chart's unsaved text actually is.
     *
     * Still the loop's half only. A draft whose storage write was REFUSED exists nowhere but the
     * open tab's own memory, and the loop cannot see that; the shell adds it, along with any guest
     * slot left over from before #1299, in `withLocalDrafts` (`app/use-account-exit.ts`). That composition
     * can over-count by one in the narrow case where a retained row and a failed later write both
     * exist for the same song, and that is the safe direction: it offers an export nobody needed,
     * where under-counting destroys work after saying it would not.
     */
    drafts: number;
}

/**
 * One account chart's retained unsaved experiment (#1299), in the shape the shell already renders a
 * guest recovery in (`recoveryFor` in `lib/repository.ts`) — the offer is the SAME offer, so it
 * reuses the same menu, the same message and the same "duplicate it to keep both" advice.
 */
export interface RetainedDraft {
    document: ChartDocument;
    /** The experiment was captured against a different committed revision than the one saved now. */
    conflict: boolean;
}

/**
 * `kept` is a sign-out that did NOT happen: the server never confirmed the revocation, so nothing
 * local was removed and the account is attached again exactly as it was. A device that cleared
 * itself on an unanswered logout would destroy the queue for a session that is still live.
 */
export type SignOutOutcome = 'signed-out' | 'kept';

export interface SyncLoop {
    getSnapshot(): SyncSnapshot;
    /** `useSyncExternalStore`'s contract: returns the unsubscribe function. */
    subscribe(listener: () => void): () => void;
    /** Point the loop at a signed-in owner. Idempotent for an owner already attached. */
    attach(ownerId: string): Promise<void>;
    /**
     * Stop using the account store. Deliberately does NOT switch the stored account or delete
     * anything: removing an account's local data is the sign-out preflight's job (#1269), and a
     * loop that cleared records on every header state change would be a destructive data op
     * nobody asked for. In-flight work is fenced off by the epoch instead.
     */
    detach(): void;
    /** The chart on the stand right now; the download's `isActive` reads it live. */
    setActiveDocument(documentId: string | null): void;
    /** Which document `observation` describes. */
    watch(documentId: string | null): Promise<void>;
    /**
     * Every saved song for this account, paged to the end. A row this build cannot read is left
     * out (`list`'s `unreadable`, #1769): `unreadableSongs` hands those back, and All songs and
     * the home say how many there are.
     *
     * `owner` names the account the caller means, for the one case where the loop cannot derive it
     * — an EXPIRED session's "Sign out on this device" (#1351), which exports from a library whose
     * scope is detached. See `heldScope`: named or not, a claim that does not match the account
     * this device holds is refused rather than answered with somebody else's library.
     */
    listLibrary(owner?: string | null): Promise<SavedSong[]>;
    /**
     * The song rows `listLibrary` cannot hand back — a text chart (#1740) or a corrupt row — with
     * their stored bytes (`AccountSongbook.unreadableSongs`), for an export that must not leave
     * them out. Scoped like `listLibrary`.
     */
    unreadableSongs(owner?: string | null): Promise<Array<{ documentId: string; raw: string }>>;
    /**
     * What the notices' Remove would do now (#1805, `AccountSongbook.unreadableRemoval`): the
     * unreadable songs that would go, and the ones something keeps (a queued Save, or a draft that
     * may be the only copy of its music). Read-only, for the confirm to say before it asks;
     * `removeUnreadable` checks again. Scoped like `unreadableSongs`.
     */
    unreadableRemoval(owner?: string | null): Promise<{ removable: string[]; waiting: string[] }>;
    /**
     * What the songbook home shows (#1441): the Continue song, the most recently opened ones by
     * id and the library's count — never the whole library. The account's own opened-at map and
     * last-opened pointer decide which ids; see `AccountSongbook.home`. Scoped exactly like
     * `listLibrary`.
     */
    homeLibrary(owner?: string | null): Promise<HomeSlice>;
    /**
     * One saved song by id, or null when this account's library does not hold it (#1441) — what
     * opening, renaming or exporting a row reads instead of the whole library. Scoped exactly like
     * `listLibrary`.
     */
    readSong(documentId: string, owner?: string | null): Promise<ChartDocument | null>;
    /**
     * Commit locally and queue that exact version. Does NOT send; the caller triggers a pass.
     *
     * `owner` is the account the CALLER believes this chart belongs to, or null when it makes no
     * claim — a brand-new document, or a guest song being adopted (#1311). A claim that does not
     * match the attached scope is refused with `AccountMismatchError` BEFORE the songbook is
     * touched, so a refused Save writes no record, no outbox operation and no draft. The case:
     * the session expires under account A's chart, "Sign in again" is answered with B's passkey,
     * and a plain Save — or Duplicate, which passes `expected: null` and would therefore
     * succeed — files A's chart content inside B's account.
     */
    save(
        document: ChartDocument,
        expected: number | null,
        owner: string | null,
    ): Promise<SavedSong>;
    /**
     * Retain this writer's unsaved experiment on an account chart (#1299) — the account half of
     * `lib/repository.ts`'s guest `recover`, and emphatically NOT an upload: it writes one row to
     * this device's own `drafts` store and sends nothing. "Automatic recovery retains a writer's
     * unsaved experiment; it never silently uploads it" (`docs/design/ensemble-v2-sync.md`).
     *
     * Deliberately reachable while the SESSION has expired, which is the one thing that separates
     * it from every other call here: expiry pauses uploads and detaches the loop, but it does not
     * change which account this device holds locally, and a draft written nowhere is a draft lost
     * on the next close. See `heldScope`.
     */
    recover(
        document: ChartDocument,
        baseRevision: number | null,
        /**
         * The account the CHART belongs to, captured when it was opened — or null to write it
         * under whichever account this device holds (#1299 patch review P2).
         *
         * Not the same question as "which owner is attached right now", and that is the whole
         * point: a session can expire under an account chart and the musician can answer "Sign in
         * again" with a DIFFERENT passkey. The loop then holds account B while the stand still
         * holds A's song, and the next keystroke would retain A's chart text inside B's database.
         * Named here, compared in `heldScope`, and refused rather than written — with
         * `AccountMismatchError` since #1311, so the shell can tell this refusal from a storage
         * failure without reading the sentence.
         */
        owner: string | null,
    ): Promise<void>;
    /** The newest retained experiment worth offering for one account chart, or null. */
    retainedDraft(documentId: string): Promise<RetainedDraft | null>;
    /**
     * Every LIVE retained experiment for one account chart, newest first — what the song menu's
     * "Older drafts" list offers (#1299 patch review P2). `retainedDraft` is the same read
     * narrowed to the newest row; this is how a SECOND tab's experiment is reachable at all.
     */
    preservedDrafts(
        documentId: string,
    ): Promise<Array<{ document: ChartDocument; capturedAt: string }>>;
    /**
     * The same answer for several documents at once, as the newest local text of each.
     *
     * Read AHEAD of a sign-out or delete-account export rather than during it: those write one file
     * per song inside a single user gesture, and an await between two downloads is how a browser's
     * per-gesture cap starts dropping them.
     *
     * `owner` is `listLibrary`'s, for the same caller: an expired session's export (#1351) needs
     * these bytes most of all, because nothing it finds here will ever reach the account.
     */
    retainedDrafts(
        documentIds: string[],
        owner?: string | null,
    ): Promise<Map<string, ChartDocument>>;
    /**
     * Drop this writer's retained experiment, once a Save has committed what it held.
     *
     * Takes the `owner` for the reason every write here does (#1311 patch): a delete keyed by
     * document id against the WRONG account's `drafts` store is a no-op only while the assumption
     * that it is the wrong account holds. It is a write, so it is fenced like one.
     */
    discardDraft(documentId: string, owner: string | null): Promise<void>;
    /**
     * Drop every writer's, once the chart on the stand is its committed version again — see
     * `AccountSongbook.discardDrafts` for why a revert cannot be a per-writer operation. Fenced
     * on `owner` like `discardDraft`, and for the same reason.
     */
    discardDrafts(documentId: string, owner: string | null): Promise<void>;
    /**
     * Remember which chart this account last had on the stand here (#1299).
     *
     * Fenced on `owner` since #1311: it writes a document id into an account's own `meta`, and an
     * id belonging to somebody else's library there is both a leak of what was open and a Continue
     * card that cannot open anything.
     */
    rememberOpened(documentId: string, owner: string | null): Promise<void>;
    lastOpened(): Promise<string | null>;
    /**
     * Record one song as opened just now (#1440) — the All songs page's per-song counterpart to
     * `rememberOpened`'s single Continue-card pointer. Fenced on `owner` for the same reason every
     * write here is: this is a document id under an account's own `meta`, and one belonging to
     * somebody else's library there is a leak of what this device opened.
     */
    recordOpened(documentId: string, owner: string | null): Promise<void>;
    /** Every song this account has opened here, id to timestamp (#1440). */
    openedAtMap(): Promise<Map<string, string>>;
    /**
     * Every collection this account holds here, each with the songs in it that resolve (#1477) —
     * `AccountSongbook.listCollections`, scoped exactly like `listLibrary`.
     */
    listCollections(owner?: string | null): Promise<CollectionListing[]>;
    /**
     * One collection Save, read-modify-written in one transaction (`AccountSongbook.editCollection`)
     * — a star, "Add to collection…", a new collection, a rename. Commits and queues; it does not
     * send, the caller runs a pass, as after a song Save. Fenced on `owner` like `save`: a star
     * filed in another account's Starred is one person's library edited by another.
     * `CollectionCapError` when it would create a document past the account's cap.
     */
    editCollection(
        documentId: string,
        edit: (current: CollectionDocument | null) => CollectionDocument | null,
        owner: string | null,
    ): Promise<SavedCollection | null>;
    /**
     * How many documents a whole-playlist import may assume this ACCOUNT holds (#1478, review R1)
     * — `heldByAccount` over this device's rows and the verified manifest — or why it cannot be
     * decided yet (`libraryCheck`). What the import states against the cap before it writes.
     * Scoped like `listLibrary`.
     */
    importRoom(
        owner?: string | null,
    ): Promise<{ held: number; unverifiable: number } | { refusal: string }>;
    /**
     * A whole iReal playlist, committed and queued as ONE transaction
     * (`AccountSongbook.importPlaylist`): its songs, then the collection holding them. Fenced on
     * `owner` like `save` — these are nobody's songs until committed, so a caller passes the
     * session's owner. ONE `libraryVersion` and one `collectionsVersion` bump for the whole import,
     * never one per song, and it does not send: the caller runs a pass. `ImportCapError` when the
     * account has no room, and `LibraryUnverifiedError` when this device cannot tell yet
     * (`libraryCheck`) — both with nothing written.
     */
    importPlaylist(
        songs: readonly ChartDocument[],
        collection: {
            documentId: string;
            edit: (current: CollectionDocument | null) => CollectionDocument | null;
        },
        owner: string | null,
        pace?: { shouldYield: () => boolean; yieldNow: () => Promise<void> },
    ): Promise<{ songs: number; collection: SavedCollection | null }>;
    /**
     * Delete one collection (#1477) — never its songs. Local-only exactly when that is the whole
     * truth (`AccountSongbook.deleteCollection`'s `'removed'`); a collection the account holds goes
     * through the same explicit online delete a song does (`deleteFromCloud`), and one with a Save
     * in flight is refused until the outbox settles it.
     */
    deleteCollection(documentId: string, owner: string | null): Promise<CloudDeleteResult>;
    /**
     * Would `deleteCollection` go ahead right now? Null when it would, else the sentence it would
     * refuse with — asked BEFORE a delete removes any song (#1477 review R4), so "still
     * uploading" or a built-in stops it with nothing gone. Writes nothing.
     */
    collectionDeleteRefusal(documentId: string, owner: string | null): Promise<string | null>;
    /**
     * Delete one document from the cloud (#1270): an explicit ONLINE operation with a frozen,
     * retry-safe operation id, never a side effect of removing a local copy. Sends immediately
     * rather than joining the outbox — a delete is a deliberate human act that must report its own
     * outcome, not a queued intention the musician walks away from.
     *
     * `owner` is the account the caller believes this chart belongs to (#1311). A mismatch is
     * reported as an ordinary `refused` result rather than thrown, exactly as this method's other
     * pre-send refusals are — and, like them, it answers before `prepareDelete`, so no operation
     * id is frozen for a request that never left and nothing local moves.
     */
    deleteFromCloud(documentId: string, owner: string | null): Promise<CloudDeleteResult>;
    /**
     * Delete songs from THIS DEVICE for good (#1754): the songs the account no longer holds ("No
     * longer in your account") or never received (`remoteRevision === null`), which a cloud delete
     * cannot remove — it can only answer `retained` again. ONE transaction over every id
     * (`AccountSongbook.purgeLocal`): each id's song row, every writer's draft, its whole outbox
     * queue and its meta rows. Nothing is queued, frozen or sent. An id the account still holds is
     * returned in `held`, untouched. It holds the loop's serialization slot like a pass: it waits
     * until no pass of THIS tab is running, and a pass asked for meanwhile runs after it, so this
     * tab never sends a Save for an id it is deleting. Another TAB's pass is outside that slot:
     * if one sent such a Save mid-purge, its acknowledgement finds no operation and that pass
     * reports a server failure once, and the song can come back on the next download (the
     * account then really holds it). Nothing is lost, and the next pass is clean. Fenced on
     * `owner` like every write; publishes the library and the collections (whose resolved songs
     * shrink) and re-reads the observation, so the candidates and counts follow.
     */
    purgeLocal(
        documentIds: readonly string[],
        owner: string | null,
    ): Promise<{ purged: string[]; held: string[] }>;
    /**
     * Remove songs this build cannot read from THIS DEVICE (#1805), the home's and All songs'
     * "couldn't be read" notices' Remove (`AccountSongbook.removeUnreadable`, ONE transaction). An
     * id with anything queued in the outbox, or a draft that may be the only copy of its music,
     * comes back in `waiting`, untouched: the queue is the only marker of music that has not
     * reached the account, and it is never cut. Local only, and
     * serialized like `purgeLocal`: it takes the loop's one slot, so no pass of this tab is sending
     * while it decides. Publishes the library and re-reads the observation when anything went.
     */
    removeUnreadable(
        documentIds: readonly string[],
        owner: string | null,
    ): Promise<{ removed: string[]; waiting: string[] }>;
    /**
     * Resolve this document's refused Save by keeping both (#1267) — the one way out of a
     * conflicted outbox head, which is otherwise terminal and parks every later Save of that song
     * behind it.
     *
     * Purely local: `AccountSongbook.keepBoth` is one transaction and sends nothing. What follows
     * is the pass it has just made possible — the queue is unblocked and holds a create nobody has
     * sent, and the musician's own act is the trigger, because no timer waits on a conflict.
     *
     * `null` when the queue no longer holds a refused Save. The caller is then a moment stale, not
     * wrong, and the fresh observation published below is the answer.
     *
     * `owner` is the account the caller believes this chart belongs to (#1311). A mismatch is
     * refused with `AccountMismatchError` before the transaction opens: keeping both writes a new
     * local line for the chart on the stand, and under the wrong account that line is one person's
     * music filed in another person's library.
     *
     * The resolution carries `ownerId` — the scope this transaction actually SETTLED TO, not the
     * caller's claim (#1311 patch review R1). The shell re-points the chart on the stand at the
     * new identity and must bind it to the account the line really landed in; deriving that from
     * a render snapshot instead is how a stale `null` owner becomes an unfenced binding.
     */
    keepBoth(
        documentId: string,
        owner: string | null,
    ): Promise<(KeepBothResolution & { ownerId: string }) | null>;
    /**
     * Adopt the remote advance this device preserved beside a held record (#1310) — the mirror of
     * `keepBoth`, and the only other resolution this product offers.
     *
     * Purely local, like `keepBoth`: one transaction, nothing sent. There is nothing to send — the
     * record ends up at a revision the account already holds, which is the whole point of adopting
     * rather than saving over it — so unlike `keepBoth` this does NOT ask for a pass afterwards.
     *
     * `revision` is the one the musician was shown, carried back down as a compare-and-swap base:
     * a download that landed between the banner and the button leaves a candidate for a version
     * nobody has looked at, and committing that would be this resolution answering a question it
     * was never asked. `'stale'` says so; the caller re-reads and shows the new one.
     *
     * `owner` is the account the caller believes this chart belongs to (#1311), refused before the
     * transaction opens exactly as `keepBoth`'s is — this one DESTROYS local work rather than
     * creating a line, so a mismatch here would discard one account's drafts on the strength of
     * another's library. The resolution carries back the scope it settled to for the same reason
     * `keepBoth`'s does: the shell rebinds the chart on the stand from it.
     */
    adoptRemoteVersion(
        documentId: string,
        revision: string,
        owner: string | null,
    ): Promise<(AdoptedRemoteVersion & { ownerId: string }) | 'none' | 'stale' | 'queued'>;
    /**
     * The account this DEVICE holds, read from storage (#1351 patch R1) — `meta.active`, or the
     * attached scope when there is one, which is the same row.
     *
     * A STORAGE fact, deliberately, and the only honest basis for offering "Sign out on this
     * device". The in-memory session state cannot answer it: `expired` exists only in the page
     * load where a live session lapsed, so a RELOAD lands on `guest` (`session.ts` only ever moves
     * a `signedIn` session to `expired`) while every one of that account's rows is still on the
     * disk. Deriving the offer from the session would hide it in precisely the sequence the story
     * is about — the device changes hands and is restarted in between.
     *
     * Null is "this device holds no account", which is the ordinary guest device and pays nothing:
     * one `readonly` transaction, after the first session read has answered, never on the path to
     * first paint.
     */
    heldOwner(): Promise<string | null>;
    /**
     * What signing out would cost (#1269), as far as the ACCOUNT DATABASE can see. A read; it
     * changes nothing and sends nothing. The caller completes `drafts`/`atRisk` with the drafts no
     * store holds — see `SignOutPreflight['drafts']`.
     *
     * `owner` is `listLibrary`'s: the expired session's step (#1351) runs the SAME preflight, off
     * the same stores, with no attached scope to read them through.
     */
    signOutPreflight(owner?: string | null): Promise<SignOutPreflight>;
    /**
     * Sign this device out of the account (#1269, #1351), in the one order that cannot lose work.
     *
     * The FENCE MOVES FIRST — before `revoke` is even called — so a Save reply for this account
     * that arrives after the musician asked to leave finds a generation that no longer matches and
     * commits nothing. Everything else follows from what `revoke` answers: `true` means the server
     * confirmed the session is gone and this device may forget the account; anything else means the
     * sign-out did not happen, and the account is re-attached with everything it had.
     *
     * **One clearing path, three ways of settling the server side.** `revoke` is the whole of that
     * difference, and the ordered local half below never forks: an ordinary sign-out awaits the
     * logout round trip, a deleted account (#1271) resolves `true` because the delete route removed
     * the session itself, and an expired one (#1351) resolves `true` because the session is already
     * dead — nothing to revoke, so the step needs no network at all and works offline.
     *
     * `owner` is `listLibrary`'s, and it is what makes that last case possible: an expired session
     * has no attached scope, so the account being left is named rather than derived. Naming one
     * this device does not hold throws `AccountMismatchError` BEFORE the fence moves, so a refused
     * sign-out clears nothing and moves nothing.
     */
    signOut(revoke: () => Promise<boolean>, owner?: string | null): Promise<SignOutOutcome>;
    /** One outbox + download pass, coalesced: a request during a pass re-runs once after it. */
    run(): Promise<void>;
}
