// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../../public/engine/soloist.js';
import { getState } from '../../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

const { soloist } = getState();

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 1.0, bpm: 120, complexity: 1.0, intent: { soloistMod: 0 } },
        soloist: makeSoloistMock({
            busySteps: 0,
            tension: 1.0,
            mode: 'monophonic',
            sessionSteps: 10000,
            pitchHistory: [],
            motifBuffer: [],
            deviceBuffer: [],
            srdcState: 'Departure',
        }),
        groove: { genreFeel: 'Rock' },
        arranger: { timeSignature: '4/4', totalSteps: 64 },
        chords: {},
        bass: {},
        harmony: {},
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

vi.mock('../../../public/config.js', () => {
    const STYLE_CONFIG = {
        scalar: {
            deviceProb: 0,
            cells: [0],
            allowedDevices: [],
            registerSoar: 15,
            restBase: 0,
            restGrowth: 0,
            doubleStopProb: 0,
            maxNotesPerPhrase: 100,
        },
    };
    return {
        STYLE_CONFIG,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] },
        },
    };
});

describe('Soloist High Ceiling Constraints', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };

    beforeEach(() => {
        soloist.session.phrasing.isResting = false;
        soloist.currentPhraseSteps = 1;
        soloist.session.currentPhrase.notesInPhrase = 0;
        soloist.session.phrasing.busySteps = 0;
        soloist.session.rhythm.deviceBuffer = [];
        soloist.lastInterval = 0;
        soloist.session.sessionSteps = 10000;
        soloist.srdcState = 'Departure';
        soloist.currentCell = [1, 1, 1, 1];
    });

    it('should NEVER exceed MIDI 96 (C7) even at max intensity during Departure', () => {
        let maxMidi = 0;
        let lastFreq = 440 * 2 ** ((80 - 69) / 12);

        for (let i = 0; i < 1000; i++) {
            const note = getSoloistNote(getState(), chordC, null, 16, lastFreq, 64, 'scalar', 0);
            if (note) {
                const primary = Array.isArray(note) ? note[0] : note;
                if (primary.midi > maxMidi) {
                    maxMidi = primary.midi;
                }
                lastFreq = 440 * 2 ** ((primary.midi - 69) / 12);
            }
        }

        console.log('Highest MIDI observed:', maxMidi);
        expect(maxMidi).toBeLessThanOrEqual(96);
    });
});
