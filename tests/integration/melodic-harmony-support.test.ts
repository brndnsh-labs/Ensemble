// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHarmonyMemory, getHarmonyNotes } from '../../public/engine/harmonies.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

/**
 * Melodic Harmony Support: Behavioral Integrity Tests
 *
 * These tests define the desired musical interactions between the soloist
 * and the harmony section.
 */

const mockState: any = {
    playback: { bandIntensity: 0.5, bpm: 120, currentLoopCount: 0 },
    groove: { genreFeel: 'Jazz' },
    harmony: { enabled: true, style: 'smart', volume: 0.5, complexity: 0.5, lastMidis: [] },
    chords: { enabled: true, octave: 60 },
    soloist: makeSoloistMock({
        enabled: true,
        busySteps: 0,
        notesInPhrase: 0,
        isResting: false,
        sessionSeed: null,
    }),
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

console.log('TEST FILE LOADED');

describe('Melodic Harmony Support (Behavioral)', () => {
    beforeEach(() => {
        clearHarmonyMemory(mockState);
        mockState.playback.currentLoopCount = 0;
        mockState.playback.bandIntensity = 0.5;
        mockState.soloist.session.seed = {
            notes: [
                { step: 0, midi: 72, isAnchor: true, durationSteps: 4 },
                { step: 8, midi: 74, isAnchor: true, durationSteps: 2 },
                { step: 12, midi: 72, isAnchor: false, durationSteps: 2 },
            ],
            loopLengthSteps: 16,
        };
    });

    describe('The Thickener (Parallel Voicing)', () => {
        it('should reinforce ALL soloist anchors during Loop 0', () => {
            const chord = { rootMidi: 60, intervals: [0, 4, 7], sectionId: 'A', beats: 4 };
            const coordination = { soloistActive: true };

            // Mock random to ensure reinforcement isn't skipped by chance during this test
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

            // At step 0, soloist has an anchor note
            const notes = getHarmonyNotes(
                mockState,
                chord,
                null,
                0,
                60,
                'smart',
                0,
                { midi: 72 },
                coordination,
            );

            expect(notes.length).toBeGreaterThanOrEqual(2);
            expect(notes[0].isLatched).toBe(true);

            randomSpy.mockRestore();
        });

        it('should follow soloist rhythm during Loop 0 even on non-anchors', () => {
            const chord = { rootMidi: 60, intervals: [0, 4, 7], sectionId: 'A', beats: 4 };
            const coordination = { soloistActive: true };

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

            // At step 12, soloist has a non-anchor note.
            const notes = getHarmonyNotes(
                mockState,
                chord,
                null,
                12,
                60,
                'smart',
                12,
                { midi: 72 },
                coordination,
            );

            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].isLatched).toBe(true);

            randomSpy.mockRestore();
        });
    });

    describe('The Hype Man (Anticipation)', () => {
        it('should play an anticipation hit before a soloist anchor', () => {
            const chord = { rootMidi: 60, intervals: [0, 4, 7], sectionId: 'A', beats: 4 };
            const coordination = { soloistActive: false };

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

            // Step 6 is 2 steps before the anchor at step 8
            const notes = getHarmonyNotes(
                mockState,
                chord,
                null,
                6,
                60,
                'smart',
                6,
                null,
                coordination,
            );

            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].isLatched).toBe(true); // Marked as latched/hype

            randomSpy.mockRestore();
        });
    });

    describe('Antiphony (Call & Response)', () => {
        it('should trigger a response when the soloist completes a phrase', () => {
            const chord = { rootMidi: 60, intervals: [0, 4, 7], sectionId: 'A', beats: 4 };
            // Simulate soloist just finished a phrase
            const coordination = { soloistActive: false, soloistPhraseEnd: true };
            mockState.playback.bandIntensity = 0.8; // High intensity for reliable response

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

            const notes = getHarmonyNotes(
                mockState,
                chord,
                null,
                4,
                60,
                'smart',
                4,
                null,
                coordination,
            );

            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].isResponse).toBe(true);

            randomSpy.mockRestore();
        });
    });
});
