import { revForPack, SOUND_PACKS } from '../data/sound-packs.js';
import type { InstrumentVoice } from '../types.js';
import {
    getPackBuffer,
    isPackLoaded,
    packIdFromVoice,
    seedInstalledPacks,
} from './instrument-registry.js';
import { loadPack, type PackManifest, withRevToken } from './sample-loader.js';
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

async function fetchManifest(packId: string, rev: number): Promise<PackManifest> {
    // #752 — token the manifest URL too, from the same catalog `rev`: the
    // manifest is itself under `/packs/` (CacheFirst), so a bare URL would serve
    // a stale manifest after a re-encode and never reach the new sample bytes.
    const res = await fetch(withRevToken(`/packs/${packId}/manifest.json`, rev));
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
    // A percussion pack (#662) registers buffers but builds no pitched zones, so
    // `zoneCache` stays empty for it; `isPackLoaded` is the registry-level "done"
    // that keeps a loaded drum kit from re-fetching its manifest every play-start.
    if (zoneCache.has(packId) || isPackLoaded(packId)) {
        return Promise.resolve();
    }
    const existing = ensuring.get(packId);
    if (existing !== undefined) {
        return existing;
    }

    const run = (async () => {
        const rev = revForPack(packId);
        const manifest = await fetchManifest(packId, rev);
        await loadPack(audio, manifest, rev);
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

/**
 * Kick off load+decode for every `pack:<id>` voice in the list (idempotent; a
 * no-op for synth voices). Called from `initAudio` so a persisted/selected pack
 * voice loads whenever audio comes up — regardless of which path initialized it.
 * This is the fix for #666: the only prior trigger was the `ACTIONS.INIT_AUDIO`
 * effect, which fires solely from the Sounds panel, so the normal play path's
 * direct `initAudio()` call left a persisted pack voice unloaded (silent synth
 * fallback) until the user visited Settings.
 */
export function ensurePacksForVoices(
    audio: BaseAudioContext,
    voices: readonly InstrumentVoice[],
): void {
    for (const voice of voices) {
        const packId = packIdFromVoice(voice);
        if (packId) {
            void ensurePackLoaded(audio, packId);
        }
    }
}

/**
 * Pre-decode the packs backing `voices` at page load — before any live, gesture-
 * unlocked `AudioContext` exists — so first playback comes up on the sampled
 * voice instead of briefly flashing the synth fallback while decode runs.
 *
 * The gap this closes is **decode**, not download: a selected `pack:<id>` voice
 * implies the pack was installed, so its bytes are already in the SW `/packs/`
 * cache; only `decodeAudioData` is left, and today it runs async *after* the
 * scheduler has already started (synth fallback until buffers land). We host that
 * decode on an `OfflineAudioContext` — always allowed, no user gesture, no Chrome
 * autoplay warning — feeding the *same* loader + registry as the live path, so
 * `initAudio`'s later `ensurePacksForVoices` finds the pack loaded and short-
 * circuits. `AudioBuffer`s are sample-rate-portable across contexts (each carries
 * its own `sampleRate`, resampled correctly on the live context at playback), so
 * the 44.1 kHz decode host is safe regardless of the device's output rate.
 *
 * No-op when no pack voice is selected, or where `OfflineAudioContext` is absent
 * (non-browser test envs) — the lazy live path remains the fallback either way.
 */
export function warmPacksForVoices(voices: readonly InstrumentVoice[]): void {
    if (typeof OfflineAudioContext === 'undefined') {
        return;
    }
    const packVoices = voices.filter((voice) => packIdFromVoice(voice) !== null);
    if (packVoices.length === 0) {
        return;
    }
    // A minimal offline context used purely as a decode host — never rendered.
    const decodeCtx = new OfflineAudioContext(1, 1, 44100);
    ensurePacksForVoices(decodeCtx, packVoices);
}

/**
 * Scan the SW `/packs/` cache and seed the registry's installed-set (#675) so
 * genre auto-follow knows which mapped packs are available — synchronously,
 * without async cache I/O per genre change. Called once at bootstrap; the
 * Sounds UI keeps the set in step thereafter (install/remove). A pack's cached
 * `manifest.json` is the install marker (written last-ish by a good install).
 */
export async function detectInstalledPacks(): Promise<void> {
    if (typeof caches === 'undefined') {
        return;
    }
    const cacheNames = (await caches.keys()).filter((name) => name.includes('packs'));
    const found: string[] = [];
    for (const pack of SOUND_PACKS) {
        const manifestUrl = `/packs/${pack.id}/manifest.json`;
        for (const name of cacheNames) {
            const cache = await caches.open(name);
            if (await cache.match(manifestUrl)) {
                found.push(pack.id);
                break;
            }
        }
    }
    seedInstalledPacks(found);
}

/** Test helper: clear built zones + in-flight bookkeeping between cases. */
export function __resetPackRuntimeForTest(): void {
    zoneCache.clear();
    ensuring.clear();
}
