import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHarmonyMemory, getHarmonyNotes } from '../public/engine/harmonies.js';

// Mock state
const mockState = {
    playback: { bandIntensity: 0.5, bpm: 120, currentLoopCount: 0 },
    groove: { genreFeel: 'Jazz' },
    harmony: { enabled: true, style: 'smart', volume: 0.5, complexity: 0.5, lastMidis: [] },
    soloist: { enabled: true, busySteps: 0, notesInPhrase: 0, isResting: true, sessionSeed: null },
    bass: { enabled: true },
    arranger: { timeSignature: '4/4' },
};

vi.mock('../public/state.js', () => ({
    getState: () => mockState,
}));

vi.mock('../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] },
    },
}));

describe('Harmony Silence Reproduction', () => {
    beforeEach(() => {
        clearHarmonyMemory(mockState);
        mockState.playback.currentLoopCount = 0;
        mockState.playback.bandIntensity = 0.5;
        mockState.soloist.sessionSeed = {
            notes: [{ step: 0, midi: 72, isAnchor: true }],
            loopLengthSteps: 16,
        };
    });

    it('should NOT be 100% silent at default intensity (0.5) during Loop 0 on an anchor', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], sectionId: 'A', beats: 4 };

        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

        // Step 0 IS an anchor
        const notes = getHarmonyNotes(mockState, chord, null, 0, 60, 'smart', 0);

        // At 0.5 intensity, anchors should be reinforced (reinforceProb >= 0.7)
        expect(notes.length).toBeGreaterThan(0);
        expect(notes[0].isLatched).toBe(true);

        randomSpy.mockRestore();
    });
    it('should occasionally play non-anchor steps at 0.5 intensity in Loop 0', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], sectionId: 'A', beats: 4 };

        // Non-anchor step 7 (Jazz Charleston hit)
        // With 50% probability reduction, over many trials it should play at least once
        let hitCount = 0;
        for (let i = 0; i < 100; i++) {
            const notes = getHarmonyNotes(mockState, chord, null, 7, 60, 'smart', 7);
            if (notes.length > 0) {
                hitCount++;
            }
        }

        expect(hitCount).toBeGreaterThan(0);
        expect(hitCount).toBeLessThan(100); // Probability reduction working
    });

    it('should play if intensity is increased above 0.6', () => {
        mockState.playback.bandIntensity = 0.7;
        const chord = { rootMidi: 60, intervals: [0, 4, 7], sectionId: 'A', beats: 4 };

        // Step 0 IS an anchor
        const notes = getHarmonyNotes(mockState, chord, null, 0, 60, 'smart', 0);

        expect(notes.length).toBeGreaterThan(0);
    });
});
