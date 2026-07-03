// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock state and global config
vi.mock('../../../public/state.js', () => {
    const mockState = {
        bass: {
            enabled: true,
            busySteps: 0,
            lastFreq: 440,
            volume: 0.5,
            pocketOffset: 0,
            buffer: new Map(),
            style: 'smart',
        },
        soloist: makeSoloistMock({
            enabled: true,
            busySteps: 0,
            tension: 0,
            buffer: new Map(),
        }),
        groove: {
            genreFeel: 'Funk',
            measures: 1,
            lastDrumPreset: 'Standard',
            instruments: [{ name: 'Kick', steps: new Array(16).fill(0), muted: false }],
        },
        playback: { bandIntensity: 0.8, bpm: 120, complexity: 0.5, intent: { soloistMod: 0 } },
        chords: {},
        harmony: { enabled: false, buffer: new Map() },
        arranger: {
            key: 'C',
            isMinor: false,
            progression: new Array(16).fill({}),
            totalSteps: 64,
            timeSignature: '4/4',
            stepMap: [
                {
                    start: 0,
                    end: 64,
                    chord: { sectionId: 's1', rootMidi: 48, quality: '7', beats: 4 },
                },
            ],
        },
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

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': {
            beats: 4,
            stepsPerBeat: 4,
            subdivision: '16th',
            pulse: [0, 4, 8, 12],
            grouping: [2, 2],
        },
    },
    REGGAE_RIDDIMS: {},
}));

import { getBassNote, isBassActive } from '../../../public/engine/bass-engine.js';
import { getState } from '../../../public/state.js';

const { bass, playback } = getState();

describe('Bass Engine - Disco', () => {
    const chordC = {
        rootMidi: 48,
        intervals: [0, 4, 7, 10],
        quality: '7',
        beats: 4,
        sectionId: 's1',
        bassMidi: null,
    };

    beforeEach(() => {
        bass.busySteps = 0;
        playback.bandIntensity = 0.8;
    });

    describe('Disco Style', () => {
        it('should be active on all 16th steps', () => {
            for (let i = 0; i < 4; i++) {
                expect(isBassActive(getState(), 'disco', i, i)).toBe(true);
            }
        });

        it('should play Root on Downbeat (Step 0)', () => {
            const result = getBassNote(getState(), chordC, null, 0, null, 36, 'disco', 0, 0, 0);
            expect(result).not.toBeNull();
            // Accept C2 (36) or C3 (48) depending on intensity shift
            expect([36, 48]).toContain(result.midi);
        });

        it('should play Octave on Upbeat (Step 2)', () => {
            const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
            const result = getBassNote(getState(), chordC, null, 0.5, null, 36, 'disco', 0, 2, 2);
            expect(result).not.toBeNull();
            expect(result.midi).toBe(48); // C3 (36 + 12)
            spy.mockRestore();
        });
    });
});
