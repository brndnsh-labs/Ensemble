import { deepSignal } from 'deepsignal';
import { normalizeSongSeed } from '../sanitize.js';
import type { Action, ArrangerState, Mutable, Section } from '../types.js';
import { ACTIONS } from '../types.js';

export type { ArrangerState, Section };

export const arranger = deepSignal<ArrangerState>({
    sections: [{ id: 's1', label: 'Intro', value: 'I | V | vi | IV', repeat: 1 }],
    progression: [],
    key: 'C',
    timeSignature: '4/4',
    grouping: null,
    isMinor: false,
    notation: 'roman',
    valid: false,
    totalSteps: 0,
    stepMap: [],
    measureMap: [],
    sectionMap: [],
    history: [],
    lastInteractedSectionId: 's1',
    lastChordPreset: 'Pop (Standard)',
    mutatedSectionId: null,
    isDirty: false,
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
                // generic back door has no `seed` caller today; it is normalized anyway
                // because "the reducer is the bound" is only true if it has no hole.
                (arranger as Record<string, unknown>)[param] =
                    param === 'seed' ? normalizeSongSeed(value) : value;
                return true;
            }
            break;
        case ACTIONS.RESET_STATE:
            a.sections = [
                {
                    id: 's1',
                    label: 'Intro',
                    value: 'I | V | vi | IV',
                    repeat: 1,
                },
            ];
            a.key = 'C';
            a.timeSignature = '4/4';
            a.notation = 'roman';
            a.isMinor = false;
            a.isDirty = false;
            a.history = [];
            a.grouping = null;
            a.seed = '';
            // #1259 — these two are hydrated from the persisted payload, so leaving
            // them out made RESET_STATE an incomplete inverse: the corrupt-payload
            // fallback in `hydrateState()` promises a fresh session and delivered a
            // default chart still carrying the old preset name.
            a.lastChordPreset = 'Pop (Standard)';
            a.randomizeSeed = true;
            return true;
        case ACTIONS.SET_NOTATION:
            a.notation = action.payload;
            return true;
        case ACTIONS.SET_TIME_SIGNATURE:
            a.timeSignature = action.payload;
            return true;
        case ACTIONS.SET_GROUPING:
            a.grouping = action.payload;
            return true;
        case ACTIONS.SET_KEY:
            a.key = action.payload;
            return true;
        case ACTIONS.LOAD_TEMPLATE:
            a.sections = action.payload.sections;
            if (action.payload.isMinor !== undefined) {
                a.isMinor = action.payload.isMinor;
            }
            if (action.payload.key !== undefined) {
                a.key = action.payload.key;
            }
            if (action.payload.timeSignature !== undefined) {
                a.timeSignature = action.payload.timeSignature;
            }
            a.isDirty = true;
            return true;
        case ACTIONS.SET_ARRANGEMENT:
            a.sections = action.payload;
            return true;
        case ACTIONS.SET_SECTIONS:
            a.sections = action.payload;
            a.isDirty = true;
            return true;
        case ACTIONS.SET_IS_MINOR:
            a.isMinor = !!action.payload;
            return true;
        case ACTIONS.SET_SONG_SEED:
            // #1266 — the single bound on the seed keyspace, applied at the write
            // side. See `normalizeSongSeed` in sanitize.ts for why one write-side
            // bound replaced three disagreeing read-side ones.
            a.seed = normalizeSongSeed(action.payload);
            return true;
        case ACTIONS.SET_SEED_RANDOMIZE:
            a.randomizeSeed = !!action.payload;
            return true;
    }
    return false;
}
