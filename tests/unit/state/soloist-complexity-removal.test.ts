// @ts-nocheck
/**
 * #1070 — `soloist.complexity` is deleted from state, types and the ownership manifest. The
 * flat-keyed `UPDATE_SB` payload path must DROP it rather than let the reducer's unknown-key
 * fall-through resurrect it as a stray top-level field — the same trap `motifTracking` and
 * `pinnedProfile` fell into in #866.
 *
 * (The saved-session and share-URL cases went with v1's readers, #1424.)
 */
import { describe, expect, it } from 'vitest';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

describe('soloist.complexity removal (#1070)', () => {
    it('drops complexity from an UPDATE_SB payload instead of creating a stray field', () => {
        dispatch(ACTIONS.UPDATE_SB, { complexity: 0.9, volume: 0.25 });

        const { soloist } = getState();
        expect(soloist.volume).toBeCloseTo(0.25);
        expect(soloist.complexity).toBeUndefined();
    });
});
