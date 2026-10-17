/**
 * Follow feel (#1405) for a new song: `blankSong` starts every lane on Follow feel, whatever the
 * song it borrowed its setup from pinned, and borrows that setup as a chart is written today.
 */
import { describe, expect, it } from 'vitest';
import { blankSong, type ChartDocument } from './documents';

const lane = (voice: string, autoSound: boolean) => ({
    enabled: true,
    voice,
    autoSound,
    volume: 0.5,
    reverb: 0.2,
});

describe('blankSong', () => {
    const template = {
        id: 'song',
        title: 'Song',
        updatedAt: '2026-10-01T12:00:00.000Z',
        chart: {
            performance: { bpm: 100, seed: '', randomizeSeed: true },
            band: {
                chords: lane('pack:rhodes', false),
                bass: lane('synth', false),
                soloist: {
                    ...lane('synth', true),
                    mode: 'guitar',
                    autoMode: false,
                    tradeWith: 'off',
                    tradeBars: 8,
                },
                groove: {
                    ...lane('synth', false),
                    swing: 60,
                    swingSub: '8th',
                    humanize: 20,
                    genre: 'Jazz',
                },
            },
        },
    } as unknown as ChartDocument;

    it('starts every lane on Follow feel whatever its template pinned', () => {
        const created = blankSong(template);
        expect(Object.values(created.chart.band).map((mix) => mix.autoSound)).toEqual([
            true,
            true,
            true,
            true,
        ]);
        expect(created.chart.band.chords.voice).toBe('pack:rhodes');
    });

    it("borrows the template's setup as a chart is written today", () => {
        const { performance, band } = blankSong(template).chart;
        // Energy is always written; trade settings only while trading.
        expect(performance).toEqual({ bpm: 100, seed: '', randomizeSeed: true, energy: 'auto' });
        expect(Object.keys(band)).toEqual(['chords', 'bass', 'soloist', 'groove']);
        expect(band.chords).toEqual(lane('pack:rhodes', true));
        expect(band.soloist).toEqual({ ...lane('synth', true), mode: 'guitar', autoMode: false });
        expect(band.groove).toEqual({
            ...lane('synth', true),
            swing: 60,
            swingSub: '8th',
            humanize: 20,
            genre: 'Jazz',
        });
    });
});
