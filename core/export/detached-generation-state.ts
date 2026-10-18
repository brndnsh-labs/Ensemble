import type { EnsembleState } from '../types.js';

/**
 * Recursively removes deepSignal proxies and function members, leaving a plain tree of
 * objects, arrays and primitives. No state slice holds a Map or a Set, so neither is cloned.
 */
function cloneRaw<T>(value: T): T {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value === 'function' || typeof value === 'symbol') {
        return undefined as T;
    }
    if (typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => cloneRaw(item)) as T;
    }

    const clone: Record<string, unknown> = {};
    for (const key in value) {
        if (!Object.hasOwn(value, key)) {
            continue;
        }
        const item = cloneRaw((value as Record<string, unknown>)[key]);
        if (item !== undefined) {
            clone[key] = item;
        }
    }
    return clone as T;
}

/**
 * Creates a detached state for offline-render ownership (the old engine also handed
 * it to its worker).
 *
 * Musical settings and precomputed arrangement maps are preserved, while live
 * Web Audio/DOM handles start empty. The final
 * cloneRaw pass strips the deepSignal proxies, leaving a plain tree (they could
 * not cross the old worker's structured-clone `postMessage` boundary).
 */
export function cloneStateForDetachedGeneration(liveState: EnsembleState): EnsembleState {
    const detached = {
        playback: {
            ...liveState.playback,
            audio: null,
            audioGraph: null,
            isPlaying: false,
        },
        arranger: {
            ...liveState.arranger,
            sections: liveState.arranger.sections.map((section) => ({
                ...section,
                instruments: section.instruments ? { ...section.instruments } : undefined,
            })),
        },
        groove: {
            ...liveState.groove,
            audioBuffers: {},
            lastHatGain: null,
            lastSampledHatVoice: null,
            lastRideGain: null,
            lastCrashGain: null,
        },
        chords: {
            ...liveState.chords,
        },
        bass: {
            ...liveState.bass,
            lastBassGain: null,
        },
        soloist: {
            ...liveState.soloist,
            audio: {
                ...liveState.soloist.audio,
                activeVoices: [],
                lastRenderedFreq: null,
            },
        },
    } satisfies EnsembleState;

    return cloneRaw(detached);
}
