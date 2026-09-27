// @vitest-environment happy-dom
/**
 * `repository.save()`'s `createdAt` provenance (#1274 P2-2), and the guest `remove()`/`rename()`
 * (#1440), through the real read-modify-write path — not just `convertV1`'s own
 * candidate-building.
 *
 * Node/happy-dom ship no IndexedDB, so this runs against `tests/utils/fake-indexeddb.ts` —
 * the smallest fake that `open()`/`save()`/`remove()`/`rename()` actually drive, shared with the
 * v1 import's own through-the-repository tests (`tests/unit/songbook/v1-import.test.ts`) rather
 * than copied into each of them. `remove()` also touches `localStorage` (clearing recovery
 * slots), and happy-dom ships no Storage implementation either — the same manual mock
 * `lib/session.test.ts` and `tests/unit/songbook/v1-import.test.ts` use stands in for it.
 */

import type { ChartContent } from '@engine/songbook/types';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installFakeIndexedDB } from '../../../tests/utils/fake-indexeddb';
import { list, recoverySlotCount, remove, rename, save } from './repository';

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

function chart(): ChartContent {
    return {
        arrangement: {
            sections: [{ id: 'a', label: 'A', value: 'I | IV | V | I', repeat: 1 }],
            key: 'C',
            timeSignature: '4/4',
            grouping: null,
            isMinor: false,
            notation: 'name',
            lastChordPreset: 'Test',
        },
        performance: { bpm: 100, complexity: 0.3, seed: '', randomizeSeed: true },
        band: {
            chords: {
                enabled: true,
                voice: 'synth',
                autoSound: false,
                volume: 1,
                reverb: 0.3,
                style: 'smart',
                octave: 48,
                density: 'standard',
            },
            bass: {
                enabled: true,
                voice: 'synth',
                autoSound: false,
                volume: 1,
                reverb: 0.05,
                style: 'smart',
                octave: 36,
            },
            soloist: {
                enabled: false,
                voice: 'synth',
                autoSound: false,
                volume: 1,
                reverb: 0.6,
                style: 'smart',
                preset: 'trumpet',
                octave: 72,
                mode: 'monophonic',
                autoMode: true,
                phrasingIntensity: 0.5,
                tradeMode: 'manual',
            },
            harmony: {
                enabled: false,
                voice: 'synth',
                autoSound: false,
                volume: 1,
                reverb: 0.4,
                style: 'smart',
                octave: 60,
                complexity: 0.5,
            },
            groove: {
                enabled: true,
                voice: 'synth',
                autoSound: false,
                volume: 1,
                reverb: 0.2,
                measures: 1,
                swing: 0,
                swingSub: '8th',
                humanize: 20,
                lastDrumPreset: 'Basic Rock',
                genreFeel: 'Rock',
                lastSmartGenre: 'Rock',
                pattern: [],
            },
        },
    };
}

beforeAll(() => {
    installFakeIndexedDB();
});

describe('repository.save createdAt provenance (#1274 P2-2)', () => {
    it('keeps the candidate document’s own createdAt for a brand-new row', async () => {
        const authoredAt = '2020-01-01T00:00:00.000Z';
        const saved = await save(
            {
                schemaVersion: 1,
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
                schemaVersion: 1,
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
                schemaVersion: 1,
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
                schemaVersion: 1,
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
                schemaVersion: 1,
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
                schemaVersion: 1,
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
