import { describe, expect, it, vi } from 'vitest';
import { decodeChartDocument } from '../../../public/songbook/codec.js';
import {
    decodeChartDocumentV2,
    encodeChartDocumentV2,
    validateChartDocumentV2,
} from '../../../public/songbook/document-v2.js';
import { proposeLegacyScoreConversion } from '../../../public/songbook/legacy-score.js';
import { validateSemanticScore } from '../../../public/songbook/score-codec.js';
import { resolveScoreContext } from '../../../public/songbook/score-context.js';
import type { ChartDocumentV2, SemanticScore } from '../../../public/songbook/score-types.js';
import type { ChartDocument, ChartLaneMix } from '../../../public/songbook/types.js';

function scoreFixture(): SemanticScore {
    return {
        key: 'C',
        isMinor: false,
        notation: 'name',
        meter: '4/4',
        grouping: null,
        sections: [
            {
                id: 'a',
                label: 'A',
                repeat: 2,
                measures: [
                    {
                        id: 'm1',
                        content: {
                            kind: 'events',
                            events: [
                                {
                                    kind: 'chord',
                                    symbol: 'C7',
                                    duration: [2, 1],
                                    alternates: ['C9'],
                                },
                                { kind: 'no-chord', duration: [1, 1] },
                                { kind: 'hold', duration: [1, 1], fermata: true },
                            ],
                        },
                        annotations: [{ text: 'Band break', at: [0, 1], placement: 'above' }],
                    },
                ],
            },
        ],
    };
}

function legacyFixture(value = 'C G7 | Dm7 G7'): ChartDocument {
    const mix: ChartLaneMix = {
        enabled: true,
        voice: 'synth',
        autoSound: false,
        volume: 0.8,
        reverb: 0.2,
    };
    return {
        schemaVersion: 1,
        id: 'study',
        title: 'Study',
        revision: 3,
        createdAt: '2026-09-08T12:00:00.000Z',
        updatedAt: '2026-09-08T12:30:00.000Z',
        chart: {
            arrangement: {
                key: 'C',
                isMinor: false,
                timeSignature: '4/4',
                grouping: null,
                notation: 'name',
                lastChordPreset: 'My preset',
                sections: [
                    {
                        id: 'a',
                        label: 'A',
                        value,
                        repeat: 2,
                        key: 'D',
                        isMinor: true,
                        seamless: true,
                        targetIntensity: 0.5,
                        instruments: { soloist: false },
                    },
                ],
            },
            performance: { bpm: 120, complexity: 0.5, seed: 'ABC123', randomizeSeed: false },
            band: {
                chords: {
                    ...mix,
                    style: 'smart',
                    octave: 48,
                    instrument: 'Piano',
                    density: 'rich',
                },
                bass: { ...mix, style: 'smart', octave: 36 },
                harmony: { ...mix, style: 'smart', octave: 60, complexity: 0.5 },
                soloist: {
                    ...mix,
                    style: 'smart',
                    octave: 72,
                    preset: 'trumpet',
                    mode: 'monophonic',
                    autoMode: false,
                    phrasingIntensity: 0.5,
                    tradeMode: 'manual',
                },
                groove: {
                    ...mix,
                    measures: 1,
                    swing: 50,
                    swingSub: '8th',
                    humanize: 0,
                    lastDrumPreset: 'Basic Rock',
                    genreFeel: 'Jazz',
                    lastSmartGenre: 'Jazz',
                    pattern: [],
                },
            },
        },
    };
}

function documentFixture(): ChartDocumentV2 {
    const legacy = legacyFixture();
    return {
        ...legacy,
        schemaVersion: 2,
        metadata: { composer: 'Test author', style: 'Swing' },
        chart: {
            score: scoreFixture(),
            performance: legacy.chart.performance,
            band: legacy.chart.band,
        },
    };
}

describe('semantic authored-score validation', () => {
    it('retains inert original import bytes through document validation and export', () => {
        const document = documentFixture();
        document.importSource = {
            format: 'irealb',
            text: '<html><script>never execute</script>\r\n<a href="irealb://source">original</a></html>',
        };
        const encoded = encodeChartDocumentV2(document);
        expect(encoded.kind).toBe('ok');
        if (encoded.kind !== 'ok') {
            throw new Error('Expected valid import source');
        }
        expect(decodeChartDocumentV2(encoded.json)).toEqual({ kind: 'ok', value: document });
        expect(
            validateChartDocumentV2({
                ...document,
                importSource: { format: 'https', text: 'source' },
            }).kind,
        ).toBe('invalid');
        expect(
            validateChartDocumentV2({ ...document, importSource: { format: 'irealb', text: '' } })
                .kind,
        ).toBe('invalid');
        expect(
            validateChartDocumentV2({
                ...document,
                importSource: { format: 'irealb', text: 'x', executable: true },
            }).kind,
        ).toBe('invalid');
        expect(
            validateChartDocumentV2({
                ...document,
                importSource: { format: 'irealb', text: 'é'.repeat(524_289) },
            }).kind,
        ).toBe('invalid');
    });
    it('shares explicit context inheritance and meter-grouping reset rules', () => {
        const global = { key: 'C', isMinor: false, meter: '4/4', grouping: [2, 2] };
        const section = resolveScoreContext(global, { key: 'D', isMinor: true });
        expect(section).toEqual({ key: 'D', isMinor: true, meter: '4/4', grouping: [2, 2] });
        const changed = resolveScoreContext(section, { meter: '3/4' });
        expect(changed).toEqual({ key: 'D', isMinor: true, meter: '3/4', grouping: null });
        expect(resolveScoreContext(changed, {})).toEqual(changed);
        expect(resolveScoreContext(global, { meter: '6/8', grouping: [3, 3] }).grouping).toEqual([
            3, 3,
        ]);
        expect(resolveScoreContext(global, {}).grouping).not.toBe(global.grouping);
        expect(global.grouping).toEqual([2, 2]);
    });

    it('requires an existing ending pass for a jump destination', () => {
        const score = scoreFixture();
        const bar = score.sections[0].measures[0];
        bar.end = [
            {
                kind: 'jump',
                from: 'start',
                repeats: 'play',
                destination: { kind: 'ending', pass: 2 },
            },
        ];
        expect(validateSemanticScore(score).kind).toBe('invalid');
        bar.start = [{ kind: 'ending-start', passes: [2] }];
        expect(validateSemanticScore(score)).toEqual({ kind: 'ok', value: score });
    });
    it('round-trips exact music and metadata without sharing mutable references', () => {
        const source = documentFixture();
        const encoded = encodeChartDocumentV2(source);
        expect(encoded.kind).toBe('ok');
        if (encoded.kind !== 'ok') {
            throw new Error('Fixture must encode');
        }
        expect(decodeChartDocumentV2(encoded.json)).toEqual({ kind: 'ok', value: source });
        const checked = validateChartDocumentV2(source);
        expect(checked).toEqual({ kind: 'ok', value: source });
        if (checked.kind !== 'ok') {
            throw new Error('Fixture must validate');
        }
        checked.value.chart.score.sections[0].label = 'Different';
        expect(source.chart.score.sections[0].label).toBe('A');
    });

    it('retains authored repeat/endings, D.S. al Coda and measure identities, without flattening', () => {
        const score = scoreFixture();
        const first = score.sections[0].measures[0];
        first.start = [{ kind: 'repeat-start' }, { kind: 'segno', label: 'sign' }];
        first.end = [{ kind: 'coda', label: 'to-coda' }];
        score.sections[0].measures.push(
            {
                id: 'm2',
                start: [{ kind: 'ending-start', passes: [1, 3] }],
                content: { kind: 'repeat', measureId: 'm1', display: 'one-bar' },
                end: [{ kind: 'repeat-end', times: 3 }, { kind: 'ending-end' }],
            },
            {
                id: 'm3',
                start: [{ kind: 'ending-start', passes: [2] }],
                content: { kind: 'repeat', measureId: 'm1', display: 'one-bar' },
                end: [
                    { kind: 'ending-end' },
                    {
                        kind: 'jump',
                        from: 'segno',
                        segno: 'sign',
                        destination: { kind: 'coda', via: 'to-coda', target: 'coda' },
                        repeats: 'skip',
                    },
                ],
            },
            {
                id: 'm4',
                start: [{ kind: 'coda', label: 'coda' }],
                content: {
                    kind: 'events',
                    events: [{ kind: 'chord', symbol: 'F6', duration: [4, 1] }],
                },
            },
        );
        expect(validateSemanticScore(score)).toEqual({ kind: 'ok', value: score });
    });

    it('supports exact authored thirds without pretending they fit the playback grid', () => {
        const score = scoreFixture();
        score.sections[0].measures[0].content = {
            kind: 'events',
            events: ['C', 'Dm', 'G7'].map((symbol) => ({
                kind: 'chord',
                symbol,
                duration: [4, 3],
            })),
        };
        expect(validateSemanticScore(score)).toEqual({ kind: 'ok', value: score });
    });

    it('retains sticky bar meter changes within a section and resets to the next section context', () => {
        const score = scoreFixture();
        score.sections[0].measures.push(
            {
                id: 'm2',
                key: 'F#',
                isMinor: true,
                meter: '6/8',
                grouping: [3, 3],
                content: {
                    kind: 'events',
                    events: [{ kind: 'chord', symbol: 'F#m', duration: [3, 1] }],
                },
            },
            { id: 'm3', content: { kind: 'repeat', measureId: 'm2', display: 'one-bar' } },
        );
        score.sections.push({
            id: 'b',
            label: 'B',
            repeat: 1,
            measures: [
                { id: 'm4', content: { kind: 'repeat', measureId: 'm1', display: 'one-bar' } },
            ],
        });
        expect(validateSemanticScore(score)).toEqual({ kind: 'ok', value: score });
    });

    it('preserves a complete two-measure repeat pair', () => {
        const score = scoreFixture();
        score.sections[0].measures.push(
            {
                id: 'm2',
                content: {
                    kind: 'events',
                    events: [{ kind: 'chord', symbol: 'G7', duration: [4, 1] }],
                },
            },
            { id: 'm3', content: { kind: 'repeat', measureId: 'm1', display: 'two-bar-start' } },
            { id: 'm4', content: { kind: 'repeat', measureId: 'm2', display: 'two-bar-end' } },
        );
        expect(validateSemanticScore(score)).toEqual({ kind: 'ok', value: score });
    });

    it.each([
        ['notation coercion', (s: SemanticScore) => Object.assign(s, { notation: ['name'] })],
        [
            'unknown field',
            (s: SemanticScore) => Object.assign(s.sections[0], { generatedVoicing: [] }),
        ],
        [
            'zero chord duration',
            (s: SemanticScore) => {
                s.sections[0].measures[0].content = {
                    kind: 'events',
                    events: [{ kind: 'chord', symbol: 'C', duration: [0, 1] }],
                };
            },
        ],
        [
            'unreduced duration',
            (s: SemanticScore) => {
                s.sections[0].measures[0].content = {
                    kind: 'events',
                    events: [{ kind: 'chord', symbol: 'C', duration: [8, 2] }],
                };
            },
        ],
        [
            'underfull bar',
            (s: SemanticScore) => {
                s.meter = '5/4';
            },
        ],
        [
            'unsupported suffix',
            (s: SemanticScore) => {
                s.sections[0].measures[0].content = {
                    kind: 'events',
                    events: [{ kind: 'chord', symbol: 'Cnotachord', duration: [4, 1] }],
                };
            },
        ],
        [
            'invalid grouping',
            (s: SemanticScore) => {
                s.grouping = [3, 3];
            },
        ],
        [
            'missing repeat source',
            (s: SemanticScore) => {
                s.sections[0].measures[0].content = {
                    kind: 'repeat',
                    measureId: 'missing',
                    display: 'one-bar',
                };
            },
        ],
        [
            'self-repeating bar',
            (s: SemanticScore) => {
                s.sections[0].measures[0].content = {
                    kind: 'repeat',
                    measureId: 'm1',
                    display: 'one-bar',
                };
            },
        ],
        [
            'duplicate measure',
            (s: SemanticScore) => {
                s.sections[0].measures.push(structuredClone(s.sections[0].measures[0]));
            },
        ],
        [
            'wrong repeat boundary',
            (s: SemanticScore) => {
                s.sections[0].measures[0].end = [{ kind: 'repeat-start' }];
            },
        ],
        [
            'duplicate ending passes',
            (s: SemanticScore) => {
                s.sections[0].measures[0].start = [{ kind: 'ending-start', passes: [1, 1] }];
            },
        ],
        [
            'unresolved jump',
            (s: SemanticScore) => {
                s.sections[0].measures[0].end = [
                    {
                        kind: 'jump',
                        from: 'start',
                        repeats: 'play',
                        destination: { kind: 'fine', label: 'missing' },
                    },
                ];
            },
        ],
        [
            'prototype identity',
            (s: SemanticScore) => {
                s.sections[0].id = 'constructor';
            },
        ],
        [
            'outside annotation',
            (s: SemanticScore) => {
                s.sections[0].measures[0].annotations = [
                    { text: 'Break', at: [5, 1], placement: 'below' },
                ];
            },
        ],
        [
            'markup annotation',
            (s: SemanticScore) => {
                s.sections[0].label = '<img src=x>';
            },
        ],
    ] as const)('rejects %s without modifying the candidate', (_label, change) => {
        const score = scoreFixture();
        change(score);
        const before = structuredClone(score);
        expect(validateSemanticScore(score).kind).toBe('invalid');
        expect(score).toEqual(before);
    });

    it('rejects cycles, getters and over-budget input before schema traversal', () => {
        const getter = vi.fn(() => scoreFixture());
        const candidate = documentFixture();
        Object.defineProperty(candidate.chart, 'score', { enumerable: true, get: getter });
        expect(validateChartDocumentV2(candidate).kind).toBe('invalid');
        expect(getter).not.toHaveBeenCalled();
        const cycle: Record<string, unknown> = {};
        cycle.self = cycle;
        expect(validateChartDocumentV2(cycle).kind).toBe('invalid');
        expect(decodeChartDocumentV2(' '.repeat(1024 * 1024 + 1)).kind).toBe('invalid');
        expect(decodeChartDocumentV2('{').kind).toBe('invalid');
    });

    it.each([
        (d: ChartDocumentV2) => {
            d.chart.performance.bpm = 0;
        },
        (d: ChartDocumentV2) => {
            d.chart.band.chords.voice = 'pack:../unsafe';
        },
        (d: ChartDocumentV2) => {
            d.title = '<script>';
        },
        (d: ChartDocumentV2) => {
            d.metadata = { composer: '<img>' };
        },
        (d: ChartDocumentV2) => {
            Object.assign(d.chart, { arrangement: {} });
        },
    ])('keeps unchanged envelope and band validation strict (%#)', (change) => {
        const candidate = documentFixture();
        change(candidate);
        expect(validateChartDocumentV2(candidate).kind).toBe('invalid');
    });

    it('does not teach v1 readers to accept v2 or convert v1 implicitly', () => {
        const current = JSON.stringify(documentFixture());
        expect(decodeChartDocument(current)).toEqual({
            kind: 'future-version',
            schemaVersion: 2,
            source: current,
        });
        const legacy = JSON.stringify(legacyFixture());
        expect(decodeChartDocument(legacy).kind).toBe('ok');
        expect(decodeChartDocumentV2(legacy).kind).toBe('invalid');
        const future = ' { "schemaVersion": 3, "newMeaning": "retain me" } ';
        expect(decodeChartDocumentV2(future)).toEqual({
            kind: 'future-version',
            schemaVersion: 3,
            source: future,
        });
    });
});

describe('pure legacy conversion proposals', () => {
    it('preserves legacy empty-string section inheritance as absent overrides', () => {
        const legacy = legacyFixture();
        legacy.chart.arrangement.sections[0].key = '';
        legacy.chart.arrangement.sections[0].timeSignature = '';
        const converted = proposeLegacyScoreConversion(JSON.stringify(legacy));
        expect(converted.kind).toBe('candidate');
        if (converted.kind !== 'candidate') {
            throw new Error('Expected candidate');
        }
        expect(converted.value.chart.score.sections[0]).not.toHaveProperty('key');
        expect(converted.value.chart.score.sections[0]).not.toHaveProperty('meter');
        expect(converted.source).toBe(JSON.stringify(legacy));
    });
    it('preserves original bytes, settings, identity and exact timing in a deterministic candidate', () => {
        const legacy = legacyFixture();
        const source = JSON.stringify(legacy, null, 2);
        const converted = proposeLegacyScoreConversion(source);
        expect(converted.kind).toBe('candidate');
        if (converted.kind !== 'candidate') {
            throw new Error(JSON.stringify(converted.issues));
        }
        expect(converted.source).toBe(source);
        expect(converted.value.id).toBe(legacy.id);
        expect(converted.value.revision).toBe(legacy.revision);
        expect(converted.value.chart.band).toEqual(legacy.chart.band);
        expect(converted.value.chart.performance).toEqual(legacy.chart.performance);
        expect(converted.value.chart.score.sections[0]).toMatchObject({
            id: 'a',
            label: 'A',
            repeat: 2,
            key: 'D',
            isMinor: true,
            seamless: true,
            targetIntensity: 0.5,
            instruments: { soloist: false },
            measures: [
                {
                    id: 'measure-1',
                    content: {
                        kind: 'events',
                        events: [
                            { kind: 'chord', symbol: 'C', duration: [2, 1] },
                            { kind: 'chord', symbol: 'G7', duration: [2, 1] },
                        ],
                    },
                },
                { id: 'measure-2' },
            ],
        });
        expect(converted.notes).toContainEqual(
            expect.objectContaining({ code: 'preset-detached' }),
        );
        expect(proposeLegacyScoreConversion(source)).toEqual(converted);
        expect(decodeChartDocument(source)).toEqual({ kind: 'ok', value: legacy });
    });

    it('converts compound-meter counts to quarters without doubling the bar', () => {
        const legacy = legacyFixture('Am Dm');
        legacy.chart.arrangement.sections[0].timeSignature = '6/8';
        const converted = proposeLegacyScoreConversion(JSON.stringify(legacy));
        expect(converted.kind).toBe('candidate');
        if (converted.kind !== 'candidate') {
            throw new Error('Expected candidate');
        }
        expect(converted.value.chart.score.sections[0]).toMatchObject({
            meter: '6/8',
            measures: [
                {
                    content: { events: [{ duration: [3, 2] }, { duration: [3, 2] }] },
                },
            ],
        });
    });

    it.each([
        ['C Dm G7', 'off-grid'],
        ['C7b9#11', 'legacy-syntax'],
        ['C-6', 'legacy-syntax'],
        ['Cnope', 'legacy-syntax'],
        ['C:2 G7:2', 'legacy-syntax'],
        ['C | | G7', 'legacy-syntax'],
        ['C♯m', 'legacy-syntax'],
    ])('keeps all original data and offers no partial conversion for %s', (bar, code) => {
        const source = JSON.stringify(legacyFixture(bar));
        const result = proposeLegacyScoreConversion(source);
        expect(result).toMatchObject({
            kind: 'blocked',
            source,
            issues: [expect.objectContaining({ code })],
        });
        expect(result).not.toHaveProperty('value');
    });

    it.each(['{', '{"schemaVersion":99}', '{}'])('preserves invalid/future input %s', (source) => {
        expect(proposeLegacyScoreConversion(source)).toMatchObject({ kind: 'blocked', source });
    });
});
