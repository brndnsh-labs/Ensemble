// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { getState } from '../../public/state.js';

// Mock the audio-graph helpers (they moved to engine/synth-utils.js in #1176)
vi.mock('../../public/engine/synth-utils.js', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    safeDisconnect: () => {},
}));

// Mock state
vi.mock('../../public/state.js', () => {
    const mockPlayback = {
        audio: {
            currentTime: 0,
            createOscillator: vi.fn(() => ({
                type: '',
                frequency: {
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                },
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
            })),
            createGain: vi.fn(() => ({
                gain: {
                    value: 1,
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                    linearRampToValueAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn(),
                },
                connect: vi.fn(),
            })),
            createBiquadFilter: vi.fn(() => ({
                type: '',
                frequency: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                Q: { value: 0, setValueAtTime: vi.fn() },
                connect: vi.fn(),
            })),
            createBufferSource: vi.fn(() => ({
                buffer: null,
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
                playbackRate: { value: 1 },
            })),
            createBuffer: vi.fn(() => ({
                getChannelData: vi.fn(() => new Float32Array(100)),
            })),
            sampleRate: 44100,
        },
        drumsGain: { connect: vi.fn() },
    };
    const mockGroove = {
        humanize: 20,
        audioBuffers: { noise: {} },
        lastHatGain: null,
    };

    const mockStateMap = {
        playback: mockPlayback,
        groove: mockGroove,
        chords: {},
        harmony: {},
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        dispatch: vi.fn(),
    };
});

import { playDrumSound } from '../../public/engine/synth-drums.js';

describe('Drum Synth Performance', () => {
    it('measures playDrumSound loop performance', () => {
        const iterations = 1000;
        // Instruments that trigger the specific array check we are optimizing
        const instruments = [
            'HiHat',
            'Open',
            'Crash',
            'Shaker',
            'Agogo',
            'Perc',
            'Guiro',
            'Clave',
            'TomHigh',
            'CongaHigh',
            'BongoHigh',
        ];

        const start = performance.now();

        for (let i = 0; i < iterations; i++) {
            const name = instruments[i % instruments.length];
            playDrumSound(getState(), name, 0, 1.0);
        }

        const end = performance.now();
        const duration = end - start;

        console.log(`playDrumSound x ${iterations} took ${duration.toFixed(2)}ms`);
        expect(duration).toBeGreaterThan(0);
    });
});
