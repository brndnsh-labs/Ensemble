import { getPackBuffer } from './instrument-registry.js';
import { loadPack, type PackManifest } from './sample-loader.js';
import type { SampleZone } from './sample-voice.js';

/**
 * synth-audit Epic 6 (Packs) S6 — pack runtime glue.
 *
 * Bridges the loader and the pitched-voice player: fetch a pack's manifest,
 * load+decode its samples (S3), then build the `SampleZone[]` (root MIDI +
 * decoded buffer) that `pickZone`/`playSampledNote` (S5) consume — cached per
 * pack so the chord/harmony/soloist seams can pull zones cheaply per note.
 *
 * `ensurePackLoaded` is idempotent and safe to call from a state effect every
 * time a `pack:<id>` voice is selected (or on play-start); the loader itself
 * dedupes concurrent loads, and a built zone set is cached here.
 */

/** packId → its built zones (only present once load+decode completed). */
const zoneCache = new Map<string, SampleZone[]>();
/** packId → its in-flight ensure promise, so repeated selects don't re-fetch. */
const ensuring = new Map<string, Promise<void>>();

/** Built, cached zones for a pack, or `null` until it has finished loading. */
export function getPackZones(packId: string): SampleZone[] | null {
    return zoneCache.get(packId) ?? null;
}

async function fetchManifest(packId: string): Promise<PackManifest> {
    const res = await fetch(`/packs/${packId}/manifest.json`);
    if (!res.ok) {
        throw new Error(
            `[pack-runtime] manifest fetch failed (${res.status}) for pack "${packId}"`,
        );
    }
    return (await res.json()) as PackManifest;
}

/**
 * Fetch + load a pack and build its zone set, once. Resolves when the pack is
 * playable (or was already). Errors are swallowed to a warning — a pack that
 * fails to load simply never populates `zoneCache`, and the instrument seam
 * falls back to its synth voice (the registry's graceful-fallback contract).
 */
export function ensurePackLoaded(audio: BaseAudioContext, packId: string): Promise<void> {
    if (zoneCache.has(packId)) {
        return Promise.resolve();
    }
    const existing = ensuring.get(packId);
    if (existing !== undefined) {
        return existing;
    }

    const run = (async () => {
        const manifest = await fetchManifest(packId);
        await loadPack(audio, manifest);
        // Build zones only for samples that declare a root pitch (pitched packs).
        const zones: SampleZone[] = [];
        for (const sample of manifest.samples) {
            if (sample.rootMidi === undefined) {
                continue;
            }
            const buffer = getPackBuffer(packId, sample.key);
            if (buffer !== null) {
                zones.push({ rootMidi: sample.rootMidi, buffer });
            }
        }
        if (zones.length > 0) {
            zoneCache.set(packId, zones);
        }
    })().catch((err) => {
        console.warn(`[pack-runtime] failed to load pack "${packId}" — falling back to synth`, err);
    });

    ensuring.set(packId, run);
    try {
        return run;
    } finally {
        // Keep the in-flight promise around only until it settles; once cached,
        // the `zoneCache.has` short-circuit takes over.
        run.finally(() => ensuring.delete(packId));
    }
}

/** Test helper: clear built zones + in-flight bookkeeping between cases. */
export function __resetPackRuntimeForTest(): void {
    zoneCache.clear();
    ensuring.clear();
}
