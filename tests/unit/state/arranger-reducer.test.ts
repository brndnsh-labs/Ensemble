import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arranger, arrangerReducer } from '../../../public/state/arranger.js';
import { ACTIONS, type ArrangerState, type Mutable } from '../../../public/types.js';
import { resetAllStateForTest } from '../../utils/reset-state.js';

const mutableArranger = arranger as Mutable<typeof arranger>;

describe('Arranger Reducer', () => {
    beforeEach(() => {
        resetAllStateForTest();
    });

    it('should set notation style', () => {
        arrangerReducer({ type: ACTIONS.SET_NOTATION, payload: 'nns' });
        expect(arranger.notation).toBe('nns');
    });

    // #1381 — ACTIONS.SET_TIME_SIGNATURE was deleted (nothing dispatched it); the live
    // meter write goes through generic SET_PARAM, which replicates the same
    // clears-grouping-on-meter-change behavior (`meterChanged` in arranger.ts).
    it('clears authored grouping whenever SET_PARAM changes the meter', () => {
        mutableArranger.timeSignature = '4/4';
        mutableArranger.grouping = [3, 2];
        arrangerReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'arranger', param: 'timeSignature', value: '7/8' },
        });
        expect(arranger.grouping).toBeNull();
    });

    it('preserves authored grouping when a meter SET_PARAM is a no-op', () => {
        mutableArranger.timeSignature = '5/4';
        mutableArranger.grouping = [2, 3];

        arrangerReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'arranger', param: 'timeSignature', value: '5/4' },
        });
        expect(arranger.grouping).toEqual([2, 3]);
    });

    it('does not create a field the slice does not declare (#1633)', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = arrangerReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'arranger', param: 'noSuchField', value: 1 },
        } as any);
        expect(result).toBe(false);
        expect(Object.hasOwn(arranger, 'noSuchField')).toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("'arranger' has no field 'noSuchField'");
        warn.mockRestore();
    });

    describe('setArrangerParam', () => {
        it('should update all supported parameters', () => {
            const params: { [K in keyof ArrangerState]?: unknown } = {
                sections: [],
                progression: [{ c: 1 }],
                key: 'F#',
                timeSignature: '3/4',
                grouping: [3, 2],
                isMinor: true,
                notation: 'name',
                totalSteps: 128,
                stepMap: [{ s: 1 }],
                sectionMap: [{ id: '1' }],
            };

            for (const [param, value] of Object.entries(params) as Array<
                [keyof ArrangerState, unknown]
            >) {
                arrangerReducer({
                    type: ACTIONS.SET_PARAM,
                    payload: { module: 'arranger', param, value },
                });
                expect((arranger as any)[param]).toEqual(value);
            }
        });
    });
});
