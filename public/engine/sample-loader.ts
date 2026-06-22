import { isPackLoaded, registerPackBuffer } from './instrument-registry.js';

/**
 * synth-audit Epic 6 (Packs) S3 — sample loader.
 *
 * The first (and only) `decodeAudioData` path in the codebase: fetch each of a
 * pack's encoded audio files, decode them to `AudioBuffer`s, and register them
 * in the instrument registry's pack cache so {@link resolveInstrumentSource}
 * starts resolving that pack's voice to `sample`.
 *
 * Properties:
 *   - **Lazy** — nothing loads until {@link loadPack} is called for a pack.
 *   - **Idempotent / deduped** — a pack already loaded (or mid-load) is not
 *     re-fetched; concurrent calls share one in-flight promise.
 *   - **Atomic** — buffers are registered only after *every* sample decodes, so
 *     `isPackLoaded` never reports a half-loaded pack.
 *   - **Fail-loud** — a malformed manifest, a non-OK fetch, or an undecodable
 *     payload rejects the returned promise (and clears the in-flight entry so a
 *     later call can retry).
 *
 * Decoding requires a running `AudioContext`, so callers must pass the one from
 * `playback.audio` (created in `initAudio()`); the loader never creates its own.
 */

/** One sample within a pack: the registry key it lands under + where to fetch it. */
export interface PackSample {
    /** Zone/sample key the registry stores under (e.g. a root-note name). */
    readonly key: string;
    /** URL of the encoded audio file (resolved by the caller / pack author). */
    readonly url: string;
    /**
     * MIDI note the buffer was recorded at. Present for pitched packs (piano,
     * strings, brass) — `pack-runtime` builds a `SampleZone` per sample so the
     * pitched-voice player can `playbackRate`-shift to any target. Absent for
     * percussion packs (drums/cymbals), which play their buffer as-is.
     */
    readonly rootMidi?: number;
}

/** A pack's manifest — its id and the list of samples that make it up. */
export interface PackManifest {
    readonly id: string;
    readonly samples: readonly PackSample[];
    /** Human-facing pack name (shown in the Sounds section). */
    readonly name?: string;
    /** License/credit line for the sampled source. */
    readonly attribution?: string;
}

/** In-flight loads, keyed by pack id — dedupes concurrent {@link loadPack} calls. */
const inFlight = new Map<string, Promise<void>>();

function validateManifest(manifest: unknown): asserts manifest is PackManifest {
    if (manifest === null || typeof manifest !== 'object') {
        throw new Error('[sample-loader] pack manifest must be an object');
    }
    const m = manifest as Record<string, unknown>;
    if (typeof m.id !== 'string' || m.id.length === 0) {
        throw new Error('[sample-loader] pack manifest is missing a non-empty string `id`');
    }
    if (!Array.isArray(m.samples) || m.samples.length === 0) {
        throw new Error(`[sample-loader] pack "${m.id}" lists no samples`);
    }
    for (const sample of m.samples) {
        if (
            sample === null ||
            typeof sample !== 'object' ||
            typeof (sample as PackSample).key !== 'string' ||
            typeof (sample as PackSample).url !== 'string'
        ) {
            throw new Error(`[sample-loader] pack "${m.id}" has a malformed sample entry`);
        }
    }
}

async function fetchAndDecode(
    ctx: AudioContext,
    packId: string,
    sample: PackSample,
): Promise<{ key: string; buffer: AudioBuffer }> {
    const res = await fetch(sample.url);
    if (!res.ok) {
        throw new Error(
            `[sample-loader] pack "${packId}" sample "${sample.key}" — fetch failed ` +
                `(${res.status}) for ${sample.url}`,
        );
    }
    const bytes = await res.arrayBuffer();
    // decodeAudioData detaches the ArrayBuffer it's given; each sample owns its
    // own buffer from arrayBuffer() so there's no shared-detach hazard.
    const buffer = await ctx.decodeAudioData(bytes);
    return { key: sample.key, buffer };
}

/**
 * Lazily load + decode a sample pack and register its buffers. Resolves once the
 * pack is fully loaded (or was already). See module docs for the guarantees.
 */
export async function loadPack(ctx: AudioContext, manifest: PackManifest): Promise<void> {
    validateManifest(manifest);
    if (isPackLoaded(manifest.id)) {
        return;
    }
    const existing = inFlight.get(manifest.id);
    if (existing !== undefined) {
        return existing;
    }

    const load = (async () => {
        const decoded = await Promise.all(
            manifest.samples.map((sample) => fetchAndDecode(ctx, manifest.id, sample)),
        );
        // Register only after every sample decodes — atomic present-or-absent.
        for (const { key, buffer } of decoded) {
            registerPackBuffer(manifest.id, key, buffer);
        }
    })();

    inFlight.set(manifest.id, load);
    try {
        await load;
    } finally {
        // Clear either way: on success `isPackLoaded` now short-circuits future
        // calls; on failure a later call is free to retry from scratch.
        inFlight.delete(manifest.id);
    }
}

/** Test helper: drop any in-flight load bookkeeping between cases. */
export function __resetLoaderForTest(): void {
    inFlight.clear();
}
