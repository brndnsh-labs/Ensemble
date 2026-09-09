import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ACCOUNT_DATABASE,
    AccountChangedError,
    type AccountScope,
    LocalRevisionError,
    MAX_PENDING_SAVES,
    type PreparedSave,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { sendNext } from '../../prototypes/v2/lib/sync/send.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

let name: string;
let book: AccountSongbook;
let scope: AccountScope;
const connections: AccountSongbook[] = [];

function connection(): AccountSongbook {
    const instance = new AccountSongbook(name);
    connections.push(instance);
    return instance;
}

async function prepared(instance = book, active = scope, id = 'study'): Promise<PreparedSave> {
    const result = await instance.prepare(active, id);
    if (typeof result === 'string') {
        throw new Error(`Expected queued Save, received ${result}`);
    }
    return result;
}

function committed(request: PreparedSave, revision = 'cloud-1') {
    return {
        kind: 'committed',
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        digest: request.digest,
        revision,
    };
}

/** Independent idempotent compare-and-put oracle; no repository helper defines its result. */
function server() {
    const receipts = new Map<string, { body: string; response: ReturnType<typeof committed> }>();
    let revision: string | null = null;
    const titles: string[] = [];
    const transport = async (request: PreparedSave) => {
        const previous = receipts.get(request.operationId);
        if (previous) {
            expect(request.body).toBe(previous.body);
            return previous.response;
        }
        const body = JSON.parse(request.body);
        expect(body.ownerId).toBe('owner-a');
        expect(body.expectedRevision).toBe(revision);
        titles.push(body.document.title);
        revision = `cloud-${titles.length}`;
        const response = committed(request, revision);
        receipts.set(request.operationId, { body: request.body, response });
        return response;
    };
    return { transport, titles };
}

beforeEach(async () => {
    name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    book = connection();
    scope = (await book.switchAccount('owner-a'))!;
});

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(connections.splice(0).map((instance) => instance.close()));
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Test connection leaked.'));
    });
});

describe('account songbook on real IndexedDB', () => {
    it('reopens unsaved D while only explicit offline Saves A and C upload in order', async () => {
        const input = accountChart('A');
        const a = await book.save(scope, input, null);
        input.title = 'must not mutate queued A';
        await book.recover(scope, 'writer-1', { ...a.document, title: 'B' }, a.document.revision);
        const c = await book.save(scope, { ...a.document, title: 'C' }, a.document.revision);
        await book.recover(scope, 'writer-1', { ...c.document, title: 'D' }, c.document.revision);
        await book.close();
        book = connection();
        expect(await book.currentScope()).toEqual(scope);
        expect((await book.drafts(scope, 'study'))[0].document.title).toBe('D');
        const cloud = server();
        expect(await sendNext(book, scope, 'study', cloud.transport)).toBe('committed');
        expect((await book.read(scope, 'study'))?.document.title).toBe('C');
        expect(await sendNext(book, scope, 'study', cloud.transport)).toBe('committed');
        expect(await sendNext(book, scope, 'study', cloud.transport)).toBe('idle');
        expect(cloud.titles).toEqual(['A', 'C']);
        expect((await book.read(scope, 'study'))?.remoteRevision).toBe('cloud-2');
        expect((await book.drafts(scope, 'study'))[0].document.title).toBe('D');
    });

    it('rolls back the song write when adding its outbox record fails, retaining recovery', async () => {
        await book.recover(scope, 'writer', accountChart('unsaved'), null);
        const original = IDBObjectStore.prototype.add;
        const fault = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
            this: IDBObjectStore,
            ...args
        ) {
            if (this.name === 'operations') {
                throw new DOMException('Injected quota failure', 'QuotaExceededError');
            }
            return original.apply(this, args);
        });
        await expect(book.save(scope, accountChart(), null)).rejects.toMatchObject({
            name: 'QuotaExceededError',
        });
        fault.mockRestore();
        expect(await book.read(scope, 'study')).toBeNull();
        expect(await book.pending(scope, 'study')).toEqual([]);
        expect((await book.drafts(scope, 'study'))[0].document.title).toBe('unsaved');
        await expect(book.save(scope, accountChart(), null)).resolves.toMatchObject({
            document: { revision: 0 },
        });
    });

    it('rolls back an existing saved version as well when the next enqueue fails', async () => {
        const a = await book.save(scope, accountChart(), null);
        const original = IDBObjectStore.prototype.add;
        const fault = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
            this: IDBObjectStore,
            ...args
        ) {
            if (this.name === 'operations') {
                throw new DOMException('Injected abort', 'AbortError');
            }
            return original.apply(this, args);
        });
        await expect(book.save(scope, { ...a.document, title: 'B' }, 0)).rejects.toThrow(
            'Injected abort',
        );
        fault.mockRestore();
        expect((await book.read(scope, 'study'))?.document.title).toBe('A');
        expect((await book.pending(scope, 'study')).map((op) => op.snapshot.title)).toEqual(['A']);
    });

    it('retries byte-identically after the server commits but its response is lost', async () => {
        await book.save(scope, accountChart(), null);
        const cloud = server();
        let original: PreparedSave | undefined;
        expect(
            await sendNext(book, scope, 'study', async (request) => {
                original = structuredClone(request);
                await cloud.transport(request);
                throw new Error('Response lost');
            }),
        ).toBe('retry');
        await book.close();
        book = connection();
        expect(await prepared()).toEqual(original);
        expect(await sendNext(book, scope, 'study', cloud.transport)).toBe('committed');
        expect(cloud.titles).toEqual(['A']);
        expect(await book.pending(scope, 'study')).toEqual([]);
    });

    it('two independent connections serialize local compare-and-save and keep both writer drafts', async () => {
        const a = await book.save(scope, accountChart(), null);
        const other = connection();
        const otherScope = (await other.currentScope())!;
        await Promise.all([
            book.recover(scope, 'writer-1', { ...a.document, title: 'tab-one' }, 0),
            other.recover(otherScope, 'writer-2', { ...a.document, title: 'tab-two' }, 0),
        ]);
        const results = await Promise.allSettled([
            book.save(scope, { ...a.document, title: 'tab-one' }, 0),
            other.save(otherScope, { ...a.document, title: 'tab-two' }, 0),
        ]);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find((result) => result.status === 'rejected');
        expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
            LocalRevisionError,
        );
        expect(await book.pending(scope, 'study')).toHaveLength(2);
        expect(
            (await book.drafts(scope, 'study')).map((draft) => draft.document.title).sort(),
        ).toEqual(['tab-one', 'tab-two']);
    });

    it('duplicate senders reuse one frozen head and late duplicate acknowledgements cannot regress metadata', async () => {
        const a = await book.save(scope, accountChart(), null);
        await book.save(scope, { ...a.document, title: 'C' }, 0);
        const other = connection();
        const [first, duplicate] = await Promise.all([prepared(), prepared(other)]);
        expect(duplicate).toEqual(first);
        await book.acknowledge(scope, first, committed(first));
        const next = await prepared();
        expect(JSON.parse(next.body).expectedRevision).toBe('cloud-1');
        await book.acknowledge(scope, next, committed(next, 'cloud-2'));
        await other.acknowledge(scope, duplicate, committed(duplicate));
        expect((await book.read(scope, 'study'))?.remoteRevision).toBe('cloud-2');
        expect(await book.pending(scope, 'study')).toEqual([]);
    });

    it('preserves remote, queued local Saves and unsaved work when a revision conflicts', async () => {
        const a = await book.save(scope, accountChart(), null);
        const c = await book.save(scope, { ...a.document, title: 'C' }, 0);
        await book.recover(scope, 'writer', { ...c.document, title: 'D' }, 1);
        await book.save(scope, accountChart('independent', 'other-song'), null);
        const first = await prepared();
        await book.acknowledge(scope, first, {
            ...committed(first, 'remote-9'),
            kind: 'conflict',
            remote: { revision: 'remote-9', document: accountChart('remote') },
        });
        expect(await book.prepare(scope, 'study')).toBe('conflict');
        const ops = await book.pending(scope, 'study');
        expect(ops.map((op) => op.snapshot.title)).toEqual(['A', 'C']);
        expect(ops[0].remote?.document.title).toBe('remote');
        expect((await book.drafts(scope, 'study'))[0].document.title).toBe('D');
        expect(await prepared(book, scope, 'other-song')).toMatchObject({
            documentId: 'other-song',
        });
    });

    it('a missing/deleted remote song blocks the old identity rather than recreating it', async () => {
        await book.save(scope, accountChart(), null);
        const request = await prepared();
        await book.acknowledge(scope, request, {
            ...committed(request, 'deleted-2'),
            kind: 'conflict',
            remote: null,
        });
        expect((await book.pending(scope, 'study'))[0].remote).toBeNull();
        expect(await book.prepare(scope, 'study')).toBe('conflict');
    });

    it('account switching fences late responses, reads, saves and recoveries without relabeling work', async () => {
        const a = await book.save(scope, accountChart('private A'), null);
        const other = connection();
        const request = await prepared();
        const b = (await other.switchAccount('owner-b'))!;
        await expect(book.acknowledge(scope, request, committed(request))).rejects.toBeInstanceOf(
            AccountChangedError,
        );
        await expect(book.read(scope, 'study')).rejects.toBeInstanceOf(AccountChangedError);
        await expect(book.save(scope, a.document, 0)).rejects.toBeInstanceOf(AccountChangedError);
        await expect(book.recover(scope, 'writer', a.document, 0)).rejects.toBeInstanceOf(
            AccountChangedError,
        );
        expect(await other.read(b, 'study')).toBeNull();
        expect(await other.pending(b, 'study')).toEqual([]);
        await other.save(b, accountChart('private B'), null);
        const again = (await book.switchAccount('owner-a'))!;
        expect((await book.read(again, 'study'))?.document.title).toBe('private A');
        expect(await prepared(book, again)).toEqual(request);
        await expect(book.read(scope, 'study')).rejects.toBeInstanceOf(AccountChangedError);
    });

    it('an account switch during the transport wait leaves the old queued request intact', async () => {
        await book.save(scope, accountChart(), null);
        await expect(
            sendNext(book, scope, 'study', async (request) => {
                await book.switchAccount('owner-b');
                return committed(request);
            }),
        ).rejects.toBeInstanceOf(AccountChangedError);
        const back = (await book.switchAccount('owner-a'))!;
        expect(await book.pending(back, 'study')).toHaveLength(1);
        await book.switchAccount(null);
        expect(await book.currentScope()).toBeNull();
        await expect(book.pending(back, 'study')).rejects.toBeInstanceOf(AccountChangedError);
    });

    it('rejects misbound and malformed responses without acknowledging or losing the Save', async () => {
        await book.save(scope, accountChart(), null);
        const request = await prepared();
        for (const patch of [
            { ownerId: 'owner-b' },
            { documentId: 'wrong' },
            { digest: 'wrong' },
            { operationId: 'wrong' },
            { revision: '' },
        ]) {
            await expect(
                book.acknowledge(scope, request, { ...committed(request), ...patch }),
            ).rejects.toThrow();
        }
        await expect(
            book.acknowledge(scope, { ...request, body: `${request.body} ` }, committed(request)),
        ).rejects.toThrow('Invalid prepared');
        expect(await book.pending(scope, 'study')).toHaveLength(1);
        expect((await book.read(scope, 'study'))?.remoteRevision).toBeNull();
    });

    it('validates before writes and does not treat unknown versions as empty songs', async () => {
        await expect(
            book.save(scope, { ...accountChart(), schemaVersion: 99 }, null),
        ).rejects.toThrow('chart version');
        await expect(
            book.save(scope, { ...accountChart(), title: 'x'.repeat(1_100_000) }, null),
        ).rejects.toThrow();
        await expect(book.save(scope, accountChart(), Number.NaN)).rejects.toThrow('revision');
        expect(await book.pending(scope, 'study')).toEqual([]);
        expect(await book.read(scope, 'study')).toBeNull();
    });

    it('retries opening after storage was unavailable instead of memoizing a rejected promise', async () => {
        await book.close();
        const fault = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
            throw new DOMException('Storage denied', 'SecurityError');
        });
        await expect(book.currentScope()).rejects.toThrow('Storage denied');
        fault.mockRestore();
        expect(await book.currentScope()).toEqual(scope);
    });

    it('reports a blocked open, closes its late connection, and permits a retry', async () => {
        await book.close();
        const open = indexedDB.open.bind(indexedDB);
        let late: Promise<void> | undefined;
        const fault = vi.spyOn(indexedDB, 'open').mockImplementationOnce((...args) => {
            const request = open(...args);
            late = new Promise<void>((resolve) =>
                request.addEventListener('success', () => resolve()),
            );
            queueMicrotask(() => request.dispatchEvent(new Event('blocked')));
            return request;
        });
        await expect(book.currentScope()).rejects.toThrow('blocked by another tab');
        await late;
        fault.mockRestore();
        expect(await book.currentScope()).toEqual(scope);
    });

    it('rolls back receipt, metadata and queue removal together if acknowledgement storage fails', async () => {
        await book.save(scope, accountChart(), null);
        const request = await prepared();
        const original = IDBObjectStore.prototype.add;
        const fault = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
            this: IDBObjectStore,
            ...args
        ) {
            if (this.name === 'receipts') {
                throw new DOMException('Receipt quota', 'QuotaExceededError');
            }
            return original.apply(this, args);
        });
        await expect(book.acknowledge(scope, request, committed(request))).rejects.toThrow(
            'Receipt quota',
        );
        fault.mockRestore();
        expect((await book.read(scope, 'study'))?.remoteRevision).toBeNull();
        expect(await prepared()).toEqual(request);
        await book.acknowledge(scope, request, committed(request));
        expect(await book.pending(scope, 'study')).toEqual([]);
    });

    it('captures the calling account before yielding, even if its session object is mutated', async () => {
        const mutable = { ...scope };
        const saving = book.save(mutable, accountChart(), null);
        mutable.ownerId = 'owner-b';
        await saving;
        expect((await book.read(scope, 'study'))?.ownerId).toBe('owner-a');
        const b = (await book.switchAccount('owner-b'))!;
        expect(await book.read(b, 'study')).toBeNull();
    });

    it('a full pending queue refuses only the next Save, preserving prior saved and unsaved work', async () => {
        for (let revision = 0; revision < MAX_PENDING_SAVES; revision++) {
            await book.save(
                scope,
                accountChart(`saved-${revision}`),
                revision === 0 ? null : revision - 1,
            );
        }
        await book.recover(scope, 'writer', accountChart('unsaved'), MAX_PENDING_SAVES - 1);
        await expect(
            book.save(scope, accountChart('overflow'), MAX_PENDING_SAVES - 1),
        ).rejects.toThrow('Too many pending Saves');
        expect((await book.read(scope, 'study'))?.document.title).toBe(
            `saved-${MAX_PENDING_SAVES - 1}`,
        );
        expect(await book.pending(scope, 'study')).toHaveLength(MAX_PENDING_SAVES);
        expect((await book.drafts(scope, 'study'))[0].document.title).toBe('unsaved');
    });

    it('rejects corrupt frozen bytes without replacing or deleting the original queued record', async () => {
        await book.save(scope, accountChart(), null);
        const request = await prepared();
        const raw = await new Promise<IDBDatabase>((resolve) => {
            const opening = indexedDB.open(name, 1);
            opening.onsuccess = () => resolve(opening.result);
        });
        try {
            await new Promise<void>((resolve, reject) => {
                const tx = raw.transaction('operations', 'readwrite');
                const store = tx.objectStore('operations');
                const read = store.get([scope.ownerId, request.operationId]);
                read.onsuccess = () => {
                    const body = JSON.parse(read.result.wireBody);
                    body.ownerId = 'owner-b';
                    store.put({ ...read.result, wireBody: JSON.stringify(body) });
                };
                tx.oncomplete = () => resolve();
                tx.onabort = () => reject(tx.error);
            });
            await expect(book.prepare(scope, 'study')).rejects.toThrow('does not match');
            expect((await book.read(scope, 'study'))?.document.title).toBe('A');
            const retained = await new Promise<unknown>((resolve, reject) => {
                const tx = raw.transaction('operations');
                const read = tx.objectStore('operations').get([scope.ownerId, request.operationId]);
                // Why: request success precedes transaction completion. WebKit can still
                // block cleanup if close/delete race the final raw inspection transaction.
                tx.oncomplete = () => resolve(read.result);
                tx.onabort = () => reject(tx.error);
            });
            expect(retained).toMatchObject({
                snapshot: { title: 'A' },
                operationId: request.operationId,
            });
        } finally {
            raw.close();
        }
    });
});
