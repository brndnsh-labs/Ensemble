import { describe, expect, it, vi } from 'vitest';
import { setVizParam, vizReducer, vizState } from '../../../public/state/visualizer.js';
import { ACTIONS } from '../../../public/types.js';

describe('Visualizer State Reducer', () => {
    it('should toggle enabled state', () => {
        vizReducer(ACTIONS.SET_VIZ_ENABLED, true);
        expect(vizState.enabled).toBe(true);
        vizReducer(ACTIONS.SET_VIZ_ENABLED, false);
        expect(vizState.enabled).toBe(false);
    });

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

    describe('setVizParam', () => {
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
                setVizParam(param, value);
                expect(vizState[param]).toBe(value);
            }
        });

        it('should log warning for unknown parameters', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            setVizParam('unknown', 'val');
            expect(spy).toHaveBeenCalled();
        });
    });
});
