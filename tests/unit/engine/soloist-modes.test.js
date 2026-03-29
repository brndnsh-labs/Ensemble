import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../../public/engine/soloist.js';
import { getState } from '../../../public/state.js';

// Mock State
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: {
            intent: { soloistMod: 0 },
            bandIntensity: 1.0,
            bpm: 120,
            sessionTimer: 0,
            complexity: 1.0,
        },
        soloist: {
            enabled: true,
            busySteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            qaState: 'Question',
            isResting: false,
            motifBuffer: [],
            pitchHistory: [],
            deviceBuffer: [],
            sessionSteps: 2048,
            mode: 'monophonic',
            lastAttackStep: -100,
            isPhraseActive: true,
            doubleStopProb: 10.0, // Force double stops for tests
        },
        groove: { genreFeel: 'Jazz' },
        arranger: { timeSignature: '4/4' },
        harmony: { enabled: false },
        dispatch: vi.fn(),
    };
    return {
        stateMap: mockState,
        getState: () => mockState,
        dispatch: vi.fn(),
    };
});

// Mock STYLE_CONFIG for stable testing
vi.mock('../../../public/config.js', () => ({
    STYLE_CONFIG: {
        scalar: {
            doubleStopProb: 1.0,
            deviceProb: 0.0,
            targetExtensions: [2, 9],
            maxNotesPerPhrase: 100,
            restBase: 0.0,
            restGrowth: 0.0,
        },
        neo: {
            doubleStopProb: 1.0,
            deviceProb: 0.0,
            targetExtensions: [2, 9],
            maxNotesPerPhrase: 100,
            restBase: 0.0,
            restGrowth: 0.0,
        },
        blues: {
            doubleStopProb: 1.0,
            deviceProb: 0.0,
            targetExtensions: [2, 9],
            maxNotesPerPhrase: 100,
            restBase: 0.0,
            restGrowth: 0.0,
        },
        bird: {
            doubleStopProb: 0.0,
            deviceProb: 1.0,
            allowedDevices: ['run', 'graceNote'],
            targetExtensions: [2, 9],
            maxNotesPerPhrase: 100,
            restBase: 0.0,
            restGrowth: 0.0,
        },
    },
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4 },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

// Mock Theory Scales
vi.mock('../../../public/engine/theory-scales.js', () => ({
    getScaleForChord: () => {
        // Return C Major scale tones [0, 2, 4, 5, 7, 9, 11]
        return [0, 2, 4, 5, 7, 9, 11];
    },
}));

// Mock Utils
vi.mock('../../../public/utils.js', () => ({
    getFrequency: (midi) => 440 * 2 ** ((midi - 69) / 12),
    applyBluesBends: vi.fn(),
    getMidi: (freq) => Math.round(69 + 12 * Math.log2(freq / 440)),
    calculateTimingOffset: vi.fn(() => 0),
}));

describe('Soloist Mode Differentiation Logic', () => {
    const state = getState();
    const currentChord = { rootMidi: 60, intervals: [0, 4, 7, 11], beats: 4 }; // Cmaj7

    beforeEach(() => {
        state.soloist.mode = 'monophonic';
        state.soloist.isResting = false;
        state.soloist.busySteps = 0;
        state.soloist.deviceBuffer = [];
        vi.spyOn(Math, 'random').mockReturnValue(0.5); // Predictable random
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should generate a single note in monophonic mode even when double stop chance is high', () => {
        state.soloist.mode = 'monophonic';
        // Mock random to trigger a double stop (if it were allowed)
        // dsChance calculation uses random, so we force it.
        // Actually, we'll just check that even if extraNotes is populated,
        // the final result is handled correctly based on mode.
        // But the logic in soloist.js skips extraNotes if !isPolyphonic.

        const note = getSoloistNote(getState(), currentChord, null, 0, 440, 60, 'scalar', 0);
        expect(Array.isArray(note)).toBe(false);
    });

    it('should generate specific fretboard-friendly intervals in guitar mode', () => {
        state.soloist.mode = 'guitar';
        state.playback.currentLoopCount = 3; // ensure fully warmed up
        vi.spyOn(Math, 'random').mockRestore(); // Use real random for the loop

        let note = null;
        let attempts = 0;
        // Try up to 1000 times to get a double stop (usually takes ~10-20)
        while (attempts < 1000) {
            state.soloist.busySteps = 0;
            note = getSoloistNote(
                getState(),
                currentChord,
                null,
                attempts * 4,
                261.63,
                60,
                'scalar',
                0,
                {
                    bypassRhythm: true,
                },
            );
            if (Array.isArray(note)) {
                break;
            }
            attempts++;
        }

        expect(Array.isArray(note)).toBe(true);
        expect(note.length).toBe(2);

        const melody = note[note.length - 1];
        const extra = note[0];
        const interval = extra.midi - melody.midi;

        // Guitar intervals (below melody): [-3, -4, -5, -7, -8, -9]
        expect([-3, -4, -5, -7, -8, -9]).toContain(interval);
    });

    it('keeps loop-0 guitar head notes monophonic without explicit support metadata', () => {
        state.soloist.mode = 'guitar';
        state.playback.currentLoopCount = 0;
        state.soloist.sessionSeed = {
            loopLengthSteps: 16,
            notes: [{ step: 0, midi: 72, isAnchor: true, durationSteps: 4, velocity: 0.9 }],
        };

        const note = getSoloistNote(getState(), currentChord, null, 0, 261.63, 60, 'scalar', 0);
        expect(Array.isArray(note)).toBe(false);
        expect(note?.midi).toBe(72);
    });

    it('lets loop-0 guitar head notes realize optional support metadata as double stops', () => {
        state.soloist.mode = 'guitar';
        state.playback.currentLoopCount = 0;
        state.soloist.sessionSeed = {
            loopLengthSteps: 16,
            notes: [
                {
                    step: 0,
                    midi: 72,
                    isAnchor: true,
                    durationSteps: 4,
                    velocity: 0.9,
                    supportHints: {
                        role: 'anchor',
                        sustainBias: 1.0,
                        guitar: {
                            allowDoubleStop: true,
                            intervalPalette: 'tight',
                            preferBelow: true,
                        },
                    },
                },
            ],
        };

        const note = getSoloistNote(getState(), currentChord, null, 0, 261.63, 60, 'scalar', 0);
        expect(Array.isArray(note)).toBe(true);
        expect(note.length).toBe(2);
        expect(note[note.length - 1].midi).toBe(72);
        expect(note[0].isDoubleStop).toBe(true);
        expect(note[0].midi).toBeLessThan(72);
    });

    it('keeps guitar support notes shorter than the lead on anchor-style head voicings', () => {
        state.soloist.mode = 'guitar';
        state.playback.currentLoopCount = 0;
        state.soloist.sessionSeed = {
            loopLengthSteps: 16,
            notes: [
                {
                    step: 0,
                    midi: 72,
                    isAnchor: true,
                    durationSteps: 8,
                    velocity: 0.9,
                    supportHints: {
                        role: 'anchor',
                        sustainBias: 1.0,
                        guitar: {
                            allowDoubleStop: true,
                            intervalPalette: 'open',
                            preferBelow: true,
                        },
                    },
                },
            ],
        };

        const note = getSoloistNote(getState(), currentChord, null, 0, 261.63, 60, 'neo', 0);
        expect(Array.isArray(note)).toBe(true);
        expect(note[0].durationSteps).toBeLessThan(note[note.length - 1].durationSteps);
        expect(note[0].durationSteps).toBeGreaterThanOrEqual(6);
    });

    it('treats deprecated piano mode as monophonic on loop-0 head notes', () => {
        state.soloist.mode = 'piano';
        state.playback.currentLoopCount = 0;
        state.soloist.sessionSeed = {
            loopLengthSteps: 16,
            notes: [{ step: 0, midi: 72, isAnchor: true, durationSteps: 4, velocity: 0.9 }],
        };

        const note = getSoloistNote(getState(), currentChord, null, 0, 261.63, 60, 'scalar', 0);
        expect(Array.isArray(note)).toBe(false);
        expect(note?.midi).toBe(72);
    });

    it('ignores deprecated piano support metadata and keeps the lead monophonic', () => {
        state.soloist.mode = 'piano';
        state.playback.currentLoopCount = 0;
        state.soloist.sessionSeed = {
            loopLengthSteps: 16,
            notes: [
                {
                    step: 0,
                    midi: 72,
                    isAnchor: true,
                    durationSteps: 8,
                    velocity: 0.9,
                    supportHints: {
                        role: 'anchor',
                        sustainBias: 1.0,
                        guitar: {
                            allowDoubleStop: false,
                            intervalPalette: 'tight',
                            preferBelow: true,
                        },
                    },
                },
            ],
        };

        const note = getSoloistNote(getState(), currentChord, null, 0, 261.63, 60, 'scalar', 0);
        expect(Array.isArray(note)).toBe(false);
        expect(note?.midi).toBe(72);
    });

    it('should use Hendrix-style intervals for guitar in blues style', () => {
        state.soloist.mode = 'guitar';
        state.playback.currentLoopCount = 3;
        vi.spyOn(Math, 'random').mockRestore();

        let attempts = 0;
        let foundHendrixInt = false;
        while (attempts < 1000) {
            state.soloist.busySteps = 0;
            const note = getSoloistNote(
                getState(),
                currentChord,
                null,
                attempts * 4,
                261.63,
                60,
                'smart',
                0,
                {
                    bypassRhythm: true,
                },
            );
            if (Array.isArray(note)) {
                const melody = note[note.length - 1];
                const extra = note[0];
                // Note: Guitar adds lower intervals typically
                const interval = extra.midi - melody.midi;
                if ([-3, -4, -5].includes(interval)) {
                    foundHendrixInt = true;
                    break;
                }
            }
            attempts++;
        }
        expect(foundHendrixInt).toBe(true);
    });

    it('keeps guitar double stops more restrained in jazz than in blues', () => {
        state.soloist.mode = 'guitar';
        state.playback.currentLoopCount = 3;
        vi.spyOn(Math, 'random').mockRestore();

        const countDoubleStops = (style, iterations) => {
            let doubleStops = 0;
            let total = 0;
            for (let i = 0; i < iterations; i++) {
                state.soloist.busySteps = 0;
                const note = getSoloistNote(
                    getState(),
                    currentChord,
                    null,
                    i * 4,
                    261.63,
                    60,
                    style,
                    0,
                    {
                        bypassRhythm: true,
                    },
                );
                if (note) {
                    total++;
                    if (Array.isArray(note)) {
                        doubleStops++;
                    }
                }
            }
            return doubleStops / total;
        };

        const jazzRatio = countDoubleStops('jazz', 1200);
        const bluesRatio = countDoubleStops('blues', 1200);

        expect(jazzRatio).toBeLessThan(0.18);
        expect(bluesRatio).toBeGreaterThan(jazzRatio * 2);
    });
});
