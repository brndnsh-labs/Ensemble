/**
 * `repository.save()`'s `createdAt` provenance (#1274 P2-2), through the real
 * read-modify-write path — not just `convertV1`'s own candidate-building.
 *
 * Node/happy-dom ship no IndexedDB. Rather than pull in a new dependency, this installs
 * the smallest fake that `open()`/`save()` actually drive: one object store keyed by
 * `id`, `get`/`put`, and real (microtask-scheduled) transaction completion — the same
 * spirit as this repo's existing manual `Storage` mock for the v1 writers
 * (`tests/unit/songbook/v1-import.test.ts`), applied to the one browser API this file
 * needs instead of an entire package.
 */

import type { ChartContent } from '@engine/songbook/types';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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

/**
 * A fake IndexedDB restricted to what `repository.ts` actually calls: one database, one
 * object store keyed by `id`, `get`/`put`, and transaction completion that fires only
 * once every request it dispatched (including one queued synchronously from inside
 * another request's `onsuccess`, exactly what `save()` does) has settled.
 */
function installFakeIndexedDB() {
    const store = new Map<string, unknown>();

    function makeRequest<T>() {
        return {
            result: undefined as T | undefined,
            onsuccess: null as (() => void) | null,
            onerror: null as (() => void) | null,
        };
    }

    function transaction() {
        const tx = {
            pending: 0,
            aborted: false,
            oncomplete: null as (() => void) | null,
            onerror: null as (() => void) | null,
            onabort: null as (() => void) | null,
            objectStore: () => ({
                get(key: string) {
                    const request = makeRequest<unknown>();
                    tx.pending++;
                    queueMicrotask(() => {
                        request.result = store.get(key);
                        request.onsuccess?.();
                        settle();
                    });
                    return request;
                },
                put(value: { id: string }) {
                    const request = makeRequest<void>();
                    tx.pending++;
                    queueMicrotask(() => {
                        store.set(value.id, value);
                        request.onsuccess?.();
                        settle();
                    });
                    return request;
                },
                getAll() {
                    const request = makeRequest<unknown[]>();
                    tx.pending++;
                    queueMicrotask(() => {
                        request.result = [...store.values()];
                        request.onsuccess?.();
                        settle();
                    });
                    return request;
                },
            }),
            abort() {
                tx.aborted = true;
                queueMicrotask(() => tx.onabort?.());
            },
        };
        function settle() {
            tx.pending--;
            if (tx.pending === 0 && !tx.aborted) {
                queueMicrotask(() => {
                    if (tx.pending === 0 && !tx.aborted) {
                        tx.oncomplete?.();
                    }
                });
            }
        }
        return tx;
    }

    vi.stubGlobal('indexedDB', {
        open() {
            const request: {
                result: unknown;
                onupgradeneeded: (() => void) | null;
                onsuccess: (() => void) | null;
                onerror: (() => void) | null;
                onblocked: (() => void) | null;
            } = {
                result: undefined,
                onupgradeneeded: null,
                onsuccess: null,
                onerror: null,
                onblocked: null,
            };
            queueMicrotask(() => {
                request.result = {
                    createObjectStore: () => {},
                    transaction,
                    close() {},
                    onversionchange: null,
                };
                request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        },
    });
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
