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

const NOTE_MATCH_PATTERN = /^([A-G](?:[#b♯♭])?)(.*)/i;

export function saveProgression(): void {
    const { arranger } = getState();
    const name = prompt(
        'Name your chord progression:',
        arranger.lastChordPreset || 'My Progression',
    );
    if (!name) {
        return;
    }

    let userPresets: any[] = [];
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

export function validateAndAnalyze(): void {
    validateProgression(stateMap, undefined, () => {
        analyzeFormUI();
    });
}

export function clearChordPresetHighlight(): void {
    // DOM manipulation is no longer needed; PresetLibrary.jsx tracks isDirty state
    // Keeping this function as a no-op to maintain API compatibility
}

export function refreshArrangerUI(): void {
    validateAndAnalyze();
    syncWorker();
    flushBuffers();
    restoreGains(stateMap);
    saveCurrentState();
}

export function onSectionUpdate(id: string, field: string, value: any): void {
    const { arranger } = getState();
    if (field === 'reorder') {
        const sectionMap = new Map(arranger.sections.map((s: any) => [s.id, s]));
        const newSections = value.map((sid: string) => sectionMap.get(sid));

        const currentIds = arranger.sections.map((s: any) => s.id);
        const hasChanged =
            value.length !== currentIds.length ||
            value.some((id: string, index: number) => id !== currentIds[index]);

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
        const index = arranger.sections.findIndex((s: any) => s.id === id);
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

export function onSectionDelete(id: string): void {
    const { arranger } = getState();
    if (arranger.sections.length <= 1) {
        return;
    }

    const section = arranger.sections.find((s: any) => s.id === id);
    if (section?.value && section.value.trim() !== '' && section.value.trim() !== 'I') {
        if (!confirm(`Delete section "${section.label || 'Untitled'}" and its chords?`)) {
            return;
        }
    }

    dispatch(ACTIONS.SET_PARAM, {
        module: 'arranger',
        param: 'sections',
        value: arranger.sections.filter((s: any) => s.id !== id),
    });
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    clearChordPresetHighlight();
    refreshArrangerUI();
}

export function onSectionDuplicate(id: string): void {
    const { arranger } = getState();
    const section = arranger.sections.find((s: any) => s.id === id);
    if (!section) {
        return;
    }
    pushHistory();
    const newSection = { ...section, id: generateId(), label: `${section.label} (Copy)` };
    const index = arranger.sections.findIndex((s: any) => s.id === id);
    const newSections = [...arranger.sections];
    newSections.splice(index + 1, 0, newSection);
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'sections', value: newSections });
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    clearChordPresetHighlight();
    refreshArrangerUI();
}

export function addSection(): void {
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

export function transposeKey(delta: number): void {
    const { arranger } = getState();
    const currentKeyName = arranger.key || 'C';
    const currentIndex = KEY_ORDER.indexOf(normalizeKey(currentKeyName));
    const newKey = KEY_ORDER[(currentIndex + delta + 12) % 12];

    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'key', value: newKey });

    const isMusicalNotation = (part: string): RegExpMatchArray | null => {
        return (
            part.match(/^(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i) ||
            part.match(/^[#b♯♭](III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i)
        );
    };

    arranger.sections.forEach((section: any) => {
        const parts = section.value.split(/([\s,|,-]+)/);
        const transposed = parts.map((part: string) => {
            const noteMatch = part.match(NOTE_MATCH_PATTERN);
            if (noteMatch && !isMusicalNotation(part)) {
                let rootStr = noteMatch[1];
                rootStr = rootStr.replace('♯', '#').replace('♭', 'b');

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

        if (section.key) {
            const secKeyIndex = KEY_ORDER.indexOf(normalizeKey(section.key));
            if (secKeyIndex !== -1) {
                section.key = KEY_ORDER[(secKeyIndex + delta + 12) % 12];
            }
        }
    });

    // We mutated sections directly in the loop, so dispatch an updated array reference
    dispatch(ACTIONS.SET_PARAM, {
        module: 'arranger',
        param: 'sections',
        value: [...arranger.sections],
    });

    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    clearChordPresetHighlight();
    refreshArrangerUI();
}

export function switchToRelativeKey(): void {
    const { arranger } = getState();
    const wasMinor = !!arranger.isMinor;
    const currentIndex = KEY_ORDER.indexOf(normalizeKey(arranger.key));
    const shift = wasMinor ? 3 : -3;
    const newKey = KEY_ORDER[(currentIndex + shift + 12) % 12];

    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'key', value: newKey });
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isMinor', value: !wasMinor });

    pushHistory();
    arranger.sections.forEach((section: any) => {
        section.value = transformRelativeProgression(section.value, shift);

        if (section.key) {
            const secKeyIndex = KEY_ORDER.indexOf(normalizeKey(section.key));
            if (secKeyIndex !== -1) {
                section.key = KEY_ORDER[(secKeyIndex + shift + 12) % 12];
            }
        }
    });

    // We mutated sections directly in the loop, so dispatch an updated array reference
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
