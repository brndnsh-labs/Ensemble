import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../../public/engine/soloist.js';
import { getState } from '../../../public/state.js';

// Mock dependencies
vi.mock('../../../public/state.js', () => ({
    getState: vi.fn(),
}));

// Mock config to ensure stable testing
vi.mock('../../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4 },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

describe('Soloist Blues Logic', () => {
    let mockState;

    beforeEach(() => {
        mockState = {
            playback: {
                bandIntensity: 0.8,
                bpm: 100,
                sessionTimer: 0,
                intent: {},
                complexity: 0.5,
            },
            groove: { genreFeel: 'Blues', pocket: 0 },
            soloist: {
                mode: 'guitar',
                srdcState: 'Statement',
                qaState: 'Question',
                isResting: false,
                isPhraseActive: true,
                lastAttackStep: -100,
                currentPhraseSteps: 10,
                notesInPhrase: 2,
                deviceBuffer: [],
                motifBuffer: [],
                busySteps: 0,
                pitchHistory: [],
            },
            harmony: { enabled: false },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    it('should generate blues licks (long phrases) when style is blues', () => {
        mockState.playback.currentLoopCount = 3;
        const C7 = { rootMidi: 60, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };

        let lickFound = false;
        let attempts = 0;

        // We try many times to trigger the probabilistic device generation
        while (!lickFound && attempts < 1000) {
            // Reset state
            mockState.soloist.deviceBuffer = [];
            mockState.soloist.busySteps = 0;
            mockState.soloist.isResting = false;
            mockState.soloist.currentPhraseSteps = 0;
            mockState.soloist.notesInPhrase = 0;
            mockState.soloist.lastAttackStep = -100;

            // Call getSoloistNote
            // Use attempts * 4 to ensure step % 16 == 0 regularly
            getSoloistNote(C7, null, attempts * 4, 60, 4, 'blues', 0, {
                bypassRhythm: true,
            });

            if (mockState.soloist.deviceBuffer.length >= 2) {
                lickFound = true;
            }
            attempts++;
        }

        expect(lickFound).toBe(true);
    });
});
