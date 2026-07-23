import { describe, expect, it } from 'vitest';
import { vizReducer, vizState } from '../../../public/state/visualizer.js';
import { ACTIONS } from '../../../public/types.js';

describe('Visualizer State Reducer', () => {
    it('should handle generic SET_PARAM action', () => {
        vizReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'vizState', param: 'showGrid', value: true },
        });
        expect((vizState as any).showGrid).toBe(true);

        const result = vizReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'other', param: 'showGrid', value: false },
        });
        expect(result).toBe(false);
    });

    describe('setVizParam via reducer', () => {
        // #1174 — this used to assert 8 params (theme/mode/fullscreen/fps/showGrid/
        // showNotes/showChords). Only `enabled` exists on VisualizerState; the rest
        // "passed" purely via the reducer's `(vizState as any)[param] = value`
        // passthrough, so the test asserted its own write-back and guarded nothing.
        it('should update the supported parameter', () => {
            vizReducer({
                type: ACTIONS.SET_PARAM,
                payload: { module: 'vizState', param: 'enabled', value: true },
            });
            expect(vizState.enabled).toBe(true);

            vizReducer({
                type: ACTIONS.SET_PARAM,
                payload: { module: 'vizState', param: 'enabled', value: false },
            });
            expect(vizState.enabled).toBe(false);
        });

        // #1174 — the reducer used to also accept `module: 'viz'`. Nothing dispatched
        // it (togglePower normalizes to 'vizState' first), so the alias was dead.
        it('ignores the retired `viz` module alias', () => {
            vizReducer({
                type: ACTIONS.SET_PARAM,
                payload: { module: 'vizState', param: 'enabled', value: true },
            });
            const handled = vizReducer({
                type: ACTIONS.SET_PARAM,
                payload: { module: 'viz', param: 'enabled', value: false },
            });
            expect(handled).toBe(false);
            expect(vizState.enabled).toBe(true);
        });
    });
});
