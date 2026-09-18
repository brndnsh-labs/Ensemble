import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runOutboxPass } from '../../prototypes/v2/lib/sync/drain.js';
import {
    ACCOUNT_DATABASE,
    AccountChangedError,
    type AccountScope,
    type ChartDocument,
    LocalRevisionError,
    lastOpenedKey,
    MAX_PENDING_SAVES,
    type PreparedSave,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { decodeSaveRequest } from '../../prototypes/v2/lib/sync/request.js';
import { sendNext } from '../../prototypes/v2/lib/sync/send.js';
import type { ChartDocumentV2 } from '../../public/songbook/score-types.js';
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

/**
 * Small synthetic semantic chart — original content, never a personal export. It exists to
 * pin the authored shapes a v1 `"C7 | F7"` section string simply cannot express, so that a
 * regression which quietly re-flattened v2 into v1 on the way through storage would fail
 * here: reduced rational durations (triplets and a dotted half), stable measure identities
 * referenced by a repeat measure, a mid-score key change, authored repeat/ending directions,
 * and a retained import source that must travel verbatim and stay inert.
 *
 * Band and performance are borrowed from the legacy fixture on purpose: they are the
 * unchanged v1 contracts that `validateChartDocumentV2` reuses, and duplicating them here
 * would only create a second thing to drift.
 */
function semanticChart(title = 'A', id = 'study'): ChartDocumentV2 {
    const legacy = accountChart(title, id);
    return {
        schemaVersion: 2,
        id,
        title,
        revision: 0,
        createdAt: legacy.createdAt,
        updatedAt: legacy.updatedAt,
        metadata: { composer: 'Synthetic Author', style: 'Medium swing' },
        // Retained exactly as imported and never re-interpreted as markup or re-parsed.
        importSource: {
            format: 'irealb',
            text: 'irealb://Synthetic%20Study=Author%20Test==Medium%20Swing==C==1r34LbKcu7ZL',
        },
        chart: {
            performance: legacy.chart.performance,
            band: legacy.chart.band,
            score: {
                notation: 'name',
                key: 'C',
                isMinor: false,
                meter: '4/4',
                grouping: null,
                sections: [
                    {
                        id: 'head',
                        label: 'A',
                        repeat: 2,
                        measures: [
                            {
                                id: 'head-1',
                                start: [{ kind: 'repeat-start' }],
                                content: {
                                    kind: 'events',
                                    // Quarter-note triplets plus a dotted half: thirds and
                                    // halves that only survive as reduced rationals.
                                    events: [
                                        {
                                            kind: 'chord',
                                            symbol: 'C7',
                                            duration: [1, 3],
                                            alternates: ['C9'],
                                        },
                                        { kind: 'chord', symbol: 'F7', duration: [1, 3] },
                                        { kind: 'chord', symbol: 'C7', duration: [1, 3] },
                                        {
                                            kind: 'chord',
                                            symbol: 'G7',
                                            duration: [3, 1],
                                            fermata: true,
                                        },
                                    ],
                                },
                                annotations: [{ text: 'Head in', at: [0, 1], placement: 'above' }],
                            },
                            {
                                id: 'head-2',
                                // Context change: persists to later measures in this section.
                                key: 'Eb',
                                start: [{ kind: 'ending-start', passes: [1] }],
                                content: {
                                    kind: 'events',
                                    events: [
                                        { kind: 'chord', symbol: 'Bb7', duration: [3, 2] },
                                        { kind: 'no-chord', duration: [1, 2] },
                                        { kind: 'hold', duration: [2, 1] },
                                    ],
                                },
                                end: [{ kind: 'repeat-end', times: 2 }, { kind: 'ending-end' }],
                            },
                            {
                                id: 'head-3',
                                start: [{ kind: 'ending-start', passes: [2] }],
                                // Explicit earlier source identity, not a copied bar.
                                content: {
                                    kind: 'repeat',
                                    measureId: 'head-1',
                                    display: 'one-bar',
                                },
                                end: [{ kind: 'ending-end' }],
                            },
                        ],
                    },
                ],
            },
        },
    };
}

/** These cases only ever store v2; narrow rather than cast so a v1 leak fails loudly. */
function semantic(document: ChartDocument): ChartDocumentV2 {
    if (document.schemaVersion !== 2) {
        throw new Error(`Expected a semantic chart, received version ${document.schemaVersion}`);
    }
    return document;
}

/**
 * Let the wall clock move on before the next write.
 *
 * `capturedAt` against `updatedAt` is the entire vocabulary of the live-draft rule (#1299), and
 * both are `new Date().toISOString()` at millisecond resolution — so a recovery and a Save issued
 * in the same tick carry the SAME stamp, and a test that means "captured before this commit" would
 * otherwise assert it only some of the time.
 */
function tick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 5));
}

/** Direct database access, to plant records no public API can produce. */
async function rawDatabase(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const opening = indexedDB.open(name, 1);
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
    });
}

function rawWrite(raw: IDBDatabase, store: string, mutate: (table: IDBObjectStore) => void) {
    return new Promise<void>((resolve, reject) => {
        const tx = raw.transaction(store, 'readwrite');
        mutate(tx.objectStore(store));
        // Why: a request's success fires before the transaction commits; waiting on
        // completion keeps WebKit from racing the next open or the cleanup delete.
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
    });
}

function rawRead<T>(raw: IDBDatabase, store: string, key: IDBValidKey): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const tx = raw.transaction(store);
        const request = tx.objectStore(store).get(key);
        tx.oncomplete = () => resolve(request.result as T);
        tx.onabort = () => reject(tx.error);
    });
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

    it('two independent connections serialize local compare-and-save, and the loser re-retains', async () => {
        const a = await book.save(scope, accountChart(), null);
        const other = connection();
        const otherScope = (await other.currentScope())!;
        await Promise.all([
            book.recover(scope, 'writer-1', { ...a.document, title: 'tab-one' }, 0),
            other.recover(otherScope, 'writer-2', { ...a.document, title: 'tab-two' }, 0),
        ]);
        await tick();
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
        // Both rows were captured against revision 0, and the Save that won has moved past it, so
        // neither is an experiment on the committed version any longer and `save()` retires both
        // (#1299 patch review P1). Nothing readable is lost: `retainedDraft` already refused to
        // offer a row older than the version it sits on, so these were unreachable either way.
        expect(await book.drafts(scope, 'study')).toEqual([]);
        // And the tab whose Save was refused has not been robbed — its text is still live in that
        // tab, and its next keystroke retains it against the version that won. That row IS an
        // experiment on the committed version, and it stays.
        const won = (await book.read(scope, 'study'))!;
        await other.recover(
            otherScope,
            'writer-2',
            { ...won.document, title: 'tab-two' },
            won.document.revision,
        );
        expect((await book.drafts(scope, 'study')).map((draft) => draft.document.title)).toEqual([
            'tab-two',
        ]);
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

    describe('a permanent transport-level refusal (#1298)', () => {
        it('stops preparing a refused head, and a fresh Save of the same document replaces it', async () => {
            await book.save(scope, accountChart(), null);
            const first = await prepared();

            expect(await book.refuse(scope, 'study', first.operationId, 'too-large')).toBe(
                'refused',
            );
            expect(await book.prepare(scope, 'study')).toBe('refused');
            const refusedOps = await book.pending(scope, 'study');
            expect(refusedOps).toHaveLength(1);
            expect(refusedOps[0]).toMatchObject({ status: 'refused', reason: 'too-large' });

            // A smaller re-Save of the SAME document: the queue becomes [new], not
            // [refused, new] — the refused head is deleted, not queued behind.
            const smaller = await book.save(scope, { ...refusedOps[0].snapshot, title: 'B' }, 0);
            const ops = await book.pending(scope, 'study');
            expect(ops).toHaveLength(1);
            expect(ops[0]).toMatchObject({ status: 'queued', documentId: 'study' });
            expect(ops[0].reason).toBeUndefined();
            expect(smaller.document.title).toBe('B');

            // Prepares cleanly and can now actually send — no `'refused'` verdict blocking it.
            const next = await prepared();
            expect(JSON.parse(next.body).document.title).toBe('B');
        });

        it('is a no-op once the head has already resolved a different way', async () => {
            await book.save(scope, accountChart(), null);
            const request = await prepared();
            await book.acknowledge(scope, request, {
                ...committed(request, 'remote-1'),
                kind: 'conflict',
                remote: { revision: 'remote-1', document: accountChart('remote') },
            });

            // The queue's head is already 'conflict', not the plain 'queued' this call expects.
            expect(await book.refuse(scope, 'study', request.operationId, 'refused')).toBe('none');
            expect(await book.prepare(scope, 'study')).toBe('conflict');
        });

        it('reports none against an empty queue rather than inventing a refusal', async () => {
            expect(await book.refuse(scope, 'never-saved', crypto.randomUUID(), 'refused')).toBe(
                'none',
            );
        });

        it('refuses the operation the transport named, never whichever Save is the head now', async () => {
            // #1298 patch review P1: this account's outbox is shared by every open tab, so a
            // second tab can commit the head and the musician can queue a fresh Save behind it
            // while a late 413 for the FIRST operation is still unwinding. Marking by position
            // would then permanently refuse a Save that was never sent — and the only way out is a
            // re-Save the musician has no reason to know they owe.
            const a = await book.save(scope, accountChart(), null);
            const first = await prepared();
            await book.acknowledge(scope, first, committed(first, 'cloud-1'));
            // The Save the musician makes next; the account has never seen these bytes.
            await book.save(scope, { ...a.document, title: 'B' }, 0);

            expect(await book.refuse(scope, 'study', first.operationId, 'too-large')).toBe('none');

            const ops = await book.pending(scope, 'study');
            expect(ops.map((op) => op.status)).toEqual(['queued']);
            // Still sendable, which is the whole point: a stale capture cannot condemn it.
            expect(JSON.parse((await prepared()).body).document.title).toBe('B');
        });

        it('does not strip a CONFLICTED head — only a refused one — so Keep-both still has both bytes', async () => {
            // #1298 patch scope: `save()`'s new stripping logic checks `status === 'refused'`
            // specifically. A conflicted head (#1267's Keep-both target) must keep queuing
            // ordinary Saves behind it exactly as before, since Keep-both reads the newest
            // queued snapshot to carry forward.
            const a = await book.save(scope, accountChart(), null);
            const request = await prepared();
            await book.acknowledge(scope, request, {
                ...committed(request, 'remote-1'),
                kind: 'conflict',
                remote: { revision: 'remote-1', document: accountChart('remote') },
            });
            await book.save(scope, { ...a.document, title: 'C' }, 0);

            const ops = await book.pending(scope, 'study');
            expect(ops.map((op) => op.status)).toEqual(['conflict', 'queued']);
            expect(await book.prepare(scope, 'study')).toBe('conflict');
        });

        it('retires the whole queue with a refused head, so nothing is left based on a deleted Save', async () => {
            // #1298 patch review P0. Every operation behind the head is chained to it by
            // `base: { operationId }`. Dropping ONLY the refused head left the next one basing
            // itself on a row that no longer existed, and `prepare()` answers that with a THROW —
            // which `runOutboxPass` does not step over, so every later pass for the whole account
            // rejected on this one song. There was no way back out of it from inside the app.
            const a = await book.save(scope, accountChart(), null);
            const first = await prepared();
            // Queued behind the frozen head, so its base is that operation id, not a revision.
            const b = await book.save(scope, { ...a.document, title: 'B' }, 0);
            expect((await book.pending(scope, 'study'))[1].base).toEqual({
                operationId: first.operationId,
            });

            expect(await book.refuse(scope, 'study', first.operationId, 'too-large')).toBe(
                'refused',
            );
            await book.save(scope, { ...b.document, title: 'C' }, 1);

            // One operation, not two: the orphan retired with the head that was its base.
            const ops = await book.pending(scope, 'study');
            expect(ops).toHaveLength(1);
            expect(ops[0]).toMatchObject({ status: 'queued', localRevision: 2 });
            // Resolves rather than throwing, and is based on what the account actually confirmed
            // for this record — nothing in that queue was ever committed.
            const next = await prepared();
            expect(JSON.parse(next.body).expectedRevision).toBe(
                (await book.read(scope, 'study'))?.remoteRevision ?? null,
            );
            expect(JSON.parse(next.body).document.title).toBe('C');

            // And the account's outbox as a whole still moves: the pass that used to reject on
            // this song now walks past it and sends the next one.
            await book.save(scope, accountChart('other', 'etude'), null);
            const titles: string[] = [];
            const result = await runOutboxPass(book, scope, async (request) => {
                titles.push(JSON.parse(request.body).document.title);
                return committed(request, `cloud-${titles.length}`);
            });
            expect(result.kind).toBe('complete');
            // Ordered by document id, so `etude` before `study`; both sent, neither rejected.
            expect(titles).toEqual(['other', 'C']);
        });
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

    it('mints a fresh operation id for every Save, which no caller can override', async () => {
        // #1268 patch review P0: a caller-supplied operation id was briefly part of this signature,
        // for adoption's deterministic ids. It is gone, and this is what holds it gone — a
        // deterministic operation id is unsafe, not retry-safe: the server's receipts never expire
        // and replay only an EXACT byte match, while `updatedAt` below moves on every call, so the
        // same id sent twice earns a permanent `operation_mismatch`.
        const a = await book.save(scope, accountChart('C', 'study'), null);
        const b = await book.save(scope, { ...a.document, title: 'D' }, a.document.revision);
        const [firstQueued, secondQueued] = await book.pending(scope, 'study');
        expect(firstQueued.operationId).not.toBe(secondQueued.operationId);
        expect(b.document.title).toBe('D');
    });

    it('rejects recreating a document under its own deterministic id, so a retried adoption cannot duplicate it', async () => {
        // The retry-safety #1268 relies on, and it is the DOCUMENT id that carries it: the same
        // deterministic id re-submitted as a create (`expected = null`), exactly as a rerun after
        // an interrupted copy would, finds the song already there and refuses rather than creating
        // a second one.
        await book.save(scope, accountChart('adopted', 'guest-song'), null);
        await expect(
            book.save(scope, accountChart('adopted', 'guest-song'), null),
        ).rejects.toBeInstanceOf(LocalRevisionError);
        expect(await book.pending(scope, 'guest-song')).toHaveLength(1);
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

    it('carries every authored semantic field through reopen, ordered sends and acknowledgement', async () => {
        const authored = semanticChart();
        const input = semanticChart();
        const a = await book.save(scope, input, null);
        // A caller that keeps editing its own object cannot reach the queued snapshot.
        input.title = 'must not mutate queued A';
        input.chart.score.sections[0].measures[0].id = 'rewritten';
        await book.recover(scope, 'writer-1', { ...a.document, title: 'B' }, a.document.revision);
        const c = await book.save(scope, { ...a.document, title: 'C' }, a.document.revision);
        await book.recover(scope, 'writer-1', { ...c.document, title: 'D' }, c.document.revision);

        await book.close();
        book = connection();
        expect(await book.currentScope()).toEqual(scope);

        const sent: ChartDocumentV2[] = [];
        const cloud = server();
        const transport = async (request: PreparedSave) => {
            sent.push(semantic(JSON.parse(request.body).document));
            return cloud.transport(request);
        };
        expect(await sendNext(book, scope, 'study', transport)).toBe('committed');
        expect(await sendNext(book, scope, 'study', transport)).toBe('committed');
        expect(await sendNext(book, scope, 'study', transport)).toBe('idle');
        expect(cloud.titles).toEqual(['A', 'C']);

        // Every frozen body carried the authored score, source and metadata verbatim.
        expect(sent).toHaveLength(2);
        for (const document of sent) {
            expect(document.chart.score).toEqual(authored.chart.score);
            expect(document.importSource).toEqual(authored.importSource);
            expect(document.metadata).toEqual(authored.metadata);
        }
        expect(sent.map((document) => document.title)).toEqual(['A', 'C']);

        const saved = await book.read(scope, 'study');
        expect(saved?.remoteRevision).toBe('cloud-2');
        expect(saved?.document.title).toBe('C');
        const storedScore = semantic(saved!.document).chart.score;
        expect(storedScore).toEqual(authored.chart.score);
        // Spot-check the shapes v1 cannot hold, so a flattening regression cannot pass by
        // matching a stale expectation object that was itself flattened.
        const [first, second, third] = storedScore.sections[0].measures;
        expect(first.content).toMatchObject({ kind: 'events' });
        expect(first.content.kind === 'events' && first.content.events[0].duration).toEqual([1, 3]);
        expect(second.key).toBe('Eb');
        expect(second.end).toEqual([{ kind: 'repeat-end', times: 2 }, { kind: 'ending-end' }]);
        expect(third.content).toEqual({
            kind: 'repeat',
            measureId: 'head-1',
            display: 'one-bar',
        });
        expect(semantic(saved!.document).importSource).toEqual(authored.importSource);

        // D is still the latest unsaved writer recovery, unchanged by two acknowledgements.
        const drafts = await book.drafts(scope, 'study');
        expect(drafts).toHaveLength(1);
        expect(drafts[0].document.title).toBe('D');
        expect(semantic(drafts[0].document).chart.score).toEqual(authored.chart.score);
        expect(await book.pending(scope, 'study')).toEqual([]);
    });

    it('retries a semantic Save byte-identically after a lost response, never unfolding the score', async () => {
        const authored = semanticChart();
        await book.save(scope, semanticChart(), null);
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
        // Newer local work exists by the time the retry lands; it must survive intact.
        await book.recover(scope, 'writer-1', semanticChart('newer local'), 0);

        const retry = await prepared();
        expect(retry).toEqual(original);
        expect(retry.operationId).toBe(original?.operationId);
        expect(retry.digest).toBe(original?.digest);
        expect(retry.body).toBe(original?.body);
        expect(semantic(JSON.parse(retry.body).document).chart.score).toEqual(authored.chart.score);

        expect(await sendNext(book, scope, 'study', cloud.transport)).toBe('committed');
        // The server saw one commit; the retry was recognised, not re-applied.
        expect(cloud.titles).toEqual(['A']);
        expect(await book.pending(scope, 'study')).toEqual([]);

        const saved = await book.read(scope, 'study');
        expect(saved?.remoteRevision).toBe('cloud-1');
        expect(semantic(saved!.document).chart.score).toEqual(authored.chart.score);
        expect(semantic(saved!.document).importSource).toEqual(authored.importSource);
        const drafts = await book.drafts(scope, 'study');
        expect(drafts.map((draft) => draft.document.title)).toEqual(['newer local']);
        expect(semantic(drafts[0].document).chart.score).toEqual(authored.chart.score);
    });

    it('detaches stored semantic content from caller objects and from returned reads and drafts', async () => {
        const authored = semanticChart();
        const input = semanticChart();
        const saved = await book.save(scope, input, null);
        await book.recover(scope, 'writer-1', semanticChart('unsaved'), 0);

        // Detachment, not merely IndexedDB's structured clone at the write boundary: the
        // stored value must already be a copy, or a caller mutating its object during the
        // async window between validation and the write would land inside the snapshot.
        // Asserting identity catches that; asserting content after the write cannot.
        expect(saved.document).not.toBe(input);
        expect(saved.document.chart).not.toBe(input.chart);
        expect(semantic(saved.document).chart.score).not.toBe(input.chart.score);
        expect(semantic(saved.document).importSource).not.toBe(input.importSource);

        // Mutate the caller's own object after the Save returned...
        input.chart.score.key = 'F#';
        input.chart.score.sections[0].measures[0].id = 'rewritten';
        input.chart.score.sections[0].measures.length = 1;
        input.importSource!.text = 'tampered';
        input.metadata!.composer = 'tampered';
        // ...the object Save handed back...
        const returned = semantic(saved.document);
        returned.chart.score.sections[0].label = 'rewritten';
        returned.chart.score.sections[0].measures = [];
        returned.importSource!.text = 'tampered';
        // ...and the objects the read and draft accessors handed back.
        const firstRead = semantic((await book.read(scope, 'study'))!.document);
        firstRead.chart.score.sections[0].measures[0].content = { kind: 'events', events: [] };
        firstRead.metadata!.style = 'tampered';
        const firstDraft = (await book.drafts(scope, 'study'))[0];
        semantic(firstDraft.document).chart.score.sections[0].measures = [];

        // Nothing above reached storage: score, source and metadata are all still authored.
        const reread = semantic((await book.read(scope, 'study'))!.document);
        expect(reread.chart.score).toEqual(authored.chart.score);
        expect(reread.importSource).toEqual(authored.importSource);
        expect(reread.metadata).toEqual(authored.metadata);
        expect(reread.chart.score.sections[0].measures).toHaveLength(3);

        const queued = semantic((await book.pending(scope, 'study'))[0].snapshot);
        expect(queued.chart.score).toEqual(authored.chart.score);
        expect(queued.importSource).toEqual(authored.importSource);

        const redraft = (await book.drafts(scope, 'study'))[0];
        expect(semantic(redraft.document).chart.score).toEqual(authored.chart.score);
        expect(semantic(redraft.document).chart.score.sections[0].measures).toHaveLength(3);

        // The frozen wire body is built from storage, not from any mutated caller object.
        const request = await prepared();
        expect(semantic(JSON.parse(request.body).document).chart.score).toEqual(
            authored.chart.score,
        );
    });

    it('fails reads of an unsupported saved version and a malformed draft, leaving raw records intact', async () => {
        await book.save(scope, semanticChart(), null);
        await book.recover(scope, 'writer-1', semanticChart('unsaved'), 0);
        await book.close();

        const raw = await rawDatabase();
        try {
            const song = await rawRead<{ document: ChartDocumentV2 }>(raw, 'songs', [
                scope.ownerId,
                'study',
            ]);
            const planted = {
                ...song,
                document: { ...song.document, schemaVersion: 99 },
            };
            await rawWrite(raw, 'songs', (table) => table.put(planted));
            // A draft whose score is structurally wrong rather than merely a future version.
            const draftKey = [scope.ownerId, 'study', 'writer-1'];
            const draft = await rawRead<{ document: ChartDocumentV2 }>(raw, 'drafts', draftKey);
            const malformed = {
                ...draft,
                document: {
                    ...draft.document,
                    chart: {
                        ...draft.document.chart,
                        score: { ...draft.document.chart.score, sections: 'not a list' },
                    },
                },
            };
            await rawWrite(raw, 'drafts', (table) => table.put(malformed));
            raw.close();

            book = connection();
            // Public reads fail explicitly. They do not fall back to an empty library, and
            // they do not quarantine, migrate or delete the record they could not read.
            await expect(book.read(scope, 'study')).rejects.toThrow(
                'Cannot sync this chart version or content',
            );
            await expect(book.drafts(scope, 'study')).rejects.toThrow();
            await book.close();

            const after = await rawDatabase();
            try {
                expect(await rawRead(after, 'songs', [scope.ownerId, 'study'])).toEqual(planted);
                expect(await rawRead(after, 'drafts', draftKey)).toEqual(malformed);
            } finally {
                after.close();
            }
        } finally {
            raw.close();
        }
    });

    /**
     * The server-side decoder's compatibility with the REAL producer.
     *
     * `tests/unit/songbook/sync-request.test.ts` builds its request bodies with a hand-copied
     * replica of `prepare()`'s serialization, so on its own it pins the replica, not the
     * contract: bumping `protocolVersion` in `repository.ts` leaves every one of those unit
     * tests green while rejecting every real Save. Verified — that is why this lives here,
     * where a genuine frozen `wireBody` exists.
     */
    it('the server decoder accepts the exact bytes prepare() froze, for v1 and v2 charts', async () => {
        for (const [label, chart] of [
            ['v1', accountChart('A', 'study')],
            ['v2', semanticChart('A', 'study')],
        ] as const) {
            const fresh = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
            const isolated = new AccountSongbook(fresh);
            connections.push(isolated);
            const owner = (await isolated.switchAccount('owner-a'))!;
            await isolated.save(owner, chart, null);
            const request = await isolated.prepare(owner, 'study');
            if (typeof request === 'string') {
                throw new Error(`Expected a frozen request for ${label}, got ${request}`);
            }

            const decoded = await decodeSaveRequest(request.body, owner.ownerId);
            expect(decoded.ownerId).toBe(owner.ownerId);
            expect(decoded.documentId).toBe('study');
            expect(decoded.operationId).toBe(request.operationId);
            expect(decoded.expectedRevision).toBeNull();
            // Both sides independently hashed the same bytes: the client's frozen digest is
            // the one a receipt would be bound to, so they must agree exactly.
            expect(decoded.digest).toBe(request.digest);
            expect(decoded.document).toEqual(JSON.parse(request.body).document);
            // And the authenticated-owner check is live on the real bytes too.
            await expect(decodeSaveRequest(request.body, 'owner-b')).rejects.toThrow(
                'does not match the authenticated account',
            );
        }
    });
});

/**
 * The two stores an account chart's unsaved experiment needs beside `recover`/`drafts` (#1299):
 * dropping THIS writer's row after a Save, and remembering which chart was on the stand.
 *
 * Both are proven here rather than against a fake store because both are key-shape claims — a
 * three-part `drafts` key path, and one `meta` key in a store shared by four namespaces.
 */
describe('retention beside the account songbook', () => {
    it('drops only this writer’s draft, leaving another tab’s live experiment alone', async () => {
        await book.save(scope, accountChart('Set list'), null);
        await book.recover(scope, 'writer-1', accountChart('mine'), 0);
        await book.recover(scope, 'writer-2', accountChart('theirs'), 0);

        await book.discardDraft(scope, 'study', 'writer-1');

        const left = await book.drafts(scope, 'study');
        expect(left.map((draft) => draft.writerId)).toEqual(['writer-2']);
        expect(left[0].document.title).toBe('theirs');
        // A writer with nothing stored is not an error: a Save with no experiment behind it is
        // the ordinary case, and it must not fail the thing that just committed.
        await expect(book.discardDraft(scope, 'study', 'writer-3')).resolves.toBeUndefined();

        // A revert takes the LOT (#1299 patch review P1): the row an open recovered from belongs
        // to an earlier page load, so dropping only this writer's would leave the edit the
        // musician just reverted away from to be recovered again on the next open. Bounded to
        // this document — the writer id is the third key element, and the next song's rows are
        // outside the range.
        await book.recover(scope, 'writer-1', accountChart('mine again'), 0);
        await book.save(scope, accountChart('other', 'other-song'), null);
        await book.recover(scope, 'writer-1', accountChart('elsewhere', 'other-song'), 0);

        await book.discardDrafts(scope, 'study');

        expect(await book.drafts(scope, 'study')).toEqual([]);
        expect((await book.drafts(scope, 'other-song'))[0].document.title).toBe('elsewhere');
    });

    it('a Save retires every writer’s superseded draft, and a dead row stops holding the record', async () => {
        // #1299 patch review P1. A writer id is per PAGE LOAD and a Save only ever dropped the
        // writer that saved, so edit → reload → edit → Save left the first page load's row behind
        // for good. Nothing read it again, but everything COUNTED it: every later remote advance
        // was preserved as a candidate instead of adopted, the sign-out step announced an unsaved
        // experiment, and a cloud delete answered `retained` — for the life of the account.
        const first = await book.save(scope, accountChart('take one'), null);
        await book.recover(
            scope,
            'writer-1',
            { ...first.document, title: 'W1 idea' },
            first.document.revision,
        );
        await book.recover(
            scope,
            'writer-2',
            { ...first.document, title: 'W2 idea' },
            first.document.revision,
        );
        expect(await book.drafts(scope, 'study')).toHaveLength(2);

        await tick();
        const second = await book.save(
            scope,
            { ...first.document, title: 'take two' },
            first.document.revision,
        );
        // Both rows, not just the saving writer's: each was captured against the version this
        // Save has now moved past, so neither would ever be offered to anybody again.
        expect(await book.drafts(scope, 'study')).toEqual([]);
        expect(second.document.title).toBe('take two');

        // A row this build did not write — an older build's, or one whose own Save happened in
        // another tab — is never pruned, so the PREDICATE has to be what stops it holding the
        // record. Planted directly, since nothing public can produce one any more.
        const raw = await rawDatabase();
        try {
            await rawWrite(raw, 'drafts', (table) =>
                table.put({
                    ownerId: 'owner-a',
                    documentId: 'study',
                    writerId: 'writer-0',
                    document: accountChart('from a page load long gone'),
                    baseRevision: 0,
                    capturedAt: '2020-01-01T00:00:00.000Z',
                }),
            );
        } finally {
            raw.close();
        }

        // Drain the outbox, so the queue is not what holds this record instead.
        const a = await prepared();
        await book.acknowledge(scope, a, committed(a, 'cloud-1'));
        const b = await prepared();
        await book.acknowledge(scope, b, committed(b, 'cloud-2'));
        expect(await book.pending(scope, 'study')).toEqual([]);

        expect(
            await book.reconcile(
                scope,
                {
                    kind: 'version',
                    documentId: 'study',
                    revision: 'cloud-3',
                    document: accountChart('from the cloud'),
                },
                { expectedRemoteRevision: 'cloud-2' },
            ),
        ).toBe('advanced');
        expect((await book.read(scope, 'study'))?.document.title).toBe('from the cloud');
        // Preserved where it lies, though: it is not counted, and it is not destroyed either.
        expect((await book.drafts(scope, 'study')).map((draft) => draft.writerId)).toEqual([
            'writer-0',
        ]);

        // And the direction that must NOT be lost — the story's own acceptance. A LIVE experiment
        // on a chart nobody has open still holds it: the cloud's next version is preserved as a
        // candidate rather than written over an edit that exists only here.
        const current = (await book.read(scope, 'study'))!;
        await book.recover(
            scope,
            'writer-3',
            { ...current.document, title: 'still editing' },
            current.document.revision,
        );
        expect(
            await book.reconcile(
                scope,
                {
                    kind: 'version',
                    documentId: 'study',
                    revision: 'cloud-4',
                    document: accountChart('newer still'),
                },
                { expectedRemoteRevision: 'cloud-3' },
            ),
        ).toBe('candidate');
        expect((await book.read(scope, 'study'))?.document.title).toBe('from the cloud');
        expect((await book.remoteCandidate(scope, 'study'))?.revision).toBe('cloud-4');
    });

    it('refuses to discard a draft for an account that is no longer the active one', async () => {
        await book.recover(scope, 'writer-1', accountChart('mine'), 0);
        await book.switchAccount('owner-b');

        await expect(book.discardDraft(scope, 'study', 'writer-1')).rejects.toBeInstanceOf(
            AccountChangedError,
        );
        const back = (await book.switchAccount('owner-a'))!;
        expect(await book.drafts(back, 'study')).toHaveLength(1);
    });

    it('remembers the chart on the stand per account, and answers null before anything opened', async () => {
        expect(await book.lastOpened(scope)).toBeNull();

        await book.rememberOpened(scope, 'study');
        expect(await book.lastOpened(scope)).toBe('study');
        // Replaced, never appended: it is one fact per account.
        await book.rememberOpened(scope, 'take');
        expect(await book.lastOpened(scope)).toBe('take');

        // Another account on the same device has its own, and cannot read this one.
        const other = (await book.switchAccount('owner-b'))!;
        expect(await book.lastOpened(other)).toBeNull();
        await book.rememberOpened(other, 'b-song');
        const mine = (await book.switchAccount('owner-a'))!;
        expect(await book.lastOpened(mine)).toBe('take');
    });

    it('reads a corrupt preference as no preference rather than failing the songbook', async () => {
        // Unlike every other read in the repository: nothing downstream treats this as content,
        // and failing a library read over a cosmetic Continue card is the worse answer.
        await book.rememberOpened(scope, 'study');
        const raw = await rawDatabase();
        try {
            await rawWrite(raw, 'meta', (table) =>
                table.put({
                    key: lastOpenedKey('owner-a'),
                    ownerId: 'owner-a',
                    documentId: { not: 'an id' },
                }),
            );
        } finally {
            raw.close();
        }

        expect(await book.lastOpened(scope)).toBeNull();
        // And a record belonging to another owner is never read through this owner's key.
        const planted = await rawDatabase();
        try {
            await rawWrite(planted, 'meta', (table) =>
                table.put({
                    key: lastOpenedKey('owner-a'),
                    ownerId: 'owner-b',
                    documentId: 'study',
                }),
            );
        } finally {
            planted.close();
        }
        expect(await book.lastOpened(scope)).toBeNull();
    });
});
