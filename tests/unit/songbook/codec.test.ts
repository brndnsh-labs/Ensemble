import { describe, expect, it } from 'vitest';
import {
    decodeChartDocument,
    decodeWorkspacePreferences,
    encodeChartDocument,
    encodeWorkspacePreferences,
    validateChartDocument,
    validateWorkspacePreferences,
} from '../../../public/songbook/codec.js';
import { SONGBOOK_MAX_SECTIONS } from '../../../public/songbook/structural-limits.js';
import type { ChartDocument, WorkspacePreferences } from '../../../public/songbook/types.js';

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
            practiceMode: true,
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
