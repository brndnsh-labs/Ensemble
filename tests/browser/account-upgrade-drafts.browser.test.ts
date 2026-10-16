import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    ACCOUNT_DATABASE,
    type AccountScope,
    type ChartDocument,
    candidateKey,
    type Draft,
    deletionKey,
    type PreparedSave,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { sendNext } from '../../prototypes/v2/lib/sync/send.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * "Upgrade old songs" (#1738), the account database's half: reading every retained draft and
 * rewriting one in place, and the account Save's upgrade option, against real IndexedDB in both engines. The rewrite is a compare-and-swap
 * on the row's `capturedAt` and on `liveDraft`'s rule, in one transaction with the song read — the
 * kind of claim a fake store would agree with whether or not it held.
 *
 * The run that decides WHICH drafts to rewrite is `prototypes/v2/lib/upgrade.test.ts`.
 */

const OWNER = 'owner-a';
const DOC = 'study';
const OLD = '2026-09-01T00:00:00.000Z';

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

/** A draft row as a download or an older build could have left it: any `capturedAt` at all. */
function putDraft(row: object): Promise<unknown> {
    return raw((db) =>
        settled(db.transaction('drafts', 'readwrite').objectStore('drafts').put(row)),
    );
}

function draftRow(documentId: string, writerId: string): Promise<Draft | undefined> {
    return raw((db) =>
        settled(
            db
                .transaction('drafts', 'readonly')
                .objectStore('drafts')
                .get([OWNER, documentId, writerId]),
        ),
    );
}

function draft(writerId: string, capturedAt: string, document = accountChart('Draft')): Draft {
    return {
        ownerId: OWNER,
        documentId: document.id,
        writerId,
        document,
        baseRevision: 0,
        capturedAt,
    };
}

/** A rewritten draft: the same song, its title marked so the bytes plainly changed. */
const rewritten = (): ChartDocument => ({ ...accountChart('Draft, rewritten'), revision: 0 });

beforeEach(async () => {
    name = `${ACCOUNT_DATABASE}-test-${crypto.randomUUID()}`;
    book = new AccountSongbook(name);
    scope = (await book.switchAccount(OWNER))!;
});

afterEach(async () => {
    await book.close();
    await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
});

function putMeta(row: object): Promise<unknown> {
    return raw((db) => settled(db.transaction('meta', 'readwrite').objectStore('meta').put(row)));
}

/** A fake account that refuses every Save as a conflict (#1267), parking the outbox head. */
async function refuse(request: PreparedSave) {
    return {
        ownerId: request.ownerId,
        documentId: request.documentId,
        operationId: request.operationId,
        digest: request.digest,
        kind: 'conflict',
        revision: 'cloud-9',
        remote: null,
    };
}

describe('allDrafts', () => {
    it('reads every song and writer of this owner, reports an unreadable row, and no other owner', async () => {
        await putDraft(draft('w1', OLD));
        await putDraft(draft('w2', OLD, accountChart('Other', 'other')));
        await putDraft({ ...draft('w3', OLD), ownerId: 'owner-b' });
        await putDraft({ ...draft('w4', OLD), document: { schemaVersion: 99 } });
        const { drafts, unreadable } = await book.allDrafts(scope);
        expect(drafts.map((row) => `${row.documentId}:${row.writerId}`).sort()).toEqual([
            'other:w2',
            'study:w1',
        ]);
        expect(unreadable).toMatchObject([{ documentId: DOC, writerId: 'w4' }]);
    });
});

describe('replaceDraft', () => {
    it('rewrites a dead draft in place: same writer, capture time and base, nothing queued', async () => {
        await book.save(scope, accountChart('Saved'), null);
        await putDraft(draft('old-tab', OLD));
        expect(
            await book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'old-tab', capturedAt: OLD },
                rewritten(),
            ),
        ).toBe('replaced');
        const row = await draftRow(DOC, 'old-tab');
        expect(row?.document.title).toBe('Draft, rewritten');
        expect(row?.capturedAt).toBe(OLD);
        expect(row?.baseRevision).toBe(0);
        // The Save queued one operation; the rewrite queued nothing.
        expect(await book.pending(scope, DOC)).toHaveLength(1);
    });

    it('refuses a live draft and writes nothing', async () => {
        await book.save(scope, accountChart('Saved'), null);
        await book.recover(scope, 'live-tab', accountChart('Unsaved'), 0);
        const live = (await draftRow(DOC, 'live-tab'))!;
        expect(
            await book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'live-tab', capturedAt: live.capturedAt },
                rewritten(),
            ),
        ).toBe('live');
        expect(await draftRow(DOC, 'live-tab')).toEqual(live);
    });

    it('refuses a draft whose song this device does not hold: `liveDraft` counts it live', async () => {
        await putDraft(draft('tab', OLD));
        const before = await draftRow(DOC, 'tab');
        expect(
            await book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'tab', capturedAt: OLD },
                rewritten(),
            ),
        ).toBe('live');
        expect(await draftRow(DOC, 'tab')).toEqual(before);
    });

    it('keeps the newer text of a draft captured again since it was read, and says when one is gone', async () => {
        await book.save(scope, accountChart('Saved'), null);
        await putDraft(draft('tab', OLD));
        await putDraft(draft('tab', '2026-09-02T00:00:00.000Z', accountChart('Newer')));
        expect(
            await book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'tab', capturedAt: OLD },
                rewritten(),
            ),
        ).toBe('changed');
        expect((await draftRow(DOC, 'tab'))?.document.title).toBe('Newer');
        expect(
            await book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'gone', capturedAt: OLD },
                rewritten(),
            ),
        ).toBe('gone');
    });

    it('refuses to move a draft to another song', async () => {
        await putDraft(draft('tab', OLD));
        await expect(
            book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'tab', capturedAt: OLD },
                { ...accountChart('Elsewhere', 'other') },
            ),
        ).rejects.toThrow('another song');
    });
});

describe("save's upgrade option", () => {
    /** The song saved once, stamped with a known old edit date by a raw rewrite of its record. */
    async function savedOnce() {
        await book.save(scope, accountChart('Saved'), null);
        const song = (await book.read(scope, DOC))!;
        return song.document;
    }

    it('keeps the song’s updatedAt, advances the revision, queues one Save and deletes no draft', async () => {
        const saved = await savedOnce();
        await putDraft(draft('old-tab', OLD));
        const upgraded = await book.save(
            scope,
            { ...saved, title: 'Upgraded', updatedAt: saved.updatedAt },
            0,
            { upgrade: true },
        );
        expect(upgraded.document.updatedAt).toBe(saved.updatedAt);
        expect(upgraded.document.revision).toBe(1);
        expect(await book.pending(scope, DOC)).toHaveLength(2);
        // An ordinary Save would have swept this dead row; the upgrade never deletes a draft.
        expect(await draftRow(DOC, 'old-tab')).toBeDefined();
        // …and an ordinary Save still does both as before.
        const ordinary = await book.save(scope, upgraded.document, 1);
        expect(ordinary.document.updatedAt > saved.updatedAt).toBe(true);
        expect(await draftRow(DOC, 'old-tab')).toBeUndefined();
    });

    it('refuses over a live draft, inside the Save, writing nothing', async () => {
        const saved = await savedOnce();
        await book.recover(scope, 'other-tab', accountChart('Unsaved'), 0);
        await expect(book.save(scope, saved, 0, { upgrade: true })).rejects.toMatchObject({
            reason: 'unsaved',
        });
        expect((await book.read(scope, DOC))?.document.revision).toBe(0);
        expect(await book.pending(scope, DOC)).toHaveLength(1);
    });

    it('refuses behind a conflicted outbox head, where an ordinary Save would queue behind it', async () => {
        const saved = await savedOnce();
        expect(await sendNext(book, scope, DOC, refuse)).toBe('conflict');
        await expect(book.save(scope, saved, 0, { upgrade: true })).rejects.toMatchObject({
            reason: 'refused',
        });
        expect((await book.pending(scope, DOC)).map((operation) => operation.status)).toEqual([
            'conflict',
        ]);
    });

    it('refuses with an account version waiting, or a delete frozen', async () => {
        const saved = await savedOnce();
        await putMeta({ key: candidateKey(OWNER, DOC), ownerId: OWNER });
        await expect(book.save(scope, saved, 0, { upgrade: true })).rejects.toMatchObject({
            reason: 'waiting',
        });
        await raw((db) =>
            settled(
                db
                    .transaction('meta', 'readwrite')
                    .objectStore('meta')
                    .delete(candidateKey(OWNER, DOC)),
            ),
        );
        await putMeta({ key: deletionKey(OWNER, DOC), ownerId: OWNER });
        await expect(book.save(scope, saved, 0, { upgrade: true })).rejects.toMatchObject({
            reason: 'deleting',
        });
        expect((await book.read(scope, DOC))?.document.revision).toBe(0);
    });
});
