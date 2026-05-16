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
        it('should update all supported parameters', () => {
            const params = {
                enabled: true,
                theme: 'neon',
                mode: 'matrix',
                fullscreen: true,
                fps: 60,
                showGrid: false,
                showNotes: true,
                showChords: true,
            };

            for (const [param, value] of Object.entries(params)) {
                vizReducer({
                    type: ACTIONS.SET_PARAM,
                    payload: { module: 'vizState', param, value },
                });
                expect((vizState as any)[param]).toBe(value);
            }
        });
    });
});
