import { packsForInstrument, revForPack, SOUND_PACKS } from '@engine/data/sound-packs';
import { isPackLoaded, packIdFromVoice } from '@engine/engine/instrument-registry';
import { ensurePackLoaded } from '@engine/engine/pack-runtime';
import { type PackManifest, setPackAssetFetcher, withRevToken } from '@engine/engine/sample-loader';
import type { ChartContent } from '@engine/songbook/types';
import type { InstrumentModule, InstrumentVoice } from '@engine/types';

export { packsForInstrument };
export const allSoundsSizeMB = SOUND_PACKS.reduce((total, pack) => total + pack.approxSizeMB, 0);

const CACHE = 'ensemble-v2-sounds-v1'; // Not deleted by app-shell upgrades.
let index: Promise<Record<string, string>> | undefined;
const digest = async (bytes: ArrayBuffer) =>
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
        b.toString(16).padStart(2, '0'),
    ).join('');

async function files(): Promise<Record<string, string>> {
    if (!index) {
        index = fetch('/v2/pack-files.json', { signal: AbortSignal.timeout(20_000) })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error('Sound catalog unavailable. Reconnect and retry.');
                }
                return response.json();
            })
            .catch((error) => {
                index = undefined;
                throw error;
            });
    }
    return index;
}

/** Exact shipped bytes only, in a preview-owned cache. No root-app cache reads/writes. */
async function asset(source: string, cachedOnly = false): Promise<Response> {
    const url = new URL(source, location.origin);
    const catalog = await files();
    const hash = Object.hasOwn(catalog, url.pathname) ? catalog[url.pathname] : undefined;
    if (url.origin !== location.origin || !hash || !/^[a-f0-9]{64}$/.test(hash)) {
        throw new Error('This sound references an unsupported file.');
    }
    const key = `/v2${url.pathname}?asset=${hash}`;
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    if (cached && (await digest(await cached.clone().arrayBuffer())) === hash) {
        return cached;
    }
    if (cachedOnly) {
        throw new Error('Sound download is incomplete. Reconnect and retry.');
    }
    const response = await fetch(key, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!response.ok || (await digest(await response.clone().arrayBuffer())) !== hash) {
        throw new Error('Sound download could not be verified. Reconnect and retry.');
    }
    await cache.put(key, response.clone());
    // Do not promise persistence if a browser failed to retain the write.
    const stored = await cache.match(key);
    if (!stored || (await digest(await stored.clone().arrayBuffer())) !== hash) {
        throw new Error('Sound storage is unavailable. Your previous sound is unchanged.');
    }
    return response;
}

export function initializeSounds(): void {
    setPackAssetFetcher(asset);
}

export function validateVoice(module: InstrumentModule, voice: InstrumentVoice): void {
    if (voice !== 'synth' && !packsForInstrument(module).some((p) => voice === `pack:${p.id}`)) {
        throw new Error(`Unsupported sound for ${module}. The song has not been changed.`);
    }
}

async function manifestFor(id: string, cachedOnly: boolean): Promise<PackManifest> {
    const response = await asset(
        withRevToken(`/packs/${id}/manifest.json`, revForPack(id)),
        cachedOnly,
    );
    const manifest = (await response.json()) as PackManifest;
    if (manifest.id !== id || !manifest.samples?.length) {
        throw new Error('Invalid sound manifest.');
    }
    return manifest;
}

function sampleUrls(manifest: PackManifest): string[] {
    return manifest.samples.flatMap((s) => [s.url, ...(s.variants || [])]);
}

// Six at a time. Browsers cap HTTP/1.1 at ~6 sockets per origin, and over HTTP/2
// the ceiling moves to us: every file costs up to three main-thread SHA-256 passes
// (cache-hit check, post-fetch verify, store read-back verify), so a wider pool
// mostly queues on the CPU while holding more decoded bodies in memory at once.
const FETCH_CONCURRENCY = 6;

/**
 * Walk `urls` through `asset()`, preserving the serial loop's contract: every file is
 * still digest-verified, the first failure stops new work and is rethrown, and
 * `onSettled` counts completions (not indexes, which no longer arrive in order).
 * Workers drain before the throw so a rejected walk leaves no unhandled promise behind.
 *
 * **Defaults to serial (`concurrency: 1`) on purpose.** Only the explicit install-all
 * gesture opts into the pool — see `installAllSounds`. Feel preparation and the
 * offline-readiness checks stay one-at-a-time because observers of those paths, including
 * `checks/foundation.spec.ts`'s Stop-during-preparation harness, pin the app by holding a
 * single in-flight request. With several outstanding, holding one no longer stops
 * preparation and the rollback/Stop assertions stop proving what they claim.
 */
async function fetchAssets(
    urls: string[],
    rev: number,
    cachedOnly: boolean,
    onSettled?: (completed: number) => void,
    concurrency = 1,
): Promise<void> {
    let next = 0;
    let completed = 0;
    // A separate flag rather than `failure !== undefined`: a thrown `undefined`
    // would otherwise leave the remaining workers running and the throw silent.
    let failed = false;
    let failure: unknown;
    const worker = async (): Promise<void> => {
        while (!failed) {
            const i = next++;
            if (i >= urls.length) {
                return;
            }
            try {
                await asset(withRevToken(urls[i], rev), cachedOnly);
            } catch (error) {
                if (!failed) {
                    failed = true;
                    failure = error;
                }
                return;
            }
            onSettled?.(++completed);
        }
    };
    await Promise.all(
        Array.from({ length: Math.max(1, Math.min(concurrency, urls.length)) }, () => worker()),
    );
    if (failed) {
        throw failure;
    }
}

export async function prepareSound(
    id: string,
    progress: (text: string) => void,
    concurrency = 1,
): Promise<void> {
    const pack = SOUND_PACKS.find((p) => p.id === id);
    if (!pack) {
        throw new Error('Unknown sound pack.');
    }
    progress(`Preparing ${pack.name}…`);
    const manifest = await manifestFor(id, false);
    const urls = sampleUrls(manifest);
    await fetchAssets(
        urls,
        revForPack(id),
        false,
        (done) => {
            progress(`${pack.name} · ${done}/${urls.length} files`);
        },
        concurrency,
    );
    progress(`Loading ${pack.name}…`);
    await ensurePackLoaded(new OfflineAudioContext(1, 1, 44100), id);
    // The old runtime intentionally swallows decode failures; this UI must not.
    if (!isPackLoaded(id)) {
        throw new Error(`${pack.name} could not be decoded by this browser.`);
    }
    progress(`${pack.name} ready offline`);
}

export async function prepareSounds(
    chart: Pick<ChartContent, 'band'>,
    progress: (text: string) => void,
): Promise<void> {
    const ids = new Set(
        Object.values(chart.band)
            .map((lane) => packIdFromVoice(lane.voice))
            .filter(Boolean),
    );
    for (const id of ids) {
        await prepareSound(id!, progress);
    }
}

/** One explicit install gesture; partial success is reusable but never earns "all ready". */
export async function installAllSounds(progress: (text: string) => void): Promise<void> {
    for (const [i, pack] of SOUND_PACKS.entries()) {
        await prepareSound(
            pack.id,
            (text) => progress(`${i + 1}/${SOUND_PACKS.length} · ${text}`),
            FETCH_CONCURRENCY,
        );
    }
}

export async function allSoundsAvailableOffline(): Promise<boolean> {
    try {
        for (const pack of SOUND_PACKS) {
            const manifest = await manifestFor(pack.id, true);
            await fetchAssets(sampleUrls(manifest), revForPack(pack.id), true);
        }
        return true;
    } catch {
        return false;
    }
}

export async function soundsAvailableOffline(chart: Pick<ChartContent, 'band'>): Promise<boolean> {
    try {
        for (const lane of Object.values(chart.band)) {
            const id = packIdFromVoice(lane.voice);
            if (!id) {
                continue;
            }
            const manifest = await manifestFor(id, true);
            await fetchAssets(sampleUrls(manifest), revForPack(id), true);
        }
        return true;
    } catch {
        return false;
    }
}
