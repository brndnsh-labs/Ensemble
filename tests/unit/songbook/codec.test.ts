import { describe, expect, it } from 'vitest';
import { writtenSettings } from '../../../core/songbook/codec.js';
import {
    decodeChartDocumentV2 as decodeChartDocument,
    encodeChartDocumentV2 as encodeChartDocument,
    isRetiredSchema,
    validateChartDocumentV2 as validateChartDocument,
} from '../../../core/songbook/document-v2.js';
import type { ChartDocumentV2 as ChartDocument } from '../../../core/songbook/score-types.js';

/**
 * The chart document's own validator (#1740): one schema (2), its envelope, performance and band
 * checked by `document-v2.ts` itself — no longer through a synthetic schema-1 envelope — and its
 * score by `score-codec.ts` (`score-codec.test.ts`). These are the cases the schema-1 codec's
 * tests held for the envelope, performance and band, ported onto the one validator left.
 */

/** A chart as the app stores one, every optional field it can hold but trading and energy. */
function makeChartDocument(): ChartDocument {
    return {
        schemaVersion: 2,
        id: 'chart-ada-001',
        title: 'Odd-Meter Study',
        createdAt: '2026-08-28T12:00:00.000Z',
        updatedAt: '2026-08-28T12:30:00.000Z',
        revision: 3,
        chart: {
            score: {
                key: 'Gb',
                isMinor: false,
                notation: 'roman',
                meter: '5/4',
                grouping: [2, 3],
                sections: [
                    {
                        id: 'section-a',
                        label: 'A',
                        repeat: 2,
                        key: 'Gb',
                        isMinor: false,
                        seamless: true,
                        targetIntensity: 0.62,
                        instruments: {
                            groove: true,
                            bass: true,
                            chords: false,
                            harmony: true,
                            soloist: false,
                        },
                        measures: [
                            {
                                id: 'm1',
                                content: {
                                    kind: 'events',
                                    events: [{ kind: 'chord', symbol: 'Gb^7', duration: [5, 1] }],
                                },
                            },
                        ],
                    },
                ],
            },
            performance: {
                bpm: 117,
                seed: 'A1B2C3',
                randomizeSeed: false,
            },
            band: {
                chords: {
                    enabled: true,
                    voice: 'pack:grand',
                    autoSound: false,
                    volume: 0.82,
                    reverb: 0.24,
                },
                bass: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    volume: 0.9,
                    reverb: 0.12,
                },
                soloist: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    volume: 0.88,
                    reverb: 0.3,
                    mode: 'monophonic',
                    autoMode: false,
                },
                groove: {
                    enabled: true,
                    voice: 'pack:studio-kit',
                    autoSound: false,
                    volume: 0.95,
                    reverb: 0.18,
                    swing: 56,
                    swingSub: '16th',
                    humanize: 23,
                    genre: 'Jazz',
                },
            },
        },
    };
}

/** The same chart as a text chart (schemaVersion 1), the format retired in #1740. */
function makeTextChart(): Record<string, unknown> {
    const { chart, ...envelope } = makeChartDocument();
    return {
        ...envelope,
        schemaVersion: 1,
        chart: {
            arrangement: {
                sections: [{ id: 'section-a', label: 'A', value: 'Imaj7 | IVmaj7', repeat: 2 }],
                key: 'Gb',
                timeSignature: '5/4',
                grouping: [2, 3],
                isMinor: false,
                notation: 'roman',
            },
            performance: chart.performance,
            band: chart.band,
        },
    };
}

describe('Songbook codecs (#1044)', () => {
    it('round-trips every nested ChartDocument field through JSON unchanged', () => {
        const document = makeChartDocument();
        const encoded = encodeChartDocument(document);
        expect(encoded.kind).toBe('ok');
        if (encoded.kind !== 'ok') {
            return;
        }

        const decoded = decodeChartDocument(encoded.json);
        expect(decoded).toEqual({ kind: 'ok', value: document });
    });

    it('returns a detached typed value without mutating the candidate', () => {
        const document = makeChartDocument();
        const documentBefore = structuredClone(document);

        const documentResult = validateChartDocument(document);
        expect(document).toEqual(documentBefore);
        expect(documentResult.kind).toBe('ok');
        if (documentResult.kind !== 'ok') {
            return;
        }

        documentResult.value.chart.score.sections[0].label = 'Changed result';
        documentResult.value.chart.band.chords.volume = 0;
        expect(document.chart.score.sections[0].label).toBe('A');
        expect(document.chart.band.chords.volume).toBe(0.82);
    });

    it('rejects the complete current candidate instead of returning a partial document', () => {
        const candidate = makeChartDocument() as any;
        candidate.chart.band.bass.volume = 9;
        candidate.chart.band.groove.swing = 'hit';
        candidate.chart.band.chords.buffer = [];

        const result = validateChartDocument(candidate);
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') {
            return;
        }
        expect(result).not.toHaveProperty('value');
        expect(result.issues.map((issue) => issue.path)).toEqual(
            expect.arrayContaining([
                '$.chart.band.bass.volume',
                '$.chart.band.groove.swing',
                '$.chart.band.chords.buffer',
            ]),
        );
    });

    it('preserves an unsupported future document verbatim for recovery/export', () => {
        const source = JSON.stringify({
            schemaVersion: 12,
            opaqueFutureShape: { doNotDefault: ['x', { nested: true }] },
        });
        expect(decodeChartDocument(source)).toEqual({
            kind: 'future-version',
            schemaVersion: 12,
            source,
        });
    });

    it('refuses a text chart (schemaVersion 1) as a historical version, and says which it is', () => {
        const textChart = makeTextChart();
        expect(validateChartDocument(textChart)).toEqual({
            kind: 'invalid',
            issues: [
                expect.objectContaining({
                    path: '$.schemaVersion',
                    message: 'Unsupported historical schema version 1',
                }),
            ],
        });
        expect(decodeChartDocument(JSON.stringify(textChart)).kind).toBe('invalid');
        expect(encodeChartDocument(textChart as unknown as ChartDocument).kind).toBe('invalid');
        // What the app asks to tell an old file or link apart from a broken one.
        expect(isRetiredSchema(textChart)).toBe(true);
        expect(isRetiredSchema(makeChartDocument())).toBe(false);
        expect(isRetiredSchema({ schemaVersion: '1' })).toBe(false);
        expect(isRetiredSchema(null)).toBe(false);
        expect(isRetiredSchema([1])).toBe(false);
    });

    it('reads the retired version stamp without invoking an accessor', () => {
        let getterRead = false;
        const candidate = Object.defineProperty({}, 'schemaVersion', {
            enumerable: true,
            get() {
                getterRead = true;
                return 1;
            },
        });
        expect(isRetiredSchema(candidate)).toBe(false);
        expect(getterRead).toBe(false);
    });

    it('rejects duplicate section identities and unknown current-schema fields', () => {
        const duplicate = makeChartDocument();
        duplicate.chart.score.sections.push({
            ...structuredClone(duplicate.chart.score.sections[0]),
            label: 'Duplicate identity',
            measures: [{ ...duplicate.chart.score.sections[0].measures[0], id: 'm2' }],
        });
        const duplicated = validateChartDocument(duplicate);
        expect(duplicated.kind === 'invalid' && duplicated.issues).toEqual([
            expect.objectContaining({ path: '$.chart.score.sections[1].id' }),
        ]);

        for (const [path, apply] of [
            [
                '$.chart.performance.transportStep',
                (d: any) => (d.chart.performance.transportStep = 64),
            ],
            ['$.revisionNote', (d: any) => (d.revisionNote = 'x')],
            ['$.chart.arrangement', (d: any) => (d.chart.arrangement = {})],
            ['$.metadata.tempo', (d: any) => (d.metadata = { tempo: 'fast' })],
            [
                '$.importSource.url',
                (d: any) => (d.importSource = { format: 'irealb', text: 'x', url: 'y' }),
            ],
        ] as const) {
            const candidate = makeChartDocument() as any;
            apply(candidate);
            const result = validateChartDocument(candidate);
            expect(result.kind, path).toBe('invalid');
            expect(result.kind === 'invalid' && result.issues, path).toContainEqual(
                expect.objectContaining({ path, code: 'unknown-field' }),
            );
        }
    });

    it.each([
        ['id', '', '$.id'],
        ['id', '<script>', '$.id'],
        ['title', '', '$.title'],
        ['title', 'x'.repeat(201), '$.title'],
        ['createdAt', 'yesterday', '$.createdAt'],
        ['updatedAt', 42, '$.updatedAt'],
        ['revision', -1, '$.revision'],
        ['revision', 1.5, '$.revision'],
    ])('checks the envelope: %s = %j is refused', (key, value, path) => {
        const candidate = { ...makeChartDocument(), [key]: value };
        const result = validateChartDocument(candidate);
        expect(result.kind).toBe('invalid');
        expect(result.kind === 'invalid' && result.issues.map((issue) => issue.path)).toContain(
            path,
        );
    });

    it('requires every envelope field', () => {
        for (const key of ['id', 'title', 'createdAt', 'updatedAt', 'revision', 'chart']) {
            const candidate = makeChartDocument() as any;
            delete candidate[key];
            const result = validateChartDocument(candidate);
            expect(result.kind === 'invalid' && result.issues, key).toContainEqual(
                expect.objectContaining({ path: `$.${key}`, code: 'missing-field' }),
            );
        }
        for (const key of ['score', 'performance', 'band']) {
            const candidate = makeChartDocument() as any;
            delete candidate.chart[key];
            const result = validateChartDocument(candidate);
            expect(result.kind === 'invalid' && result.issues, key).toContainEqual(
                expect.objectContaining({ path: `$.chart.${key}`, code: 'missing-field' }),
            );
        }
    });

    it('reads trading as optional: absent is off, and only real partners and lengths pass', () => {
        const plain = makeChartDocument();
        const decoded = validateChartDocument(plain);
        expect(decoded.kind).toBe('ok');
        if (decoded.kind === 'ok') {
            expect(decoded.value.chart.band.soloist.tradeWith).toBeUndefined();
        }

        const trading = makeChartDocument();
        trading.chart.band.soloist.tradeWith = 'drums';
        trading.chart.band.soloist.tradeBars = 8;
        const traded = validateChartDocument(trading);
        expect(traded.kind).toBe('ok');
        if (traded.kind === 'ok') {
            expect(traded.value.chart.band.soloist).toMatchObject({
                tradeWith: 'drums',
                tradeBars: 8,
            });
        }

        const bad = makeChartDocument() as unknown as {
            chart: { band: { soloist: Record<string, unknown> } };
        };
        bad.chart.band.soloist.tradeWith = 'piano';
        bad.chart.band.soloist.tradeBars = 3;
        const result = validateChartDocument(bad);
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') {
            return;
        }
        for (const path of ['$.chart.band.soloist.tradeWith', '$.chart.band.soloist.tradeBars']) {
            expect(result.issues).toContainEqual(
                expect.objectContaining({ path, code: 'invalid-value' }),
            );
        }
    });

    it('round-trips tradeChoruses, defaults it absent, and rejects out-of-range values', () => {
        const plain = makeChartDocument();
        const decoded = validateChartDocument(plain);
        expect(decoded.kind).toBe('ok');
        if (decoded.kind === 'ok') {
            // Absent reads as undefined here too — the default of 2 is applied by the state
            // layer (`core/state/instruments.ts`), not the codec.
            expect(decoded.value.chart.band.soloist.tradeChoruses).toBeUndefined();
        }

        for (const choruses of [0, 1, 2, 3, 4] as const) {
            const trading = makeChartDocument();
            trading.chart.band.soloist.tradeWith = 'drums';
            trading.chart.band.soloist.tradeBars = 4;
            trading.chart.band.soloist.tradeChoruses = choruses;
            const traded = validateChartDocument(trading);
            expect(traded.kind, `choruses ${choruses}`).toBe('ok');
            if (traded.kind === 'ok') {
                expect(traded.value.chart.band.soloist.tradeChoruses).toBe(choruses);
            }
        }

        for (const choruses of [5, -1, 2.5]) {
            const bad = makeChartDocument() as unknown as {
                chart: { band: { soloist: Record<string, unknown> } };
            };
            bad.chart.band.soloist.tradeWith = 'drums';
            bad.chart.band.soloist.tradeBars = 4;
            bad.chart.band.soloist.tradeChoruses = choruses;
            const result = validateChartDocument(bad);
            expect(result.kind, `choruses ${choruses}`).toBe('invalid');
            if (result.kind !== 'invalid') {
                continue;
            }
            expect(result.issues).toContainEqual(
                expect.objectContaining({
                    path: '$.chart.band.soloist.tradeChoruses',
                    code: 'invalid-value',
                }),
            );
        }
    });

    it('rejects path-unsafe pack ids', () => {
        const candidate = makeChartDocument() as any;
        candidate.chart.band.chords.voice = 'pack:../../api/logout?x=';

        const result = validateChartDocument(candidate);
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') {
            return;
        }
        expect(result.issues.map((issue) => issue.path)).toEqual(['$.chart.band.chords.voice']);
    });

    it('rejects accessor-bearing candidates without invoking their getters', () => {
        let getterRead = false;
        const candidate = Object.defineProperty({}, 'schemaVersion', {
            enumerable: true,
            get() {
                getterRead = true;
                throw new Error('must not run');
            },
        });

        expect(() => validateChartDocument(candidate)).not.toThrow();
        const result = validateChartDocument(candidate);
        expect(result).toEqual({
            kind: 'invalid',
            issues: [expect.objectContaining({ path: '$.schemaVersion', code: 'invalid-type' })],
        });
        expect(getterRead).toBe(false);
    });

    it('revalidates the exact detached snapshot produced by object serialization', () => {
        let deepPayload: unknown = true;
        for (let depth = 0; depth < 33; depth++) {
            deepPayload = { child: deepPayload };
        }
        const candidate = new Proxy(
            { schemaVersion: 2, payload: null as unknown },
            {
                get(target, property, receiver) {
                    return property === 'payload'
                        ? deepPayload
                        : Reflect.get(target, property, receiver);
                },
            },
        );

        const result = validateChartDocument(candidate);
        expect(result).toEqual({
            kind: 'invalid',
            issues: [expect.objectContaining({ code: 'structure-too-deep' })],
        });
    });

    it('keeps runtime/derived state out of the portable chart representation', () => {
        const encoded = encodeChartDocument(makeChartDocument());
        expect(encoded.kind).toBe('ok');
        if (encoded.kind !== 'ok') {
            return;
        }

        for (const forbidden of [
            'bandIntensity',
            'autoIntensity',
            'sectionSeedMap',
            'progression',
            'stepMap',
            'history',
            'buffer',
            'audio',
            'currentLoopCount',
        ]) {
            expect(encoded.json).not.toContain(`"${forbidden}"`);
        }
    });
});

/**
 * The chart format (DECISION 2026-09-26, #1404): the music plus the settings the band honours.
 * The genre is stored once, the band's energy rides the chart, and the old engine's band and
 * performance fields are refused (#1741).
 */

/**
 * Every band and performance field the old engine wrote, by its path in a stored chart, with a
 * value it once accepted. None of them is accepted any more (#1741).
 */
const RETIRED_FIELDS: ReadonlyArray<[path: string, value: unknown]> = [
    ['$.chart.performance.complexity', 0.67],
    [
        '$.chart.band.harmony',
        {
            enabled: true,
            voice: 'synth',
            autoSound: true,
            volume: 0.7,
            reverb: 0.4,
            style: 'smart',
            octave: 60,
            complexity: 0.58,
        },
    ],
    ['$.chart.band.chords.style', 'smart'],
    ['$.chart.band.chords.instrument', 'Piano'],
    ['$.chart.band.chords.octave', 48],
    ['$.chart.band.chords.density', 'rich'],
    ['$.chart.band.bass.style', 'smart'],
    ['$.chart.band.bass.octave', 38],
    ['$.chart.band.soloist.style', 'smart'],
    ['$.chart.band.soloist.preset', 'trumpet'],
    ['$.chart.band.soloist.octave', 72],
    ['$.chart.band.soloist.phrasingIntensity', 0.74],
    ['$.chart.band.soloist.tradeMode', 'sections'],
    ['$.chart.band.groove.measures', 2],
    ['$.chart.band.groove.lastDrumPreset', 'Basic Rock'],
    ['$.chart.band.groove.genreFeel', 'Jazz'],
    ['$.chart.band.groove.lastSmartGenre', 'Jazz'],
    ['$.chart.band.groove.pattern', [{ name: 'Kick', steps: [1, 0, 0, 0] }]],
];

/** `document` with `value` set at `path` (`$.a.b.c`). */
function withField(document: object, path: string, value: unknown): object {
    const copy = structuredClone(document) as Record<string, unknown>;
    const keys = path.split('.').slice(1);
    const last = keys.pop() as string;
    const holder = keys.reduce<Record<string, unknown>>(
        (node, key) => node[key] as Record<string, unknown>,
        copy,
    );
    holder[last] = value;
    return copy;
}

describe("the old engine's fields, refused (#1741)", () => {
    it('refuses a chart carrying all of them, naming every field it no longer accepts', () => {
        let older: object = makeChartDocument();
        for (const [path, value] of RETIRED_FIELDS) {
            older = withField(older, path, value);
        }
        // …and the genre it stored only the old way (`genreFeel`) is missing.
        delete (older as any).chart.band.groove.genre;
        const result = decodeChartDocument(JSON.stringify(older));
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') {
            return;
        }
        const unknown = result.issues
            .filter((issue) => issue.code === 'unknown-field')
            .map((issue) => issue.path);
        expect(unknown.sort()).toEqual(RETIRED_FIELDS.map(([path]) => path).sort());
        expect(result.issues).toContainEqual(
            expect.objectContaining({ path: '$.chart.band.groove.genre', code: 'missing-field' }),
        );
    });

    it.each(RETIRED_FIELDS)('refuses a chart carrying %s', (path, value) => {
        const document = makeChartDocument();
        expect(validateChartDocument(document).kind).toBe('ok');
        const result = validateChartDocument(withField(document, path, value));
        expect(result.kind).toBe('invalid');
        expect(result.kind === 'invalid' && result.issues).toContainEqual(
            expect.objectContaining({ path, code: 'unknown-field' }),
        );
    });

    it('requires the genre', () => {
        const candidate = structuredClone(makeChartDocument()) as any;
        delete candidate.chart.band.groove.genre;
        const result = validateChartDocument(candidate);
        expect(result.kind === 'invalid' && result.issues).toEqual([
            expect.objectContaining({
                path: '$.chart.band.groove.genre',
                code: 'missing-field',
            }),
        ]);
    });
});

describe('chart format: the settings the band honours', () => {
    /** The same chart as a chart is written today. */
    function makeWrittenChart(): ChartDocument {
        const old = makeChartDocument();
        return {
            ...old,
            chart: { score: old.chart.score, ...writtenSettings(old.chart) },
        };
    }

    it('round-trips a chart as written today losslessly, holding only the kept fields', () => {
        const written = makeWrittenChart();
        const encoded = encodeChartDocument(written);
        expect(encoded.kind).toBe('ok');
        if (encoded.kind !== 'ok') {
            return;
        }
        expect(decodeChartDocument(encoded.json)).toEqual({ kind: 'ok', value: written });
        const { performance, band } = written.chart;
        expect(Object.keys(performance)).toEqual(['bpm', 'seed', 'randomizeSeed', 'energy']);
        expect(Object.keys(band)).toEqual(['chords', 'bass', 'soloist', 'groove']);
        const mix = ['enabled', 'voice', 'autoSound', 'volume', 'reverb'];
        expect(Object.keys(band.chords)).toEqual(mix);
        expect(Object.keys(band.bass)).toEqual(mix);
        expect(Object.keys(band.soloist)).toEqual([...mix, 'mode', 'autoMode']);
        expect(Object.keys(band.groove)).toEqual([
            ...mix,
            'swing',
            'swingSub',
            'humanize',
            'genre',
        ]);
        expect(band.groove.genre).toBe('Jazz');
    });

    it("keeps a chart's trading when it is written today", () => {
        const old = makeChartDocument();
        old.chart.band.soloist.tradeWith = 'drums';
        old.chart.band.soloist.tradeBars = 8;
        old.chart.band.soloist.tradeChoruses = 0;
        expect(writtenSettings(old.chart).band.soloist).toMatchObject({
            tradeWith: 'drums',
            tradeBars: 8,
            tradeChoruses: 0,
        });
        old.chart.band.soloist.tradeWith = 'off';
        expect(writtenSettings(old.chart).band.soloist).not.toHaveProperty('tradeBars');
    });

    describe('genre, stored once', () => {
        function withGenre(genre: string): ChartDocument {
            const candidate = makeWrittenChart();
            candidate.chart.band.groove.genre = genre;
            return candidate;
        }

        it('reads a canonical genre name and writes it back as it is', () => {
            const result = validateChartDocument(withGenre('Ska-Punk'));
            expect(result.kind === 'ok' && result.value.chart.band.groove.genre).toBe('Ska-Punk');
            if (result.kind === 'ok') {
                expect(writtenSettings(result.value.chart).band.groove.genre).toBe('Ska-Punk');
            }
        });

        it.each([
            ['a feel spelling', 'Bossa Nova'],
            ['a retired genre', 'Shred'],
            ['a prototype key', 'constructor'],
            ['an empty string', ''],
        ])('stores only a canonical genre name, not %s', (_, genre) => {
            const result = validateChartDocument(withGenre(genre));
            expect(result.kind).toBe('invalid');
            if (result.kind === 'invalid') {
                expect(result.issues.map((issue) => issue.path)).toContain(
                    '$.chart.band.groove.genre',
                );
            }
        });
    });

    describe('energy, per chart', () => {
        function withEnergy(energy: unknown): ChartDocument {
            const candidate = makeWrittenChart() as any;
            candidate.chart.performance.energy = energy;
            return candidate;
        }

        it.each([['auto'], [0], [0.35], [1]])('round-trips %s', (energy) => {
            const encoded = encodeChartDocument(withEnergy(energy));
            expect(encoded.kind).toBe('ok');
            if (encoded.kind !== 'ok') {
                return;
            }
            const decoded = decodeChartDocument(encoded.json);
            expect(decoded.kind === 'ok' && decoded.value.chart.performance.energy).toBe(energy);
        });

        it.each([[-0.1], [1.01], ['high'], [null], [true], [{}]])('rejects %j', (energy) => {
            const result = validateChartDocument(withEnergy(energy));
            expect(result.kind).toBe('invalid');
            if (result.kind === 'invalid') {
                expect(result.issues).toContainEqual(
                    expect.objectContaining({
                        path: '$.chart.performance.energy',
                        code: 'invalid-value',
                    }),
                );
            }
        });

        it('reads a chart without energy (saved before it existed) as auto', () => {
            const old = makeChartDocument();
            expect(old.chart.performance).not.toHaveProperty('energy');
            const result = validateChartDocument(old);
            expect(result.kind === 'ok' && result.value.chart.performance.energy).toBeUndefined();
            expect(writtenSettings(old.chart).performance.energy).toBe('auto');
        });
    });
});
