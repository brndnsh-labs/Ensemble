// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

/**
 * Metal harmony critique (#558).
 *
 * Before #558, Metal harmony was a generic horn stab (root+3rd dyad on 1&3) —
 * indistinguishable from Funk/Ska horns. Metal now plays the chugging power
 * chord: root–5th–octave, NO 3rd, heavy at every intensity (distinct from rock,
 * which is a harmonized-3rd line that only reaches a power-5th at high
 * intensity). The dropped 3rd is the point — the power chord is quality-neutral,
 * so it reads the same over major and minor roots.
 */
describe('Metal Harmony Critique', () => {
    let mockState;

    const Em = { rootMidi: 64, quality: 'm', intervals: [0, 3, 7], sectionId: 'A', beats: 4 };
    const G = { rootMidi: 67, quality: '', intervals: [0, 4, 7], sectionId: 'A', beats: 4 };
    const PROG = [Em, G];

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Metal',
                pocket: {
                    globalDrive: 0,
                    tightness: 1,
                    bassGravity: 1,
                    chordGravity: 1,
                    soloistGravity: 1,
                },
            },
            soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
            harmony: {
                enabled: true,
                complexity: 0.5,
                volume: 0.6,
                lastMidis: [],
                rhythmicMask: 0,
            },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    const pairwiseIntervals = (midis) => {
        const ivs = new Set();
        for (let i = 0; i < midis.length; i++) {
            for (let j = i + 1; j < midis.length; j++) {
                ivs.add(Math.abs(midis[i] - midis[j]) % 12);
            }
        }
        return ivs;
    };
    const hasDoubledPc = (midis) => {
        const pcs = midis.map((m) => ((m % 12) + 12) % 12);
        return new Set(pcs).size < pcs.length; // a repeated pitch class = octave double
    };

    function runProgression(bars, intensity) {
        mockState.playback.bandIntensity = intensity;
        const emissions = [];
        for (let bar = 0; bar < bars; bar++) {
            const chord = PROG[bar % PROG.length];
            for (let s = 0; s < 16; s++) {
                const step = bar * 16 + s;
                const notes = getHarmonyNotes(getState(), chord, null, step, 64, 'smart', s, null, {
                    soloistResting: true,
                    soloistNotesInPhrase: 0,
                });
                if (notes.length > 0) {
                    emissions.push(notes.map((n) => n.midi));
                }
            }
        }
        return emissions;
    }

    for (const intensity of [0.5, 0.85]) {
        it(`plays root-5th-octave power chords with no 3rd at intensity ${intensity}`, () => {
            const emissions = runProgression(64, intensity);

            const withFifth = emissions.filter((m) => pairwiseIntervals(m).has(7));
            const withOctave = emissions.filter((m) => hasDoubledPc(m));
            const withThird = emissions.filter(
                (m) => pairwiseIntervals(m).has(3) || pairwiseIntervals(m).has(4),
            );

            const fifthShare = withFifth.length / emissions.length;
            const octaveShare = withOctave.length / emissions.length;
            const thirdShare = withThird.length / emissions.length;

            console.log(
                `\n--- METAL HARMONY CRITIQUE REPORT (intensity ${intensity}) ---\n` +
                    `[Emissions]       ${emissions.length}\n` +
                    `[P5 Share]        ${(fifthShare * 100).toFixed(1)}% (Target: 100%)\n` +
                    `[Octave Share]    ${(octaveShare * 100).toFixed(1)}% (Target: 100%)\n` +
                    `[3rd Present]     ${(thirdShare * 100).toFixed(1)}% (Target: 0%)\n` +
                    '----------------------------------------------------\n',
            );

            // Power chord: fifth + octave double, never a 3rd — at all intensities.
            expect(fifthShare).toBe(1.0);
            expect(octaveShare).toBe(1.0);
            expect(thirdShare).toBe(0);
        });
    }
});
