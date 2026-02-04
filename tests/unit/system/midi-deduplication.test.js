/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        midi: { 
            enabled: true, 
            selectedOutputId: 'mock-output-1',
            latency: 0 
        },
        playback: { 
            audio: { currentTime: 10 } // Arbitrary time
        },
        arranger: {},
        chords: {},
        bass: {},
        soloist: {},
        groove: {},
        vizState: {},
        harmony: {},
        storage: {}
    };
    
    return {
        getState: () => mockState,
        dispatch: vi.fn(),
        ACTIONS: {
            SET_MIDI_CONFIG: 'SET_MIDI_CONFIG'
        }
    };
});

import { initMIDI, sendMIDICC, sendMIDIPitchBend, panic } from '../../../public/midi-controller.js';
import { getState } from '../../../public/state.js';

describe('MIDI Message Deduplication', () => {
    let mockOutput;
    let mockMidiAccess;

    beforeEach(async () => {
        vi.clearAllMocks();
        
        mockOutput = {
            id: 'mock-output-1',
            name: 'Mock Output',
            send: vi.fn()
        };
        
        mockMidiAccess = {
            inputs: new Map(),
            outputs: new Map([['mock-output-1', mockOutput]]),
            onstatechange: null
        };

        // Mock navigator.requestMIDIAccess
        global.navigator.requestMIDIAccess = vi.fn().mockResolvedValue(mockMidiAccess);

        // Initialize controller to populate midiAccess
        await initMIDI();
        
        // Ensure state is set for sending
        const state = getState();
        state.midi.enabled = true;
        state.midi.selectedOutputId = 'mock-output-1';
        
        // Clear initial sync calls
        mockOutput.send.mockClear();
    });

    it('should only send CC message when value changes', () => {
        const channel = 1;
        const controller = 11;
        const time = 10; // Current time matches playback time

        // 1. Send initial value
        sendMIDICC(channel, controller, 64, time);
        expect(mockOutput.send).toHaveBeenCalledTimes(1);
        expect(mockOutput.send).toHaveBeenLastCalledWith([0xB0, 11, 64], expect.any(Number));

        // 2. Send SAME value (should be ignored)
        sendMIDICC(channel, controller, 64, time + 0.1);
        expect(mockOutput.send).toHaveBeenCalledTimes(1); // Call count unchanged

        // 3. Send NEW value
        sendMIDICC(channel, controller, 65, time + 0.2);
        expect(mockOutput.send).toHaveBeenCalledTimes(2);
        expect(mockOutput.send).toHaveBeenLastCalledWith([0xB0, 11, 65], expect.any(Number));
        
        // 4. Send DIFFERENT channel/controller same value (should be sent)
        sendMIDICC(2, controller, 65, time + 0.3);
        expect(mockOutput.send).toHaveBeenCalledTimes(3);
        expect(mockOutput.send).toHaveBeenLastCalledWith([0xB1, 11, 65], expect.any(Number));
    });

    it('should only send Pitch Bend message when value changes', () => {
        const channel = 1;
        const time = 10;

        // 1. Send initial value (Center)
        sendMIDIPitchBend(channel, 0, time);
        expect(mockOutput.send).toHaveBeenCalledTimes(1);

        // 2. Send SAME value
        sendMIDIPitchBend(channel, 0, time + 0.1);
        expect(mockOutput.send).toHaveBeenCalledTimes(1);

        // 3. Send NEW value
        sendMIDIPitchBend(channel, 100, time + 0.2);
        expect(mockOutput.send).toHaveBeenCalledTimes(2);
    });

    it('should clear caches on panic', () => {
        const channel = 1;
        const controller = 11;
        const time = 10;

        // 1. Send value
        sendMIDICC(channel, controller, 100, time);
        expect(mockOutput.send).toHaveBeenCalledTimes(1);

        // 2. Panic (should clear cache)
        panic();
        // Panic sends notes off, verify it was called
        // We aren't testing panic's specific messages here, just the side effect on cache
        const callsAfterPanic = mockOutput.send.mock.calls.length;

        // 3. Send SAME value again (should be sent this time because cache was cleared)
        sendMIDICC(channel, controller, 100, time);
        expect(mockOutput.send).toHaveBeenCalledTimes(callsAfterPanic + 1);
        expect(mockOutput.send).toHaveBeenLastCalledWith([0xB0, 11, 100], expect.any(Number));
    });
});
