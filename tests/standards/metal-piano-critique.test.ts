// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Metal Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.8, complexity: 0.7, step: 0, intent: {} },
            groove: { genreFeel: 'Metal', pocket: 0, instruments: [] },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0, lastFreq: 0 }),
            bass: { enabled: true, lastFreq: 55 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'power-metal', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 512, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    function sampleVoicingIntervals(chord) {
        mockState.arranger.progression = [chord];
        const intervals: number[] = [];
        // power-metal fires every 8th note: steps 0,2,4,6,8,10,12,14 in a 16-step bar.
        for (let step = 0; step < 16; step++) {
            mockState.playback.step = step;
            const notes = getAccompanimentNotes(
                getState(),
                chord,
                step,
                step,
                step,
                { isBeatStart: step % 4 === 0, isBackbeat: step % 8 === 4 },
                {},
            );
            if (notes.length >= 2) {
                const midis = notes
                    .map((n) => n.midi)
                    .filter((m) => typeof m === 'number' && m > 0)
                    .sort((a, b) => a - b);
                if (midis.length >= 2) {
                    intervals.push(midis[1] - midis[0]);
                }
            }
        }
        return intervals;
    }

    // why: chords.md P0 #4 / epic-chords-voicing S3. Power-metal comping must read
    // chord.quality. A P5 on top of an m7b5/halfdim chord re-voices it as a major-
    // implying power chord and destroys the half-diminished color. The fix uses
    // a tritone (6 semitones) for dim/halfdim/7b5 — the b5 already implied by the
    // chord quality.
    it('plays a tritone power chord (6 semitones) over a halfdim chord', () => {
        const halfdim = {
            rootMidi: 50,
            quality: 'halfdim',
            intervals: [0, 3, 6, 10],
            freqs: [146.83, 174.61, 207.65, 233.08],
            sectionId: 'A',
        };
        const intervals = sampleVoicingIntervals(halfdim);
        console.log(
            '\n--- METAL POWER-CHORD CRITIQUE (halfdim) ---\n' +
                `[Voicings sampled]      ${intervals.length}\n` +
                `[Intervals]             ${[...new Set(intervals)].join(', ')}\n` +
                '--------------------------------------------\n',
        );
        expect(intervals.length).toBeGreaterThan(0);
        expect(intervals.some((i) => i === 7)).toBe(false); // no P5 — regression guard
        expect(intervals.every((i) => i === 6)).toBe(true); // all tritone
    });

    // why: same fix family — augmented chords get an augmented power chord
    // (root + #5 + octave). Verifies the lookup's second branch is reachable.
    it('plays an augmented power chord (8 semitones) over an aug chord', () => {
        const aug = {
            rootMidi: 50,
            quality: 'aug',
            intervals: [0, 4, 8],
            freqs: [146.83, 184.997, 233.08],
            sectionId: 'A',
        };
        const intervals = sampleVoicingIntervals(aug);
        expect(intervals.length).toBeGreaterThan(0);
        expect(intervals.every((i) => i === 8)).toBe(true);
        expect(intervals.some((i) => i === 7)).toBe(false);
    });

    // why: regression guard — a plain minor chord must still get the standard
    // P5 power chord (7 semitones). The quality-aware dispatch must not break
    // the default case.
    it('preserves the P5 power chord (7 semitones) over a basic minor chord', () => {
        const minor = {
            rootMidi: 48,
            quality: 'minor',
            intervals: [0, 3, 7],
            freqs: [130.81, 155.56, 196.0],
            sectionId: 'A',
        };
        const intervals = sampleVoicingIntervals(minor);
        expect(intervals.length).toBeGreaterThan(0);
        expect(intervals.every((i) => i === 7)).toBe(true);
    });
});
