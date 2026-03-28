/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 0.5, bpm: 120 },
        groove: { genreFeel: 'Rock' },
        harmony: { enabled: true, style: 'smart', volume: 0.5, complexity: 0.5, lastMidis: [] },
        soloist: { enabled: false, busySteps: 0, notesInPhrase: 0, isResting: true },
        bass: { enabled: true },
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
        subscribe: vi.fn(),
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
vi.mock('../../../public/engine/chords-engine.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getBestInversion: vi.fn((...args) => actual.getBestInversion(...args)),
    };
});

import { getBestInversion } from '../../../public/engine/chords-engine.js';
import {
    clearHarmonyMemory,
    generateCompingPattern,
    getGuideTones,
    getHarmonyNotes,
    getSafeVoicings,
} from '../../../public/engine/harmonies.js';
import { getState } from '../../../public/state.js';

describe('Harmony Engine Logic', () => {
    let _playback, _soloist, _harmony, _groove, _bass;

    const chordC = {
        rootMidi: 60,
        intervals: [0, 4, 7],
        quality: 'major',
        beats: 4,
        sectionId: 'A',
    };

    beforeEach(() => {
        const state = getState();
        _playback = state.playback;
        _soloist = state.soloist;
        _harmony = state.harmony;
        _groove = state.groove;
        _bass = state.bass;

        vi.clearAllMocks();
        clearHarmonyMemory(getState());
        _groove.genreFeel = 'Funk';
        _harmony.style = 'smart';
        _playback.bandIntensity = 0.5;
        _harmony.complexity = 0.5;
        _soloist.enabled = true;
        _bass.enabled = true;
        _soloist.isResting = true;
        _soloist.notesInPhrase = 0;
    });

    // Helper to check intervals requested from chords.js
    function getLastRequestedIntervals() {
        if (getBestInversion.mock.calls.length === 0) {
            return null;
        }
        return getBestInversion.mock.calls[getBestInversion.mock.calls.length - 1][2];
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
            _playback.bandIntensity = 0.3;
            _harmony.complexity = 0.3;
            _groove.genreFeel = 'Pop'; // Ensure activeStyle resolves to 'strings' for min polyphony 2
            const chord = { rootMidi: 60, intervals: [0, 4, 7, 10, 14], sectionId: 's1', beats: 4 };

            getHarmonyNotes(getState(), chord, null, 0, 60, 'smart', 0);

            const requested = getLastRequestedIntervals();
            // Should prefer 4 and 10
            expect(requested).toContain(4);
            expect(requested).toContain(10);
            // Should NOT have 14 (9th) or 0/7 if strictly guide tones are favored
            expect(requested).not.toContain(14);
        });

        it('should restrict to safe voicings when soloist is active', () => {
            _playback.bandIntensity = 0.8;
            _soloist.enabled = true;
            _soloist.isResting = false;
            _soloist.notesInPhrase = 5; // Busy

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);

            const chord = { rootMidi: 60, intervals: [0, 4, 7, 14, 18], sectionId: 's1', beats: 4 }; // 9, #11

            getHarmonyNotes(getState(), chord, null, 0, 60, 'smart', 0);

            const requested = getLastRequestedIntervals();
            expect(requested).not.toContain(14); // 9th
            expect(requested).not.toContain(18); // #11

            // In Funk with bass enabled, the root is now removed to preserve space
            if (_playback.practiceMode || _bass.enabled) {
                expect(requested).not.toContain(0);
            } else {
                expect(requested).toContain(0);
            }

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
            _groove.genreFeel = 'Funk';

            // 1. Low Intensity -> Fewer notes
            _playback.bandIntensity = 0.2;
            let lowIntNotesCount = 0;
            for (let i = 0; i < 16; i++) {
                const n = getHarmonyNotes(getState(), chord, null, i, 60, 'smart', i);
                if (n.length > 0) {
                    lowIntNotesCount++;
                }
            }

            // 2. High Intensity -> More notes
            _playback.bandIntensity = 0.9;
            let highIntNotesCount = 0;
            for (let i = 0; i < 16; i++) {
                const n = getHarmonyNotes(getState(), chord, null, i, 60, 'smart', i);
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
                const res = getHarmonyNotes(getState(), chordC, null, s, 60, 'smart', s);
                if (res.length > 0) {
                    notes.push({ step: s, notes: res });
                }
            }
            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].notes[0]).toHaveProperty('midi');
            expect(notes[0].notes[0]).toHaveProperty('velocity');
        });

        it('should scale density with intensity', () => {
            _playback.bandIntensity = 0.1;
            _harmony.complexity = 0.1;
            const lowNotes = getHarmonyNotes(getState(), chordC, null, 0, 60, 'smart', 0);

            _playback.bandIntensity = 1.0;
            _harmony.complexity = 1.0;
            const highNotes = getHarmonyNotes(getState(), chordC, null, 0, 60, 'smart', 0);

            expect(highNotes.length).toBeGreaterThanOrEqual(lowNotes.length);
        });
    });

    describe('Soloist Awareness (Integration)', () => {
        it('should play stabs when soloist is resting', () => {
            _soloist.isResting = true;
            _groove.genreFeel = 'Funk';
            let stabFound = false;
            for (let s = 1; s < 16; s++) {
                const res = getHarmonyNotes(getState(), chordC, null, s, 60, 'smart', s);
                if (res.length > 0 && res[0].durationSteps < 4) {
                    stabFound = true;
                    break;
                }
            }
            expect(stabFound).toBe(true);
        });

        it('should use sparse comping when soloist is busy', () => {
            _soloist.isResting = false;
            _soloist.notesInPhrase = 10;
            _playback.bandIntensity = 0.5; // Moderate intensity

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);

            const res = getHarmonyNotes(getState(), chordC, null, 0, 60, 'smart', 0);
            expect(res.length).toBeGreaterThan(0);
            // In new logic, downbeat duration is 3 (less than 4-step pad)
            expect(res[0].durationSteps).toBeLessThan(4);

            // At 0.5 intensity, it should skip some non-essential hits when soloist is busy
            // (needed = 0.4 + 0.2 = 0.6 for medium hits, 0.5 < 0.6)
            const offbeatRes = getHarmonyNotes(getState(), chordC, null, 3, 60, 'smart', 3);
            if (offbeatRes.length > 0) {
                // If it does play, it should be very short
                expect(offbeatRes[0].durationSteps).toBeLessThan(2);
            }
            randomSpy.mockRestore();
        });
    });

    describe('Genre-Specific Rhythms (Integration)', () => {
        it('should use Jazz rhythms in Jazz genre', () => {
            _groove.genreFeel = 'Jazz';
            _soloist.isResting = true;

            let hitFound = false;
            for (let s = 0; s < 16; s++) {
                const res = getHarmonyNotes(getState(), chordC, null, s, 60, 'smart', s);
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
                if (getHarmonyNotes(getState(), sectionA1, null, s, 60, 'smart', s).length > 0) {
                    hits1.push(s);
                }
            }

            const hits2 = [];
            for (let s = 0; s < 16; s++) {
                if (getHarmonyNotes(getState(), sectionA2, null, s, 60, 'smart', s).length > 0) {
                    hits2.push(s);
                }
            }

            expect(hits1).toEqual(hits2);
        });
    });

    describe('Practice Mode', () => {
        it('should reserve bass register (stay above 52) when practiceMode is ON', () => {
            _playback.practiceMode = true;
            _bass.enabled = false;
            _groove.genreFeel = 'Rock';
            _harmony.style = 'smart';

            const chord = { rootMidi: 48, intervals: [0, 4, 7], sectionId: 'p1', beats: 4 }; // Low C
            const notes = getHarmonyNotes(getState(), chord, null, 0, 60, 'smart', 0);

            notes.forEach((n) => {
                expect(n.midi).toBeGreaterThanOrEqual(52);
            });
        });

        it('should perform rootless reduction in Funk when practiceMode is ON even if bass is disabled', () => {
            _playback.practiceMode = true;
            _bass.enabled = false;
            _groove.genreFeel = 'Funk';

            const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionId: 'p2', beats: 4 };
            getHarmonyNotes(getState(), chord, null, 0, 60, 'smart', 0);

            const requested = getLastRequestedIntervals();
            expect(requested).not.toContain(0);
        });

        it('should keep half-diminished grounding tones in Jazz practice mode', () => {
            _playback.practiceMode = true;
            _bass.enabled = false;
            _groove.genreFeel = 'Jazz';

            const chord = {
                rootMidi: 64,
                intervals: [0, 3, 6, 10],
                quality: 'halfdim',
                sectionId: 'p2a',
                beats: 4,
            };
            getHarmonyNotes(getState(), chord, null, 0, 64, 'smart', 0);

            const requested = getLastRequestedIntervals();
            expect(requested).toContain(0);
            expect(requested).toContain(6);
            expect(requested).toContain(10);
        });

        it('should ALWAYS reserve bass register (stay above 52) given new safety rules', () => {
            _playback.practiceMode = false;
            _bass.enabled = false;
            _groove.genreFeel = 'Rock';

            const chord = { rootMidi: 40, intervals: [0, 4, 7], sectionId: 'p3', beats: 4 };
            // Use anchor of 40 so it stays low
            const notes = getHarmonyNotes(getState(), chord, null, 0, 40, 'smart', 0);

            // In new logic, 52 is the absolute minimum safetyFloor
            notes.forEach((n) => {
                expect(n.midi).toBeGreaterThanOrEqual(52);
            });
        });
    });

    describe('Soloist Hook Reinforcement', () => {
        it('should reinforce (latch onto) the soloist hook at high intensity in Ska', () => {
            _soloist.enabled = true;
            _soloist.sharedHookBuffer = [{ step: 0 }];
            _groove.genreFeel = 'Ska-Punk';
            _playback.bandIntensity = 0.8;

            const chord = {
                rootMidi: 60,
                symbol: 'Cmaj7',
                quality: 'major7',
                beats: 4,
                sectionId: 'A',
            };
            const soloistNote = { midi: 72, freq: 523.25 };

            const notes = getHarmonyNotes(getState(), chord, null, 0, 60, 'smart', 0, soloistNote);

            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].isLatched).toBe(true);
            expect(notes.length).toBeGreaterThanOrEqual(2);
            expect(notes[0].velocity).toBeGreaterThan(0.35);
        });

        it('should apply Harmonic Bloom (increased polyphony and velocity) on anchors', () => {
            _soloist.enabled = true;
            _playback.bandIntensity = 0.8;
            _playback.currentLoopCount = 0;
            _soloist.sessionSeed = {
                notes: [{ step: 0, midi: 72, isAnchor: true }],
                loopLengthSteps: 16,
            };

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);

            // 1. Check an anchor hit (should bloom)
            const bloomNotes = getHarmonyNotes(getState(), chordC, null, 0, 60, 'smart', 0);
            expect(bloomNotes.length).toBeGreaterThan(2); // Polyphony boost
            expect(bloomNotes[0].velocity).toBeGreaterThan(0.4); // Velocity boost (with polyphony comp)

            // 2. Check a non-anchor hit (standard comping suppressed in Chorus 1)
            const standardNotes = getHarmonyNotes(getState(), chordC, null, 4, 60, 'smart', 4);
            expect(standardNotes.length).toBe(0);

            randomSpy.mockRestore();
        });

        it('should trigger Hype Man (Anticipation) hits before anchors', () => {
            _soloist.enabled = true;
            _playback.bandIntensity = 0.8;
            _playback.currentLoopCount = 0;
            _soloist.sessionSeed = {
                notes: [{ step: 8, midi: 72, isAnchor: true }], // Anchor on beat 3
                loopLengthSteps: 16,
            };

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);

            // Step 6 should anticipate the anchor on Step 8
            const hypeNotes = getHarmonyNotes(getState(), chordC, null, 6, 60, 'smart', 6);
            expect(hypeNotes.length).toBeGreaterThan(0);
            expect(hypeNotes[0].isLatched).toBe(true);

            randomSpy.mockRestore();
        });
    });
});
