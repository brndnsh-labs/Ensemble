import { describe, expect, it } from 'vitest';
import { vizReducer, vizState } from '../../../public/state/visualizer.js';
import { ACTIONS } from '../../../public/types.js';

describe('Visualizer State Reducer', () => {
    it('should handle generic SET_PARAM action', () => {
        vizReducer(ACTIONS.SET_PARAM, { module: 'vizState', param: 'showGrid', value: true });
        expect(vizState.showGrid).toBe(true);

        const result = vizReducer(ACTIONS.SET_PARAM, {
            module: 'other',
            param: 'showGrid',
            value: false,
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
                vizReducer(ACTIONS.SET_PARAM, { module: 'vizState', param, value });
                expect(vizState[param]).toBe(value);
            }
        });
    });
});
