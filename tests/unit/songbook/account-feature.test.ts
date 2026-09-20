import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    accountsEnabled,
    accountsFlagFromSearch,
    accountsFlagRequest,
    setAccountsEnabled,
    stripAccountsParam,
} from '../../../prototypes/v2/lib/account/feature.js';
import {
    deviceMayHoldAccount,
    rememberAccountHeld,
} from '../../../prototypes/v2/lib/account/held-account.js';

/**
 * The v2 per-device account switch (#1262; default flipped on by the cutover, #1357). Node/
 * happy-dom has no `localStorage`, which is what makes this a useful place to test the module:
 * every accessor is wrapped, and "no storage at all" has to resolve to the DEFAULT rather than
 * throwing into a render.
 *
 * The URL-stripping half of `syncAccountsFlag` is proved in the browser instead
 * (`prototypes/v2/checks/account-entry.spec.ts` asserts the parameter never survives the
 * navigation) — a faked `location`/`history` pair would only test the fake.
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

describe('accountsFlagFromSearch', () => {
    it('reads an explicit opt in and opt out', () => {
        expect(accountsFlagFromSearch('?accounts=on')).toBe('on');
        expect(accountsFlagFromSearch('?accounts=off')).toBe('off');
    });

    it('ignores an absent, empty or unrecognized value', () => {
        expect(accountsFlagFromSearch('')).toBeNull();
        expect(accountsFlagFromSearch('?foo=bar')).toBeNull();
        expect(accountsFlagFromSearch('?accounts=')).toBeNull();
        expect(accountsFlagFromSearch('?accounts=true')).toBeNull();
        expect(accountsFlagFromSearch('?accounts=ON')).toBeNull();
    });

    it('finds the parameter among others', () => {
        expect(accountsFlagFromSearch('?chart=abc&accounts=on&x=1')).toBe('on');
    });
});

describe('accountsFlagRequest', () => {
    it('reads the param when there is no share hash', () => {
        expect(accountsFlagRequest('?accounts=on', '')).toBe('on');
        expect(accountsFlagRequest('?accounts=off', '')).toBe('off');
    });

    it('ignores the param entirely when a share payload is riding in the hash (P2-1)', () => {
        // /v2/?accounts=on#<share> must not opt a stranger's device in just for opening a link.
        expect(accountsFlagRequest('?accounts=on', '#abc123')).toBeNull();
        expect(accountsFlagRequest('?accounts=off', '#abc123')).toBeNull();
    });

    it('ignores it for an OLD v1 share link too, which has no hash at all (#1279)', () => {
        // The hash test above cannot see a v1 link: `/v2/?s=<chart>&accounts=on` is a share
        // link entirely in the query string, and it must not flip the flag either.
        expect(accountsFlagRequest('?s=abc&accounts=on', '')).toBeNull();
        expect(accountsFlagRequest('?accounts=on&s=abc', '')).toBeNull();
        expect(accountsFlagRequest('?prog=I%20%7C%20IV&accounts=on', '')).toBeNull();
        expect(accountsFlagRequest('?s=abc&accounts=off', '')).toBeNull();
        // A URL that merely carries v1's descriptive parameters is not a share link, so an
        // ordinary opt-in is still honoured.
        expect(accountsFlagRequest('?key=C&bpm=120&accounts=on', '')).toBe('on');
    });
});

describe('stripAccountsParam', () => {
    it('removes only the flag, so a consumed share link cannot re-apply it on reload', () => {
        expect(stripAccountsParam('?accounts=on')).toBe('');
        expect(stripAccountsParam('?accounts=on&utm_source=email')).toBe('?utm_source=email');
        expect(stripAccountsParam('?utm_source=email')).toBe('?utm_source=email');
        expect(stripAccountsParam('')).toBe('');
    });
});

describe('accountsEnabled', () => {
    it('is true with nothing stored — the default since the cutover', () => {
        withStorage(new Map());
        expect(accountsEnabled()).toBe(true);
    });

    it('is false only for the exact opt-out value', () => {
        withStorage(new Map([['ensemble-v2-preview:accounts', 'off']]));
        expect(accountsEnabled()).toBe(false);
        // A beta profile carrying the old opt-in reads as on, which is also the default now.
        withStorage(new Map([['ensemble-v2-preview:accounts', 'on']]));
        expect(accountsEnabled()).toBe(true);
        // Anything this module did not write is not an opt-out.
        withStorage(new Map([['ensemble-v2-preview:accounts', 'no']]));
        expect(accountsEnabled()).toBe(true);
    });

    it('is true — never a throw — when storage is unavailable or blocked', () => {
        // The stored value is an opt-OUT, so a device that cannot be asked has not opted out.
        // No stub at all: `localStorage` is not even declared in this environment.
        expect(accountsEnabled()).toBe(true);
        withStorage(new Map(), { throws: true });
        expect(accountsEnabled()).toBe(true);
    });
});

describe('setAccountsEnabled', () => {
    it('stores the opt out and removes the key on the way back', () => {
        const store = new Map<string, string>();
        withStorage(store);
        setAccountsEnabled(false);
        expect(store.get('ensemble-v2-preview:accounts')).toBe('off');
        expect(accountsEnabled()).toBe(false);
        setAccountsEnabled(true);
        // Removed, not set to 'on': an absent key is the default state.
        expect(store.has('ensemble-v2-preview:accounts')).toBe(false);
        expect(accountsEnabled()).toBe(true);
    });

    it('retires a beta profile’s old opt-in value rather than leaving it behind', () => {
        const store = new Map([['ensemble-v2-preview:accounts', 'on']]);
        withStorage(store);
        setAccountsEnabled(true);
        expect(store.has('ensemble-v2-preview:accounts')).toBe(false);
        expect(accountsEnabled()).toBe(true);
    });

    it('swallows a refused write', () => {
        withStorage(new Map(), { throws: true });
        expect(() => setAccountsEnabled(true)).not.toThrow();
        expect(() => setAccountsEnabled(false)).not.toThrow();
    });
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
