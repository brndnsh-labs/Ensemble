/**
 * `validateDocument`'s single-prepare dispatch (#1445). Before this, a v2 document ran the
 * codec's structural walk (`inspectSongbookStructure`) roughly six times: once trying the v1
 * codec, once more for the v2 attempt, and once again for the nested score subtree — three
 * full `prepareCandidate` calls where one detached copy would do. This file proves the
 * consolidated dispatch: it opens v1, v2 and future-version candidates identically to before,
 * still fails closed on an accessor trap or a depth bomb before either codec's field validators
 * run, and — the acceptance test — walks a valid v2 document's structure exactly once.
 */
import type { ChartDocumentV2 } from '@engine/songbook/score-types';
import type { ChartLaneMix, ChartDocument as LegacyDocument } from '@engine/songbook/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateDocument } from './documents';

// Vitest hoists `vi.mock` above these imports, so every importer of this module in the test's
// module graph — including `codec.ts`'s internal `import { inspectSongbookStructure } from
// './structural-limits.js'` — resolves to this wrapped export. A `vi.spyOn` on the live module
// object is not reliable here: whether it intercepts an already-bound named import depends on
// the bundler's live-binding behavior, so this uses `vi.mock`'s module-registry substitution
// instead, which every consumer resolves through regardless of how they imported the name.
vi.mock('@engine/songbook/structural-limits', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@engine/songbook/structural-limits')>();
    return { ...actual, inspectSongbookStructure: vi.fn(actual.inspectSongbookStructure) };
});

import { inspectSongbookStructure } from '@engine/songbook/structural-limits';

const mix = (): ChartLaneMix => ({
    enabled: true,
    voice: 'synth',
    autoSound: false,
    volume: 0.8,
    reverb: 0.2,
});

function legacyDocument(): LegacyDocument {
    return {
        schemaVersion: 1,
        id: 'study',
        title: 'Study',
        revision: 1,
        createdAt: '2026-09-08T12:00:00.000Z',
        updatedAt: '2026-09-08T12:30:00.000Z',
        chart: {
            arrangement: {
                key: 'C',
                isMinor: false,
                timeSignature: '4/4',
                grouping: null,
                notation: 'name',
                sections: [{ id: 'a', label: 'A', value: 'C G7 | Dm7 G7', repeat: 1 }],
            },
            performance: { bpm: 120, seed: '', randomizeSeed: true },
            band: {
                chords: { ...mix(), style: 'smart', octave: 48, density: 'standard' },
                bass: { ...mix(), style: 'smart', octave: 36 },
                soloist: {
                    ...mix(),
                    style: 'smart',
                    octave: 72,
                    preset: 'trumpet',
                    mode: 'monophonic',
                    autoMode: true,
                    tradeMode: 'manual',
                },
                groove: { ...mix(), swing: 0, swingSub: '8th', humanize: 0, genre: 'Rock' },
            },
        },
    };
}

function v2Document(): ChartDocumentV2 {
    const legacy = legacyDocument();
    return {
        ...legacy,
        schemaVersion: 2,
        chart: {
            performance: legacy.chart.performance,
            band: legacy.chart.band,
            score: {
                key: 'C',
                isMinor: false,
                notation: 'name',
                meter: '4/4',
                grouping: null,
                sections: [
                    {
                        id: 'a',
                        label: 'A',
                        repeat: 1,
                        measures: [
                            {
                                id: 'm1',
                                content: {
                                    kind: 'events',
                                    events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }],
                                },
                            },
                        ],
                    },
                ],
            },
        },
    };
}

describe('validateDocument', () => {
    beforeEach(() => {
        vi.mocked(inspectSongbookStructure).mockClear();
    });

    it('opens a v1 document', () => {
        expect(validateDocument(legacyDocument())).toEqual(legacyDocument());
    });

    it('opens a v2 document', () => {
        expect(validateDocument(v2Document())).toEqual(v2Document());
    });

    it('refuses a schema version newer than either codec knows', () => {
        expect(() => validateDocument({ schemaVersion: 99, opaque: true })).toThrow(
            /newer document version/,
        );
    });

    it('rejects an accessor trap without invoking its getter', () => {
        let read = false;
        const candidate = Object.defineProperty({}, 'schemaVersion', {
            enumerable: true,
            get() {
                read = true;
                throw new Error('must not run');
            },
        });
        expect(() => validateDocument(candidate)).toThrow(/Cannot open this chart/);
        expect(read).toBe(false);
    });

    it('rejects a depth bomb before either codec walks the candidate', () => {
        let deep: unknown = true;
        for (let depth = 0; depth < 40; depth++) {
            deep = { child: deep };
        }
        expect(() => validateDocument({ schemaVersion: 1, deep })).toThrow(/exceeds depth/);
    });

    it('prepares a valid v2 document exactly once, with no separate walk of the nested score', () => {
        validateDocument(v2Document());
        // `prepareCandidate` walks the structure twice per preparation (once raw, once on the
        // JSON-round-tripped copy). Exactly one preparation for the whole document — the v1
        // attempt and the v2 dispatch share it, and the nested score reuses the same detached
        // subtree — means exactly 2 calls, not the ~6 a naive v1-then-v2-then-score chain made.
        expect(inspectSongbookStructure).toHaveBeenCalledTimes(2);
    });

    it('prepares a valid v1 document exactly once', () => {
        validateDocument(legacyDocument());
        expect(inspectSongbookStructure).toHaveBeenCalledTimes(2);
    });
});
