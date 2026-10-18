import type { EnsembleState } from '../types.js';

export type PersistenceOwner = 'document' | 'preferences' | 'runtime-derived';

type SliceOwnership<T> = { readonly [K in keyof T]-?: PersistenceOwner };

type StateOwnershipManifest = {
    readonly [Slice in keyof EnsembleState]-?: SliceOwnership<EnsembleState[Slice]>;
};

/**
 * Exhaustive classification of every top-level state field as `document`,
 * `preferences` or `runtime-derived`. It is a type guard: `satisfies` makes a new
 * top-level field fail typecheck until it is deliberately classified, and the
 * write-ownership rule (`docs/design/write-ownership.md`) reads the class.
 *
 * It does NOT govern persistence: nothing reads it at run time. What a chart stores
 * is what `captureContent` (`prototypes/v2/lib/runtime.ts`) captures and the schema-2
 * codec (`document-v2.ts`) accepts; a `preferences` field is stored by whatever
 * device-local helper owns it (`prototypes/v2/lib/session.ts`). Keep the class
 * honest when either of those changes. Nested runtime aggregates (audio graphs,
 * buffers) stay one runtime-owned unit.
 */
export const STATE_OWNERSHIP_MANIFEST = {
    arranger: {
        sections: 'document',
        key: 'document',
        timeSignature: 'document',
        isMinor: 'document',
        notation: 'document',
        grouping: 'document',
        seed: 'document',
        randomizeSeed: 'document',
    },
    playback: {
        audio: 'runtime-derived',
        audioGraph: 'runtime-derived',
        isPlaying: 'runtime-derived',
        bpm: 'document',
        startStep: 'runtime-derived',
        // The chart's energy (`ChartPerformance.energy`, DECISION 2026-09-26): the user is
        // the only writer; nothing at runtime modulates it.
        bandIntensity: 'document',
        autoIntensity: 'document',
        metronome: 'runtime-derived',
        masterVolume: 'preferences',
        countIn: 'preferences',
    },
    groove: {
        enabled: 'document',
        voice: 'document',
        autoSound: 'document',
        volume: 'document',
        reverb: 'document',
        humanize: 'document',
        swing: 'document',
        swingSub: 'document',
        audioBuffers: 'runtime-derived',
        genreFeel: 'document',
        lastHatGain: 'runtime-derived',
        lastSampledHatVoice: 'runtime-derived',
        lastRideGain: 'runtime-derived',
        lastCrashGain: 'runtime-derived',
        lastSmartGenre: 'document',
        pendingGenreFeel: 'runtime-derived',
    },
    chords: {
        enabled: 'document',
        voice: 'document',
        autoSound: 'document',
        style: 'document',
        volume: 'document',
        reverb: 'document',
    },
    bass: {
        enabled: 'document',
        voice: 'document',
        autoSound: 'document',
        volume: 'document',
        reverb: 'document',
        style: 'document',
        lastBassGain: 'runtime-derived',
    },
    soloist: {
        enabled: 'document',
        voice: 'document',
        autoSound: 'document',
        mode: 'document',
        autoMode: 'document',
        volume: 'document',
        reverb: 'document',
        tradeWith: 'document',
        tradeBars: 'document',
        tradeChoruses: 'document',
        audio: 'runtime-derived',
    },
} as const satisfies StateOwnershipManifest;
