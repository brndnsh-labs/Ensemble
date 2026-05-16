// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { getState } from '../../public/state.js';

// Mock utils
vi.mock('../../public/utils.js', () => ({
    safeDisconnect: () => {},
}));

// Mock state
vi.mock('../../public/state.js', () => {
    const mockPlayback = {
        audio: {
            currentTime: 0,
            createOscillator: vi.fn(() => ({
                type: '',
                frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
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
                    cancelScheduledValues: vi.fn(),
                },
                connect: vi.fn(),
            })),
            createBiquadFilter: vi.fn(() => ({
                type: '',
                frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                Q: { setValueAtTime: vi.fn() },
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
        },
        chordsGain: { connect: vi.fn() },
        sustainActive: false,
        bandIntensity: 0.5,
    };
    const mockGroove = { audioBuffers: { noise: {} } };

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

import { playNote } from '../../public/engine/synth-chords.js';

describe('Synth Chords Performance', () => {
    it('measures playNote high-intensity performance', () => {
        const iterations = 2000;
        const start = performance.now();

        for (let i = 0; i < iterations; i++) {
            playNote(getState(), 440, 0, 1.0, {
                vol: 0.8,
                index: 0,
                instrument: 'Piano',
                muted: false,
                numVoices: 3,
            });
        }

        const end = performance.now();
        const duration = end - start;

        console.log(`playNote (Intensity 0.9) x ${iterations} took ${duration.toFixed(2)}ms`);
        expect(duration).toBeGreaterThan(0);
    });
});
