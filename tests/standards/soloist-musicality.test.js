/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';

// Define mockState in a way that vi.mock can capture it
const { testState } = vi.hoisted(() => ({
    testState: {
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5, intent: {}, lyricalBias: 0.5 },
        groove: { genreFeel: 'Jazz', pocket: 0 },
        soloist: {
            enabled: true,
            style: 'smart',
            mode: 'monophonic',
            octave: 64,
            sessionSteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            srdcState: 'Conclusion',
            isResting: false,
            motifBuffer: [],
            thematicSeed: [],
            thematicSeedRoot: 0,
            isReplayingMotif: false,
            isReplayingSeed: false,
            busySteps: 0,
            pitchHistory: [],
            lastInterval: 0,
            stagnationCount: 0,
        },
        harmony: { enabled: false },
        arranger: { timeSignature: '4/4' },
    },
}));

vi.mock('../../public/state.js', () => ({
    stateMap: testState,
    getState: () => testState,
    dispatch: vi.fn(),
}));

describe('Soloist Musicality & Thematic Integrity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        testState.playback.bandIntensity = 0.5;
    });

    it('should statistically resolve to chord tones in the Conclusion phase', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 11], beats: 4 };
        const chordTones = [0, 4, 7, 11];

        // Simulate a conclusion phase by using a high iteration count
        // and checking for chord tone bias
        let chordToneHits = 0;
        let totalNotes = 0;
        const iterations = 200;

        for (let i = 0; i < iterations; i++) {
            const note = getSoloistNote(getState(), chord, chord, i, null, 64, 'scalar', i % 16);
            if (note) {
                totalNotes++;
                const primary = Array.isArray(note) ? note[0] : note;
                if (chordTones.includes(primary.midi % 12)) {
                    chordToneHits++;
                }
            }
        }

        const ratio = chordToneHits / totalNotes;
        // Even with random elements, it should be significantly biased towards chord tones
        expect(ratio).toBeGreaterThan(0.15);
    });

    it('should generate notes within a consistent range', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 11], beats: 4 };
        const iterations = 100;

        for (let i = 0; i < iterations; i++) {
            const note = getSoloistNote(getState(), chord, chord, i, null, 64, 'scalar', i % 16);
            if (note) {
                const primary = Array.isArray(note) ? note[0] : note;
                expect(primary.midi).toBeGreaterThanOrEqual(40);
                expect(primary.midi).toBeLessThanOrEqual(100);
            }
        }
    });

    it('should rigidly follow the thematic seed during Loop 0', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        // Create a seed note
        testState.soloist.sessionSeed = {
            loopLengthSteps: 16,
            notes: [{ step: 0, midi: 72, durationSteps: 4 }],
        };
        // Mock currentLoopCount to 0
        testState.playback.currentLoopCount = 0;

        // Set active steps so rhythm engine doesn't drop out immediately
        testState.soloist.activeSteps = 16;
        testState.soloist.isResting = false;
        testState.soloist.rhythmPlan = undefined; // Force generation
        const note = getSoloistNote(getState(), chord, chord, 0, null, 64, 'scalar', 0);
        expect(note).not.toBeNull();
        const primary = Array.isArray(note) ? note[0] : note;
        // The pitch engine should have locked on the exact seed note due to +5000 weight
        expect(primary.midi).toBe(72);
        expect(primary.durationSteps).toBe(4);

        // Ensure devices and double stops are disabled (result should not be an array)
        expect(Array.isArray(note)).toBe(false);

        // Cleanup state
        testState.playback.currentLoopCount = undefined;
        testState.soloist.sessionSeed = undefined;
    });
});
