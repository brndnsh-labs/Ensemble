import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountApi, ApiResult } from '../../prototypes/v2/lib/account/api.js';
import { createAccountSession } from '../../prototypes/v2/lib/account/session.js';
import { COLLECTION_MESSAGES, createSyncLoop } from '../../prototypes/v2/lib/account/sync-loop.js';
import {
    BuiltInCollectionError,
    type CollectionDocument,
    newCollection,
    newStarred,
    STARRED_COLLECTION_ID,
    withSong,
} from '../../prototypes/v2/lib/collections.js';
import { runOutboxPass } from '../../prototypes/v2/lib/sync/drain.js';
import {
    ACCOUNT_DATABASE,
    type AccountScope,
    digest,
    starsMigratedKey,
} from '../../prototypes/v2/lib/sync/protocol.js';
import {
    AccountSongbook,
    CollectionCapError,
    MAX_REMOTE_CANDIDATES,
} from '../../prototypes/v2/lib/sync/repository.js';
import type { SaveTransport } from '../../prototypes/v2/lib/sync/send.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * Starred as a synced built-in collection, and the collection gaps #1474 left open (#1477),
 * against real IndexedDB in both engines:
 *
 * - a collection edit is ONE read-modify-write transaction, refused locally at the document cap;
 * - the one-time copy of the device-local `star:` rows into Starred (the account migration);
 * - a conflicted collection Save resolves by MERGE, without asking — and two devices that star
 *   different songs offline both end with the union, nothing queued, nothing conflicted;
 * - the sign-out preflight and the sync chip count collection Saves;
 * - one unreadable collection row does not stop songs from uploading.
 *
 * The two-device test drives the real sync loop against a small in-memory account API that
 * enforces the server's revision rules (create requires absence, update the exact revision), so
 * the conflict it meets is the one the real server would answer with.
 */

const OWNER = 'owner-a';
const names: string[] = [];
const connections: AccountSongbook[] = [];
/** Each connection's database name, for the raw reads and writes below. */
const databaseOf = new WeakMap<AccountSongbook, string>();

function connection(name: string): AccountSongbook {
    const instance = new AccountSongbook(name);
    connections.push(instance);
    databaseOf.set(instance, name);
    return instance;
}

function freshName(): string {
    const name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    names.push(name);
    return name;
}

let book: AccountSongbook;
let scope: AccountScope;

beforeEach(async () => {
    book = connection(freshName());
    scope = (await book.switchAccount(OWNER))!;
});

afterEach(async () => {
    await Promise.all(connections.splice(0).map((instance) => instance.close()));
    for (const name of names.splice(0)) {
        await new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
        });
    }
});

/** Reads one raw `meta` key: nothing in the repository API exposes the marker itself. */
function metaKey(name: string, key: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const read = db.transaction('meta', 'readonly').objectStore('meta').get(key);
            read.onsuccess = () => {
                db.close();
                resolve(read.result);
            };
            read.onerror = () => {
                db.close();
                reject(read.error);
            };
        };
    });
}

/** A transport that commits every Save, as an account with nothing else in it would. */
function committing(): SaveTransport {
    let n = 0;
    return async (request) => {
        n += 1;
        return {
            ownerId: request.ownerId,
            documentId: request.documentId,
            operationId: request.operationId,
            digest: request.digest,
            kind: 'committed',
            revision: `cloud-${n}`,
        };
    };
}

function starredSongs(collections: Array<{ document: CollectionDocument }>): string[] {
    return collections.find((entry) => entry.document.id === STARRED_COLLECTION_ID)?.document
        .songIds as string[];
}

describe('a collection edit is one read-modify-write Save (#1477)', () => {
    it('creates Starred lazily on the first star and queues one Save per toggle, in order', async () => {
        expect(await book.listCollections(scope)).toEqual([]);
        const star = (songId: string, on: boolean) =>
            book.editCollection(scope, STARRED_COLLECTION_ID, (current) =>
                current ? withSong(current, songId, on) : on ? newStarred([songId]) : null,
            );
        // Three toggles fired together: each reads what the one before it wrote, because the read
        // and the write are one transaction — no compare-and-swap for the second to lose.
        await Promise.all([star('a', true), star('b', true), star('a', false)]);
        const [starred] = await book.listCollections(scope);
        expect(starred.document.songIds).toEqual(['b']);
        expect(starred.document.builtIn).toBe('starred');
        expect(await book.pendingCollection(scope, STARRED_COLLECTION_ID)).toHaveLength(3);
        // An unstar with no Starred at all writes nothing — Starred is never created empty.
        const other = connection(freshName());
        const otherScope = (await other.switchAccount(OWNER))!;
        expect(
            await other.editCollection(otherScope, STARRED_COLLECTION_ID, (current) =>
                current ? withSong(current, 'a', false) : null,
            ),
        ).toBeNull();
        expect(await other.listCollections(otherScope)).toEqual([]);
    });

    it('refuses a CREATE at the account’s document cap, and still takes an update', async () => {
        // Fill the account to the cap with raw rows: the count is all the check reads.
        await book.saveCollection(scope, newCollection('Existing'), null);
        const [existing] = await book.listCollections(scope);
        await fill(book, MAX_REMOTE_CANDIDATES - 1);

        await expect(
            book.editCollection(scope, STARRED_COLLECTION_ID, () => newStarred(['a'])),
        ).rejects.toBeInstanceOf(CollectionCapError);
        // Nothing was queued for the refused create.
        expect(await book.pendingCollection(scope, STARRED_COLLECTION_ID)).toEqual([]);
        // An update is not a new document, so the cap does not stop it.
        expect(
            await book.editCollection(scope, existing.documentId, (current) =>
                current ? { ...current, songIds: ['a'] } : null,
            ),
        ).not.toBeNull();
    });

    it('a confirmed collection with a Save still queued is not deleted from the cloud yet (review P2-1)', async () => {
        await book.editCollection(scope, 'set-a', () => ({ ...newCollection('Gig'), id: 'set-a' }));
        await runOutboxPass(book, scope, committing());
        expect((await book.readCollection(scope, 'set-a'))?.remoteRevision).toBe('cloud-1');
        await book.editCollection(scope, 'set-a', (current) =>
            current ? withSong(current, 'song-1', true) : null,
        );
        // Deleted in the cloud now, the record would be retained for that Save, which would then
        // meet the tombstone and be re-created under a fresh id. The outbox settles it first.
        expect(await book.deleteCollection(scope, 'set-a')).toBe('queued');
        expect(await book.pendingCollection(scope, 'set-a')).toHaveLength(1);
        await runOutboxPass(book, scope, committing());
        expect(await book.deleteCollection(scope, 'set-a')).toBe('cloud');
    });

    it('refuses an id this account already holds as a song', async () => {
        await book.save(scope, accountChart('Song', 'shared-id'), null);
        await expect(
            book.editCollection(scope, 'shared-id', () => ({
                ...newCollection('Clash'),
                id: 'shared-id',
            })),
        ).rejects.toThrow('already belongs to a song');
    });
});

/** Raw song rows, written straight into the store — enough for `documentCount` to see. */
async function fill(target: AccountSongbook, count: number): Promise<void> {
    const name = databaseOf.get(target)!;
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('songs', 'readwrite');
            for (let i = 0; i < count; i++) {
                tx.objectStore('songs').put({ ownerId: OWNER, documentId: `filler-${i}` });
            }
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        };
    });
}

describe('the device-local stars are copied into Starred once (#1477)', () => {
    it('copies every star row into a new Starred and leaves the rows in place', async () => {
        await book.setStarred(scope, 'song-2', true);
        await book.setStarred(scope, 'song-1', true);

        expect(await book.migrateStars(scope)).toBe('migrated');

        const [starred] = await book.listCollections(scope);
        expect(starred.documentId).toBe(STARRED_COLLECTION_ID);
        expect(new Set(starred.document.songIds)).toEqual(new Set(['song-1', 'song-2']));
        // A copy: the #1440 rows are exactly as they were, so the migration is reversible.
        expect(await book.starredIds(scope)).toEqual(new Set(['song-1', 'song-2']));
        // And it queued ONE Save, for the outbox to send.
        expect(await book.pendingCollection(scope, STARRED_COLLECTION_ID)).toHaveLength(1);
    });

    it('runs once: a song unstarred after the copy is not starred again', async () => {
        await book.setStarred(scope, 'song-1', true);
        expect(await book.migrateStars(scope)).toBe('migrated');
        await book.editCollection(scope, STARRED_COLLECTION_ID, (current) =>
            current ? withSong(current, 'song-1', false) : null,
        );

        expect(await book.migrateStars(scope)).toBe('done');
        const [starred] = await book.listCollections(scope);
        expect(starred.document.songIds).toEqual([]);
    });

    it('creates no Starred when this device has no stars', async () => {
        expect(await book.migrateStars(scope)).toBe('nothing');
        expect(await book.listCollections(scope)).toEqual([]);
        expect(await book.migrateStars(scope)).toBe('done');
    });

    it('adds this device’s stars after whatever Starred already holds', async () => {
        await book.editCollection(scope, STARRED_COLLECTION_ID, () => newStarred(['theirs']));
        await book.setStarred(scope, 'mine', true);
        await book.setStarred(scope, 'theirs', true);

        expect(await book.migrateStars(scope)).toBe('migrated');
        const [starred] = await book.listCollections(scope);
        expect(starred.document.songIds).toEqual(['theirs', 'mine']);
    });

    it('at the cap it writes nothing — not even its marker — so it is tried again later', async () => {
        await book.setStarred(scope, 'song-1', true);
        await fill(book, MAX_REMOTE_CANDIDATES);

        expect(await book.migrateStars(scope)).toBe('full');
        expect(await book.listCollections(scope)).toEqual([]);
        const name = databaseOf.get(book)!;
        expect(await metaKey(name, starsMigratedKey(OWNER))).toBeUndefined();
    });

    it('sign-out removes the marker with the rows it describes', async () => {
        await book.setStarred(scope, 'song-1', true);
        await book.migrateStars(scope);
        const name = databaseOf.get(book)!;
        expect(await metaKey(name, starsMigratedKey(OWNER))).toBeDefined();
        await book.switchAccount(null);
        await book.clearAccount(OWNER);
        expect(await metaKey(name, starsMigratedKey(OWNER))).toBeUndefined();
    });
});

describe('a conflicted collection Save resolves by merge, without asking (#1477)', () => {
    function conflicting(remote: { revision: string; document: unknown } | null): SaveTransport {
        return async (request) => ({
            ownerId: request.ownerId,
            documentId: request.documentId,
            operationId: request.operationId,
            digest: request.digest,
            kind: 'conflict',
            revision: remote?.revision ?? 'cloud-gone',
            remote,
        });
    }

    it('merges the two lists and re-saves ON the remote revision', async () => {
        await book.editCollection(scope, 'set-a', () => ({
            ...newCollection('Gig', ['mine-1', 'both']),
            id: 'set-a',
        }));
        await book.editCollection(scope, 'set-a', (current) =>
            current ? { ...current, songIds: [...current.songIds, 'mine-2'] } : null,
        );
        const theirs = { ...newCollection('Theirs', ['theirs-1', 'both']), id: 'set-a' };
        await runOutboxPass(book, scope, conflicting({ revision: 'r-theirs', document: theirs }));
        const [parked] = await book.pendingCollection(scope, 'set-a');
        expect(parked.status).toBe('conflict');

        expect(await book.mergeCollectionConflicts(scope)).toBe(1);

        const record = await book.readCollection(scope, 'set-a');
        // Local order first, then the remote-only ids; this device's own name is kept.
        expect(record?.document.songIds).toEqual(['mine-1', 'both', 'mine-2', 'theirs-1']);
        expect(record?.document.name).toBe('Gig');
        expect(record?.remoteRevision).toBe('r-theirs');
        // Every queued Save for it retired; ONE fresh one, based on the remote revision.
        const queue = await book.pendingCollection(scope, 'set-a');
        expect(queue).toHaveLength(1);
        expect(queue[0].status).toBe('queued');
        expect(queue[0].base).toEqual({ revision: 'r-theirs' });
        expect(queue[0].operationId).not.toBe(parked.operationId);
        // The next send is an ordinary update the account can take.
        const prepared = await book.prepare(scope, 'set-a');
        if (typeof prepared === 'string') {
            throw new Error(`Expected a queued Save, received ${prepared}`);
        }
        expect(JSON.parse(prepared.body).expectedRevision).toBe('r-theirs');
        // Nothing else to merge.
        expect(await book.mergeCollectionConflicts(scope)).toBe(0);
    });

    it('a collection the account no longer has moves to a fresh id, never lost', async () => {
        await book.editCollection(scope, 'set-a', () => ({
            ...newCollection('Gig', ['a', 'b']),
            id: 'set-a',
        }));
        await runOutboxPass(book, scope, conflicting(null));

        expect(await book.mergeCollectionConflicts(scope)).toBe(1);

        expect(await book.readCollection(scope, 'set-a')).toBeNull();
        expect(await book.pendingCollection(scope, 'set-a')).toEqual([]);
        const [moved] = await book.listCollections(scope);
        expect(moved.documentId).not.toBe('set-a');
        expect(moved.document.name).toBe('Gig');
        expect(moved.document.songIds).toEqual(['a', 'b']);
        expect(moved.remoteRevision).toBeNull();
        const [create] = await book.pendingCollection(scope, moved.documentId);
        expect(create.base).toEqual({ revision: null });
    });

    it('leaves a song’s conflict alone: Keep both is still the only way out of that one', async () => {
        await book.save(scope, accountChart('Song', 'song-1'), null);
        await runOutboxPass(
            book,
            scope,
            conflicting({ revision: 'r-song', document: accountChart('Theirs', 'song-1') }),
        );
        expect(await book.mergeCollectionConflicts(scope)).toBe(0);
        const [head] = await book.pending(scope, 'song-1');
        expect(head.status).toBe('conflict');
    });
});

/**
 * A minimal account API with the server's revision rules: one owner, documents keyed by id, a
 * create requires absence and an update the exact current revision, and a conflict carries the
 * current version. Enough for two devices' loops to meet each other the way they would in prod.
 */
function fakeCloud() {
    const documents = new Map<string, { revision: string; document: unknown }>();
    /** Ids deleted in the account (another device's delete), with their tombstone revision. */
    const tombstones = new Map<string, string>();
    let counter = 0;
    const ok = <T>(value: T): ApiResult<T> => ({ ok: true, value, status: 200 });
    const api: AccountApi = {
        async get<T>(path: string): Promise<ApiResult<T>> {
            if (path.startsWith('/api/auth/session')) {
                return ok({ accountId: OWNER }) as ApiResult<T>;
            }
            if (path.startsWith('/api/documents?')) {
                const rows = [...documents.entries()]
                    .sort(([a], [b]) => (a < b ? -1 : 1))
                    .map(([documentId, { revision, document }]) => ({
                        documentId,
                        revision,
                        deleted: false,
                        bytes: JSON.stringify(document).length,
                        ...((document as { kind?: string }).kind === 'collection'
                            ? { kind: 'collection' }
                            : {}),
                    }));
                const dead = [...tombstones.entries()].map(([documentId, revision]) => ({
                    documentId,
                    revision,
                    deleted: true,
                    bytes: 0,
                }));
                return ok({
                    documents: [...rows, ...dead].sort((a, b) =>
                        a.documentId < b.documentId ? -1 : 1,
                    ),
                    nextAfterDocumentId: null,
                }) as ApiResult<T>;
            }
            const id = decodeURIComponent(path.slice('/api/documents/'.length));
            const held = documents.get(id);
            if (!held) {
                return { ok: false, error: { kind: 'code', code: 'not_found', status: 404 } };
            }
            return ok({ documentId: id, ...held }) as ApiResult<T>;
        },
        async post<T>(path: string, body: string): Promise<ApiResult<T>> {
            if (path !== '/api/documents/save') {
                throw new Error(`Unexpected POST ${path}`);
            }
            const request = JSON.parse(body);
            const envelope = {
                ownerId: request.ownerId,
                documentId: request.documentId,
                operationId: request.operationId,
                digest: await digest(body),
            };
            const current = documents.get(request.documentId);
            if ((current?.revision ?? null) !== request.expectedRevision) {
                return ok({
                    ...envelope,
                    kind: 'conflict',
                    revision: current?.revision ?? 'cloud-none',
                    remote: current ?? null,
                }) as ApiResult<T>;
            }
            counter += 1;
            const revision = `cloud-${counter}`;
            documents.set(request.documentId, { revision, document: request.document });
            return ok({ ...envelope, kind: 'committed', revision }) as ApiResult<T>;
        },
    } as AccountApi;
    /** Delete a document the way another device's cloud delete would. */
    const tombstone = (documentId: string) => {
        documents.delete(documentId);
        counter += 1;
        tombstones.set(documentId, `cloud-${counter}`);
    };
    return { api, documents, tombstone };
}

describe('two devices star different songs offline (#1477 acceptance)', () => {
    it('both end with the union, and no Save is left queued or conflicted', async () => {
        const cloud = fakeCloud();
        const phone = connection(freshName());
        const laptop = connection(freshName());
        const phoneScope = (await phone.switchAccount(OWNER))!;
        const laptopScope = (await laptop.switchAccount(OWNER))!;
        const phoneLoop = createSyncLoop(cloud.api, createAccountSession(cloud.api), phone);
        const laptopLoop = createSyncLoop(cloud.api, createAccountSession(cloud.api), laptop);
        await phoneLoop.attach(OWNER);
        await laptopLoop.attach(OWNER);

        // Offline, each device makes its own first star: each creates Starred at the fixed id.
        const star = (songId: string) => (current: CollectionDocument | null) =>
            current ? withSong(current, songId, true) : newStarred([songId]);
        await phoneLoop.editCollection(STARRED_COLLECTION_ID, star('song-phone'), OWNER);
        await laptopLoop.editCollection(STARRED_COLLECTION_ID, star('song-laptop'), OWNER);
        expect(phoneLoop.getSnapshot().collectionSaves).toBe(1);

        // Back online: the phone drains first and creates it; the laptop's create then meets
        // the phone's as a conflict, merges, and re-saves on the phone's revision.
        await phoneLoop.run();
        await laptopLoop.run();
        // The phone's next pass downloads the merged list.
        await phoneLoop.run();

        for (const [device, deviceScope] of [
            [phone, phoneScope],
            [laptop, laptopScope],
        ] as const) {
            const collections = await device.listCollections(deviceScope);
            expect(collections).toHaveLength(1);
            expect(new Set(starredSongs(collections))).toEqual(
                new Set(['song-phone', 'song-laptop']),
            );
            expect(await device.collectionOutbox(deviceScope)).toEqual({ unsent: 0, refused: 0 });
            expect(await device.pendingCollection(deviceScope, STARRED_COLLECTION_ID)).toEqual([]);
        }
        expect(laptopLoop.getSnapshot().collectionSaves).toBe(0);
        // One Starred in the account, holding both.
        expect(cloud.documents.size).toBe(1);
        const stored = cloud.documents.get(STARRED_COLLECTION_ID)!.document as CollectionDocument;
        expect(new Set(stored.songIds)).toEqual(new Set(['song-phone', 'song-laptop']));
    });
});

describe('a collection moving never re-reads the song library (#1477 review R1)', () => {
    it('a star, a merge and a collection download move collectionsVersion; only a song moves libraryVersion', async () => {
        const cloud = fakeCloud();
        const phone = connection(freshName());
        const laptop = connection(freshName());
        const phoneScope = (await phone.switchAccount(OWNER))!;
        const laptopScope = (await laptop.switchAccount(OWNER))!;
        const phoneLoop = createSyncLoop(cloud.api, createAccountSession(cloud.api), phone);
        const laptopLoop = createSyncLoop(cloud.api, createAccountSession(cloud.api), laptop);
        await phoneLoop.attach(OWNER);
        await laptopLoop.attach(OWNER);
        await phoneLoop.run();
        await laptopLoop.run();
        const versions = (loop: typeof phoneLoop) => ({
            library: loop.getSnapshot().libraryVersion,
            collections: loop.getSnapshot().collectionsVersion,
        });
        const star = (songId: string) => (current: CollectionDocument | null) =>
            current ? withSong(current, songId, true) : newStarred([songId]);

        // 1. A star, and the pass that uploads it.
        const phoneStart = versions(phoneLoop);
        await phoneLoop.editCollection(STARRED_COLLECTION_ID, star('song-a'), OWNER);
        const phoneEdited = versions(phoneLoop);
        await phoneLoop.run();
        const phoneUploaded = versions(phoneLoop);
        expect(phoneEdited.library).toBe(phoneStart.library);
        expect(phoneUploaded.library).toBe(phoneStart.library);
        expect(phoneUploaded.collections).toBeGreaterThan(phoneEdited.collections);
        expect(await phone.collectionOutbox(phoneScope)).toEqual({ unsent: 0, refused: 0 });

        // 2. A merge: the laptop's own Starred meets the phone's as a conflict.
        const laptopStart = versions(laptopLoop);
        await laptopLoop.editCollection(STARRED_COLLECTION_ID, star('song-b'), OWNER);
        const laptopEdited = versions(laptopLoop);
        await laptopLoop.run();
        const laptopMerged = versions(laptopLoop);
        expect(
            (await laptop.readCollection(laptopScope, STARRED_COLLECTION_ID))?.document.songIds,
        ).toEqual(['song-b', 'song-a']);
        expect(laptopMerged.library).toBe(laptopStart.library);
        expect(laptopMerged.collections).toBeGreaterThan(laptopEdited.collections);

        // 3. A collection-only download: the phone adopts the merged list.
        const phoneBefore = versions(phoneLoop);
        await phoneLoop.run();
        const phoneDownloaded = versions(phoneLoop);
        expect(
            (await phone.readCollection(phoneScope, STARRED_COLLECTION_ID))?.document.songIds,
        ).toEqual(['song-b', 'song-a']);
        expect(phoneDownloaded.library).toBe(phoneBefore.library);
        expect(phoneDownloaded.collections).toBeGreaterThan(phoneBefore.collections);

        // 4. A song still moves the library: its commit re-reads it, as it always did.
        await phoneLoop.save(accountChart('Song', 'song-x'), null, null);
        const phoneSaved = versions(phoneLoop);
        await phoneLoop.run();
        expect(versions(phoneLoop).library).toBeGreaterThan(phoneSaved.library);
        expect((await phone.read(phoneScope, 'song-x'))?.remoteRevision).not.toBeNull();
    });
});

describe('a SONG another device moved still re-reads the library (#1477 review C5a)', () => {
    it('a downloaded song, a retained tombstone and a removal each bump libraryVersion', async () => {
        const cloud = fakeCloud();
        const phone = connection(freshName());
        const laptop = connection(freshName());
        await phone.switchAccount(OWNER);
        const laptopScope = (await laptop.switchAccount(OWNER))!;
        const phoneLoop = createSyncLoop(cloud.api, createAccountSession(cloud.api), phone);
        const laptopLoop = createSyncLoop(cloud.api, createAccountSession(cloud.api), laptop);
        await phoneLoop.attach(OWNER);
        await laptopLoop.attach(OWNER);
        await laptopLoop.run();
        const library = () => laptopLoop.getSnapshot().libraryVersion;

        // Another device saves a song: this one downloads it (an advance).
        await phoneLoop.save(accountChart('Theirs', 'song-x'), null, null);
        await phoneLoop.run();
        const beforeDownload = library();
        await laptopLoop.run();
        expect(await laptop.read(laptopScope, 'song-x')).not.toBeNull();
        expect(library()).toBeGreaterThan(beforeDownload);

        // Another device deletes it while it is on this device's stand: retained.
        cloud.tombstone('song-x');
        laptopLoop.setActiveDocument('song-x');
        const beforeRetained = library();
        await laptopLoop.run();
        expect(await laptop.read(laptopScope, 'song-x')).not.toBeNull();
        expect(library()).toBeGreaterThan(beforeRetained);

        // Off the stand, the same tombstone removes it.
        laptopLoop.setActiveDocument(null);
        const beforeRemoved = library();
        await laptopLoop.run();
        expect(await laptop.read(laptopScope, 'song-x')).toBeNull();
        expect(library()).toBeGreaterThan(beforeRemoved);
    });
});

describe('a collection still uploading stops a delete before any song goes (#1477 review C5b)', () => {
    it('collectionDeleteRefusal answers "still uploading" and writes nothing', async () => {
        const api = refusingApi();
        const loop = createSyncLoop(api, createAccountSession(api), book);
        await loop.attach(OWNER);
        await book.editCollection(scope, 'set-a', () => ({
            ...newCollection('Gig', ['song-1']),
            id: 'set-a',
        }));
        await runOutboxPass(book, scope, committing());
        // A Save of it is still queued: deleting it in the cloud now would resurrect it.
        await book.editCollection(scope, 'set-a', (current) =>
            current ? withSong(current, 'song-2', true) : null,
        );
        expect(await loop.collectionDeleteRefusal('set-a', OWNER)).toBe(
            COLLECTION_MESSAGES.uploading,
        );
        // The dry run touched nothing: the record and its queued Save are exactly as they were.
        expect((await book.readCollection(scope, 'set-a'))?.document.songIds).toEqual([
            'song-1',
            'song-2',
        ]);
        expect(await book.pendingCollection(scope, 'set-a')).toHaveLength(1);
        // Once it has uploaded, the delete may go ahead.
        await runOutboxPass(book, scope, committing());
        expect(await loop.collectionDeleteRefusal('set-a', OWNER)).toBeNull();
        // And Starred is refused outright, whatever its queue holds.
        await book.editCollection(scope, STARRED_COLLECTION_ID, () => newStarred(['a']));
        expect(await loop.collectionDeleteRefusal(STARRED_COLLECTION_ID, OWNER)).toMatch(
            /can’t be deleted/,
        );
    });
});

describe('Starred is guarded in storage, not only in the UI (#1477 review R2)', () => {
    async function syncedStarred(songIds: string[]): Promise<void> {
        await book.editCollection(scope, STARRED_COLLECTION_ID, () => newStarred(songIds));
        await runOutboxPass(book, scope, committing());
    }

    it('refuses to delete Starred, locally or in the cloud', async () => {
        await syncedStarred(['a']);
        await expect(book.deleteCollection(scope, STARRED_COLLECTION_ID)).rejects.toBeInstanceOf(
            BuiltInCollectionError,
        );
        await expect(
            book.deleteCollection(scope, STARRED_COLLECTION_ID, { dryRun: true }),
        ).rejects.toBeInstanceOf(BuiltInCollectionError);
        // No delete request is ever frozen for it.
        await expect(book.prepareDelete(scope, STARRED_COLLECTION_ID)).rejects.toBeInstanceOf(
            BuiltInCollectionError,
        );
        expect(await book.readCollection(scope, STARRED_COLLECTION_ID)).not.toBeNull();
    });

    it('refuses to rename Starred, to un-mark it, or to turn a collection into one', async () => {
        await syncedStarred(['a']);
        await expect(
            book.editCollection(scope, STARRED_COLLECTION_ID, (current) =>
                current ? { ...current, name: 'Favourites' } : null,
            ),
        ).rejects.toBeInstanceOf(BuiltInCollectionError);
        await expect(
            book.editCollection(scope, STARRED_COLLECTION_ID, (current) => {
                if (!current) {
                    return null;
                }
                const { builtIn: _dropped, ...plain } = current;
                return plain;
            }),
        ).rejects.toBeInstanceOf(BuiltInCollectionError);
        const starred = (await book.readCollection(scope, STARRED_COLLECTION_ID))!.document;
        await expect(
            book.saveCollection(scope, { ...starred, name: 'Favourites' }, starred.revision),
        ).rejects.toBeInstanceOf(BuiltInCollectionError);
        await book.editCollection(scope, 'set-a', () => ({ ...newCollection('Gig'), id: 'set-a' }));
        await expect(
            book.editCollection(scope, 'set-a', (current) =>
                current ? { ...current, builtIn: 'starred' } : null,
            ),
        ).rejects.toBeInstanceOf(BuiltInCollectionError);
        // Adding a star is still an ordinary edit.
        expect(
            await book.editCollection(scope, STARRED_COLLECTION_ID, (current) =>
                current ? withSong(current, 'b', true) : null,
            ),
        ).not.toBeNull();
    });

    /**
     * #1477 review C1: the target Starred is ITSELF conflicted (with a remote version) in the same
     * sweep as the gone one. Visit order is the queued operations' id order, so both orders are
     * forced here by naming those operation ids. Before the fix, merging the gone one into a
     * target whose queue this same transaction retired chained a Save onto a retired one, and
     * every later pass threw "The preceding Save has no confirmed receipt." — no song uploaded
     * again.
     */
    for (const order of ['target first', 'gone Starred first'] as const) {
        it(`a gone Starred never chains onto a Save the same merge retired (${order})`, async () => {
            let n = 0;
            const commit: SaveTransport = async (request) => {
                n += 1;
                return {
                    ownerId: request.ownerId,
                    documentId: request.documentId,
                    operationId: request.operationId,
                    digest: request.digest,
                    kind: 'committed',
                    revision: `cloud-${n}`,
                };
            };
            await book.editCollection(scope, STARRED_COLLECTION_ID, () => newStarred(['a']));
            await book.editCollection(scope, 'starred-b', () => ({
                ...newStarred(['z']),
                id: 'starred-b',
            }));
            await runOutboxPass(book, scope, commit);
            // One more Save queued on each, under operation ids that fix the visit order.
            const [targetOp, goneOp] =
                order === 'target first'
                    ? ['op-1-target', 'op-2-gone']
                    : ['op-2-target', 'op-1-gone'];
            const uuid = vi.spyOn(crypto, 'randomUUID');
            uuid.mockReturnValueOnce(targetOp as ReturnType<typeof crypto.randomUUID>);
            await book.editCollection(scope, STARRED_COLLECTION_ID, (current) =>
                current ? withSong(current, 'a2', true) : null,
            );
            uuid.mockReturnValueOnce(goneOp as ReturnType<typeof crypto.randomUUID>);
            await book.editCollection(scope, 'starred-b', (current) =>
                current ? withSong(current, 'z2', true) : null,
            );
            uuid.mockRestore();
            expect(
                (await book.pendingCollection(scope, STARRED_COLLECTION_ID))[0].operationId,
            ).toBe(targetOp);

            // The fixed id conflicts WITH a remote version; `starred-b` is gone from the account.
            const theirs = newStarred(['r']);
            const mixed: SaveTransport = async (request) => ({
                ownerId: request.ownerId,
                documentId: request.documentId,
                operationId: request.operationId,
                digest: request.digest,
                kind: 'conflict',
                revision: request.documentId === 'starred-b' ? 'cloud-gone' : 'cloud-remote',
                remote:
                    request.documentId === 'starred-b'
                        ? null
                        : { revision: 'cloud-remote', document: theirs },
            });
            await runOutboxPass(book, scope, mixed);

            // What the sync loop does: merge, sweep, until nothing moves.
            for (let sweep = 0; sweep < 4; sweep++) {
                await book.mergeCollectionConflicts(scope);
                const result = await runOutboxPass(book, scope, commit);
                expect(result.kind).toBe('complete');
            }

            // One Starred, holding every star from both lists and the remote's, nothing queued.
            const collections = await book.listCollections(scope);
            expect(collections.map((entry) => entry.documentId)).toEqual([STARRED_COLLECTION_ID]);
            expect(new Set(collections[0].document.songIds)).toEqual(
                new Set(['a', 'a2', 'r', 'z', 'z2']),
            );
            expect(collections[0].remoteRevision).toMatch(/^cloud-\d+$/);
            expect(await book.collectionOutbox(scope)).toEqual({ unsent: 0, refused: 0 });

            // And the outbox is not wedged: a song Saved now uploads on the next pass.
            await book.save(scope, accountChart('After', 'song-after'), null);
            const result = await runOutboxPass(book, scope, commit);
            expect(result.kind).toBe('complete');
            expect((await book.read(scope, 'song-after'))?.remoteRevision).toMatch(/^cloud-\d+$/);
        });
    }

    it('a Starred the account no longer has merges INTO the Starred this device holds', async () => {
        await syncedStarred(['a']);
        // A second built-in Starred, the shape a tombstoned fixed id would leave behind.
        await book.editCollection(scope, 'starred-b', () => ({
            ...newStarred(['z', 'a']),
            id: 'starred-b',
        }));
        const gone: SaveTransport = async (request) => ({
            ownerId: request.ownerId,
            documentId: request.documentId,
            operationId: request.operationId,
            digest: request.digest,
            kind: 'conflict',
            revision: 'cloud-gone',
            remote: null,
        });
        await runOutboxPass(book, scope, gone);
        expect((await book.pendingCollection(scope, 'starred-b'))[0].status).toBe('conflict');

        expect(await book.mergeCollectionConflicts(scope)).toBe(1);

        // One Starred, holding both — never a fresh-id sibling.
        expect(await book.readCollection(scope, 'starred-b')).toBeNull();
        expect(await book.pendingCollection(scope, 'starred-b')).toEqual([]);
        const collections = await book.listCollections(scope);
        expect(collections.map((entry) => entry.documentId)).toEqual([STARRED_COLLECTION_ID]);
        expect(collections[0].document.songIds).toEqual(['a', 'z']);
        const [queued] = await book.pendingCollection(scope, STARRED_COLLECTION_ID);
        expect(queued.base).toEqual({ revision: 'cloud-1' });
    });
});

describe('collection Saves are counted where songs are (#1477)', () => {
    it('the sign-out preflight names unsent collection Saves apart from songs', async () => {
        const loop = createSyncLoop(refusingApi(), createAccountSession(refusingApi()), book);
        await loop.attach(OWNER);
        await book.editCollection(scope, STARRED_COLLECTION_ID, () => newStarred(['a']));
        await book.editCollection(scope, STARRED_COLLECTION_ID, (current) =>
            current ? withSong(current, 'b', true) : null,
        );
        await book.save(scope, accountChart('Song', 'song-1'), null);

        const plan = await loop.signOutPreflight();
        expect(plan.unsentCollections).toBe(2);
        expect(plan.refusedCollections).toBe(0);
        // Songs are counted as before, and a collection never becomes a song to export.
        expect(plan.unsentSaves).toBe(1);
        expect(plan.atRisk).toEqual(['song-1']);
    });

    it('one unreadable collection row does not stop the songs from uploading', async () => {
        await book.save(scope, accountChart('Song', 'song-1'), null);
        await corruptCollectionRow(book, 'broken-set');

        const result = await runOutboxPass(book, scope, committing());
        expect(result.kind).toBe('complete');
        expect((await book.read(scope, 'song-1'))?.remoteRevision).toBe('cloud-1');
    });
});

function refusingApi(): AccountApi {
    const refuse = async () => ({
        ok: false as const,
        error: { kind: 'network' as const },
    });
    return { get: refuse, post: refuse } as unknown as AccountApi;
}

async function corruptCollectionRow(target: AccountSongbook, documentId: string): Promise<void> {
    const name = databaseOf.get(target)!;
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('collections', 'readwrite');
            tx.objectStore('collections').put({
                ownerId: OWNER,
                documentId,
                document: { kind: 'collection', nonsense: true },
                remoteRevision: null,
            });
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        };
    });
}
