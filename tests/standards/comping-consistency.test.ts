// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock the state modules
vi.mock('../../public/state.js', () => {
    const mockState = {
        playback: {
            bandIntensity: 0.5,
            bpm: 120,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
        },
        arranger: {
            timeSignature: '4/4',
            progression: [],
        },
        chords: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
        bass: { enabled: true },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        groove: { genreFeel: 'Jazz' },
        harmony: { enabled: false, buffer: new Map() },
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});
// Mock config
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' },
    },
}));

import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

const { arranger, chords, bass, groove } = getState();

describe('Accompaniment Consistency Standards', () => {
    const mockChord = {
        rootMidi: 60,
        freqs: [261.63, 329.63, 392.0, 493.88],
        quality: 'maj7',
        is7th: true,
        beats: 4,
        sectionId: 'sectionA',
    };

    beforeEach(() => {
        // Reset State
        compingState.currentCell = new Array(16).fill(0);
        compingState.lockedUntil = 0;
        compingState.grooveRetentionCount = 0;
        compingState.lastSectionId = null;
        compingState.lastVoicingMidis = [];

        arranger.progression = [mockChord];
        chords.enabled = true;
        bass.enabled = false;
        groove.genreFeel = 'Funk';
    });

    it('Scenario A: The Funk Loop - Should retain rhythmic pattern across measures', () => {
        groove.genreFeel = 'Funk';

        // Measure 1 Generation
        getAccompanimentNotes(getState(), mockChord, 0, 0, 0, { isBeatStart: true });
        const patternM1 = [...compingState.currentCell];

        // Advance to Measure 2 (Step 16)
        getAccompanimentNotes(getState(), mockChord, 16, 0, 0, { isBeatStart: true });
        const patternM2 = [...compingState.currentCell];

        // Advance to Measure 3 (Step 32)
        getAccompanimentNotes(getState(), mockChord, 32, 0, 0, { isBeatStart: true });
        const patternM3 = [...compingState.currentCell];

        // Expectation: Patterns should be identical
        expect(patternM2).toEqual(patternM1);
        expect(patternM3).toEqual(patternM1);
    });

    it('Scenario B: The Jazz Conversation - Should vary patterns frequently', () => {
        groove.genreFeel = 'Jazz';

        // Collect patterns over 5 measures
        const patterns = [];
        for (let i = 0; i < 5; i++) {
            getAccompanimentNotes(getState(), mockChord, i * 16, 0, 0, { isBeatStart: true });
            patterns.push(JSON.stringify(compingState.currentCell));
        }

        // We expect some variation.
        // It's statistically extremely unlikely to pick the exact same 16-step cell 5 times in a row
        // unless the pool is tiny or logic is sticky.
        const allSame = patterns.every((p) => p === patterns[0]);

        expect(allSame).toBe(false);
    });

    it('Scenario C: Section Change - Should force a pattern reset', () => {
        groove.genreFeel = 'Funk';

        // Measure 1 (Section A)
        const chordA = { ...mockChord, sectionId: 'sectionA' };
        getAccompanimentNotes(getState(), chordA, 0, 0, 0, { isBeatStart: true });
        const patternA = [...compingState.currentCell];

        // Measure 2 (Section A) - Should stick
        getAccompanimentNotes(getState(), chordA, 16, 0, 0, { isBeatStart: true });
        expect(compingState.currentCell).toEqual(patternA);

        // Measure 3 (Section B) - CHANGE!
        const chordB = { ...mockChord, sectionId: 'sectionB' };
        // We need to simulate the step advancing
        getAccompanimentNotes(getState(), chordB, 32, 0, 0, { isBeatStart: true });

        // We intentionally don't compare cells here — a small cell pool could legitimately
        // re-pick patternA. The reset is proven below via the tamper-and-check trick.
        expect(compingState.lastSectionId).toBe('sectionB');

        // To be sure, let's manually tamper the cell to be something impossible before the switch,
        // so if it stays, we know it failed to reset.
        compingState.currentCell = [9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9];

        // Trigger switch logic again to verify it overwrites our tamper
        const chordC = { ...mockChord, sectionId: 'sectionC' };
        getAccompanimentNotes(getState(), chordC, 48, 0, 0, { isBeatStart: true });

        expect(compingState.currentCell[0]).not.toBe(9);
    });

    it('Scenario D: Interlocking - Should avoid bass range when Bass is enabled', () => {
        // Mock Bass Enabled
        bass.enabled = true;
        bass.lastFreq = 65.41; // C2

        // Setup a chord that might have low notes
        const lowChord = {
            ...mockChord,
            freqs: [130.81, 164.81, 196.0], // C3, E3, G3
            rootMidi: 48,
        };

        // Accompaniment should shift up
        const notes = getAccompanimentNotes(getState(), lowChord, 0, 0, 0, { isBeatStart: true });

        // Accompaniment MUST produce notes for a populated chord; silent generation is itself a bug.
        expect(notes.length).toBeGreaterThan(0);

        const lowestNote = Math.min(...notes.map((n) => n.midi).filter((m) => m > 0));

        // bass.lastFreq = 65.41 Hz = C2 = MIDI 36. The interlocking rule shifts the
        // accompaniment up by an octave when lowestMidi <= bassMidi + 12, so post-shift
        // the floor must be ABOVE bassMidi + 12 = 48.
        const bassMidi = 36;
        expect(lowestNote).toBeGreaterThan(bassMidi + 12);
    });
});
