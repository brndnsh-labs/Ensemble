/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../../public/state.js';

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        midi: { enabled: true },
        dispatch: vi.fn(),
        playback: { audio: { currentTime: 0 } },
        harmony: { enabled: false, buffer: new Map() },
        arranger: {},
        chords: {},
        bass: {},
        soloist: {},
        groove: {},
        vizState: {},
        storage: {},
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});

import { initMIDI } from '../../../public/midi-controller.js';

const { midi, dispatch } = getState();

describe('MIDI Input Handling', () => {
    let mockInput;
    let mockMidiAccess;

    beforeEach(() => {
        vi.clearAllMocks();

        mockInput = { onmidimessage: null };
        mockMidiAccess = {
            inputs: new Map([['input-1', mockInput]]),
            outputs: new Map(),
            onstatechange: null,
        };

        // Mock navigator.requestMIDIAccess
        global.navigator.requestMIDIAccess = vi.fn().mockResolvedValue(mockMidiAccess);
    });

    it('should correctly process incoming CC 11 (Expression) to set intensity', async () => {
        midi.enabled = true;
        await initMIDI();

        // Verify input listener was attached
        expect(mockInput.onmidimessage).toBeDefined();

        // Simulate CC 11 message (Expression) at 50% value (64)
        const event = {
            data: new Uint8Array([0xb0, 11, 64]),
        };

        mockInput.onmidimessage(event);

        // Verify dispatch was called with correct intensity (~0.5)
        expect(dispatch).toHaveBeenCalledWith('SET_BAND_INTENSITY', 64 / 127);
    });

    it('should correctly process incoming CC 1 (Modulation) to set intensity', async () => {
        midi.enabled = true;
        await initMIDI();

        // Simulate CC 1 message (Modulation) at max value (127)
        const event = {
            data: new Uint8Array([0xb0, 1, 127]),
        };

        mockInput.onmidimessage(event);

        expect(dispatch).toHaveBeenCalledWith('SET_BAND_INTENSITY', 1.0);
    });

    it('should ignore MIDI messages if midi is disabled', async () => {
        midi.enabled = true; // Ensure it's on for init
        await initMIDI();

        // Clear the SET_MIDI_CONFIG call from initMIDI
        dispatch.mockClear();

        midi.enabled = false;

        const event = {
            data: new Uint8Array([0xb0, 11, 127]),
        };

        mockInput.onmidimessage(event);

        expect(dispatch).not.toHaveBeenCalled();
    });
});
