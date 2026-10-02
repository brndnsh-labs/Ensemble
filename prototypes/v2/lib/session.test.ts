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
import {
    allSongsSortPreference,
    countInPreference,
    forgetOpened,
    hasDeclinedV1Import,
    legacyStarredIds,
    openedAtMap,
    recordOpened,
    rememberAllSongsSort,
    rememberCountIn,
    rememberV1Import,
    rememberV1ImportDecline,
    rememberV1SessionMark,
    v1ImportLedger,
    v1SessionMark,
} from './session';

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

describe('the count-in preference (#1422)', () => {
    it('is unset on a fresh device, so the caller falls back to the engine default', () => {
        expect(countInPreference()).toBeNull();
    });
    it('round-trips true and false', () => {
        rememberCountIn(true);
        expect(countInPreference()).toBe(true);
        rememberCountIn(false);
        expect(countInPreference()).toBe(false);
    });
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

describe('the v1 import ledger states', () => {
    it('keeps "shown" apart from "imported", and both silence the automatic offer', () => {
        rememberV1Import(['landed'], 'imported');
        rememberV1Import(['unreadable'], 'shown');

        const ledger = v1ImportLedger();
        expect(ledger.get('landed')).toBe('imported');
        expect(ledger.get('unreadable')).toBe('shown');
        // What the offer filter actually asks (`v1ImportOffer`): in the ledger at all.
        expect(ledger.has('unreadable')).toBe(true);
        expect(ledger.has('something-new')).toBe(false);
    });

    it('still reads a "declined" entry written by a build before the per-device decline', () => {
        store.set('ensemble-v2-preview:v1-import', JSON.stringify({ old: 'declined' }));
        expect(v1ImportLedger().get('old')).toBe('declined');
    });

    it('drops a state it does not recognise rather than trusting hand-edited storage', () => {
        store.set(
            'ensemble-v2-preview:v1-import',
            JSON.stringify({ good: 'shown', bad: 'whatever', worse: { nested: true } }),
        );
        const ledger = v1ImportLedger();
        expect(ledger.get('good')).toBe('shown');
        expect(ledger.has('bad')).toBe(false);
        expect(ledger.has('worse')).toBe(false);
    });
});

/**
 * "Not now" is one per-device answer (DECISION 2026-09-19), kept apart from the ledger on
 * purpose: the ledger answers "are these v1 bytes already here?", this answers "may the app
 * open the offer by itself?". The song menu's permanent entry reads neither.
 */
describe('the v1 import decline', () => {
    it('is not recorded until it is given, and then sticks', () => {
        expect(hasDeclinedV1Import()).toBe(false);
        rememberV1ImportDecline();
        expect(hasDeclinedV1Import()).toBe(true);
    });

    it('leaves the ledger — and therefore what a later run imports — alone', () => {
        rememberV1Import(['digest-a'], 'imported');
        rememberV1ImportDecline();

        expect(v1ImportLedger().get('digest-a')).toBe('imported');
        expect(v1ImportLedger().size).toBe(1);
    });

    it('does not read as declined just because one item was imported', () => {
        rememberV1Import(['digest-a'], 'imported');
        expect(hasDeclinedV1Import()).toBe(false);
    });
});

describe('the v1 session mark', () => {
    it('is null until an import writes one, then reports what that write left behind', () => {
        expect(v1SessionMark()).toBeNull();
        rememberV1SessionMark({ digest: 'abc', document: 'doc-1', replaced: null });
        expect(v1SessionMark()).toEqual({ digest: 'abc', document: 'doc-1', replaced: null });

        rememberV1SessionMark({ digest: 'def', document: 'doc-2', replaced: 'doc-1' });
        expect(v1SessionMark()).toEqual({ digest: 'def', document: 'doc-2', replaced: 'doc-1' });
    });

    it('removes a record it cannot read, rather than re-rejecting it on every run', () => {
        // The shape this branch's first build wrote, on a device that ran it. Left in place
        // it would be re-read and re-rejected forever, holding that device on the
        // conservative revision-0 fallback with no way out (#1274 patch N4). It is v2's own
        // key, never a v1 one.
        store.set(
            'ensemble-v2-preview:v1-session-import',
            JSON.stringify({ digest: 'abc', revision: 1 }),
        );
        expect(v1SessionMark()).toBeNull();
        expect(store.has('ensemble-v2-preview:v1-session-import')).toBe(false);
        // And the v1 keys are none of its business either way.
        expect(store.has('ensemble_currentState')).toBe(false);
    });

    it('leaves a record it CAN read exactly where it is', () => {
        rememberV1SessionMark({ digest: 'abc', document: 'doc-1', replaced: null });
        v1SessionMark();
        expect(store.has('ensemble-v2-preview:v1-session-import')).toBe(true);
    });

    it('rejects a hand-edited or half-written record instead of trusting it', () => {
        // A bad mark must read as "no mark", which falls back to the conservative
        // revision-0 rule in `import-v1.ts` — never as a half-record that could wave an
        // overwrite of edited work through.
        for (const raw of [
            'null',
            '[]',
            'not json',
            '{"digest":"abc"}',
            '{"document":"doc-1","replaced":null}',
            '{"digest":"abc","document":"doc-1"}',
            '{"digest":"","document":"doc-1","replaced":null}',
            '{"digest":"abc","document":"","replaced":null}',
            '{"digest":"abc","document":"doc-1","replaced":2}',
        ]) {
            store.set('ensemble-v2-preview:v1-session-import', raw);
            expect(v1SessionMark()).toBeNull();
        }
    });
});

describe('per-song opened-at (#1440)', () => {
    it('is empty on a fresh device', () => {
        expect(openedAtMap().size).toBe(0);
    });

    it('records a timestamp readable back from the map', () => {
        recordOpened('song-1');
        const map = openedAtMap();
        expect(map.has('song-1')).toBe(true);
        expect(Number.isFinite(Date.parse(map.get('song-1')!))).toBe(true);
    });

    it('holds one row per song, not one `localStorage` key per song', () => {
        recordOpened('song-1');
        recordOpened('song-2');
        expect(store.size).toBe(1);
        expect(openedAtMap().size).toBe(2);
    });

    it('forgetOpened drops one song without disturbing the others', () => {
        recordOpened('song-1');
        recordOpened('song-2');
        forgetOpened('song-1');
        const map = openedAtMap();
        expect(map.has('song-1')).toBe(false);
        expect(map.has('song-2')).toBe(true);
    });

    it('drops an unreadable ledger to "never opened" rather than throwing', () => {
        store.set('ensemble-v2-preview:opened-at', 'not json');
        expect(openedAtMap().size).toBe(0);
    });
});

describe('the legacy device-local stars (#1440, read-only since #1477)', () => {
    it('is empty on a fresh device', () => {
        expect(legacyStarredIds().size).toBe(0);
    });

    it('reads the ids #1440 wrote, skipping anything that is not a string', () => {
        store.set('ensemble-v2-preview:starred', JSON.stringify(['song-1', 7, 'song-2']));
        expect(legacyStarredIds()).toEqual(new Set(['song-1', 'song-2']));
    });

    it('drops an unreadable ledger to "nothing starred" rather than throwing', () => {
        store.set('ensemble-v2-preview:starred', 'not json');
        expect(legacyStarredIds().size).toBe(0);
    });
});

describe('the All songs sort preference (#1440)', () => {
    it('is unset on a fresh device', () => {
        expect(allSongsSortPreference()).toBeNull();
    });

    it('round-trips every sort option', () => {
        for (const sort of ['title', 'recentOpened', 'recentAdded', 'composer', 'tempo'] as const) {
            rememberAllSongsSort(sort);
            expect(allSongsSortPreference()).toBe(sort);
        }
    });

    it('rejects a hand-edited value instead of trusting it', () => {
        store.set('ensemble-v2-preview:all-songs-sort', 'nonsense');
        expect(allSongsSortPreference()).toBeNull();
    });
});
