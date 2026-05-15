// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMIDITransport } from '../../../public/midi-controller.js';
import { getState } from '../../../public/state.js';

vi.mock('../../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
    subscribe: vi.fn(),
}));

describe('MIDI Controller Deep Dive', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getState.mockReturnValue({
            midi: { enabled: true, selectedOutputId: 'out-1', latency: 0 },
            playback: { audio: { currentTime: 10 } },
        });
    });

    it('should bail in sendMIDITransport if midiAccess is missing (Line 390)', () => {
        // We can't easily mock the module-local midiAccess directly, but we can
        // trigger the bail by ensuring the setup hasn't happened.
        // If we call it without initMIDI, it should bail.
        const result = sendMIDITransport('start', 10);
        expect(result).toBeUndefined();
    });

    it('should bail if midi is disabled', () => {
        getState.mockReturnValue({
            midi: { enabled: false },
        });
        const result = sendMIDITransport('start', 10);
        expect(result).toBeUndefined();
    });
});
