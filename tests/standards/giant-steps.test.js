/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: { 
            enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
            qaState: 'Question', isResting: false, contourSteps: 0,
            melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
            lastFreq: 440, hookRetentionProb: 0.5, doubleStops: true,
            sessionSteps: 1000
        },
        chords: { enabled: true, octave: 60, density: 'standard', pianoRoots: true },
        playback: { bandIntensity: 0.5, bpm: 220, audio: { currentTime: 0 } },
        arranger: { 
            key: 'B', 
            isMinor: false,
            progression: [],
            totalSteps: 0,
            stepMap: [],
            timeSignature: '4/4',
            sections: []
        },
        groove: { genreFeel: 'Jazz' },
        bass: { enabled: true },
        harmony: { enabled: false },
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn()
    };
    return {
        ...mockState,
        getState: () => mockState
    };
});

vi.mock('../../public/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] }
        },
        ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 }
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getScaleForChord } from '../../public/theory-scales.js';
import { getBassNote } from '../../public/bass.js';
import { validateProgression } from '../../public/chords.js';
import { getState } from '../../public/state.js';
const { arranger } = getState();

describe('Jazz Standard Test: Giant Steps (Single Key)', () => {
    
    // Original in B Major
    const TEST_KEY = 'B';
    const BASE_PROG = "Bmaj7 D7 | Gmaj7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 Bb7 | Ebmaj7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 | C#m7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | C#m7 F#7";

    describe(`Key of ${TEST_KEY}`, () => {
        beforeEach(() => {
            arranger.key = TEST_KEY;
            arranger.isMinor = false;

            arranger.sections = [
                { id: 'Main', label: 'Main', value: BASE_PROG }
            ];
            validateProgression();
        });

        it('should select correct scales for rapid major-third key shifts', () => {
            const progression = arranger.progression;

            // 1. Imaj7 (Start)
            // Scale should be Ionian (Major Scale)
            const scaleI = getScaleForChord(progression[0], progression[1], 'bird');
            // Ionian: 0, 2, 4, 5, 7, 9, 11
            expect(scaleI).toEqual([0, 2, 4, 5, 7, 9, 11]);

            // 2. V7 of bVI (Original D7 -> Gmaj7)
            // In B: D7 is V7 of G. G is bVI of B.
            // It's a modulation to a Major 3rd DOWN (or min 6th UP).
            const scaleVofKey2 = getScaleForChord(progression[1], progression[2], 'bird');
            expect(scaleVofKey2).toEqual([0, 2, 4, 5, 7, 9, 10]); // Mixolydian

            // 3. Imaj7 of Key 2 (Original Gmaj7)
            const key2I = progression[2];
            // Should act as local Tonic (Ionian) -> Refactor defaults to Lydian for non-diatonic Major
            const scaleKey2I = getScaleForChord(key2I, progression[3], 'bird');
            expect(scaleKey2I).toEqual([0, 2, 4, 6, 7, 9, 11]);
        });

        it('should maintain voice leading through "Coltrane Changes"', () => {
            const progression = arranger.progression;
            let lastAvg = null;

            progression.forEach((chord) => {
                const currentMidis = chord.freqs.map(f => Math.round(12 * Math.log2(f / 440) + 69));
                const currentAvg = currentMidis.reduce((a, b) => a + b, 0) / currentMidis.length;

                if (lastAvg !== null) {
                    const drift = Math.abs(currentAvg - lastAvg);
                    // Even with large jumps, the engine should keep voicings close (under 7 semitones)
                    expect(drift).toBeLessThan(7);
                }
                lastAvg = currentAvg;
            });
        });

        it('should generate a walking bass line that handles two chords per bar', () => {
            let prevMidi = 38;

            for (let bar = 0; bar < 4; bar++) {
                for (let beat = 0; beat < 4; beat++) {
                    const globalStep = (bar * 16) + (beat * 4);
                    const chordEntry = arranger.stepMap.find(m => globalStep >= m.start && globalStep < m.end);
                    const currentChord = chordEntry.chord;
                    const nextChord = arranger.stepMap.find(m => (globalStep + 4) >= m.start && (globalStep + 4) < m.end)?.chord;

                    // Ensure we have a valid previous freq roughly in bass range
                    const prevFreq = 440 * Math.pow(2, (prevMidi - 69) / 12);

                    const result = getBassNote(currentChord, nextChord, beat, prevFreq, 38, 'quarter', 0, globalStep, globalStep - chordEntry.start);

                    expect(result).not.toBeNull();
                    const midi = result.midi;

                    // Beat 1 of ANY chord should be root
                    if (globalStep === chordEntry.start) {
                        expect(midi % 12).toBe(currentChord.rootMidi % 12);
                    }

                    prevMidi = midi;
                }
            }
        });

        it('should select Phrygian Dominant when anticipating minor resolutions', () => {
            // We need to find a ii-V going to minor.
            // In Giant Steps, most are Major.
            // But let's verify if there is a minor resolution.
            // "C#m7 F#7 | Bmaj7" -> II-V-I Major.
            // There are NO minor resolutions in Giant Steps structure usually.
            // The previous test "forced" a minor resolution context.
            // Let's replicate that force logic dynamically.

            // Find a V7 chord.
            // Original: Am7 D7 -> Gmaj7. D7 is V7.
            // Let's pick the 2nd chord (index 1) which is V7 of Key 2.

            const v7 = arranger.progression[1];

            // Create a hypothetical minor target
            // Target root should be perfect 4th above V7 root.
            // V7 root = v7.rootMidi.
            // Minor root = v7.rootMidi + 5.
            const minorRootMidi = v7.rootMidi + 5;
            const minorTarget = { rootMidi: minorRootMidi, quality: 'minor', intervals: [0, 3, 7] };

            const scale = getScaleForChord(v7, minorTarget, 'bird');
            // Phrygian Dominant: [0, 1, 4, 5, 7, 8, 10]
            expect(scale).toEqual([0, 1, 4, 5, 7, 8, 10]);
        });
    });
});
