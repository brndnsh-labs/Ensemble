import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global config
vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: { 
            enabled: true, busySteps: 0, currentPhraseSteps: 0, notesInPhrase: 0,
            qaState: 'Question', isResting: false, contourSteps: 0,
            melodicTrend: 'Static', tension: 0, motifBuffer: [], hookBuffer: [],
            lastFreq: 440, hookRetentionProb: 0.5, mode: 'guitar',
            sessionSteps: 1000
        },
        chords: { enabled: true, octave: 60, density: 'standard', pianoRoots: true },
        playback: { bandIntensity: 0.5, bpm: 120, audio: { currentTime: 0 }, intent: { soloistMod: 0 } },
        arranger: { 
            key: 'C', 
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
        dispatch: vi.fn(),
        sb_enabled: true
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
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' }
        },
        ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 },
        NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11],
        INTERVAL_TO_NNS: ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'],
        INTERVAL_TO_ROMAN: ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII']
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getScaleForChord } from '../../public/theory-scales.js';
import { getBassNote } from '../../public/bass.js';
import { validateProgression } from '../../public/chords.js';
import { getState } from '../../public/state.js';
const { arranger } = getState();

describe('Multi-Key Integration: Autumn Leaves', () => {
    // Autumn Leaves progression in Roman Numerals (Relative to Major Key)
    // ii - V - I - IV | ii/relMin - V/relMin - i/relMin
    // iim7 | V7 | Imaj7 | IVmaj7 | viiø7 | III7alt | vim7
    // Note: viiø7 of Major is the iiø7 of the Relative Minor. 
    // III7 is the V7 of the Relative Minor.
    // vi is the Relative Minor tonic.
    
    // Explicit Roman Numeral Progression
    const ROMAN_PROG = 'iim7 | V7 | Imaj7 | IVmaj7 | viiø7 | III7alt | vim7';
    const TEST_KEY = 'Bb'; // Standard key (Gm relative)

    describe(`Key of ${TEST_KEY}`, () => {
        beforeEach(() => {
            arranger.key = TEST_KEY;
            arranger.isMinor = false;
            arranger.sections = [
                { id: 'A', label: 'A', value: ROMAN_PROG }
            ];
            validateProgression();
        });

        it('should successfully parse progression without errors', () => {
            expect(arranger.progression.length).toBeGreaterThan(0);
            arranger.progression.forEach(chord => {
                expect(chord.rootMidi).not.toBeNaN();
                expect(chord.intervals.length).toBeGreaterThan(0);
            });
        });

        it('should identify correct relative scales', () => {
            const p = arranger.progression;
            // 1. iim7 (Dorian)
            const scaleIi = getScaleForChord(p[0], p[1], 'bird');
            // Dorian intervals: 0, 2, 3, 5, 7, 9, 10
            expect(scaleIi).toEqual([0, 2, 3, 5, 7, 9, 10]);

            // 2. V7 (Mixolydian)
            const scaleV = getScaleForChord(p[1], p[2], 'bird');
            // Mixolydian intervals: 0, 2, 4, 5, 7, 9, 10
            expect(scaleV).toEqual([0, 2, 4, 5, 7, 9, 10]);

            // 5. viiø7 (Locrian) - ii of relative minor
            const scaleVii = getScaleForChord(p[4], p[5], 'bird');
            // Locrian intervals: 0, 1, 3, 5, 6, 8, 10
            expect(scaleVii).toEqual([0, 1, 3, 5, 6, 8, 10]);

            // 6. III7alt (Altered) - V of relative minor
            const scaleIII = getScaleForChord(p[5], p[6], 'bird');
            // Altered intervals: 0, 1, 3, 4, 6, 8, 10
            expect(scaleIII).toEqual([0, 1, 3, 4, 6, 8, 10]);
        });

        it('should generate valid bass notes within register', () => {
            const p = arranger.progression;
            // Check first measure bass note
            const result = getBassNote(p[0], p[1], 0, 55, 38, 'quarter', 0, 0, 0);
            expect(result).not.toBeNull();
            expect(result.midi).toBeGreaterThanOrEqual(28); // E1
            expect(result.midi).toBeLessThanOrEqual(60);    // C4 (generous upper bound)

            // Bass root should match chord root pitch class
            expect(result.midi % 12).toBe(p[0].rootMidi % 12);
        });
    });
});
