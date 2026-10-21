// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
    allSongsSortPreference,
    countInPreference,
    forgetOpened,
    type NeckPreferences,
    neckPreferences,
    openedAtMap,
    patchNeckPreferences,
    placeNeckHand,
    recordOpened,
    rememberAllSongsSort,
    rememberCountIn,
    rememberNeckPreferences,
    rememberSongMode,
    songModePreference,
} from './session';

// happy-dom in this repo ships no Storage implementation, so `session.ts`'s
// `localStorage.getItem`/`setItem` calls get a plain in-memory stand-in instead.
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

describe('the song mode preference (#1784)', () => {
    it('is Off on a fresh device', () => {
        expect(songModePreference()).toBeNull();
    });
    it('round-trips each offered length, and Off forgets it', () => {
        for (const minutes of [3, 4, 5] as const) {
            rememberSongMode(minutes);
            expect(songModePreference()).toBe(minutes);
        }
        rememberSongMode(null);
        expect(songModePreference()).toBeNull();
        expect(store.has('ensemble-v2-preview:song-mode')).toBe(false);
    });
    it('reads anything but an offered length as Off', () => {
        for (const stored of ['2', '6', '3.5', ' 3', '03', 'constructor', '']) {
            store.set('ensemble-v2-preview:song-mode', stored);
            expect(songModePreference()).toBeNull();
        }
    });
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

describe('the neck preferences (#1586)', () => {
    const KEY = 'ensemble-v2-preview:neck-prefs';
    const defaults: NeckPreferences = {
        instrument: 'guitar',
        home: 'key',
        rootStrings: 'all',
        labels: 'finger',
        fingers: false,
        shell: false,
    };
    it('defaults to guitar, first position, all root strings, finger labels, no finger detail and no shell', () => {
        expect(neckPreferences()).toEqual(defaults);
    });

    it('round-trips a full set, including no home window', () => {
        const uke: NeckPreferences = {
            instrument: 'uke-low-g',
            home: [4, 9],
            rootStrings: 'classic',
            labels: 'note',
            fingers: true,
            shell: true,
        };
        rememberNeckPreferences(uke);
        expect(neckPreferences()).toEqual(uke);
        rememberNeckPreferences({ ...uke, home: null });
        expect(neckPreferences().home).toBeNull();
    });

    it('falls back to the defaults for a blob that is not a preferences object', () => {
        for (const bad of ['not json', '[1,2]', 'null', '"guitar"', '42']) {
            store.set(KEY, bad);
            expect(neckPreferences()).toEqual(defaults);
        }
    });

    it('rejects each unknown field on its own and keeps the rest', () => {
        store.set(
            KEY,
            JSON.stringify({
                instrument: 'banjo',
                home: [0, 99],
                rootStrings: 'classic',
                labels: 'colour',
                fingers: 'yes',
                shell: 1,
            }),
        );
        expect(neckPreferences()).toEqual({ ...defaults, rootStrings: 'classic' });
        // A uke with a broken window is back on its default, which is the uke's, not the guitar's.
        store.set(KEY, JSON.stringify({ instrument: 'uke', home: [7, 2] }));
        expect(neckPreferences()).toEqual({ ...defaults, instrument: 'uke' });
        expect(placeNeckHand(neckPreferences()).home).toEqual([1, 6]);
    });

    it('keeps a default home window default across instruments, and one the musician moved', () => {
        const uke = patchNeckPreferences(defaults, { instrument: 'uke' });
        expect(placeNeckHand(uke).home).toEqual([1, 6]);
        const guitar = patchNeckPreferences(uke, { instrument: 'guitar' });
        expect(placeNeckHand(guitar).home).toEqual([1, 6]);
        expect(placeNeckHand(patchNeckPreferences(uke, { instrument: 'uke-low-g' })).home).toEqual([
            1, 6,
        ]);
        const moved = { ...defaults, home: [5, 10] as [number, number] };
        expect(patchNeckPreferences(moved, { instrument: 'uke' }).home).toEqual([5, 10]);
        expect(patchNeckPreferences(defaults, { instrument: 'uke', home: null }).home).toBeNull();
    });

    describe('the home window is first position until the musician moves it (#1598, #1840)', () => {
        it('places an unchosen window on frets 1–6 for every instrument', () => {
            for (const instrument of ['guitar', 'uke', 'uke-low-g'] as const) {
                expect(placeNeckHand({ ...defaults, instrument }).home).toEqual([1, 6]);
            }
        });

        it('leaves a window the musician moved where it is', () => {
            const moved = patchNeckPreferences(defaults, { home: [5, 10] });
            expect(placeNeckHand(moved).home).toEqual([5, 10]);
            // Moved onto the default is still moved: it stays put if the default ever changes.
            const onDefault = patchNeckPreferences(defaults, { home: [1, 6] });
            expect(placeNeckHand(onDefault).home).toEqual([1, 6]);
            expect(onDefault.home).not.toBe('key');
            // Anywhere is not a window to place either.
            expect(placeNeckHand({ ...defaults, home: null }).home).toBeNull();
        });

        it('remembers followed, moved and anywhere apart, across a reload', () => {
            rememberNeckPreferences(defaults);
            expect(neckPreferences().home).toBe('key');
            rememberNeckPreferences({ ...defaults, home: [2, 7] });
            expect(neckPreferences().home).toEqual([2, 7]);
            rememberNeckPreferences({ ...defaults, home: null });
            expect(neckPreferences().home).toBeNull();
            // Locking the hand again is `'key'`: back on the default.
            rememberNeckPreferences(patchNeckPreferences(neckPreferences(), { home: 'key' }));
            expect(placeNeckHand(neckPreferences()).home).toEqual([1, 6]);
        });

        it('reads a window stored before the rule as unmoved only when it is the old default', () => {
            // The old blob has no `version`: a guitar's 2–7 and a uke's 1–6 were the fixed defaults.
            store.set(KEY, JSON.stringify({ instrument: 'guitar', home: [2, 7] }));
            expect(neckPreferences().home).toBe('key');
            store.set(KEY, JSON.stringify({ instrument: 'uke', home: [1, 6] }));
            expect(neckPreferences().home).toBe('key');
            // Any other window was moved, and so was the other instrument's default.
            store.set(KEY, JSON.stringify({ instrument: 'guitar', home: [1, 6] }));
            expect(neckPreferences().home).toEqual([1, 6]);
            store.set(KEY, JSON.stringify({ instrument: 'guitar', home: [4, 9] }));
            expect(neckPreferences().home).toEqual([4, 9]);
            store.set(KEY, JSON.stringify({ instrument: 'guitar', home: null }));
            expect(neckPreferences().home).toBeNull();
            // An unknown string is not a window: back on the default.
            store.set(KEY, JSON.stringify({ version: 2, instrument: 'guitar', home: 'nut' }));
            expect(neckPreferences().home).toBe('key');
        });
    });
});
