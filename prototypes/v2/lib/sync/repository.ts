import {
    assertBuiltInKept,
    BuiltInCollectionError,
    isCollectionCandidate,
    MAX_COLLECTION_SONGS,
    mergeSongIds,
    newStarred,
    resolvedSongIds,
    STARRED_COLLECTION_ID,
    starredOf,
} from '../collections';
import {
    HOME_FILL_SPARE,
    type HomeRead,
    type HomeRequest,
    type HomeSlice,
    readable,
    rememberingValidator,
    settleHome,
} from '../home';
import { AccountDatabase, type Transaction } from './database';
import {
    type AccountScope,
    type ChartDocument,
    type CollectionDocument,
    candidateKey,
    candidatePrefix,
    collectionSnapshot,
    type Draft,
    deleteBody,
    deleteReply,
    deletionKey,
    deletionPrefix,
    digest,
    documentKind,
    identifier,
    type LastOpened,
    LocalRevisionError,
    lastOpenedKey,
    localRevision,
    MAX_PENDING_SAVES,
    type OpenedAt,
    openedKey,
    openedPrefix,
    type PendingDeletion,
    type PreparedDelete,
    type PreparedSave,
    type RemoteCandidate,
    type RemoteOutcome,
    remoteRevision,
    reply,
    type SavedCollection,
    type SavedSong,
    type SaveOperation,
    type SaveReceipt,
    type SaveRefusalReason,
    type Star,
    type SyncDocument,
    snapshot,
    starKey,
    starPrefix,
    starsMigratedKey,
    syncDocument,
} from './protocol';
import {
    copyScope,
    remoteOutcome,
    savedCandidate,
    savedCollection,
    savedDeletion,
    savedDraft,
    savedOpenedAt,
    savedOperation,
    savedSong,
    savedStar,
} from './records';

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;
/** The server's per-owner document cap: more candidates than that is a broken store. */
export const MAX_REMOTE_CANDIDATES = 2_000;

export interface ListOptions {
    /** Exclusive cursor: the last document ID of the previous page. */
    afterDocumentId?: string;
    limit?: number;
}

export interface SongPage {
    songs: SavedSong[];
    /** Null at end of list. Never a promise that the next page sees the same library. */
    nextAfterDocumentId: string | null;
}

/** One bounded page of this owner's collections, in `SongPage`'s shape and cursor grammar. */
export interface CollectionPage {
    collections: SavedCollection[];
    /** Null at end of list. Never a promise that the next page sees the same library. */
    nextAfterDocumentId: string | null;
}

/**
 * A collection as a reader shows it (#1474): the stored record, plus the songs in it that resolve
 * on this device right now, in the collection's own order. `document.songIds` is what a Save
 * builds on and is never pruned; `resolvedSongIds` is the view (`resolvedSongIds` in
 * `lib/collections.ts`).
 */
export interface CollectionListing extends SavedCollection {
    resolvedSongIds: string[];
}

/**
 * What a library download observed about one collection (#1474). Narrower than `RemoteOutcome`:
 * there is no `unsupported` kind, because a collection body this build cannot read is reported
 * by the download pass and never stored — see `reconcileCollection`.
 */
export type CollectionOutcome =
    | { kind: 'version'; documentId: string; revision: string; document: CollectionDocument }
    | { kind: 'deleted'; documentId: string; revision: string };

/**
 * `deleteCollection`'s answer. Only `'removed'` changed anything:
 *
 * - `'removed'`: the collection never reached the account and nothing of it can be in flight, so
 *   the local record and its queued Saves are the only copy, and they are gone.
 * - `'cloud'`: the account holds it. Removing it is the explicit online delete — `prepareDelete`,
 *   the request, then `acknowledgeDelete` — exactly as for a song, never a local-only removal.
 * - `'queued'`: a Save of it may already be at the server (its request is frozen). Removing it
 *   locally could orphan a cloud copy this device then re-downloads; the outbox settles it first.
 * - `'missing'`: nothing here by that id.
 */
export type CollectionDeletion = 'removed' | 'cloud' | 'queued' | 'missing';

/**
 * What `reconcile` did. One term per preservation rule, so a caller never has to infer it.
 *
 * `'superseded'` is the one that writes NOTHING (#1310 patch R1). Every other term describes a
 * commit — including `'candidate'`, which stores a row a musician is now offered. A `version`
 * observation whose plan base no longer matches the saved record describes a state this device has
 * left behind, and storing it would put a stale offer in front of somebody: adopting it rolls the
 * song back to an older body and relabels it with an older revision. Revisions are opaque strings,
 * so nothing downstream can order them — the plan base is the only trustworthy signal, and the
 * honest answer to a base that has moved is "this pass was looking at something else". S1's
 * manifest diff re-plans the document against its real revision on the next pass, so nothing is
 * lost by declining to write.
 */
export type ReconcileOutcome =
    | 'advanced'
    | 'candidate'
    | 'superseded'
    | 'unchanged'
    | 'removed'
    | 'retained-deleted'
    | 'unsupported';

/**
 * What `keepBoth` moved (#1267). Returned rather than inferred, because the SHELL has to finish the
 * move: the drafts this transaction re-keys are what a PREVIOUS edit captured, and the experiment
 * live in the editor right now is the shell's — so the chart on the stand has to follow its line to
 * the new identity, and re-retain itself there (#1299), without its content changing.
 *
 * `conflict` is which refusal was resolved, carried through rather than flattened, for the same
 * reason `CloudObservation.conflict` keeps the two apart: `'version'` had a remote version to adopt
 * under the original id and `'gone'` had none — or had one this device already knew was tombstoned
 * — so only one of them leaves a song there afterwards.
 */
export interface KeepBothResolution {
    conflict: 'version' | 'gone';
    /** The fresh identity the local line now lives under. NEVER the id that was refused. */
    documentId: string;
    /**
     * The committed record created under it: the newest local version, at local revision 0, under
     * the marked title. The caller re-points the chart on the stand at this — TITLE INCLUDED, or
     * the stand reads one name while the songbook reads another and the next Save renames it back.
     */
    document: ChartDocument;
    /** The queued create's operation id. NEVER the failed operation's — see `keepBoth`. */
    operationId: string;
    /** The remote version now saved under the original id, or null when the cloud has none. */
    adopted: ChartDocument | null;
}

/**
 * What `adoptRemoteVersion` committed (#1310) — the mirror of `KeepBothResolution`, and far smaller
 * because only one line survives it: there is no fresh identity, no queued create and no second
 * song. The caller still needs all three fields, because the shell re-opens the adopted document on
 * the stand through its ordinary `open()` path and that path is given a document, not an id.
 */
export interface AdoptedRemoteVersion {
    /** The ORIGINAL id. Adoption never mints one — minting one is the other resolution. */
    documentId: string;
    /** The account's version, re-decoded from the preserved candidate rather than handed through. */
    document: ChartDocument;
    /** Its revision, now the record's `remoteRevision`: the record IS that version, so it says so. */
    revision: string;
}

export interface ReconcileOptions {
    /**
     * True when this document is the chart on the stand right now. The caller owns that fact —
     * storage must never reach into UI state to guess which song is playing — and must answer it
     * as this call is made, not from a list captured when its plan was drawn.
     */
    active?: boolean;
    /**
     * The `remoteRevision` the caller's plan was computed against: `undefined` for "there was no
     * saved record", `null` for "a record the cloud had never confirmed", a string for a
     * confirmed one. This is a compare-and-swap base, and it is the ONLY thing that can catch the
     * one dangerous interleaving the re-reads below cannot — a Save queued AND acknowledged while
     * the remote body was in flight, which leaves a record that is clean, unheld, and NEWER than
     * the observation about to be written over it.
     *
     * When it does not match a saved record that exists, a `version` observation is DROPPED and
     * answered `'superseded'` (#1310 patch R1): nothing is written, not even a candidate row.
     * Preserving one used to look like the cautious choice and is the opposite — a candidate is an
     * offer, and an offer built from a base that has moved is an offer to roll the song back to an
     * older body under an older revision label. A tombstone in the same position is still retained
     * and flagged, because "the cloud no longer has this" does not go stale the way a body does.
     *
     * Omitting it therefore ASSERTS that no saved record existed. That default fails closed — with
     * a record present it can only turn an adoption into a no-op, never into a write — so a caller
     * that holds a record must pass its revision or it will simply be told the record moved.
     */
    expectedRemoteRevision?: string | null;
}

/**
 * The whole commit rule for "the cloud no longer has this document", shared by the two callers that
 * can learn it (#1270): a library download reading an explicit tombstone row, and this device's own
 * acknowledged delete. It is one rule because it answers one question — may this device drop its
 * copy? — and a second spelling of it would be the exact place the two paths silently disagreed.
 *
 * Writes through `tx` and returns the outcome; the CALLER owns `tx.finish`, because the download
 * path reaches this from inside a larger decision and the delete path does not.
 */
function commitDeleted(
    // Only the store handles: typed as the one method it uses so a `Transaction<T>` of any result
    // type can be passed without a cast, and so this can never reach for `finish` by accident.
    tx: Pick<Transaction<never>, 'table'>,
    scope: AccountScope,
    documentId: string,
    candidate: () => RemoteCandidate,
    song: SavedSong | null,
    held: boolean,
    expected: string | null | undefined,
): ReconcileOutcome {
    const key = candidateKey(scope.ownerId, documentId);
    if (held || song?.remoteRevision === null) {
        // Local work exists only here: a LIVE draft (`liveDraft`), a queued Save, or the chart on
        // the stand. It stays, and the candidate is the flag that explains why the cloud copy is
        // gone.
        tx.table('meta').put(candidate());
        return 'retained-deleted';
    }
    if (song && song.remoteRevision !== expected) {
        // The record moved under the plan that asked for this removal. Removing it would delete a
        // revision nobody ever diffed — so it stays, flagged like any other divergence.
        tx.table('meta').put(candidate());
        return 'retained-deleted';
    }
    if (!song) {
        // Nothing was ever mirrored here, so there is nothing to remove and nothing to explain.
        // Any candidate left from an earlier pass is stale.
        tx.table('meta').delete(key);
        return 'unchanged';
    }
    // A clean mirror of a document the cloud no longer has. Receipts stay: they are the idempotency
    // record of Saves already acknowledged, and this document has no queued Save left that could
    // resurrect the cloud ID.
    //
    // The frozen delete goes too, and it is the download path that needs this: a tombstone arriving
    // while this device held a prepared delete of its own would otherwise leave a permanent
    // `delete:` row. `prepareDelete` is the only other thing that clears one, and it cannot run for
    // a song that is no longer in the library. The delete path has already forgotten its own row in
    // this same transaction, so there it is a no-op.
    tx.table('songs').delete([scope.ownerId, documentId]);
    tx.table('meta').delete(key);
    tx.table('meta').delete(deletionKey(scope.ownerId, documentId));
    // The opened-at/star preferences go with it too (#1440 review P3), in this SAME transaction:
    // the song has just left the library by both of `commitDeleted`'s callers (this device's own
    // acknowledged delete, or a download adopting another device's tombstone), and a preference
    // row that outlived it would be a leftover with no song left to describe.
    tx.table('meta').delete(openedKey(scope.ownerId, documentId));
    tx.table('meta').delete(starKey(scope.ownerId, documentId));
    return 'removed';
}

/**
 * Read one stored `last-opened` record (#1299), or null for anything this build cannot trust.
 *
 * Re-proves the record against the scope AND its own key, the posture `savedCandidate` and
 * `savedDeletion` take — `meta` is one generic keyed store shared by four namespaces, so the key is
 * part of the record's identity. What differs is the verdict on a bad record: a corrupt preference
 * is simply no preference, because nothing downstream reads it as content.
 */
function storedLastOpened(value: LastOpened | undefined, scope: AccountScope): string | null {
    if (!value || value.ownerId !== scope.ownerId || value.key !== lastOpenedKey(scope.ownerId)) {
        return null;
    }
    try {
        identifier(value.documentId);
        return value.documentId;
    } catch {
        return null;
    }
}

/**
 * Is one stored draft row still an experiment on the version this device has committed (#1299
 * patch review P1)? The same rule `sync-loop.ts`'s `newestDraft` offers a draft under, and guest
 * recovery before it (`recoveryFor` in `lib/repository.ts`): only a row captured at or after the
 * committed version it sits on.
 *
 * It has to be the rule HERE too, because a counted row is what keeps a remote body off this
 * record. A writer id is per PAGE LOAD, and `save()` used to drop only the writer that saved, so
 * an edit, a reload, another edit and a Save left the first page load's row behind forever: every
 * later remote advance became a preserved candidate for the life of the account, the sign-out step
 * announced an unsaved experiment nobody had, and a cloud delete answered `retained`.
 *
 * Two shapes are deliberately LIVE. A row this build cannot read a `capturedAt` off stays
 * protective — unreadable is not the same as superseded, and nothing else holds a copy of it. So
 * does a row for a document with no saved record at all: there is no committed version for it to
 * be older than, and the draft is then the only copy of that music here.
 */
function liveDraft(row: Draft, song: Pick<SavedSong, 'document'> | null): boolean {
    if (!row || typeof row.capturedAt !== 'string') {
        return true;
    }
    return song === null || row.capturedAt >= song.document.updatedAt;
}

/**
 * How many of one document's retained drafts are still live, read through the `song` index inside
 * the caller's transaction. A count of rows rather than `count()` on the index, because the whole
 * point is that a raw row count answers a different question (see `liveDraft`).
 */
function liveDrafts<T>(
    tx: Transaction<T>,
    scope: AccountScope,
    documentId: string,
    song: SavedSong | null,
    consume: (live: number) => void,
) {
    tx.read(tx.table('drafts').index('song').getAll([scope.ownerId, documentId]), (rows: Draft[]) =>
        consume(rows.filter((row) => liveDraft(row, song)).length),
    );
}

/**
 * One document's queued Saves, re-proved and in local-revision order. `decode` is the kind the
 * caller is prepared to hold (`savedOperation`): the chart paths use `operations` below, which
 * refuses anything but a chart exactly as before #1474; the paths that move any document — the
 * outbox's `prepare`/`acknowledge`/`refuse`, `queued` — pass `syncDocument`.
 */
function queueOf<T, D extends SyncDocument>(
    tx: Transaction<T>,
    scope: AccountScope,
    id: string,
    decode: (candidate: unknown) => D,
    consume: (ops: SaveOperation<D>[]) => void,
) {
    tx.read(
        tx
            .table('operations')
            .index('song')
            .getAll([scope.ownerId, id], MAX_PENDING_SAVES + 1),
        (ops: SaveOperation<SyncDocument>[]) => {
            if (ops.length > MAX_PENDING_SAVES) {
                throw new Error('Account queue exceeds the supported limit.');
            }
            consume(
                ops
                    .map((op) => savedOperation(op, scope, id, decode))
                    .sort((a, b) => a.localRevision - b.localRevision),
            );
        },
    );
}

function operations<T>(
    tx: Transaction<T>,
    scope: AccountScope,
    id: string,
    consume: (ops: SaveOperation[]) => void,
) {
    queueOf(tx, scope, id, snapshot, consume);
}

/**
 * `commitDeleted`'s collection half (#1474), shared by the same two callers: a downloaded tombstone
 * (`reconcileCollection`) and this device's own acknowledged delete (`acknowledgeDelete`). Simpler
 * than a chart's because a collection has no drafts and is never "on the stand": the only local
 * work that can exist for it is a queued Save — and no candidate row is written for a held one,
 * because that Save is already the record of the divergence. Sent, it meets the tombstone as a
 * `'gone'` conflict (`acknowledge`), which is where the musician is told.
 */
function commitCollectionDeleted(
    tx: Pick<Transaction<never>, 'table'>,
    scope: AccountScope,
    documentId: string,
    collection: SavedCollection | null,
    held: boolean,
    expected: string | null | undefined,
): ReconcileOutcome {
    if (!collection) {
        return 'unchanged';
    }
    if (held || collection.remoteRevision === null || collection.remoteRevision !== expected) {
        return 'retained-deleted';
    }
    tx.table('collections').delete([scope.ownerId, documentId]);
    tx.table('meta').delete(deletionKey(scope.ownerId, documentId));
    return 'removed';
}

/**
 * The write half of `saveCollection`, inside its transaction: `save`'s queue rules for a chart,
 * restated for a collection's record. A refused head (#1298) retires with everything chained
 * behind it; otherwise the new operation chains onto the newest queued one, or onto the record's
 * confirmed remote revision when nothing is queued.
 */
function enqueueCollection(
    tx: Pick<Transaction<never>, 'table'>,
    scope: AccountScope,
    document: CollectionDocument,
    previous: SavedCollection | null,
    expected: number | null,
    operationId: string,
    queue: SaveOperation<CollectionDocument>[],
): SavedCollection {
    const refusedHead = queue[0]?.status === 'refused' ? queue[0] : null;
    const retired = refusedHead ? queue : [];
    const active = refusedHead ? [] : queue;
    if (active.length >= MAX_PENDING_SAVES) {
        throw new Error('Too many pending Saves for this collection. Sync before saving again.');
    }
    const now = new Date().toISOString();
    const saved = collectionSnapshot({
        ...document,
        revision: expected === null ? 0 : expected + 1,
        createdAt: previous?.document.createdAt ?? now,
        updatedAt: now,
    });
    const record: SavedCollection = {
        ownerId: scope.ownerId,
        documentId: saved.id,
        document: saved,
        remoteRevision: previous?.remoteRevision ?? null,
    };
    const predecessor = active.at(-1);
    for (const stale of retired) {
        tx.table('operations').delete([scope.ownerId, stale.operationId]);
    }
    tx.table('collections').put(record);
    tx.table('operations').add({
        ownerId: scope.ownerId,
        documentId: saved.id,
        operationId,
        localRevision: saved.revision,
        snapshot: saved,
        base: predecessor
            ? { operationId: predecessor.operationId }
            : { revision: record.remoteRevision },
        wireBody: null,
        status: 'queued',
    } satisfies SaveOperation<CollectionDocument>);
    return record;
}

/**
 * One fresh queued Save for a collection record already written in the caller's transaction —
 * `enqueueCollection`'s operation half, for `mergeCollectionConflicts`, which has just retired the
 * id's whole queue and so names its base directly: the remote revision it merged onto, or null for
 * a create under a fresh id. The operation id is minted here, as every other Save's is.
 */
function queueCollectionSave(
    tx: Pick<Transaction<never>, 'table'>,
    scope: AccountScope,
    document: CollectionDocument,
    base: { revision: string | null },
): void {
    if (base.revision !== null) {
        remoteRevision(base.revision);
    }
    tx.table('operations').add({
        ownerId: scope.ownerId,
        documentId: document.id,
        operationId: crypto.randomUUID(),
        localRevision: document.revision,
        snapshot: document,
        base,
        wireBody: null,
        status: 'queued',
    } satisfies SaveOperation<CollectionDocument>);
}

/** How many documents of either kind this owner holds here, read inside the caller's transaction. */
function documentCount<T>(
    tx: Transaction<T>,
    scope: AccountScope,
    consume: (count: number) => void,
) {
    const owned = IDBKeyRange.bound([scope.ownerId], [scope.ownerId, []], false, true);
    tx.read(tx.table('songs').count(owned), (songs: number) => {
        tx.read(tx.table('collections').count(owned), (collections: number) =>
            consume(songs + collections),
        );
    });
}

/**
 * A collection create refused on this device because the account is already at its document cap
 * (#1477). Its sentence is the one a song Save at the cap is answered with (`SYNC_MESSAGES.quota`'s
 * remedy), minus "Saved on this device" — nothing was.
 */
export class CollectionCapError extends Error {
    constructor() {
        super(
            `Your account library is full (${MAX_REMOTE_CANDIDATES} songs and collections). Delete a song in the cloud to make room.`,
        );
    }
}

/**
 * The account cap check a whole-playlist import makes (#1478): null when `documents` more fit
 * beside the `held` documents this device knows the account holds, else the sentence that refuses
 * the import — stating the cap and the usage, because the import writes nothing rather than half a
 * playlist. The count is what this device holds (songs and collections, the server's own unit), so
 * it can miss documents another device added; the server stays the authority, and refuses a Save
 * past its cap on upload. A guest songbook has no cap and never asks.
 */
export function capRefusal(
    documents: number,
    held: number,
    cap = MAX_REMOTE_CANDIDATES,
): string | null {
    if (held + documents <= cap) {
        return null;
    }
    const format = (value: number) => value.toLocaleString('en-US');
    const room = Math.max(0, cap - held);
    return `Your account holds up to ${format(cap)} songs and collections, and it has ${format(held)}. This import adds ${format(documents)}, ${format(held + documents - cap)} more than fit${room > 0 ? ` (there is room for ${format(room)})` : ''}. Nothing has been imported.`;
}

/**
 * A whole-playlist import refused on this device because the account has no room for it (#1478):
 * the import writes nothing rather than half a playlist. Its sentence is `capRefusal`'s;
 * `documents` and `held` are the numbers it was decided on.
 */
export class ImportCapError extends Error {
    readonly documents: number;
    readonly held: number;

    constructor(documents: number, held: number) {
        super(capRefusal(documents, held) ?? 'Your account library is full.');
        this.documents = documents;
        this.held = held;
    }
}

/**
 * The saved record under one id, of whichever kind holds it (#1474): the song when there is one,
 * else the collection, else null. Two reads inside the caller's transaction; a song wins because
 * every chart path that was here before collections asked `songs` alone and must see what it did.
 */
function savedRecord<T>(
    tx: Transaction<T>,
    scope: AccountScope,
    documentId: string,
    consume: (
        record:
            | { kind: 'chart'; saved: SavedSong }
            | { kind: 'collection'; saved: SavedCollection }
            | null,
    ) => void,
) {
    tx.read(tx.table('songs').get([scope.ownerId, documentId]), (song: SavedSong | undefined) => {
        if (song) {
            return consume({ kind: 'chart', saved: savedSong(song, scope, documentId) });
        }
        tx.read(
            tx.table('collections').get([scope.ownerId, documentId]),
            (row: SavedCollection | undefined) => {
                const collection = storedCollection(row, scope, documentId);
                consume(collection ? { kind: 'collection', saved: collection } : null);
            },
        );
    });
}

/** One stored collection row, re-proved, or null. Shared by every collection read below. */
function storedCollection(
    row: SavedCollection | undefined,
    scope: AccountScope,
    documentId: string,
): SavedCollection | null {
    return row ? savedCollection(row, scope, documentId) : null;
}

/**
 * The half of `AccountSongbook.keepBoth` its two routes into a fresh identity share (#1362): mint
 * the local line under `freshDocumentId` from `source`'s bytes and title, as an ordinary queued
 * create (`base: { revision: null }`, local revision 0), and move every retained draft for
 * `documentId` onto it. A row this build cannot validate is left in place rather than moved —
 * preserved, not moved, and never a reason to abort the resolution. `replaced` is the record the
 * drafts were experiments on (null when there was none): a draft live against it (`liveDraft`)
 * stays live against the new line (#1430) — except `sourceWriter`'s, the draft the new line was
 * minted from, whose music the new record now IS.
 *
 * Deliberately does NOT touch the original id — the refused-Save route (adopt the remote version,
 * or drop the id entirely) and the bare-`deleted`-candidate route (always drop it) settle that
 * differently, and folding a third branch in here would be the exact kind of shared code that
 * grows an `if` for every future caller. The caller finishes the transaction.
 *
 * Extracted rather than left duplicated (#1362 patch review P2): the two call sites had drifted
 * once already — the newer one sourced its content without the older one's `liveDraft` filter,
 * which is exactly the class of bug one shared function makes structurally impossible to repeat.
 */
function keepMineAsNewSong(
    tx: Pick<Transaction<never>, 'table'>,
    scope: AccountScope,
    documentId: string,
    freshDocumentId: string,
    operationId: string,
    rows: Draft[],
    source: ChartDocument,
    replaced: Pick<SavedSong, 'document'> | null,
    sourceWriter: string | null,
): ChartDocument {
    const now = new Date().toISOString();
    // `createdAt` is carried: this is the same piece of music under a new identity, not a song
    // written today. `updatedAt` moves, because this IS a new commit and the songbook orders by
    // it. The title is marked, mirroring `save(copy)`'s `— copy`: after a resolution both lines
    // sit in the songbook under the name the musician gave the song, and two rows spelled
    // identically is not a resolution anybody can act on.
    const carried = snapshot({
        ...source,
        id: freshDocumentId,
        title: `${source.title.slice(0, 150)} — kept`,
        revision: 0,
        createdAt: source.createdAt,
        updatedAt: now,
    });
    tx.table('songs').put({
        ownerId: scope.ownerId,
        documentId: freshDocumentId,
        document: carried,
        remoteRevision: null,
    } satisfies SavedSong);
    tx.table('operations').add({
        ownerId: scope.ownerId,
        documentId: freshDocumentId,
        operationId,
        localRevision: carried.revision,
        snapshot: carried,
        base: { revision: null },
        wireBody: null,
        status: 'queued',
    } satisfies SaveOperation);
    const drafts: Draft[] = [];
    for (const row of rows) {
        try {
            const draft = savedDraft(row, scope, documentId);
            drafts.push({
                ...draft,
                documentId: freshDocumentId,
                document: snapshot({ ...draft.document, id: freshDocumentId }),
                // The experiment is unchanged; what it is an experiment ON is the create above,
                // so its base is that revision — always 0, because the create is always a create.
                baseRevision: carried.revision,
            });
        } catch {
            // One row this build cannot validate must not abort the only exit from a terminal
            // conflict. It is left where it is rather than moved or destroyed: unreadable here
            // is not the same as worthless, and nothing else has a copy.
        }
    }
    // The new record's `updatedAt` is now, so a moved draft keeping its own `capturedAt` would
    // read as superseded by it the moment it lands (`liveDraft`) — never offered again, and
    // retired by the next Save (#1430). A draft that was live against the record it replaced is
    // re-stamped to this moment, a millisecond apart in its original order so the newest is
    // still the newest; one already stamped later keeps its own. A superseded one keeps its
    // stamp and stays superseded, and so does the source draft: left live, it would be an
    // "unsaved experiment" identical to the saved record, for the life of the song.
    const restamped = new Map<Draft, string>();
    drafts
        .filter((draft) => draft.writerId !== sourceWriter && liveDraft(draft, replaced))
        .sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : a.capturedAt > b.capturedAt ? 1 : 0))
        .forEach((draft, i) => {
            const at = new Date(Date.parse(now) + i).toISOString();
            restamped.set(draft, draft.capturedAt >= at ? draft.capturedAt : at);
        });
    for (const moved of drafts) {
        tx.table('drafts').delete([scope.ownerId, documentId, moved.writerId]);
        tx.table('drafts').put({
            ...moved,
            capturedAt: restamped.get(moved) ?? moved.capturedAt,
        } satisfies Draft);
    }
    return carried;
}

/** Isolated foundation, not connected to guest UI or an authenticated transport yet. */
export class AccountSongbook {
    private readonly database: AccountDatabase;

    constructor(name?: string) {
        this.database = new AccountDatabase(name);
    }

    close(): Promise<void> {
        return this.database.close();
    }

    /** Explicit host account transition. Does not authenticate, migrate, or delete anything. */
    async switchAccount(ownerId: string | null): Promise<AccountScope | null> {
        if (ownerId !== null) {
            identifier(ownerId);
        }
        return this.database.run('readwrite', null, (tx) => {
            tx.read(tx.table('meta').get('active'), (previous) => {
                const previousGeneration: unknown =
                    previous === undefined ? 0 : previous.generation;
                localRevision(previousGeneration);
                if (previousGeneration === null) {
                    throw new Error('Invalid account generation.');
                }
                const generation = previousGeneration + 1;
                localRevision(generation);
                tx.table('meta').put({ key: 'active', ownerId, generation });
                tx.finish(ownerId === null ? null : { ownerId, generation });
            });
        });
    }

    /**
     * Remove every record this device holds for one account (#1269) — songs, collections (#1474),
     * the outbox and its receipts, drafts, preserved remote candidates, frozen deletions and the `last-opened`
     * preference (#1299). Nothing else is touched:
     * the guest songbook lives in a different database entirely, and another owner's records are
     * outside every range below.
     *
     * **Run deliberately WITHOUT the owner fence, and only ever after it has moved.** The sign-out
     * sequence is `switchAccount(null)` — which bumps the generation, so a late reply for this
     * account can no longer commit anything — and then this. Passing the old scope here would fail
     * that very fence, and passing the new one would not describe these records at all. The owner
     * is instead the explicit bound on every range below, so this can only ever reach the account
     * it was named with. The opened-at and star preferences (#1440) go with the rest: they are
     * per-owner device data exactly like the last-opened pointer, and a device that has forgotten
     * an account must not keep naming that account's songs as starred or recently opened.
     *
     * One transaction: a sign-out that removed the songs and left the outbox behind would leave
     * queued Saves for an account this device no longer holds, and the next sign-in as that same
     * owner would pick them back up.
     */
    async clearAccount(ownerId: string): Promise<void> {
        identifier(ownerId);
        return this.database.run('readwrite', null, (tx) => {
            // The same bound `list` pages with: an array sorts after every string in IndexedDB key
            // order, so `[ownerId, []]` stops at this owner's last record and cannot reach the next
            // owner's. It holds for the two- and three-element key paths alike.
            const owned = IDBKeyRange.bound([ownerId], [ownerId, []], false, true);
            tx.table('songs').delete(owned);
            tx.table('collections').delete(owned);
            tx.table('operations').delete(owned);
            tx.table('receipts').delete(owned);
            tx.table('drafts').delete(owned);
            // `meta` is one generic keyed store, so these are prefix ranges rather than key paths
            // — the same windows `remoteCandidates` reads through. The `'active'` pointer sorts
            // below both prefixes and is never in range: this must not delete the fence it is
            // being run underneath.
            for (const prefix of [
                candidatePrefix(ownerId),
                deletionPrefix(ownerId),
                openedPrefix(ownerId),
                starPrefix(ownerId),
            ]) {
                tx.table('meta').delete(IDBKeyRange.bound(prefix, `${prefix}￿`, false, true));
            }
            // One key rather than a range: there is exactly one per owner (#1299). It names a song
            // that is being removed in this same transaction, so leaving it would point the next
            // sign-in at a chart this device no longer holds.
            tx.table('meta').delete(lastOpenedKey(ownerId));
            // The star copy's marker (#1477), one key per owner: it describes the `star:` rows just
            // removed, and a later sign-in as this owner starts with none to copy.
            tx.table('meta').delete(starsMigratedKey(ownerId));
            tx.finish(undefined);
        });
    }

    async currentScope(): Promise<AccountScope | null> {
        return this.database.run('readonly', null, (tx) => {
            tx.read(tx.table('meta').get('active'), (active) => {
                if (!active?.ownerId) {
                    return tx.finish(null);
                }
                identifier(active.ownerId);
                localRevision(active.generation);
                if (active.generation === null) {
                    throw new Error('Invalid account generation.');
                }
                tx.finish({ ownerId: active.ownerId, generation: active.generation });
            });
        });
    }

    async read(scope: AccountScope, documentId: string): Promise<SavedSong | null> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readonly', scope, (tx) => {
            tx.read(
                tx.table('songs').get([scope.ownerId, documentId]),
                (song: SavedSong | undefined) => {
                    tx.finish(song ? savedSong(song, scope, documentId) : null);
                },
            );
        });
    }

    /**
     * What the songbook home shows, without reading the whole library (#1441) — the account half
     * of `lib/repository.ts`'s guest `home`, over the same owner-bounded key range `list` pages
     * with: this owner's `count()`, the Continue document and the recently opened ones by id, and
     * a bounded cursor fill only when fewer than `request.rows` of those exist. One owner-fenced
     * read-only transaction.
     *
     * A record that does not validate is left out and counted rather than failing the read
     * (`settleHome`) — the posture `openedAtMap` already takes for one corrupt row, and the
     * opposite of `list`, which refuses a page it cannot wholly read. That refusal is still what
     * a full-library read reports; the home page just does not depend on it.
     */
    async home(scope: AccountScope, request: HomeRequest): Promise<HomeSlice> {
        scope = copyScope(scope);
        const owned = IDBKeyRange.bound([scope.ownerId], [scope.ownerId, []], false, true);
        const validate = rememberingValidator((row: SavedSong) => {
            identifier(row?.documentId);
            return savedSong(row, scope, row.documentId).document;
        });
        const read = await this.database.run<HomeRead<SavedSong>>('readonly', scope, (tx) => {
            const songs = tx.table('songs');
            const result: HomeRead<SavedSong> = {
                count: 0,
                continued: undefined,
                recent: [],
                fill: [],
            };
            tx.finish(result);
            tx.read(songs.count(owned), (count: number) => {
                result.count = count;
            });
            if (request.continueId !== null) {
                tx.read(songs.get([scope.ownerId, request.continueId]), (row: SavedSong) => {
                    result.continued = row;
                });
            }
            const found: Array<SavedSong | undefined> = new Array(request.recentIds.length);
            let pending = request.recentIds.length;
            const fill = () => {
                result.recent = found.filter((row) => row !== undefined);
                // Only READABLE opened songs fill a row, as in the guest `home`.
                const wanted =
                    request.rows - result.recent.filter((row) => readable(validate, row)).length;
                if (wanted <= 0) {
                    return;
                }
                const listed = new Set(request.recentIds);
                let good = 0;
                let steps = 0;
                const cursor = songs.openCursor(owned);
                tx.read(cursor, (at: IDBCursorWithValue | null) => {
                    if (!at || good >= wanted || steps >= wanted + HOME_FILL_SPARE) {
                        return;
                    }
                    const row = at.value as SavedSong;
                    if (!listed.has(row?.documentId)) {
                        steps += 1;
                        result.fill.push(row);
                        if (readable(validate, row)) {
                            good += 1;
                        }
                    }
                    at.continue();
                });
            };
            if (pending === 0) {
                fill();
            }
            request.recentIds.forEach((documentId, index) => {
                tx.read(songs.get([scope.ownerId, documentId]), (row: SavedSong | undefined) => {
                    found[index] = row;
                    pending -= 1;
                    if (pending === 0) {
                        fill();
                    }
                });
            });
        });
        return settleHome(read, validate, request.rows);
    }

    async pending(scope: AccountScope, documentId: string): Promise<SaveOperation[]> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readonly', scope, (tx) =>
            operations(tx, scope, documentId, tx.finish),
        );
    }

    /**
     * One document's queued Saves, of EITHER kind (#1474) — what the outbox re-reads, where
     * `pending` is the chart-only read the stand and the sign-out preflight use. Never mixed up:
     * `pending` keeps refusing a collection's queue rather than handing a chart path one.
     */
    async queued(scope: AccountScope, documentId: string): Promise<SaveOperation<SyncDocument>[]> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readonly', scope, (tx) =>
            queueOf(tx, scope, documentId, syncDocument, tx.finish),
        );
    }

    /** One collection's queued Saves (#1474), proved to be a collection's. */
    async pendingCollection(
        scope: AccountScope,
        documentId: string,
    ): Promise<SaveOperation<CollectionDocument>[]> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readonly', scope, (tx) =>
            queueOf(tx, scope, documentId, collectionSnapshot, tx.finish),
        );
    }

    /** One saved collection (#1474), or null. */
    async readCollection(scope: AccountScope, documentId: string): Promise<SavedCollection | null> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readonly', scope, (tx) => {
            tx.read(
                tx.table('collections').get([scope.ownerId, documentId]),
                (row: SavedCollection | undefined) =>
                    tx.finish(storedCollection(row, scope, documentId)),
            );
        });
    }

    /**
     * One bounded page of this owner's collections, ordered by document ID — `list`'s exact
     * contract over the `collections` store (#1474), for the readers that walk the library in id
     * order: the outbox pass and the library download's local diff.
     */
    async collectionPage(scope: AccountScope, options: ListOptions = {}): Promise<CollectionPage> {
        scope = copyScope(scope);
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('Invalid list options.');
        }
        const { afterDocumentId, limit = DEFAULT_LIST_LIMIT } = options;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
            throw new Error(`List limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`);
        }
        if (afterDocumentId !== undefined) {
            identifier(afterDocumentId);
        }
        return this.database.run('readonly', scope, (tx) => {
            // The same owner-tight bounds `list` pages songs with; see it for why.
            const range = IDBKeyRange.bound(
                afterDocumentId === undefined ? [scope.ownerId] : [scope.ownerId, afterDocumentId],
                [scope.ownerId, []],
                afterDocumentId !== undefined,
                true,
            );
            tx.read(tx.table('collections').getAll(range, limit + 1), (rows: SavedCollection[]) => {
                const validated = rows.map((row) => {
                    identifier(row?.documentId);
                    return savedCollection(row, scope, row.documentId);
                });
                const collections = validated.slice(0, limit);
                tx.finish({
                    collections,
                    nextAfterDocumentId:
                        validated.length > limit
                            ? collections[collections.length - 1].documentId
                            : null,
                });
            });
        });
    }

    /**
     * Every collection this owner has here (#1474), in document-ID order, each with the songs in
     * it that resolve on this device. One transaction, so the songs a collection resolves against
     * are the songs this same moment holds.
     *
     * A song id that does not resolve is filtered from `resolvedSongIds` and KEPT in
     * `document.songIds`: a song this device has not downloaded yet is the common case on a fresh
     * device, and a list pruned against a partial download would be uploaded by the next Save of
     * it — losing the musician's order for a song that exists. Deleting a song never rewrites a
     * collection either; an id that no longer resolves is simply not shown.
     *
     * Bounded by the server's per-owner document cap, which collections count toward. Like
     * `list`, a record that does not validate fails the read rather than being skipped.
     */
    async listCollections(scope: AccountScope): Promise<CollectionListing[]> {
        scope = copyScope(scope);
        const owned = IDBKeyRange.bound([scope.ownerId], [scope.ownerId, []], false, true);
        return this.database.run('readonly', scope, (tx) => {
            tx.read(tx.table('songs').getAllKeys(owned), (keys: IDBValidKey[]) => {
                const songs = new Set(keys.map((key) => (key as [string, string])[1]));
                tx.read(
                    tx.table('collections').getAll(owned, MAX_REMOTE_CANDIDATES + 1),
                    (rows: SavedCollection[]) => {
                        if (rows.length > MAX_REMOTE_CANDIDATES) {
                            throw new Error('Account collections exceed the supported limit.');
                        }
                        tx.finish(
                            rows.map((row) => {
                                identifier(row?.documentId);
                                const saved = savedCollection(row, scope, row.documentId);
                                return {
                                    ...saved,
                                    resolvedSongIds: resolvedSongIds(saved.document, (id) =>
                                        songs.has(id),
                                    ),
                                };
                            }),
                        );
                    },
                );
            });
        });
    }

    /**
     * Explicit Save of one collection (#1474): `save`'s contract over the `collections` store, in
     * one transaction — compare the local revision, write the record, queue an immutable
     * operation for the outbox. Every rule `save` states about operation ids, a refused head and
     * the pending-queue bound holds here for the same reasons. There are no drafts to retire: a
     * collection edit IS its Save, nothing about it is an unsaved experiment.
     *
     * An id this owner already uses for a SONG is refused. Ids are unique per owner across kinds
     * (the account holds both in one table), and a collection written over a song's id would be
     * two documents the outbox and the server could no longer tell apart.
     */
    async saveCollection(
        scope: AccountScope,
        candidate: unknown,
        expected: number | null,
    ): Promise<SavedCollection> {
        scope = copyScope(scope);
        const document = collectionSnapshot(candidate);
        localRevision(expected);
        // Always fresh, never caller-supplied — `save` says why.
        const operationId = crypto.randomUUID();
        return this.database.run('readwrite', scope, (tx) => {
            tx.read(
                tx.table('songs').getKey([scope.ownerId, document.id]),
                (song: IDBValidKey | undefined) => {
                    if (song !== undefined) {
                        throw new Error('This id already belongs to a song.');
                    }
                    tx.read(
                        tx.table('collections').get([scope.ownerId, document.id]),
                        (row: SavedCollection | undefined) => {
                            const previous = storedCollection(row, scope, document.id);
                            if (
                                expected === null
                                    ? previous
                                    : previous?.document.revision !== expected
                            ) {
                                throw new LocalRevisionError();
                            }
                            // A built-in stays built in, under its own name (#1477 review R2).
                            assertBuiltInKept(previous?.document ?? null, document);
                            queueOf(tx, scope, document.id, collectionSnapshot, (queue) => {
                                tx.finish(
                                    enqueueCollection(
                                        tx,
                                        scope,
                                        document,
                                        previous,
                                        expected,
                                        operationId,
                                        queue,
                                    ),
                                );
                            });
                        },
                    );
                },
            );
        });
    }

    /**
     * Remove one collection (#1474) — LOCALLY only when that is the whole truth. See
     * `CollectionDeletion` for each answer; the rule is that a local removal is never how a
     * collection the account holds, or may hold, leaves this device:
     *
     * - confirmed by the cloud (`remoteRevision` set): `'cloud'`, nothing touched — the explicit
     *   online delete (`prepareDelete` → request → `acknowledgeDelete`) is the only way, and its
     *   tombstone is what stops another device re-creating it;
     * - never confirmed, but a Save of it is frozen (it may have reached the server with its reply
     *   lost): `'queued'`, nothing touched — the outbox learns which;
     * - never confirmed and nothing frozen: the record and its queued Saves are the only copy that
     *   exists anywhere, and they go together, in one transaction.
     *
     * Deleting a collection never deletes its songs (#1443 decision 3); nothing here reads them.
     * A built-in collection is refused HERE, by storage, with `BuiltInCollectionError` (#1477
     * review R2) — the UI offers no way to ask either, but a tombstone on Starred's fixed id would
     * split Starred across devices, so the rule cannot live only in a caller. A dry run
     * (`options.dryRun`) refuses it the same way.
     */
    async deleteCollection(
        scope: AccountScope,
        documentId: string,
        /**
         * `dryRun`: answer what a delete WOULD do and write nothing (#1477 review R4) — what a
         * delete that first removes songs asks, so a collection that turns out to be still
         * uploading stops the whole thing before a single song is gone.
         */
        options: { dryRun?: boolean } = {},
    ): Promise<CollectionDeletion> {
        scope = copyScope(scope);
        identifier(documentId);
        const dryRun = options.dryRun === true;
        return this.database.run(dryRun ? 'readonly' : 'readwrite', scope, (tx) => {
            tx.read(
                tx.table('collections').get([scope.ownerId, documentId]),
                (row: SavedCollection | undefined) => {
                    const collection = storedCollection(row, scope, documentId);
                    if (!collection) {
                        return tx.finish('missing');
                    }
                    if (collection.document.builtIn) {
                        // Refused by storage, not only by the UI (#1477 review R2): a tombstone on
                        // Starred's fixed id would split it across devices.
                        throw new BuiltInCollectionError('deleted');
                    }
                    queueOf(tx, scope, documentId, collectionSnapshot, (queue) => {
                        if (collection.remoteRevision !== null) {
                            // A confirmed collection with a Save still queued is `'queued'`, not
                            // `'cloud'` (#1477 review P2-1): deleted in the cloud now, the record
                            // would be RETAINED for that Save, which would then meet the tombstone
                            // as a `remote: null` conflict — and `mergeCollectionConflicts` moves
                            // such a list to a fresh id, re-creating the collection the musician
                            // just deleted on every device. The outbox settles the Save first.
                            return tx.finish(queue.length > 0 ? 'queued' : 'cloud');
                        }
                        if (queue.some((operation) => operation.wireBody !== null)) {
                            return tx.finish('queued');
                        }
                        if (dryRun) {
                            return tx.finish('removed');
                        }
                        for (const operation of queue) {
                            tx.table('operations').delete([scope.ownerId, operation.operationId]);
                        }
                        tx.table('collections').delete([scope.ownerId, documentId]);
                        tx.finish('removed');
                    });
                },
            );
        });
    }

    /**
     * Read-modify-write one collection as ONE explicit Save (#1477): `edit` gets the saved document
     * (null when this owner has none by that id) and returns the next one, or null to queue
     * nothing. Everything `saveCollection` does — the cross-kind refusal, the queue rules, the
     * immutable queued operation — happens in the same transaction as the read, so a star toggled
     * twice in quick succession is two Saves in order, never a compare-and-swap the second one
     * loses to the first.
     *
     * A CREATE is refused locally when this device already holds `MAX_REMOTE_CANDIDATES` documents
     * of either kind (#1477 "Starred at the cap"): the server would answer `quota_exceeded`, which
     * ends every outbox pass, so a create that can only be refused is never queued. The count is
     * what this device holds, so it can miss a cap another device filled; the server stays the
     * authority, and its refusal is then surfaced like a song Save's.
     */
    async editCollection(
        scope: AccountScope,
        documentId: string,
        edit: (current: CollectionDocument | null) => CollectionDocument | null,
    ): Promise<SavedCollection | null> {
        scope = copyScope(scope);
        identifier(documentId);
        const operationId = crypto.randomUUID();
        return this.database.run('readwrite', scope, (tx) => {
            tx.read(
                tx.table('songs').getKey([scope.ownerId, documentId]),
                (song: IDBValidKey | undefined) => {
                    if (song !== undefined) {
                        throw new Error('This id already belongs to a song.');
                    }
                    tx.read(
                        tx.table('collections').get([scope.ownerId, documentId]),
                        (row: SavedCollection | undefined) => {
                            const previous = storedCollection(row, scope, documentId);
                            const proposed = edit(previous?.document ?? null);
                            if (proposed === null) {
                                return tx.finish(null);
                            }
                            const document = collectionSnapshot(proposed);
                            if (document.id !== documentId) {
                                throw new Error('A collection edit cannot change its id.');
                            }
                            assertBuiltInKept(previous?.document ?? null, document);
                            const enqueue = () =>
                                queueOf(tx, scope, documentId, collectionSnapshot, (queue) => {
                                    tx.finish(
                                        enqueueCollection(
                                            tx,
                                            scope,
                                            document,
                                            previous,
                                            previous?.document.revision ?? null,
                                            operationId,
                                            queue,
                                        ),
                                    );
                                });
                            if (previous) {
                                return enqueue();
                            }
                            documentCount(tx, scope, (count) => {
                                if (count >= MAX_REMOTE_CANDIDATES) {
                                    throw new CollectionCapError();
                                }
                                enqueue();
                            });
                        },
                    );
                },
            );
        });
    }

    /**
     * How many documents of either kind this owner holds on this device (#1478) — the count a
     * whole-playlist import states against the account cap before it writes anything, and the
     * same count `importPlaylist` and a collection create re-check inside their own transaction.
     */
    async documentCount(scope: AccountScope): Promise<number> {
        scope = copyScope(scope);
        return this.database.run('readonly', scope, (tx) => {
            documentCount(tx, scope, (count) => tx.finish(count));
        });
    }

    /**
     * A whole iReal playlist, imported as ONE transaction (#1478): every song as its own queued
     * create, then the collection that holds them — created, or extended when it already exists.
     * Either all of it is committed and queued, or none of it is: a reload or a closed tab
     * mid-import aborts the transaction, so there is no half-imported playlist to resume and
     * nothing a re-run could duplicate. That is all the resuming this design needs — the
     * DRAIN is the outbox's as it always was: one queued create per song (each song's queue is one
     * deep, far inside `MAX_PENDING_SAVES`, which bounds ONE document's queue), frozen and sent
     * pass by pass, each committed by its own receipt.
     *
     * - **The cap is checked here**, inside the transaction that writes: the songs, plus one when
     *   the collection is new, against `MAX_REMOTE_CANDIDATES` less the documents this device
     *   holds. Past it, `ImportCapError` and nothing is written — a create the server can only
     *   refuse with `quota_exceeded` would end every outbox pass.
     * - **Every song is a create**: an id this owner already holds, of either kind, refuses the
     *   whole import rather than overwriting anything.
     * - **The collection** is `collection.edit`'s answer for what is stored at its id (null when
     *   nothing is), one Save through the same queue rules as `editCollection`.
     *
     * Every document is validated BEFORE the transaction opens (a validation is synchronous and a
     * 1,350-song import's worth would stall the page), handing the event loop back through
     * `pace` between slices when given.
     */
    async importPlaylist(
        scope: AccountScope,
        candidates: readonly unknown[],
        collection: {
            documentId: string;
            edit: (current: CollectionDocument | null) => CollectionDocument | null;
        },
        pace?: { shouldYield: () => boolean; yieldNow: () => Promise<void> },
    ): Promise<{ songs: number; collection: SavedCollection | null }> {
        scope = copyScope(scope);
        identifier(collection.documentId);
        const songs: ChartDocument[] = [];
        for (const candidate of candidates) {
            songs.push(snapshot(candidate));
            if (pace?.shouldYield()) {
                await pace.yieldNow();
            }
        }
        const ids = new Set(songs.map((song) => song.id));
        if (ids.size !== songs.length || ids.has(collection.documentId)) {
            throw new Error('An import cannot use one id twice.');
        }
        // Always fresh, never caller-supplied — `save` says why.
        const operationIds = songs.map(() => crypto.randomUUID());
        const collectionOperationId = crypto.randomUUID();
        return this.database.run('readwrite', scope, (tx) => {
            documentCount(tx, scope, (held) => {
                tx.read(
                    tx.table('songs').getKey([scope.ownerId, collection.documentId]),
                    (song: IDBValidKey | undefined) => {
                        if (song !== undefined) {
                            throw new Error('This id already belongs to a song.');
                        }
                    },
                );
                tx.read(
                    tx.table('collections').get([scope.ownerId, collection.documentId]),
                    (row: SavedCollection | undefined) => {
                        const previous = storedCollection(row, scope, collection.documentId);
                        const needed = songs.length + (previous ? 0 : 1);
                        if (held + needed > MAX_REMOTE_CANDIDATES) {
                            throw new ImportCapError(needed, held);
                        }
                        const now = new Date().toISOString();
                        for (const [index, candidate] of songs.entries()) {
                            const key = [scope.ownerId, candidate.id];
                            tx.read(
                                tx.table('collections').getKey(key),
                                (taken: IDBValidKey | undefined) => {
                                    if (taken !== undefined) {
                                        throw new Error('This id already belongs to a collection.');
                                    }
                                },
                            );
                            // Validated above, before the transaction; a create's own revision
                            // and stamps cannot make a valid document invalid.
                            const saved: ChartDocument = {
                                ...candidate,
                                revision: 0,
                                createdAt: now,
                                updatedAt: now,
                            };
                            // `add`, never `put`: a song this owner already holds refuses the
                            // whole import (a ConstraintError aborts the transaction).
                            tx.table('songs').add({
                                ownerId: scope.ownerId,
                                documentId: saved.id,
                                document: saved,
                                remoteRevision: null,
                            } satisfies SavedSong);
                            tx.table('operations').add({
                                ownerId: scope.ownerId,
                                documentId: saved.id,
                                operationId: operationIds[index],
                                localRevision: 0,
                                snapshot: saved,
                                base: { revision: null },
                                wireBody: null,
                                status: 'queued',
                            } satisfies SaveOperation);
                        }
                        const proposed = collection.edit(previous?.document ?? null);
                        if (proposed === null) {
                            return tx.finish({ songs: songs.length, collection: null });
                        }
                        const document = collectionSnapshot(proposed);
                        if (document.id !== collection.documentId) {
                            throw new Error('A collection edit cannot change its id.');
                        }
                        assertBuiltInKept(previous?.document ?? null, document);
                        queueOf(tx, scope, document.id, collectionSnapshot, (queue) => {
                            tx.finish({
                                songs: songs.length,
                                collection: enqueueCollection(
                                    tx,
                                    scope,
                                    document,
                                    previous,
                                    previous?.document.revision ?? null,
                                    collectionOperationId,
                                    queue,
                                ),
                            });
                        });
                    },
                );
            });
        });
    }

    /**
     * Copy this device's `star:` rows (#1440) into the account's built-in Starred collection, once
     * per device (#1477). For an account that is the union of what THIS device has: the stars are
     * added after whatever Starred already holds (a download from another device, or a star made
     * here since), in the order the rows sort.
     *
     * - **A copy.** The `star:` rows are never removed here, so the migration is reversible; they
     *   become inert. Sign-out still clears them with the rest of the account (`clearAccount`).
     * - **Once.** A `stars-migrated:` marker (`starsMigratedKey`) is written in the SAME transaction
     *   as the Save, so a song unstarred after the copy is never starred again by a later run, and
     *   two tabs migrating at once queue one Save between them.
     * - **Never an empty Starred.** No rows, no Save — the marker alone is written.
     * - **Not at the cap.** A create that `editCollection` would refuse writes nothing at all, not
     *   even the marker, so the copy is tried again on a later load.
     *
     * `'migrated'` when it queued a Save, `'nothing'` when there was nothing to copy, `'done'` when
     * this device had already migrated, `'full'` when the account has no room for a Starred yet.
     */
    async migrateStars(scope: AccountScope): Promise<'migrated' | 'nothing' | 'done' | 'full'> {
        scope = copyScope(scope);
        const operationId = crypto.randomUUID();
        const marker = starsMigratedKey(scope.ownerId);
        return this.database.run('readwrite', scope, (tx) => {
            tx.read(tx.table('meta').get(marker), (done: unknown) => {
                if (done !== undefined) {
                    return tx.finish('done');
                }
                const mark = () =>
                    tx.table('meta').put({
                        key: marker,
                        ownerId: scope.ownerId,
                        migratedAt: new Date().toISOString(),
                    });
                const prefix = starPrefix(scope.ownerId);
                const range = IDBKeyRange.bound(prefix, `${prefix}￿`, false, true);
                tx.read(tx.table('meta').getAll(range), (rows: Star[]) => {
                    const stars: string[] = [];
                    for (const row of rows) {
                        try {
                            stars.push(savedStar(row, scope, row.documentId).documentId);
                        } catch {
                            // `starredIds`' posture: one corrupt row costs only its own star.
                        }
                    }
                    if (stars.length === 0) {
                        mark();
                        return tx.finish('nothing');
                    }
                    const owned = IDBKeyRange.bound(
                        [scope.ownerId],
                        [scope.ownerId, []],
                        false,
                        true,
                    );
                    tx.read(
                        tx.table('collections').getAll(owned, MAX_REMOTE_CANDIDATES + 1),
                        (rows: SavedCollection[]) => {
                            const saved = rows.map((row) => {
                                identifier(row?.documentId);
                                return savedCollection(row, scope, row.documentId);
                            });
                            const previous = starredOf(saved);
                            const target = previous?.documentId ?? STARRED_COLLECTION_ID;
                            const document = previous
                                ? {
                                      ...previous.document,
                                      songIds: mergeSongIds(previous.document.songIds, stars),
                                  }
                                : newStarred(stars.slice(0, MAX_COLLECTION_SONGS));
                            if (
                                previous &&
                                document.songIds.length === previous.document.songIds.length
                            ) {
                                // Every star is already in Starred: nothing to queue.
                                mark();
                                return tx.finish('nothing');
                            }
                            const enqueue = () =>
                                queueOf(tx, scope, target, collectionSnapshot, (queue) => {
                                    enqueueCollection(
                                        tx,
                                        scope,
                                        collectionSnapshot(document),
                                        previous,
                                        previous?.document.revision ?? null,
                                        operationId,
                                        queue,
                                    );
                                    mark();
                                    tx.finish('migrated');
                                });
                            if (previous) {
                                return enqueue();
                            }
                            tx.read(
                                tx.table('songs').getKey([scope.ownerId, target]),
                                (song: IDBValidKey | undefined) => {
                                    if (song !== undefined) {
                                        throw new Error('This id already belongs to a song.');
                                    }
                                    documentCount(tx, scope, (count) => {
                                        if (count >= MAX_REMOTE_CANDIDATES) {
                                            return tx.finish('full');
                                        }
                                        enqueue();
                                    });
                                },
                            );
                        },
                    );
                });
            });
        });
    }

    /**
     * Resolve every collection whose outbox head is a conflict, without asking (#1477, decided on
     * #1443) — the way out a parked collection Save otherwise lacks: new Saves would chain behind
     * it until "Too many pending Saves", a cloud delete would conflict and a download would report
     * it superseded, forever.
     *
     * A collection is never on the stand and has no drafts, so nothing here needs a musician:
     *
     * - **The other side holds a version** (`remote` is a collection): MERGE — `mergeSongIds`, this
     *   device's list first then the remote-only ids — and re-save it ON the remote revision. Every
     *   queued Save for the id retires (they are all superseded by the merge: their bytes are this
     *   record's own history) and one fresh operation is queued with `base: { revision }` the
     *   remote one, so the next send is an ordinary update the server can take. The record keeps
     *   its own name and built-in mark; it is labelled with the remote revision it now builds on.
     * - **The other side has nothing** (`remote: null` — tombstoned by a delete on another device,
     *   or the id is held there as a song): the list moves to a FRESH id as a new collection, the
     *   original id's record and queue go, exactly as Keep both's `'gone'` route keeps a song's
     *   local line (#1267). The musician's collection is kept; it is never merged into nothing.
     *
     * One transaction for every conflicted collection this owner has. Read from the WHOLE outbox
     * of this owner (`operations`, a few rows normally) rather than from every collection's queue,
     * and decided again per id from its own queue, so a head another tab resolved meanwhile is
     * left alone. Returns how many collections it re-queued; the loop sweeps again when non-zero.
     */
    async mergeCollectionConflicts(scope: AccountScope): Promise<number> {
        scope = copyScope(scope);
        const owned = IDBKeyRange.bound([scope.ownerId], [scope.ownerId, []], false, true);
        return this.database.run('readwrite', scope, (tx) => {
            tx.read(tx.table('operations').getAll(owned), (rows: SaveOperation<SyncDocument>[]) => {
                const ids = [
                    ...new Set(
                        rows
                            .filter(
                                (row) =>
                                    row?.status === 'conflict' &&
                                    isCollectionCandidate(row.snapshot),
                            )
                            .map((row) => row.documentId),
                    ),
                ];
                let merged = 0;
                let pending = ids.length;
                if (pending === 0) {
                    return tx.finish(0);
                }
                const settled = () => {
                    pending -= 1;
                    if (pending === 0) {
                        tx.finish(merged);
                    }
                };
                /** Every id this sweep resolves, and the Starreds already merged INTO (C1). */
                const conflicted = new Set(ids);
                const mergedInto = new Set<string>();
                const mergeEach = (starred: Map<string, SavedCollection>) => {
                    for (const documentId of ids) {
                        identifier(documentId);
                        tx.read(
                            tx.table('collections').get([scope.ownerId, documentId]),
                            (row: SavedCollection | undefined) => {
                                const record = storedCollection(row, scope, documentId);
                                queueOf(tx, scope, documentId, collectionSnapshot, (queue) => {
                                    const head = queue[0];
                                    if (!record || head?.status !== 'conflict') {
                                        return settled();
                                    }
                                    const remote = head.remote;
                                    const gone = !(
                                        remote && isCollectionCandidate(remote.document)
                                    );
                                    // A gone Starred merges INTO another Starred — but only one
                                    // this transaction leaves alone (#1477 review C1). A target
                                    // that is itself conflicted in this sweep has its queue
                                    // retired and its record rewritten below; chaining onto it
                                    // from a snapshot read earlier would chain onto a retired
                                    // Save, a `base` no receipt will ever resolve, and wedge the
                                    // outbox for good. So that merge waits, untouched, for the
                                    // next sweep — which the target's own merge here guarantees
                                    // (`merged > 0`) — and reads both afresh then. One merge INTO
                                    // a target per transaction, for the same reason.
                                    const siblings =
                                        gone && record.document.builtIn === 'starred'
                                            ? [...starred.values()].filter(
                                                  (entry) => entry.documentId !== documentId,
                                              )
                                            : [];
                                    const into = siblings.find(
                                        (entry) =>
                                            !conflicted.has(entry.documentId) &&
                                            !mergedInto.has(entry.documentId),
                                    );
                                    if (siblings.length > 0 && !into) {
                                        return settled();
                                    }
                                    for (const operation of queue) {
                                        tx.table('operations').delete([
                                            scope.ownerId,
                                            operation.operationId,
                                        ]);
                                    }
                                    const now = new Date().toISOString();
                                    if (!gone && remote) {
                                        const theirs = collectionSnapshot(remote.document);
                                        const document = collectionSnapshot({
                                            ...record.document,
                                            songIds: mergeSongIds(
                                                record.document.songIds,
                                                theirs.songIds,
                                            ),
                                            revision: record.document.revision + 1,
                                            updatedAt: now,
                                        });
                                        tx.table('collections').put({
                                            ...record,
                                            document,
                                            remoteRevision: remote.revision,
                                        } satisfies SavedCollection);
                                        queueCollectionSave(tx, scope, document, {
                                            revision: remote.revision,
                                        });
                                        if (starred.has(documentId)) {
                                            starred.set(documentId, {
                                                ...record,
                                                document,
                                                remoteRevision: remote.revision,
                                            });
                                        }
                                    } else if (into) {
                                        // The account has no Starred at this id, but this device
                                        // holds another one: its stars go THERE, one Save, and this
                                        // record leaves — never a second Starred beside the first.
                                        mergedInto.add(into.documentId);
                                        tx.table('collections').delete([scope.ownerId, documentId]);
                                        tx.table('meta').delete(
                                            deletionKey(scope.ownerId, documentId),
                                        );
                                        starred.delete(documentId);
                                        queueOf(
                                            tx,
                                            scope,
                                            into.documentId,
                                            collectionSnapshot,
                                            (siblingQueue) => {
                                                const saved = enqueueCollection(
                                                    tx,
                                                    scope,
                                                    collectionSnapshot({
                                                        ...into.document,
                                                        songIds: mergeSongIds(
                                                            into.document.songIds,
                                                            record.document.songIds,
                                                        ),
                                                    }),
                                                    into,
                                                    into.document.revision,
                                                    crypto.randomUUID(),
                                                    siblingQueue,
                                                );
                                                starred.set(into.documentId, saved);
                                                merged += 1;
                                                settled();
                                            },
                                        );
                                        return;
                                    } else {
                                        const fresh = collectionSnapshot({
                                            ...record.document,
                                            id: crypto.randomUUID(),
                                            revision: 0,
                                            createdAt: now,
                                            updatedAt: now,
                                        });
                                        tx.table('collections').delete([scope.ownerId, documentId]);
                                        tx.table('meta').delete(
                                            deletionKey(scope.ownerId, documentId),
                                        );
                                        tx.table('collections').put({
                                            ownerId: scope.ownerId,
                                            documentId: fresh.id,
                                            document: fresh,
                                            remoteRevision: null,
                                        } satisfies SavedCollection);
                                        queueCollectionSave(tx, scope, fresh, { revision: null });
                                        if (starred.has(documentId)) {
                                            starred.delete(documentId);
                                            starred.set(fresh.id, {
                                                ownerId: scope.ownerId,
                                                documentId: fresh.id,
                                                document: fresh,
                                                remoteRevision: null,
                                            });
                                        }
                                    }
                                    merged += 1;
                                    settled();
                                });
                            },
                        );
                    }
                };
                tx.read(
                    tx.table('collections').getAll(owned, MAX_REMOTE_CANDIDATES + 1),
                    (all: SavedCollection[]) => {
                        // Every built-in Starred this owner holds here, kept current as this
                        // transaction writes: a `'gone'` Starred merges INTO another rather than
                        // minting a sibling (#1477 review R2). One unreadable row is skipped here —
                        // it is the per-id read below that decides each merge.
                        const starred = new Map<string, SavedCollection>();
                        for (const row of all) {
                            try {
                                const saved = savedCollection(row, scope, row.documentId);
                                if (saved.document.builtIn === 'starred') {
                                    starred.set(saved.documentId, saved);
                                }
                            } catch {
                                // Not a Starred this merge can build on.
                            }
                        }
                        mergeEach(starred);
                    },
                );
            });
        });
    }

    /**
     * This owner's queued collection Saves (#1477), across every collection: what the sign-out
     * preflight and the sync chip count beside songs, so a collection change is never dropped by a
     * sign-out that said nothing about it. `refused` is the subset stranded behind a refused head
     * (a refused head's whole queue, `signOutPreflight`'s rule for songs).
     */
    async collectionOutbox(scope: AccountScope): Promise<{ unsent: number; refused: number }> {
        scope = copyScope(scope);
        const owned = IDBKeyRange.bound([scope.ownerId], [scope.ownerId, []], false, true);
        return this.database.run('readonly', scope, (tx) => {
            // Only the collections' own queues are read (#1478): after a whole-playlist import the
            // outbox can hold well over a thousand queued SONG Saves, and this runs on every
            // observation — reading every operation's snapshot to find a handful of collection
            // Saves would read the whole import each time.
            tx.read(tx.table('collections').getAllKeys(owned), (keys: IDBValidKey[]) => {
                let unsent = 0;
                let refused = 0;
                let pending = keys.length;
                if (pending === 0) {
                    return tx.finish({ unsent, refused });
                }
                for (const key of keys) {
                    const documentId = (key as [string, string])[1];
                    tx.read(
                        tx.table('operations').index('song').getAll([scope.ownerId, documentId]),
                        (rows: SaveOperation<SyncDocument>[]) => {
                            const queue = rows.filter(
                                (row) => row && isCollectionCandidate(row.snapshot),
                            );
                            unsent += queue.length;
                            const head = queue.sort((a, b) => a.localRevision - b.localRevision)[0];
                            if (head?.status === 'refused') {
                                refused += queue.length;
                            }
                            pending -= 1;
                            if (pending === 0) {
                                tx.finish({ unsent, refused });
                            }
                        },
                    );
                }
            });
        });
    }

    /**
     * How many SONGS this owner has Saves queued for here (#1478) — what the sync chip says is
     * "waiting to upload" when that is more than the chart on the stand, as it is for the whole
     * drain of a playlist import. Counted from the operations index's KEYS alone, never the queued
     * snapshots, so a thousand queued songs cost a key walk, not a thousand documents read.
     */
    async songsWaiting(scope: AccountScope): Promise<number> {
        scope = copyScope(scope);
        const owned = IDBKeyRange.bound([scope.ownerId], [scope.ownerId, []], false, true);
        return this.database.run('readonly', scope, (tx) => {
            tx.read(tx.table('collections').getAllKeys(owned), (keys: IDBValidKey[]) => {
                const collections = new Set(keys.map((key) => (key as [string, string])[1]));
                let songs = 0;
                let last: string | null = null;
                tx.read(
                    tx.table('operations').index('song').openKeyCursor(owned),
                    (cursor: IDBCursor | null) => {
                        if (!cursor) {
                            return tx.finish(songs);
                        }
                        // The index sorts by (owner, document), so one document's queue is a run.
                        const documentId = (cursor.key as [string, string])[1];
                        if (documentId !== last) {
                            last = documentId;
                            if (!collections.has(documentId)) {
                                songs += 1;
                            }
                        }
                        cursor.continue();
                    },
                );
            });
        });
    }

    /**
     * One bounded page of this owner's saved songs, ordered by document ID.
     *
     * The cursor is a local pagination token and never an authorization: the owner fence in
     * `AccountDatabase.run` still decides what this call may see, and the key range below is
     * bounded to the captured owner so another account's records cannot enter the window at
     * all — not even to be filtered out afterwards.
     *
     * A page is transactional. Separate pages are not a historical snapshot: a library that
     * changes between calls is reflected by the later call, which is why the cursor is a
     * document ID rather than an offset.
     */
    async list(scope: AccountScope, options: ListOptions = {}): Promise<SongPage> {
        scope = copyScope(scope);
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('Invalid list options.');
        }
        // Captured synchronously: a caller mutating its options object while IDB awaits
        // cannot retarget the page that is already in flight.
        const { afterDocumentId, limit = DEFAULT_LIST_LIMIT } = options;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
            throw new Error(`List limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`);
        }
        if (afterDocumentId !== undefined) {
            identifier(afterDocumentId);
        }
        return this.database.run('readonly', scope, (tx) => {
            // An array sorts after every string in IndexedDB key order, so [ownerId, []] is a
            // tight upper bound: it stops at this owner's last document and cannot reach the
            // next owner's records. The lower bound is exclusive only when resuming, which is
            // what makes the cursor exclusive without tracking offsets.
            const range = IDBKeyRange.bound(
                afterDocumentId === undefined ? [scope.ownerId] : [scope.ownerId, afterDocumentId],
                [scope.ownerId, []],
                afterDocumentId !== undefined,
                true,
            );
            // limit + 1 detects a further page without a second query and without reading
            // the whole library. getAll yields ascending key order, so the page is stable.
            tx.read(tx.table('songs').getAll(range, limit + 1), (rows: SavedSong[]) => {
                // The whole fetched window is validated, not only the records handed back: a
                // malformed or future-version record must fail the page explicitly rather
                // than be silently skipped or reduced to a partial success.
                const validated = rows.map((row) => {
                    identifier(row?.documentId);
                    return savedSong(row, scope, row.documentId);
                });
                const songs = validated.slice(0, limit);
                tx.finish({
                    songs,
                    nextAfterDocumentId:
                        validated.length > limit ? songs[songs.length - 1].documentId : null,
                });
            });
        });
    }

    async save(
        scope: AccountScope,
        candidate: unknown,
        expected: number | null,
    ): Promise<SavedSong> {
        scope = copyScope(scope);
        const document = snapshot(candidate);
        localRevision(expected);
        // ALWAYS fresh, and never caller-supplied (#1268 patch review P0). A deterministic
        // operation id looks retry-safe and is the opposite: the server's receipts never expire
        // and replay only an EXACT byte match, while the `updatedAt` stamped below moves every
        // call, so the same id re-sent with different bytes earns a permanent
        // `operation_mismatch`. Guest adoption deduplicates on its deterministic DOCUMENT id
        // (`lib/account/adopt-guest.ts`), which the compare-and-put below enforces locally and a
        // server-side `conflict` enforces remotely.
        const operationId = crypto.randomUUID();
        return this.database.run('readwrite', scope, (tx) => {
            // One id space per owner across kinds (#1474 review R1): a song never takes a
            // collection's id, the mirror of `saveCollection`'s check. Requested first, so its
            // callback runs first and its refusal aborts before the song read below acts.
            tx.read(
                tx.table('collections').getKey([scope.ownerId, document.id]),
                (collection: IDBValidKey | undefined) => {
                    if (collection !== undefined) {
                        throw new Error('This id already belongs to a collection.');
                    }
                },
            );
            tx.read(
                tx.table('songs').get([scope.ownerId, document.id]),
                (previous: SavedSong | undefined) => {
                    if (previous) {
                        previous = savedSong(previous, scope, document.id);
                    }
                    if (expected === null ? previous : previous?.document.revision !== expected) {
                        throw new LocalRevisionError();
                    }
                    operations(tx, scope, document.id, (queue) => {
                        // A refused HEAD (#1298) is a verdict on bytes a retry cannot change: the
                        // account has answered about THESE bytes and will answer the same way
                        // forever, so a fresh Save of this same document is a request it has never
                        // seen and deserves to be sent, not parked behind a head `prepare()` will
                        // never advance past.
                        //
                        // The WHOLE queue retires with it, `keepBoth`'s precedent exactly (#1267):
                        // every operation behind a refused head is chained to it by
                        // `base: { operationId }`, and that predecessor is about to stop existing.
                        // Dropping only the head would leave the next operation basing itself on a
                        // deleted one, and `prepare()` would then throw "The preceding Save has no
                        // confirmed receipt." forever — one rejected pass bricking the entire
                        // account's outbox, since `runOutboxPass` rejects rather than stepping over
                        // a storage failure. None of the retired operations was ever committed
                        // (`acknowledge` deletes an operation the moment it is), so the record's
                        // own `remoteRevision` is still the honest base for the new Save, and this
                        // snapshot already carries the newest bytes — the older queued versions
                        // were never anything the account or the musician asked to keep.
                        const refusedHead = queue[0]?.status === 'refused' ? queue[0] : null;
                        const retired = refusedHead ? queue : [];
                        const active = refusedHead ? [] : queue;
                        if (active.length >= MAX_PENDING_SAVES) {
                            throw new Error(
                                'Too many pending Saves for this song. Sync or export before saving again.',
                            );
                        }
                        const now = new Date().toISOString();
                        const saved = snapshot({
                            ...document,
                            revision: expected === null ? 0 : expected + 1,
                            createdAt: previous?.document.createdAt ?? now,
                            updatedAt: now,
                        });
                        const song: SavedSong = {
                            ownerId: scope.ownerId,
                            documentId: saved.id,
                            document: saved,
                            remoteRevision: previous?.remoteRevision ?? null,
                        };
                        const predecessor = active.at(-1);
                        const operation: SaveOperation = {
                            ownerId: scope.ownerId,
                            documentId: saved.id,
                            operationId,
                            localRevision: saved.revision,
                            snapshot: saved,
                            base: predecessor
                                ? { operationId: predecessor.operationId }
                                : { revision: song.remoteRevision },
                            wireBody: null,
                            status: 'queued',
                        };
                        for (const operation of retired) {
                            tx.table('operations').delete([scope.ownerId, operation.operationId]);
                        }
                        tx.table('songs').put(song);
                        tx.table('operations').add(operation);
                        // EVERY writer's superseded rows go with the commit (#1299 patch review
                        // P1), not only the saving writer's. A row captured before the version
                        // just written is one `liveDraft` will never count or offer again, so
                        // leaving it only lets dead rows pile up under a document — one per page
                        // load that ever edited it — for `clearAccount` to find years later.
                        //
                        // Safe across tabs precisely because of that rule: a row another tab is
                        // holding as a LIVE experiment is, by construction, captured at or after
                        // this commit's `updatedAt`, so it is not in the range below. What is in
                        // range is only what nothing would offer a musician again.
                        tx.read(
                            tx.table('drafts').index('song').getAll([scope.ownerId, saved.id]),
                            (rows: Draft[]) => {
                                for (const row of rows) {
                                    if (
                                        typeof row?.capturedAt === 'string' &&
                                        typeof row.writerId === 'string' &&
                                        row.capturedAt < saved.updatedAt
                                    ) {
                                        tx.table('drafts').delete([
                                            scope.ownerId,
                                            saved.id,
                                            row.writerId,
                                        ]);
                                    }
                                }
                                tx.finish(song);
                            },
                        );
                    });
                },
            );
        });
    }

    async recover(
        scope: AccountScope,
        writerId: string,
        candidate: unknown,
        baseRevision: number | null,
    ): Promise<void> {
        scope = copyScope(scope);
        identifier(writerId);
        localRevision(baseRevision);
        const document = snapshot(candidate);
        return this.database.run('readwrite', scope, (tx) => {
            const draft: Draft = {
                ownerId: scope.ownerId,
                documentId: document.id,
                writerId,
                document,
                baseRevision,
                capturedAt: new Date().toISOString(),
            };
            tx.table('drafts').put(draft);
            tx.finish(undefined);
        });
    }

    /**
     * Drop THIS writer's retained draft for one document (#1299) — what a committed Save does with
     * the experiment it has just superseded, and the account half of `clearOwnRecovery`.
     *
     * This writer's row only. Another tab editing the same song is holding its own live experiment,
     * and a Save here has no business discarding it; removing every writer's rows is `clearAccount`'s
     * job, and that only ever runs when the account itself is leaving this device.
     */
    async discardDraft(scope: AccountScope, documentId: string, writerId: string): Promise<void> {
        scope = copyScope(scope);
        identifier(documentId);
        identifier(writerId);
        return this.database.run('readwrite', scope, (tx) => {
            tx.table('drafts').delete([scope.ownerId, documentId, writerId]);
            tx.finish(undefined);
        });
    }

    /**
     * Drop EVERY writer's retained draft for one document — the account's answer to
     * `lib/repository.ts`'s guest `clearRecovery`, and the one thing `discardDraft` cannot do.
     *
     * The shell calls it when the chart on the stand has come back to its committed version
     * ("Revert to saved", or any change that lands on the saved text), and that is a statement
     * about the SONG, not about this page load: the experiment being abandoned was very often
     * captured by an earlier page load — a writer id is minted per load, so the row the chart was
     * recovered FROM is not this writer's — and dropping only this writer's would leave the next
     * open recovering the very edit the musician just reverted away from.
     *
     * A concurrent tab's live experiment goes with it, which is the same trade `clearRecovery`
     * makes: that tab still holds its text and retains it again on its next keystroke.
     */
    async discardDrafts(scope: AccountScope, documentId: string): Promise<void> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readwrite', scope, (tx) => {
            // The writer id is the third key element, so an array upper bound stops at this
            // document's last row and cannot reach the next document's — the same bound
            // `clearAccount` pages an owner with.
            tx.table('drafts').delete(
                IDBKeyRange.bound(
                    [scope.ownerId, documentId],
                    [scope.ownerId, documentId, []],
                    false,
                    true,
                ),
            );
            tx.finish(undefined);
        });
    }

    /**
     * Remember which chart this account had on the stand (#1299) — a preference, never an edit, and
     * the account's own answer to `lib/session.ts`'s guest `rememberSong`.
     */
    async rememberOpened(scope: AccountScope, documentId: string): Promise<void> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readwrite', scope, (tx) => {
            tx.table('meta').put({
                key: lastOpenedKey(scope.ownerId),
                ownerId: scope.ownerId,
                documentId,
            } satisfies LastOpened);
            tx.finish(undefined);
        });
    }

    /**
     * The chart this account last had on the stand here, or null.
     *
     * A record that does not read back cleanly answers null rather than throwing, unlike every
     * other read in this class: this one feeds the songbook's Continue card, and failing the whole
     * library read over a cosmetic preference would turn a stale byte into a broken page. Nothing
     * is written back — the next `rememberOpened` replaces it.
     */
    async lastOpened(scope: AccountScope): Promise<string | null> {
        scope = copyScope(scope);
        return this.database.run('readonly', scope, (tx) => {
            tx.read(
                tx.table('meta').get(lastOpenedKey(scope.ownerId)),
                (value: LastOpened | undefined) => tx.finish(storedLastOpened(value, scope)),
            );
        });
    }

    /**
     * Record this song as opened just now (#1440) — a per-device preference, distinct from
     * `rememberOpened`'s single Continue-card pointer: this is one row per document, and the All
     * songs page's Recently-opened sort/filter reads every one of them, not just the newest.
     *
     * Never a document edit: opening a chart must not bump `updatedAt`/`revision` or queue a Save,
     * and this write touches neither the `songs` table nor the outbox.
     */
    async recordOpened(scope: AccountScope, documentId: string): Promise<void> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readwrite', scope, (tx) => {
            tx.table('meta').put({
                key: openedKey(scope.ownerId, documentId),
                ownerId: scope.ownerId,
                documentId,
                openedAt: new Date().toISOString(),
            } satisfies OpenedAt);
            tx.finish(undefined);
        });
    }

    /**
     * Every song this account has opened on this device, id to timestamp (#1440). The whole
     * prefix range in one read — cheap regardless of library size, since a row here is four
     * scalars, not a chart body; the All songs page's cost is elsewhere (reading `songs` itself).
     */
    async openedAtMap(scope: AccountScope): Promise<Map<string, string>> {
        scope = copyScope(scope);
        return this.database.run('readonly', scope, (tx) => {
            const prefix = openedPrefix(scope.ownerId);
            const range = IDBKeyRange.bound(prefix, `${prefix}￿`, false, true);
            tx.read(tx.table('meta').getAll(range), (rows: OpenedAt[]) => {
                const map = new Map<string, string>();
                for (const row of rows) {
                    try {
                        const valid = savedOpenedAt(row, scope, row.documentId);
                        map.set(valid.documentId, valid.openedAt);
                    } catch {
                        // One corrupt row must not cost every OTHER song its opened-at time
                        // (#1440 review P3) — skip it and keep going, the posture guest
                        // `recoveriesFor` already takes for an unreadable recovery slot.
                    }
                }
                tx.finish(map);
            });
        });
    }

    /**
     * Star or unstar one song on this device — #1440's per-device `star:` row, presence being the
     * whole fact. LEGACY since #1477: stars are the built-in Starred collection now, and nothing in
     * the app writes these rows any more; `migrateStars` copies them once and leaves them. Kept as
     * the one writer of the old shape, which the migration's own tests seed through.
     */
    async setStarred(scope: AccountScope, documentId: string, starred: boolean): Promise<void> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readwrite', scope, (tx) => {
            const key = starKey(scope.ownerId, documentId);
            if (starred) {
                tx.table('meta').put({ key, ownerId: scope.ownerId, documentId } satisfies Star);
            } else {
                tx.table('meta').delete(key);
            }
            tx.finish(undefined);
        });
    }

    /** Every song this account starred on this device under #1440's `star:` rows (legacy, #1477). */
    async starredIds(scope: AccountScope): Promise<Set<string>> {
        scope = copyScope(scope);
        return this.database.run('readonly', scope, (tx) => {
            const prefix = starPrefix(scope.ownerId);
            const range = IDBKeyRange.bound(prefix, `${prefix}￿`, false, true);
            tx.read(tx.table('meta').getAll(range), (rows: Star[]) => {
                const ids = new Set<string>();
                for (const row of rows) {
                    try {
                        ids.add(savedStar(row, scope, row.documentId).documentId);
                    } catch {
                        // One corrupt row must not cost every OTHER song its star (#1440
                        // review P3) — same posture as `openedAtMap` above.
                    }
                }
                tx.finish(ids);
            });
        });
    }

    async drafts(scope: AccountScope, documentId: string): Promise<Draft[]> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readonly', scope, (tx) => {
            tx.read(
                tx.table('drafts').index('song').getAll([scope.ownerId, documentId]),
                (drafts: Draft[]) => {
                    tx.finish(drafts.map((draft) => savedDraft(draft, scope, documentId)));
                },
            );
        });
    }

    async prepare(
        scope: AccountScope,
        documentId: string,
    ): Promise<PreparedSave | 'idle' | 'conflict' | 'refused'> {
        scope = copyScope(scope);
        identifier(documentId);
        // Either kind (#1474): the outbox moves charts and collections alike, through one queue.
        const operation = await this.database.run<
            SaveOperation<SyncDocument> | 'idle' | 'conflict' | 'refused'
        >('readwrite', scope, (tx) => {
            queueOf(tx, scope, documentId, syncDocument, (queue) => {
                const head = queue[0];
                if (!head) {
                    return tx.finish('idle');
                }
                if (head.status === 'conflict') {
                    return tx.finish('conflict');
                }
                if (head.status === 'refused') {
                    return tx.finish('refused');
                }
                if (head.wireBody !== null) {
                    return tx.finish(head);
                }
                const freeze = (revision: string | null) => {
                    if (revision !== null) {
                        remoteRevision(revision);
                    }
                    head.wireBody = JSON.stringify({
                        protocolVersion: 1,
                        ownerId: scope.ownerId,
                        documentId,
                        operationId: head.operationId,
                        expectedRevision: revision,
                        document: syncDocument(head.snapshot),
                    });
                    tx.table('operations').put(head);
                    tx.finish(head);
                };
                if ('revision' in head.base) {
                    return freeze(head.base.revision);
                }
                tx.read(
                    tx.table('receipts').get([scope.ownerId, head.base.operationId]),
                    (receipt: SaveReceipt | undefined) => {
                        if (!receipt || receipt.documentId !== documentId) {
                            throw new Error('The preceding Save has no confirmed receipt.');
                        }
                        freeze(receipt.revision);
                    },
                );
            });
        });
        if (typeof operation === 'string') {
            return operation;
        }
        const body = operation.wireBody!;
        const hash = await digest(body);
        // Crypto runs outside IDB. Recheck the fence before publishing a prepared request.
        await this.database.run('readonly', scope, (tx) => tx.finish(undefined));
        return {
            ownerId: scope.ownerId,
            documentId,
            operationId: operation.operationId,
            body,
            digest: hash,
        };
    }

    async acknowledge(
        scope: AccountScope,
        request: PreparedSave,
        candidate: unknown,
    ): Promise<'committed' | 'conflict'> {
        scope = copyScope(scope);
        request = { ...request };
        if (request.ownerId !== scope.ownerId || (await digest(request.body)) !== request.digest) {
            throw new Error('Invalid prepared Save.');
        }
        const response = reply(candidate, request);
        return this.database.run('readwrite', scope, (tx) => {
            tx.read(
                tx.table('operations').get([scope.ownerId, request.operationId]),
                (stored: SaveOperation<SyncDocument> | undefined) => {
                    if (!stored) {
                        tx.read(
                            tx.table('receipts').get([scope.ownerId, request.operationId]),
                            (receipt: SaveReceipt | undefined) => {
                                if (
                                    response.kind !== 'committed' ||
                                    !receipt ||
                                    receipt.digest !== request.digest ||
                                    receipt.revision !== response.revision ||
                                    receipt.documentId !== request.documentId
                                ) {
                                    throw new Error('No matching committed Save receipt.');
                                }
                                tx.finish('committed');
                            },
                        );
                        return;
                    }
                    // Either kind (#1474), and the kind decides which store the acknowledgement
                    // lands in: a collection's record is in `collections`, a chart's in `songs`.
                    const operation = savedOperation(
                        stored,
                        scope,
                        request.documentId,
                        syncDocument,
                    );
                    const kind = documentKind(operation.snapshot);
                    if (
                        operation.wireBody !== request.body ||
                        operation.documentId !== request.documentId
                    ) {
                        throw new Error('Save acknowledgement does not match stored bytes.');
                    }
                    if (operation.status === 'conflict') {
                        if (response.kind !== 'conflict') {
                            throw new Error('This Save needs conflict resolution.');
                        }
                        return tx.finish('conflict');
                    }
                    if (response.kind === 'conflict') {
                        // `reply()` accepts a remote of either kind; only one of the operation's
                        // own kind may be preserved beside it. Another kind under this id is not
                        // a version of this document at all — the account holds the id as the
                        // other kind — so it is parked exactly as a missing document is, with NO
                        // remote (#1474 review R1). Throwing here instead would leave the head
                        // queued, re-sent and rejected on every pass, and since a storage-side
                        // throw ends the drain, every document after this id would never upload.
                        // The current server never sends one (`commitSave` answers a cross-kind
                        // write with `remote: null`); this is the defence for one that did.
                        const remote =
                            response.remote !== null &&
                            documentKind(response.remote.document) !== kind
                                ? null
                                : response.remote;
                        operation.status = 'conflict';
                        operation.remote = remote;
                        tx.table('operations').put(operation);
                        return tx.finish('conflict');
                    }
                    const table = kind === 'collection' ? 'collections' : 'songs';
                    tx.read(
                        tx.table(table).get([scope.ownerId, request.documentId]),
                        (row: SavedSong | SavedCollection | undefined) => {
                            if (!row) {
                                throw new Error(
                                    'Saved song missing; acknowledgement was not applied.',
                                );
                            }
                            const record =
                                kind === 'collection'
                                    ? savedCollection(
                                          row as SavedCollection,
                                          scope,
                                          request.documentId,
                                      )
                                    : savedSong(row as SavedSong, scope, request.documentId);
                            // Do not replace the document: it may already hold a newer local Save.
                            tx.table(table).put({ ...record, remoteRevision: response.revision });
                            tx.table('receipts').add({
                                ownerId: scope.ownerId,
                                documentId: request.documentId,
                                operationId: request.operationId,
                                digest: request.digest,
                                revision: response.revision,
                            } satisfies SaveReceipt);
                            tx.table('operations').delete([scope.ownerId, request.operationId]);
                            tx.finish('committed');
                        },
                    );
                },
            );
        });
    }

    /**
     * Persist that the queued Save at the head of this document's outbox has been permanently
     * refused by the account (#1298) — the durable half of `sync-loop.ts`'s step-over: a 413, an
     * `operation_mismatch` or a `not_found` is a verdict on THESE bytes that no retry can change,
     * unlike `acknowledge`'s `'conflict'` write for a two-sided version disagreement.
     *
     * Same posture as `acknowledge`'s conflict write: the row is never removed, so `prepare()`
     * answers `'refused'` for this document from here on and sends nothing further for it, while
     * every OTHER document's queue keeps moving (`drain`'s step-over in `sync-loop.ts`). The one
     * way out is a fresh Save of this same document — `save()` retires a refused head, and the
     * whole queue chained behind it, the moment a new op is enqueued for its id — or
     * `save(copy)`'s fresh identity.
     *
     * Marks the operation the transport actually refused — `operationId`, not merely "whatever is
     * the head now". The two are usually the same row, but not always: this account's outbox is
     * shared by every open tab, so another tab can commit the head and the musician can queue a
     * fresh Save behind it while this tab's rejected request is still unwinding. Marking by
     * position would then permanently refuse an operation that was NEVER SENT, and the only way
     * out of that is a Save the musician has no reason to know they need to make.
     *
     * `'none'` when that operation is no longer a plain queued Save at the head — already
     * committed, already resolved a different way, or overtaken. The caller's own capture is then
     * a moment stale, and stepping over the document by its already-known id is still correct
     * either way.
     */
    async refuse(
        scope: AccountScope,
        documentId: string,
        operationId: string,
        reason: SaveRefusalReason,
    ): Promise<'refused' | 'none'> {
        scope = copyScope(scope);
        identifier(documentId);
        identifier(operationId);
        return this.database.run('readwrite', scope, (tx) => {
            // Either kind (#1474): the step-over is about the outbox head, whatever it holds.
            queueOf(tx, scope, documentId, syncDocument, (queue) => {
                const head = queue[0];
                if (head?.status !== 'queued' || head.operationId !== operationId) {
                    return tx.finish('none');
                }
                const refused: SaveOperation<SyncDocument> = { ...head, status: 'refused', reason };
                tx.table('operations').put(refused);
                tx.finish('refused');
            });
        });
    }

    /**
     * Resolve a refused Save by KEEPING BOTH (#1267) — the one way out of a conflicted outbox head,
     * and the only resolution this product offers. No merge, no "overwrite theirs".
     *
     * `acknowledge` parks a refused Save as `status: 'conflict'` with the remote version beside it,
     * and `prepare()` answers `'conflict'` for that document forever after: the row is never
     * removed, so every later Save of that song queues behind it. Nothing else clears that state.
     *
     * One transaction, because the two halves are one decision. It:
     *
     * - writes the LOCAL LINE under a fresh `crypto.randomUUID()` document id, as an ordinary
     *   create (`base: { revision: null }`, local revision 0). Its content is the newest queued
     *   Save's bytes — which is also what the saved record holds, since `save()` advances both
     *   together and a held record is never advanced by a download — under a marked title, so the
     *   two lines a `version` refusal leaves in the songbook can be told apart;
     * - retires EVERY queued Save for the failed id. Only the newest bytes matter: replaying the
     *   older ones under the new id would upload a version history nobody asked for, and leaving
     *   them would leave the queue parked exactly as it was;
     * - moves this account's drafts for that id onto the new one, so an unsaved experiment follows
     *   the line it belongs to rather than the identity the cloud kept. A row this build cannot
     *   validate is left in place instead: preserved, not moved, and never a reason to abort;
     * - and then settles the ORIGINAL id. `'version'`: the preserved remote version becomes the
     *   saved record, labelled with its own `remoteRevision`, so it reads as cloud-confirmed
     *   because it is. `'gone'`: the account has no such document — tombstoned (#1270) or never
     *   there (#1268's adoption after a delete) — so the local record is dropped along with its
     *   frozen delete, because there is nothing up there for that id to be a mirror of.
     *
     * **The failed operation id is never reused**, and neither is the failed document id. Both are
     * spent: the server's receipts never expire and replay only an EXACT byte match, so the id is
     * bound to the request it was refused for, and a create under the old document id would be
     * refused again by the same revision check. The fresh pair is a request the account has never
     * seen — the same reasoning `save()` states for always minting an operation id.
     *
     * A preserved remote CANDIDATE for the original id is read before either settlement, and it
     * can decide it. A `'deleted'` one — a tombstone a download saw but could not apply, because
     * this device held the record — outranks whatever version the refusal carried: that id is gone
     * from the account, so adopting `remote` would resurrect a deleted song until the next download
     * removed it again. A `'version'` or `'deleted'` candidate then goes with the settlement it
     * described; if a download had already observed a NEWER revision than the one being adopted,
     * dropping it loses nothing — the record is labelled with the revision it actually holds, and
     * the next download diffs the manifest against exactly that and advances it. Choosing between
     * two opaque revision strings here would be a guess. An `'unsupported'` candidate is NOT a
     * divergence this call settles: it is the only copy this device has of a body it cannot read,
     * so it survives untouched.
     *
     * `'none'` when the queue holds no refused Save: whoever was looking at the banner is a moment
     * stale, and reporting that is better than inventing a resolution.
     *
     * **One more shape resolves here, with an EMPTY queue (#1362).** A bare `'deleted'` candidate —
     * the account tombstoned this id while a live draft or the chart merely open on the stand held
     * it, with nothing ever queued to refuse — is the one case besides a refused Save this call
     * still settles: it mints the same fresh-id/marked-title line (`keepMineAsNewSong`, shared with
     * the refused-Save route below) and drops the original the same way that route's `'gone'`
     * branch does. There is no queue here, so the content it carries is the newest LIVE draft —
     * `liveDraft`'s own rule, the same one a candidate row's very existence already depended on —
     * when one exists (an unsaved experiment is what "Keep mine" means; a STALE row older than the
     * saved record is not eligible as the source, or this would silently carry OLDER music forward
     * while deleting the newer saved record in the same transaction), and the saved record
     * otherwise (a chart merely left open, with nothing typed). With no saved record at all
     * (`commitDeleted` can hold one on a live draft alone), the newest live draft is the only
     * possible source — `liveDraft` counts every draft as live against a null record — and `'none'`
     * only when there is truly nothing to keep. A non-empty queue with nothing refused in it is
     * untouched by this addition and answers `'none'` exactly as before, because that song has an
     * ordinary Save still in flight, which a pass — not this resolution — is what settles it.
     */
    async keepBoth(scope: AccountScope, documentId: string): Promise<KeepBothResolution | 'none'> {
        scope = copyScope(scope);
        identifier(documentId);
        // Minted before the transaction opens, like `save()`'s: `crypto.randomUUID` is not
        // something to reach for from inside an IDB callback, and neither value depends on a read.
        const freshDocumentId = crypto.randomUUID();
        const operationId = crypto.randomUUID();
        return this.database.run('readwrite', scope, (tx) => {
            tx.read(
                tx.table('drafts').index('song').getAll([scope.ownerId, documentId]),
                (rows: Draft[]) => {
                    operations(tx, scope, documentId, (queue) => {
                        // The same read `observe()` makes: the queue is sorted by local revision,
                        // so the first refused operation is the head the outbox is actually stuck
                        // on.
                        const refused = queue.find((operation) => operation.status === 'conflict');
                        if (!refused) {
                            // #1362 — the one case an EMPTY queue can still resolve here: a bare
                            // `'deleted'` candidate, the account tombstoned this id while a live
                            // draft or the chart merely open on the stand held it, and nothing was
                            // ever queued to refuse. The stand's banner offers the same "Keep mine
                            // as a new song" action for it as for a refused `'gone'` conflict, and
                            // this is what makes that button do something rather than silently
                            // finding no refused head. A non-empty queue with nothing refused in it
                            // is left exactly as before — an ordinary Save still in flight, which a
                            // pass resolves on its own.
                            if (queue.length > 0) {
                                return tx.finish('none');
                            }
                            tx.read(
                                tx.table('meta').get(candidateKey(scope.ownerId, documentId)),
                                (row: RemoteCandidate | undefined) => {
                                    let candidate: RemoteCandidate | null = null;
                                    try {
                                        candidate = row
                                            ? savedCandidate(row, scope, documentId)
                                            : null;
                                    } catch {
                                        candidate = null;
                                    }
                                    if (candidate?.kind !== 'deleted') {
                                        return tx.finish('none');
                                    }
                                    tx.read(
                                        tx.table('songs').get([scope.ownerId, documentId]),
                                        (savedRow: SavedSong | undefined) => {
                                            // No saved record is a real shape here — `commitDeleted`
                                            // can hold a candidate on a live draft alone (#1362
                                            // patch review P2) — so this is `null`, never a reason
                                            // to bail before the draft search below has a chance.
                                            let song: SavedSong | null = null;
                                            if (savedRow) {
                                                try {
                                                    song = savedSong(savedRow, scope, documentId);
                                                } catch {
                                                    // An unreadable record is not a verdict: with
                                                    // it null every draft would read as live, even
                                                    // one it supersedes, and settling here would
                                                    // drop the candidate that explains the row.
                                                    // Leave everything as it is.
                                                    return tx.finish('none');
                                                }
                                            }
                                            // There is no queue here, so the source is not a queue
                                            // tail — it is the newest LIVE draft (#1362 patch
                                            // review P1: `liveDraft` decides eligibility, not
                                            // merely `capturedAt` order. A row captured BEFORE the
                                            // saved record's own `updatedAt` is superseded BY that
                                            // record, and picking it while deleting the newer
                                            // saved record in the same transaction would silently
                                            // carry OLDER music forward and lose the current one).
                                            // With no saved record at all, `liveDraft` counts every
                                            // draft as live, so this is also the only route to a
                                            // source in that shape.
                                            let newestDraft: Draft | null = null;
                                            for (const row of rows) {
                                                let draft: Draft;
                                                try {
                                                    draft = savedDraft(row, scope, documentId);
                                                } catch {
                                                    // Left where it is; the move loop inside
                                                    // `keepMineAsNewSong` decides the same row's
                                                    // fate again.
                                                    continue;
                                                }
                                                if (!liveDraft(draft, song)) {
                                                    continue;
                                                }
                                                if (
                                                    !newestDraft ||
                                                    draft.capturedAt > newestDraft.capturedAt
                                                ) {
                                                    newestDraft = draft;
                                                }
                                            }
                                            const source =
                                                newestDraft?.document ?? song?.document ?? null;
                                            if (!source) {
                                                // No saved record AND no live draft: there is
                                                // truly nothing here to keep. The offer was a
                                                // moment stale, exactly like the ordinary `'none'`
                                                // above.
                                                return tx.finish('none');
                                            }
                                            const carried = keepMineAsNewSong(
                                                tx,
                                                scope,
                                                documentId,
                                                freshDocumentId,
                                                operationId,
                                                rows,
                                                source,
                                                song,
                                                newestDraft?.writerId ?? null,
                                            );
                                            // The candidate row described this divergence, and it
                                            // is settled either way.
                                            tx.table('meta').delete(
                                                candidateKey(scope.ownerId, documentId),
                                            );
                                            if (song) {
                                                // Nothing up there to mirror: the candidate IS the
                                                // tombstone. Same cleanup as the refused `'gone'`
                                                // branch below. Deleting a key that was never
                                                // written — no saved record existed — is a safe
                                                // no-op.
                                                tx.table('songs').delete([
                                                    scope.ownerId,
                                                    documentId,
                                                ]);
                                                tx.table('meta').delete(
                                                    deletionKey(scope.ownerId, documentId),
                                                );
                                            }
                                            tx.finish({
                                                conflict: 'gone',
                                                documentId: freshDocumentId,
                                                document: carried,
                                                operationId,
                                                adopted: null,
                                            });
                                        },
                                    );
                                },
                            );
                            return;
                        }
                        // `refused` came out of this queue, so it is not empty, and `operations()`
                        // sorted it — the last entry is the newest bytes this device committed.
                        // That is also what the saved record holds, since `save()` advances both
                        // together and a held record is never advanced by a download.
                        const latest = queue[queue.length - 1].snapshot;
                        tx.read(
                            tx.table('meta').get(candidateKey(scope.ownerId, documentId)),
                            (row: RemoteCandidate | undefined) => {
                                let candidate: RemoteCandidate | null = null;
                                try {
                                    candidate = row ? savedCandidate(row, scope, documentId) : null;
                                } catch {
                                    // An unreadable observation must not be the thing that keeps
                                    // this account in a terminal conflict — this call is the only
                                    // way out of one. It stays exactly where it is, and is read
                                    // below as saying nothing about the id.
                                }
                                for (const operation of queue) {
                                    tx.table('operations').delete([
                                        scope.ownerId,
                                        operation.operationId,
                                    ]);
                                }
                                const carried = keepMineAsNewSong(
                                    tx,
                                    scope,
                                    documentId,
                                    freshDocumentId,
                                    operationId,
                                    rows,
                                    latest,
                                    // `save()` advances the saved record with the queue, so
                                    // its newest entry is the record the drafts were read against.
                                    { document: latest },
                                    null,
                                );
                                // A `version` or `deleted` observation described a divergence this
                                // call has just settled. An `unsupported` one did not: it is this
                                // device's only copy of a body it cannot read, and it is a fact
                                // about the cloud's document, not about the refusal.
                                if (
                                    candidate?.kind === 'version' ||
                                    candidate?.kind === 'deleted'
                                ) {
                                    tx.table('meta').delete(
                                        candidateKey(scope.ownerId, documentId),
                                    );
                                }
                                // A tombstone this device has already observed outranks the
                                // version the refusal carried: the account does not hold that id
                                // at all any more, so adopting `remote` would put a song back
                                // that the cloud has deleted — visibly, until the next download
                                // removed it again.
                                if (!refused.remote || candidate?.kind === 'deleted') {
                                    // Nothing up there to mirror. The frozen delete goes with the
                                    // record for the reason `commitDeleted` states: nothing else
                                    // clears one for a song that has left the library.
                                    tx.table('songs').delete([scope.ownerId, documentId]);
                                    tx.table('meta').delete(deletionKey(scope.ownerId, documentId));
                                    return tx.finish({
                                        conflict: 'gone',
                                        documentId: freshDocumentId,
                                        document: carried,
                                        operationId,
                                        adopted: null,
                                    });
                                }
                                // Re-decoded rather than taken from the stored record: `savedOperation`
                                // proves a conflict's remote body validates and matches its id, but
                                // hands back the raw value it was given.
                                const adopted = snapshot(refused.remote.document);
                                tx.table('songs').put({
                                    ownerId: scope.ownerId,
                                    documentId,
                                    document: adopted,
                                    remoteRevision: refused.remote.revision,
                                } satisfies SavedSong);
                                tx.finish({
                                    conflict: 'version',
                                    documentId: freshDocumentId,
                                    document: carried,
                                    operationId,
                                    adopted,
                                });
                            },
                        );
                    });
                },
            );
        });
    }

    /**
     * Adopt a preserved remote candidate under the ORIGINAL id, discarding this device's unsaved
     * work for that song (#1310) — the mirror of `keepBoth`, and the reconciliation half the
     * contract's "dirty records receive a separate remote candidate for reconciliation" has never
     * had. `keepBoth` keeps this device's line and gives the account's version the original id;
     * this keeps the account's version and gives up the line. There is no third option: no merge,
     * and no wall-clock winner.
     *
     * ONE transaction, because the four writes are one decision. The saved record becomes the
     * candidate's document labelled with the candidate's own revision — so it reads as
     * cloud-confirmed because it is — every draft for that id goes, and the candidate row goes with
     * the divergence it described. A partial commit would be the worst of both: a record claiming a
     * revision it does not hold, or a candidate still flagging a divergence that has been settled.
     *
     * **The candidate is re-proved inside the transaction and compare-and-swapped against the
     * revision the musician was shown.** `savedCandidate` re-reads it against this scope and its own
     * key, and `expectedRevision` is what makes this safe to interleave with a download: a pass that
     * landed between the banner being read and this button being pressed leaves a candidate for a
     * NEWER revision, and adopting that one would commit a version nobody ever looked at. It answers
     * `'stale'` instead, and the caller shows the new one. `'none'` covers every way the divergence
     * stopped existing — the pass advanced the record, another tab resolved it, the candidate is a
     * `deleted` or `unsupported` one (neither is adoptable, and neither is this call's business), or
     * the row will not validate. It also covers the row that never described one: the saved record
     * is re-read here, and a candidate whose revision the record ALREADY holds is deleted rather
     * than adopted (#1310 patch R1). `reconcile` no longer writes such a row, but a device that ran
     * an earlier build can be holding one, and nothing else would ever clear it.
     *
     * **A document with ANYTHING in its outbox answers `'queued'`, and that is a deliberate
     * narrowing.** The work this resolution destroys must be work the musician never committed. A
     * queued Save is the opposite — an explicit version of their own that the account has not taken
     * yet — and retiring that queue (which the `base` chain would require in full, `keepBoth`'s and
     * `save()`'s precedent) would throw away committed versions to resolve a disagreement the
     * musician has another exit from: the queued Save is refused as a conflict on its next pass, and
     * `keepBoth` resolves it without losing a note. So this call refuses rather than widens.
     *
     * Every writer's drafts go, not only the caller's — `discardDrafts`' rule, for `discardDrafts`'
     * reason: the row the chart was recovered from usually belongs to an earlier page load, and
     * leaving it would recover the very experiment this adoption discarded on the next open. A
     * concurrent tab's live experiment goes with it, which is the same trade a revert makes.
     *
     * A frozen delete (#1270) is deliberately left where it is. A `version` candidate is evidence
     * that the cloud still HOLDS this id, so the delete this device froze has not been committed at
     * that revision; its `expectedRevision` is simply stale now, and the account answers a retry of
     * it with the 409 that drops the frozen id through `acknowledgeDelete`. Clearing it here would
     * be this call reaching into an operation it is not about.
     */
    async adoptRemoteVersion(
        scope: AccountScope,
        documentId: string,
        expectedRevision: string,
    ): Promise<AdoptedRemoteVersion | 'none' | 'stale' | 'queued'> {
        scope = copyScope(scope);
        identifier(documentId);
        remoteRevision(expectedRevision);
        return this.database.run('readwrite', scope, (tx) => {
            const key = candidateKey(scope.ownerId, documentId);
            tx.read(tx.table('meta').get(key), (row: RemoteCandidate | undefined) => {
                let stored: RemoteCandidate | null = null;
                try {
                    stored = row ? savedCandidate(row, scope, documentId) : null;
                } catch {
                    // An observation this build cannot read is not one it may adopt. It stays
                    // exactly where it is: preserved, like every other unreadable record here.
                    stored = null;
                }
                if (stored?.kind !== 'version') {
                    return tx.finish('none');
                }
                if (stored.revision !== expectedRevision) {
                    return tx.finish('stale');
                }
                // Captured as a `const` so the narrowing above survives into the nested callback:
                // a `let` read from inside a closure widens back to its declared type.
                const candidate = stored;
                const adopted = snapshot(candidate.document);
                tx.read(
                    tx.table('songs').get([scope.ownerId, documentId]),
                    (savedRow: SavedSong | undefined) => {
                        const song = savedRow ? savedSong(savedRow, scope, documentId) : null;
                        if (song && song.remoteRevision === candidate.revision) {
                            // The record already IS this version, so the row describes no
                            // divergence at all (#1310 patch R1, the belt at the consumer). A
                            // device that stored a stale candidate before that fix — or one whose
                            // record another tab advanced to exactly this revision — must not be
                            // offered a "newer version" it already holds, and must not be offered
                            // it again, so the row goes with the question it was asking.
                            tx.table('meta').delete(key);
                            return tx.finish('none');
                        }
                        operations(tx, scope, documentId, (queue) => {
                            if (queue.length > 0) {
                                return tx.finish('queued');
                            }
                            tx.table('songs').put({
                                ownerId: scope.ownerId,
                                documentId,
                                document: adopted,
                                remoteRevision: candidate.revision,
                            } satisfies SavedSong);
                            // The writer id is the third key element, so an array upper bound
                            // stops at this document's last row — the same bound `discardDrafts`
                            // pages one with.
                            tx.table('drafts').delete(
                                IDBKeyRange.bound(
                                    [scope.ownerId, documentId],
                                    [scope.ownerId, documentId, []],
                                    false,
                                    true,
                                ),
                            );
                            tx.table('meta').delete(key);
                            tx.finish({
                                documentId,
                                document: adopted,
                                revision: candidate.revision,
                            });
                        });
                    },
                );
            });
        });
    }

    /**
     * Freeze an explicit cloud deletion for this document and hand back the bytes to send (#1270).
     *
     * The operation id is minted ONCE and stored before anything leaves this device, so a lost
     * response — the tab closed, the network died after the server committed — retries the identical
     * request and the server answers it from its receipt instead of deleting a second time. An
     * existing frozen record is therefore reused VERBATIM, including its `expectedRevision`: a retry
     * is a retry of that request, not a fresh request wearing its id, which the server would refuse
     * as `operation_mismatch`.
     *
     * `'missing'` — no saved record here at all. `'unconfirmed'` — a record the cloud has never
     * acknowledged (`remoteRevision === null`), so there is nothing in the account to delete and no
     * revision to name; the local copy is the only copy and removing it is not this operation.
     * Either way any frozen record is dropped: it can only be left over from a delete that already
     * landed and was reconciled by a download pass.
     */
    async prepareDelete(
        scope: AccountScope,
        documentId: string,
    ): Promise<PreparedDelete | 'missing' | 'unconfirmed'> {
        scope = copyScope(scope);
        identifier(documentId);
        const frozen = await this.database.run<PendingDeletion | 'missing' | 'unconfirmed'>(
            'readwrite',
            scope,
            (tx) => {
                const key = deletionKey(scope.ownerId, documentId);
                // Either kind (#1474): a collection is deleted through this same frozen request.
                savedRecord(tx, scope, documentId, (record) => {
                    if (record?.kind === 'collection' && record.saved.document.builtIn) {
                        // No delete request is ever frozen for a built-in (#1477 review R2).
                        throw new BuiltInCollectionError('deleted');
                    }
                    const song = record?.saved ?? null;
                    if (!song || song.remoteRevision === null) {
                        tx.table('meta').delete(key);
                        return tx.finish(song ? 'unconfirmed' : 'missing');
                    }
                    const expectedRevision = song.remoteRevision;
                    tx.read(tx.table('meta').get(key), (existing: PendingDeletion | undefined) => {
                        if (existing !== undefined) {
                            return tx.finish(savedDeletion(existing, scope, documentId));
                        }
                        const record: PendingDeletion = {
                            key,
                            ownerId: scope.ownerId,
                            documentId,
                            operationId: crypto.randomUUID(),
                            expectedRevision,
                        };
                        tx.table('meta').put(record);
                        tx.finish(record);
                    });
                });
            },
        );
        if (typeof frozen === 'string') {
            return frozen;
        }
        const body = deleteBody(frozen);
        const hash = await digest(body);
        // Crypto runs outside IDB. Recheck the fence before publishing a prepared request, exactly
        // as `prepare()` does for a Save.
        await this.database.run('readonly', scope, (tx) => tx.finish(undefined));
        return {
            ownerId: scope.ownerId,
            documentId,
            operationId: frozen.operationId,
            expectedRevision: frozen.expectedRevision,
            body,
            digest: hash,
        };
    }

    /**
     * Forget a frozen delete, so a later attempt mints a fresh operation id.
     *
     * Only ever correct after the server answered definitively ABOUT THESE BYTES and wrote no
     * receipt for them — a stale `expectedRevision`, an id it has never held, or an operation id
     * already spent on something else. After an UNCERTAIN outcome (a dead network, a 401, a 429)
     * the same bytes are still the right request and the frozen id must survive, or a retry would
     * risk deleting twice under two ids.
     */
    async discardDelete(scope: AccountScope, documentId: string): Promise<void> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readwrite', scope, (tx) => {
            tx.table('meta').delete(deletionKey(scope.ownerId, documentId));
            tx.finish(undefined);
        });
    }

    /**
     * Apply the server's answer to a frozen delete, in one transaction (#1270).
     *
     * A `deleted` reply — a fresh delete, a replay of this operation id, and a delete of an id
     * already deleted are ONE reply by design — runs the same `commitDeleted` rule a downloaded
     * tombstone does, re-read here rather than taken from the caller: a Save can have been queued,
     * or the chart opened, while the request was in flight, and local work that exists only on this
     * device is never removed by a cloud operation. `request.expectedRevision` is the
     * compare-and-swap base, so a record that advanced meanwhile is retained rather than dropped.
     *
     * A `conflict` reply means nothing was deleted and the server wrote no receipt, so the frozen
     * id is dropped: the id is live at another revision, and a later attempt has to name THAT
     * revision — which is different bytes, and reusing the id for them is exactly what the server's
     * `operation_mismatch` refuses.
     */
    async acknowledgeDelete(
        scope: AccountScope,
        request: PreparedDelete,
        candidate: unknown,
        options: { active?: boolean } = {},
    ): Promise<ReconcileOutcome | 'conflict'> {
        scope = copyScope(scope);
        request = { ...request };
        if (request.ownerId !== scope.ownerId || (await digest(request.body)) !== request.digest) {
            throw new Error('Invalid prepared delete.');
        }
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('Invalid delete options.');
        }
        const active = options.active === true;
        const response = deleteReply(candidate, request);
        const documentId = request.documentId;
        return this.database.run('readwrite', scope, (tx) => {
            tx.table('meta').delete(deletionKey(scope.ownerId, documentId));
            if (response.kind === 'conflict') {
                return tx.finish('conflict');
            }
            const observed = remoteOutcome({
                kind: 'deleted',
                documentId,
                revision: response.revision,
            });
            const candidateRecord = (): RemoteCandidate =>
                Object.assign(
                    { key: candidateKey(scope.ownerId, documentId), ownerId: scope.ownerId },
                    observed,
                );
            savedRecord(tx, scope, documentId, (record) => {
                if (record?.kind === 'collection') {
                    // A collection's delete (#1474) settles through the collection half of the
                    // same rule. An id with neither record falls through to the chart rule below
                    // exactly as it always did.
                    const collection = record.saved;
                    queueOf(tx, scope, documentId, collectionSnapshot, (queue) =>
                        tx.finish(
                            commitCollectionDeleted(
                                tx,
                                scope,
                                documentId,
                                collection,
                                queue.length > 0,
                                request.expectedRevision,
                            ),
                        ),
                    );
                    return;
                }
                const song = record?.saved ?? null;
                liveDrafts(tx, scope, documentId, song, (drafts: number) => {
                    operations(tx, scope, documentId, (queue) => {
                        const held = active || drafts > 0 || queue.length > 0;
                        tx.finish(
                            commitDeleted(
                                tx,
                                scope,
                                documentId,
                                candidateRecord,
                                song,
                                held,
                                request.expectedRevision,
                            ),
                        );
                    });
                });
            });
        });
    }

    /** The remote observation this device kept but did not adopt. Null when there is none. */
    async remoteCandidate(
        scope: AccountScope,
        documentId: string,
    ): Promise<RemoteCandidate | null> {
        scope = copyScope(scope);
        identifier(documentId);
        return this.database.run('readonly', scope, (tx) => {
            tx.read(
                tx.table('meta').get(candidateKey(scope.ownerId, documentId)),
                (value: RemoteCandidate | undefined) => {
                    tx.finish(value ? savedCandidate(value, scope, documentId) : null);
                },
            );
        });
    }

    /**
     * Every remote observation this owner kept but did not adopt, in document-ID order.
     *
     * The `meta` store holds one generic keyed namespace, so the bound below is what keeps this
     * owner-scoped: `remote:<owner>:` as an inclusive lower bound and the same prefix plus
     * `'￿'` as an exclusive upper one. That is a true prefix range rather than a
     * fetch-then-filter, because `':'` terminates the owner segment and the identifier grammar
     * excludes it — every character an owner ID may contain sorts either side of `':'`
     * consistently, so no neighbouring owner's key can fall inside this window at all. The
     * `'active'` pointer sorts below the prefix and is never in range either. Each row is still
     * re-proved against the scope by `savedCandidate`, so a range bug cannot leak a record.
     */
    async remoteCandidates(scope: AccountScope): Promise<RemoteCandidate[]> {
        scope = copyScope(scope);
        return this.database.run('readonly', scope, (tx) => {
            const prefix = candidatePrefix(scope.ownerId);
            const range = IDBKeyRange.bound(prefix, `${prefix}￿`, false, true);
            tx.read(
                tx.table('meta').getAll(range, MAX_REMOTE_CANDIDATES + 1),
                (rows: RemoteCandidate[]) => {
                    if (rows.length > MAX_REMOTE_CANDIDATES) {
                        throw new Error('Account remote candidates exceed the supported limit.');
                    }
                    // The whole window is validated, never only what is handed back: a corrupt
                    // candidate must fail this read explicitly rather than be silently skipped
                    // and then re-downloaded as if it had never been preserved.
                    tx.finish(
                        rows.map((row) => {
                            identifier(row?.documentId);
                            return savedCandidate(row, scope, row.documentId);
                        }),
                    );
                },
            );
        });
    }

    /**
     * Apply ONE remote observation to this owner's library: the whole commit rule of a library
     * download, in one transaction, under the same owner/generation fence as every other write.
     *
     * The decision is made INSIDE the transaction, never taken from the caller's plan. A plan is
     * computed from a snapshot read minutes and several network round-trips earlier; by the time
     * a body arrives the musician may have started editing, queued a Save, or opened the chart.
     * Re-reading the record, the draft count and the queue here is what makes a download safe to
     * interleave with live use — and what makes an interrupted run safe to simply run again,
     * since a document already at this revision costs nothing and changes nothing. The chart on
     * the stand is the one fact storage cannot re-read, so the caller supplies it per call.
     *
     * `held` is the single preservation predicate: a LIVE draft (`liveDraft` — an experiment on
     * the version this device has committed, not a row some earlier page load's Save has already
     * moved past), a queued Save, or the chart on the stand each mean adopting the remote body
     * would destroy something that exists only on this device. A held document keeps everything
     * it has and gets a separate candidate instead.
     * `remoteRevision === null` counts as divergent for the same reason: the local record has
     * never been confirmed by the cloud, so it cannot be treated as a clean mirror of it.
     *
     * `held` alone is not enough, because a Save can be queued AND drained inside the same
     * window: `acknowledge` writes the new `remoteRevision` and deletes the operation in ONE
     * transaction, so the record is never observably "clean but mid-flight" — it is simply clean
     * and newer, and nothing readable here would distinguish it from the record the plan saw.
     * `expectedRemoteRevision` is what does: a write only proceeds against the exact revision the
     * caller diffed against.
     *
     * And for a `version` observation that base is asked BEFORE `held` (#1310 patch R1). A body
     * whose base has moved is not a divergence to preserve, it is a reading of a state that is
     * gone: it answers `'superseded'` and writes nothing at all. Asking `held` first — as this did
     * until #1310 made candidates visible — stored exactly the same stale body whenever the other
     * tab that moved the record was still holding the chart or still typing.
     */
    async reconcile(
        scope: AccountScope,
        outcome: RemoteOutcome,
        options: ReconcileOptions = {},
    ): Promise<ReconcileOutcome> {
        scope = copyScope(scope);
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('Invalid reconcile options.');
        }
        // Captured synchronously, before IDB awaits: a caller mutating its observation or its
        // options object mid-flight cannot retarget the commit that is already decided.
        const active = options.active === true;
        const expected = options.expectedRemoteRevision;
        if (expected !== undefined && expected !== null) {
            remoteRevision(expected);
        }
        const observed = remoteOutcome(outcome);
        const documentId = observed.documentId;
        return this.database.run('readwrite', scope, (tx) => {
            const key = candidateKey(scope.ownerId, documentId);
            const candidate = (): RemoteCandidate =>
                Object.assign({ key, ownerId: scope.ownerId }, observed);
            // One id space per owner across kinds (#1474 review R1): an id this device holds as a
            // COLLECTION is not a chart's to write, so a chart observation for it writes nothing —
            // not a song beside the collection, not a candidate. Requested first, so it is known
            // before the song read's callback runs.
            let heldAsCollection = false;
            tx.read(
                tx.table('collections').getKey([scope.ownerId, documentId]),
                (collection: IDBValidKey | undefined) => {
                    heldAsCollection = collection !== undefined;
                },
            );
            tx.read(
                tx.table('songs').get([scope.ownerId, documentId]),
                (stored: SavedSong | undefined) => {
                    if (heldAsCollection) {
                        return tx.finish(observed.kind === 'deleted' ? 'unchanged' : 'superseded');
                    }
                    const song = stored ? savedSong(stored, scope, documentId) : null;
                    liveDrafts(tx, scope, documentId, song, (drafts: number) => {
                        operations(tx, scope, documentId, (queue) => {
                            const held = active || drafts > 0 || queue.length > 0;
                            if (observed.kind === 'unsupported') {
                                // Never touches the saved record, held or not: a body this
                                // build cannot validate must not become the local song, and
                                // discarding it would lose the only copy of it here.
                                tx.table('meta').put(candidate());
                                return tx.finish('unsupported');
                            }
                            if (observed.kind === 'deleted') {
                                return tx.finish(
                                    commitDeleted(
                                        tx,
                                        scope,
                                        documentId,
                                        candidate,
                                        song,
                                        held,
                                        expected,
                                    ),
                                );
                            }
                            if (song && song.remoteRevision === observed.revision) {
                                // Already the confirmed local state — including on a rerun
                                // of an interrupted pass. A candidate from an earlier pass
                                // no longer describes a divergence.
                                tx.table('meta').delete(key);
                                return tx.finish('unchanged');
                            }
                            if (song && song.remoteRevision !== expected) {
                                // NOT the record the caller diffed: it moved between the plan
                                // and this transaction, so this body describes a state this
                                // device has left behind. Nothing is written — not the record,
                                // and deliberately not a candidate either (#1310 patch R1).
                                //
                                // Held or clean makes no difference, and that is the whole
                                // correction: the old order asked `held` first, so the two-tab
                                // case (the other tab Saved and kept typing) stored the same
                                // stale body under a draft instead of under a clean record.
                                // Revisions are opaque strings, so no reader downstream can
                                // tell this body is OLDER than the record — which is what made
                                // the preserved row a destructive, mislabelled offer once #1310
                                // started showing candidates to a musician.
                                //
                                // Any candidate already stored for this id is left exactly as
                                // it is: a row that WAS written against a matching base is not
                                // made wrong by this pass's stale one, and clearing it would
                                // retract an offer nothing has resolved.
                                //
                                // Residual, accepted: such a row could itself be behind a record
                                // that has moved since, and nothing can order two opaque
                                // revisions. It needs a Save accepted while a candidate is
                                // outstanding — which a server that checks the base refuses — and
                                // the next pass's `'unchanged'` or `'advanced'` deletes the row.
                                return tx.finish('superseded');
                            }
                            if (held || song?.remoteRevision === null) {
                                tx.table('meta').put(candidate());
                                return tx.finish('candidate');
                            }
                            if (song?.remoteRevision !== expected) {
                                // No saved record here, and the caller's plan says there was
                                // one: it has been removed since. The body is preserved rather
                                // than written, because nothing it could be compared against
                                // exists any more and this is the only copy of it on the device.
                                tx.table('meta').put(candidate());
                                return tx.finish('candidate');
                            }
                            // Clean: the saved body and its remote revision advance together
                            // in this one transaction, so no reader can ever see a document
                            // labelled with a revision it is not.
                            tx.table('songs').put({
                                ownerId: scope.ownerId,
                                documentId,
                                document: observed.document,
                                remoteRevision: observed.revision,
                            } satisfies SavedSong);
                            tx.table('meta').delete(key);
                            tx.finish('advanced');
                        });
                    });
                },
            );
        });
    }

    /**
     * Apply one remote observation to a COLLECTION (#1474): `reconcile`'s commit rule for the
     * `collections` store, in one transaction under the same fence, with the same compare-and-swap
     * base (`expectedRemoteRevision`, asked before anything else).
     *
     * Simpler than a chart's, because a collection has no drafts and is never on the stand: the
     * only local work that can hold one is its own queued Save (or a record the cloud never
     * confirmed). And nothing is preserved beside a held collection — no candidate row — because
     * that queued Save already IS the record of the divergence: the outbox sends before the
     * download in every pass, so it meets the newer revision as a `'conflict'` carrying exactly
     * the remote version a candidate would have kept. So a held collection, and one whose record
     * moved under the plan, both answer `'superseded'`: nothing written, re-planned next pass.
     */
    async reconcileCollection(
        scope: AccountScope,
        outcome: CollectionOutcome,
        options: Pick<ReconcileOptions, 'expectedRemoteRevision'> = {},
    ): Promise<ReconcileOutcome> {
        scope = copyScope(scope);
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('Invalid reconcile options.');
        }
        const expected = options.expectedRemoteRevision;
        if (expected !== undefined && expected !== null) {
            remoteRevision(expected);
        }
        // Validated and rebuilt before the transaction opens, as `remoteOutcome` does for a chart.
        if (!outcome || typeof outcome !== 'object') {
            throw new Error('Invalid remote observation.');
        }
        identifier(outcome.documentId);
        remoteRevision(outcome.revision);
        const documentId = outcome.documentId;
        const revision = outcome.revision;
        let document: CollectionDocument | null = null;
        if (outcome.kind === 'version') {
            document = collectionSnapshot(outcome.document);
            if (document.id !== documentId) {
                throw new Error('Remote version identity does not match its document.');
            }
        } else if (outcome.kind !== 'deleted') {
            throw new Error('Unknown remote observation kind.');
        }
        return this.database.run('readwrite', scope, (tx) => {
            // The mirror of `reconcile`'s check (#1474 review R1): an id this device holds as a
            // SONG is not a collection's to write, so nothing is written beside it.
            let heldAsSong = false;
            tx.read(
                tx.table('songs').getKey([scope.ownerId, documentId]),
                (song: IDBValidKey | undefined) => {
                    heldAsSong = song !== undefined;
                },
            );
            tx.read(
                tx.table('collections').get([scope.ownerId, documentId]),
                (row: SavedCollection | undefined) => {
                    if (heldAsSong) {
                        return tx.finish(document === null ? 'unchanged' : 'superseded');
                    }
                    const collection = storedCollection(row, scope, documentId);
                    queueOf(tx, scope, documentId, collectionSnapshot, (queue) => {
                        const held = queue.length > 0;
                        if (document === null) {
                            return tx.finish(
                                commitCollectionDeleted(
                                    tx,
                                    scope,
                                    documentId,
                                    collection,
                                    held,
                                    expected,
                                ),
                            );
                        }
                        if (collection && collection.remoteRevision === revision) {
                            return tx.finish('unchanged');
                        }
                        if (
                            (collection ? collection.remoteRevision : undefined) !== expected ||
                            held ||
                            collection?.remoteRevision === null
                        ) {
                            // The record moved under the plan (a Save acknowledged, or a local
                            // removal), or local work holds it. Either way this body is not this
                            // device's to write; see the method comment.
                            return tx.finish('superseded');
                        }
                        tx.table('collections').put({
                            ownerId: scope.ownerId,
                            documentId,
                            document,
                            remoteRevision: revision,
                        } satisfies SavedCollection);
                        tx.finish('advanced');
                    });
                },
            );
        });
    }
}
