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
    return { requests };
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
