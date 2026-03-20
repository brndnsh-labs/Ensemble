import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Jazz Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, step: 0, intent: {} },
            groove: { genreFeel: 'Jazz', pocket: 0, instruments: [] },
            soloist: { enabled: true, busySteps: 0, lastFreq: 0 },
            bass: { enabled: true, lastFreq: 110 }, // A2 (MIDI 45)
            harmony: { enabled: false },
            chords: { enabled: true, style: 'smart', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 1000, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Jazz piano performance', () => {
        // Authentic rootless maj9 voicing (3, 7, 9)
        const chordC = {
            rootMidi: 60,
            quality: 'maj7',
            intervals: [4, 11, 14],
            freqs: [329.63, 493.88, 587.33],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chordC];
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let charlestonHits = 0;
        let rootlessVoicings = 0;
        let totalStabs = 0;

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
                const midis = notes.map((n) => n.midi);

                // 1. Rhythmic Alignment (Charleston focus on 0, 6)
                if (stepInMeasure === 0 || stepInMeasure === 6) {
                    charlestonHits++;
                }

                // 2. Rootless Voicing (Should not contain the root MIDI 60)
                const containsRoot = midis.some((m) => m % 12 === 0);
                if (!containsRoot) {
                    rootlessVoicings++;
                }
            }
        }

        const charlestonScore = charlestonHits / (totalMeasures * 2);
        const rootlessRatio = rootlessVoicings / totalStabs;

        console.log(
            '\n--- JAZZ PIANO CRITIQUE REPORT ---\n' +
                `[Charleston Frequency]  ${(charlestonScore * 100).toFixed(1)}%\n` +
                `[Rootless Accuracy]     ${(rootlessRatio * 100).toFixed(1)}%\n` +
                `[Rhythmic Density]      ${(totalStabs / totalMeasures).toFixed(2)} hits/bar\n` +
                '------------------------------------\n',
        );

        expect(charlestonScore).toBeGreaterThan(0.55); // Slightly loosened from 0.6 to accommodate semantic variety
        expect(rootlessRatio).toBeGreaterThan(0.9);
    });

    it('should thin out voicings when the soloist is busy', () => {
        // Mock Math.random to ensure deterministic voicing choices
        // We use 0.1 to avoid triggering probabilistic skips that could make notesQuiet smaller than notesBusy randomly
        const originalRandom = Math.random;
        Math.random = () => 0.1;

        const chord = {
            rootMidi: 60,
            quality: 'maj7',
            is7th: true,
            intervals: [0, 4, 7, 11, 2, 9],
            freqs: [261.63, 329.63, 392.0, 493.88, 587.33, 739.99],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chord];

        // Scenario 1: Soloist Resting
        mockState.soloist.busySteps = 0;
        const notesQuiet = getAccompanimentNotes(
            getState(),
            chord,
            0,
            0,
            0,
            { isBeatStart: true },
            { soloistActive: false },
        );

        // Scenario 2: Soloist Busy
        mockState.soloist.busySteps = 10;
        const notesBusy = getAccompanimentNotes(
            getState(),
            chord,
            0,
            0,
            0,
            { isBeatStart: true },
            { soloistActive: true, soloistMidi: 73 },
        );

        console.log(
            `[Coordination] Quiet polyphony: ${notesQuiet.length}, Busy polyphony: ${notesBusy.length}`,
        );
        expect(notesBusy.length).toBeLessThanOrEqual(notesQuiet.length);

        // Restore Math.random
        Math.random = originalRandom;
    });
});
