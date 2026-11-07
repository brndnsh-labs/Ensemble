import { packsForInstrument, revForPack, SOUND_PACKS } from '@core/data/sound-packs';
import {
    isPackInstalled,
    isPackLoaded,
    markPackInstalled,
    packIdFromVoice,
} from '@core/engine/instrument-registry';
import { ensurePackLoaded } from '@core/engine/pack-runtime';
import { type PackManifest, setPackAssetFetcher, withRevToken } from '@core/engine/sample-loader';
import type { ChartSettings } from '@core/songbook/types';
import type { InstrumentModule, InstrumentVoice } from '@core/types';

/** The lane's one-line credit for a pack (#2113); Settings → Sound credits shows the whole one. */
export { shortCredit } from '@core/data/sound-credits';
export { packsForInstrument, SOUND_PACKS };
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

/**
 * A response body's bytes, with a read that dies mid-download said plainly: the browser's own
 * `TypeError` ("Load failed", "network error") means nothing to a musician.
 */
/** @internal a test seam: the unit test reads it directly; `asset()` is its only caller. */
export async function bytesOf(response: Response): Promise<ArrayBuffer> {
    try {
        return await response.clone().arrayBuffer();
    } catch {
        throw new Error(DOWNLOAD_FAILED);
    }
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

/**
 * Cache keys whose bytes this page load has already checked against their hash. A key carries
 * the content hash, so a hit under a verified key is the verified file: it is not hashed again
 * for the rest of the page load (bytes rewritten in place meanwhile are not noticed until a reload)
 * (#2082: a pack's files were digested once to prepare it and again when it was decoded).
 */
const verified = new Set<string>();

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
    if (cached && (verified.has(key) || (await digest(await bytesOf(cached))) === hash)) {
        verified.add(key);
        return cached;
    }
    if (cachedOnly) {
        throw new Error('Sound download is incomplete. Reconnect and retry.');
    }
    const response = await fetchSound(key, {
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok || (await digest(await bytesOf(response))) !== hash) {
        throw new Error('Sound download could not be verified. Reconnect and retry.');
    }
    await cache.put(key, response.clone());
    // Do not promise persistence if a browser failed to retain the write.
    const stored = await cache.match(key);
    if (!stored || (await digest(await bytesOf(stored))) !== hash) {
        throw new Error('Sound storage is unavailable. Your previous sound is unchanged.');
    }
    verified.add(key);
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
 * gesture and the packs the cache already holds (`prepareOnce`: cache reads are not
 * network-bound) opt into the pool. A pack still to download and the
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

/** One pack's download in flight: who is watching it, and the last thing it said. */
interface Flight {
    promise: Promise<void>;
    /** Decoding what the cache holds, before anyone asked: it never goes to the network. */
    cachedOnly: boolean;
    watchers: Set<SoundProgress>;
    last?: Parameters<SoundProgress>;
}

const flights = new Map<string, Flight>();

/**
 * Download, verify and decode one pack. One run per pack id at a time (#2060): a second caller
 * (a style change's `prepareFeelSounds` while the background fetch is on the same pack) joins the
 * run in flight instead of fetching and verifying every file again, and keeps its own `progress`,
 * told where the run already is as it joins. A failure reaches every caller, and the next call
 * starts afresh. A joiner's `concurrency` is moot: the run began at its first caller's.
 */
export function prepareSound(id: string, progress: SoundProgress, concurrency = 1): Promise<void> {
    const running = flights.get(id);
    if (running?.cachedOnly) {
        // Decoding ahead of Play (`warmSounds`) is under way: wait for it rather than decode the
        // same files twice, then prepare as usual (a no-op if it finished the pack).
        const pack = SOUND_PACKS.find((p) => p.id === id);
        progress(`Preparing ${pack?.name ?? 'sounds'}…`, 0);
        return running.promise.catch(() => {}).then(() => prepareSound(id, progress, concurrency));
    }
    if (running) {
        running.watchers.add(progress);
        if (running.last) {
            progress(...running.last);
        }
        return running.promise;
    }
    return startFlight(id, progress, concurrency, false);
}

function startFlight(
    id: string,
    progress: SoundProgress,
    concurrency: number,
    cachedOnly: boolean,
): Promise<void> {
    const flight: Flight = {
        promise: Promise.resolve(),
        cachedOnly,
        watchers: new Set([progress]),
    };
    flights.set(id, flight);
    flight.promise = prepareOnce(
        id,
        (...report) => {
            flight.last = report;
            for (const watcher of flight.watchers) {
                watcher(...report);
            }
        },
        concurrency,
        cachedOnly,
    ).finally(() => {
        flights.delete(id);
    });
    return flight.promise;
}

async function prepareOnce(
    id: string,
    progress: SoundProgress,
    concurrency: number,
    cachedOnly: boolean,
) {
    const pack = SOUND_PACKS.find((p) => p.id === id);
    if (!pack) {
        throw new Error('Unknown sound pack.');
    }
    progress(`Preparing ${pack.name}…`, 0);
    const manifest = await manifestFor(id, cachedOnly);
    const urls = sampleUrls(manifest);
    await fetchAssets(
        urls,
        revForPack(id),
        cachedOnly,
        (done) => {
            progress(`${pack.name} · ${done}/${urls.length} files`, done / urls.length);
        },
        // Files the cache already holds are not network-bound: read them side by side. A pack
        // still to download keeps its serial walk (the Stop-during-preparation checks hold one
        // request to pin it).
        isPackInstalled(id) ? Math.max(concurrency, FETCH_CONCURRENCY) : concurrency,
    );
    await ensurePackLoaded(new OfflineAudioContext(1, 1, 44100), id);
    // The old runtime intentionally swallows decode failures; this UI must not.
    if (!isPackLoaded(id)) {
        throw new Error(`${pack.name} could not be decoded by this browser.`);
    }
}

/**
 * Decode, ahead of Play, the packs this device already holds for the lanes of `chart` that are
 * on (#2082), one pack at a time, while the page is idle. A lane that is off is left for Play:
 * decoded packs stay in memory for the page's life, and browsing charts should not fill a phone
 * with sounds nobody asked to hear. It reads only the cache and never downloads (guest startup
 * fetches no audio), so a pack with a file missing or failing its check is left for Play to
 * prepare as before. Nothing here is awaited by the caller; a Play that arrives meanwhile waits
 * for the pack in hand (`prepareSound`).
 */
export function warmSounds(chart: Pick<ChartSettings, 'band'>): void {
    const lanes = Object.values(chart.band).filter((lane) => lane.enabled !== false);
    const ids = [...new Set(lanes.map((lane) => packIdFromVoice(lane.voice)).filter(Boolean))];
    const idle: (run: () => void) => void =
        typeof requestIdleCallback === 'function'
            ? (run) => requestIdleCallback(run, { timeout: 1500 })
            : (run) => void setTimeout(run, 0);
    const next = (queue: string[]) => {
        const id = queue[0];
        if (!id) {
            return;
        }
        idle(() => {
            const pending =
                !isPackLoaded(id) && isPackInstalled(id) && !flights.has(id)
                    ? startFlight(id, () => {}, FETCH_CONCURRENCY, true)
                    : Promise.resolve();
            pending.catch(() => {}).finally(() => next(queue.slice(1)));
        });
    };
    next(ids as string[]);
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
