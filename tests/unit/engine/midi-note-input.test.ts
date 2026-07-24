// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 *
 * Story #1017 — MIDI input play-along. Note On/Off routing to the
 * performance-controller triggers (triggerSoloNote / triggerDrumSound /
 * stopSoloist), plus a regression guard for the pre-existing CC1/CC11 →
 * band-intensity mapping.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../../public/state.js';

// Mock state — minimal shape covering exactly what midi-controller.ts reads
// for note routing (midi.*, playback.audio.currentTime) plus a spy-able
// dispatch for the CC regression assertion.
vi.mock('../../../public/state.js', () => {
    const mockState = {
        midi: {
            enabled: true,
            inputEnabled: true,
            selectedInputId: null,
            drumsChannel: 10,
            velocitySensitivity: 1.0,
        },
        dispatch: vi.fn(),
        playback: { audio: { currentTime: 0 } },
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});

// Mock the performance-controller triggers so we assert call args without
// touching the real audio engine.
vi.mock('../../../public/controllers/performance-controller.js', () => ({
    triggerSoloNote: vi.fn(),
    triggerDrumSound: vi.fn(),
    stopSoloist: vi.fn(),
    stopDrums: vi.fn(),
}));

import { initMIDI } from '../../../public/controllers/midi-controller.js';
import {
    stopSoloist,
    triggerDrumSound,
    triggerSoloNote,
} from '../../../public/controllers/performance-controller.js';
import { getFrequency } from '../../../public/utils.js';

const { midi, dispatch } = getState();

describe('MIDI Note Input Routing (play-along)', () => {
    let mockInput;
    let mockMidiAccess;

    beforeEach(async () => {
        vi.clearAllMocks();

        midi.enabled = true;
        midi.inputEnabled = true;
        midi.selectedInputId = null;
        midi.drumsChannel = 10;
        midi.velocitySensitivity = 1.0;

        mockInput = { id: 'input-1', onmidimessage: null };
        mockMidiAccess = {
            inputs: new Map([['input-1', mockInput]]),
            outputs: new Map(),
            onstatechange: null,
        };

        global.navigator.requestMIDIAccess = vi.fn().mockResolvedValue(mockMidiAccess);
        await initMIDI();
    });

    it('routes Note On (non-drum channel) to triggerSoloNote with frequency + velocity', () => {
        // Note On, channel 1 (status 0x90), note 60 (middle C), velocity 100
        mockInput.onmidimessage({ data: new Uint8Array([0x90, 60, 100]) });

        expect(triggerSoloNote).toHaveBeenCalledTimes(1);
        const args = triggerSoloNote.mock.calls[0];
        expect(args[0]).toBeCloseTo(getFrequency(60), 5); // freq
        expect(args[3]).toBeCloseTo(100 / 127, 5); // vol derived from velocity
    });

    it('truncates the soloist voice via stopSoloist on Note Off once all held notes are released', () => {
        mockInput.onmidimessage({ data: new Uint8Array([0x90, 60, 100]) });
        expect(stopSoloist).not.toHaveBeenCalled();

        mockInput.onmidimessage({ data: new Uint8Array([0x80, 60, 0]) }); // Note Off
        expect(stopSoloist).toHaveBeenCalledTimes(1);
    });

    it('treats Note On with velocity 0 as a Note Off (MIDI running-status convention)', () => {
        mockInput.onmidimessage({ data: new Uint8Array([0x90, 60, 100]) });
        mockInput.onmidimessage({ data: new Uint8Array([0x90, 60, 0]) });

        expect(triggerSoloNote).toHaveBeenCalledTimes(1);
        expect(stopSoloist).toHaveBeenCalledTimes(1);
    });

    it('does not cut the soloist voice when releasing one note of a still-held chord', () => {
        mockInput.onmidimessage({ data: new Uint8Array([0x90, 60, 100]) });
        mockInput.onmidimessage({ data: new Uint8Array([0x90, 64, 100]) });

        mockInput.onmidimessage({ data: new Uint8Array([0x80, 60, 0]) }); // release first note only
        expect(stopSoloist).not.toHaveBeenCalled();

        mockInput.onmidimessage({ data: new Uint8Array([0x80, 64, 0]) }); // release the last one
        expect(stopSoloist).toHaveBeenCalledTimes(1);
    });

    it('routes Note On on the drums channel to triggerDrumSound via the reverse DRUM_MAP', () => {
        // Channel 10 (drumsChannel) => status nibble 0x99 (0x90 | 9)
        mockInput.onmidimessage({ data: new Uint8Array([0x99, 36, 100]) }); // GM Kick = 36

        expect(triggerDrumSound).toHaveBeenCalledTimes(1);
        const args = triggerDrumSound.mock.calls[0];
        expect(args[0]).toBe('Kick');
        expect(args[2]).toBeCloseTo(100 / 127, 5);
    });

    it('ignores Note Off on the drums channel (one-shot triggers, no sustain to release)', () => {
        mockInput.onmidimessage({ data: new Uint8Array([0x89, 36, 0]) }); // Note Off, channel 10
        expect(triggerDrumSound).not.toHaveBeenCalled();
    });

    it('does not route Note On/Off when inputEnabled is false', () => {
        midi.inputEnabled = false;
        mockInput.onmidimessage({ data: new Uint8Array([0x90, 60, 100]) });
        expect(triggerSoloNote).not.toHaveBeenCalled();
    });

    it('ignores messages from a non-selected input once a specific input is chosen', () => {
        midi.selectedInputId = 'some-other-input';
        mockInput.onmidimessage({ data: new Uint8Array([0x90, 60, 100]) });
        expect(triggerSoloNote).not.toHaveBeenCalled();
    });

    // Regression guard: the pre-existing CC1/CC11 -> band-intensity mapping
    // must keep working exactly as before, independent of the new note-input
    // gate (inputEnabled=false here, on purpose, to prove CC isn't gated by it).
    it('still routes CC11 (Expression) to SET_BAND_INTENSITY regardless of inputEnabled', () => {
        midi.inputEnabled = false;
        mockInput.onmidimessage({ data: new Uint8Array([0xb0, 11, 64]) });
        expect(dispatch).toHaveBeenCalledWith('SET_BAND_INTENSITY', 64 / 127);
    });

    it('still routes CC1 (Modulation) to SET_BAND_INTENSITY regardless of inputEnabled', () => {
        midi.inputEnabled = false;
        mockInput.onmidimessage({ data: new Uint8Array([0xb0, 1, 127]) });
        expect(dispatch).toHaveBeenCalledWith('SET_BAND_INTENSITY', 1.0);
    });

    it('ignores all MIDI messages (CC and note) when midi.enabled is false', () => {
        midi.enabled = false;
        dispatch.mockClear(); // drop the SET_MIDI_CONFIG calls initMIDI() made in beforeEach
        mockInput.onmidimessage({ data: new Uint8Array([0xb0, 11, 64]) });
        mockInput.onmidimessage({ data: new Uint8Array([0x90, 60, 100]) });

        expect(dispatch).not.toHaveBeenCalled();
        expect(triggerSoloNote).not.toHaveBeenCalled();
    });
});
