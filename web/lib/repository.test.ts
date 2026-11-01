// @vitest-environment happy-dom
/**
 * `repository.save()`'s `createdAt` provenance (#1274 P2-2), and the guest `remove()`/`rename()`
 * (#1440), through the real read-modify-write path.
 *
 * Node/happy-dom ship no IndexedDB, so this runs against `tests/utils/fake-indexeddb.ts` —
 * the smallest fake that `open()`/`save()`/`remove()`/`rename()` actually drive. `remove()` also
 * touches `localStorage` (clearing recovery slots), and happy-dom ships no Storage
 * implementation either — the same manual mock `lib/session.test.ts` uses stands in for it.
 */

import type { ChartDocumentV2 } from '@core/songbook/score-types';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type FakeIndexedDB, installFakeIndexedDB } from '../../tests/utils/fake-indexeddb';
import { homeRequest } from './home';
import {
    clearSharedDraft,
    get,
    home,
    keepSharedDraft,
    list,
    recoveriesFor,
    recoverySlotCount,
    remove,
    rename,
    SHARED_DRAFT_LIMIT,
    save,
    sharedDraftFor,
    sharedLinkDraftKey,
    standardDraftKey,
} from './repository';
import { buildStandardDocument, standardFor } from './standards';

const localStore = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
    value: {
        getItem: (key: string) => (localStore.has(key) ? localStore.get(key)! : null),
        setItem: (key: string, value: string) => localStore.set(key, String(value)),
        removeItem: (key: string) => localStore.delete(key),
        clear: () => localStore.clear(),
        key: (index: number) => [...localStore.keys()][index] ?? null,
        get length() {
            return localStore.size;
        },
    },
    writable: true,
});

beforeEach(() => {
    localStore.clear();
});

/** A measure chart's content (#1733): the catalog's 12-bar blues, as the app builds it. */
function chart(): ChartDocumentV2['chart'] {
    return buildStandardDocument(standardFor('standard-12-bar-blues')!).chart;
}

let fake: FakeIndexedDB;
beforeAll(() => {
    fake = installFakeIndexedDB();
});

describe('repository.save createdAt provenance (#1274 P2-2)', () => {
    it('keeps the candidate document’s own createdAt for a brand-new row', async () => {
        const authoredAt = '2020-01-01T00:00:00.000Z';
        const saved = await save(
            {
                schemaVersion: 2,
                id: 'repo-createdat-new',
                title: 'Imported song',
                createdAt: authoredAt,
                updatedAt: authoredAt,
                revision: 0,
                chart: chart(),
            },
            null,
        );
        expect(saved.createdAt).toBe(authoredAt);
    });

    it('keeps the ORIGINAL row createdAt on an update, ignoring the candidate’s own field', async () => {
        const first = await save(
            {
                schemaVersion: 2,
                id: 'repo-createdat-update',
                title: 'Original title',
                createdAt: '2019-05-01T00:00:00.000Z',
                updatedAt: '2019-05-01T00:00:00.000Z',
                revision: 0,
                chart: chart(),
            },
            null,
        );
        expect(first.createdAt).toBe('2019-05-01T00:00:00.000Z');

        const second = await save(
            {
                ...first,
                title: 'Renamed',
                // A caller sending its own (wrong) createdAt on an update must not win —
                // only a brand-new row's own field is honoured.
                createdAt: '2099-01-01T00:00:00.000Z',
            },
            first.revision,
        );
        expect(second.createdAt).toBe('2019-05-01T00:00:00.000Z');
        expect(second.title).toBe('Renamed');
    });
});

describe('repository.remove (#1440)', () => {
    it('deletes the row', async () => {
        const saved = await save(
            {
                schemaVersion: 2,
                id: 'repo-remove-1',
                title: 'To delete',
                createdAt: '2020-01-01T00:00:00.000Z',
                updatedAt: '2020-01-01T00:00:00.000Z',
                revision: 0,
                chart: chart(),
            },
            null,
        );
        expect((await list()).some((s) => s.id === saved.id)).toBe(true);
        await remove(saved.id);
        expect((await list()).some((s) => s.id === saved.id)).toBe(false);
    });

    it('clears every recovery slot for the deleted id, never another song’s', async () => {
        const kept = await save(
            {
                schemaVersion: 2,
                id: 'repo-remove-kept',
                title: 'Keep me',
                createdAt: '2020-01-01T00:00:00.000Z',
                updatedAt: '2020-01-01T00:00:00.000Z',
                revision: 0,
                chart: chart(),
            },
            null,
        );
        const doomed = await save(
            {
                schemaVersion: 2,
                id: 'repo-remove-doomed',
                title: 'Doomed',
                createdAt: '2020-01-01T00:00:00.000Z',
                updatedAt: '2020-01-01T00:00:00.000Z',
                revision: 0,
                chart: chart(),
            },
            null,
        );
        localStore.set(
            'ensemble-v2-preview:recovery:writer-a:repo-remove-doomed',
            JSON.stringify({ capturedAt: '2020-01-02T00:00:00.000Z', document: doomed }),
        );
        localStore.set(
            'ensemble-v2-preview:recovery:writer-a:repo-remove-kept',
            JSON.stringify({ capturedAt: '2020-01-02T00:00:00.000Z', document: kept }),
        );
        expect(recoverySlotCount('repo-remove-doomed')).toBe(1);

        await remove('repo-remove-doomed');

        expect(recoverySlotCount('repo-remove-doomed')).toBe(0);
        expect(recoverySlotCount('repo-remove-kept')).toBe(1);
    });
});

describe('repository.rename (#1440)', () => {
    it('changes the title only, bumping revision/updatedAt through the normal save path', async () => {
        const saved = await save(
            {
                schemaVersion: 2,
                id: 'repo-rename-1',
                title: 'Original',
                createdAt: '2020-01-01T00:00:00.000Z',
                updatedAt: '2020-01-01T00:00:00.000Z',
                revision: 0,
                chart: chart(),
            },
            null,
        );
        const renamed = await rename(saved.id, 'Renamed title');
        expect(renamed.title).toBe('Renamed title');
        expect(renamed.id).toBe(saved.id);
        expect(renamed.revision).toBe(saved.revision + 1);
        expect(renamed.createdAt).toBe(saved.createdAt);
        expect(renamed.chart).toEqual(saved.chart);
    });

    it('rejects renaming a song that no longer exists', async () => {
        await expect(rename('repo-rename-missing', 'New title')).rejects.toThrow();
    });
});

describe('repository.home — the songbook home reads only what it shows (#1441)', () => {
    const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes)).toISOString();
    const id = (i: number) => `s${String(i).padStart(2, '0')}`;
    function song(key: string, minutes: number) {
        return {
            schemaVersion: 2,
            id: key,
            title: `Song ${key}`,
            createdAt: at(minutes),
            updatedAt: at(minutes),
            revision: 0,
            chart: chart(),
        };
    }
    beforeEach(() => {
        fake.reset();
    });

    it('returns the Continue song and the opened ones by id, newest opened first, with the true count', async () => {
        for (let i = 0; i < 30; i++) {
            fake.rows.set(id(i), song(id(i), i));
        }
        const opened = new Map([
            ['s05', at(100)],
            ['s20', at(300)],
            ['s11', at(200)],
        ]);
        const slice = await home(homeRequest(opened, 's11'));
        expect(slice.count).toBe(30);
        expect(slice.continued?.id).toBe('s11');
        expect(slice.rows.slice(0, 3).map((row) => row.id)).toEqual(['s20', 's11', 's05']);
        // Filled to eight from the rest, never the whole songbook.
        expect(slice.rows).toHaveLength(8);
        expect(slice.unreadable).toBe(0);
    });

    it('never validates more than it shows: a corrupt song elsewhere cannot fail it, while a full read refuses', async () => {
        for (let i = 0; i < 12; i++) {
            fake.rows.set(id(i), song(id(i), i));
        }
        // Sorts last by key, so the bounded fill never reaches it either.
        fake.rows.set('zz-corrupt', { schemaVersion: 2, id: 'zz-corrupt', title: 42 });
        const opened = new Map(Array.from({ length: 8 }, (_, i) => [id(i), at(100 + i)]));
        const slice = await home(homeRequest(opened, null));
        expect(slice.count).toBe(13);
        expect(slice.rows).toHaveLength(8);
        expect(slice.unreadable).toBe(0);
        await expect(list()).rejects.toThrow();
    });

    it('leaves out and counts an unreadable document it did read, rather than blanking the page', async () => {
        fake.rows.set('good', song('good', 1));
        fake.rows.set('bad', { schemaVersion: 2, id: 'bad', title: 42 });
        const opened = new Map([
            ['bad', at(20)],
            ['good', at(10)],
        ]);
        const slice = await home(homeRequest(opened, 'bad'));
        expect(slice.continued).toBeNull();
        expect(slice.rows.map((row) => row.id)).toEqual(['good']);
        // One bad song, read as Continue and as an opened row: counted once.
        expect(slice.unreadable).toBe(1);
        expect(slice.count).toBe(2);
    });

    it('skips opened ids whose song is gone, and says an empty songbook is empty', async () => {
        const slice = await home(homeRequest(new Map([['gone', at(1)]]), 'gone'));
        expect(slice).toEqual({ count: 0, gone: 0, continued: null, rows: [], unreadable: 0 });
    });

    it('get reads one song by id, null when it is gone', async () => {
        fake.rows.set('one', song('one', 1));
        expect((await get('one'))?.title).toBe('Song one');
        expect(await get('missing')).toBeNull();
    });
});

describe('a text chart left in the guest songbook (schema 1, retired in #1740)', () => {
    const textChart = {
        schemaVersion: 1,
        id: 'old',
        title: 'Old',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        revision: 0,
        chart: { arrangement: {}, performance: {}, band: {} },
    };
    beforeEach(() => {
        fake.reset();
    });

    it('is left out of the whole-songbook read, not a reason to refuse the rest', async () => {
        const now = new Date().toISOString();
        fake.rows.set('old', textChart);
        fake.rows.set('new', {
            schemaVersion: 2,
            id: 'new',
            title: 'New',
            createdAt: now,
            updatedAt: now,
            revision: 0,
            chart: chart(),
        });
        expect((await list()).map((song) => song.id)).toEqual(['new']);
        // Left exactly as it was stored.
        expect(fake.rows.get('old')).toEqual(textChart);
    });

    it('is refused in plain words when asked for by id, and counted, not shown, by the home', async () => {
        fake.rows.set('old', textChart);
        await expect(get('old')).rejects.toThrow('old text-chart format');
        const slice = await home(homeRequest(new Map(), 'old'));
        expect(slice.rows).toEqual([]);
        expect(slice.continued).toBeNull();
        expect(slice.count).toBe(1);
        expect(slice.unreadable).toBeGreaterThan(0);
    });
});

describe('shared drafts: a standard or a shared link keeps its changes (#1979)', () => {
    const standard = () => buildStandardDocument(standardFor('standard-12-bar-blues')!);

    it('keeps the changes under the draft key and reads them back', () => {
        const base = standard();
        const changed = {
            ...base,
            chart: { ...base.chart, performance: { ...base.chart.performance, bpm: 150 } },
        };
        const key = standardDraftKey('standard-12-bar-blues');
        expect(sharedDraftFor(key, base.id)).toBeNull();
        keepSharedDraft(key, base, changed);
        const kept = sharedDraftFor(key, base.id);
        expect(kept?.document.chart.performance.bpm).toBe(150);
        // The base is kept with it, bar ids and all: a rebuilt standard has new ones.
        expect(kept?.base).toEqual(base);
        clearSharedDraft(key);
        expect(sharedDraftFor(key, base.id)).toBeNull();
    });

    it("never lands in a song's recovery slots, so a song with the same id is not offered it", () => {
        const base = standard();
        keepSharedDraft('link:abc', base, base);
        expect(recoverySlotCount(base.id)).toBe(0);
        expect(recoveriesFor(base)).toEqual([]);
        expect(
            [...localStore.keys()].some((k) => k.startsWith('ensemble-v2-preview:recovery:')),
        ).toBe(false);
    });

    it('refuses a slot whose chart is not the one it is keyed for', () => {
        const base = standard();
        keepSharedDraft('link:abc', base, base);
        expect(sharedDraftFor('link:abc', 'some-other-id')).toBeNull();
        expect(sharedDraftFor('link:abcd', base.id)).toBeNull();
    });

    it('reads the newest of several writers', () => {
        const base = standard();
        const older = { ...base, title: 'Older' };
        const newer = { ...base, title: 'Newer' };
        localStore.set(
            'ensemble-v2-preview:shared-draft:writer-a:standard:x',
            JSON.stringify({ capturedAt: '2020-01-01T00:00:00.000Z', base, document: older }),
        );
        localStore.set(
            'ensemble-v2-preview:shared-draft:writer-b:standard:x',
            JSON.stringify({ capturedAt: '2021-01-01T00:00:00.000Z', base, document: newer }),
        );
        expect(sharedDraftFor('standard:x', base.id)?.document.title).toBe('Newer');
        // This tab's write supersedes the other writers' slots for the same draft.
        keepSharedDraft('standard:x', base, { ...base, title: 'Mine' });
        expect([...localStore.keys()].filter((k) => k.endsWith(':standard:x'))).toHaveLength(1);
        expect(sharedDraftFor('standard:x', base.id)?.document.title).toBe('Mine');
        clearSharedDraft('standard:x');
        expect(localStore.size).toBe(0);
    });

    it(`keeps at most ${SHARED_DRAFT_LIMIT}, letting the oldest go`, () => {
        const base = standard();
        for (let i = 0; i < SHARED_DRAFT_LIMIT + 3; i++) {
            localStore.set(
                `ensemble-v2-preview:shared-draft:writer-a:link:${i}`,
                JSON.stringify({
                    capturedAt: new Date(Date.UTC(2020, 0, 1 + i)).toISOString(),
                    base,
                    document: base,
                }),
            );
        }
        keepSharedDraft('link:fresh', base, base);
        const left = [...localStore.keys()];
        expect(left).toHaveLength(SHARED_DRAFT_LIMIT);
        expect(left).toContain('ensemble-v2-preview:shared-draft:writer-a:link:26');
        expect(left).not.toContain('ensemble-v2-preview:shared-draft:writer-a:link:0');
        expect(sharedDraftFor('link:fresh', base.id)).not.toBeNull();
    });

    it("a link's key is its chart's digest: the same chart the same key, another chart another", async () => {
        const base = standard();
        const a = await sharedLinkDraftKey(base);
        expect(a).toMatch(/^link:[0-9a-f]{64}$/);
        expect(await sharedLinkDraftKey(structuredClone(base))).toBe(a);
        expect(await sharedLinkDraftKey({ ...base, title: 'Other' })).not.toBe(a);
    });

    it('makes room by letting the oldest other shared drafts go when storage is full', () => {
        const base = standard();
        for (const i of [1, 2]) {
            localStore.set(
                `ensemble-v2-preview:shared-draft:writer-a:link:${i}`,
                JSON.stringify({ capturedAt: `202${i}-01-01T00:00:00.000Z`, base, document: base }),
            );
        }
        localStore.set('ensemble-v2-preview:recovery:writer-a:song', 'a song draft');
        const storage = window.localStorage as Storage;
        const setItem = storage.setItem;
        let refusals = 1;
        storage.setItem = (key: string, value: string) => {
            if (refusals-- > 0) {
                throw new DOMException('full', 'QuotaExceededError');
            }
            setItem(key, value);
        };
        try {
            keepSharedDraft('link:new', base, base);
        } finally {
            storage.setItem = setItem;
        }
        expect(localStore.has('ensemble-v2-preview:shared-draft:writer-a:link:1')).toBe(false);
        expect(localStore.has('ensemble-v2-preview:shared-draft:writer-a:link:2')).toBe(true);
        expect(localStore.has('ensemble-v2-preview:recovery:writer-a:song')).toBe(true);
        expect(sharedDraftFor('link:new', base.id)).not.toBeNull();
    });

    it('blocked storage is not full storage: no other draft goes', () => {
        const base = standard();
        localStore.set(
            'ensemble-v2-preview:shared-draft:writer-a:link:1',
            JSON.stringify({ capturedAt: '2021-01-01T00:00:00.000Z', base, document: base }),
        );
        const storage = window.localStorage as Storage;
        const setItem = storage.setItem;
        storage.setItem = () => {
            throw new DOMException('blocked', 'SecurityError');
        };
        try {
            expect(() => keepSharedDraft('link:new', base, base)).toThrow('blocked');
        } finally {
            storage.setItem = setItem;
        }
        expect(localStore.has('ensemble-v2-preview:shared-draft:writer-a:link:1')).toBe(true);
    });
});
