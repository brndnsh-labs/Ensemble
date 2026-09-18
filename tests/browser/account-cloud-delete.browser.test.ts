import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    ACCOUNT_DATABASE,
    type AccountScope,
    type ChartDocument,
    type PreparedDelete,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { sendNext } from '../../prototypes/v2/lib/sync/send.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * Explicit cloud deletion (#1270) against real IndexedDB in both engines.
 *
 * Everything here turns on a native transaction committing or aborting as one unit, and on the
 * `meta` store's key namespaces staying apart — a fake store would agree with a wrong
 * implementation as readily as with a right one, which is why this lives beside the other account
 * suites rather than under happy-dom.
 *
 * The transport is a fake throughout: `tests/unit/songbook/account-sync-loop.test.ts` proves the
 * real adapter's classification separately, and the SERVER's own decision table has its own tests
 * in `prototypes/v2-api`. What is proven here is the client's half of retry-safety — that the
 * operation id is frozen before anything leaves, survives a reconnection to the same database, and
 * is forgotten only when the server answered definitively about those exact bytes.
 */

const OWNER = 'owner-a';
const DOC = 'study';

let name: string;
let book: AccountSongbook;
let scope: AccountScope;
const connections: AccountSongbook[] = [];

function connection(): AccountSongbook {
    const instance = new AccountSongbook(name);
    connections.push(instance);
    return instance;
}

function chart(title: string, id = DOC, revision = 0): ChartDocument {
    return { ...accountChart(title, id), revision };
}

/** A server that commits every Save it is handed, so a record gains a confirmed remote revision. */
function committing(revision: string) {
    return async (request: {
        ownerId: string;
        documentId: string;
        operationId: string;
        digest: string;
    }) => ({
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        digest: request.digest,
        kind: 'committed',
        revision,
    });
}

/** Save `title` and let the fake cloud confirm it at `revision`. */
async function saveAndConfirm(
    title: string,
    revision: string,
    expected: number | null,
): Promise<void> {
    await book.save(scope, chart(title, DOC, expected === null ? 0 : expected + 1), expected);
    const outcome = await sendNext(book, scope, DOC, committing(revision));
    expect(outcome).toBe('committed');
}

/** The server's 200 reply: one shape for a fresh delete, a replay, and an already-deleted id. */
function deleted(request: PreparedDelete, revision: string) {
    return {
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        digest: request.digest,
        kind: 'deleted',
        revision,
    };
}

async function savedIds(): Promise<string[]> {
    const page = await book.list(scope, { limit: 100 });
    return page.songs.map((song) => song.documentId);
}

beforeEach(async () => {
    name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    book = connection();
    scope = (await book.switchAccount(OWNER))!;
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

describe('a cloud delete freezes its operation id before anything leaves the device', () => {
    it('reuses the same id across a reconnection, so a lost response retries rather than repeats', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);

        const first = await book.prepareDelete(scope, DOC);
        expect(typeof first).not.toBe('string');
        const request = first as PreparedDelete;
        expect(request.expectedRevision).toBe('cloud-1');

        // The response never arrived: nothing was acknowledged here, and the tab went away. A
        // fresh connection to the same database is the strongest form of "after a reload" this
        // suite can stage.
        const reopened = connection();
        const retry = (await reopened.prepareDelete(scope, DOC)) as PreparedDelete;
        expect(retry.operationId).toBe(request.operationId);
        expect(retry.expectedRevision).toBe(request.expectedRevision);
        // Byte-identical bytes, so the server's receipt answers the retry as a replay rather than
        // letting it commit a second delete under a second id.
        expect(retry.body).toBe(request.body);
        expect(retry.digest).toBe(request.digest);

        // The replay answers exactly what the first attempt would have: the id is deleted.
        const outcome = await reopened.acknowledgeDelete(scope, retry, deleted(retry, 'cloud-1'));
        expect(outcome).toBe('removed');
        expect(await savedIds()).toEqual([]);
        // ...and the frozen record is gone with it, so a later delete of a NEW song at this id
        // cannot inherit a spent operation id.
        const after = await book.prepareDelete(scope, DOC);
        expect(after).toBe('missing');
    });

    it('freezes the revision it was aimed at, not whatever the record says at send time', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        const request = (await book.prepareDelete(scope, DOC)) as PreparedDelete;

        // A Save lands and is confirmed while the delete is in flight.
        await saveAndConfirm('Set list two', 'cloud-2', 0);

        const again = (await book.prepareDelete(scope, DOC)) as PreparedDelete;
        expect(again.operationId).toBe(request.operationId);
        // Still `cloud-1`: a retry is a retry OF THAT REQUEST. Re-aiming it at `cloud-2` under the
        // same operation id is precisely what the server refuses as `operation_mismatch`.
        expect(again.expectedRevision).toBe('cloud-1');
    });

    it('refuses to build a request for a song the cloud has never confirmed', async () => {
        await book.save(scope, chart('Never sent'), null);
        expect(await book.prepareDelete(scope, DOC)).toBe('unconfirmed');
        // Nothing was frozen for it either, so no stale id is left behind.
        await book.save(scope, chart('Never sent', DOC, 1), 0);
        expect(await book.prepareDelete(scope, DOC)).toBe('unconfirmed');
    });
});

describe('acknowledging a delete applies the same preservation rule a tombstone does', () => {
    it('drops a clean mirror and keeps a divergent one, deciding inside the transaction', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        const clean = (await book.prepareDelete(scope, DOC)) as PreparedDelete;

        // A Save is queued AFTER the request was prepared — the interleaving a plan cannot see.
        await book.save(scope, chart('Set list two', DOC, 1), 0);

        expect(await book.acknowledgeDelete(scope, clean, deleted(clean, 'cloud-1'))).toBe(
            'retained-deleted',
        );
        // The local work is untouched, and the candidate explains why the cloud copy is gone.
        expect(await savedIds()).toEqual([DOC]);
        const candidate = await book.remoteCandidate(scope, DOC);
        expect(candidate?.kind).toBe('deleted');
        expect(candidate?.revision).toBe('cloud-1');
    });

    it('keeps the chart on the stand, and the caller owns that fact', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        const request = (await book.prepareDelete(scope, DOC)) as PreparedDelete;
        expect(
            await book.acknowledgeDelete(scope, request, deleted(request, 'cloud-1'), {
                active: true,
            }),
        ).toBe('retained-deleted');
        expect(await savedIds()).toEqual([DOC]);
    });

    it('retains a record whose confirmed revision moved under the request', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        const request = (await book.prepareDelete(scope, DOC)) as PreparedDelete;
        // Queued, sent and acknowledged — so the record is clean, unheld and NEWER than the
        // revision this delete named. The compare-and-swap base is what catches it.
        await saveAndConfirm('Set list two', 'cloud-2', 0);

        expect(await book.acknowledgeDelete(scope, request, deleted(request, 'cloud-1'))).toBe(
            'retained-deleted',
        );
        expect(await savedIds()).toEqual([DOC]);
    });

    it('forgets the frozen id on a conflict, because those bytes can never commit', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        const request = (await book.prepareDelete(scope, DOC)) as PreparedDelete;

        const conflict = { ...deleted(request, 'cloud-2'), kind: 'conflict' };
        expect(await book.acknowledgeDelete(scope, request, conflict)).toBe('conflict');
        // Nothing local changed...
        expect(await savedIds()).toEqual([DOC]);
        expect(await book.remoteCandidate(scope, DOC)).toBeNull();
        // ...and the next attempt is a NEW operation, free to name the revision it actually sees.
        const next = (await book.prepareDelete(scope, DOC)) as PreparedDelete;
        expect(next.operationId).not.toBe(request.operationId);
    });

    it('refuses a reply that does not match the request it was prepared for', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        const request = (await book.prepareDelete(scope, DOC)) as PreparedDelete;
        await expect(
            book.acknowledgeDelete(scope, request, {
                ...deleted(request, 'cloud-1'),
                operationId: 'someone-elses-operation',
            }),
        ).rejects.toThrow('does not match');
        // Refused before any write, so the delete is still pending and still retry-safe.
        expect(await savedIds()).toEqual([DOC]);
        const again = (await book.prepareDelete(scope, DOC)) as PreparedDelete;
        expect(again.operationId).toBe(request.operationId);
    });
});

describe('the frozen delete shares the meta store without colliding with its neighbours', () => {
    it('is invisible to the remote-candidate range and to the active-account pointer', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await book.prepareDelete(scope, DOC);

        // `delete:` sorts below `remote:`, so the candidate prefix range cannot see it.
        expect(await book.remoteCandidates(scope)).toEqual([]);
        // And the account pointer still reads, which it would not if the key had landed on it.
        expect(await book.currentScope()).toEqual(scope);

        // A candidate for the same document coexists with the frozen delete rather than replacing
        // it: two namespaces, one store.
        await book.reconcile(
            scope,
            {
                kind: 'unsupported',
                documentId: DOC,
                revision: 'cloud-9',
                body: {},
                reason: 'needs-app-update',
            },
            { expectedRemoteRevision: 'cloud-1' },
        );
        expect((await book.remoteCandidates(scope)).map((row) => row.documentId)).toEqual([DOC]);
        const request = (await book.prepareDelete(scope, DOC)) as PreparedDelete;
        expect(request.expectedRevision).toBe('cloud-1');
    });

    it('discards a frozen delete on request, so a fresh attempt mints a fresh id', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        const request = (await book.prepareDelete(scope, DOC)) as PreparedDelete;
        await book.discardDelete(scope, DOC);
        const next = (await book.prepareDelete(scope, DOC)) as PreparedDelete;
        expect(next.operationId).not.toBe(request.operationId);
        // Discarding is idempotent: nothing to forget is not an error.
        await book.discardDelete(scope, 'never-existed');
    });
});
