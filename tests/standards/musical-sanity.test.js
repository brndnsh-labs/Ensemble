/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { compingState, getAccompanimentNotes } from '../../public/accompaniment.js';
import { checkSectionTransition, conductorState } from '../../public/conductor.js';
import { getState } from '../../public/state.js';

// Mock state.js
vi.mock('../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();

    // Create distinct mock objects
    const mockPlayback = {
        ...actual.playback,
        intent: { anticipation: 0, syncopation: 0, layBack: 0 },
    };
    const mockArranger = { ...actual.arranger, sections: [] };
    const mockGroove = { ...actual.groove };
    const mockHarmony = { enabled: false, buffer: new Map() };
    const mockChords = { ...actual.chords, enabled: true };
    const mockBass = { ...actual.bass };
    const mockSoloist = { ...actual.soloist };
    const mockConductorState = { ...actual.conductorState };

    const mockStateMap = {
        playback: mockPlayback,
        arranger: mockArranger,
        groove: mockGroove,
        harmony: mockHarmony,
        chords: mockChords,
        bass: mockBass,
        soloist: mockSoloist,
        conductorState: mockConductorState,
    };

    return {
        ...actual,
        ...mockStateMap,
        getState: () => mockStateMap,
        dispatch: vi.fn((action, payload) => {
            if (action === 'SET_BAND_INTENSITY') {
                mockPlayback.bandIntensity = payload;
            }
        }),
    };
});

// Mock dependencies
vi.mock('../../public/ui.js', () => ({
    ui: {
        densitySelect: { value: 'standard' },
        intensitySlider: { value: 0 },
        intensityValue: { textContent: '' },
        visualFlash: { checked: false },
    },
    triggerFlash: vi.fn(),
}));

vi.mock('../../public/persistence.js', () => ({
    debounceSaveState: vi.fn(),
}));

vi.mock('../../public/fills.js', () => ({
    generateProceduralFill: vi.fn(() => ({})),
}));

describe('Musical Sanity & Collision Detection', () => {
    let arranger, playback, chords, bass, soloist, harmony, groove;

    beforeEach(() => {
        vi.clearAllMocks();
        const state = getState();
        arranger = state.arranger;
        playback = state.playback;
        chords = state.chords;
        bass = state.bass;
        soloist = state.soloist;
        harmony = state.harmony;
        groove = state.groove;

        playback.bandIntensity = 0.5;
        playback.complexity = 0.5;
        groove.genreFeel = 'Jazz';
        harmony.enabled = false;
        chords.enabled = true;
        chords.style = 'smart';
        bass.enabled = true;
        soloist.enabled = false;
        arranger.timeSignature = '4/4';
        arranger.progression = [{ sectionId: 's1', sectionLabel: 'A', beats: 4, quality: 'maj7' }];
        compingState.lastChordIndex = -1;
        compingState.lockedUntil = 0;
    });

    describe('Piano/Bass Collision Avoidance', () => {
        it('should shift piano voicings up to avoid masking the bass', () => {
            const chord = {
                rootMidi: 48, // C3
                freqs: [130.81, 164.81, 196.0], // C3, E3, G3
                intervals: [0, 4, 7],
                quality: 'maj',
                beats: 4,
            };

            // Set bass to play a C2 (MIDI 36)
            bass.lastFreq = 65.41; // C2
            const bassMidi = 36;

            // Try multiple times to ensure we get a hit (it's probabilistic)
            let notes = [];
            playback.bandIntensity = 0.6; // Higher intensity for more reliable hits
            for (let i = 0; i < 1000; i++) {
                compingState.lockedUntil = 0;
                notes = getAccompanimentNotes(chord, i * 16, 0, 0, {
                    isBeatStart: true,
                    isGroupStart: true,
                });
                if (notes.some((n) => n.midi > 0)) {
                    break;
                }
            }

            const pianoMidis = notes.filter((n) => n.midi > 0).map((n) => n.midi);
            expect(pianoMidis.length).toBeGreaterThan(0);
            expect(pianoMidis[0]).toBeGreaterThanOrEqual(bassMidi + 12);
        });

        it('should reduce density when the soloist is active in a high register', () => {
            const chord = {
                rootMidi: 60,
                freqs: [261.63, 329.63, 392.0, 493.88], // C4, E4, G4, B4
                intervals: [0, 4, 7, 11],
                quality: 'maj7',
                beats: 4,
            };

            // Soloist is busy and high (C5 = 72)
            soloist.enabled = true;
            soloist.busySteps = 16;
            soloist.lastFreq = 523.25; // C5

            // Run multiple times to overcome Math.random() < 0.7
            let totalNotes = 0;
            const iterations = 100;
            for (let i = 0; i < iterations; i++) {
                compingState.lockedUntil = 0;
                const notes = getAccompanimentNotes(chord, i * 16, 0, 0, {
                    isBeatStart: true,
                    isGroupStart: true,
                });
                totalNotes += notes.filter((n) => n.midi > 0).length;
            }

            const avgNotes = totalNotes / iterations;
            // Standard voicing has 4 notes. Reduced density should be less.
            expect(avgNotes).toBeLessThan(4);
        });
    });

    describe('Conductor Macro-Arc (Grand Story) Integrity', () => {
        beforeEach(() => {
            arranger.totalSteps = 128; // > 64 to ensure fill logic triggers every loop for consistent testing
            arranger.stepMap = [
                { start: 0, end: 128, chord: { sectionId: 's1', sectionLabel: 'A' } },
            ];
            conductorState.formIteration = 0;
            conductorState.target = 0.5; // Reset target to avoid state pollution
            playback.autoIntensity = true;
            groove.enabled = true;
        });

        it('should statistically maintain lower intensity during the Warm Up cycle', () => {
            conductorState.formIteration = 0; // Warm up
            let intensitySum = 0;
            const iterations = 100;

            for (let i = 0; i < iterations; i++) {
                conductorState.formIteration = 0; // Force stay in Warm Up
                checkSectionTransition(112, 16);
                intensitySum += conductorState.target;
            }

            const avgIntensity = intensitySum / iterations;
            expect(avgIntensity).toBeLessThan(0.65);
        });

        it('should statistically reach higher intensity during The Peak cycle', () => {
            conductorState.formIteration = 4; // The Peak
            let intensitySum = 0;
            const iterations = 100;

            for (let i = 0; i < iterations; i++) {
                conductorState.formIteration = 4; // Force stay in Peak
                checkSectionTransition(112, 16);
                intensitySum += conductorState.target;
            }

            const avgIntensity = intensitySum / iterations;
            expect(avgIntensity).toBeGreaterThan(0.45);
        });

        it('should ramp intensity down during The Cool Down cycle', () => {
            conductorState.formIteration = 6; // Cool down
            let intensitySum = 0;
            const iterations = 100;

            for (let i = 0; i < iterations; i++) {
                conductorState.formIteration = 6; // Force stay in Cool Down
                checkSectionTransition(112, 16);
                intensitySum += conductorState.target;
            }

            const avgIntensity = intensitySum / iterations;
            expect(avgIntensity).toBeLessThan(0.7);
        });
    });
});
