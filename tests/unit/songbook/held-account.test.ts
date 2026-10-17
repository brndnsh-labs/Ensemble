import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    deviceMayHoldAccount,
    rememberAccountHeld,
} from '../../../prototypes/v2/lib/account/held-account.js';

/**
 * Node/happy-dom has no `localStorage` or `indexedDB`, which is what makes this a useful place to
 * test the module: every accessor is wrapped, and "no storage at all" has to resolve to a safe
 * answer rather than throwing into a render.
 */

function withStorage(store: Map<string, string>, options: { throws?: boolean } = {}) {
    const fake = {
        getItem: (key: string) => {
            if (options.throws) {
                throw new Error('storage is blocked');
            }
            return store.get(key) ?? null;
        },
        setItem: (key: string, value: string) => {
            if (options.throws) {
                throw new Error('storage is blocked');
            }
            store.set(key, value);
        },
        removeItem: (key: string) => {
            if (options.throws) {
                throw new Error('storage is blocked');
            }
            store.delete(key);
        },
    };
    vi.stubGlobal('localStorage', fake as unknown as Storage);
}

afterEach(() => {
    vi.unstubAllGlobals();
});

/**
 * The gate that decides whether this device asks the server who it is (#1357 patch).
 *
 * Every branch here is a safety direction, not a preference: a device that HOLDS an account must
 * never be talked out of asking about it by a marker that is missing, unreadable, or written by a
 * build that did not exist yet. Only a definite "this browser has no account database" is allowed
 * to answer "no".
 */
function withDatabases(names: string[] | null, options: { throws?: boolean } = {}) {
    vi.stubGlobal('indexedDB', {
        databases:
            names === null
                ? undefined
                : () => {
                      if (options.throws) {
                          return Promise.reject(new Error('storage is blocked'));
                      }
                      return Promise.resolve(names.map((name) => ({ name, version: 1 })));
                  },
    } as unknown as IDBFactory);
}

describe('deviceMayHoldAccount', () => {
    it('is true on the marker alone, without touching storage APIs', async () => {
        withStorage(new Map([['ensemble-v2-preview:account-held', 'yes']]));
        // No `indexedDB` stub at all: reaching for one would throw, which is the assertion.
        vi.stubGlobal('indexedDB', undefined);
        await expect(deviceMayHoldAccount()).resolves.toBe(true);
    });

    it('is false on the marker alone', async () => {
        withStorage(new Map([['ensemble-v2-preview:account-held', 'no']]));
        vi.stubGlobal('indexedDB', undefined);
        await expect(deviceMayHoldAccount()).resolves.toBe(false);
    });

    it('resolves an absent marker against the account database, and writes the answer down', async () => {
        const store = new Map<string, string>();
        withStorage(store);
        withDatabases(['ensemble-v2-preview']);
        await expect(deviceMayHoldAccount()).resolves.toBe(false);
        expect(store.get('ensemble-v2-preview:account-held')).toBe('no');
    });

    it('finds an account held under an older build, which wrote no marker', async () => {
        const store = new Map<string, string>();
        withStorage(store);
        withDatabases(['ensemble-v2-preview', 'ensemble-v2-account-songbook']);
        await expect(deviceMayHoldAccount()).resolves.toBe(true);
        expect(store.get('ensemble-v2-preview:account-held')).toBe('yes');
    });

    it('asks — and records nothing — when the browser cannot be asked', async () => {
        const store = new Map<string, string>();
        withStorage(store);
        // No `databases()` at all (Firefox), then one that rejects.
        withDatabases(null);
        await expect(deviceMayHoldAccount()).resolves.toBe(true);
        expect(store.has('ensemble-v2-preview:account-held')).toBe(false);
        withDatabases([], { throws: true });
        await expect(deviceMayHoldAccount()).resolves.toBe(true);
        expect(store.has('ensemble-v2-preview:account-held')).toBe(false);
    });

    it('asks when storage itself is unreadable', async () => {
        withStorage(new Map(), { throws: true });
        vi.stubGlobal('indexedDB', undefined);
        await expect(deviceMayHoldAccount()).resolves.toBe(true);
    });
});

describe('rememberAccountHeld', () => {
    it('writes both answers rather than removing the key', () => {
        const store = new Map<string, string>();
        withStorage(store);
        rememberAccountHeld(true);
        expect(store.get('ensemble-v2-preview:account-held')).toBe('yes');
        rememberAccountHeld(false);
        // 'no' rather than absent: absent means "not asked yet" and costs a `databases()` probe.
        expect(store.get('ensemble-v2-preview:account-held')).toBe('no');
    });

    it('swallows a refused write', () => {
        withStorage(new Map(), { throws: true });
        expect(() => rememberAccountHeld(true)).not.toThrow();
    });
});
