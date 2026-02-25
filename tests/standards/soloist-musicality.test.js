/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/soloist.js';
import { dispatch, getState } from '../../public/state.js';

// Mock state.js
vi.mock('../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    const mockState = {
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
    };

    return {
        ...actual,
        getState: () => mockState,
        dispatch: vi.fn(),
    };
});

describe('Soloist Musicality & Thematic Integrity', () => {
    let soloist;

    beforeEach(() => {
        const state = getState();
        soloist = state.soloist;

        // Reset soloist state for each test
        soloist.sessionSteps = 0;
        soloist.currentPhraseSteps = 0;
        soloist.notesInPhrase = 0;
        soloist.srdcState = 'Conclusion';
        soloist.isResting = true;
        soloist.motifBuffer = [];
        soloist.thematicSeed = [];
        soloist.thematicSeedRoot = 0;
        soloist.isReplayingMotif = false;
        soloist.isReplayingSeed = false;
        soloist.busySteps = 0;
        soloist.pitchHistory = [];
    });

    it('should capture a thematic seed within the first few measures', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 11], beats: 4 };

        // Simulate 32 steps (2 measures)
        for (let i = 0; i < 64; i++) {
            getSoloistNote(chord, chord, i, null, 64, 'scalar', i % 16, false);
            soloist.sessionSteps++;
        }

        // We expect a seed to be captured eventually if phrases are generated
        expect(soloist.thematicSeed.length).toBeGreaterThan(0);
        expect(soloist.thematicSeedRoot).toBeDefined();
    });

    it('should statistically resolve to chord tones in the Conclusion phase', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 11], beats: 4 }; // C Maj7
        const chordTones = [0, 4, 7, 11];

        soloist.srdcState = 'Conclusion';
        soloist.isResting = false;
        soloist.currentPhraseSteps = 10; // Late in phrase
        soloist.lastInterval = 0;
        soloist.lastFreq = 293.66; // D4 (non-chord tone)
        soloist.sessionSteps = 2000; // High maturity

        let chordToneHits = 0;
        const iterations = 100;
        for (let i = 0; i < iterations; i++) {
            soloist.currentCell = [1, 1, 1, 1];
            soloist.pitchHistory = []; // Clear history to avoid "magnet" penalties during testing
            const note = getSoloistNote(chord, chord, i, null, 64, 'scalar', 0, false);
            if (note) {
                const primary = Array.isArray(note) ? note[0] : note;
                const interval = (primary.midi - chord.rootMidi + 120) % 12;
                if (chordTones.includes(interval)) {
                    chordToneHits++;
                }
            }
        }
        // With the balanced resolution bonus, chord tones should be statistically favored.
        const ratio = chordToneHits / iterations;
        expect(ratio).toBeGreaterThan(0.35);
    });

    it('should replay the thematic seed with variations', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 11], beats: 4 };

        // Manually inject a seed
        soloist.thematicSeed = [
            { midi: 60, phraseStep: 0, durationSteps: 1 },
            { midi: 64, phraseStep: 2, durationSteps: 1 },
        ];
        soloist.thematicSeedRoot = 60;
        soloist.sessionSteps = 100; // Past capture window

        // Force Seed Replay
        soloist.isResting = true;
        soloist.srdcState = 'Statement'; // Will transition to Restatement

        // Mock Math.random to force Seed Replay decision
        const originalRandom = Math.random;
        vi.spyOn(Math, 'random').mockReturnValue(0.01);

        // First call should trigger phrase start AND return the first note of the seed
        const note = getSoloistNote(chord, chord, 0, null, 64, 'scalar', 0, false);
        expect(soloist.isReplayingSeed).toBe(true);

        const primary = Array.isArray(note) ? note[0] : note;
        expect(primary).toBeDefined();
        expect(primary.midi % 12).toBe(0); // C

        // Cleanup
        Math.random = originalRandom;
    });
});
