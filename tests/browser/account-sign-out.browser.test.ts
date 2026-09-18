import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    ACCOUNT_DATABASE,
    AccountChangedError,
    type AccountScope,
    type ChartDocument,
    candidateKey,
    deletionKey,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * Signing out (#1269) against real IndexedDB in both engines.
 *
 * Two claims, and neither can be proven against a fake store:
 *
 * 1. **A reply for account A that arrives after sign-out writes nothing.** The generation fence
 *    moves before the logout request, so an acknowledgement prepared under the old scope meets a
 *    `meta.active` that no longer matches and its whole transaction aborts — the record, the queue
 *    and the receipt all stay exactly as they were, rather than half-committing.
 * 2. **Signing in as B on the same profile sees none of A's songs.** Owner isolation already holds
 *    through the key ranges, but a shared device also requires A's records to be GONE, which is
 *    what `clearAccount` is for — across all six places one account's data lives.
 *
 * The `recover()` calls below write `drafts` rows this file writes ITSELF, purely so `clearAccount`
 * has something in that store to prove its key range reaches. They are not a reproduction of live
 * storage: no production path calls `AccountSongbook.recover` yet, and an account chart's unsaved
 * text still lands in the guest `localStorage` namespace instead (the known #1299 gap). Nothing
 * here should be read as evidence about what the sign-out PREFLIGHT can see — that is the shell's
 * composition, proven in `prototypes/v2/checks/account-sign-out.chromium.spec.ts`.
 */

const A = 'owner-a';
const B = 'owner-b';

let name: string;
let book: AccountSongbook;
let scope: AccountScope;
const connections: AccountSongbook[] = [];

function connection(): AccountSongbook {
    const instance = new AccountSongbook(name);
    connections.push(instance);
    return instance;
}

function chart(title: string, id: string, revision = 0): ChartDocument {
    return { ...accountChart(title, id), revision };
}

/** Reads the `meta` store directly: nothing in the repository API exposes one raw key. */
function metaKeys(): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const keys = db.transaction('meta', 'readonly').objectStore('meta').getAllKeys();
            keys.onsuccess = () => {
                db.close();
                resolve(keys.result.map(String));
            };
            keys.onerror = () => {
                db.close();
                reject(keys.error);
            };
        };
    });
}

beforeEach(async () => {
    name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    book = connection();
    scope = (await book.switchAccount(A))!;
});

afterEach(async () => {
    await Promise.all(connections.splice(0).map((instance) => instance.close()));
    await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
});

describe('the generation fence closes before the logout request', () => {
    it('refuses a Save acknowledgement for the account that was just signed out of', async () => {
        await book.save(scope, chart('Set list', 'study'), null);
        const request = await book.prepare(scope, 'study');
        if (typeof request === 'string') {
            throw new Error(`Expected a queued Save, received ${request}`);
        }

        // Sign-out's first step, exactly as `sync-loop.ts` orders it: the fence moves BEFORE the
        // logout request goes out, so the reply below is already too late whatever it says.
        await book.switchAccount(null);

        // The reply for A, arriving after that. It is a well-formed, correctly-signed receipt for
        // the exact bytes that were sent — the only thing wrong with it is when it got here.
        await expect(
            book.acknowledge(scope, request, {
                kind: 'committed',
                ownerId: request.ownerId,
                documentId: request.documentId,
                operationId: request.operationId,
                digest: request.digest,
                revision: 'cloud-1',
            }),
        ).rejects.toThrow(AccountChangedError);

        // Nothing moved: not the record's remote revision, not the queue, not a receipt. A
        // half-commit here would be a Save marked as confirmed by an account this device left.
        const back = (await book.switchAccount(A))!;
        expect((await book.read(back, 'study'))?.remoteRevision).toBeNull();
        expect(await book.pending(back, 'study')).toHaveLength(1);
    });
});

describe('signing out removes every trace of that account from this device', () => {
    it('clears songs, the outbox, drafts, candidates and frozen deletions in one transaction', async () => {
        await book.save(scope, chart('Set list', 'study'), null);
        await book.save(scope, chart('Scratch', 'take'), null);
        await book.recover(scope, 'writer-1', chart('Scratch', 'take', 1), 0);
        // A preserved remote candidate and a frozen deletion are the two `meta` namespaces an
        // account owns beside its records, and the two a range bug would most easily miss.
        await book.reconcile(scope, {
            kind: 'unsupported',
            documentId: 'study',
            revision: 'cloud-9',
            body: { schemaVersion: 99 },
            reason: 'needs-app-update',
        });
        expect(await metaKeys()).toContain(candidateKey(A, 'study'));

        await book.switchAccount(null);
        await book.clearAccount(A);

        const back = (await book.switchAccount(A))!;
        expect((await book.list(back, { limit: 100 })).songs).toEqual([]);
        expect(await book.pending(back, 'study')).toEqual([]);
        expect(await book.drafts(back, 'take')).toEqual([]);
        expect(await book.remoteCandidates(back)).toEqual([]);
        // Only the active pointer is left. Nothing else belonged to anyone else, either.
        expect(await metaKeys()).toEqual(['active']);
        expect(await metaKeys()).not.toContain(deletionKey(A, 'study'));
    });

    it('leaves another account on the same profile completely untouched', async () => {
        // B's records exist first, so this proves `clearAccount(A)` is bounded by owner and not
        // simply emptying the stores it reaches into.
        const other = (await book.switchAccount(B))!;
        await book.save(other, chart('B only', 'b-song'), null);
        await book.recover(other, 'writer-b', chart('B only', 'b-song', 1), 0);

        const mine = (await book.switchAccount(A))!;
        await book.save(mine, chart('A only', 'a-song'), null);

        await book.switchAccount(null);
        await book.clearAccount(A);

        // Signing in as B on this same profile: their own library, and none of A's.
        const asB = (await book.switchAccount(B))!;
        expect((await book.list(asB, { limit: 100 })).songs.map((song) => song.documentId)).toEqual(
            ['b-song'],
        );
        expect(await book.drafts(asB, 'b-song')).toHaveLength(1);

        const asA = (await book.switchAccount(A))!;
        expect((await book.list(asA, { limit: 100 })).songs).toEqual([]);
    });

    it('takes the queued Saves with it, so a later sign-in does not resume a forgotten outbox', async () => {
        await book.save(scope, chart('Set list', 'study'), null);
        expect(await book.pending(scope, 'study')).toHaveLength(1);

        await book.switchAccount(null);
        await book.clearAccount(A);

        // The same owner signing back in gets a fresh generation and an empty queue: the version
        // they were told would be discarded is discarded, not silently uploaded days later.
        const again = (await book.switchAccount(A))!;
        expect(again.generation).toBeGreaterThan(scope.generation);
        expect(await book.pending(again, 'study')).toEqual([]);
        expect(await book.read(again, 'study')).toBeNull();
    });
});
