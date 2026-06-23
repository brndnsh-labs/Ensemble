// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 0.5, bpm: 120 },
        groove: { genreFeel: 'Rock' },
        harmony: { enabled: true, style: 'smart', volume: 0.5, complexity: 0.5, lastMidis: [] },
        soloist: makeSoloistMock({
            enabled: false,
            busySteps: 0,
            notesInPhrase: 0,
            isResting: true,
        }),
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

            // soloistResting/soloistNotesInPhrase are now read from the coordination context (S4).
            // Soloist is enabled but resting — supply soloistResting:true so the engine takes
            // the `else if` / guide-tone path rather than the busy-soloist voicing-reduction path.
            getHarmonyNotes(getState(), chord, null, 0, 60, 'smart', 0, null, {
                soloistResting: true,
                soloistNotesInPhrase: 0,
            });

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

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);

            const chord = { rootMidi: 60, intervals: [0, 4, 7, 14, 18], sectionId: 's1', beats: 4 }; // 9, #11

            // Soloist-busy signal arrives via the coordination contract (S4) — drive it
            // explicitly rather than relying on engine-internal session state.
            getHarmonyNotes(getState(), chord, null, 0, 60, 'smart', 0, null, {
                soloistResting: false,
                soloistNotesInPhrase: 5,
            });

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

        it('should skip standard support on tension chords when accompaniment is already hitting', () => {
            _groove.genreFeel = 'Rock';
            _playback.bandIntensity = 0.8;
            _soloist.enabled = false;

            const chord = {
                rootMidi: 60,
                intervals: [0, 4, 7, 10, 13],
                quality: '7b9',
                sectionId: 'tension-yield',
                beats: 4,
            };

            const notes = getHarmonyNotes(getState(), chord, null, 0, 60, 'smart', 0, null, {
                accompanimentHit: true,
            });

            expect(notes).toEqual([]);
        });

        it('should thin tension-chord support to compact guide-tone voicings when it plays alone', () => {
            _groove.genreFeel = 'Rock';
            _playback.bandIntensity = 0.8;
            _soloist.enabled = false;

            const chord = {
                rootMidi: 60,
                intervals: [0, 4, 7, 10, 13],
                quality: '7b9',
                sectionId: 'tension-thin',
                beats: 4,
            };

            getHarmonyNotes(getState(), chord, null, 0, 60, 'smart', 0);

            const requested = getLastRequestedIntervals();
            expect(requested).toContain(4);
            expect(requested).toContain(10);
            expect(requested).not.toContain(13);
            expect(requested.length).toBeLessThanOrEqual(3);
        });
    });

    describe('Rhythmic Comping', () => {
        it('should generate patterns for Jazz', () => {
            const pattern = generateCompingPattern('jazz', 12345);
            expect(pattern.length).toBe(32);
            expect(pattern.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
        });

        it('should generate patterns for Funk', () => {
            const pattern = generateCompingPattern('funk16', 12345);
            expect(pattern.length).toBe(32);
            expect(pattern[0]).toBe(1);
            const hasDynamics = pattern.some((v) => v > 1);
            expect(hasDynamics).toBe(true);
        });

        it('should return 32-step pattern for Reggae', () => {
            const pattern = generateCompingPattern('reggae', 12345);
            expect(pattern.length).toBe(32);
            expect(pattern[4]).toBe(1);
            expect(pattern[12]).toBe(1);
            expect(pattern[0]).toBe(0);
        });

        // #711 (B12) — the Bossa branch used raw indices (0,6,12,18,24,30) valid
        // only for a 4/4 (spm*2=32) array; in 3/4 (spm*2=24) the [24]/[30] writes
        // grew the array and broke every `step % length`. Now expressed in beat
        // terms with bounds guards.
        it('Bossa reproduces the authentic 4/4 figure', () => {
            const pattern = generateCompingPattern('bossa', 1, { beats: 4, stepsPerBeat: 4 });
            expect(pattern.length).toBe(32);
            const onsets = pattern.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
            expect(onsets).toEqual([0, 6, 12, 18, 24, 30]);
        });

        it('Bossa does not overrun its array in 3/4 (B12)', () => {
            const pattern = generateCompingPattern('bossa', 1, { beats: 3, stepsPerBeat: 4 });
            // spm = 3*4 = 12; the array is spm*2 = 24 and must NOT grow.
            expect(pattern.length).toBe(24);
            const onsets = pattern.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
            expect(onsets.length).toBeGreaterThan(0);
            expect(onsets.every((i) => i >= 0 && i < 24)).toBe(true);
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
            _groove.genreFeel = 'Funk';
            let stabFound = false;
            // Soloist-rest signal arrives via the coordination contract (S4).
            const coord = { soloistResting: true, soloistNotesInPhrase: 0 };
            for (let s = 1; s < 16; s++) {
                const res = getHarmonyNotes(
                    getState(),
                    chordC,
                    null,
                    s,
                    60,
                    'smart',
                    s,
                    null,
                    coord,
                );
                if (res.length > 0 && res[0].durationSteps < 4) {
                    stabFound = true;
                    break;
                }
            }
            expect(stabFound).toBe(true);
        });

        it('should use sparse comping when soloist is busy', () => {
            _playback.bandIntensity = 0.5; // Moderate intensity

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);

            // Soloist-busy signal arrives via the coordination contract (S4).
            const coord = { soloistResting: false, soloistNotesInPhrase: 10 };
            const res = getHarmonyNotes(getState(), chordC, null, 0, 60, 'smart', 0, null, coord);
            expect(res.length).toBeGreaterThan(0);
            // In new logic, downbeat duration is 3 (less than 4-step pad)
            expect(res[0].durationSteps).toBeLessThan(4);

            // At 0.5 intensity, it should skip some non-essential hits when soloist is busy
            // (needed = 0.4 + 0.2 = 0.6 for medium hits, 0.5 < 0.6)
            const offbeatRes = getHarmonyNotes(
                getState(),
                chordC,
                null,
                3,
                60,
                'smart',
                3,
                null,
                coord,
            );
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

        // why: epic-harmony-polish S3 (review P0). selectGroundedIntervals fires
        // here (Jazz + practiceMode + tension quality satisfies
        // shouldPreferGroundedPracticeVoicing). For 7b9 the characteristic
        // alteration (b9 = interval 13) IS the chord identity; if a reorder
        // ever evicted it in favor of the perfect 5th, the chord would emit a
        // plain dominant 7 instead. This test guards bucket-order regressions.
        it('should preserve the b9 in 7b9 voicings in Jazz practice mode', () => {
            _playback.practiceMode = true;
            _bass.enabled = false;
            _groove.genreFeel = 'Jazz';

            const chord = {
                rootMidi: 60,
                intervals: [0, 4, 7, 10, 13],
                quality: '7b9',
                sectionId: 'p2b9',
                beats: 4,
            };
            getHarmonyNotes(getState(), chord, null, 0, 60, 'smart', 0);

            const requested = getLastRequestedIntervals();
            // The characteristic b9 must survive the grounded-voicing slice.
            // interval-class 1 (= pc(b9 above root) = 13 % 12 = 1)
            const hasB9 = requested.some((i: number) => ((i % 12) + 12) % 12 === 1);
            expect(hasB9).toBe(true);
            // Guide tones still present
            expect(requested).toContain(4);
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
            _soloist.session.memory.sharedHookBuffer = [{ step: 0 }];
            _groove.genreFeel = 'Ska';
            _playback.bandIntensity = 0.8;

            const chord = {
                rootMidi: 60,
                symbol: 'Cmaj7',
                quality: 'major7',
                beats: 4,
                sectionId: 'A',
            };
            const soloistNote = { midi: 72, freq: 523.25 };

            // S9(b): the shared-hook buffer now arrives via the coordination
            // contract (writer: tick-logic soloist producer block).
            const coord = { soloistSharedHookBuffer: [{ step: 0 }] };
            const notes = getHarmonyNotes(
                getState(),
                chord,
                null,
                0,
                60,
                'smart',
                0,
                soloistNote,
                coord,
            );

            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].isLatched).toBe(true);
            expect(notes.length).toBeGreaterThanOrEqual(2);
            expect(notes[0].velocity).toBeGreaterThan(0.35);
        });

        it('should apply Harmonic Bloom (increased polyphony and velocity) on anchors', () => {
            _soloist.enabled = true;
            _playback.bandIntensity = 0.8;
            _playback.currentLoopCount = 0;
            const seed = {
                notes: [{ step: 0, midi: 72, isAnchor: true }],
                loopLengthSteps: 16,
            };
            _soloist.session.seed = seed;

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);

            // S9(b): the soloist head seed now arrives via the coordination
            // contract (writer: tick-logic soloist producer block).
            const coord = { soloistSeed: seed };

            // 1. Check an anchor hit (should bloom)
            const bloomNotes = getHarmonyNotes(
                getState(),
                chordC,
                null,
                0,
                60,
                'smart',
                0,
                null,
                coord,
            );
            expect(bloomNotes.length).toBeGreaterThan(2); // Polyphony boost
            expect(bloomNotes[0].velocity).toBeGreaterThan(0.4); // Velocity boost (with polyphony comp)

            // 2. Check a non-anchor hit (standard comping suppressed in Chorus 1)
            const standardNotes = getHarmonyNotes(
                getState(),
                chordC,
                null,
                4,
                60,
                'smart',
                4,
                null,
                coord,
            );
            expect(standardNotes.length).toBe(0);

            randomSpy.mockRestore();
        });

        it('should still reinforce soloist anchors on tension chords', () => {
            _soloist.enabled = true;
            _playback.bandIntensity = 0.8;
            _playback.currentLoopCount = 0;
            const seed = {
                notes: [{ step: 0, midi: 72, isAnchor: true }],
                loopLengthSteps: 16,
            };
            _soloist.session.seed = seed;

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
            const chord = {
                rootMidi: 60,
                intervals: [0, 4, 7, 10, 13],
                quality: '7b9',
                sectionId: 'anchor-tension',
                beats: 4,
            };

            const notes = getHarmonyNotes(
                getState(),
                chord,
                null,
                0,
                60,
                'smart',
                0,
                { midi: 72 },
                // S9(b): head seed arrives via the coordination contract.
                { soloistActive: true, soloistSeed: seed },
            );

            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].isLatched).toBe(true);
            randomSpy.mockRestore();
        });

        it('should trigger Hype Man (Anticipation) hits before anchors', () => {
            _soloist.enabled = true;
            _playback.bandIntensity = 0.8;
            _playback.currentLoopCount = 0;
            const seed = {
                notes: [{ step: 8, midi: 72, isAnchor: true }], // Anchor on beat 3
                loopLengthSteps: 16,
            };
            _soloist.session.seed = seed;

            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);

            // S9(b): head seed arrives via the coordination contract.
            const coord = { soloistSeed: seed };
            // Step 6 should anticipate the anchor on Step 8
            const hypeNotes = getHarmonyNotes(
                getState(),
                chordC,
                null,
                6,
                60,
                'smart',
                6,
                null,
                coord,
            );
            expect(hypeNotes.length).toBeGreaterThan(0);
            expect(hypeNotes[0].isLatched).toBe(true);

            randomSpy.mockRestore();
        });
    });

    describe('#716 BB King horn section (Blues)', () => {
        // Mechanism guards (the FEEL is by-ear / audition). These pin the
        // call-and-response contract that won't change as the feel is tuned:
        // the section answers in the GAPS, it does not comp over the solo.
        function bluesStabSteps(coordination) {
            clearHarmonyMemory(getState());
            _groove.genreFeel = 'Blues';
            _harmony.style = 'smart';
            _soloist.enabled = false; // soloist laid out → horns fill the gaps
            const steps = [];
            for (let step = 0; step < 64; step++) {
                const notes = getHarmonyNotes(
                    getState(),
                    chordC,
                    null,
                    step,
                    60,
                    'smart',
                    step % 16,
                    null,
                    coordination,
                );
                if (notes?.some((n) => n && n.midi > 0 && !n.muted)) {
                    steps.push(step);
                }
            }
            return steps;
        }

        it('lays out entirely while the soloist is busy (answers in the gaps, never comps over the solo)', () => {
            const steps = bluesStabSteps({ soloistBusy: true, soloistActive: true });
            expect(steps.length).toBe(0);
        });

        it('punches sparse stabs only on the horn accents (&-of-2 / &-of-4) when the soloist lays out', () => {
            const steps = bluesStabSteps({ soloistBusy: false, soloistResting: true });
            // It does punch...
            expect(steps.length).toBeGreaterThan(0);
            // ...only on the classic horn accents (mStep 6 = &-of-2, 14 = &-of-4)...
            for (const s of steps) {
                expect([6, 14]).toContain(s % 16);
            }
            // ...and sparsely (it breathes — not every accent in every bar).
            expect(steps.length).toBeLessThan(8); // < 4 bars × 2 accents
        });

        it('is deterministic loop-to-loop (same gaps fire the same way each chorus)', () => {
            const a = bluesStabSteps({ soloistBusy: false, soloistResting: true });
            const b = bluesStabSteps({ soloistBusy: false, soloistResting: true });
            expect(b).toEqual(a);
        });
    });
});
