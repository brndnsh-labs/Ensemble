import type { InstrumentVoice } from '../types.js';

/**
 * synth-audit Epic 6 (Packs) — instrument-source indirection registry.
 *
 * Every instrument voice resolves, at note time, to one of two sources:
 *   - `synth`  — the in-process synthesized voice (the permanent fallback)
 *   - `sample` — a decoded buffer from an installed sample pack
 *
 * The `InstrumentVoice` field ranges over `'synth' | 'pack:<id>'`.
 * `synth` is the in-process synthesized voice; a `pack:<id>` value names an
 * installed sample pack. {@link resolveInstrumentSource} returns `sample` ONLY
 * when the named pack is actually loaded — so with no packs installed (and
 * whenever a pack's buffers are missing) every voice resolves to `synth` and
 * output is bit-identical to the pre-Epic-6 synth path. This is the seam that
 * makes graceful synth-fallback clean when a pack isn't installed.
 *
 * Storage: pack buffers live in this module's own typed cache rather than the
 * `any`-typed, drum-centric `groove.audioBuffers` slot — typed, decoupled, and
 * unit-testable. S3 (sample loader) fills the cache via {@link registerPackBuffer};
 * S5 (`playSampledNote`) reads it via {@link getPackBuffer}. In S1 nothing
 * populates the cache, so resolution always returns `synth`.
 */

export type ResolvedSource =
    | { readonly kind: 'synth' }
    | { readonly kind: 'sample'; readonly packId: string };

// Shared singleton — resolving a synth voice (the overwhelmingly common case)
// allocates nothing on the audio hot path.
const SYNTH_SOURCE: ResolvedSource = { kind: 'synth' };

const PACK_PREFIX = 'pack:';

/** Decoded buffers for one installed pack, keyed by sample/zone id. */
type PackBuffers = Map<string, AudioBuffer>;

/** packId → its decoded buffers. Populated lazily by the S3 loader. */
const packCache = new Map<string, PackBuffers>();

/**
 * The pack id named by a voice, or `null` for the `synth` voice.
 * Tolerant of a missing/non-string voice (partial state, older saved sessions,
 * legacy `current`/`new` values): anything that isn't a well-formed `pack:<id>`
 * string resolves to `null` → the synth path.
 */
export function packIdFromVoice(voice: InstrumentVoice): string | null {
    return typeof voice === 'string' &&
        voice.startsWith(PACK_PREFIX) &&
        voice.length > PACK_PREFIX.length
        ? voice.slice(PACK_PREFIX.length)
        : null;
}

/** True once at least one buffer has been registered for `packId` (by S3). */
export function isPackLoaded(packId: string): boolean {
    const buffers = packCache.get(packId);
    return buffers !== undefined && buffers.size > 0;
}

/**
 * Resolve which audio source an instrument should use for this note. Returns
 * `sample` only when the voice names a pack whose buffers are loaded; otherwise
 * `synth` — the bit-identical fallback. Cheap on the no-pack path: a single
 * `startsWith` short-circuits to the shared synth singleton.
 */
export function resolveInstrumentSource(voice: InstrumentVoice): ResolvedSource {
    const packId = packIdFromVoice(voice);
    if (packId !== null && isPackLoaded(packId)) {
        return { kind: 'sample', packId };
    }
    return SYNTH_SOURCE;
}

/** S3 (loader): register one decoded buffer for a pack/zone key. */
export function registerPackBuffer(packId: string, key: string, buffer: AudioBuffer): void {
    let buffers = packCache.get(packId);
    if (buffers === undefined) {
        buffers = new Map();
        packCache.set(packId, buffers);
    }
    buffers.set(key, buffer);
}

/** S5 (playback): the decoded buffer for a pack/zone key, or `null` if absent. */
export function getPackBuffer(packId: string, key: string): AudioBuffer | null {
    return packCache.get(packId)?.get(key) ?? null;
}

/** Drop a pack's buffers (eviction / test reset). */
export function clearPack(packId: string): void {
    packCache.delete(packId);
}

/** Test helper: wipe the entire pack cache between cases. */
export function __resetPackCacheForTest(): void {
    packCache.clear();
}

/**
 * Normalize a persisted/hydrated voice value to a valid `InstrumentVoice`.
 * Preserves a `pack:<id>` selection across reloads; everything else — including
 * the retired `current`/`new` A/B voices (#649) and any garbage — collapses to
 * `synth`. So a saved session that still holds `current`/`new` keeps working and
 * just sounds like the (only) reworked synth voice.
 */
export function hydrateVoice(saved: unknown): InstrumentVoice {
    if (
        typeof saved === 'string' &&
        saved.startsWith(PACK_PREFIX) &&
        saved.length > PACK_PREFIX.length
    ) {
        return saved as InstrumentVoice;
    }
    return 'synth';
}
