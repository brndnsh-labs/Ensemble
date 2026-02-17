/* eslint-disable */
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
        playback: { bandIntensity: 0.5, bpm: 120, audio: { currentTime: 0 }, intent: { soloistMod: 0 }, intent: { soloistMod: 0 }, intent: { soloistMod: 0 } },
        arranger: { 
            key: 'Bb', 
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
        ROMAN_VALS: { 'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11 },
        NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11]
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getSoloistNote } from '../../public/soloist.js';
import { getScaleForChord } from '../../public/theory-scales.js';
import { getBassNote } from '../../public/bass.js';
import { validateProgression } from '../../public/chords.js';
import { dispatch, getState, storage } from '../../public/state.js';
const { arranger, playback, chords, bass, soloist, harmony, groove, vizState, midi } = getState();

describe('Jazz Standard Test: Stella by Starlight', () => {
    
    beforeEach(() => {
        arranger.key = 'Bb';
        arranger.isMinor = false;
        // Full 32-bar form
        arranger.sections = [
            { id: 'A', label: 'A', value: "Em7b5 | A7alt | Cm7 | F7 | Fm7 | Bb7 | Ebmaj7 | Ab7" },
            { id: 'B', label: 'B', value: "Bbmaj7 | Em7b5 A7 | Dm7b5 | G7alt | Cm7b5 | F7alt | Bbmaj7 | Fm7 Bb7" },
            { id: 'C', label: 'C', value: "Ebmaj7 | Ab7#11 | Bbmaj7 | Em7b5 A7alt | Dm7b5 | G7alt | Cm7b5 | F7alt" },
            { id: 'D', label: 'D', value: "Bbmaj7 | Em7b5 A7alt | Dm7b5 | G7alt | Cm7b5 | F7alt | Bbmaj7 | Cm7 F7" }
        ];
        validateProgression();
        
        soloist.isResting = false;
        soloist.currentPhraseSteps = 0;
        soloist.notesInPhrase = 0;
    });

    it('should select appropriate scales for the complex harmonic shifts', () => {
        const progression = arranger.progression;
        
        // 1. Em7b5 (iiø of Dm) -> Locrian
        const scaleEm = getScaleForChord(progression[0], progression[1], 'bird');
        expect(scaleEm).toEqual([0, 1, 3, 5, 6, 8, 10]);

        // 2. A7alt (V7 of Dm) -> Altered
        const scaleA = getScaleForChord(progression[1], progression[2], 'bird');
        expect(scaleA).toEqual([0, 1, 3, 4, 6, 8, 10]);

        // 3. Ab7 (bVII7 / Backdoor Dominant) -> Lydian Dominant
        const scaleAb = getScaleForChord(progression[7], null, 'bird');
        expect(scaleAb).toEqual([0, 2, 4, 6, 7, 9, 10]);
    });

    it('should generate a walking bass line that handles non-diatonic root movements', () => {
        const progression = arranger.progression;
        let prevMidi = 38; // Bb1

        for (let bar = 0; bar < 8; bar++) {
            const step = bar * 16;
            const chordEntry = arranger.stepMap.find(m => step >= m.start && step < m.end);
            const currentChord = chordEntry.chord;
            const nextChord = arranger.stepMap.find(m => (step + 16) >= m.start && (step + 16) < m.end)?.chord;

            for (let beat = 0; beat < 4; beat++) {
                const globalStep = step + (beat * 4);
                const result = getBassNote(currentChord, nextChord, beat, 440, 38, 'quarter', 0, globalStep, beat * 4);
                
                expect(result).not.toBeNull();
                const midi = result.midi;

                // Beat 1: Root check
                if (beat === 0) {
                    expect(midi % 12).toBe(currentChord.rootMidi % 12);
                }

                // Register Check
                expect(midi).toBeGreaterThanOrEqual(28); // E1
                expect(midi).toBeLessThanOrEqual(55);    // G3

                prevMidi = midi;
            }
        }
    });

    it('should maintain voice leading for rootless voicings through the progression', () => {
        const progression = arranger.progression;
        let lastAvg = null;

        progression.forEach((chord) => {
            const currentMidis = chord.freqs.map(f => Math.round(12 * Math.log2(f / 440) + 69));
            const currentAvg = currentMidis.reduce((a, b) => a + b, 0) / currentMidis.length;

            if (lastAvg !== null) {
                const drift = Math.abs(currentAvg - lastAvg);
                expect(drift).toBeLessThan(12);
            }
            lastAvg = currentAvg;
        });
    });

    it('should select correct intervals for m7b5 (Half-Diminished) chord', () => {
        const em7b5 = arranger.progression[0];
        // Em7b5 root is E (MIDI 40/52/64)
        // Intervals: 0, 3, 6, 10 (Root, b3, b5, b7)
        // Rootless usually: b3, b5, b7 -> 3, 6, 10
        expect(em7b5.intervals).toContain(3);
        expect(em7b5.intervals).toContain(6);
        expect(em7b5.intervals).toContain(10);
    });
});
