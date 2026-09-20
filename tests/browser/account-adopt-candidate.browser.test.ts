import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    ACCOUNT_DATABASE,
    type AccountScope,
    type ChartDocument,
    candidateKey,
    type Draft,
    type PreparedSave,
} from '../../prototypes/v2/lib/sync/protocol.js';
import { AccountSongbook } from '../../prototypes/v2/lib/sync/repository.js';
import { sendNext } from '../../prototypes/v2/lib/sync/send.js';
import { accountChart } from '../utils/account-songbook-fixture.js';

/**
 * Adopting a preserved remote candidate (#1310), against real IndexedDB in both engines.
 *
 * The mirror of `account-keep-both.browser.test.ts`, and it lives beside it for the same reason:
 * every claim this resolution makes is a claim about ONE transaction, and half of them are about
 * what is NOT left behind — a draft, a candidate row, a record still labelled with the revision it
 * has stopped holding. A fake store would agree with a wrong implementation as readily as a right
 * one, so nothing about this is asserted under happy-dom.
 *
 * The loop's half (which owner may ask, what it publishes) is
 * `tests/unit/songbook/account-sync-loop.test.ts`; the product moment across two real devices is
 * `prototypes/v2/checks/account-remote-update.chromium.spec.ts`.
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

/**
 * A direct connection to the same database, for the rows the repository's own API cannot state: a
 * stored operation this build refuses to validate, which is the only way to make a read inside the
 * transaction fail after it has started.
 */
async function raw<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        return await work(db);
    } finally {
        // Closed before the test ends, or `afterEach`'s `deleteDatabase` blocks on it.
        db.close();
    }
}

function settled<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function draftRows(documentId: string): Promise<Draft[]> {
    return raw((db) =>
        settled(
            db
                .transaction('drafts', 'readonly')
                .objectStore('drafts')
                .index('song')
                .getAll([OWNER, documentId]),
        ),
    );
}

function putRawOperation(row: Record<string, unknown>): Promise<unknown> {
    return raw((db) =>
        settled(db.transaction('operations', 'readwrite').objectStore('operations').put(row)),
    );
}

/**
 * Store a candidate row directly, which is the only way to reach the state a build from BEFORE the
 * patch-R1 fix could leave behind: `reconcile` will not write one for a revision the record already
 * holds (it answers `'unchanged'` and clears the row), so the belt inside `adoptRemoteVersion` has
 * no other way to be exercised.
 */
function putRawCandidate(revision: string, title: string): Promise<unknown> {
    return raw((db) =>
        settled(
            db
                .transaction('meta', 'readwrite')
                .objectStore('meta')
                .put({
                    key: candidateKey(OWNER, DOC),
                    ownerId: OWNER,
                    kind: 'version',
                    documentId: DOC,
                    revision,
                    document: chart(title, DOC, 7),
                }),
        ),
    );
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

async function saveAndConfirm(title: string, revision: string, expected: number | null) {
    await book.save(scope, chart(title, DOC, expected === null ? 0 : expected + 1), expected);
    expect(await sendNext(book, scope, DOC, committing(revision))).toBe('committed');
}

/**
 * The state this whole story is about, built the way the product reaches it (#1299): a confirmed
 * record, an unsaved experiment retained on top of it, and then a download that finds the account
 * has moved on. The draft is what makes the record HELD, so the body is preserved beside it
 * instead of replacing it.
 */
async function preservedCandidate(revision = 'cloud-9', title = 'Their take'): Promise<void> {
    await book.recover(scope, 'writer-1', chart('Unsaved experiment', DOC, 0), 0);
    expect(
        await book.reconcile(
            scope,
            {
                kind: 'version',
                documentId: DOC,
                revision,
                document: chart(title, DOC, 7),
            },
            // The base the record really holds, as `runLibraryDownload` always passes it: without
            // it this is a plan that asserts there was no record, which is now `'superseded'`.
            { expectedRemoteRevision: 'cloud-1' },
        ),
    ).toBe('candidate');
    expect((await book.remoteCandidate(scope, DOC))?.kind).toBe('version');
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

describe('adopting the account’s version under the original id', () => {
    it('replaces the record, discards every draft and settles the candidate', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        // A second page load's row as well as this one's: EVERY writer's goes, because the row a
        // chart was recovered from usually belongs to an earlier load and leaving it would recover
        // the experiment this adoption just discarded on the very next open.
        await book.recover(scope, 'writer-2', chart('Another tab’s experiment', DOC, 0), 0);
        await preservedCandidate();

        const resolution = await book.adoptRemoteVersion(scope, DOC, 'cloud-9');
        if (typeof resolution === 'string') {
            throw new Error(`Expected an adoption, got ${resolution}.`);
        }
        // The ORIGINAL id: adoption never mints one. That is the other resolution.
        expect(resolution.documentId).toBe(DOC);
        expect(resolution.document.title).toBe('Their take');
        expect(resolution.revision).toBe('cloud-9');

        const saved = await book.read(scope, DOC);
        expect(saved?.document.title).toBe('Their take');
        // Labelled with the revision it actually holds, so the next download diffs the manifest
        // against exactly that and this record reads as cloud-confirmed because it is.
        expect(saved?.remoteRevision).toBe('cloud-9');
        expect(await book.drafts(scope, DOC)).toEqual([]);
        expect(await draftRows(DOC)).toEqual([]);
        // The divergence it described is settled, so the flag goes with it.
        expect(await book.remoteCandidate(scope, DOC)).toBe(null);
        // One song, still. Nothing was duplicated and nothing was created.
        const page = await book.list(scope, { limit: 100 });
        expect(page.songs.map((song) => song.documentId)).toEqual([DOC]);
    });

    it('is idempotent in the only sense that matters: a second press finds nothing to adopt', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await preservedCandidate();

        expect(typeof (await book.adoptRemoteVersion(scope, DOC, 'cloud-9'))).toBe('object');
        expect(await book.adoptRemoteVersion(scope, DOC, 'cloud-9')).toBe('none');
        // ...and the first adoption is untouched by the second attempt.
        expect((await book.read(scope, DOC))?.document.title).toBe('Their take');
    });

    it('adopts under an id this device holds no saved record for', async () => {
        // A draft with no committed version is live by definition (`liveDraft`), so a download
        // preserves the body rather than writing it — and adopting is what creates the record.
        await book.recover(scope, 'writer-1', chart('Only a draft', DOC, 0), null);
        expect(
            await book.reconcile(scope, {
                kind: 'version',
                documentId: DOC,
                revision: 'cloud-4',
                document: chart('Their take', DOC, 2),
            }),
        ).toBe('candidate');

        const resolution = await book.adoptRemoteVersion(scope, DOC, 'cloud-4');
        if (typeof resolution === 'string') {
            throw new Error(`Expected an adoption, got ${resolution}.`);
        }
        expect((await book.read(scope, DOC))?.remoteRevision).toBe('cloud-4');
        expect(await book.drafts(scope, DOC)).toEqual([]);
    });
});

/**
 * The offer must never be built from a body whose plan base has moved (#1310 patch R1).
 *
 * Reproduced by the cold review and fixed at the SOURCE: before this, `reconcile` preserved such a
 * body as an ordinary candidate, which was inert while nothing read candidates and became a
 * destructive, mislabelled offer the moment this story started showing them. Adopting one rolls the
 * song back to an older body and relabels it with an older revision, so the next Save earns a 409
 * nobody could explain.
 */
describe('a body whose plan base has moved is never preserved as an offer', () => {
    /** The record is at `cloud-3`; the pass that is landing was planned against `cloud-1`. */
    async function recordMovedUnderThePlan(): Promise<void> {
        await saveAndConfirm('Set list', 'cloud-1', null);
        // The Save that moves it, drained in one transaction: `acknowledge` writes the new
        // remoteRevision and deletes the operation together, so nothing readable inside a later
        // commit distinguishes this record from the one the plan saw. Only the base does.
        await book.save(scope, chart('Mine', DOC, 1), 0);
        expect(await sendNext(book, scope, DOC, committing('cloud-3'))).toBe('committed');
        expect((await book.read(scope, DOC))?.remoteRevision).toBe('cloud-3');
    }

    const staleBody = () =>
        ({
            kind: 'version',
            documentId: DOC,
            revision: 'cloud-2',
            document: chart('Their older take', DOC, 7),
        }) as const;

    it('writes nothing for a clean record, and says which it was', async () => {
        await recordMovedUnderThePlan();

        expect(
            await book.reconcile(scope, staleBody(), { expectedRemoteRevision: 'cloud-1' }),
        ).toBe('superseded');

        // Not a candidate: a stored row here is what the songbook marks and the banner offers.
        expect(await book.remoteCandidate(scope, DOC)).toBe(null);
        const saved = await book.read(scope, DOC);
        expect(saved?.document.title).toBe('Mine');
        expect(saved?.remoteRevision).toBe('cloud-3');
    });

    it('writes nothing for a HELD record either — the two-tab case', async () => {
        await recordMovedUnderThePlan();
        // The other tab kept the chart on the stand, or kept typing. Before the fix the `held`
        // branch was asked FIRST, so exactly the same stale body was stored under a draft.
        await book.recover(scope, 'writer-1', chart('Still typing', DOC, 1), 1);

        expect(
            await book.reconcile(
                scope,
                staleBody(),
                // `active: true` is the same fact from the other direction: the chart is open.
                { expectedRemoteRevision: 'cloud-1', active: true },
            ),
        ).toBe('superseded');

        expect(await book.remoteCandidate(scope, DOC)).toBe(null);
        expect((await book.read(scope, DOC))?.remoteRevision).toBe('cloud-3');
        // The experiment is untouched: declining to write is not a reason to touch local work.
        expect(await book.drafts(scope, DOC)).toHaveLength(1);
    });

    it('leaves a candidate that WAS written against a matching base exactly where it is', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await preservedCandidate('cloud-9');
        // A second, stale pass arrives afterwards. It says nothing about the offer already on the
        // table — that one was diffed against the revision this record really holds.
        expect(
            await book.reconcile(
                scope,
                { ...staleBody(), revision: 'cloud-2' },
                { expectedRemoteRevision: 'cloud-0' },
            ),
        ).toBe('superseded');
        expect((await book.remoteCandidate(scope, DOC))?.revision).toBe('cloud-9');
    });

    it('still preserves a body when the base matches, which is the whole point of the row', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await book.recover(scope, 'writer-1', chart('Unsaved experiment', DOC, 0), 0);

        expect(
            await book.reconcile(scope, staleBody(), { expectedRemoteRevision: 'cloud-1' }),
        ).toBe('candidate');
        expect((await book.remoteCandidate(scope, DOC))?.revision).toBe('cloud-2');
    });

    it('drops a stale candidate at the consumer, for devices that already hold one', async () => {
        // The belt: a row written by a build from before the fix, or one another tab resolved by
        // advancing the record to exactly this revision.
        await saveAndConfirm('Set list', 'cloud-1', null);
        await book.recover(scope, 'writer-1', chart('Unsaved experiment', DOC, 0), 0);
        await putRawCandidate('cloud-1', 'The same version');
        expect((await book.remoteCandidate(scope, DOC))?.revision).toBe('cloud-1');

        expect(await book.adoptRemoteVersion(scope, DOC, 'cloud-1')).toBe('none');
        // Asked once and never again: the row went with the question it was asking.
        expect(await book.remoteCandidate(scope, DOC)).toBe(null);
        // And nothing was adopted over the record, which already IS that revision.
        expect((await book.read(scope, DOC))?.document.title).toBe('Set list');
        expect(await book.drafts(scope, DOC)).toHaveLength(1);
    });
});

describe('adoption refuses to commit a version nobody chose', () => {
    it('answers `stale` when a newer candidate arrived under the open banner', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await preservedCandidate('cloud-9');
        // A second pass, while the musician was reading the first one's sentence.
        expect(
            await book.reconcile(
                scope,
                {
                    kind: 'version',
                    documentId: DOC,
                    revision: 'cloud-12',
                    document: chart('Their later take', DOC, 8),
                },
                { expectedRemoteRevision: 'cloud-1' },
            ),
        ).toBe('candidate');

        expect(await book.adoptRemoteVersion(scope, DOC, 'cloud-9')).toBe('stale');
        // Nothing moved: the record, the draft and the newer candidate are all exactly as they were.
        expect((await book.read(scope, DOC))?.document.title).toBe('Set list');
        expect(await book.drafts(scope, DOC)).toHaveLength(1);
        expect((await book.remoteCandidate(scope, DOC))?.revision).toBe('cloud-12');
        // And the version the musician CAN see is adoptable.
        const resolution = await book.adoptRemoteVersion(scope, DOC, 'cloud-12');
        if (typeof resolution === 'string') {
            throw new Error(`Expected an adoption, got ${resolution}.`);
        }
        expect(resolution.document.title).toBe('Their later take');
    });

    it('answers `queued` while this device holds a Save the account has not taken', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await preservedCandidate();
        // A committed version of the musician's own, waiting to upload. What adoption discards has
        // to be work that was never committed; this is the opposite, and it has its own exit —
        // the account refuses it on the next pass and Keep both resolves it.
        await book.save(scope, chart('Mine', DOC, 1), 0);

        expect(await book.adoptRemoteVersion(scope, DOC, 'cloud-9')).toBe('queued');
        expect(await book.pending(scope, DOC)).toHaveLength(1);
        expect((await book.read(scope, DOC))?.document.title).toBe('Mine');
        // The draft is gone, but the SAVE took it, not this call: `save()` retires every writer's
        // superseded rows. What matters here is that the queued version and the preserved body
        // both survived being asked.
        expect((await book.remoteCandidate(scope, DOC))?.kind).toBe('version');
    });

    it('answers `queued` for a refused head too, which is still a version of their own', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await preservedCandidate();
        await book.save(scope, chart('Mine', DOC, 1), 0);
        const queued = await book.pending(scope, DOC);
        expect(await book.refuse(scope, DOC, queued[0].operationId, 'too-large')).toBe('refused');

        expect(await book.adoptRemoteVersion(scope, DOC, 'cloud-9')).toBe('queued');
        expect((await book.pending(scope, DOC))[0].status).toBe('refused');
    });

    it('never adopts a tombstone or a body this build cannot read', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await book.recover(scope, 'writer-1', chart('Unsaved experiment', DOC, 0), 0);
        // A cloud delete this device could not apply (#1270). There is no newer VERSION here at
        // all, so there is nothing to adopt — and the local work it flags must survive the asking.
        expect(
            await book.reconcile(scope, { kind: 'deleted', documentId: DOC, revision: 'cloud-9' }),
        ).toBe('retained-deleted');
        expect(await book.adoptRemoteVersion(scope, DOC, 'cloud-9')).toBe('none');
        expect((await book.remoteCandidate(scope, DOC))?.kind).toBe('deleted');
        expect(await book.drafts(scope, DOC)).toHaveLength(1);
        expect((await book.read(scope, DOC))?.document.title).toBe('Set list');

        // A body from a newer format: preserved, never adopted, migrated or coerced — and this
        // device's only copy of it, so the asking must not consume it either.
        expect(
            await book.reconcile(scope, {
                kind: 'unsupported',
                documentId: DOC,
                revision: 'cloud-12',
                body: { schemaVersion: 99, id: DOC },
                reason: 'needs-app-update',
            }),
        ).toBe('unsupported');
        expect(await book.adoptRemoteVersion(scope, DOC, 'cloud-12')).toBe('none');
        expect((await book.remoteCandidate(scope, DOC))?.kind).toBe('unsupported');
        expect((await book.read(scope, DOC))?.document.title).toBe('Set list');
    });

    it('answers `none` when there is no candidate at all', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        expect(await book.adoptRemoteVersion(scope, DOC, 'cloud-9')).toBe('none');
        expect(await book.adoptRemoteVersion(scope, 'never-here', 'cloud-9')).toBe('none');
    });
});

describe('adoption commits everything or nothing', () => {
    it('refuses a scope the account has moved past, and changes not one row', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await preservedCandidate();
        const stale = scope;
        await book.switchAccount(OWNER);

        await expect(book.adoptRemoteVersion(stale, DOC, 'cloud-9')).rejects.toThrow();
        scope = (await book.currentScope())!;
        expect((await book.read(scope, DOC))?.document.title).toBe('Set list');
        expect(await book.drafts(scope, DOC)).toHaveLength(1);
        expect((await book.remoteCandidate(scope, DOC))?.kind).toBe('version');
    });

    it('leaves record, draft and candidate exactly as they were when a read inside it fails', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await preservedCandidate();
        // A queued operation this build refuses to validate. `operations()` throws on it from
        // inside the transaction, which aborts the whole thing — the point being that the record,
        // the draft and the candidate are one commit, not three writes that can half-land.
        await putRawOperation({
            ownerId: OWNER,
            documentId: DOC,
            operationId: 'op-broken',
            localRevision: 1,
            snapshot: chart('Mine', DOC, 1),
            base: { revision: 'cloud-1', operationId: 'two-keys' },
            wireBody: null,
            status: 'queued',
        });

        await expect(book.adoptRemoteVersion(scope, DOC, 'cloud-9')).rejects.toThrow();
        expect((await book.read(scope, DOC))?.document.title).toBe('Set list');
        expect((await book.read(scope, DOC))?.remoteRevision).toBe('cloud-1');
        expect(await draftRows(DOC)).toHaveLength(1);
        expect((await book.remoteCandidate(scope, DOC))?.kind).toBe('version');
    });

    it('leaves Keep both as the resolution for a refused Save, candidate or no candidate', async () => {
        await saveAndConfirm('Set list', 'cloud-1', null);
        await preservedCandidate();
        // The Save that was waiting behind the draft goes out and is refused: now BOTH states
        // exist for this song at once, and the refusal is the one that blocks every later Save.
        await book.save(scope, chart('Mine', DOC, 1), 0);
        expect(
            await sendNext(book, scope, DOC, async (request: PreparedSave) => ({
                ownerId: request.ownerId,
                documentId: request.documentId,
                operationId: request.operationId,
                digest: request.digest,
                kind: 'conflict',
                revision: 'cloud-9',
                remote: { revision: 'cloud-9', document: chart('Their take', DOC, 7) },
            })),
        ).toBe('conflict');

        const resolution = await book.keepBoth(scope, DOC);
        if (resolution === 'none') {
            throw new Error('Expected a conflict to resolve.');
        }
        // Unchanged by any of this (#1267): a fresh id for the local line, the account's version
        // under the original, and the candidate settled with the divergence it described.
        expect(resolution.documentId).not.toBe(DOC);
        expect(resolution.adopted?.title).toBe('Their take');
        expect((await book.read(scope, DOC))?.remoteRevision).toBe('cloud-9');
        expect(await book.remoteCandidate(scope, DOC)).toBe(null);
        const page = await book.list(scope, { limit: 100 });
        expect(page.songs).toHaveLength(2);
    });
});
