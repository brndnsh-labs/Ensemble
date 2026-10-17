import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newCollection } from '../../prototypes/v2/lib/collections.js';
import {
    ACCOUNT_DATABASE,
    type AccountScope,
    type ChartDocument,
    candidateKey,
    deletionKey,
    openedKey,
    type PreparedSave,
    starKey,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { sendNext } from '../../prototypes/v2/lib/sync/send.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * Deleting songs from this device for good (#1754), against real IndexedDB in both engines.
 *
 * `purgeLocal` is the way out for a song a cloud delete cannot remove — "No longer in your
 * account", or never in it — and every claim it makes is about what ONE transaction leaves behind:
 * nothing of the purged id in any store, everything of every other id exactly as it was, and no
 * operation, freeze or request of its own. A fake store would agree with a wrong range as readily
 * as a right one, so it lives here.
 */

const OWNER = 'owner-a';
const GONE = 'gone-song';
const KEPT = 'kept-song';

let name: string;
let book: AccountSongbook;
let scope: AccountScope;

async function raw<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        return await work(db);
    } finally {
        db.close();
    }
}

function settled<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** Every row of one store, as stored — what the purge's ranges must and must not have reached. */
function rows(store: string): Promise<Array<Record<string, unknown>>> {
    return raw((db) => settled(db.transaction(store, 'readonly').objectStore(store).getAll()));
}

async function metaKeys(): Promise<string[]> {
    return (await rows('meta')).map((row) => String(row.key));
}

function chart(title: string, id: string, revision = 0): ChartDocument {
    return { ...accountChart(title, id), revision };
}

function committing(revision: string) {
    return async (request: PreparedSave) => ({
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        digest: request.digest,
        kind: 'committed',
        revision,
    });
}

/** A song the account confirmed, with a receipt for it. */
async function confirmed(id: string, revision: string) {
    await book.save(scope, chart(`Song ${id}`, id), null);
    expect(await sendNext(book, scope, id, committing(revision))).toBe('committed');
}

/**
 * The shape behind "No longer in your account": a confirmed song this device still holds work for
 * — a queued Save, two writers' drafts, a frozen delete, opened-at and star rows — when the
 * account's tombstone arrives, so `commitDeleted` keeps it all and writes a `deleted` candidate.
 */
async function tombstonedWithEverything(id: string) {
    await confirmed(id, `${id}-1`);
    expect(typeof (await book.prepareDelete(scope, id))).toBe('object');
    await book.recordOpened(scope, id);
    await book.setStarred(scope, id, true);
    await book.save(scope, chart('Queued', id, 1), 0);
    await book.save(scope, chart('Queued again', id, 2), 1);
    // After the Saves, which retire every writer's superseded draft.
    await book.recover(scope, 'writer-1', chart('First writer', id, 2), 2);
    await book.recover(scope, 'writer-2', chart('Second writer', id, 2), 2);
    expect(
        await book.reconcile(
            scope,
            { kind: 'deleted', documentId: id, revision: `${id}-tomb` },
            { expectedRemoteRevision: `${id}-1` },
        ),
    ).toBe('retained-deleted');
}

/** An id's own rows across every store that is keyed by document. */
async function rowsFor(id: string) {
    const meta = (await metaKeys()).filter((key) => key.endsWith(`:${id}`));
    return {
        songs: (await rows('songs')).filter((row) => row.documentId === id).length,
        drafts: (await rows('drafts')).filter((row) => row.documentId === id).length,
        operations: (await rows('operations')).filter((row) => row.documentId === id).length,
        meta,
    };
}

beforeEach(async () => {
    name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    book = new AccountSongbook(name);
    scope = (await book.switchAccount(OWNER))!;
});

afterEach(async () => {
    vi.restoreAllMocks();
    await book.close();
    await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
});

describe('purgeLocal deletes a song from this device for good (#1754)', () => {
    it('removes every row of a tombstoned id, in every store, and nothing of another id', async () => {
        await tombstonedWithEverything(GONE);
        // The neighbour holds the same kinds of rows, so a range one id too wide shows up here.
        await confirmed(KEPT, 'kept-1');
        await book.recordOpened(scope, KEPT);
        await book.setStarred(scope, KEPT, true);
        await book.save(scope, chart('Kept queued', KEPT, 1), 0);
        await book.recover(scope, 'writer-1', chart('Kept draft', KEPT, 1), 1);

        const before = await rowsFor(GONE);
        expect(before.songs).toBe(1);
        expect(before.drafts).toBe(2);
        expect(before.operations).toBe(2);
        expect(before.meta.sort()).toEqual(
            [
                candidateKey(OWNER, GONE),
                deletionKey(OWNER, GONE),
                openedKey(OWNER, GONE),
                starKey(OWNER, GONE),
            ].sort(),
        );
        const kept = await rowsFor(KEPT);
        const receipts = await rows('receipts');

        expect(await book.purgeLocal(scope, [GONE])).toEqual({ purged: [GONE], held: [] });

        expect(await rowsFor(GONE)).toEqual({ songs: 0, drafts: 0, operations: 0, meta: [] });
        expect(await rowsFor(KEPT)).toEqual(kept);
        expect(await book.pending(scope, KEPT)).toHaveLength(1);
        expect((await book.drafts(scope, KEPT)).map((draft) => draft.document.title)).toEqual([
            'Kept draft',
        ]);
        // Receipts are the record of Saves already acknowledged, not work: `commitDeleted` keeps
        // them too.
        expect(await rows('receipts')).toEqual(receipts);
        expect(await book.remoteCandidates(scope)).toEqual([]);
    });

    it('queues nothing, freezes nothing and sends nothing', async () => {
        await tombstonedWithEverything(GONE);
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const operations = (await rows('operations')).length;

        await book.purgeLocal(scope, [GONE]);

        expect(fetchSpy).not.toHaveBeenCalled();
        // Only the purged id's own queue went; nothing new was queued anywhere.
        expect((await rows('operations')).length).toBe(operations - 2);
        expect((await metaKeys()).some((key) => key.startsWith(`delete:${OWNER}:`))).toBe(false);
        expect(await book.prepare(scope, GONE)).toBe('idle');
    });

    it('deletes a song the account never received (`remoteRevision === null`)', async () => {
        await book.save(scope, chart('Never sent', GONE), null);
        await book.recover(scope, 'writer-1', chart('Its draft', GONE, 0), 0);
        await confirmed(KEPT, 'kept-1');

        expect(await book.purgeLocal(scope, [GONE])).toEqual({ purged: [GONE], held: [] });
        expect(await rowsFor(GONE)).toEqual({ songs: 0, drafts: 0, operations: 0, meta: [] });
        expect((await book.read(scope, KEPT))?.remoteRevision).toBe('kept-1');
    });

    it('holds a song the account still has, and leaves it exactly as it was', async () => {
        await confirmed(KEPT, 'kept-1');
        await book.recover(scope, 'writer-1', chart('Its draft', KEPT, 0), 0);
        const before = await rowsFor(KEPT);

        expect(await book.purgeLocal(scope, [KEPT])).toEqual({ purged: [], held: [KEPT] });
        expect(await rowsFor(KEPT)).toEqual(before);
    });

    it('holds a confirmed song whose candidate is a newer version or an unreadable body', async () => {
        // Only a `deleted` candidate means the account let go of the id. A `version` or an
        // `unsupported` one is the account HOLDING it, so a local delete would only come back.
        await confirmed(KEPT, 'kept-1');
        await book.recover(scope, 'writer-1', chart('Held by a draft', KEPT, 0), 0);
        expect(
            await book.reconcile(
                scope,
                {
                    kind: 'version',
                    documentId: KEPT,
                    revision: 'kept-2',
                    document: chart('Their take', KEPT, 3),
                },
                { expectedRemoteRevision: 'kept-1' },
            ),
        ).toBe('candidate');
        expect((await book.remoteCandidate(scope, KEPT))?.kind).toBe('version');
        let before = await rowsFor(KEPT);
        expect(await book.purgeLocal(scope, [KEPT])).toEqual({ purged: [], held: [KEPT] });
        expect(await rowsFor(KEPT)).toEqual(before);

        expect(
            await book.reconcile(scope, {
                kind: 'unsupported',
                documentId: KEPT,
                revision: 'kept-3',
                body: { schemaVersion: 99, id: KEPT },
                reason: 'needs-app-update',
            }),
        ).toBe('unsupported');
        expect((await book.remoteCandidate(scope, KEPT))?.kind).toBe('unsupported');
        before = await rowsFor(KEPT);
        expect(await book.purgeLocal(scope, [KEPT])).toEqual({ purged: [], held: [KEPT] });
        expect(await rowsFor(KEPT)).toEqual(before);
    });

    it('purges what it may and holds the rest, in the same call', async () => {
        await tombstonedWithEverything(GONE);
        await confirmed(KEPT, 'kept-1');
        const kept = await rowsFor(KEPT);

        expect(await book.purgeLocal(scope, [KEPT, GONE])).toEqual({
            purged: [GONE],
            held: [KEPT],
        });
        expect(await rowsFor(GONE)).toEqual({ songs: 0, drafts: 0, operations: 0, meta: [] });
        expect(await rowsFor(KEPT)).toEqual(kept);
    });

    it('never reaches an id that merely starts with the purged one', async () => {
        // `gone` is a key prefix of `gone-song` in every store: a range bound one character too
        // loose would take the longer id's rows with it.
        await tombstonedWithEverything('gone');
        await tombstonedWithEverything(GONE);
        const neighbour = await rowsFor(GONE);
        expect(neighbour.drafts).toBe(2);
        expect(neighbour.operations).toBe(2);
        expect(neighbour.meta).toHaveLength(4);

        expect(await book.purgeLocal(scope, ['gone'])).toEqual({ purged: ['gone'], held: [] });
        expect(await rowsFor('gone')).toEqual({ songs: 0, drafts: 0, operations: 0, meta: [] });
        expect(await rowsFor(GONE)).toEqual(neighbour);
    });

    it('holds a collection id rather than deleting through it', async () => {
        const set = newCollection('Set');
        expect(await book.editCollection(scope, set.id, () => set)).not.toBeNull();

        expect(await book.purgeLocal(scope, [set.id])).toEqual({ purged: [], held: [set.id] });
        expect(await book.readCollection(scope, set.id)).not.toBeNull();
    });

    it('purges many ids in one call, and the home count follows', async () => {
        await tombstonedWithEverything(GONE);
        await tombstonedWithEverything('gone-two');
        await confirmed(KEPT, 'kept-1');

        const request = { continueId: null, recentIds: [], rows: 8 };
        const home = await book.home(scope, request);
        expect(home.count).toBe(3);
        expect(home.gone).toBe(2);

        const result = await book.purgeLocal(scope, [GONE, 'gone-two', GONE]);
        expect(result.purged.sort()).toEqual([GONE, 'gone-two'].sort());
        expect(result.held).toEqual([]);

        const after = await book.home(scope, request);
        expect(after.count).toBe(1);
        expect(after.gone).toBe(0);
        expect((await book.list(scope)).songs.map((song) => song.documentId)).toEqual([KEPT]);
    });

    it('is refused under another account’s scope, with nothing removed', async () => {
        await tombstonedWithEverything(GONE);
        const stale = scope;
        scope = (await book.switchAccount('owner-b'))!;
        await expect(book.purgeLocal(stale, [GONE])).rejects.toThrow();
        scope = (await book.switchAccount(OWNER))!;
        expect((await rowsFor(GONE)).songs).toBe(1);
    });
});
