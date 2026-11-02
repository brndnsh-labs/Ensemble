// @vitest-environment happy-dom
/**
 * The style's sounds fetched behind the band (#1997): the policy, without a band. Save-Data
 * offers instead of downloading, the device switch turns it off, a failure is quiet unless the
 * musician asked, and one request runs at a time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStyleSounds, type StyleSoundsHost } from './style-sounds';

function host(wanted: string[], failing: string[] = []) {
    const left = new Set(wanted);
    const calls = {
        prepared: [] as string[],
        arrived: 0,
    };
    const h: StyleSoundsHost = {
        wanted: () => [...left],
        prepare: async (id) => {
            calls.prepared.push(id);
            if (failing.includes(id)) {
                throw new Error(
                    "Couldn't download the sounds. Check your connection and try again.",
                );
            }
            left.delete(id);
        },
        arrived: async () => {
            calls.arrived++;
        },
    };
    return { h, calls };
}

function setSaveData(on: boolean) {
    Object.defineProperty(navigator, 'connection', {
        value: { saveData: on },
        configurable: true,
    });
}

describe('createStyleSounds', () => {
    beforeEach(() => {
        localStorage.clear();
        setSaveData(false);
        vi.stubGlobal('caches', { keys: async () => [] });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('downloads what the style wants, then moves the lanes over, saying so meanwhile', async () => {
        const { h, calls } = host(['grand', 'upright-bass']);
        const sounds = createStyleSounds(h);
        const seen: string[] = [];
        sounds.subscribe(() => seen.push(sounds.status().kind));
        await sounds.request();
        expect(calls.prepared).toEqual(['grand', 'upright-bass']);
        expect(calls.arrived).toBe(1);
        expect(seen).toEqual(['fetching', 'idle']);
    });

    it('does nothing when the style already has its sounds', async () => {
        const { h, calls } = host([]);
        const sounds = createStyleSounds(h);
        await sounds.request();
        expect(calls.prepared).toEqual([]);
        expect(calls.arrived).toBe(0);
        expect(sounds.status().kind).toBe('idle');
    });

    it('offers instead of downloading under Save-Data, and downloads when asked', async () => {
        setSaveData(true);
        const { h, calls } = host(['grand', 'acoustic-kit']);
        const sounds = createStyleSounds(h);
        await sounds.request();
        expect(calls.prepared).toEqual([]);
        const offer = sounds.status();
        expect(offer.kind).toBe('offer');
        expect(offer.kind === 'offer' && offer.mb).toBeGreaterThan(0);
        await sounds.request(true);
        expect(calls.prepared).toEqual(['grand', 'acoustic-kit']);
        expect(sounds.status().kind).toBe('idle');
    });

    it('stops offering once declined, until the musician asks', async () => {
        setSaveData(true);
        const { h } = host(['grand']);
        const sounds = createStyleSounds(h);
        await sounds.request();
        sounds.decline();
        expect(sounds.status().kind).toBe('idle');
        await sounds.request();
        expect(sounds.status().kind).toBe('idle');
    });

    it('neither downloads nor offers when this device turned it off', async () => {
        localStorage.setItem('ensemble-v2-preview:auto-sounds', '0');
        const { h, calls } = host(['grand']);
        const sounds = createStyleSounds(h);
        await sounds.request();
        expect(calls.prepared).toEqual([]);
        expect(sounds.status().kind).toBe('idle');
    });

    it('skips quietly where there is no Cache Storage to keep a pack in', async () => {
        vi.stubGlobal('caches', undefined);
        const { h, calls } = host(['grand']);
        const sounds = createStyleSounds(h);
        await sounds.request();
        expect(calls.prepared).toEqual([]);
        expect(sounds.status().kind).toBe('idle');
    });

    it('skips quietly where the browser refuses Cache Storage (blocked storage)', async () => {
        vi.stubGlobal('caches', {
            keys: async () => {
                throw new DOMException('The operation is insecure.', 'SecurityError');
            },
        });
        const { h, calls } = host(['grand']);
        const sounds = createStyleSounds(h);
        const seen: string[] = [];
        sounds.subscribe(() => seen.push(sounds.status().kind));
        await sounds.request();
        expect(calls.prepared).toEqual([]);
        expect(seen).toEqual(['idle']);
    });

    it('does not fetch a pack the band stopped wanting while others downloaded', async () => {
        const { h, calls } = host(['grand', 'acoustic-kit']);
        const wanted = h.wanted;
        let restyled = false;
        h.wanted = () => (restyled ? wanted().filter((id) => id !== 'acoustic-kit') : wanted());
        const prepare = h.prepare;
        h.prepare = async (id) => {
            await prepare(id);
            restyled = true;
        };
        await createStyleSounds(h).request();
        expect(calls.prepared).toEqual(['grand']);
    });

    it('fails quietly, lands what did arrive, and tries again on the next request', async () => {
        const { h, calls } = host(['grand', 'acoustic-kit'], ['acoustic-kit']);
        const sounds = createStyleSounds(h);
        await sounds.request();
        expect(calls.arrived).toBe(1);
        expect(sounds.status().kind).toBe('idle');
        await sounds.request();
        expect(calls.prepared).toEqual(['grand', 'acoustic-kit', 'acoustic-kit']);
    });

    it('says why a download the musician asked for failed, on the offer', async () => {
        const { h } = host(['acoustic-kit'], ['acoustic-kit']);
        const sounds = createStyleSounds(h);
        await sounds.request(true);
        const status = sounds.status();
        expect(status.kind).toBe('offer');
        expect(status.kind === 'offer' && status.error).toContain("Couldn't download");
    });

    it('runs one request at a time, and once more for a request that came in meanwhile', async () => {
        const { h, calls } = host(['grand']);
        let release: (() => void) | null = null;
        const prepare = h.prepare;
        h.prepare = async (id) => {
            await new Promise<void>((resolve) => {
                release = resolve;
            });
            return prepare(id);
        };
        const sounds = createStyleSounds(h);
        const first = sounds.request();
        const second = sounds.request();
        expect(second).toBe(first);
        await vi.waitFor(() => expect(release).not.toBeNull());
        release!();
        await first;
        // The second pass found nothing left to fetch.
        expect(calls.prepared).toEqual(['grand']);
    });
});
