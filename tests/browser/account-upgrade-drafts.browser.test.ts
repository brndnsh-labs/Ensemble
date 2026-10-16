import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    ACCOUNT_DATABASE,
    type AccountScope,
    type ChartDocument,
    type Draft,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * "Upgrade old songs" (#1738), the account database's half: reading every retained draft and
 * rewriting one in place, against real IndexedDB in both engines. The rewrite is a compare-and-swap
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

describe('allDrafts', () => {
    it('reads every song and writer of this owner, counts an unreadable row, and no other owner', async () => {
        await putDraft(draft('w1', OLD));
        await putDraft(draft('w2', OLD, accountChart('Other', 'other')));
        await putDraft({ ...draft('w3', OLD), ownerId: 'owner-b' });
        await putDraft({ ...draft('w4', OLD), document: { schemaVersion: 99 } });
        const { drafts, unreadable } = await book.allDrafts(scope);
        expect(drafts.map((row) => `${row.documentId}:${row.writerId}`).sort()).toEqual([
            'other:w2',
            'study:w1',
        ]);
        expect(unreadable).toBe(1);
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

    it('retires a dead draft when handed null', async () => {
        await book.save(scope, accountChart('Saved'), null);
        await putDraft(draft('old-tab', OLD));
        expect(
            await book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'old-tab', capturedAt: OLD },
                null,
            ),
        ).toBe('replaced');
        expect(await draftRow(DOC, 'old-tab')).toBeUndefined();
    });

    it('refuses a live draft and writes nothing', async () => {
        await book.save(scope, accountChart('Saved'), null);
        await book.recover(scope, 'live-tab', accountChart('Unsaved'), 0);
        const live = (await draftRow(DOC, 'live-tab'))!;
        expect(
            await book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'live-tab', capturedAt: live.capturedAt },
                null,
            ),
        ).toBe('live');
        expect(await draftRow(DOC, 'live-tab')).toEqual(live);
    });

    it('refuses a draft captured again since it was read, and keeps the newer text', async () => {
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
        ).toBe('changed');
    });

    it('rewrites a draft whose song this device does not hold', async () => {
        await putDraft(draft('tab', OLD));
        expect(
            await book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'tab', capturedAt: OLD },
                rewritten(),
            ),
        ).toBe('replaced');
        expect((await draftRow(DOC, 'tab'))?.document.title).toBe('Draft, rewritten');
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
