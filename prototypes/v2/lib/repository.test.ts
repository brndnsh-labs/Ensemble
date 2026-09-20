/**
 * `repository.save()`'s `createdAt` provenance (#1274 P2-2), through the real
 * read-modify-write path — not just `convertV1`'s own candidate-building.
 *
 * Node/happy-dom ship no IndexedDB, so this runs against `tests/utils/fake-indexeddb.ts` —
 * the smallest fake that `open()`/`save()` actually drive, shared with the v1 import's own
 * through-the-repository tests (`tests/unit/songbook/v1-import.test.ts`) rather than copied
 * into each of them.
 */

import type { ChartContent } from '@engine/songbook/types';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeIndexedDB } from '../../../tests/utils/fake-indexeddb';
import { save } from './repository';

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
