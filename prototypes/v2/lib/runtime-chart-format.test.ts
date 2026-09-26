/**
 * @vitest-environment happy-dom
 */
/**
 * The chart format (DECISION 2026-09-26, #1404): a chart holds the music plus the settings the
 * band honours. An old chart still opens — its legacy fields are read by nothing — and the
 * next capture writes none of them, so it sheds them on its next save. Genre is stored once, by
 * name; energy rides the chart.
 */
import { validateChartDocument, writtenSettings } from '@engine/songbook/codec';
import type { ChartDocument } from '@engine/songbook/types';
import { describe, expect, it } from 'vitest';
import { captureContent, captureDocument, load, state } from './runtime';

/** A chart saved before 2026-09-26: every field the old engine wrote, genre stored twice. */
function oldChart(): ChartDocument {
    return {
        schemaVersion: 1,
        id: 'old-chart',
        title: 'Old chart',
        createdAt: '2026-09-01T12:00:00.000Z',
        updatedAt: '2026-09-01T12:00:00.000Z',
        revision: 4,
        chart: {
            arrangement: {
                sections: [{ id: 'a', label: 'A', value: 'Dm7 | G7 | Cmaj7 | Cmaj7' }],
                key: 'C',
                timeSignature: '4/4',
                grouping: null,
                isMinor: false,
                notation: 'name',
                lastChordPreset: 'Songbook',
            },
            performance: { bpm: 132, complexity: 0.8, seed: 'A1B2C3', randomizeSeed: false },
            band: {
                chords: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: false,
                    volume: 0.7,
                    reverb: 0.25,
                    style: 'funk',
                    instrument: 'Warm',
                    octave: 55,
                    density: 'rich',
                },
                bass: {
                    enabled: false,
                    voice: 'synth',
                    autoSound: false,
                    volume: 0.6,
                    reverb: 0.1,
                    style: 'hiphop',
                    octave: 30,
                },
                soloist: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: false,
                    volume: 0.8,
                    reverb: 0.5,
                    style: 'bird',
                    preset: 'trumpet',
                    octave: 80,
                    mode: 'guitar',
                    autoMode: false,
                    phrasingIntensity: 0.9,
                    tradeMode: 'sections',
                },
                harmony: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: false,
                    volume: 0.4,
                    reverb: 0.4,
                    style: 'horns',
                    octave: 62,
                    complexity: 0.9,
                },
                groove: {
                    enabled: true,
                    voice: 'synth',
                    autoSound: false,
                    volume: 0.9,
                    reverb: 0.15,
                    measures: 2,
                    swing: 40,
                    swingSub: '16th',
                    humanize: 12,
                    lastDrumPreset: 'Funk',
                    genreFeel: 'Bossa Nova',
                    lastSmartGenre: 'Bossa',
                    pattern: [{ name: 'Kick', steps: [1, 0, 0, 0] }],
                },
            },
        },
    };
}

const LEGACY = {
    performance: ['complexity'],
    chords: ['style', 'instrument', 'octave', 'density'],
    bass: ['style', 'octave'],
    soloist: ['style', 'preset', 'octave', 'phrasingIntensity', 'tradeMode'],
    groove: ['measures', 'lastDrumPreset', 'genreFeel', 'lastSmartGenre', 'pattern'],
} as const;

describe('opening an old chart and capturing it again', () => {
    it('opens a chart carrying every dropped field, and the next capture writes none of them', () => {
        const stored = oldChart();
        expect(validateChartDocument(stored).kind).toBe('ok');
        load(stored);
        const content = captureContent();
        expect(content.performance).not.toHaveProperty('complexity');
        expect(content.band).not.toHaveProperty('harmony');
        for (const lane of ['chords', 'bass', 'soloist', 'groove'] as const) {
            for (const field of LEGACY[lane]) {
                expect(content.band[lane], `${lane}.${field}`).not.toHaveProperty(field);
            }
        }
        // The capture is a valid chart in its own right, and the stored copy is untouched.
        expect(validateChartDocument(captureDocument(stored)).kind).toBe('ok');
        expect(stored).toEqual(oldChart());
    });

    it('keeps every field the band honours, exactly', () => {
        load(oldChart());
        const { arrangement, performance, band } = captureContent();
        expect(arrangement).toEqual(oldChart().chart.arrangement);
        expect(performance).toEqual({
            bpm: 132,
            seed: 'A1B2C3',
            randomizeSeed: false,
            // An old chart carried no energy: the band shapes it.
            energy: 'auto',
        });
        expect(band).toEqual({
            chords: { enabled: true, voice: 'synth', autoSound: false, volume: 0.7, reverb: 0.25 },
            bass: { enabled: false, voice: 'synth', autoSound: false, volume: 0.6, reverb: 0.1 },
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
                // Stored twice before (`Bossa`/`Bossa Nova`), once now, by name.
                genre: 'Bossa',
            },
        });
    });

    it('round-trips a chart as it is written today without losing anything', () => {
        load(oldChart());
        const written = captureDocument(oldChart());
        load(written);
        expect(captureDocument(written)).toEqual(written);
    });

    it('reads as the same chart once written today, so an old chart undone by hand is not an edit', () => {
        // The stand's dirty check compares charts as written today (`written` in ensemble.tsx):
        // the stored copy keeps its legacy fields until the next Save, a capture never has them.
        const asWritten = (chart: ChartDocument['chart']) =>
            JSON.stringify({ ...chart, ...writtenSettings(chart) });
        const stored = oldChart();
        load(stored);
        expect(asWritten(captureDocument(stored).chart)).toBe(asWritten(stored.chart));
        expect(JSON.stringify(captureDocument(stored).chart)).not.toBe(
            JSON.stringify(stored.chart),
        );

        // A chart saved while trading, before the head-return setting existed: an absent
        // count reads as the default, on both sides.
        const trading = oldChart();
        Object.assign(trading.chart.band.soloist, { tradeWith: 'drums', tradeBars: 4 });
        load(trading);
        expect(asWritten(captureDocument(trading).chart)).toBe(asWritten(trading.chart));
    });

    it('derives the lane styles from the genre, not from the chart or the one open before', () => {
        load(oldChart());
        // The old chart's own styles (funk/hiphop/bird/horns) are legacy; Bossa routes its own.
        const { chords, bass, soloist, groove } = state();
        expect(groove.lastSmartGenre).toBe('Bossa');
        expect(groove.genreFeel).toBe('Bossa Nova');
        expect(chords.style).toBe('jazz');
        expect(bass.style).toBe('bossa');
        expect(soloist.style).toBe('bossa');
    });
});

describe('genre, stored once', () => {
    const withGroove = (groove: Record<string, unknown>) => {
        const document = oldChart();
        const { genreFeel: _feel, lastSmartGenre: _name, ...rest } = document.chart.band.groove;
        document.chart.band.groove = { ...rest, ...groove } as typeof rest;
        return document;
    };

    it.each([
        ['the name', { lastSmartGenre: 'Ska-Punk' }, 'Ska-Punk'],
        ['the feel', { genreFeel: 'Ska' }, 'Ska-Punk'],
        ['both, agreeing', { lastSmartGenre: 'Jazz', genreFeel: 'Jazz' }, 'Jazz'],
        [
            '`genre` over the legacy pair',
            { genre: 'Funk', lastSmartGenre: 'Jazz', genreFeel: 'Jazz' },
            'Funk',
        ],
    ])('reads it from %s', (_, groove, expected) => {
        const document = withGroove(groove);
        expect(validateChartDocument(document).kind).toBe('ok');
        load(document);
        expect(state().groove.lastSmartGenre).toBe(expected);
        expect(captureContent().band.groove.genre).toBe(expected);
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
