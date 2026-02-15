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
        chords: { enabled: true, octave: 60, density: 'standard', pianoRoots: false },
        playback: { bandIntensity: 0.5, bpm: 180, audio: { currentTime: 0 } },
        arranger: { 
            key: 'Bb', 
            isMinor: false,
            progression: [],
            totalSteps: 0,
            stepMap: [],
            timeSignature: '4/4'
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
        NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11],
        INTERVAL_TO_NNS: ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'],
        INTERVAL_TO_ROMAN: ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII']
    };
});

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { getSoloistNote } from '../../public/soloist.js';
import { getScaleForChord } from '../../public/theory-scales.js';
import { getBassNote } from '../../public/bass.js';
import { validateProgression } from '../../public/chords.js';
import { dispatch, getState, storage } from '../../public/state.js';
const { arranger } = getState();
import { KEY_ORDER, ROMAN_VALS } from '../../public/config.js';

describe('Jazz Standard Test: Rhythm Changes (Single Key)', () => {
    
    const rootKey = 'Bb';

    describe(`Key of ${rootKey}`, () => {
        beforeEach(() => {
            arranger.key = rootKey;
            arranger.isMinor = false;
            arranger.sections = [
                { label: "A", value: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I" },
                { label: "B", value: "III7 | III7 | VI7 | VI7 | II7 | II7 | V7 | V7" }
            ];
            validateProgression();
        });

        it('should correctly parse the A section progression', () => {
            const progression = arranger.progression;
            const rootIdx = KEY_ORDER.indexOf(rootKey);

            // First chord should be Imaj7 (e.g. Bbmaj7)
            // Roman 'I' defaults to Major triad, but context often implies Maj7 in Jazz.
            // Our parser treats 'I' as Major Triad unless 'maj7' is specified?
            // Wait, in previous test for Bb, we asserted 'Bb' name.
            // Let's verify root pitch class.
            expect(progression[0].rootMidi % 12).toBe(rootIdx);

            // Second chord: vi7
            const viIdx = (rootIdx + 9) % 12; // Major 6th is 9 semitones
            expect(progression[1].rootMidi % 12).toBe(viIdx);
            expect(progression[1].quality).toBe('minor');
            expect(progression[1].is7th).toBe(true);
        });

        it('should select appropriate scales for the I-vi-ii-V turnaround', () => {
            const progression = arranger.progression;

            // I -> Ionian
            const scaleI = getScaleForChord(progression[0], progression[1], 'bird');
            expect(scaleI).toEqual([0, 2, 4, 5, 7, 9, 11]);

            // vi7 -> Aeolian (Diatonic to Major)
            const scaleVI7 = getScaleForChord(progression[1], progression[2], 'bird');
            // Aeolian intervals: 0, 2, 3, 5, 7, 8, 10 -> Refactor favors Dorian (9) in Jazz
            expect(scaleVI7).toEqual([0, 2, 3, 5, 7, 9, 10]);

            // ii7 -> Dorian
            const scaleII7 = getScaleForChord(progression[2], progression[3], 'bird');
            // Dorian intervals: 0, 2, 3, 5, 7, 9, 10
            expect(scaleII7).toEqual([0, 2, 3, 5, 7, 9, 10]);
        });

        it('should handle the Bridge (B section) secondary dominants', () => {
            const bSectionStart = arranger.progression.find(c => c.sectionLabel === 'B');
            const iii7 = bSectionStart;

            // III7 (e.g. D7 in Bb)
            // Root should be +4 semitones from key root
            const rootIdx = KEY_ORDER.indexOf(rootKey);
            const iiiIdx = (rootIdx + 4) % 12;
            expect(iii7.rootMidi % 12).toBe(iiiIdx);
            expect(iii7.quality).toBe('7');

            // Mixolydian scale
            const scaleD7 = getScaleForChord(iii7, null, 'bird');
            expect(scaleD7).toEqual([0, 2, 4, 5, 7, 9, 10]);
        });

        it('should generate a walking bass line that hits roots on beat 1', () => {
            // Test first 4 bars of A section
            for (let bar = 0; bar < 4; bar++) {
                const step = bar * 16;
                const chordEntry = arranger.stepMap.find(m => step >= m.start && step < m.end);
                const currentChord = chordEntry.chord;
                const nextChord = arranger.stepMap.find(m => (step + 16) >= m.start && (step + 16) < m.end)?.chord;

                // Note: previousFreq needs to be roughly in range.
                // Let's pass a safe previous frequency (Root of key, octave 2)
                const keyRootFreq = 440 * Math.pow(2, (KEY_ORDER.indexOf(rootKey) + 24 - 69) / 12);
                
                const result = getBassNote(currentChord, nextChord, 0, keyRootFreq, 38, 'quarter', 0, step, 0);
                expect(result.midi % 12).toBe(currentChord.rootMidi % 12);
            }
        });

        it('should use rootless voicings for the jazz comping when enabled', () => {
            const progression = arranger.progression;

            // vi7
            const vi7 = progression[1];
            // Rootless Minor 7: b3, 5, b7 -> [3, 7, 10]
            expect(vi7.intervals).toEqual([3, 7, 10]);
            expect(vi7.intervals).not.toContain(0);

            // V7 (Index 3: I vi ii V)
            const v7 = progression[3];
            // Rootless Dominant 7: 3, 5, b7 -> [4, 7, 10]
            expect(v7.intervals).toEqual([4, 7, 10]);
            expect(v7.intervals).not.toContain(0);
        });

        it('should maintain voice leading across the fast-moving A section', () => {
            const progression = arranger.progression.filter(c => c.sectionLabel === 'A');
            let lastAvg = null;

            progression.forEach((chord) => {
                const currentMidis = chord.freqs.map(f => Math.round(12 * Math.log2(f / 440) + 69));
                const currentAvg = currentMidis.reduce((a, b) => a + b, 0) / currentMidis.length;

                if (lastAvg !== null) {
                    const drift = Math.abs(currentAvg - lastAvg);
                    expect(drift).toBeLessThan(13);
                }
                lastAvg = currentAvg;
            });
        });
    });
});
