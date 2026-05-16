// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Define mockState in a way that vi.mock can capture it
const { testState } = vi.hoisted(() => ({
    testState: {
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5, intent: {}, lyricalBias: 0.5 },
        groove: { genreFeel: 'Jazz', pocket: 0 },
        soloist: makeSoloistMock({
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
            phraseContext: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                profile: 'srv',
            },
        }),
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
        // Engine returns null on many steps (rests / busy-step gating); push
        // iterations high enough that totalNotes lands ~150+ for a tight CI.
        const iterations = 800;

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
        console.log(
            `[Soloist Conclusion] Chord-tone ratio: ${(ratio * 100).toFixed(1)}% over ${totalNotes} notes (Target: >55%, random baseline 33%)`,
        );
        // Chord [0,4,7,11] = 4 of 12 chromatic pitches → 33% uniform-random
        // baseline. Engine delivers 73-84% over 5 sample runs (sample size
        // 33-41 notes). Threshold 0.55 is 22pt above random (so a non-biased
        // engine fails) and ~18pt below the worst observed (so RNG variance
        // doesn't flake).
        //
        // Caveat (logged as Open finding #2 in docs/MUSICAL_AUDIT.md): the
        // pitch engine has no Conclusion-specific bias — the same 78% would
        // hold for Statement/Restatement/Departure. The test name's
        // "Conclusion phase" claim is not yet truly enforced; the test
        // currently verifies the engine's general chord-tone bias.
        expect(ratio).toBeGreaterThan(0.55);
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
});
