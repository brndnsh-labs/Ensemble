import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    accountsEnabled,
    accountsFlagFromSearch,
    accountsFlagRequest,
    setAccountsEnabled,
} from '../../../prototypes/v2/lib/account/feature.js';

/**
 * The v2 account dark-launch gate (#1262). Node/happy-dom has no `localStorage`, which is what
 * makes this a useful place to test the module: every accessor is wrapped, and "no storage at
 * all" has to resolve to "not opted in" rather than throwing into a render.
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
});

describe('accountsEnabled', () => {
    it('is false with nothing stored', () => {
        withStorage(new Map());
        expect(accountsEnabled()).toBe(false);
    });

    it('is true only for the exact opt-in value', () => {
        withStorage(new Map([['ensemble-v2-preview:accounts', 'on']]));
        expect(accountsEnabled()).toBe(true);
        withStorage(new Map([['ensemble-v2-preview:accounts', 'off']]));
        expect(accountsEnabled()).toBe(false);
        withStorage(new Map([['ensemble-v2-preview:accounts', 'yes']]));
        expect(accountsEnabled()).toBe(false);
    });

    it('is false — never a throw — when storage is unavailable or blocked', () => {
        // No stub at all: `localStorage` is not even declared in this environment.
        expect(accountsEnabled()).toBe(false);
        withStorage(new Map(), { throws: true });
        expect(accountsEnabled()).toBe(false);
    });
});

describe('setAccountsEnabled', () => {
    it('stores the opt in and removes the key on opt out', () => {
        const store = new Map<string, string>();
        withStorage(store);
        setAccountsEnabled(true);
        expect(store.get('ensemble-v2-preview:accounts')).toBe('on');
        expect(accountsEnabled()).toBe(true);
        setAccountsEnabled(false);
        // Removed, not set to 'off': an absent key is the default state.
        expect(store.has('ensemble-v2-preview:accounts')).toBe(false);
        expect(accountsEnabled()).toBe(false);
    });

    it('swallows a refused write', () => {
        withStorage(new Map(), { throws: true });
        expect(() => setAccountsEnabled(true)).not.toThrow();
        expect(() => setAccountsEnabled(false)).not.toThrow();
    });
});
