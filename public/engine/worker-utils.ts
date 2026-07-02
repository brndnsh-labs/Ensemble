import type { ArrangerState } from '../state/arranger.js';
import type { Chord } from '../types.js';

export interface ChordAtStep {
    chord: Chord;
    stepInChord: number;
    chordIndex: number;
    sectionStart: number;
    sectionEnd: number;
}

/**
 * GENERATIVE STATE PROTECTION
 * These keys are managed locally by the worker's generative engines.
 * Overwriting them from the main thread during sync causes glitches, silence,
 * and resets in the middle of phrases. Keys are scoped per-level — when
 * `recursiveSafeSync` descends into a nested object, it looks up the
 * protected list under `${moduleName}.${key}` (e.g. `soloist.session.phrasing`).
 */
const WORKER_MANAGED_KEYS: Record<string, string[]> = {
    'soloist.session.phrasing': [
        'state',
        'isResting',
        'transitionState',
        'restSteps',
        'activeSteps',
        'busySteps',
        'isWaitingForEntry',
        'isYielding',
        'lastAttackStep',
    ],
    'soloist.audio': ['lastMidiPlayed', 'lastRenderedFreq'],
    bass: ['lastFreq', 'busySteps', 'lastMidiPlayed'],
    harmony: ['motifBuffer', 'lastMidis'],
    groove: ['fillSteps', 'fillActive', 'fillStartStep', 'fillLength', 'pendingCrash', 'snareMask'],
    // #906 — rhythmicMask is written only inside the worker (accompaniment.ts's
    // updateRhythmicIntent, `// @worker-mutation`); the main thread never sets it,
    // so a sync must not stomp it with the main thread's stale/default copy.
    chords: ['rhythmicMask'],
};

// --- LOGIC CURSORS ---
let lastChordIndex = 0;
let lastSectionIndex = 0;

export function resetCursors(): void {
    lastChordIndex = 0;
    lastSectionIndex = 0;
}

export function recursiveSafeSync(target: any, source: any, moduleName: string): void {
    if (!source || typeof source !== 'object') {
        return;
    }
    const protectedKeys = WORKER_MANAGED_KEYS[moduleName] || [];

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
 */
export function getChordAtStep(
    step: number,
    arranger: ArrangerState,
    cursor: any = null,
): ChordAtStep | null {
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
