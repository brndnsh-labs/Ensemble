/**
 * The #1405 upgrade: a song written before Follow feel became the default opens with its
 * built-in-pinned lanes on Follow feel. A lane pinned to a named sound was a choice and keeps it,
 * and anything written from the cutoff on is left exactly as stored.
 */
import { describe, expect, it } from 'vitest';
import { blankSong, type ChartDocument, FOLLOW_FEEL_SINCE, withFollowFeel } from './documents';

const lane = (voice: string, autoSound: boolean) => ({
    enabled: true,
    voice,
    autoSound,
    volume: 0.5,
    reverb: 0.2,
});
const song = (updatedAt: string, band: Record<string, ReturnType<typeof lane>>) =>
    ({ id: 'song', title: 'Song', updatedAt, chart: { band } }) as unknown as ChartDocument;
const before = '2026-09-20T12:00:00.000Z';
const lanes = (document: ChartDocument) =>
    Object.fromEntries(
        Object.entries(document.chart.band).map(([name, mix]) => [
            name,
            [mix.voice, mix.autoSound],
        ]),
    );

describe('withFollowFeel', () => {
    it('moves an old built-in pin to Follow feel and keeps a named sound pinned', () => {
        const stored = song(before, {
            chords: lane('synth', false),
            bass: lane('pack:upright-bass', false),
            groove: lane('pack:acoustic-kit', true),
        });
        const opened = withFollowFeel(stored);
        expect(lanes(opened)).toEqual({
            chords: ['synth', true],
            bass: ['pack:upright-bass', false],
            groove: ['pack:acoustic-kit', true],
        });
        // The stored copy is never touched: the upgrade reaches storage only through a Save.
        expect(stored.chart.band.chords.autoSound).toBe(false);
    });

    it('leaves a song written at or after the cutoff exactly as stored', () => {
        for (const updatedAt of [FOLLOW_FEEL_SINCE, '2026-10-01T00:00:00.000Z']) {
            const stored = song(updatedAt, { chords: lane('synth', false) });
            expect(withFollowFeel(stored)).toBe(stored);
        }
    });

    it('keys a draft on when it was captured, not on the song it was a draft of', () => {
        const draft = song(before, { chords: lane('synth', false) });
        expect(withFollowFeel(draft, FOLLOW_FEEL_SINCE)).toBe(draft);
        expect(withFollowFeel(draft, before).chart.band.chords.autoSound).toBe(true);
    });

    it('returns the same document when an old song has nothing to upgrade', () => {
        const stored = song(before, { chords: lane('pack:rhodes', false) });
        expect(withFollowFeel(stored)).toBe(stored);
    });
});

describe('blankSong', () => {
    it('starts every lane on Follow feel whatever its template pinned', () => {
        const template = song(before, {
            chords: lane('pack:rhodes', false),
            bass: lane('synth', false),
        });
        const created = blankSong(template);
        expect(Object.values(created.chart.band).map((mix) => mix.autoSound)).toEqual([true, true]);
        expect(created.chart.band.chords.voice).toBe('pack:rhodes');
    });
});
