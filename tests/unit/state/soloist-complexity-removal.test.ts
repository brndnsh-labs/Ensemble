// @ts-nocheck
/**
 * #1070 — `soloist.complexity` is deleted from state, types and the ownership manifest. The
 * flat-keyed soloist payload path (`applySoloistPayload`, reached via `SET_PARAM` — the
 * batch-form `UPDATE_SB` action was deleted in #1381, nothing dispatched it) must DROP it
 * rather than let the reducer's unknown-key fall-through resurrect it as a stray top-level
 * field — the same trap `motifTracking` and `pinnedProfile` fell into in #866.
 *
 * #1424 removed five more soloist settings the same way. (The saved-session and
 * share-URL cases went with v1's readers in that change.)
 */
import { describe, expect, it } from 'vitest';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

describe('soloist.complexity removal (#1070)', () => {
    it('drops complexity from a soloist SET_PARAM payload instead of creating a stray field', () => {
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'complexity', value: 0.9 });
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'volume', value: 0.25 });

        const { soloist } = getState();
        expect(soloist.volume).toBeCloseTo(0.25);
        expect(soloist.complexity).toBeUndefined();
    });

    // #1424 — the old engine's soloist settings went the same way.
    it.each(['preset', 'octave', 'phrasingIntensity', 'tradeMode', 'tradeSilenced'])(
        'drops a stray %s instead of creating a top-level field',
        (key) => {
            dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'volume', value: 0.5 });
            dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: key, value: 1 });

            const { soloist } = getState();
            expect(soloist.volume).toBeCloseTo(0.5);
            expect(Object.hasOwn(soloist, key)).toBe(false);
        },
    );
});
