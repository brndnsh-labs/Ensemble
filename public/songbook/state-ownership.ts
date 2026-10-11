import type { EnsembleState } from '../types.js';

export type PersistenceOwner = 'document' | 'preferences' | 'runtime-derived';

type SliceOwnership<T> = { readonly [K in keyof T]-?: PersistenceOwner };

type StateOwnershipManifest = {
    readonly [Slice in keyof EnsembleState]-?: SliceOwnership<EnsembleState[Slice]>;
};

/**
 * Exhaustive ownership at the live slice boundary. `satisfies` is the guard: a
 * new top-level state field fails typecheck until it is deliberately classified.
 * Nested runtime aggregates (`soloist.session`, audio graphs, buffers) stay one
 * runtime-owned unit because no codec may project their internals.
 */
export const STATE_OWNERSHIP_MANIFEST = {
    arranger: {
        scorePlan: 'runtime-derived',
        sections: 'document',
        progression: 'runtime-derived',
        key: 'document',
        timeSignature: 'document',
        isMinor: 'document',
        notation: 'document',
        totalSteps: 'runtime-derived',
        stepMap: 'runtime-derived',
        measureMap: 'runtime-derived',
        sectionMap: 'runtime-derived',
        grouping: 'document',
        seed: 'document',
        randomizeSeed: 'document',
    },
    playback: {
        audio: 'runtime-derived',
        audioGraph: 'runtime-derived',
        isPlaying: 'runtime-derived',
        bpm: 'document',
        nextNoteTime: 'runtime-derived',
        unswungNextNoteTime: 'runtime-derived',
        step: 'runtime-derived',
        startStep: 'runtime-derived',
        // The chart's energy (`ChartPerformance.energy`, DECISION 2026-09-26): the user is
        // the only writer; nothing at runtime modulates it.
        bandIntensity: 'document',
        autoIntensity: 'document',
        metronome: 'runtime-derived',
        sustainActive: 'runtime-derived',
        debugSoloist: 'runtime-derived',
        heldNotes: 'runtime-derived',
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
        buffer: 'runtime-derived',
    },
    bass: {
        enabled: 'document',
        voice: 'document',
        autoSound: 'document',
        volume: 'document',
        reverb: 'document',
        lastFreq: 'runtime-derived',
        lastPlayedFreq: 'runtime-derived',
        buffer: 'runtime-derived',
        style: 'document',
        lastBassGain: 'runtime-derived',
    },
    soloist: {
        enabled: 'document',
        voice: 'document',
        autoSound: 'document',
        mode: 'document',
        autoMode: 'document',
        style: 'document',
        volume: 'document',
        reverb: 'document',
        tradeWith: 'document',
        tradeBars: 'document',
        tradeChoruses: 'document',
        session: 'runtime-derived',
        audio: 'runtime-derived',
    },
} as const satisfies StateOwnershipManifest;
