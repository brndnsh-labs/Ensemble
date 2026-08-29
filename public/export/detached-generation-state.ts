import type { EnsembleState } from '../types.js';

/**
 * Recursively removes deepSignal proxies and other non-cloneable wrappers while
 * preserving the Maps and Sets used by the generation engine.
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
    if (value instanceof Set) {
        return new Set(Array.from(value, (item) => cloneRaw(item))) as T;
    }
    if (value instanceof Map) {
        return new Map(
            Array.from(value.entries(), ([key, item]) => [cloneRaw(key), cloneRaw(item)]),
        ) as T;
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
 * Creates a detached generation state for worker or offline-render ownership.
 *
 * Musical settings and precomputed arrangement maps are preserved, while live
 * Web Audio/DOM handles and every scheduled-note buffer start empty. The final
 * cloneRaw pass is load-bearing for Web Worker postMessage: deepSignal proxies
 * cannot cross a structured-clone boundary.
 */
export function cloneStateForDetachedGeneration(liveState: EnsembleState): EnsembleState {
    const detached = {
        playback: {
            ...liveState.playback,
            modals: { ...(liveState.playback.modals || {}) },
            drawQueue: [],
            audio: null,
            audioGraph: null,
            wakeLock: null,
            lastActiveDrumElements: null,
            heldNotes: new Set(),
            activeChordVoices: [],
            lastChordKey: null,
            suspendTimeout: null,
            isPlaying: false,
            isScheduling: false,
            nextNoteTime: 0,
            unswungNextNoteTime: 0,
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
            instruments: liveState.groove.instruments.map((instrument) => ({
                ...instrument,
                steps: [...instrument.steps],
            })),
            audioBuffers: {},
            buffer: new Map(),
            lastHatGain: null,
            lastSampledHatVoice: null,
            lastRideGain: null,
            lastCrashGain: null,
        },
        chords: {
            ...liveState.chords,
            buffer: new Map(),
        },
        bass: {
            ...liveState.bass,
            buffer: new Map(),
            lastFreq: null,
            lastPlayedFreq: null,
            lastBassGain: null,
        },
        soloist: {
            ...liveState.soloist,
            audio: {
                ...liveState.soloist.audio,
                activeVoices: [],
                buffer: new Map(),
                lastFreq: null,
                lastMidiPlayed: null,
                lastRenderedFreq: null,
                lastPlayedFreq: null,
                lastNoteEnd: 0,
            },
        },
        harmony: {
            ...liveState.harmony,
            buffer: new Map(),
            activeVoices: [],
        },
        vizState: { ...liveState.vizState, enabled: false },
        midi: { ...liveState.midi, enabled: false, muteLocal: true },
        conductor: { ...liveState.conductor },
    } satisfies EnsembleState;

    return cloneRaw(detached);
}
