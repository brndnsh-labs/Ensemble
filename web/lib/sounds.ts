import { packsForInstrument, revForPack, SOUND_PACKS } from '@core/data/sound-packs';
import { isPackLoaded, markPackInstalled, packIdFromVoice } from '@core/engine/instrument-registry';
import { ensurePackLoaded } from '@core/engine/pack-runtime';
import { type PackManifest, setPackAssetFetcher, withRevToken } from '@core/engine/sample-loader';
import type { ChartSettings } from '@core/songbook/types';
import type { InstrumentModule, InstrumentVoice } from '@core/types';

export { packsForInstrument };
export const allSoundsSizeMB = SOUND_PACKS.reduce((total, pack) => total + pack.approxSizeMB, 0);

// The packs a musician downloaded live here, and app-shell upgrades never touch it. The name
// must not change: it is what installed browsers already hold, so a new name silently orphans
// every downloaded pack and makes the musician download them all again.
const CACHE = 'ensemble-v2-sounds-v1';

/** What a sound download that never reached the network is told (#1985). */
export const DOWNLOAD_FAILED = "Couldn't download the sounds. Check your connection and try again.";

/**
 * Whether a thrown fetch failure is the network's: Chromium says "Failed to fetch", WebKit "Load
 * failed", Firefox "NetworkError when attempting to fetch resource", and a timed-out request is
 * a timeout. None of them tells a musician anything; the server's own refusals have their own
 * sentences already.
 */
export function isNetworkFailure(error: unknown): boolean {
    if (error instanceof DOMException) {
        return error.name === 'TimeoutError';
    }
    return (
        error instanceof TypeError &&
        /failed to fetch|load failed|networkerror|network request failed/i.test(error.message)
    );
}

/** `fetch`, with a network failure said plainly. */
async function fetchSound(input: string, init: RequestInit): Promise<Response> {
    try {
        return await fetch(input, init);
    } catch (error) {
        throw isNetworkFailure(error) ? new Error(DOWNLOAD_FAILED) : error;
    }
}

/** A progress sink: the sentence, and how far along (0..1) when it is a file count. */
export type SoundProgress = (text: string, fraction?: number) => void;

/**
 * A sound install reports every file it settles, about 220 for the whole set in two seconds, and
 * each report rewrote a live region a screen reader reads aloud (#1985). This lets a fractional
 * report through only when it enters a new quarter (25, 50, 75%): the 100% mark is the finish,
 * which the shell says on its own. A sentence with no fraction (a plain milestone) always passes.
 * One gate per operation, so a later pack's own 0..1 run never repeats a quarter already said.
 */
export function quarterGate(emit: (text: string) => void): SoundProgress {
    let said = -1;
    return (text, fraction) => {
        if (fraction === undefined) {
            emit(text);
            return;
        }
        // Quarter 0 is the opening line ("Preparing …"), said once; 4 is the finish.
        const quarter = Math.floor(fraction * 4);
        if (quarter > said && quarter < 4) {
            said = quarter;
            emit(text);
        }
    };
}

let index: Promise<Record<string, string>> | undefined;
const digest = async (bytes: ArrayBuffer) =>
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
        b.toString(16).padStart(2, '0'),
    ).join('');

async function files(): Promise<Record<string, string>> {
    if (!index) {
        index = fetchSound('/pack-files.json', { signal: AbortSignal.timeout(20_000) })
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
    // The key IS the served URL, so it is the site-root path. `CACHE` survives app-shell
    // upgrades by design, and moving a key moves every entry in it. A key change is only ever
    // acceptable WITH a migration; as a drive-by it silently orphans everyone's sounds.
    const key = `${url.pathname}?asset=${hash}`;
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    if (cached && (await digest(await cached.clone().arrayBuffer())) === hash) {
        return cached;
    }
    if (cachedOnly) {
        throw new Error('Sound download is incomplete. Reconnect and retry.');
    }
    const response = await fetchSound(key, {
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
    });
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

/**
 * Mark every pack whose files all sit in this cache as installed (#1405), so a lane on Follow
 * feel resolves to it from the first chart the page opens. v1 seeded the registry's installed
 * set like this at bootstrap; that went with the v1 shell (#1358), and until this ran nothing in
 * v2 did, so after a reload every pack read as missing until Play decoded it again.
 *
 * A presence check, deliberately cheap enough to await at startup: it reads only this cache
 * (no catalog fetch, no network) and digests nothing. It compares pathnames because a key drops
 * the rev token and adds the content hash. Nothing is trusted on the strength of it: `asset()`
 * still verifies every byte when Play prepares the pack, and fetches whatever this missed.
 */
export function seedInstalledSounds(): Promise<void> {
    // Startup awaits this, and a Cache Storage call can stall rather than throw. Past the bound
    // the band starts on what is known; the walk still finishes and marks packs late, which only
    // means the next opened song sees them.
    return Promise.race([
        seed(),
        new Promise<void>((resolve) => setTimeout(resolve, SEED_TIMEOUT_MS)),
    ]);
}

const SEED_TIMEOUT_MS = 2000;

async function seed(): Promise<void> {
    try {
        if (typeof caches === 'undefined' || !(await caches.has(CACHE))) {
            return;
        }
        const cache = await caches.open(CACHE);
        const keys = await cache.keys();
        const pathOf = (request: Request) => new URL(request.url).pathname;
        const present = new Set(keys.map(pathOf));
        const path = (source: string) => new URL(source, location.origin).pathname;
        for (const pack of SOUND_PACKS) {
            try {
                const manifestPath = path(`/packs/${pack.id}/manifest.json`);
                const key = keys.find((request) => pathOf(request) === manifestPath);
                const stored = key && (await cache.match(key));
                if (!stored) {
                    continue;
                }
                const manifest = (await stored.json()) as PackManifest;
                const urls = manifest.samples?.length ? sampleUrls(manifest) : [];
                if (urls.length && urls.every((url) => present.has(path(url)))) {
                    markPackInstalled(pack.id, true);
                }
            } catch {
                // One unreadable pack is one pack that plays the built-in sound until installed.
            }
        }
    } catch {
        // No readable cache: every lane on Follow feel plays the built-in sounds, as before.
    }
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
 * `checks/foundation-sounds.spec.ts`'s Stop-during-preparation harness, pin the app by holding a
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
    progress: SoundProgress,
    concurrency = 1,
): Promise<void> {
    const pack = SOUND_PACKS.find((p) => p.id === id);
    if (!pack) {
        throw new Error('Unknown sound pack.');
    }
    progress(`Preparing ${pack.name}…`, 0);
    const manifest = await manifestFor(id, false);
    const urls = sampleUrls(manifest);
    await fetchAssets(
        urls,
        revForPack(id),
        false,
        (done) => {
            progress(`${pack.name} · ${done}/${urls.length} files`, done / urls.length);
        },
        concurrency,
    );
    await ensurePackLoaded(new OfflineAudioContext(1, 1, 44100), id);
    // The old runtime intentionally swallows decode failures; this UI must not.
    if (!isPackLoaded(id)) {
        throw new Error(`${pack.name} could not be decoded by this browser.`);
    }
}

export async function prepareSounds(
    chart: Pick<ChartSettings, 'band'>,
    progress: SoundProgress,
): Promise<void> {
    const ids = new Set(
        Object.values(chart.band)
            .map((lane) => packIdFromVoice(lane.voice))
            .filter(Boolean),
    );
    let index = 0;
    for (const id of ids) {
        // The fraction is the whole preparation's, so the shell's quarter-gate counts it once.
        const at = index++;
        await prepareSound(id!, (text, fraction) =>
            progress(text, fraction === undefined ? undefined : (at + fraction) / ids.size),
        );
    }
}

/** One explicit install gesture; partial success is reusable but never earns "all ready". */
export async function installAllSounds(progress: SoundProgress): Promise<void> {
    for (const [i, pack] of SOUND_PACKS.entries()) {
        await prepareSound(
            pack.id,
            // The fraction is the whole install's, so the shell's quarter-gate counts it once.
            (text, fraction) =>
                progress(
                    `${i + 1}/${SOUND_PACKS.length} · ${text}`,
                    fraction === undefined ? undefined : (i + fraction) / SOUND_PACKS.length,
                ),
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

export async function soundsAvailableOffline(chart: Pick<ChartSettings, 'band'>): Promise<boolean> {
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
