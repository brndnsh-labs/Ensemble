const NOTE_MATCH_PATTERN = /^([A-G](?:[#b\u266F\u266D])?)(.*)/i;

import { KEY_ORDER } from './config.js';
import {
    mutateProgression,
    transformRelativeProgression,
    validateProgression,
} from './engine/chords-engine.js';

export { mutateProgression, transformRelativeProgression, validateProgression };

import { analyzeFormUI } from './engine/conductor.js';
import { restoreGains } from './engine/engine.js';
import { pushHistory } from './history.js';
import { flushBuffers } from './instrument-controller.js';
import { saveCurrentState } from './persistence.js';
import { dispatch, getState, stateMap } from './state.js';
import { ACTIONS } from './types.js';
import { showToast } from './ui.js';
import { compressSections, generateId, normalizeKey } from './utils.js';
import { syncWorker } from './worker-client.js';

export function saveProgression() {
    const { arranger } = getState();
    const name = prompt(
        'Name your chord progression:',
        arranger.lastChordPreset || 'My Progression',
    );
    if (!name) {
        return;
    }

    let userPresets = [];
    try {
        userPresets = JSON.parse(localStorage.getItem('ensemble_userPresets') || '[]');
        if (!Array.isArray(userPresets)) {
            userPresets = [];
        }
    } catch (e) {
        console.warn('[State] Failed to parse ensemble_userPresets from storage:', e);
    }
    const newPreset = {
        name: name.substring(0, 32),
        sections: compressSections(arranger.sections),
        isMinor: arranger.isMinor,
        timestamp: Date.now(),
    };

    userPresets.push(newPreset);
    localStorage.setItem('ensemble_userPresets', JSON.stringify(userPresets));
    window.dispatchEvent(new Event('storage_sync'));
    showToast(`Saved "${name}" to library`);
}

export function validateAndAnalyze() {
    validateProgression(stateMap, undefined, () => {
        analyzeFormUI();
    });
}

export function clearChordPresetHighlight() {
    // DOM manipulation is no longer needed; PresetLibrary.jsx tracks isDirty state
    // Keeping this function as a no-op to maintain API compatibility
}

export function refreshArrangerUI() {
    validateAndAnalyze();
    syncWorker();
    flushBuffers();
    restoreGains(stateMap);
    saveCurrentState();
}

/**
 * @param {string} id
 * @param {string} field
 * @param {any} value
 */
export function onSectionUpdate(id, field, value) {
    const { arranger } = getState();
    if (field === 'reorder') {
        const sectionMap = new Map(arranger.sections.map((/** @type {any} */ s) => [s.id, s]));
        const newSections = value.map((/** @type {string} */ sid) => sectionMap.get(sid));

        // Check for changes more efficiently than JSON.stringify
        const currentIds = arranger.sections.map((/** @type {any} */ s) => s.id);
        const hasChanged =
            value.length !== currentIds.length ||
            value.some(
                (/** @type {string} */ id, /** @type {number} */ index) => id !== currentIds[index],
            );

        if (hasChanged) {
            pushHistory();
            dispatch(ACTIONS.SET_PARAM, {
                module: 'arranger',
                param: 'sections',
                value: newSections,
            });
        } else {
            return;
        }
    } else {
        const index = arranger.sections.findIndex((s) => s.id === id);
        if (index === -1) {
            return;
        }
        const section = arranger.sections[index];
        if (field === 'move') {
            const newIndex = index + value;
            if (newIndex >= 0 && newIndex < arranger.sections.length) {
                pushHistory();
                const newSections = [...arranger.sections];
                const temp = newSections[index];
                newSections[index] = newSections[newIndex];
                newSections[newIndex] = temp;
                dispatch(ACTIONS.SET_PARAM, {
                    module: 'arranger',
                    param: 'sections',
                    value: newSections,
                });
            } else {
                return;
            }
        } else {
            const newSections = [...arranger.sections];
            newSections[index] = { ...section, [field]: value };
            dispatch(ACTIONS.SET_PARAM, {
                module: 'arranger',
                param: 'sections',
                value: newSections,
            });
        }
    }
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    if (field === 'reorder' || field === 'move' || field === 'value') {
        clearChordPresetHighlight();
    }
    validateAndAnalyze();
    flushBuffers();
    saveCurrentState();
}

/** @param {string} id */
export function onSectionDelete(id) {
    const { arranger } = getState();
    if (arranger.sections.length <= 1) {
        return;
    }

    const section = arranger.sections.find((s) => s.id === id);
    // Prompt if section has content (ignoring the default 'I' for new sections)
    if (section?.value && section.value.trim() !== '' && section.value.trim() !== 'I') {
        if (!confirm(`Delete section "${section.label || 'Untitled'}" and its chords?`)) {
            return;
        }
    }

    dispatch(ACTIONS.SET_PARAM, {
        module: 'arranger',
        param: 'sections',
        value: arranger.sections.filter((/** @type {any} */ s) => s.id !== id),
    });
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    clearChordPresetHighlight();
    refreshArrangerUI();
}

/** @param {string} id */
export function onSectionDuplicate(id) {
    const { arranger } = getState();
    const section = arranger.sections.find((s) => s.id === id);
    if (!section) {
        return;
    }
    pushHistory();
    const newSection = { ...section, id: generateId(), label: `${section.label} (Copy)` };
    const index = arranger.sections.findIndex((s) => s.id === id);
    const newSections = [...arranger.sections];
    newSections.splice(index + 1, 0, newSection);
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'sections', value: newSections });
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    clearChordPresetHighlight();
    refreshArrangerUI();
}

export function addSection() {
    const { arranger } = getState();
    dispatch(ACTIONS.SET_PARAM, {
        module: 'arranger',
        param: 'sections',
        value: [
            ...arranger.sections,
            {
                id: generateId(),
                label: `Section ${arranger.sections.length + 1}`,
                value: 'I',
                repeat: 1,
            },
        ],
    });
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    clearChordPresetHighlight();
    refreshArrangerUI();
}

/** @param {number} delta */
export function transposeKey(delta) {
    const { arranger } = getState();
    // Use arranger.key as the source of truth
    const currentKeyName = arranger.key || 'C';
    const currentIndex = KEY_ORDER.indexOf(normalizeKey(currentKeyName));
    const newKey = KEY_ORDER[(currentIndex + delta + 12) % 12];

    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'key', value: newKey });

    /** @param {string} part */
    const isMusicalNotation = (part) => {
        return (
            part.match(/^(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i) ||
            part.match(/^[#b\u266F\u266D](III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i)
        );
    };

    arranger.sections.forEach((section) => {
        const parts = section.value.split(/([\s,|,-]+)/);
        const transposed = parts.map((part) => {
            const noteMatch = part.match(NOTE_MATCH_PATTERN);
            if (noteMatch && !isMusicalNotation(part)) {
                let rootStr = noteMatch[1];
                // Normalize Unicode to ASCII for lookup
                rootStr = rootStr.replace('\u266F', '#').replace('\u266D', 'b');

                const root = normalizeKey(
                    rootStr.charAt(0).toUpperCase() + rootStr.slice(1).toLowerCase(),
                );
                const rootIndex = KEY_ORDER.indexOf(root);

                if (rootIndex !== -1) {
                    const newRoot = KEY_ORDER[(rootIndex + delta + 12) % 12];
                    return newRoot + noteMatch[2];
                }
            }
            return part;
        });
        section.value = transposed.join('');

        // Also transpose explicit section key if present
        if (section.key) {
            const secKeyIndex = KEY_ORDER.indexOf(normalizeKey(section.key));
            if (secKeyIndex !== -1) {
                section.key = KEY_ORDER[(secKeyIndex + delta + 12) % 12];
            }
        }
    });

    // We mutated the `sections` objects directly in the loop, so we should dispatch the updated array reference
    dispatch(ACTIONS.SET_PARAM, {
        module: 'arranger',
        param: 'sections',
        value: [...arranger.sections],
    });

    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    clearChordPresetHighlight();
    refreshArrangerUI();
}

export function switchToRelativeKey() {
    const { arranger } = getState();
    const wasMinor = !!arranger.isMinor;
    const currentIndex = KEY_ORDER.indexOf(normalizeKey(arranger.key));
    const shift = wasMinor ? 3 : -3;
    const newKey = KEY_ORDER[(currentIndex + shift + 12) % 12];

    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'key', value: newKey });
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isMinor', value: !wasMinor });

    pushHistory();
    arranger.sections.forEach((section) => {
        section.value = transformRelativeProgression(section.value, shift);

        // Also transpose explicit section key if present
        if (section.key) {
            const secKeyIndex = KEY_ORDER.indexOf(normalizeKey(section.key));
            if (secKeyIndex !== -1) {
                section.key = KEY_ORDER[(secKeyIndex + shift + 12) % 12];
            }
        }
    });

    // We mutated the `sections` objects directly in the loop, so we should dispatch the updated array reference
    dispatch(ACTIONS.SET_PARAM, {
        module: 'arranger',
        param: 'sections',
        value: [...arranger.sections],
    });

    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    refreshArrangerUI();
    showToast(
        `Switched to Relative ${arranger.isMinor ? 'Minor' : 'Major'}: ${newKey}${arranger.isMinor ? 'm' : ''}`,
    );
}
