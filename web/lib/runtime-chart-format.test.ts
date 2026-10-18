/**
 * @vitest-environment happy-dom
 */
/**
 * The chart format (DECISION 2026-09-26, #1404): a chart holds the music plus the settings the
 * band honours. The old engine's band and performance fields are refused outright (#1741).
 * Genre is stored once, by name; energy rides the chart.
 */
import { writtenChart } from '@core/songbook/codec';
import { validateChartDocumentV2 as validateChartDocument } from '@core/songbook/document-v2';
import type { ChartDocumentV2 as ChartDocument } from '@core/songbook/score-types';
import type { ChartSettings } from '@core/songbook/types';
import { describe, expect, it } from 'vitest';
import { captureContent, captureDocument, load, state } from './runtime';

/** A chart as the app writes it, with every setting off its default. */
function oldChart(): ChartDocument {
    return {
        schemaVersion: 2,
        id: 'old-chart',
        title: 'Old chart',
        createdAt: '2026-09-01T12:00:00.000Z',
        updatedAt: '2026-09-01T12:00:00.000Z',
        revision: 4,
        chart: {
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
                        measures: ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'].map((symbol, index) => ({
                            id: `a-${index}`,
                            content: {
                                kind: 'events',
                                events: [{ kind: 'chord', symbol, duration: [4, 1] }],
                            },
                        })),
                    },
                ],
            },
            performance: { bpm: 132, seed: 'A1B2C3', randomizeSeed: false },
            band: {
                chords: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: false,
                    volume: 0.7,
                    reverb: 0.25,
                },
                bass: {
                    enabled: false,
                    voice: 'synth',
                    autoSound: false,
                    volume: 0.6,
                    reverb: 0.1,
                },
                soloist: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: false,
                    volume: 0.8,
                    reverb: 0.5,
                    mode: 'guitar',
                    autoMode: false,
                },
                groove: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: false,
                    volume: 0.9,
                    reverb: 0.15,
                    swing: 40,
                    swingSub: '16th',
                    humanize: 12,
                    genre: 'Bossa',
                },
            },
        },
    };
}

describe('opening a chart and capturing it again', () => {
    it('keeps every field the band honours, exactly', () => {
        load(oldChart());
        const { performance, band } = captureContent();
        expect(captureDocument(oldChart()).chart.score).toEqual(oldChart().chart.score);
        expect(performance).toEqual({
            bpm: 132,
            seed: 'A1B2C3',
            randomizeSeed: false,
            // A chart stored with no energy: the band shapes it.
            energy: 'auto',
        });
        expect(band).toEqual(oldChart().chart.band);
    });

    it('round-trips a chart as it is written today without losing anything', () => {
        load(oldChart());
        const written = captureDocument(oldChart());
        load(written);
        expect(captureDocument(written)).toEqual(written);
    });

    it('reads as the same chart once written today, so a chart undone by hand is not an edit', () => {
        // The stand's dirty check compares charts as written today (`same` in ensemble.tsx).
        const asWritten = (document: { chart: ChartSettings }) =>
            JSON.stringify(writtenChart(document.chart));
        const stored = oldChart();
        load(stored);
        expect(asWritten(captureDocument(stored))).toBe(asWritten(stored));
        // The capture stores the energy the chart left out.
        expect(JSON.stringify(captureDocument(stored).chart)).not.toBe(
            JSON.stringify(stored.chart),
        );

        // A chart saved while trading, before the head-return setting existed: an absent
        // count reads as the default, on both sides.
        const trading = oldChart();
        Object.assign(trading.chart.band.soloist, { tradeWith: 'drums', tradeBars: 4 });
        load(trading);
        expect(asWritten(captureDocument(trading))).toBe(asWritten(trading));
    });

    it('derives the lane styles from the genre, not from the chart open before', () => {
        const funk = oldChart();
        funk.chart.band.groove.genre = 'Funk';
        load(funk);
        load(oldChart());
        const { chords, bass, groove } = state();
        expect(groove.lastSmartGenre).toBe('Bossa');
        expect(groove.genreFeel).toBe('Bossa Nova');
        expect(chords.style).toBe('jazz');
        expect(bass.style).toBe('bossa');
    });
});

/** A sample of the old engine's band and performance fields, one per place they sat (#1741). */
const RETIRED: ReadonlyArray<[path: string, extra: (document: ChartDocument) => object]> = [
    ['$.chart.performance.complexity', () => ({ complexity: 0.8 })],
    ['$.chart.band.harmony', (document) => ({ harmony: document.chart.band.chords })],
    ['$.chart.band.chords.style', () => ({ style: 'funk' })],
    ['$.chart.band.soloist.tradeMode', () => ({ tradeMode: 'sections' })],
    ['$.chart.band.groove.genreFeel', () => ({ genreFeel: 'Bossa Nova' })],
    ['$.chart.band.groove.lastSmartGenre', () => ({ lastSmartGenre: 'Bossa' })],
];

/** The object a retired field's path names, inside `document`. */
function holder(document: ChartDocument, path: string): object {
    const keys = path.split('.').slice(1, -1);
    return keys.reduce<Record<string, unknown>>(
        (node, key) => node[key] as Record<string, unknown>,
        document as unknown as Record<string, unknown>,
    );
}

describe("the old engine's fields", () => {
    it.each(RETIRED)(
        'refuses a chart carrying %s, and the stand will not open it',
        (path, extra) => {
            const document = oldChart();
            Object.assign(holder(document, path), extra(document));
            const verdict = validateChartDocument(document);
            expect(verdict.kind === 'invalid' && verdict.issues).toContainEqual(
                expect.objectContaining({ path, code: 'unknown-field' }),
            );
            expect(() => load(document)).toThrow();
        },
    );

    it('refuses a groove with no genre', () => {
        const document = oldChart();
        const { genre: _genre, ...groove } = document.chart.band.groove;
        document.chart.band.groove = groove as typeof document.chart.band.groove;
        const verdict = validateChartDocument(document);
        expect(verdict.kind === 'invalid' && verdict.issues).toContainEqual(
            expect.objectContaining({ path: '$.chart.band.groove.genre', code: 'missing-field' }),
        );
    });
});

describe('energy, saved with the chart', () => {
    const withEnergy = (energy: unknown) => {
        const document = oldChart();
        document.chart.performance = { bpm: 120, seed: '', randomizeSeed: true, energy } as never;
        return document;
    };

    it('opens a fixed level and captures it back', () => {
        load(withEnergy(0.8));
        expect(state().playback.autoIntensity).toBe(false);
        expect(state().playback.bandIntensity).toBe(0.8);
        expect(captureContent().performance.energy).toBe(0.8);
    });

    it('opens auto, and does not carry the previous chart’s level into it', () => {
        load(withEnergy(0.9));
        load(withEnergy('auto'));
        expect(state().playback.autoIntensity).toBe(true);
        expect(state().playback.bandIntensity).toBe(0.35);
        expect(captureContent().performance.energy).toBe('auto');
    });

    it('reads a chart with no energy as auto', () => {
        load(withEnergy(0.2));
        const document = withEnergy(0.2);
        delete document.chart.performance.energy;
        load(document);
        expect(captureContent().performance.energy).toBe('auto');
    });
});
