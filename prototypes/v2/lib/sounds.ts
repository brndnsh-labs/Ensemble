import { packsForInstrument, revForPack, SOUND_PACKS } from '@engine/data/sound-packs';
import {
    isPackLoaded,
    markPackInstalled,
    packIdFromVoice,
} from '@engine/engine/instrument-registry';
import { ensurePackLoaded } from '@engine/engine/pack-runtime';
import { type PackManifest, setPackAssetFetcher, withRevToken } from '@engine/engine/sample-loader';
import type { ChartContent } from '@engine/songbook/types';
import type { InstrumentModule, InstrumentVoice } from '@engine/types';
import { BASE_PATH, withBase } from './base-path';

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
        index = fetch(withBase('/pack-files.json'), { signal: AbortSignal.timeout(20_000) })
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
    // The key IS the served URL, so it carries the build's base (#1354). `CACHE` survives app-
    // shell upgrades by design, and moving the base moves every key in it — which is why the
    // cutover re-keys them rather than letting them go cold (`migrateSoundCacheBase`, #1355).
    // A key change is only ever acceptable WITH that migration; as a drive-by in a `/v2` build
    // it silently orphans everyone's sounds.
    const key = `${withBase(url.pathname)}?asset=${hash}`;
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    if (cached && (await digest(await cached.clone().arrayBuffer())) === hash) {
        return cached;
    }
    // A read-through move for the entries `migrateSoundCacheBase` has not reached yet (#1355
    // review R6). That pass runs unawaited from startup, so on the FIRST load after the cutover
    // this read can arrive first — and offline (`cachedOnly`) it would answer "Sound download is
    // incomplete" while the bytes sit one key away under the old base. Moving it here on demand
    // makes the background pass pure tidy-up rather than a race the musician can lose on a gig.
    // The digest is the same one this function already trusts, so an adopted entry is verified
    // exactly as a cached one is, and a failure falls through to the network path below.
    // `BASE_PATH` is a build constant, so this whole block is eliminated from the `/v2` bundle.
    if (BASE_PATH === '') {
        try {
            const legacy = await cache.match(`/v2${url.pathname}?asset=${hash}`);
            if (legacy && (await digest(await legacy.clone().arrayBuffer())) === hash) {
                await cache.put(key, legacy.clone());
                // Tidy-up only, so never awaited into the result: once the new key holds the
                // verified bytes this read has succeeded, whatever becomes of the old entry.
                void cache.delete(`/v2${url.pathname}?asset=${hash}`).catch(() => {});
                return legacy;
            }
        } catch {
            // The old entry stays where it is and the pack downloads again. Never a hard failure.
        }
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
        // On the root build, an entry `migrateSoundCacheBase` has not moved yet still sits under
        // `/v2`, and `asset()` adopts it on read, so it counts as installed here too.
        const pathOf = (request: Request) => {
            const { pathname } = new URL(request.url);
            return BASE_PATH === '' && pathname.startsWith('/v2/packs/')
                ? pathname.slice('/v2'.length)
                : pathname;
        };
        const present = new Set(keys.map(pathOf));
        const path = (source: string) => withBase(new URL(source, location.origin).pathname);
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

/**
 * Move a musician's downloaded packs across the cutover instead of making them download them
 * again (#1355).
 *
 * `asset()` keys this cache by the URL it fetched, which carries the build's base, so every
 * entry a `/v2` build wrote is filed under `/v2/packs/…` and a root build looks straight past
 * it. Re-keying is safe precisely because the keys are content-addressed: the `?asset=<sha256>`
 * that survives the move is the same digest `asset()` verifies the bytes against on every read,
 * so a move that corrupted anything would be caught at the next read rather than played.
 * Someone who installed all thirteen packs for a gig keeps them through the flip.
 *
 * Root build only, never awaited by startup, and safe to run twice: an entry is removed from
 * its old key only once the new one reads back, so a failure part-way leaves the cache whole
 * and the next page load finishes the job. `asset()` carries the same move as a read-through, so
 * nothing here is on anyone's critical path.
 *
 * One entry's failure is ONE entry's failure (#1355 review R10). The `try` is inside the loop:
 * with it around the whole walk, a single browser-refused `cache.put` — a quota trip on the
 * largest pack, say — abandoned every entry after it, and because the walk is ordered, every
 * later page load would abandon at exactly the same place and never finish the job.
 */
export async function migrateSoundCacheBase(): Promise<void> {
    if (BASE_PATH !== '' || typeof caches === 'undefined') {
        return;
    }
    let cache: Cache;
    let entries: readonly Request[];
    try {
        cache = await caches.open(CACHE);
        entries = await cache.keys();
    } catch {
        return;
    }
    for (const request of entries) {
        try {
            const url = new URL(request.url);
            // Exactly the shape `asset()` writes, and nothing else: a key this app did not
            // author is not ours to rewrite.
            if (
                url.origin !== location.origin ||
                !url.pathname.startsWith('/v2/packs/') ||
                !/^\?asset=[a-f0-9]{64}$/.test(url.search)
            ) {
                continue;
            }
            const moved = `${url.pathname.slice('/v2'.length)}${url.search}`;
            const stored = await cache.match(request);
            if (!stored) {
                continue;
            }
            await cache.put(moved, stored);
            if (await cache.match(moved)) {
                await cache.delete(request);
            }
        } catch {
            // A pack that did not move is a pack that downloads again, or that `asset()` adopts
            // on its next read. Never a startup failure, and never a reason to stop.
        }
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
