/* eslint-disable */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    initMIDI,
    panic,
    sendMIDICC,
    sendMIDIDrum,
    sendMIDINote,
    sendMIDIPitchBend,
} from '../../../public/midi-controller.js';
import { getState } from '../../../public/state.js';

const { playback, midi } = getState();

describe('MIDI Controller System', () => {
    let mockOutput;
    let sentMessages = [];

    beforeEach(async () => {
        vi.useFakeTimers();
        sentMessages = [];

        // Clear module state from previous tests (important for static caches)
        panic();

        // Mock Audio Context
        playback.audio = { currentTime: 1000 }; // Start at T=1000s

        // Mock MIDI Output
        mockOutput = {
            id: 'mock-id',
            name: 'Mock Output',
            send: vi.fn((data, timestamp) => {
                sentMessages.push({ data, timestamp });
            }),
        };

        // Mock MIDI Access
        const mockMidiAccess = {
            inputs: new Map(),
            outputs: new Map([['mock-id', mockOutput]]),
            onstatechange: null,
        };

        // Stub navigator
        vi.stubGlobal('navigator', {
            requestMIDIAccess: () => Promise.resolve(mockMidiAccess),
        });

        // Initialize
        await initMIDI();

        // Enable MIDI in state
        midi.enabled = true;
        midi.selectedOutputId = 'mock-id';
        midi.latency = 0;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        midi.enabled = false;
    });

    describe('Note Overlap & Monophony', () => {
        it('should truncate previous note if new note overlaps, ensuring Off occurs before new On', async () => {
            const channel = 1;
            const note = 60;
            const duration = 1.0;

            // 1. Send Note 1 at T=1000. Ends at T=1001 (approx).
            sendMIDINote(channel, note, 0.8, 1000, duration);

            expect(mockOutput.send).toHaveBeenCalledTimes(1);
            expect(mockOutput.send.mock.calls[0][0][0]).toBe(0x90);

            // 2. Send Note 2 at T=1000.5 (Overlap!)
            // This should force Note 1 to end IMMEDIATELY (synchronously)
            sendMIDINote(channel, note, 0.8, 1000.5, duration);

            // Expect 3 calls: On 1, Off 1 (truncated), On 2
            expect(mockOutput.send).toHaveBeenCalledTimes(3);

            const calls = mockOutput.send.mock.calls;
            const msg1 = calls[0]; // On 1
            const msg2 = calls[1]; // Off 1 (Truncated)
            const msg3 = calls[2]; // On 2

            expect(msg1[0][0] & 0xf0).toBe(0x90);
            expect(msg2[0][0] & 0xf0).toBe(0x80); // Note Off
            expect(msg3[0][0] & 0xf0).toBe(0x90); // Note On

            // Verify Off 1 timestamp is before or equal to On 2 timestamp
            expect(msg2[1]).toBeLessThan(msg3[1]);
        });

        it('should send Note Off correctly if no overlap occurs', () => {
            const channel = 1;
            const note = 60;
            const duration = 0.5;

            sendMIDINote(channel, note, 0.8, 1000, duration);

            expect(mockOutput.send).toHaveBeenCalledTimes(1);

            // Advance past duration
            playback.audio.currentTime = 1000.6;
            vi.advanceTimersByTime(600);

            expect(mockOutput.send).toHaveBeenCalledTimes(2);
            expect(mockOutput.send.mock.calls[1][0][0]).toBe(0x80);
        });

        it('should enforce strict monophony (kill previous note) when isMono is true, even for different pitches', () => {
            // 1. Send Note 1 (Channel 1, Pitch 60)
            sendMIDINote(1, 60, 0.8, 1000, 2.0);

            // 2. Send Note 2 (Channel 1, Pitch 62) with isMono=true
            // This should kill Note 60 immediately
            sendMIDINote(1, 62, 0.8, 1000.5, 2.0, true);

            playback.audio.currentTime = 1000.5;
            vi.advanceTimersByTime(500);

            const calls = mockOutput.send.mock.calls;

            // Expect: On 60, On 62, Off 60
            expect(calls.length).toBe(3);

            const msgOn60 = calls[0];
            const msgOn62 = calls[1];
            const msgOff60 = calls[2]; // Should be Off 60

            expect(msgOn60[0]).toEqual([0x90, 60, 0.8]);
            expect(msgOn62[0]).toEqual([0x90, 62, 0.8]);
            expect(msgOff60[0]).toEqual([0x80, 60, 0]);

            // Verify Timestamps: Off 60 < On 62
            expect(msgOff60[1]).toBeLessThan(msgOn62[1]);
        });
    });

    describe('Message Deduplication', () => {
        it('should only send CC message when value changes', () => {
            const channel = 1;
            const controller = 11;
            const time = 1000;

            // 1. Send initial value
            sendMIDICC(channel, controller, 64, time);
            expect(mockOutput.send).toHaveBeenCalledTimes(1);
            expect(mockOutput.send).toHaveBeenLastCalledWith([0xb0, 11, 64], expect.any(Number));

            // 2. Send SAME value (should be ignored)
            sendMIDICC(channel, controller, 64, time + 0.1);
            expect(mockOutput.send).toHaveBeenCalledTimes(1); // Call count unchanged

            // 3. Send NEW value
            sendMIDICC(channel, controller, 65, time + 0.2);
            expect(mockOutput.send).toHaveBeenCalledTimes(2);
            expect(mockOutput.send).toHaveBeenLastCalledWith([0xb0, 11, 65], expect.any(Number));

            // 4. Send DIFFERENT channel/controller same value (should be sent)
            sendMIDICC(2, controller, 65, time + 0.3);
            expect(mockOutput.send).toHaveBeenCalledTimes(3);
            expect(mockOutput.send).toHaveBeenLastCalledWith([0xb1, 11, 65], expect.any(Number));
        });

        it('should only send Pitch Bend message when value changes', () => {
            const channel = 1;
            const time = 1000;

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
            const time = 1000;

            // 1. Send value
            sendMIDICC(channel, controller, 100, time);
            expect(mockOutput.send).toHaveBeenCalledTimes(1);

            // 2. Panic (should clear cache and send reset messages)
            panic();
            const callsAfterPanic = mockOutput.send.mock.calls.length;

            // 3. Send SAME value again (should be sent this time because cache was cleared)
            sendMIDICC(channel, controller, 100, time);
            expect(mockOutput.send).toHaveBeenCalledTimes(callsAfterPanic + 1);
            expect(mockOutput.send).toHaveBeenLastCalledWith([0xb0, 11, 100], expect.any(Number));
        });
    });

    describe('Utilities & Helpers', () => {
        it('should correctly map drum names to notes using sendMIDIDrum', () => {
            midi.drumsChannel = 10;
            sendMIDIDrum('Kick', 1000, 0.8);

            expect(mockOutput.send).toHaveBeenCalledTimes(1);
            const [status, note] = mockOutput.send.mock.calls[0][0];

            expect(status).toBe(0x99); // Channel 10 Note On
            expect(note).toBe(36); // Kick
        });

        it('should send explicit Note Offs for all active notes when panic() is called', () => {
            sendMIDINote(1, 60, 0.8, 1000, 2.0);
            sendMIDINote(2, 62, 0.8, 1000, 2.0);

            expect(mockOutput.send).toHaveBeenCalledTimes(2);

            panic();

            const messages = mockOutput.send.mock.calls.map((c) => c[0]);

            expect(messages).toContainEqual([0x80, 60, 0]);
            expect(messages).toContainEqual([0x81, 62, 0]);
            expect(messages).toContainEqual([0xb0, 123, 0]); // All Notes Off
        });

        it('should send Pitch Bend message when bend option is provided', () => {
            sendMIDINote(1, 60, 0.8, 1000, 1.0, { bend: -4096 });

            const calls = mockOutput.send.mock.calls;

            // Expect: Pitch Bend (Val), Pitch Bend (Reset), Note On
            expect(calls.length).toBe(3);

            // 1. Pitch Bend (Requested)
            // Value: -4096 + 8192 = 4096. 4096 in 7-bit: LSB=0, MSB=32 (0x20)
            expect(calls[0][0]).toEqual([0xe0, 0, 0x20]);

            // 2. Pitch Bend (Reset)
            expect(calls[1][0]).toEqual([0xe0, 0, 0x40]);

            // 3. Note On
            expect(calls[2][0]).toEqual([0x90, 60, 0.8]);
        });
    });
});
