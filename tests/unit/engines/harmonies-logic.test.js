/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 0.5, bpm: 120 },
        groove: { genreFeel: 'Rock' },
        harmony: { enabled: true, style: 'smart', volume: 0.5, complexity: 0.5, lastMidis: [] },
        soloist: { enabled: false, busySteps: 0, notesInPhrase: 0, isResting: true },
        arranger: { timeSignature: '4/4' },
        chords: {},
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        getState: () => mockState,
    };
});

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] },
    },
}));

// Mock utils (some tests need these mocked values for determinism, but we'll try to rely on defaults or spy)
// The original file mocked utils, but the target file didn't.
// We will stick to the target file's style unless necessary.

// Mock chords.js to spy on getBestInversion
vi.mock('../../../public/chords.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getBestInversion: vi.fn((...args) => actual.getBestInversion(...args)),
    };
});

import {
    clearHarmonyMemory,
    generateCompingPattern,
    getGuideTones,
    getHarmonyNotes,
    getSafeVoicings,
} from '../../../public/harmonies.js';
import { getState } from '../../../public/state.js';

const { playback, soloist, harmony, groove } = getState();

import { getBestInversion } from '../../../public/chords.js';

describe('Harmony Engine Logic', () => {
    const chordC = {
        rootMidi: 60,
        intervals: [0, 4, 7],
        quality: 'major',
        beats: 4,
        sectionId: 'A',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        clearHarmonyMemory();
        groove.genreFeel = 'Funk';
        harmony.style = 'smart';
        playback.bandIntensity = 0.5;
        harmony.complexity = 0.5;
        soloist.enabled = true;
        soloist.isResting = true;
        soloist.notesInPhrase = 0;
    });

    // Helper to check intervals requested from chords.js
    function getLastRequestedIntervals() {
        if (getBestInversion.mock.calls.length === 0) {
            return null;
        }
        return getBestInversion.mock.calls[getBestInversion.mock.calls.length - 1][1];
    }

    describe('Guide Tones & Safe Voicings', () => {
        it('should extract guide tones correctly', () => {
            const intervals = [0, 4, 7, 10, 14]; // Root, 3rd, 5th, b7, 9
            const guides = getGuideTones(intervals);
            // 3rd (4) and b7 (10) are guide tones
            expect(guides).toContain(4);
            expect(guides).toContain(10);
            expect(guides).not.toContain(0);
            expect(guides).not.toContain(7);
            expect(guides).not.toContain(14);
        });

        it('should remove dangerous extensions in getSafeVoicings', () => {
            const unsafe = [0, 4, 7, 10, 13, 14, 18]; // 13, 9, #11
            const safe = getSafeVoicings(unsafe);
            // 13 (1) -> b9? No, 13%12 = 1. b9. Unsafe.
            // 14 (2) -> 9. Unsafe in safe mode.
            // 18 (6) -> #11. Unsafe.
            // Safe should only be 0, 4, 7, 10
            expect(safe).toContain(0);
            expect(safe).toContain(4);
            expect(safe).toContain(7);
            expect(safe).toContain(10);
            expect(safe).not.toContain(13);
            expect(safe).not.toContain(14);
        });

        it('should use guide tones at low complexity/intensity', () => {
            playback.bandIntensity = 0.3;
            harmony.complexity = 0.3;
            groove.genreFeel = 'Pop'; // Ensure activeStyle resolves to 'strings' for min polyphony 2
            const chord = { rootMidi: 60, intervals: [0, 4, 7, 10, 14], sectionId: 's1', beats: 4 };

            getHarmonyNotes(chord, null, 0, 60, 'smart', 0);

            const requested = getLastRequestedIntervals();
            // Should prefer 4 and 10
            expect(requested).toContain(4);
            expect(requested).toContain(10);
            // Should NOT have 14 (9th) or 0/7 if strictly guide tones are favored
            expect(requested).not.toContain(14);
        });

        it('should restrict to safe voicings when soloist is active', () => {
            playback.bandIntensity = 0.8;
            soloist.enabled = true;
            soloist.isResting = false;
            soloist.notesInPhrase = 5; // Busy

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);

            const chord = { rootMidi: 60, intervals: [0, 4, 7, 14, 18], sectionId: 's1', beats: 4 }; // 9, #11

            getHarmonyNotes(chord, null, 0, 60, 'smart', 0);

            const requested = getLastRequestedIntervals();
            expect(requested).not.toContain(14); // 9th
            expect(requested).not.toContain(18); // #11
            expect(requested).toContain(0);

            randomSpy.mockRestore();
        });
    });

    describe('Rhythmic Comping', () => {
        it('should generate patterns for Jazz', () => {
            const pattern = generateCompingPattern('Jazz', 12345);
            expect(pattern.length).toBe(32);
            expect(pattern.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
        });

        it('should generate patterns for Funk', () => {
            const pattern = generateCompingPattern('Funk', 12345);
            expect(pattern.length).toBe(32);
            expect(pattern[0]).toBe(1);
            const hasDynamics = pattern.some((v) => v > 1);
            expect(hasDynamics).toBe(true);
        });

        it('should return 32-step pattern for Reggae', () => {
            const pattern = generateCompingPattern('Reggae', 12345);
            expect(pattern.length).toBe(32);
            expect(pattern[4]).toBe(1);
            expect(pattern[12]).toBe(1);
            expect(pattern[0]).toBe(0);
        });
    });

    describe('Dynamic Intensity', () => {
        it('should play more notes at higher intensity for Funk', () => {
            const chord = { rootMidi: 60, intervals: [0, 4, 7], sectionId: 'funk-test', beats: 4 };
            groove.genreFeel = 'Funk';

            // 1. Low Intensity -> Fewer notes
            playback.bandIntensity = 0.2;
            let lowIntNotesCount = 0;
            for (let i = 0; i < 16; i++) {
                const n = getHarmonyNotes(chord, null, i, 60, 'smart', i);
                if (n.length > 0) {
                    lowIntNotesCount++;
                }
            }

            // 2. High Intensity -> More notes
            playback.bandIntensity = 0.9;
            let highIntNotesCount = 0;
            for (let i = 0; i < 16; i++) {
                const n = getHarmonyNotes(chord, null, i, 60, 'smart', i);
                if (n.length > 0) {
                    highIntNotesCount++;
                }
            }

            expect(highIntNotesCount).toBeGreaterThanOrEqual(lowIntNotesCount);
        });
    });

    describe('Core Generation', () => {
        it('should generate notes on pattern hits', () => {
            // Funk pattern 0 usually has a hit on step 3 (And of 1)
            const notes = [];
            for (let s = 0; s < 16; s++) {
                const res = getHarmonyNotes(chordC, null, s, 60, 'smart', s);
                if (res.length > 0) {
                    notes.push({ step: s, notes: res });
                }
            }
            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].notes[0]).toHaveProperty('midi');
            expect(notes[0].notes[0]).toHaveProperty('velocity');
        });

        it('should scale density with intensity', () => {
            playback.bandIntensity = 0.1;
            harmony.complexity = 0.1;
            const lowNotes = getHarmonyNotes(chordC, null, 0, 60, 'smart', 0);

            playback.bandIntensity = 1.0;
            harmony.complexity = 1.0;
            const highNotes = getHarmonyNotes(chordC, null, 0, 60, 'smart', 0);

            expect(highNotes.length).toBeGreaterThanOrEqual(lowNotes.length);
        });
    });

    describe('Soloist Awareness (Integration)', () => {
        it('should play stabs when soloist is resting', () => {
            soloist.isResting = true;
            groove.genreFeel = 'Funk';
            let stabFound = false;
            for (let s = 1; s < 16; s++) {
                const res = getHarmonyNotes(chordC, null, s, 60, 'smart', s);
                if (res.length > 0 && res[0].durationSteps < 4) {
                    stabFound = true;
                    break;
                }
            }
            expect(stabFound).toBe(true);
        });

        it('should use sparse comping when soloist is busy', () => {
            soloist.isResting = false;
            soloist.notesInPhrase = 10;
            playback.bandIntensity = 0.5; // Moderate intensity

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);

            const res = getHarmonyNotes(chordC, null, 0, 60, 'smart', 0);
            expect(res.length).toBeGreaterThan(0);
            // In new logic, downbeat duration is 3 (less than 4-step pad)
            expect(res[0].durationSteps).toBeLessThan(4);

            // At 0.5 intensity, it should skip some non-essential hits when soloist is busy
            // (needed = 0.4 + 0.2 = 0.6 for medium hits, 0.5 < 0.6)
            const offbeatRes = getHarmonyNotes(chordC, null, 3, 60, 'smart', 3);
            if (offbeatRes.length > 0) {
                // If it does play, it should be very short
                expect(offbeatRes[0].durationSteps).toBeLessThan(2);
            }
            randomSpy.mockRestore();
        });
    });

    describe('Genre-Specific Rhythms (Integration)', () => {
        it('should use Jazz rhythms in Jazz genre', () => {
            groove.genreFeel = 'Jazz';
            soloist.isResting = true;

            let hitFound = false;
            for (let s = 0; s < 16; s++) {
                const res = getHarmonyNotes(chordC, null, s, 60, 'smart', s);
                if (res.length > 0) {
                    hitFound = true;
                    break;
                }
            }
            expect(hitFound).toBe(true);
        });
    });

    describe('Motif Consistency', () => {
        it('should use the same pattern for the same section', () => {
            const sectionA1 = { ...chordC, sectionId: 'A' };
            const sectionA2 = { ...chordC, sectionId: 'A' };

            const hits1 = [];
            for (let s = 0; s < 16; s++) {
                if (getHarmonyNotes(sectionA1, null, s, 60, 'smart', s).length > 0) {
                    hits1.push(s);
                }
            }

            const hits2 = [];
            for (let s = 0; s < 16; s++) {
                if (getHarmonyNotes(sectionA2, null, s, 60, 'smart', s).length > 0) {
                    hits2.push(s);
                }
            }

            expect(hits1).toEqual(hits2);
        });
    });

    describe('Soloist Hook Reinforcement', () => {
        it('should reinforce (latch onto) the soloist hook at high intensity in Ska', () => {
            soloist.enabled = true;
            soloist.sharedHookBuffer = [{ step: 0 }];
            groove.genreFeel = 'Ska-Punk';
            playback.bandIntensity = 0.8;

            const chord = {
                rootMidi: 60,
                symbol: 'Cmaj7',
                quality: 'major7',
                beats: 4,
                sectionId: 'A',
            };
            const soloistNote = { midi: 72, freq: 523.25 };

            const notes = getHarmonyNotes(chord, null, 0, 60, 'smart', 0, soloistNote);

            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].isLatched).toBe(true);
            expect(notes.length).toBeGreaterThanOrEqual(2);
            expect(notes[0].velocity).toBeGreaterThan(0.35);
        });
    });
});
