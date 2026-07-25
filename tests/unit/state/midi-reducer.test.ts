import { describe, expect, it } from 'vitest';
import { midi, midiReducer } from '../../../public/state/midi.js';
import { ACTIONS } from '../../../public/types.js';

describe('MIDI State Reducer', () => {
    /**
     * #1259 — this slice had no `RESET_STATE` case at all, so the entire persisted MIDI
     * config survived `hydrateState()`'s "starting fresh" corrupt-payload fallback.
     *
     * These assert the reset *values*, which `tests/unit/state/reset-state-inverse.test.ts`
     * deliberately cannot: that guard takes the post-reset manifest as its own baseline,
     * so it proves the reset is complete but would happily define a wrong default as
     * "fresh". A `drumsChannel` of 1 instead of 10 passes the entire suite without this.
     */
    describe('RESET_STATE (#1259)', () => {
        const DEFAULTS: Record<string, unknown> = {
            enabled: false,
            selectedOutputId: null,
            inputEnabled: false,
            selectedInputId: null,
            chordsChannel: 1,
            bassChannel: 2,
            soloistChannel: 3,
            harmonyChannel: 4,
            // General MIDI puts drums on channel 10 — the one channel default that is a
            // convention rather than a lane index, and so the one worth stating.
            drumsChannel: 10,
            latency: 0,
            muteLocal: true,
            chordsOctave: 0,
            bassOctave: 0,
            soloistOctave: 0,
            harmonyOctave: 0,
            drumsOctave: 0,
            velocitySensitivity: 1.0,
        };

        it.each(Object.entries(DEFAULTS))('restores %s to its default', (param, expected) => {
            midiReducer({
                type: ACTIONS.SET_PARAM,
                payload: { module: 'midi', param, value: 'poisoned' },
            });
            midiReducer({ type: ACTIONS.RESET_STATE, payload: undefined });
            expect((midi as any)[param]).toBe(expected);
        });

        // The hardware-enumeration mirror is deliberately left alone: it is rebuilt by
        // `syncMIDIOutputs`/`syncMIDIInputs` from the controller's live `midiAccess`, is
        // never persisted, and clearing it would blank the device pickers while the ports
        // stayed open. Pinned so a well-meaning "reset the whole slice" change fails here.
        it.each(['outputs', 'inputs'])('leaves the live %s device mirror untouched', (param) => {
            const ports = [{ id: 'p1', name: 'Device' }];
            midiReducer({
                type: ACTIONS.SET_PARAM,
                payload: { module: 'midi', param, value: ports },
            });
            midiReducer({ type: ACTIONS.RESET_STATE, payload: undefined });
            expect((midi as any)[param]).toEqual(ports);
        });
    });

    it('should update configuration via ACTIONS.SET_MIDI_CONFIG', () => {
        const payload = { enabled: true, selectedOutputId: 'port-1' };
        midiReducer({ type: ACTIONS.SET_MIDI_CONFIG, payload });
        expect(midi.enabled).toBe(true);
        expect(midi.selectedOutputId).toBe('port-1');
    });

    describe('setMidiParam via reducer', () => {
        it('should update individual parameters', () => {
            const params = {
                enabled: false,
                inputs: [{ id: 'in1' }],
                outputs: [{ id: 'out1' }],
                selectedOutputId: 'out1',
                learningState: 'cc',
                learnedMappings: { map: 1 },
                ccValues: { cc: 1 },
                syncOut: true,
                channels: { chords: 1 },
                access: { a: 1 },
                noteToEngineMap: { n: 1 },
            };

            for (const [param, value] of Object.entries(params)) {
                midiReducer({ type: ACTIONS.SET_PARAM, payload: { module: 'midi', param, value } });
                expect((midi as any)[param]).toEqual(value);
            }
        });
    });
});
