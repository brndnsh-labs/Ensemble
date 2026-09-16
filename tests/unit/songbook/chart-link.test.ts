import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import fixtures from '../../../docs/design/fixtures/ensemble-v2-charts.json';
import { decodeChartLink, encodeChartLink } from '../../../public/songbook/chart-link.js';
import { parseIRealImport } from '../../../public/songbook/ireal-import.js';
import type { ChartDocumentV2, SemanticScore } from '../../../public/songbook/score-types.js';
import type { ChartDocument, ChartLaneMix } from '../../../public/songbook/types.js';

function mix(overrides: Partial<ChartLaneMix> = {}): ChartLaneMix {
    return {
        enabled: true,
        voice: 'synth',
        autoSound: false,
        volume: 0.8,
        reverb: 0.2,
        ...overrides,
    };
}

function bandFixture(): ChartDocument['chart']['band'] {
    return {
        chords: { ...mix(), style: 'smart', octave: 48, instrument: 'Piano', density: 'rich' },
        bass: { ...mix(), style: 'smart', octave: 36 },
        harmony: { ...mix(), style: 'smart', octave: 60, complexity: 0.5 },
        soloist: {
            ...mix(),
            style: 'smart',
            octave: 72,
            preset: 'trumpet',
            mode: 'monophonic',
            autoMode: false,
            phrasingIntensity: 0.5,
            tradeMode: 'manual',
        },
        groove: {
            ...mix(),
            measures: 1,
            swing: 50,
            swingSub: '8th',
            humanize: 0,
            lastDrumPreset: 'Basic Rock',
            genreFeel: 'Jazz',
            lastSmartGenre: 'Jazz',
            pattern: [],
        },
    };
}

function legacyFixture(value = 'C G7 | Dm7 G7'): ChartDocument {
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
            band: bandFixture(),
        },
    };
}

function documentFixtureV2(score: SemanticScore): ChartDocumentV2 {
    const legacy = legacyFixture();
    return {
        ...legacy,
        schemaVersion: 2,
        metadata: { composer: 'Test author', style: 'Swing' },
        chart: { score, performance: legacy.chart.performance, band: legacy.chart.band },
    };
}

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

/** An AABA-form 32-bar chart with four distinct sections, for the size-budget test. */
function thirtyTwoBarScoreFixture(): SemanticScore {
    const aChords = ['Dm7', 'G7', 'Cmaj7', 'A7', 'Dm7', 'G7', 'Cmaj7', 'Cmaj7'];
    const bChords = ['Em7', 'A7', 'Dm7', 'G7', 'Em7', 'A7', 'Dm7', 'G7'];
    const measuresFor = (id: string, chords: string[]) =>
        chords.map((symbol, i) => ({
            id: `${id}-m${i}`,
            content: {
                kind: 'events' as const,
                events: [{ kind: 'chord' as const, symbol, duration: [4, 1] as [number, number] }],
            },
        }));
    return {
        key: 'C',
        isMinor: false,
        notation: 'name',
        meter: '4/4',
        grouping: null,
        sections: [
            { id: 'a1', label: 'A', repeat: 1, measures: measuresFor('a1', aChords) },
            { id: 'a2', label: 'A', repeat: 1, measures: measuresFor('a2', aChords) },
            { id: 'b', label: 'B', repeat: 1, measures: measuresFor('b', bChords) },
            { id: 'a3', label: 'A', repeat: 1, measures: measuresFor('a3', aChords) },
        ],
    };
}

describe('v2 shareable chart links', () => {
    it('round-trips a v1 legacy document', async () => {
        const document = legacyFixture();
        const link = await encodeChartLink(document);
        expect(link.startsWith('#chart=')).toBe(true);
        await expect(decodeChartLink(link)).resolves.toEqual(document);
    });

    it('round-trips a v2 semantic document', async () => {
        const document = documentFixtureV2(scoreFixture());
        const link = await encodeChartLink(document);
        await expect(decodeChartLink(link)).resolves.toEqual(document);
    });

    it('accepts the fragment with or without a leading #', async () => {
        const document = legacyFixture();
        const link = await encodeChartLink(document);
        await expect(decodeChartLink(link.slice(1))).resolves.toEqual(document);
    });

    it('round-trips the sanitized modern-export fixture from the chart corpus', async () => {
        const fixture = fixtures.realExport;
        const parsed = parseIRealImport(fixture.sanitizedUrl);
        const score = parsed.songs[0]?.score;
        expect(score).toBeDefined();
        const document = documentFixtureV2(score!);
        const link = await encodeChartLink(document);
        await expect(decodeChartLink(link)).resolves.toEqual(document);
    });

    it('round-trips the documented open-protocol fixture from the chart corpus', async () => {
        const fixture = fixtures.syntheticOpenProtocol;
        const parsed = parseIRealImport(fixture.url);
        const score = parsed.songs[0]?.score;
        expect(score).toBeDefined();
        const document = documentFixtureV2(score!);
        const link = await encodeChartLink(document);
        await expect(decodeChartLink(link)).resolves.toEqual(document);
    });

    it('keeps a 32-bar chart with sections under the 2KB URL budget', async () => {
        const document = documentFixtureV2(thirtyTwoBarScoreFixture());
        const link = await encodeChartLink(document);
        const byteLength = new TextEncoder().encode(link).length;
        expect(byteLength).toBeLessThan(2048);
    });

    it('carries no account, session or retry data — only the document envelope', async () => {
        const document = documentFixtureV2(scoreFixture());
        const link = await encodeChartLink(document);
        const payload = new URLSearchParams(link.slice(1)).get('chart')!;
        // Independent re-derivation of the wire format, bypassing this module's own
        // decoder, so the assertion checks the actual bytes on the wire (base64url
        // of zlib-wrapped deflate) rather than trusting encode/decode to agree with
        // each other about a format neither of them literally validates against.
        const compressed = Buffer.from(payload, 'base64url');
        const json = inflateSync(compressed).toString('utf8');
        const candidate = JSON.parse(json);
        expect(Object.keys(candidate).sort()).toEqual(
            [
                'chart',
                'createdAt',
                'id',
                'metadata',
                'revision',
                'schemaVersion',
                'title',
                'updatedAt',
            ].sort(),
        );
        for (const forbidden of [
            'accountId',
            'sessionId',
            'session',
            'retry',
            'retryCount',
            'token',
        ]) {
            expect(candidate).not.toHaveProperty(forbidden);
        }
    });

    it('fails closed on malformed, oversized or foreign fragments', async () => {
        await expect(decodeChartLink('')).resolves.toBeUndefined();
        await expect(decodeChartLink('#foo=bar')).resolves.toBeUndefined();
        await expect(decodeChartLink('#chart=')).resolves.toBeUndefined();
        await expect(decodeChartLink('#chart=not-valid-base64!!')).resolves.toBeUndefined();
        // Well-formed base64url of arbitrary (non-deflate) bytes.
        await expect(
            decodeChartLink(`#chart=${Buffer.from('hello world').toString('base64url')}`),
        ).resolves.toBeUndefined();
        await expect(decodeChartLink(`#chart=${'A'.repeat(200_001)}`)).resolves.toBeUndefined();
    });

    it('rejects a payload with an envelope field outside the fixed document schema', async () => {
        const document = legacyFixture();
        const withAccountField = {
            ...document,
            accountId: 'evil-actor',
        } as unknown as ChartDocument;
        const link = await encodeChartLink(withAccountField);
        await expect(decodeChartLink(link)).resolves.toBeUndefined();
    });

    it('rejects a v1-shaped document with an out-of-range field', async () => {
        const document = legacyFixture();
        const tampered = {
            ...document,
            chart: { ...document.chart, performance: { ...document.chart.performance, bpm: -5 } },
        };
        const link = await encodeChartLink(tampered);
        await expect(decodeChartLink(link)).resolves.toBeUndefined();
    });

    it('stops inflating a decompression bomb at the document byte ceiling', async () => {
        // ~3 MB of spaces deflates to a few KB: well inside MAX_ENCODED_LENGTH, far past the
        // 1 MiB document limit once inflated. Must resolve undefined without materialising it.
        const { deflateSync } = await import('node:zlib');
        const bomb = deflateSync(Buffer.alloc(3 * 1024 * 1024, 0x20));
        const payload = bomb.toString('base64url');
        expect(payload.length).toBeLessThan(200_000);
        await expect(decodeChartLink(`#chart=${payload}`)).resolves.toBeUndefined();
    });
});
