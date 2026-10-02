import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccountApi, ApiResult } from '../../prototypes/v2/lib/account/api.js';
import { createAccountSession } from '../../prototypes/v2/lib/account/session.js';
import { createSyncLoop } from '../../prototypes/v2/lib/account/sync-loop.js';
import {
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
                return ok({ documents: rows, nextAfterDocumentId: null }) as ApiResult<T>;
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
    return { api, documents };
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
