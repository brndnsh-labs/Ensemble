/**
 * GENERATIVE STATE PROTECTION
 * These keys are managed locally by the worker's generative engines.
 * Overwriting them from the main thread during sync causes glitches, silence,
 * and resets in the middle of phrases.
 */
export const WORKER_MANAGED_KEYS = {
    soloist: [
        'isResting',
        'restSteps',
        'activeSteps',
        'busySteps',
        'lastFreq',
        'lastMidiPlayed',
        'lastRenderedFreq',
        'embellishmentBuffer',
        'deviceBuffer',
        'sharedHookBuffer',
        'lastAttackStep',
        'sessionSteps',
        'isWaitingForEntry',
        'isYielding',
    ],
    bass: ['lastFreq', 'busySteps', 'lastMidiPlayed'],
    harmony: ['motifBuffer', 'lastMidis'],
    groove: ['fillSteps', 'fillActive', 'fillStartStep', 'fillLength', 'pendingCrash', 'snareMask'],
};

// --- LOGIC CURSORS ---
export let lastChordIndex = 0;
export let lastSectionIndex = 0;

/**
 * Resets the internal cursors used for chord mapping.
 */
export function resetCursors() {
    lastChordIndex = 0;
    lastSectionIndex = 0;
}

/**
 * Safely merges state from the main thread while preserving worker-managed properties.
 * Handles nested objects and arrays recursively.
 * @param {any} target
 * @param {any} source
 * @param {string} moduleName
 */
export function recursiveSafeSync(target, source, moduleName) {
    if (!source || typeof source !== 'object') {
        return;
    }
    const protectedKeys = /** @type {any} */ (WORKER_MANAGED_KEYS)[moduleName] || [];

    for (const key in source) {
        if (protectedKeys.includes(key)) {
            continue;
        }

        const sourceVal = source[key];
        const targetVal = target[key];

        if (sourceVal !== null && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
            if (targetVal === null || typeof targetVal !== 'object') {
                target[key] = sourceVal;
            } else {
                recursiveSafeSync(targetVal, sourceVal, `${moduleName}.${key}`);
            }
        } else if (Array.isArray(sourceVal)) {
            // Special handling for instrument arrays to avoid full replacement
            if (key === 'instruments' && Array.isArray(targetVal)) {
                const instrumentMap = new Map();
                for (let i = 0; i < targetVal.length; i++) {
                    instrumentMap.set(targetVal[i].name, targetVal[i]);
                }
                for (let i = 0; i < sourceVal.length; i++) {
                    const si = sourceVal[i];
                    const ti = instrumentMap.get(si.name);
                    if (ti) {
                        recursiveSafeSync(ti, si, `${moduleName}.instruments`);
                    }
                }
            } else {
                target[key] = sourceVal;
            }
        } else {
            target[key] = sourceVal;
        }
    }
}

/**
 * **Canonical** chord-lookup helper – single source of truth for the codebase.
 *
 * Callers:
 * - `tick-logic.js` and `midi-worker-logic.js` call this directly (worker-side).
 * - `scheduler-core.js` calls this via a thin adapter that bridges its
 *   `(state, step)` convention to this `(step, arranger, cursor)` signature.
 *
 * Uses a cursor-based optimization to avoid full-map traversals.
 * Pass a `cursor` object (`{ index, sectionIndex }`) to keep state across
 * calls; omit it to fall back to module-level globals.
 *
 * @param {number} step - The global step index.
 * @param {import('../state/arranger.js').ArrangerState} arranger - The arranger state (progression, stepMap, etc.).
 * @param {any} [cursor] - Optional cursor for tracking position.
 */
export function getChordAtStep(step, arranger, cursor = null) {
    if (!arranger || arranger.totalSteps === 0 || !arranger.stepMap) {
        return null;
    }
    const targetStep = step % arranger.totalSteps;

    // Determine which state variables to use (cursor or global defaults)
    let currentLastSectionIndex = cursor ? cursor.sectionIndex : lastSectionIndex;
    let currentLastChordIndex = cursor ? cursor.index : lastChordIndex;

    // Reset cursors if targetStep is before our current position (looping back)
    const lastStep = arranger.stepMap[currentLastChordIndex]?.start || 0;
    if (targetStep < lastStep) {
        currentLastSectionIndex = 0;
        currentLastChordIndex = 0;

        // Persist the reset immediately so callers observe it even when the
        // subsequent stepMap scan returns null (e.g. a gap at step 0).
        if (!cursor) {
            lastSectionIndex = 0;
            lastChordIndex = 0;
        } else {
            cursor.index = 0;
            cursor.sectionIndex = 0;
        }
    }

    let sectionData = null;
    if (arranger.sectionMap) {
        let startI = 0;
        if (currentLastSectionIndex < arranger.sectionMap.length) {
            const cached = arranger.sectionMap[currentLastSectionIndex];
            if (targetStep >= cached.start) {
                startI = currentLastSectionIndex;
            }
        }
        for (let i = startI; i < arranger.sectionMap.length; i++) {
            const s = arranger.sectionMap[i];
            if (targetStep >= s.start && targetStep < s.end) {
                sectionData = s;
                currentLastSectionIndex = i;
                break;
            }
            if (s.start > targetStep) {
                break;
            }
        }
    }

    let startI = 0;
    if (currentLastChordIndex < arranger.stepMap.length) {
        const cached = arranger.stepMap[currentLastChordIndex];
        if (targetStep >= cached.start) {
            startI = currentLastChordIndex;
        }
    }

    for (let i = startI; i < arranger.stepMap.length; i++) {
        const entry = arranger.stepMap[i];
        if (targetStep >= entry.start && targetStep < entry.end) {
            currentLastChordIndex = i;

            // Update the state variables
            if (cursor) {
                cursor.index = currentLastChordIndex;
                cursor.sectionIndex = currentLastSectionIndex;
            } else {
                lastChordIndex = currentLastChordIndex;
                lastSectionIndex = currentLastSectionIndex;
            }

            return {
                chord: entry.chord,
                stepInChord: targetStep - entry.start,
                chordIndex: i,
                sectionStart: sectionData?.start || 0,
                sectionEnd: sectionData?.end || arranger.totalSteps,
            };
        }
        if (entry.start > targetStep) {
            break;
        }
    }
    return null;
}
