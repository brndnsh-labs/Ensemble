/**
 * The lead's pitch moves (#2120) cross from the band to the soloist voice at `playBandEvent`:
 * the band writes them in semitones and ticks, `leadArticulation` turns them into seconds by the
 * note's own tempo, and `legatoLeads` keeps a slur from gliding off a pitch that has moved.
 */
import { type BandEvent, compileTimeline, type PitchedNote, PPQ } from '@band/index';
import { playSoloNote } from '@core/engine/synth-soloist';
import type { SemanticScore } from '@core/songbook/score-types';
import type { EnsembleState } from '@core/types';
import { describe, expect, it, vi } from 'vitest';
import { leadArticulation, legatoLeads, playBandEvent } from './band-host';

vi.mock('@core/engine/synth-soloist', () => ({ playSoloNote: vi.fn() }));

const STEP = PPQ / 4;

const note = (over: Partial<PitchedNote> = {}): PitchedNote => ({
    lane: 'lead',
    midi: 72,
    dur: PPQ,
    tick: 0,
    offsetMs: 0,
    velocity: 90,
    bar: 0,
    ...over,
});

describe('leadArticulation: the band’s ticks as the voice’s seconds', () => {
    it('is undefined for a note with no pitch moves', () => {
        expect(leadArticulation(note({ bendIn: 1, vibrato: true }), 0.5)).toBeUndefined();
    });

    it('falls over an eighth of the note’s tempo, never more than 40% of the note', () => {
        // A half note at 120: 1 s, an eighth is 0.25 s.
        expect(leadArticulation(note({ dur: PPQ * 2, fall: 3 }), 1)?.fall).toEqual({
            semitones: 3,
            seconds: 0.25,
        });
        // An eighth note at 120 (0.25 s): its fall is 40% of it, 0.1 s.
        const short = leadArticulation(note({ dur: PPQ / 2, fall: 2 }), 0.25)?.fall;
        expect(short?.semitones).toBe(2);
        expect(short?.seconds).toBeCloseTo(0.1, 10);
    });

    it('releases a bend from the note’s middle over an eighth, at most 35% of the note', () => {
        expect(
            leadArticulation(note({ dur: PPQ * 2, bendIn: 1, release: true }), 1)?.release,
        ).toEqual({ at: 0.5, seconds: 0.25 });
        const quarter = leadArticulation(note({ dur: PPQ, bendIn: 2, release: true }), 0.5);
        expect(quarter?.release?.at).toBe(0.25);
        expect(quarter?.release?.seconds).toBeCloseTo(0.175, 10);
    });

    it('drops a release with no bend to let down', () => {
        expect(leadArticulation(note({ release: true }), 0.5)).toEqual({});
    });

    it('slides over the band’s ticks at the note’s tempo, at most half the note', () => {
        // A quarter at 120 (0.5 s): a sixteenth's slide is 0.125 s.
        expect(leadArticulation(note({ slideIn: { from: -3, ticks: STEP } }), 0.5)?.slide).toEqual({
            semitones: -3,
            seconds: 0.125,
        });
        const capped = leadArticulation(
            note({ dur: STEP * 2, slideIn: { from: 2, ticks: STEP * 2 } }),
            0.25,
        )?.slide;
        expect(capped?.seconds).toBeCloseTo(0.125, 10);
    });

    it('never hands the voice a non-finite time', () => {
        expect(leadArticulation(note({ fall: 3 }), Number.NaN)).toBeUndefined();
        expect(leadArticulation(note({ fall: 3 }), 0)).toBeUndefined();
        expect(leadArticulation(note({ fall: 3, dur: 0 }), 0.5)).toBeUndefined();
    });
});

describe('legatoLeads: a slur never glides from a pitch that has moved', () => {
    const run = (...notes: PitchedNote[]) => {
        let tick = 0;
        return notes.map((n) => {
            const placed = { ...n, tick };
            tick += n.dur;
            return placed;
        });
    };

    it('slurs a contiguous plain note, and attacks a slid one', () => {
        const [, plain] = run(note(), note());
        expect(legatoLeads([note(), plain]).has(plain)).toBe(true);
        const [a, slid] = run(note(), note({ slideIn: { from: -2, ticks: STEP / 2 } }));
        expect(legatoLeads([a, slid]).has(slid)).toBe(false);
    });

    it('attacks the note after one that fell or let its bend down', () => {
        const [fell, after] = run(note({ fall: 3 }), note());
        expect(legatoLeads([fell, after]).has(after)).toBe(false);
        const [released, next] = run(note({ bendIn: 1, release: true }), note());
        expect(legatoLeads([released, next]).has(next)).toBe(false);
    });
});

const score: SemanticScore = {
    notation: 'name',
    key: 'C',
    isMinor: false,
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
};

describe('playBandEvent hands the soloist voice the note’s pitch moves', () => {
    it('passes the articulation as the voice’s last argument, and none for a plain note', () => {
        const state = {
            groove: { humanize: 0, lastSmartGenre: 'Funk' },
        } as unknown as EnsembleState;
        const timeline = compileTimeline(score);
        const fell: BandEvent = note({ dur: PPQ * 2, fall: 4 });
        playBandEvent(state, fell, 1, 1, 1, timeline);
        expect(vi.mocked(playSoloNote).mock.calls.at(-1)?.[10]).toEqual({
            fall: { semitones: 4, seconds: 0.25 },
        });
        playBandEvent(state, note(), 1, 0.5, 1, timeline);
        expect(vi.mocked(playSoloNote).mock.calls.at(-1)?.[10]).toBeUndefined();
    });
});
