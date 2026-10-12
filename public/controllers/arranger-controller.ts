import { KEY_ORDER } from '../config.js';
import { validateProgression } from '../engine/chords-engine.js';
import { restoreGains } from '../engine/engine.js';
import { transposeChordText } from '../engine/transpose.js';
import { dispatch, getState, stateMap } from '../state.js';
import type { Section } from '../types.js';
import { ACTIONS } from '../types.js';
import { normalizeKey } from '../utils.js';
import { flushBuffers } from './instrument-controller.js';

/**
 * The "arrangement changed — resync everything" sequence `transposeKey` ends in.
 * It saves nothing: v1's session save went with its load/save layer (#1424), and
 * v2 saves a chart only when the musician asks (`prototypes/v2/lib/runtime.ts`'s
 * `captureContent`).
 */
function refreshArrangerUI(): void {
    validateProgression(stateMap);
    flushBuffers();
    restoreGains(stateMap);
}

export function transposeKey(delta: number): void {
    const { arranger } = getState();
    const currentKeyName = arranger.key || 'C';
    const currentIndex = KEY_ORDER.indexOf(normalizeKey(currentKeyName));
    const newKey = KEY_ORDER[(((currentIndex + delta) % 12) + 12) % 12];

    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'key', value: newKey });

    // Absolute transpose: note-name roots AND slash basses move by delta; Roman/NNS tokens
    // are key-relative and stay put (the key label above moves by the same delta). Uses the
    // single tokenizer in transpose.ts — this is the fix that gets the slash bass to
    // transpose (`C/E` +2 → `D/Gb`, previously `D/E`). Each section is a new object: the
    // live ones are state, and state changes only through the dispatch below (#1634).
    const sections = arranger.sections.map((section: Section): Section => {
        const next: Section = { ...section, value: transposeChordText(section.value, delta) };
        if (section.key) {
            const secKeyIndex = KEY_ORDER.indexOf(normalizeKey(section.key));
            if (secKeyIndex !== -1) {
                next.key = KEY_ORDER[(((secKeyIndex + delta) % 12) + 12) % 12];
            }
        }
        return next;
    });

    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'sections', value: sections });

    refreshArrangerUI();
}
