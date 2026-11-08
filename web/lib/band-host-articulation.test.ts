/**
 * The lead's pitch moves (#2120) cross from the band to the soloist voice at `playBandEvent`:
 * the band writes them in semitones and ticks, `leadArticulation` turns them into seconds by the
 * note's own tempo (and lengthens a long fall's note into the rest), and `legatoLeads` keeps a
 * slur from gliding off a pitch that has moved.
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
    it('hands a note with no pitch moves its own length and no articulation', () => {
        expect(leadArticulation(note({ bendIn: 1, vibrato: true }), 0.5)).toEqual({
            seconds: 0.5,
        });
    });

    it('drops a short fall over its ticks in the note’s tail, never more than 40% of it', () => {
        // A quarter at 120 (0.5 s): an eighth's fall is 0.25 s, held to 40% — 0.2 s.
        const quarter = leadArticulation(note({ fall: { semitones: 3, ticks: STEP * 2 } }), 0.5);
        expect(quarter.seconds).toBe(0.5);
        expect(quarter.articulation?.fall?.semitones).toBe(3);
        expect(quarter.articulation?.fall?.seconds).toBeCloseTo(0.2, 10);
        // A dotted half at 120 (1.5 s): the eighth fits, 0.25 s.
        const long = leadArticulation(
            note({ dur: PPQ * 3, fall: { semitones: 4, ticks: STEP * 2 } }),
            1.5,
        );
        expect(long.articulation?.fall).toEqual({ semitones: 4, seconds: 0.25 });
    });

    it('sounds a long fall past the written length: the note whole, then its drop into the rest', () => {
        // A half note at 120 (1 s) with a quarter's fall into the rest: 0.5 s more, all fall.
        const { seconds, articulation } = leadArticulation(
            note({ dur: PPQ * 2, fall: { semitones: 6, ticks: PPQ, into: true } }),
            1,
        );
        expect(seconds).toBeCloseTo(1.5, 10);
        expect(articulation?.fall).toEqual({ semitones: 6, seconds: 0.5 });
    });

    it('releases a bend from the note’s middle over an eighth, at most 35% of the note', () => {
        expect(
            leadArticulation(note({ dur: PPQ * 2, bendIn: 1, release: true }), 1).articulation
                ?.release,
        ).toEqual({ at: 0.5, seconds: 0.25 });
        const quarter = leadArticulation(note({ dur: PPQ, bendIn: 2, release: true }), 0.5);
        expect(quarter.articulation?.release?.at).toBe(0.25);
        expect(quarter.articulation?.release?.seconds).toBeCloseTo(0.175, 10);
    });

    it('drops a release with no bend to let down', () => {
        expect(leadArticulation(note({ release: true }), 0.5)).toEqual({
            seconds: 0.5,
            articulation: {},
        });
    });

    it('slides over the band’s ticks at the note’s tempo, at most half the note', () => {
        // A quarter at 120 (0.5 s): a sixteenth's slide is 0.125 s.
        expect(
            leadArticulation(note({ slideIn: { from: -3, ticks: STEP } }), 0.5).articulation?.slide,
        ).toEqual({ semitones: -3, seconds: 0.125 });
        const capped = leadArticulation(
            note({ dur: STEP * 2, slideIn: { from: 2, ticks: STEP * 2 } }),
            0.25,
        ).articulation?.slide;
        expect(capped?.seconds).toBeCloseTo(0.125, 10);
    });

    it('never hands the voice a non-finite time', () => {
        const fall = { semitones: 3, ticks: STEP * 2 };
        expect(leadArticulation(note({ fall }), Number.NaN).articulation).toBeUndefined();
        expect(leadArticulation(note({ fall }), 0).articulation).toBeUndefined();
        expect(leadArticulation(note({ fall, dur: 0 }), 0.5).articulation).toBeUndefined();
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
        const [fell, after] = run(note({ fall: { semitones: 3, ticks: STEP * 2 } }), note());
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
    const state = { groove: { humanize: 0, lastSmartGenre: 'Funk' } } as unknown as EnsembleState;
    const timeline = compileTimeline(score);

    it('passes the articulation as the voice’s last argument, and none for a plain note', () => {
        const fell: BandEvent = note({ dur: PPQ * 2, fall: { semitones: 4, ticks: STEP * 2 } });
        playBandEvent(state, fell, 1, 1, 1, timeline);
        const call = vi.mocked(playSoloNote).mock.calls.at(-1);
        expect(call?.[3]).toBe(1);
        expect(call?.[10]).toEqual({ fall: { semitones: 4, seconds: 0.25 } });
        playBandEvent(state, note(), 1, 0.5, 1, timeline);
        expect(vi.mocked(playSoloNote).mock.calls.at(-1)?.[10]).toBeUndefined();
    });

    it('lengthens a long fall’s note so the voice sounds its drop into the rest', () => {
        const fell: BandEvent = note({
            dur: PPQ * 2,
            fall: { semitones: 5, ticks: PPQ, into: true },
        });
        playBandEvent(state, fell, 1, 1, 1, timeline);
        const call = vi.mocked(playSoloNote).mock.calls.at(-1);
        expect(call?.[3]).toBeCloseTo(1.5, 10);
        expect(call?.[10]).toEqual({ fall: { semitones: 5, seconds: 0.5 } });
    });
});
