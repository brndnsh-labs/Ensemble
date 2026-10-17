import { describe, expect, it } from 'vitest';
import {
    decodeChartDocument,
    encodeChartDocument,
    validateChartDocument,
    writtenSettings,
} from '../../../public/songbook/codec.js';
import { validateChartDocumentV2 } from '../../../public/songbook/document-v2.js';
import type { ChartDocumentV2 } from '../../../public/songbook/score-types.js';
import { SONGBOOK_MAX_SECTIONS } from '../../../public/songbook/structural-limits.js';
import type { ChartDocument } from '../../../public/songbook/types.js';

/** A chart as the app stored one, every optional field it can hold but trading and energy. */
function makeChartDocument(): ChartDocument {
    return {
        schemaVersion: 1,
        id: 'chart-ada-001',
        title: 'Odd-Meter Study',
        createdAt: '2026-08-28T12:00:00.000Z',
        updatedAt: '2026-08-28T12:30:00.000Z',
        revision: 3,
        chart: {
            arrangement: {
                sections: [
                    {
                        id: 'section-a',
                        label: 'A',
                        value: 'Imaj7 | IVmaj7',
                        repeat: 2,
                        key: 'Gb',
                        isMinor: false,
                        timeSignature: '5/4',
                        seamless: true,
                        targetIntensity: 0.62,
                        instruments: {
                            groove: true,
                            bass: true,
                            chords: false,
                            harmony: true,
                            soloist: false,
                        },
                    },
                ],
                key: 'Gb',
                timeSignature: '5/4',
                grouping: [2, 3],
                isMinor: false,
                notation: 'roman',
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

        documentResult.value.chart.arrangement.sections[0].label = 'Changed result';
        expect(document.chart.arrangement.sections[0].label).toBe('A');
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

    it('accepts exactly 500 sections and rejects section 501', () => {
        const atLimit = makeChartDocument();
        atLimit.chart.arrangement.sections = Array.from(
            { length: SONGBOOK_MAX_SECTIONS },
            (_, index) => ({ id: `section-${index}`, label: `S${index}`, value: 'I' }),
        );
        expect(validateChartDocument(atLimit).kind).toBe('ok');

        const overLimit = structuredClone(atLimit);
        overLimit.chart.arrangement.sections.push({ id: 'section-500', label: 'S500', value: 'I' });
        const result = validateChartDocument(overLimit);
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') {
            return;
        }
        expect(result.issues).toContainEqual(
            expect.objectContaining({
                path: '$.chart.arrangement.sections',
                code: 'too-many-sections',
            }),
        );
    });

    it('rejects duplicate section identities and unknown current-schema fields', () => {
        const candidate = makeChartDocument() as any;
        candidate.chart.arrangement.sections.push({
            ...candidate.chart.arrangement.sections[0],
            label: 'Duplicate identity',
        });
        candidate.chart.performance.transportStep = 64;

        const result = validateChartDocument(candidate);
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') {
            return;
        }
        expect(result.issues.map((issue) => issue.path)).toEqual(
            expect.arrayContaining([
                '$.chart.arrangement.sections.1.id',
                '$.chart.performance.transportStep',
            ]),
        );
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
            // layer (`public/state/instruments.ts`), not the codec.
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
/** A chart as the codec before 2026-09-26 serialized it, every old-engine field included. */
// biome-ignore format: exact bytes
const OLDER_BUILD_BYTES =
    '{"schemaVersion":1,"id":"chart-ada-001","title":"Odd-Meter Study","createdAt":"2026-08-28T12:00:00.000Z","updatedAt":"2026-08-28T12:30:00.000Z","revision":3,"chart":{"arrangement":{"sections":[{"id":"section-a","label":"A","value":"Imaj7 | IVmaj7","repeat":2,"key":"Gb","isMinor":false,"timeSignature":"5/4","seamless":true,"targetIntensity":0.62,"instruments":{"groove":true,"bass":true,"chords":false,"harmony":true,"soloist":false}}],"key":"Gb","timeSignature":"5/4","grouping":[2,3],"isMinor":false,"notation":"roman","lastChordPreset":"User Study"},"performance":{"bpm":117,"complexity":0.67,"seed":"A1B2C3","randomizeSeed":false},"band":{"chords":{"enabled":true,"voice":"pack:grand","autoSound":false,"volume":0.82,"reverb":0.24,"style":"smart","instrument":"Piano","octave":48,"density":"rich"},"bass":{"enabled":true,"voice":"synth","autoSound":true,"volume":0.9,"reverb":0.12,"style":"smart","octave":38},"soloist":{"enabled":true,"voice":"synth","autoSound":true,"volume":0.88,"reverb":0.3,"style":"smart","preset":"trumpet","octave":72,"mode":"monophonic","autoMode":false,"phrasingIntensity":0.74,"tradeMode":"sections","tradeWith":"drums","tradeBars":8,"tradeChoruses":3},"harmony":{"enabled":true,"voice":"synth","autoSound":true,"volume":0.7,"reverb":0.4,"style":"smart","octave":60,"complexity":0.58},"groove":{"enabled":true,"voice":"pack:studio-kit","autoSound":false,"volume":0.95,"reverb":0.18,"measures":2,"swing":56,"swingSub":"16th","humanize":23,"lastDrumPreset":"Basic Rock","genreFeel":"Jazz","lastSmartGenre":"Jazz","pattern":[{"name":"Kick","steps":[1,0,0,0,2,0,0,0]},{"name":"Snare","steps":[0,0,1,0,0,0,1,0]}]}}}}';

/**
 * Every band and performance field the old engine wrote, by its path in a stored chart, with a
 * value it once accepted. None of them is accepted any more (#1741).
 */
const RETIRED_FIELDS: ReadonlyArray<[path: string, value: unknown]> = [
    ['$.chart.arrangement.lastChordPreset', 'User Study'],
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

/** The same chart as a measure chart (schema 2), whose band the same validator checks. */
function makeMeasureChart(): ChartDocumentV2 {
    const { chart, ...envelope } = makeChartDocument();
    return {
        ...envelope,
        schemaVersion: 2,
        chart: {
            performance: chart.performance,
            band: chart.band,
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

describe("the old engine's fields, refused (#1741)", () => {
    it('refuses the bytes an older build wrote, naming every field it no longer accepts', () => {
        const result = decodeChartDocument(OLDER_BUILD_BYTES);
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') {
            return;
        }
        const unknown = result.issues
            .filter((issue) => issue.code === 'unknown-field')
            .map((issue) => issue.path);
        expect(unknown.sort()).toEqual(RETIRED_FIELDS.map(([path]) => path).sort());
        // …and the genre it stored only the old way is missing.
        expect(result.issues).toContainEqual(
            expect.objectContaining({ path: '$.chart.band.groove.genre', code: 'missing-field' }),
        );
    });

    it.each(RETIRED_FIELDS)('refuses a chart carrying %s, in either schema', (path, value) => {
        for (const [document, validate] of [
            [makeChartDocument(), validateChartDocument],
            [makeMeasureChart(), validateChartDocumentV2],
        ] as const) {
            if (path.startsWith('$.chart.arrangement.') && document.schemaVersion === 2) {
                continue; // A measure chart has no arrangement: its score has no such field.
            }
            expect(validate(document).kind).toBe('ok');
            const result = validate(withField(document, path, value));
            expect(result.kind).toBe('invalid');
            expect(result.kind === 'invalid' && result.issues).toContainEqual(
                expect.objectContaining({ path, code: 'unknown-field' }),
            );
        }
    });

    it('requires the genre, in either schema', () => {
        for (const [document, validate] of [
            [makeChartDocument(), validateChartDocument],
            [makeMeasureChart(), validateChartDocumentV2],
        ] as const) {
            const candidate = structuredClone(document) as any;
            delete candidate.chart.band.groove.genre;
            const result = validate(candidate);
            expect(result.kind === 'invalid' && result.issues).toEqual([
                expect.objectContaining({
                    path: '$.chart.band.groove.genre',
                    code: 'missing-field',
                }),
            ]);
        }
    });
});

describe('chart format: the settings the band honours', () => {
    /** The same chart as a chart is written today. */
    function makeWrittenChart(): ChartDocument {
        const old = makeChartDocument();
        return {
            ...old,
            chart: { arrangement: old.chart.arrangement, ...writtenSettings(old.chart) },
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
