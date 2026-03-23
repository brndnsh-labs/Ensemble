/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state and global config
vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: {
            enabled: true,
            busySteps: 0,
            lastFreq: 440,
        },
        chords: {
            enabled: true,
            style: 'smart',
            density: 'standard',
            octave: 60,
            currentCell: new Array(16).fill(0),
        },
        playback: {
            bandIntensity: 0.5,
            complexity: 0.5,
            audio: { currentTime: 0 },
            intent: { anticipation: 0, syncopation: 0, layBack: 0 },
        },
        arranger: {
            key: 'Bb',
            isMinor: false,
            progression: [],
            totalSteps: 0,
            stepMap: [],
            timeSignature: '4/4',
        },
        groove: { genreFeel: 'Jazz' },
        bass: { enabled: true, lastFreq: 65.41 }, // C2
        harmony: { enabled: false },
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

vi.mock('../../public/config.js', async (_importOriginal) => {
    return {
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        ROMAN_VALS: { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 },
        NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11],
        INTERVAL_TO_ROMAN: {
            0: 'I',
            1: 'bII',
            2: 'II',
            3: 'bIII',
            4: 'III',
            5: 'IV',
            6: 'bV',
            7: 'V',
            8: 'bVI',
            9: 'VI',
            10: 'bVII',
            11: 'VII',
        },
        INTERVAL_TO_NNS: {
            0: '1',
            1: 'b2',
            2: '2',
            3: 'b3',
            4: '3',
            5: '4',
            6: 'b5',
            7: '5',
            8: 'b6',
            9: '6',
            10: 'b7',
            11: '7',
        },
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' },
        },
    };
});

vi.mock('../../public/utils.js', () => ({
    normalizeKey: (k) => {
        if (!k) {
            return 'C';
        }
        const map = {
            Bb: 'Bb',
            G: 'G',
            C: 'C',
            A: 'A',
            D: 'D',
            'F#': 'Gb',
            F: 'F',
            Eb: 'Eb',
            Ab: 'Ab',
        };
        // Handle lower case as well
        const norm = k.charAt(0).toUpperCase() + k.slice(1);
        return map[norm] || norm;
    },
    getFrequency: (m) => 440 * 2 ** ((m - 69) / 12),
    applyBluesBends: vi.fn(),
    getMidi: (f) => Math.round(12 * Math.log2(f / 440) + 69),
    calculateTimingOffset: vi.fn(() => 0),
}));

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getState } from '../../public/state.js';

const { arranger, playback, chords, bass, soloist, groove } = getState();

describe('Jazz Comping Integrity', () => {
    beforeEach(() => {
        arranger.key = 'Bb';
        arranger.isMinor = false;
        groove.genreFeel = 'Jazz';
        chords.style = 'smart';
        playback.bandIntensity = 0.5;
        soloist.busySteps = 0;
        bass.enabled = true;
        bass.lastFreq = 65.41; // C2 (Midi 36)

        compingState.lockedUntil = 0;
        compingState.lastChordIndex = -1;
        compingState.soloistActivity = 0;
    });

    it('should use shell voicings (3 & 7) for complex jazz chords at high intensity', () => {
        // Mock Stella by Starlight - Bar 2: A7alt
        const a7alt = {
            rootMidi: 57, // A2
            quality: '7alt',
            intervals: [4, 10, 13, 15, 18, 20], // Rootless Shells + Alts
            freqs: [220, 277.18, 349.23, 415.3].map((f) => f * 2), // High register freqs
            is7th: true,
            beats: 4,
        };

        playback.bandIntensity = 0.7; // Just above 0.6 but below 0.75 (octave doubling)

        // We need to force updateRhythmicIntent to pick a hit
        compingState.currentCell[0] = 1;
        compingState.lockedUntil = 100;

        const notes = getAccompanimentNotes(getState(), a7alt, 0, 0, 0, {
            isBeatStart: true,
            isGroupStart: true,
        });

        // For Jazz at intensity > 0.6 and complex chord, it should find shell intervals
        // A7alt: 3rd is C# (4), 7th is G (10).
        // Since it's shell-only logic, we expect exactly 2 notes if it triggers.
        expect(notes.length).toBe(2);

        const midis = notes.map((n) => n.midi % 12);
        expect(midis).toContain(1); // C# (1 % 12)
        expect(midis).toContain(7); // G (7 % 12)
    });

    it('should implement Call & Response by suppressing hits when soloist is busy', () => {
        const chord = {
            rootMidi: 60,
            quality: 'maj7',
            intervals: [4, 7, 11],
            freqs: [329.63, 392.0, 493.88],
            is7th: true,
            beats: 4,
        };

        // Soloist is shredding
        soloist.busySteps = 16;
        chords.style = 'smart';

        // We'll try many times to see if suppression hits
        let totalHits = 0;
        const iterations = 100;
        for (let i = 0; i < iterations; i++) {
            // Check a random step within a 16-step window
            const s = Math.floor(Math.random() * 16);
            compingState.lockedUntil = 0; // Force re-eval
            const notes = getAccompanimentNotes(getState(), chord, i * 16 + s, s, s, {
                isBeatStart: s % 4 === 0,
            });
            if (notes.some((n) => n.midi > 0 && !n.muted)) {
                totalHits++;
            }
        }

        // With 70% suppression probability and sparse patterns, totalHits should be low
        expect(totalHits).toBeLessThan(40);
    });

    it('should fill the space (active vibe) immediately after soloist stops', () => {
        const chord = {
            rootMidi: 60,
            quality: 'maj7',
            intervals: [4, 7, 11],
            freqs: [329.63, 392.0, 493.88],
            is7th: true,
            beats: 4,
        };

        // 1. Soloist was busy
        compingState.soloistActivity = 1;
        soloist.busySteps = 0; // But now they stopped

        compingState.lockedUntil = 0;
        getAccompanimentNotes(getState(), chord, 16, 0, 0, { isBeatStart: true });

        // Should have switched to 'active' vibe
        expect(compingState.currentVibe).toBe('active');
    });

    it('should avoid clashing with the bass range (Register Slotting)', () => {
        bass.enabled = true;
        bass.lastFreq = 110; // A2 (Midi 45)

        // A chord that has a note right on A2 or below
        const chord = {
            rootMidi: 45, // A2
            freqs: [110, 138.59, 164.81], // A2, C#3, E3
            quality: 'major',
            intervals: [0, 4, 7],
            beats: 4,
        };

        let notes = [];
        // Try up to 100 steps to find a hit, forcing one if necessary
        for (let s = 0; s < 100; s++) {
            compingState.lockedUntil = 0;
            // Force a hit on the last iteration if we haven't found one
            if (s === 99) {
                compingState.currentCell[s % 16] = 1;
                compingState.lockedUntil = 1000; // Keep it locked
            }
            const res = getAccompanimentNotes(getState(), chord, s, s, s % 16, {
                isBeatStart: s % 4 === 0,
            });
            if (res.some((n) => n.midi > 0)) {
                notes = res;
                break;
            }
        }

        expect(notes.length).toBeGreaterThan(0);

        const playedMidis = notes.map((n) => n.midi).filter((m) => m > 0);

        // Bass is 45 (A2). Slotting logic should ensure notes are above bass + 12 (57) or shifted.
        // Initial chord A2(45), C#3(49), E3(52).
        // The current implementation shifts voicing[0] (45) to 57 if it's <= bass+12.
        // So we expect no notes below 49, and at least one note at or above 57.
        playedMidis.forEach((m) => {
            expect(m).toBeGreaterThanOrEqual(49);
        });
        expect(playedMidis.some((m) => m >= 57)).toBe(true);
    });

    it('should maintain smooth voice leading over Autumn Leaves cycle of fourths', () => {
        // Am7 | D7 | Gmaj7 | Cmaj7
        arranger.sections = [{ id: 'A', value: 'Am7 | D7 | Gmaj7 | Cmaj7' }];
        validateProgression(getState());

        let lastAvg = null;
        arranger.progression.forEach((chord, i) => {
            compingState.lockedUntil = 0;
            // Try various steps until we find a hit to check voice leading
            let midis = [];
            for (let s = 0; s < 16; s++) {
                const notes = getAccompanimentNotes(getState(), chord, i * 16 + s, s, s, {
                    isBeatStart: s % 4 === 0,
                });
                midis = notes.filter((n) => n.midi > 0).map((n) => n.midi);
                if (midis.length > 0) {
                    break;
                }
            }

            if (midis.length > 0) {
                const avg = midis.reduce((a, b) => a + b, 0) / midis.length;
                if (lastAvg !== null) {
                    const drift = Math.abs(avg - lastAvg);
                    expect(drift).toBeLessThan(7); // Smooth voice leading
                }
                lastAvg = avg;
            }
        });
    });

    it('should use "Sticky Grooves" for Neo-Soul but not for Jazz', () => {
        const chord = {
            rootMidi: 60,
            quality: 'maj7',
            freqs: [261.63],
            intervals: [0],
            beats: 4,
            sectionId: 'A',
        };

        // 1. Jazz should vary
        groove.genreFeel = 'Jazz';
        const patterns = new Set();
        for (let i = 0; i < 10; i++) {
            compingState.lockedUntil = 0;
            getAccompanimentNotes(getState(), chord, i * 16, 0, 0, { isBeatStart: true });
            patterns.add(compingState.currentCell.join(''));
        }
        expect(patterns.size).toBeGreaterThan(1);

        // 2. Neo-Soul should stick
        groove.genreFeel = 'Neo-Soul';
        compingState.lockedUntil = 0;
        getAccompanimentNotes(getState(), chord, 200, 0, 0, { isBeatStart: true });
        const initialPattern = compingState.currentCell.join('');

        for (let i = 1; i < 4; i++) {
            getAccompanimentNotes(getState(), chord, 200 + i * 16, 0, 0, { isBeatStart: true });
            expect(compingState.currentCell.join('')).toBe(initialPattern);
        }
    });
});
