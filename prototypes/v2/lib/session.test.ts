// @vitest-environment happy-dom
/**
 * The v1 import ledger's eviction cap (#1274 P2-6/P2-5 — "ledger cap off-by-one").
 *
 * `import-v1.ts`'s own `MAX_PRESETS` (500) plus one session item means a single run
 * against a maxed-out v1 profile writes 501 digests in one `rememberV1Import` call. The
 * old `V1_IMPORT_LIMIT` (500) evicted one of THAT SAME WRITE's own entries — a permanent
 * re-offer indistinguishable from the ledger never having recorded it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { rememberV1Import, v1ImportLedger } from './session';

// happy-dom in this repo ships no Storage implementation (see the same manual mock in
// tests/unit/songbook/v1-import.test.ts), so `session.ts`'s `localStorage.getItem`/
// `setItem` calls get a plain in-memory stand-in instead.
const store = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
    value: {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => store.set(key, String(value)),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        key: (index: number) => [...store.keys()][index] ?? null,
        get length() {
            return store.size;
        },
    },
    writable: true,
});

beforeEach(() => {
    store.clear();
});

describe('v1 import ledger', () => {
    it('retains every digest from a single 501-item write (500 presets + one session)', () => {
        const digests = Array.from({ length: 501 }, (_, i) => `digest-${i}`);
        rememberV1Import(digests, 'imported');

        const ledger = v1ImportLedger();
        expect(ledger.size).toBe(501);
        for (const digest of digests) {
            expect(ledger.get(digest)).toBe('imported');
        }
    });

    it('still evicts the oldest entries once genuinely over the (much higher) cap', () => {
        const digests = Array.from({ length: 1030 }, (_, i) => `digest-${i}`);
        rememberV1Import(digests, 'imported');

        const ledger = v1ImportLedger();
        expect(ledger.size).toBe(1024);
        expect(ledger.has('digest-0')).toBe(false);
        expect(ledger.has('digest-1029')).toBe(true);
    });

    it('moves a re-recorded digest to the end, surviving a trim that would otherwise drop it', () => {
        const digests = Array.from({ length: 1024 }, (_, i) => `digest-${i}`);
        rememberV1Import(digests, 'imported');
        // Re-record the OLDEST entry, then push the ledger back over its cap.
        rememberV1Import(['digest-0'], 'declined');
        rememberV1Import(['digest-new'], 'imported');

        const ledger = v1ImportLedger();
        expect(ledger.get('digest-0')).toBe('declined');
        expect(ledger.has('digest-new')).toBe(true);
        // `digest-1` was the next-oldest and untouched, so it's what falls off.
        expect(ledger.has('digest-1')).toBe(false);
    });
});
