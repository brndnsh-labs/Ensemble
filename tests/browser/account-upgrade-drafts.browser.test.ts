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

/** `draft()`'s stored document as JSON: the bytes a backup file would hold for it. */
const DRAFT_BYTES = JSON.stringify(accountChart('Draft'));

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
        expect(drafts.map(({ draft }) => `${draft.documentId}:${draft.writerId}`).sort()).toEqual([
            'other:w2',
            'study:w1',
        ]);
        // The row's own document, exactly as stored — not the decoded copy.
        const stored = drafts.find(({ draft }) => draft.writerId === 'w1')?.stored;
        expect(JSON.stringify(stored)).toBe(JSON.stringify(draft('w1', OLD).document));
        expect(unreadable).toMatchObject([
            { documentId: DOC, writerId: 'w4', stored: { schemaVersion: 99 } },
        ]);
    });
});

describe('replaceDraft', () => {
    it('rewrites a dead draft in place: same writer, capture time and base, nothing queued', async () => {
        await book.save(scope, accountChart('Saved'), null);
        await putDraft(draft('old-tab', OLD));
        expect(
            await book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'old-tab', capturedAt: OLD, raw: DRAFT_BYTES },
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
                {
                    documentId: DOC,
                    writerId: 'live-tab',
                    capturedAt: live.capturedAt,
                    raw: JSON.stringify(live.document),
                },
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
                { documentId: DOC, writerId: 'tab', capturedAt: OLD, raw: DRAFT_BYTES },
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
                { documentId: DOC, writerId: 'tab', capturedAt: OLD, raw: DRAFT_BYTES },
                rewritten(),
            ),
        ).toBe('changed');
        expect((await draftRow(DOC, 'tab'))?.document.title).toBe('Newer');
        expect(
            await book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'gone', capturedAt: OLD, raw: DRAFT_BYTES },
                rewritten(),
            ),
        ).toBe('gone');
    });

    it('keeps a draft whose bytes changed under the same capture time: the bytes are the check', async () => {
        await book.save(scope, accountChart('Saved'), null);
        await putDraft(draft('tab', OLD, accountChart('Edited, same capture')));
        expect(
            await book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'tab', capturedAt: OLD, raw: DRAFT_BYTES },
                rewritten(),
            ),
        ).toBe('changed');
        expect((await draftRow(DOC, 'tab'))?.document.title).toBe('Edited, same capture');
    });

    it('refuses to move a draft to another song', async () => {
        await putDraft(draft('tab', OLD));
        await expect(
            book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'tab', capturedAt: OLD, raw: DRAFT_BYTES },
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

/** A song row this build cannot read back, written as a download or an older build left it. */
function putSong(row: object): Promise<unknown> {
    return raw((db) => settled(db.transaction('songs', 'readwrite').objectStore('songs').put(row)));
}

function songRow(documentId: string): Promise<unknown> {
    return raw((db) =>
        settled(db.transaction('songs', 'readonly').objectStore('songs').get([OWNER, documentId])),
    );
}

describe('removing an upgrade leftover (#1738)', () => {
    it('removes a draft row only while it holds the backed-up bytes, and never a live one', async () => {
        await putDraft(draft('orphan', OLD));
        const bytes = JSON.stringify(draft('orphan', OLD).document);
        expect(
            await book.removeDraftRow(scope, { documentId: DOC, writerId: 'orphan' }, `${bytes} `),
        ).toBe('changed');
        expect(await draftRow(DOC, 'orphan')).toBeDefined();
        // An orphan (no song here) is removable once the bytes match; nothing is queued.
        expect(
            await book.removeDraftRow(scope, { documentId: DOC, writerId: 'orphan' }, bytes),
        ).toBe('removed');
        expect(await draftRow(DOC, 'orphan')).toBeUndefined();
        expect(await book.pending(scope, DOC)).toEqual([]);
        expect(
            await book.removeDraftRow(scope, { documentId: DOC, writerId: 'orphan' }, bytes),
        ).toBe('gone');

        await book.save(scope, accountChart('Saved'), null);
        await book.recover(scope, 'live-tab', accountChart('Unsaved'), 0);
        const live = (await draftRow(DOC, 'live-tab'))!;
        expect(
            await book.removeDraftRow(
                scope,
                { documentId: DOC, writerId: 'live-tab' },
                JSON.stringify(live.document),
            ),
        ).toBe('live');
        expect(await draftRow(DOC, 'live-tab')).toEqual(live);
    });

    it('removes an unreadable local song row and nothing else: no tombstone, no outbox', async () => {
        const broken = { schemaVersion: 1, id: 'broken', title: 42, chart: null };
        await putSong({
            ownerId: OWNER,
            documentId: 'broken',
            document: broken,
            remoteRevision: null,
        });
        const bytes = JSON.stringify(broken);
        expect(await book.removeUnreadableSong(scope, 'broken', `${bytes} `)).toBe('changed');
        expect(await book.removeUnreadableSong(scope, 'broken', bytes)).toBe('removed');
        expect(await songRow('broken')).toBeUndefined();
        expect(await book.pending(scope, 'broken')).toEqual([]);
        expect(await metaRowFor(deletionKey(OWNER, 'broken'))).toBeUndefined();
        expect(await book.removeUnreadableSong(scope, 'broken', bytes)).toBe('gone');
    });

    it('refuses a song row the server holds, one with a Save queued, and one that reads', async () => {
        const broken = { schemaVersion: 1, id: 'held', title: 42, chart: null };
        await putSong({
            ownerId: OWNER,
            documentId: 'held',
            document: broken,
            remoteRevision: 'cloud-3',
        });
        expect(await book.removeUnreadableSong(scope, 'held', JSON.stringify(broken))).toBe('held');
        expect(await songRow('held')).toBeDefined();

        await book.save(scope, accountChart('Readable'), null);
        const readable = (await songRow(DOC)) as { document: unknown };
        expect(await book.removeUnreadableSong(scope, DOC, JSON.stringify(readable.document))).toBe(
            'changed',
        );
        expect(await songRow(DOC)).toBeDefined();

        // A queued Save on an id whose row then stops reading: removing it would strand the Save.
        await putSong({
            ownerId: OWNER,
            documentId: DOC,
            document: broken,
            remoteRevision: null,
        });
        expect(await book.removeUnreadableSong(scope, DOC, JSON.stringify(broken))).toBe('held');
        expect(await songRow(DOC)).toBeDefined();
    });
});

describe('a leftover with no stored document (#1738)', () => {
    it('is never removed: no bytes is not "the same bytes" as a backup', async () => {
        // `JSON.stringify(undefined)` is `undefined`: a guard comparing it with a row's missing
        // document would see two `undefined`s and delete.
        await putSong({ ownerId: OWNER, documentId: 'empty', remoteRevision: null });
        await putDraft({ ...draft('empty-draft', OLD), document: undefined });
        const none = undefined as unknown as string;
        await expect(book.removeUnreadableSong(scope, 'empty', none)).rejects.toThrow();
        await expect(
            book.removeDraftRow(scope, { documentId: DOC, writerId: 'empty-draft' }, none),
        ).rejects.toThrow();
        await expect(
            book.replaceDraft(
                scope,
                { documentId: DOC, writerId: 'empty-draft', capturedAt: OLD, raw: none },
                rewritten(),
            ),
        ).rejects.toThrow();
        expect(await songRow('empty')).toBeDefined();
        expect(await draftRow(DOC, 'empty-draft')).toBeDefined();
    });
});

describe('removing an unreadable song the account has a word pending on (#1738)', () => {
    const broken = { schemaVersion: 1, id: 'pending', title: 42, chart: null };
    beforeEach(async () => {
        await putSong({
            ownerId: OWNER,
            documentId: 'pending',
            document: broken,
            remoteRevision: null,
        });
    });

    it('refuses one with an account version waiting', async () => {
        await putMeta({ key: candidateKey(OWNER, 'pending'), ownerId: OWNER });
        expect(await book.removeUnreadableSong(scope, 'pending', JSON.stringify(broken))).toBe(
            'held',
        );
        expect(await songRow('pending')).toBeDefined();
    });

    it('refuses one with a delete frozen', async () => {
        await putMeta({ key: deletionKey(OWNER, 'pending'), ownerId: OWNER });
        expect(await book.removeUnreadableSong(scope, 'pending', JSON.stringify(broken))).toBe(
            'held',
        );
        expect(await songRow('pending')).toBeDefined();
    });
});

function metaRowFor(key: string): Promise<unknown> {
    return raw((db) => settled(db.transaction('meta', 'readonly').objectStore('meta').get(key)));
}
