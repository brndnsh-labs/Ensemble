import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    ACCOUNT_DATABASE,
    type AccountScope,
    type ChartDocument,
    type PreparedDelete,
    type PreparedSave,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { sendNext } from '../../prototypes/v2/lib/sync/send.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * Keeping both after a refused Save (#1267), against real IndexedDB in both engines.
 *
 * This is the one resolution the product offers, and every claim it makes is a claim about ONE
 * transaction: a create under a fresh identity, a queue emptied of the operation that was parked
 * and everything behind it, drafts moved, and the original id either adopting the remote version or
 * leaving the library entirely. A fake store would agree with a wrong implementation as readily as
 * with a right one — half of these assertions are about what is NOT left behind — so it lives
 * beside the other account suites rather than under happy-dom.
 *
 * The transport is a fake throughout: `tests/unit/songbook/account-sync-loop.test.ts` proves the
 * loop's half, and `prototypes/v2/checks/account-conflict.chromium.spec.ts` proves the product
 * moment against the real API on two browser contexts.
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
    return async (request: PreparedSave) => ({
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        digest: request.digest,
        kind: 'committed',
        revision,
    });
}

/**
 * The 409. `remote` null is the one-sided refusal — the id is tombstoned, or the account never had
 * it — which is a different answer from "the account holds a version you have not seen".
 */
function refusing(revision: string, remote: ChartDocument | null) {
    return async (request: PreparedSave) => ({
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        digest: request.digest,
        kind: 'conflict',
        revision,
        remote: remote === null ? null : { revision, document: remote },
    });
}

async function saveAndConfirm(title: string, revision: string, expected: number | null) {
    await book.save(scope, chart(title, DOC, expected === null ? 0 : expected + 1), expected);
    expect(await sendNext(book, scope, DOC, committing(revision))).toBe('committed');
}

/** Queue a version and let the fake account refuse it, returning the parked operation's id. */
async function saveAndRefuse(
    title: string,
    expected: number | null,
    remote: ChartDocument | null,
): Promise<string> {
    await book.save(scope, chart(title, DOC, expected === null ? 0 : expected + 1), expected);
    expect(await sendNext(book, scope, DOC, refusing('cloud-9', remote))).toBe('conflict');
    const queue = await book.pending(scope, DOC);
    const refused = queue.find((operation) => operation.status === 'conflict');
    expect(refused).toBeDefined();
    return refused!.operationId;
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

describe('keeping both mints a fresh identity for the local line', () => {
    it('adopts the remote version under the original id and carries the local one to a new one', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        const born = (await book.read(scope, DOC))!.document.createdAt;
        const failed = await saveAndRefuse('Mine', 0, chart('Their take', DOC, 7));

        const resolution = await book.keepBoth(scope, DOC);
        expect(resolution).not.toBe('none');
        if (resolution === 'none') {
            return;
        }
        expect(resolution.conflict).toBe('version');
        expect(resolution.documentId).not.toBe(DOC);
        expect(resolution.adopted?.title).toBe('Their take');

        // The account's version is the saved record at the original id, labelled with the revision
        // it actually is — so it reads as cloud-confirmed, because it is.
        const original = await book.read(scope, DOC);
        expect(original?.document.title).toBe('Their take');
        expect(original?.remoteRevision).toBe('cloud-9');

        // ...and this device's line is a whole separate song, never confirmed by anyone yet.
        const mine = await book.read(scope, resolution.documentId);
        expect(mine?.document.title).toBe('Mine');
        expect(mine?.document.id).toBe(resolution.documentId);
        expect(mine?.document.revision).toBe(0);
        expect(mine?.remoteRevision).toBe(null);
        // The same piece of music under a new identity, not a song written today.
        expect(mine?.document.createdAt).toBe(born);
        expect(await savedIds()).toHaveLength(2);
        expect(failed).toBeTruthy();
    });

    it('never reuses the refused operation id, and queues the new line as a create', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        const failed = await saveAndRefuse('Mine', 0, chart('Their take', DOC, 7));

        const resolution = await book.keepBoth(scope, DOC);
        if (resolution === 'none') {
            throw new Error('Expected a conflict to resolve.');
        }
        expect(resolution.operationId).not.toBe(failed);

        // The original id's queue is empty, so the outbox is no longer parked on it: `prepare`
        // answered `'conflict'` there forever until this ran.
        expect(await book.pending(scope, DOC)).toEqual([]);
        expect(await book.prepare(scope, DOC)).toBe('idle');

        const queued = await book.pending(scope, resolution.documentId);
        expect(queued).toHaveLength(1);
        expect(queued[0].operationId).toBe(resolution.operationId);
        expect(queued[0].operationId).not.toBe(failed);

        // A create, not a retry of the refused request: no expected revision at all, under a
        // document id the account has never been asked about.
        const request = await book.prepare(scope, resolution.documentId);
        if (typeof request === 'string') {
            throw new Error(`Expected a prepared create, got ${request}.`);
        }
        expect(request.operationId).toBe(resolution.operationId);
        const body = JSON.parse(request.body);
        expect(body.expectedRevision).toBe(null);
        expect(body.documentId).toBe(resolution.documentId);
        expect(body.document.title).toBe('Mine');
    });

    it('carries only the newest queued version, not a history of every one behind it', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        const failed = await saveAndRefuse('Mine one', 0, chart('Their take', DOC, 7));
        // Two more versions queued behind the parked head — every later Save of this song does
        // exactly this until the conflict is resolved.
        await book.save(scope, chart('Mine two', DOC, 2), 1);
        await book.save(scope, chart('Mine three', DOC, 3), 2);
        expect(await book.pending(scope, DOC)).toHaveLength(3);

        const resolution = await book.keepBoth(scope, DOC);
        if (resolution === 'none') {
            throw new Error('Expected a conflict to resolve.');
        }
        expect(resolution.document.title).toBe('Mine three');

        const queued = await book.pending(scope, resolution.documentId);
        expect(queued).toHaveLength(1);
        expect(queued[0].snapshot.title).toBe('Mine three');
        expect(queued.map((operation) => operation.operationId)).not.toContain(failed);
        // Nothing of the old queue survives anywhere: replaying those bytes under the new id
        // would upload a version history nobody asked for.
        expect(await book.pending(scope, DOC)).toEqual([]);
    });

    it('moves this account’s drafts onto the identity their line ended up under', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await saveAndRefuse('Mine', 0, chart('Their take', DOC, 7));
        await book.recover(scope, 'writer-1', chart('Unsaved experiment', DOC, 2), 2);

        const resolution = await book.keepBoth(scope, DOC);
        if (resolution === 'none') {
            throw new Error('Expected a conflict to resolve.');
        }
        expect(await book.drafts(scope, DOC)).toEqual([]);
        const moved = await book.drafts(scope, resolution.documentId);
        expect(moved).toHaveLength(1);
        expect(moved[0].document.title).toBe('Unsaved experiment');
        expect(moved[0].document.id).toBe(resolution.documentId);
        expect(moved[0].writerId).toBe('writer-1');
        // What the experiment is an experiment ON is the create, so that is its base.
        expect(moved[0].baseRevision).toBe(0);
    });

    it('drops the preserved candidate a download left beside the conflict', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await saveAndRefuse('Mine', 0, chart('Their take', DOC, 7));
        // A download pass, later still: the queue is not empty, so the body is preserved rather
        // than adopted.
        expect(
            await book.reconcile(scope, {
                kind: 'version',
                documentId: DOC,
                revision: 'cloud-12',
                document: chart('Their later take', DOC, 8),
            }),
        ).toBe('candidate');
        expect(await book.remoteCandidate(scope, DOC)).not.toBe(null);

        const resolution = await book.keepBoth(scope, DOC);
        expect(resolution).not.toBe('none');
        // The divergence it described is settled. The record is labelled with the revision it
        // really holds, and the next download diffs the manifest against exactly that.
        expect(await book.remoteCandidate(scope, DOC)).toBe(null);
        expect((await book.read(scope, DOC))?.remoteRevision).toBe('cloud-9');
    });
});

describe('a refusal with no remote version to keep alongside', () => {
    it('drops the original id here and carries the local line under a fresh one', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        // The account tombstoned this id (#1270) or never held it (#1268): `remote: null`.
        await saveAndRefuse('Mine', 0, null);

        const resolution = await book.keepBoth(scope, DOC);
        if (resolution === 'none') {
            throw new Error('Expected a conflict to resolve.');
        }
        expect(resolution.conflict).toBe('gone');
        expect(resolution.adopted).toBe(null);
        // Nothing up there for that id to be a mirror of, so nothing here claims to be one.
        expect(await book.read(scope, DOC)).toBe(null);
        expect(await book.remoteCandidate(scope, DOC)).toBe(null);
        expect(await book.pending(scope, DOC)).toEqual([]);
        expect(await savedIds()).toEqual([resolution.documentId]);
        expect((await book.read(scope, resolution.documentId))?.document.title).toBe('Mine');
    });

    it('forgets a frozen delete along with the record it was aimed at', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        const frozen = (await book.prepareDelete(scope, DOC)) as PreparedDelete;
        expect(frozen.operationId).toBeTruthy();
        await saveAndRefuse('Mine', 0, null);

        expect(await book.keepBoth(scope, DOC)).not.toBe('none');
        // `prepareDelete` is the only other thing that clears one, and it cannot run for a song
        // that is no longer in the library — so a row left here would be permanent.
        expect(await book.prepareDelete(scope, DOC)).toBe('missing');
    });
});

describe('keeping both refuses to invent a resolution', () => {
    it('reports `none` when this document’s outbox holds no refused Save', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        expect(await book.keepBoth(scope, DOC)).toBe('none');
        await book.save(scope, chart('Mine', DOC, 1), 0);
        expect(await book.keepBoth(scope, DOC)).toBe('none');
        // The ordinary queued Save is untouched by the question.
        expect(await book.pending(scope, DOC)).toHaveLength(1);
        expect(await savedIds()).toEqual([DOC]);
    });

    it('commits nothing at all when the account has moved underneath it', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await saveAndRefuse('Mine', 0, chart('Their take', DOC, 7));
        const stale = scope;
        await book.switchAccount(OWNER);

        await expect(book.keepBoth(stale, DOC)).rejects.toThrow();
        // The fence held: the conflict is exactly as it was, and no orphan song was created.
        scope = (await book.currentScope())!;
        expect(await savedIds()).toEqual([DOC]);
        const queue = await book.pending(scope, DOC);
        expect(queue).toHaveLength(1);
        expect(queue[0].status).toBe('conflict');
    });
});
