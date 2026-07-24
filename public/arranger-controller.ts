import { KEY_ORDER } from './config.js';
import {
    mutateProgression,
    transformRelativeProgression,
    validateProgression,
} from './engine/chords-engine.js';
import { transposeChordText } from './engine/transpose.js';

export { mutateProgression };

import { analyzeFormUI } from './engine/conductor.js';
import { restoreGains } from './engine/engine.js';
import { pushHistory } from './history.js';
import { flushBuffers } from './instrument-controller.js';
import { saveCurrentState } from './persistence.js';
import { dispatch, getState, stateMap } from './state.js';
import type { Chord, Section, SectionInstrumentKey } from './types.js';
import { ACTIONS } from './types.js';
import { showToast } from './ui.js';
import { compressSections, generateId, normalizeKey } from './utils.js';
import { syncWorker } from './worker-client.js';

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
        analyzeFormUI(getState().arranger);
    });
}

export function clearChordPresetHighlight(): void {
    // DOM manipulation is no longer needed; PresetLibrary.jsx tracks isDirty state
    // Keeping this function as a no-op to maintain API compatibility
}

/**
 * The canonical "arrangement changed — resync everything" sequence. Any UI that
 * mutates the progression/meter/key should end in this single call rather than
 * hand-copying the steps (the divergence #1128 consolidated).
 *
 * #1120 — the order is load-bearing: `syncWorker()` must run BEFORE
 * `flushBuffers()`. flushBuffers() bundles a worker FLUSH that synchronously
 * refills buffers from `getSyncState()`; run before the SYNC_STATE patch lands,
 * that refill (and its ~4-measure lookahead) generates from the OLD
 * progression. dispatch()/validateAndAnalyze() are synchronous, so ordering
 * flush last costs nothing perceptible on the note-kill.
 *
 * #1144 — saveCurrentState() stays here (not folded into the #1127
 * chokepoint's caller-side dispatch). It used to be load-bearing for exactly
 * one caller: `history.ts` `undo()` restored the sections array with a direct
 * `@direct-mutation` write and no preceding dispatch, so the chokepoint never
 * fired for it and this was the only save undo got. #1180 migrated that
 * restore to `dispatch(SET_PARAM, …)`, so the chokepoint now fires for undo
 * too and this save is redundant-but-harmless for EVERY caller. Kept
 * deliberately as the belt to the debounce's suspenders — removing it would
 * make persistence depend solely on a debounced effect that the auto-conductor
 * can starve during playback (see public/CLAUDE.md §7).
 */
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
        const sectionMap = new Map(arranger.sections.map((s: Section) => [s.id, s]));
        const newSections = value.map((sid: string) => sectionMap.get(sid));

        const currentIds = arranger.sections.map((s: Section) => s.id);
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
        const index = arranger.sections.findIndex((s: Section) => s.id === id);
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
    // #1144 — no immediate save: the SET_PARAM dispatches above (sections/
    // isDirty) already schedule the #1127 chokepoint's debounced save.
}

export function onSectionDelete(id: string): void {
    const { arranger } = getState();
    if (arranger.sections.length <= 1) {
        return;
    }

    const section = arranger.sections.find((s: Section) => s.id === id);
    if (section?.value && section.value.trim() !== '' && section.value.trim() !== 'I') {
        if (!confirm(`Delete section "${section.label || 'Untitled'}" and its chords?`)) {
            return;
        }
    }

    dispatch(ACTIONS.SET_PARAM, {
        module: 'arranger',
        param: 'sections',
        value: arranger.sections.filter((s: Section) => s.id !== id),
    });
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    clearChordPresetHighlight();
    refreshArrangerUI();
}

export function onSectionDuplicate(id: string): void {
    const { arranger } = getState();
    const section = arranger.sections.find((s: Section) => s.id === id);
    if (!section) {
        return;
    }
    pushHistory();
    const newSection = { ...section, id: generateId(), label: `${section.label} (Copy)` };
    const index = arranger.sections.findIndex((s: Section) => s.id === id);
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

/**
 * Append a batch of pre-built sections to the current arrangement (e.g. inserted
 * from the library drawer). Mirrors `addSection`'s post-update side effects so
 * the worker's `sectionMap`/`stepMap`/`progression` are re-validated and the
 * persistence + audio buffers get refreshed.
 */
export function appendSections(
    toAppend: ReadonlyArray<{
        label?: string;
        value: string;
        key?: string;
        isMinor?: boolean;
        timeSignature?: string;
        repeat?: number;
        seamless?: boolean;
    }>,
): void {
    if (!toAppend || toAppend.length === 0) {
        return;
    }
    const { arranger } = getState();
    const next = toAppend.map((s) => ({
        id: generateId(),
        label: s.label || `Section ${arranger.sections.length + 1}`,
        value: s.value,
        ...(s.key ? { key: s.key } : {}),
        ...(typeof s.isMinor === 'boolean' ? { isMinor: s.isMinor } : {}),
        ...(s.timeSignature ? { timeSignature: s.timeSignature } : {}),
        ...(s.repeat ? { repeat: s.repeat } : {}),
        ...(s.seamless ? { seamless: s.seamless } : {}),
    }));
    pushHistory();
    dispatch(ACTIONS.SET_PARAM, {
        module: 'arranger',
        param: 'sections',
        value: [...arranger.sections, ...next],
    });
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    clearChordPresetHighlight();
    refreshArrangerUI();
}

export function transposeKey(delta: number): void {
    const { arranger } = getState();
    const currentKeyName = arranger.key || 'C';
    const currentIndex = KEY_ORDER.indexOf(normalizeKey(currentKeyName));
    const newKey = KEY_ORDER[(((currentIndex + delta) % 12) + 12) % 12];

    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'key', value: newKey });

    arranger.sections.forEach((section: Section) => {
        // Absolute transpose: note-name roots AND slash basses move by delta; Roman/NNS tokens
        // are key-relative and stay put (the key label above moves by the same delta). Shares the
        // single tokenizer in transpose.ts with switchToRelativeKey — this is the fix that gets the
        // slash bass to transpose (`C/E` +2 → `D/Gb`, previously `D/E`).
        section.value = transposeChordText(section.value, delta);

        if (section.key) {
            const secKeyIndex = KEY_ORDER.indexOf(normalizeKey(section.key));
            if (secKeyIndex !== -1) {
                section.key = KEY_ORDER[(((secKeyIndex + delta) % 12) + 12) % 12];
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

/**
 * Set the chart's key from the key picker. Per the #778 decision, picking a key TRANSPOSES the
 * whole chart to that tonic (preserving major/minor mode) — the iReal Pro model — rather than
 * relabeling. So the dropdown is a "jump to key" sibling of the +/- transpose buttons, sharing
 * `transposeKey` (and thus the unified transpose.ts tokenizer). Mode is left untouched: in A minor,
 * picking C yields C minor (the minor song transposed up a minor third). Switching major<->minor
 * stays the Relative button's job.
 */
export function setKeyCenter(newKey: string): void {
    const { arranger } = getState();
    const from = KEY_ORDER.indexOf(normalizeKey(arranger.key || 'C'));
    const to = KEY_ORDER.indexOf(normalizeKey(newKey));
    if (from === -1 || to === -1 || from === to) {
        return;
    }
    transposeKey(to - from);
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

    // Build a fresh section array off the live snapshot — no in-place writes,
    // so we route through dispatch atomically without the prior duplicate
    // mutate-then-clone step.
    const transformedSections = arranger.sections.map((section: Section) => {
        const next = {
            ...section,
            value: transformRelativeProgression(section.value, shift),
        };
        if (section.key) {
            const secKeyIndex = KEY_ORDER.indexOf(normalizeKey(section.key));
            if (secKeyIndex !== -1) {
                next.key = KEY_ORDER[(secKeyIndex + shift + 12) % 12];
            }
        }
        return next;
    });

    dispatch(ACTIONS.SET_PARAM, {
        module: 'arranger',
        param: 'sections',
        value: transformedSections,
    });

    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    refreshArrangerUI();
    showToast(
        `Switched to Relative ${arranger.isMinor ? 'Minor' : 'Major'}: ${newKey}${arranger.isMinor ? 'm' : ''}`,
    );
}

/**
 * Set or clear a section's intensity override. `value === undefined` removes the
 * override so the section follows the global conductor target again.
 *
 * @staged Wired to the engine + persistence; awaits the Phase B SectionHeaderStrip
 * UI to expose it to users.
 */
/**
 * Look up a section by id, hand its current value + a mutable copy of the
 * sections array to `mutate` (which replaces `newSections[index]`), then
 * commit + refresh. No-ops if `id` isn't found. Shared by the per-section
 * setters below, which otherwise duplicate this find/guard/commit shape.
 */
function withSection(
    id: string,
    mutate: (current: Section, newSections: Section[], index: number) => void,
): void {
    const { arranger } = getState();
    const index = arranger.sections.findIndex((s: Section) => s.id === id);
    if (index === -1) {
        return;
    }
    const newSections = [...arranger.sections];
    mutate(newSections[index], newSections, index);
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'sections', value: newSections });
    dispatch(ACTIONS.SET_PARAM, { module: 'arranger', param: 'isDirty', value: true });
    refreshArrangerUI();
}

export function setSectionIntensity(id: string, value: number | undefined): void {
    withSection(id, (current, newSections, index) => {
        if (value === undefined) {
            const { targetIntensity: _omit, ...rest } = current;
            newSections[index] = rest;
        } else {
            newSections[index] = { ...current, targetIntensity: Math.max(0, Math.min(1, value)) };
        }
    });
}

/**
 * Set or clear a per-instrument override on a section. Tri-state: `true` (force on),
 * `false` (force off), `undefined` (follow the global instrument enabled flag).
 *
 * @staged Wired to the engine + persistence; awaits the Phase B SectionHeaderStrip
 * UI to expose it to users.
 */
export function setSectionInstrumentEnabled(
    id: string,
    instrument: SectionInstrumentKey,
    enabled: boolean | undefined,
): void {
    withSection(id, (current, newSections, index) => {
        const nextInstruments: Partial<Record<SectionInstrumentKey, boolean>> = {
            ...(current.instruments || {}),
        };
        if (enabled === undefined) {
            delete nextInstruments[instrument];
        } else {
            nextInstruments[instrument] = enabled;
        }
        if (Object.keys(nextInstruments).length === 0) {
            const { instruments: _omit, ...rest } = current;
            newSections[index] = rest;
        } else {
            newSections[index] = { ...current, instruments: nextInstruments };
        }
    });
}

/**
 * Surgically swap a single chord in a section's text without disturbing the
 * surrounding chords. Used by the locked-mode tap-chord picker — the user picks
 * a new chord and the section's `value` is spliced at the chord's `charStart` /
 * `charEnd` (preserved by `parseProgressionPart`).
 *
 * Returns `true` if a chord was found and the section value updated; `false`
 * otherwise (unknown section or no chord at that index).
 */
export function replaceChordInSection(
    sectionId: string,
    localIndex: number,
    newText: string,
): boolean {
    const { arranger } = getState();
    const section = arranger.sections.find((s: Section) => s.id === sectionId);
    if (!section) {
        return false;
    }
    // localIndex repeats per `repeatIndex` for sections with repeat > 1; the
    // charStart/charEnd are identical across repeats since they index the
    // single source text. Pick the first occurrence.
    const chord = arranger.progression.find(
        (c: Chord) =>
            c.sectionId === sectionId && c.localIndex === localIndex && c.repeatIndex === 0,
    );
    if (!chord || typeof chord.charStart !== 'number' || typeof chord.charEnd !== 'number') {
        return false;
    }
    const trimmed = newText.trim();
    if (!trimmed) {
        return false;
    }
    const before = section.value.slice(0, chord.charStart);
    const after = section.value.slice(chord.charEnd);
    const nextValue = `${before}${trimmed}${after}`;
    if (nextValue === section.value) {
        return false;
    }
    pushHistory();
    onSectionUpdate(sectionId, 'value', nextValue);
    return true;
}
