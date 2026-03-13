import { describe, expect, it, vi } from 'vitest';
import { midi, midiReducer, setMidiParam } from '../../../public/state/midi.js';
import { ACTIONS } from '../../../public/types.js';

describe('MIDI State Reducer', () => {
    it('should update configuration via ACTIONS.SET_MIDI_CONFIG', () => {
        const payload = { enabled: true, selectedOutputId: 'port-1' };
        midiReducer(ACTIONS.SET_MIDI_CONFIG, payload);
        expect(midi.enabled).toBe(true);
        expect(midi.selectedOutputId).toBe('port-1');
    });

    describe('setMidiParam', () => {
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
                noteToEngineMap: { n: 1 }
            };

            for (const [param, value] of Object.entries(params)) {
                setMidiParam(param, value);
                expect(midi[param]).toEqual(value);
            }
        });

        it('should log warning for unknown parameters', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            setMidiParam('unknown', 'val');
            expect(spy).toHaveBeenCalled();
        });
    });
});
