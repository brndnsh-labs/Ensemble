/**
 * One download per pack at a time (#2060). A style change's `prepareFeelSounds` and the
 * background fetch can want the same pack together; the second joins the first run instead of
 * fetching and verifying every file again, and each keeps its own progress. The network and the
 * cache are faked here, with real SHA-256 digests, so `asset()` runs as it does in the app.
 */
import { SOUND_PACKS } from '@core/data/sound-packs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@core/engine/pack-runtime', () => ({ ensurePackLoaded: vi.fn(async () => {}) }));
vi.mock('@core/engine/instrument-registry', () => ({
    isPackLoaded: vi.fn(() => true),
    isPackInstalled: vi.fn(() => false),
    markPackInstalled: vi.fn(),
    packIdFromVoice: vi.fn(),
}));

const PACK = SOUND_PACKS[0].id;
const encoder = new TextEncoder();

async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A catalog of one pack with three samples, a fetch that counts its requests, a Map cache. */
async function fakeNetwork() {
    const manifest = JSON.stringify({
        id: PACK,
        samples: [1, 2, 3].map((n) => ({ url: `/packs/${PACK}/s${n}.mp3` })),
    });
    const bodies: Record<string, string> = {
        [`/packs/${PACK}/manifest.json`]: manifest,
        ...Object.fromEntries([1, 2, 3].map((n) => [`/packs/${PACK}/s${n}.mp3`, `sample ${n}`])),
    };
    const catalog = Object.fromEntries(
        await Promise.all(
            Object.entries(bodies).map(async ([path, body]) => [path, await sha256(body)]),
        ),
    );
    const requests: string[] = [];
    const stored = new Map<string, string>();
    vi.stubGlobal('location', { origin: 'https://ensemble.test' });
    vi.stubGlobal('OfflineAudioContext', class {});
    vi.stubGlobal('caches', {
        open: async () => ({
            match: async (key: string) =>
                stored.has(key) ? new Response(stored.get(key)) : undefined,
            put: async (key: string, response: Response) => {
                stored.set(key, await response.text());
            },
        }),
    });
    vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string) => {
            const path = new URL(input, 'https://ensemble.test').pathname;
            requests.push(path);
            if (path === '/pack-files.json') {
                return new Response(JSON.stringify(catalog));
            }
            // Yield, so a second caller can arrive while this run is in flight.
            await new Promise((resolve) => setTimeout(resolve, 5));
            return new Response(bodies[path]);
        }),
    );
    return { requests, stored };
}

beforeEach(() => {
    vi.resetModules();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('prepareSound: one run per pack', () => {
    it('fetches a pack once when two callers want it together, each keeping its progress', async () => {
        const { requests } = await fakeNetwork();
        const { prepareSound, initializeSounds } = await import('./sounds');
        initializeSounds();
        const first: string[] = [];
        const second: string[] = [];
        const a = prepareSound(PACK, (text) => first.push(text));
        // The first run is well under way when the second caller arrives.
        await new Promise((resolve) => setTimeout(resolve, 12));
        const b = prepareSound(PACK, (text) => second.push(text));
        await Promise.all([a, b]);

        expect(requests.filter((path) => path.endsWith('.mp3'))).toHaveLength(3);
        expect(requests.filter((path) => path.endsWith('manifest.json'))).toHaveLength(1);
        expect(first.at(-1)).toMatch(/3\/3 files/);
        // The joiner was told where the run was on joining, and heard it finish.
        expect(second.length).toBeGreaterThan(0);
        expect(second.at(-1)).toMatch(/3\/3 files/);
    });

    it('starts afresh once a run has settled', async () => {
        const { requests } = await fakeNetwork();
        const { prepareSound, initializeSounds } = await import('./sounds');
        initializeSounds();
        await prepareSound(PACK, () => {});
        const before = requests.length;
        await prepareSound(PACK, () => {});
        // Cached and verified from the cache: no sample is fetched a second time.
        expect(requests.slice(before).filter((path) => path.endsWith('.mp3'))).toHaveLength(0);
    });

    it('tells every caller of a failed run, and the next call tries again', async () => {
        await fakeNetwork();
        const { prepareSound, initializeSounds } = await import('./sounds');
        initializeSounds();
        vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
        const a = prepareSound(PACK, () => {});
        const b = prepareSound(PACK, () => {});
        await expect(a).rejects.toThrow();
        await expect(b).rejects.toThrow();
        await expect(prepareSound(PACK, () => {})).resolves.toBeUndefined();
    });
});

describe('a cached file is hashed once per page load (#2082)', () => {
    it('hashes each file once when it is prepared and read again, and once more after a reload', async () => {
        const { requests } = await fakeNetwork();
        const hash = vi.spyOn(crypto.subtle, 'digest');
        const first = await import('./sounds');
        const { fetchPackAsset } = await import('@core/engine/sample-loader');
        first.initializeSounds();
        await first.prepareSound(PACK, () => {});
        // The decode's own reads of the same files (`loadPack` asks `asset()` again).
        hash.mockClear();
        await fetchPackAsset(`/packs/${PACK}/s1.mp3`);
        await fetchPackAsset(`/packs/${PACK}/s1.mp3`);
        expect(hash).not.toHaveBeenCalled();
        expect(requests.filter((path) => path.endsWith('.mp3'))).toHaveLength(3);

        // A new page load: the cache is full, nothing is verified yet.
        vi.resetModules();
        const second = await import('./sounds');
        const again = await import('@core/engine/sample-loader');
        second.initializeSounds();
        hash.mockClear();
        for (const n of [1, 2, 3]) {
            await again.fetchPackAsset(`/packs/${PACK}/s${n}.mp3`);
            await again.fetchPackAsset(`/packs/${PACK}/s${n}.mp3`);
        }
        expect(hash).toHaveBeenCalledTimes(3);
        hash.mockRestore();
    });
});

describe('warmSounds decodes what the cache holds and never downloads (#2082)', () => {
    const chart = (enabled = true) =>
        ({ band: { chords: { voice: `pack:${PACK}`, enabled } } }) as never;

    async function installed() {
        const registry = await import('@core/engine/instrument-registry');
        vi.mocked(registry.packIdFromVoice).mockImplementation((voice) =>
            String(voice).startsWith('pack:') ? String(voice).slice(5) : null,
        );
        vi.mocked(registry.isPackInstalled).mockReturnValue(true);
        let loaded = false;
        vi.mocked(registry.isPackLoaded).mockImplementation(() => loaded);
        const { ensurePackLoaded } = await import('@core/engine/pack-runtime');
        vi.mocked(ensurePackLoaded).mockReset();
        vi.mocked(ensurePackLoaded).mockImplementation(async () => {
            loaded = true;
        });
        return ensurePackLoaded;
    }

    it('decodes an installed pack from the cache with no request for a sample', async () => {
        const { requests } = await fakeNetwork();
        const sounds = await import('./sounds');
        sounds.initializeSounds();
        await sounds.prepareSound(PACK, () => {});
        requests.length = 0;
        const ensure = await installed();
        sounds.warmSounds(chart());
        await vi.waitFor(() => expect(ensure).toHaveBeenCalledTimes(1));
        expect(requests.filter((path) => path.endsWith('.mp3'))).toEqual([]);
    });

    it('leaves a pack with a file missing to Play: no download in the warm, then Play fetches it', async () => {
        const { requests, stored } = await fakeNetwork();
        const sounds = await import('./sounds');
        sounds.initializeSounds();
        await sounds.prepareSound(PACK, () => {});
        const lost = [...stored.keys()].find((key) => key.includes('/s2.mp3'));
        stored.delete(lost as string);
        requests.length = 0;
        const ensure = await installed();
        sounds.warmSounds(chart());
        // A prepare that arrives meanwhile waits for the warm, then runs as usual.
        await new Promise((resolve) => setTimeout(resolve, 2));
        await sounds.prepareSound(PACK, () => {});
        expect(requests.filter((path) => path.endsWith('.mp3'))).toEqual([`/packs/${PACK}/s2.mp3`]);
        expect(ensure).toHaveBeenCalledTimes(1);
    });

    it('skips a lane that is off', async () => {
        await fakeNetwork();
        const sounds = await import('./sounds');
        sounds.initializeSounds();
        const ensure = await installed();
        sounds.warmSounds(chart(false));
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(ensure).not.toHaveBeenCalled();
    });
});
