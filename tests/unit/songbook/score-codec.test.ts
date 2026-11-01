import { describe, expect, it, vi } from 'vitest';
import {
    decodeChartDocumentV2,
    encodeChartDocumentV2,
    validateChartDocumentV2,
} from '../../../core/songbook/document-v2.js';
import { validateSemanticScore } from '../../../core/songbook/score-codec.js';
import { resolveScoreContext } from '../../../core/songbook/score-context.js';
import type { ChartDocumentV2, SemanticScore } from '../../../core/songbook/score-types.js';
import type { ChartBand, ChartLaneMix } from '../../../core/songbook/types.js';

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

function bandFixture(): ChartBand {
    const mix: ChartLaneMix = {
        enabled: true,
        voice: 'synth',
        autoSound: false,
        volume: 0.8,
        reverb: 0.2,
    };
    return {
        chords: { ...mix },
        bass: { ...mix },
        soloist: { ...mix, mode: 'monophonic', autoMode: false },
        groove: { ...mix, swing: 50, swingSub: '8th', humanize: 0, genre: 'Jazz' },
    };
}

function documentFixture(): ChartDocumentV2 {
    return {
        schemaVersion: 2,
        id: 'study',
        title: 'Study',
        revision: 3,
        createdAt: '2026-09-08T12:00:00.000Z',
        updatedAt: '2026-09-08T12:30:00.000Z',
        metadata: { composer: 'Test author', style: 'Swing' },
        chart: {
            score: scoreFixture(),
            performance: { bpm: 120, seed: 'ABC123', randomizeSeed: false },
            band: bandFixture(),
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

    it('refuses a text chart (schema 1) and keeps a future version verbatim', () => {
        const textChart = JSON.stringify({
            ...documentFixture(),
            schemaVersion: 1,
            chart: {
                arrangement: { sections: [{ id: 'a', label: 'A', value: 'C G7 | Dm7 G7' }] },
                performance: documentFixture().chart.performance,
                band: documentFixture().chart.band,
            },
        });
        expect(decodeChartDocumentV2(textChart).kind).toBe('invalid');
        const future = ' { "schemaVersion": 3, "newMeaning": "retain me" } ';
        expect(decodeChartDocumentV2(future)).toEqual({
            kind: 'future-version',
            schemaVersion: 3,
            source: future,
        });
    });
});

describe('chorus count and last-chorus codas (#1472)', () => {
    /** One bar with "To Coda, last chorus" on its end barline, and a coda bar after it. */
    function codaScore(): SemanticScore {
        const score = scoreFixture();
        score.sections[0].measures[0].end = [
            { kind: 'coda', label: 'to-coda' },
            {
                kind: 'last-chorus',
                destination: { kind: 'coda', via: 'to-coda', target: 'coda' },
            },
        ];
        score.sections[0].measures.push({
            id: 'm2',
            start: [{ kind: 'coda', label: 'coda' }],
            content: {
                kind: 'events',
                events: [{ kind: 'chord', symbol: 'F6', duration: [4, 1] }],
            },
        });
        return { ...score, choruses: 3 };
    }

    function lastChorusAt(score: SemanticScore): Record<string, unknown> {
        return score.sections[0].measures[0].end![1] as unknown as Record<string, unknown>;
    }

    function issue(candidate: unknown) {
        const checked = validateSemanticScore(candidate);
        return checked.kind === 'invalid' ? checked.issues[0] : checked;
    }

    it('round-trips a chorus count and a last-chorus coda through the document codec', () => {
        const source = documentFixture();
        source.chart.score = codaScore();
        const encoded = encodeChartDocumentV2(source);
        expect(encoded.kind).toBe('ok');
        if (encoded.kind !== 'ok') {
            throw new Error('Fixture must encode');
        }
        expect(decodeChartDocumentV2(encoded.json)).toEqual({ kind: 'ok', value: source });
        expect(validateSemanticScore(codaScore())).toEqual({ kind: 'ok', value: codaScore() });
    });

    it('accepts a last-chorus coda on a start barline too, and a chart with no count', () => {
        const score = codaScore();
        const { choruses: _, ...uncounted } = score;
        expect(validateSemanticScore(uncounted).kind).toBe('ok');
        score.sections[0].measures[0].start = score.sections[0].measures[0].end;
        delete score.sections[0].measures[0].end;
        expect(validateSemanticScore(score).kind).toBe('ok');
    });

    it('round-trips a last-chorus coda with no departure sign, a tag (#1487)', () => {
        const source = documentFixture();
        const score = codaScore();
        delete score.sections[0].measures[0].end;
        score.sections[0].measures[1].start = [
            { kind: 'coda', label: 'coda' },
            { kind: 'last-chorus', destination: { kind: 'coda', target: 'coda' } },
        ];
        source.chart.score = score;
        const encoded = encodeChartDocumentV2(source);
        if (encoded.kind !== 'ok') {
            throw new Error('Fixture must encode');
        }
        expect(decodeChartDocumentV2(encoded.json)).toEqual({ kind: 'ok', value: source });
    });

    it('still requires a departure sign of a D.C./D.S. al Coda', () => {
        const score = codaScore();
        score.sections[0].measures[1].end = [
            {
                kind: 'jump',
                from: 'start',
                destination: { kind: 'coda', target: 'coda' } as never,
                repeats: 'play',
            },
        ];
        expect(issue(score)).toMatchObject({
            path: '$.sections[0].measures[1].end[0].destination.via',
            message: 'Missing required field.',
        });
    });

    it.each([0, 65, 2.5, -1, '3', null])('rejects %p choruses', (choruses) => {
        expect(issue({ ...codaScore(), choruses })).toMatchObject({
            path: '$.choruses',
            message: 'Expected an integer from 1 to 64.',
        });
    });

    it('rejects non-finite choruses at the structural walk', () => {
        expect(issue({ ...codaScore(), choruses: Number.NaN })).toMatchObject({
            path: '$.choruses',
        });
    });

    it('rejects unknown fields on the score, the direction and its destination', () => {
        expect(issue({ ...codaScore(), chorusCount: 3 })).toMatchObject({
            path: '$.chorusCount',
            message: 'Unknown field.',
        });
        const direction = codaScore();
        lastChorusAt(direction).times = 2;
        expect(issue(direction)).toMatchObject({
            path: '$.sections[0].measures[0].end[1].times',
            message: 'Unknown field.',
        });
        const destination = codaScore();
        (lastChorusAt(destination).destination as Record<string, unknown>).pass = 2;
        expect(issue(destination)).toMatchObject({
            path: '$.sections[0].measures[0].end[1].destination.pass',
            message: 'Unknown field.',
        });
    });

    it.each([
        [{ kind: 'end' }, 'A last-chorus direction takes a coda destination.'],
        [{ kind: 'fine', label: 'to-coda' }, 'A last-chorus direction takes a coda destination.'],
        [
            { kind: 'coda', via: 'to-coda', target: 'to-coda' },
            'Coda departure and arrival must differ.',
        ],
        [{ kind: 'coda', via: 'to-coda', target: 'nowhere' }, 'Missing coda destination.'],
        [{ kind: 'coda', via: 'to-coda' }, 'Missing required field.'],
        [{ kind: 'coda', target: 'nowhere' }, 'Missing coda destination.'],
        [{ kind: 'coda', via: null, target: 'coda' }, 'Expected bounded, plain display text.'],
        [null, 'A last-chorus direction takes a coda destination.'],
    ])('rejects a last-chorus destination %j', (destination, message) => {
        const score = codaScore();
        lastChorusAt(score).destination = destination;
        expect(issue(score)).toMatchObject({ message });
    });
});

describe('score key spellings', () => {
    it.each(['F#', 'C#', 'G#', 'Gb', 'Db', 'Ab'])('%s minor is a valid stored key', (key) => {
        const fixture = scoreFixture();
        fixture.key = key;
        fixture.isMinor = true;
        const result = validateSemanticScore(JSON.parse(JSON.stringify(fixture)));
        expect(result.kind).toBe('ok');
        expect(result.kind === 'ok' && result.value.key).toBe(key);
    });
});
