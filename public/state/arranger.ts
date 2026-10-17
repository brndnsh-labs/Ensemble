import { deepSignal } from 'deepsignal/core';
import { normalizeSongSeed } from '../sanitize.js';
import type { Action, ArrangerState, Mutable } from '../types.js';
import { ACTIONS } from '../types.js';
import { writeDeclaredParam } from './set-param.js';

export type { ArrangerState };

export const arranger = deepSignal<ArrangerState>({
    sections: [{ id: 's1', label: 'Intro', repeat: 1 }],
    key: 'C',
    timeSignature: '4/4',
    grouping: null,
    isMinor: false,
    notation: 'roman',
    seed: '',
    randomizeSeed: true,
});

export function arrangerReducer(action: Action): boolean {
    const a = arranger as Mutable<typeof arranger>;
    switch (action.type) {
        case ACTIONS.SET_PARAM:
            if (action.payload.module === 'arranger') {
                const { param, value } = action.payload;
                // #1266 — `seed` is bounded on the way IN, on every write path, so the
                // slice can only ever hold a value all three readers agree on. This
                // generic write has no `seed` caller today; it is normalized anyway
                // because "the reducer is the bound" is only true if it has no hole.
                const meterChanged = param === 'timeSignature' && a.timeSignature !== value;
                if (
                    !writeDeclaredParam(
                        arranger,
                        'arranger',
                        param,
                        param === 'seed' ? normalizeSongSeed(value) : value,
                    )
                ) {
                    return false;
                }
                if (meterChanged) {
                    a.grouping = null;
                }
                return true;
            }
            break;
        case ACTIONS.SET_NOTATION:
            a.notation = action.payload;
            return true;
        case ACTIONS.SET_SONG_SEED:
            // #1266 — the single bound on the seed keyspace, applied at the write
            // side. See `normalizeSongSeed` in sanitize.ts for why one write-side
            // bound replaced three disagreeing read-side ones.
            a.seed = normalizeSongSeed(action.payload);
            return true;
    }
    return false;
}
