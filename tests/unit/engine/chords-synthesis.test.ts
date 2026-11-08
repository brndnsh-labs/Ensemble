// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock state and global modules
vi.mock('../../../core/state.js', () => {
    const mockPlayback = {
        audio: {
            currentTime: 0,
            createOscillator: vi.fn(() => ({
                type: '',
                frequency: {
                    setValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
                detune: { setValueAtTime: vi.fn() },
                setPeriodicWave: vi.fn(),
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
            })),
            createGain: vi.fn(() => ({
                gain: {
                    value: 1,
                    setValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                    linearRampToValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn(),
                },
                connect: vi.fn(),
            })),
            createBiquadFilter: vi.fn(() => ({
                type: '',
                frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                Q: { setValueAtTime: vi.fn() },
                gain: { setValueAtTime: vi.fn() },
                connect: vi.fn(),
            })),
            createBufferSource: vi.fn(() => ({
                buffer: null,
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
            })),
            createPeriodicWave: vi.fn(() => ({})),
            createWaveShaper: vi.fn(() => ({
                connect: vi.fn(),
            })),
        },
        audioGraph: { chords: { gain: { connect: vi.fn() } } },
        bandIntensity: 0.5,
    };
    const mockGroove = { audioBuffers: { noise: {} } };
    // voice: 'synth' — the reworked synth voice is the only chord voice since
    // #649 retired the Current/New A/B. `playNote` resolves this through the
    // instrument-registry seam → the (additive-body) synth path.
    const mockChords = { activeTab: 'smart', voice: 'synth' };
    const mockHarmony = { enabled: false };

    const mockStateMap = {
        playback: mockPlayback,
        groove: mockGroove,
        chords: mockChords,
        harmony: mockHarmony,
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        arranger: {},
        bass: {},
        soloist: makeSoloistMock({}),
        storage: {},
        dispatch: vi.fn(),
    };
});

// Mock the audio-graph helpers (they moved to engine/audio-graph-utils.js in #1176)
vi.mock('../../../core/engine/audio-graph-utils.js', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    safeDisconnect: vi.fn(),
}));

import { playNote } from '../../../core/engine/synth-chords.js';
import { getState } from '../../../core/state.js';

const { playback } = getState();

describe('Chord Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio.currentTime = 10;
    });

    // The one witness the hammer layer exists: `npm run golden` cannot hear it — silencing the
    // chiff left every stem matching (#2153). Node counts and wave types are not pinned here;
    // golden fingerprints the voice's sound.
    it('strikes a hammer noise layer on a Piano note', () => {
        playNote(getState(), 440, 10, 1.0);

        expect(playback.audio.createBufferSource).toHaveBeenCalled();
    });
});
