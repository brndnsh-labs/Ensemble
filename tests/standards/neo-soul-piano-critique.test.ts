// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getRootlessVoicing } from '../../public/engine/chords-styles.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Neo-Soul Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.7, step: 0, intent: { layBack: 0.05 } },
            groove: { genreFeel: 'Neo-Soul', pocket: 0, instruments: [] },
            soloist: makeSoloistMock({ enabled: true, busySteps: 0, lastFreq: 0 }),
            bass: { enabled: true, lastFreq: 110 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'smart', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 1000, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Neo-Soul performance', () => {
        const chordC = {
            rootMidi: 60,
            quality: 'm9',
            intervals: [0, 3, 7, 10, 2],
            freqs: [261.63, 311.13, 392.0, 466.16, 587.33],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chordC];
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let laidBackHits = 0;
        let totalStabs = 0;
        let richVoicings = 0;

        for (let i = 0; i < totalSteps; i++) {
            mockState.playback.step = i;
            const stepInMeasure = i % 16;
            const notes = getAccompanimentNotes(
                getState(),
                chordC,
                i,
                stepInMeasure,
                stepInMeasure,
                { isBeatStart: stepInMeasure % 4 === 0 },
                {},
            );

            if (notes.length > 0 && notes[0].midi > 0) {
                totalStabs++;
                const note = notes[0];
                if (note.timingOffset > 0.02) {
                    laidBackHits++;
                }
                if (notes.length >= 3) {
                    richVoicings++;
                }
            }
        }

        const lagRatio = laidBackHits / totalStabs;
        const richRatio = richVoicings / totalStabs;

        console.log(
            '\n--- NEO-SOUL PIANO CRITIQUE REPORT ---\n' +
                `[Dilla Pocket Lag]      ${(lagRatio * 100).toFixed(1)}%\n` +
                `[Voicing Richness]      ${(richRatio * 100).toFixed(1)}%\n` +
                '------------------------------------\n',
        );

        expect(lagRatio).toBeGreaterThan(0.9);
        expect(richRatio).toBeGreaterThan(0.8);
    });

    // why: epic-chords-voicing S2. The Neo-Soul rich m7 voicing used to return
    // [2, 3, 5, 10, 15, 19], stacking pc 2 and pc 3 as adjacent semitones in the
    // same octave — an unintentional half-step cluster. Canonical D'Angelo
    // quartal m11 keeps the b3 (so the chord sounds MINOR) but spaces it from
    // the 9 by a whole step. This test asserts both: zero in-octave half-step
    // adjacencies AND b3 (pc 3) present somewhere in the stack.
    it('rich Neo-Soul m7 voicing has no half-step adjacencies and retains the b3', () => {
        mockState.playback.bandIntensity = 0.7; // > 0.6 to hit the rich branch
        const intervals = getRootlessVoicing(getState(), 'minor', true, true);
        expect(intervals).not.toBeNull();
        const sorted = [...(intervals as number[])].sort((a, b) => a - b);
        const adjacencies: Array<[number, number]> = [];
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i + 1] - sorted[i] === 1) {
                adjacencies.push([sorted[i], sorted[i + 1]]);
            }
        }
        const pcs = new Set(sorted.map((n) => ((n % 12) + 12) % 12));
        console.log(
            '\n--- NEO-SOUL RICH VOICING ADJACENCY ---\n' +
                `[Intervals]             [${sorted.join(', ')}]\n` +
                `[Pitch classes]         [${[...pcs].sort((a, b) => a - b).join(', ')}]\n` +
                `[Half-step adjacencies] ${adjacencies.length} (target: 0)\n` +
                `[Contains b3 (pc 3)]    ${pcs.has(3)} (target: true)\n` +
                '----------------------------------------\n',
        );
        expect(adjacencies).toEqual([]);
        // why: a Neo-Soul m7 voicing without the b3 sounds sus, not minor.
        // The b3 is the defining minor pitch class — its loss is a regression
        // the prior version of this test missed.
        expect(pcs.has(3)).toBe(true);
    });
});
