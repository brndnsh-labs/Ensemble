import { describe, expect, it } from 'vitest';
import {
    chartGenre,
    decodeChartDocument,
    decodeWorkspacePreferences,
    encodeChartDocument,
    encodeWorkspacePreferences,
    validateChartDocument,
    validateWorkspacePreferences,
    writtenSettings,
} from '../../../public/songbook/codec.js';
import { SONGBOOK_MAX_SECTIONS } from '../../../public/songbook/structural-limits.js';
import type { ChartDocument, WorkspacePreferences } from '../../../public/songbook/types.js';

/**
 * A chart saved before the chart-format decision (2026-09-26): it carries every field the old
 * engine wrote, and its genre twice. Every test that reads it is a backward-compatible READ.
 */
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
                lastChordPreset: 'User Study',
            },
            performance: {
                bpm: 117,
                complexity: 0.67,
                seed: 'A1B2C3',
                randomizeSeed: false,
            },
            band: {
                chords: {
                    enabled: true,
                    voice: 'pack:grand',
                    autoSound: false,
                    style: 'smart',
                    instrument: 'Piano',
                    octave: 48,
                    density: 'rich',
                    volume: 0.82,
                    reverb: 0.24,
                },
                bass: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    style: 'smart',
                    octave: 38,
                    volume: 0.9,
                    reverb: 0.12,
                },
                soloist: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    style: 'smart',
                    preset: 'trumpet',
                    octave: 72,
                    volume: 0.88,
                    reverb: 0.3,
                    mode: 'monophonic',
                    autoMode: false,
                    phrasingIntensity: 0.74,
                    tradeMode: 'sections',
                },
                harmony: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: true,
                    style: 'smart',
                    octave: 60,
                    volume: 0.7,
                    reverb: 0.4,
                    complexity: 0.58,
                },
                groove: {
                    enabled: true,
                    voice: 'pack:studio-kit',
                    autoSound: false,
                    volume: 0.95,
                    reverb: 0.18,
                    measures: 2,
                    swing: 56,
                    swingSub: '16th',
                    humanize: 23,
                    lastDrumPreset: 'Basic Rock',
                    genreFeel: 'Jazz',
                    lastSmartGenre: 'Jazz',
                    pattern: [
                        { name: 'Kick', steps: [1, 0, 0, 0, 2, 0, 0, 0] },
                        { name: 'Snare', steps: [0, 0, 1, 0, 0, 0, 1, 0] },
                    ],
                },
            },
        },
    };
}

function makeWorkspacePreferences(): WorkspacePreferences {
    return {
        schemaVersion: 1,
        appearance: {
            palette: 'forest',
            mode: 'dark',
            visualFlash: true,
            qualityColors: true,
            visualizerEnabled: false,
        },
        practice: {
            countIn: true,
            applyPresetSettings: false,
            sessionTimer: 20,
            songMode: true,
            rampBpmPerLoop: 6,
            rampStartPct: 0.7,
        },
        masterVolume: 0.46,
        midi: {
            enabled: true,
            selectedOutputId: 'output-device-1',
            inputEnabled: true,
            selectedInputId: 'input-device-1',
            chordsChannel: 1,
            bassChannel: 2,
            soloistChannel: 3,
            harmonyChannel: 4,
            drumsChannel: 10,
            chordsOctave: 1,
            bassOctave: -1,
            soloistOctave: 0,
            harmonyOctave: 1,
            drumsOctave: 0,
            latency: -12,
            muteLocal: true,
            velocitySensitivity: 1.4,
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

    it('round-trips every nested WorkspacePreferences field through JSON unchanged', () => {
        const preferences = makeWorkspacePreferences();
        const encoded = encodeWorkspacePreferences(preferences);
        expect(encoded.kind).toBe('ok');
        if (encoded.kind !== 'ok') {
            return;
        }

        const decoded = decodeWorkspacePreferences(encoded.json);
        expect(decoded).toEqual({ kind: 'ok', value: preferences });
    });

    it('returns detached typed values without mutating either candidate', () => {
        const document = makeChartDocument();
        const preferences = makeWorkspacePreferences();
        const documentBefore = structuredClone(document);
        const preferencesBefore = structuredClone(preferences);

        const documentResult = validateChartDocument(document);
        const preferencesResult = validateWorkspacePreferences(preferences);
        expect(document).toEqual(documentBefore);
        expect(preferences).toEqual(preferencesBefore);
        expect(documentResult.kind).toBe('ok');
        expect(preferencesResult.kind).toBe('ok');
        if (documentResult.kind !== 'ok' || preferencesResult.kind !== 'ok') {
            return;
        }

        documentResult.value.chart.arrangement.sections[0].label = 'Changed result';
        preferencesResult.value.midi.chordsChannel = 16;
        expect(document.chart.arrangement.sections[0].label).toBe('A');
        expect(preferences.midi.chordsChannel).toBe(1);
    });

    it('rejects the complete current candidate instead of returning a partial document', () => {
        const candidate = makeChartDocument() as any;
        candidate.chart.band.bass.volume = 9;
        candidate.chart.band.groove.pattern[0].steps[0] = 'hit';
        candidate.chart.band.harmony.buffer = [];

        const result = validateChartDocument(candidate);
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') {
            return;
        }
        expect(result).not.toHaveProperty('value');
        expect(result.issues.map((issue) => issue.path)).toEqual(
            expect.arrayContaining([
                '$.chart.band.bass.volume',
                '$.chart.band.groove.pattern.0.steps.0',
                '$.chart.band.harmony.buffer',
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

    it('preserves an unsupported future preferences object as a detached source value', () => {
        const source = {
            schemaVersion: 4,
            futurePreference: { nested: ['keep-me'] },
        };
        const result = validateWorkspacePreferences(source);
        expect(result).toEqual({ kind: 'future-version', schemaVersion: 4, source });
        if (result.kind !== 'future-version') {
            return;
        }
        expect(result.source).not.toBe(source);
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

    /**
     * #1314 — `practiceMode` was retired from the app. It is still listed in
     * `validatePractice`'s OPTIONAL keys, and deliberately not read, so that the workspace
     * documents users already saved keep loading while the key itself is dropped on the way
     * in and never written again. These three cases are the whole contract.
     */
    describe('retired practiceMode key (#1314)', () => {
        it.each([true, false])(
            'accepts a legacy document carrying practiceMode: %s and drops the key',
            (legacy) => {
                const candidate = makeWorkspacePreferences() as any;
                candidate.practice.practiceMode = legacy;

                const result = validateWorkspacePreferences(candidate);
                expect(result.kind).toBe('ok');
                if (result.kind !== 'ok') {
                    return;
                }
                expect(Object.hasOwn(result.value.practice, 'practiceMode')).toBe(false);
                // The rest of the practice block survives untouched.
                expect(result.value.practice).toEqual(makeWorkspacePreferences().practice);

                // And a round-trip through the encoder strips it from the JSON as well —
                // `encodeValidated` stringifies what the validator BUILDS, not its input.
                const encoded = encodeWorkspacePreferences(candidate);
                expect(encoded.kind).toBe('ok');
                if (encoded.kind !== 'ok') {
                    return;
                }
                expect(encoded.json).not.toContain('practiceMode');
                expect(decodeWorkspacePreferences(encoded.json)).toEqual({
                    kind: 'ok',
                    value: makeWorkspacePreferences(),
                });
            },
        );

        it('accepts a document that omits practiceMode (every new save)', () => {
            const candidate = makeWorkspacePreferences();
            expect(Object.hasOwn(candidate.practice, 'practiceMode')).toBe(false);

            const result = validateWorkspacePreferences(candidate);
            expect(result.kind).toBe('ok');
        });

        it('still rejects an unknown key in the same block', () => {
            // The guard was made tolerant of ONE named legacy key, not loosened: anything
            // else in the practice block is still an unknown field.
            const candidate = makeWorkspacePreferences() as any;
            candidate.practice.practiceMode = true; // tolerated
            candidate.practice.practiceModeX = true; // not
            candidate.practice.rehearsalMode = false; // not

            const result = validateWorkspacePreferences(candidate);
            expect(result.kind).toBe('invalid');
            if (result.kind !== 'invalid') {
                return;
            }
            expect(result.issues.map((issue) => issue.path)).toEqual(
                expect.arrayContaining(['$.practice.practiceModeX', '$.practice.rehearsalMode']),
            );
            expect(result.issues.map((issue) => issue.path)).not.toContain(
                '$.practice.practiceMode',
            );
        });
    });

    it('rejects a genre name and engine feel that describe different genres', () => {
        const candidate = makeChartDocument();
        candidate.chart.band.groove.genreFeel = 'Rock';
        candidate.chart.band.groove.lastSmartGenre = 'Jazz';

        const result = validateChartDocument(candidate);
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') {
            return;
        }
        expect(result.issues).toContainEqual(
            expect.objectContaining({
                path: '$.chart.band.groove.lastSmartGenre',
                code: 'invalid-value',
            }),
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

    it('rejects unknown groove lanes and path-unsafe pack ids', () => {
        const candidate = makeChartDocument() as any;
        candidate.chart.band.groove.pattern[0].name = 'Cowbell';
        candidate.chart.band.chords.voice = 'pack:../../api/logout?x=';

        const result = validateChartDocument(candidate);
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') {
            return;
        }
        expect(result.issues.map((issue) => issue.path)).toEqual(
            expect.arrayContaining([
                '$.chart.band.groove.pattern.0.name',
                '$.chart.band.chords.voice',
            ]),
        );
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
            'modals',
            'currentLoopCount',
        ]) {
            expect(encoded.json).not.toContain(`"${forbidden}"`);
        }
    });
});

/**
 * The chart format (DECISION 2026-09-26, #1404): the music plus the settings the band honours.
 * The old engine's fields are still read (lazily dropped on the next save, never by migration),
 * the genre is stored once, and the band's energy rides the chart.
 */
/** A chart as the codec before 2026-09-26 serialized it (see the test that reads it). */
// biome-ignore format: exact bytes
const OLDER_BUILD_BYTES =
    '{"schemaVersion":1,"id":"chart-ada-001","title":"Odd-Meter Study","createdAt":"2026-08-28T12:00:00.000Z","updatedAt":"2026-08-28T12:30:00.000Z","revision":3,"chart":{"arrangement":{"sections":[{"id":"section-a","label":"A","value":"Imaj7 | IVmaj7","repeat":2,"key":"Gb","isMinor":false,"timeSignature":"5/4","seamless":true,"targetIntensity":0.62,"instruments":{"groove":true,"bass":true,"chords":false,"harmony":true,"soloist":false}}],"key":"Gb","timeSignature":"5/4","grouping":[2,3],"isMinor":false,"notation":"roman","lastChordPreset":"User Study"},"performance":{"bpm":117,"complexity":0.67,"seed":"A1B2C3","randomizeSeed":false},"band":{"chords":{"enabled":true,"voice":"pack:grand","autoSound":false,"volume":0.82,"reverb":0.24,"style":"smart","instrument":"Piano","octave":48,"density":"rich"},"bass":{"enabled":true,"voice":"synth","autoSound":true,"volume":0.9,"reverb":0.12,"style":"smart","octave":38},"soloist":{"enabled":true,"voice":"synth","autoSound":true,"volume":0.88,"reverb":0.3,"style":"smart","preset":"trumpet","octave":72,"mode":"monophonic","autoMode":false,"phrasingIntensity":0.74,"tradeMode":"sections","tradeWith":"drums","tradeBars":8,"tradeChoruses":3},"harmony":{"enabled":true,"voice":"synth","autoSound":true,"volume":0.7,"reverb":0.4,"style":"smart","octave":60,"complexity":0.58},"groove":{"enabled":true,"voice":"pack:studio-kit","autoSound":false,"volume":0.95,"reverb":0.18,"measures":2,"swing":56,"swingSub":"16th","humanize":23,"lastDrumPreset":"Basic Rock","genreFeel":"Jazz","lastSmartGenre":"Jazz","pattern":[{"name":"Kick","steps":[1,0,0,0,2,0,0,0]},{"name":"Snare","steps":[0,0,1,0,0,0,1,0]}]}}}}';

describe('chart format: the settings the band honours', () => {
    /** The same chart as a chart is written today. */
    function makeWrittenChart(): ChartDocument {
        const old = makeChartDocument();
        return {
            ...old,
            chart: { arrangement: old.chart.arrangement, ...writtenSettings(old.chart) },
        };
    }

    it('reproduces the bytes an older build wrote, legacy fields and all', () => {
        // The account API refuses a Save whose bytes are not the codec's canonical form
        // (`decodeSaveRequest`), and a Save an older build queued carries these fields in
        // that build's order. These are the exact bytes the codec before 2026-09-26 emitted
        // for this chart (trading included), recorded from it when the format changed.
        const result = decodeChartDocument(OLDER_BUILD_BYTES);
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') {
            return;
        }
        expect(JSON.stringify(result.value)).toBe(OLDER_BUILD_BYTES);
    });

    it('still checks a legacy field when a chart carries one', () => {
        const candidate = makeChartDocument() as any;
        candidate.chart.band.chords.style = 'retired-style';
        candidate.chart.band.soloist.tradeMode = 'forever';
        candidate.chart.performance.complexity = 2;
        const result = validateChartDocument(candidate);
        expect(result.kind).toBe('invalid');
        if (result.kind !== 'invalid') {
            return;
        }
        expect(result.issues.map((issue) => issue.path)).toEqual(
            expect.arrayContaining([
                '$.chart.band.chords.style',
                '$.chart.band.soloist.tradeMode',
                '$.chart.performance.complexity',
            ]),
        );
    });

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
        function withGenre(groove: Record<string, unknown>): ChartDocument {
            const candidate = makeWrittenChart() as any;
            delete candidate.chart.band.groove.genre;
            Object.assign(candidate.chart.band.groove, groove);
            return candidate;
        }

        it.each([
            ['genre alone', { genre: 'Bossa' }, 'Bossa'],
            ['the legacy name alone', { lastSmartGenre: 'Bossa' }, 'Bossa'],
            ['the legacy feel alone, in the feel spelling', { genreFeel: 'Bossa Nova' }, 'Bossa'],
            ['the legacy feel for Ska-Punk', { genreFeel: 'Ska' }, 'Ska-Punk'],
            ['the legacy pair', { lastSmartGenre: 'Ska-Punk', genreFeel: 'Ska' }, 'Ska-Punk'],
            [
                'genre, over a legacy pair that disagrees with it',
                { genre: 'Funk', lastSmartGenre: 'Jazz', genreFeel: 'Jazz' },
                'Funk',
            ],
        ])('reads %s', (_, groove, expected) => {
            const result = validateChartDocument(withGenre(groove));
            expect(result.kind).toBe('ok');
            if (result.kind !== 'ok') {
                return;
            }
            expect(chartGenre(result.value.chart.band.groove)).toBe(expected);
            // …and writes it back once, by name.
            const { groove: written } = writtenSettings(result.value.chart).band;
            expect(written.genre).toBe(expected);
            expect(written).not.toHaveProperty('genreFeel');
            expect(written).not.toHaveProperty('lastSmartGenre');
        });

        it.each([
            ['a feel spelling', 'Bossa Nova'],
            ['a retired genre', 'Shred'],
            ['a prototype key', 'constructor'],
            ['an empty string', ''],
        ])('stores only a canonical genre name, not %s', (_, genre) => {
            const result = validateChartDocument(withGenre({ genre }));
            expect(result.kind).toBe('invalid');
            if (result.kind === 'invalid') {
                expect(result.issues.map((issue) => issue.path)).toContain(
                    '$.chart.band.groove.genre',
                );
            }
        });

        it('requires a genre in one form or the other', () => {
            const result = validateChartDocument(withGenre({}));
            expect(result).toEqual({
                kind: 'invalid',
                issues: [
                    expect.objectContaining({
                        path: '$.chart.band.groove.genre',
                        code: 'missing-field',
                    }),
                ],
            });
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
