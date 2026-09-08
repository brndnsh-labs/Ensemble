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

export async function prepareSound(id: string, progress: (text: string) => void): Promise<void> {
    const pack = SOUND_PACKS.find((p) => p.id === id);
    if (!pack) {
        throw new Error('Unknown sound pack.');
    }
    progress(`Preparing ${pack.name}…`);
    const manifest = await manifestFor(id, false);
    const urls = sampleUrls(manifest);
    for (const [i, url] of urls.entries()) {
        await asset(withRevToken(url, revForPack(id)));
        progress(`${pack.name} · ${i + 1}/${urls.length} files`);
    }
    progress(`Loading ${pack.name}…`);
    await ensurePackLoaded(new OfflineAudioContext(1, 1, 44100), id);
    // The old runtime intentionally swallows decode failures; this UI must not.
    if (!isPackLoaded(id)) {
        throw new Error(`${pack.name} could not be decoded by this browser.`);
    }
    progress(`${pack.name} ready offline`);
}

export async function prepareSounds(
    chart: ChartContent,
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
        await prepareSound(pack.id, (text) => progress(`${i + 1}/${SOUND_PACKS.length} · ${text}`));
    }
}

export async function allSoundsAvailableOffline(): Promise<boolean> {
    try {
        for (const pack of SOUND_PACKS) {
            const manifest = await manifestFor(pack.id, true);
            for (const url of sampleUrls(manifest)) {
                await asset(withRevToken(url, revForPack(pack.id)), true);
            }
        }
        return true;
    } catch {
        return false;
    }
}

export async function soundsAvailableOffline(chart: ChartContent): Promise<boolean> {
    try {
        for (const lane of Object.values(chart.band)) {
            const id = packIdFromVoice(lane.voice);
            if (!id) {
                continue;
            }
            const manifest = await manifestFor(id, true);
            for (const url of sampleUrls(manifest)) {
                await asset(withRevToken(url, revForPack(id)), true);
            }
        }
        return true;
    } catch {
        return false;
    }
}
