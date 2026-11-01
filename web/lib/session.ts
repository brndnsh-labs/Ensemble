// Leaf modules, not the `./voicings` barrel: the barrel would pull the whole voicer into every
// page that reads a setting (#1877).
import { HOME_FRETS } from './voicings/home-window';
import { NECK_INSTRUMENTS, type NeckPrefs } from './voicings/neck-instruments';
import type { HomeWindow } from './voicings/types';

const LAST_OPENED = 'ensemble-v2-preview:last-opened';

/** A convenience preference, never an authored document edit or a playback prerequisite. */
export function lastOpenedSong(): string | null {
    try {
        return localStorage.getItem(LAST_OPENED);
    } catch {
        return null;
    }
}

export function rememberSong(id: string): void {
    try {
        localStorage.setItem(LAST_OPENED, id);
    } catch {
        // Playback and explicit saves work without this optional preference.
    }
}

const OPENED_AT = 'ensemble-v2-preview:opened-at';

/**
 * Per-song "opened at" timestamps (#1440) — one row per document, distinct from `lastOpenedSong`
 * above (which only ever answers for the single most-recently-opened chart, the Continue card's
 * fact). The All songs page's Recently-opened sort and filter need every song's own timestamp.
 *
 * A single JSON object keyed by document id rather than one `localStorage` key per song: a
 * songbook can hold thousands of entries, and one key per song would mean scanning every stored
 * key (`localStorage.key(i)`) the way `lib/repository.ts`'s recovery slots do — appropriate there
 * because a recovery slot is per-writer-per-document, but this is one small preference per
 * document, cheap to keep as one blob.
 *
 * A device-local preference, never a document edit: opening a chart never bumps its
 * `updatedAt`/`revision` and never queues a Save, and this write touches neither.
 */
export function openedAtMap(): Map<string, string> {
    const map = new Map<string, string>();
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(OPENED_AT);
    } catch {
        return map;
    }
    if (!raw) {
        return map;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return map;
        }
        for (const [id, stamp] of Object.entries(parsed)) {
            if (typeof stamp === 'string' && Number.isFinite(Date.parse(stamp))) {
                map.set(id, stamp);
            }
        }
    } catch {
        // An unreadable ledger only costs "never opened" for everything; never block startup.
    }
    return map;
}

/** Records this song as opened just now. See `openedAtMap` for what this deliberately is not. */
export function recordOpened(id: string): void {
    const map = openedAtMap();
    map.set(id, new Date().toISOString());
    try {
        localStorage.setItem(OPENED_AT, JSON.stringify(Object.fromEntries(map)));
    } catch {
        // Best-effort preference; the chart still opens either way.
    }
}

/** Drops one song's opened-at row — deleting it must not leave a dangling entry behind (#1440). */
export function forgetOpened(id: string): void {
    const map = openedAtMap();
    if (!map.delete(id)) {
        return;
    }
    try {
        localStorage.setItem(OPENED_AT, JSON.stringify(Object.fromEntries(map)));
    } catch {
        // Best-effort preference; nothing downstream depends on this succeeding.
    }
}

const ALL_SONGS_SORT = 'ensemble-v2-preview:all-songs-sort';
export type AllSongsSort = 'title' | 'recentOpened' | 'recentAdded' | 'composer' | 'tempo';
const ALL_SONGS_SORTS: readonly AllSongsSort[] = [
    'title',
    'recentOpened',
    'recentAdded',
    'composer',
    'tempo',
];

/** The All songs page's remembered sort choice (#1440) — a device preference, unset by default. */
export function allSongsSortPreference(): AllSongsSort | null {
    try {
        const stored = localStorage.getItem(ALL_SONGS_SORT);
        return stored !== null && (ALL_SONGS_SORTS as readonly string[]).includes(stored)
            ? (stored as AllSongsSort)
            : null;
    } catch {
        return null;
    }
}

export function rememberAllSongsSort(sort: AllSongsSort): void {
    try {
        localStorage.setItem(ALL_SONGS_SORT, sort);
    } catch {
        // The live choice still applies for this render; only the memory is lost.
    }
}

const THEME = 'ensemble-v2-preview:theme';
export type ThemeChoice = 'day' | 'stage';

/** Explicit Day/Stage choice for the music stand; unset means follow the system. */
export function themePreference(): ThemeChoice | null {
    try {
        const stored = localStorage.getItem(THEME);
        return stored === 'day' || stored === 'stage' ? stored : null;
    } catch {
        return null;
    }
}

export function rememberTheme(choice: ThemeChoice): void {
    try {
        localStorage.setItem(THEME, choice);
    } catch {
        // The stand still switches for this page; only the memory is lost.
    }
}

/** System: forget the stored choice, so the OS drives the theme again. */
export function forgetTheme(): void {
    try {
        localStorage.removeItem(THEME);
    } catch {
        // The stand still follows the system for this page; only the memory is lost.
    }
}

const PALETTE = 'ensemble-v2-preview:palette';
/** The colour palettes (#1280); `warm` is the default look and is never stored. */
export const PALETTES = ['warm', 'cool', 'contrast', 'forest', 'plum'] as const;
export type Palette = (typeof PALETTES)[number];

/**
 * The stored palette, read strictly: storage is untrusted, so anything but one of the other four
 * ids is Warm. Mirrored by the pre-hydration script in `app/layout.tsx`.
 */
export function palettePreference(): Palette {
    try {
        const stored = localStorage.getItem(PALETTE);
        return PALETTES.find((id) => id !== 'warm' && id === stored) ?? 'warm';
    } catch {
        return 'warm';
    }
}

/** Warm is stored as no key at all, so the default device carries nothing. */
export function rememberPalette(palette: Palette): void {
    try {
        if (palette === 'warm') {
            localStorage.removeItem(PALETTE);
        } else {
            localStorage.setItem(PALETTE, palette);
        }
    } catch {
        // The palette still applies for this page; only the memory is lost.
    }
}

const STAND_MODE = 'ensemble-v2-preview:stand-mode';
export type StandMode = 'chart' | 'neck';

/** Which view the stand shows a song in (#1587): the chart sheet or the neck. Editing is never remembered. */
export function standMode(): StandMode {
    try {
        return localStorage.getItem(STAND_MODE) === 'neck' ? 'neck' : 'chart';
    } catch {
        return 'chart';
    }
}

export function rememberStandMode(mode: StandMode): void {
    try {
        localStorage.setItem(STAND_MODE, mode);
    } catch {
        // The stand still switches for this page; only the memory is lost.
    }
}

const NECK_PREFS = 'ensemble-v2-preview:neck-prefs';

export type NeckLabels = 'finger' | 'degree' | 'note';
/**
 * Where the hand lives (#1598): a window the musician chose (dragged, or stepped with the
 * handle), `null` for anywhere on the neck, or `'key'` — no window chosen, so the hand sits in
 * first position (`placeNeckHand`). The value keeps its name from when the default followed the
 * chart's key (until #1840): devices store it. "Still on the default" is this value, never a
 * comparison of frets: a chosen window that happens to equal the default is still chosen and
 * stays put on the next chart.
 */
export type NeckHome = HomeWindow | null | 'key';
/**
 * The neck's per-device settings (#1586): the voicer's `NeckPrefs` — its window as the musician
 * left it, `NeckHome` — plus what the dots show, whether the finger-by-finger detail is spoken
 * under the headline (#1587, off by default) and whether the dots outside the shell are dimmed
 * (#1853, "Show the shell", off by default: `outsideShell`).
 */
export interface NeckPreferences extends Omit<NeckPrefs, 'home'> {
    home: NeckHome;
    labels: NeckLabels;
    fingers: boolean;
    shell: boolean;
}
/** The settings with the hand placed for one chart (`placeNeckHand`): what the voicer and the neck read. */
export interface PlacedNeckPreferences extends NeckPreferences {
    home: HomeWindow | null;
}

// A stored id is checked against the one instrument table's keys before anything indexes it.
const NECK_INSTRUMENT_IDS = Object.keys(NECK_INSTRUMENTS) as NeckPrefs['instrument'][];
const NECK_ROOT_STRINGS: readonly NeckPrefs['rootStrings'][] = ['all', 'classic'];
const NECK_LABELS: readonly NeckLabels[] = ['finger', 'degree', 'note'];

/**
 * Place the hand for a chart: a chosen window (or none) as it is, `'key'` in first position,
 * frets 1 to `HOME_FRETS`, on every instrument and in every key (#1598; #1840, 2026-10-20). The
 * guitar used to follow the chart's opening key and sit on frets 2–7 for the sharp keys, where
 * their roots on the low strings run up to the 7th fret, so a beginner song in G, D, A or E
 * showed no open chord; since #1827 and #1833 first position plays the open forms, the chords a
 * learner knows. A ukulele always started there: its roots go on any of four strings a 4th or
 * less apart, so first position holds every key's chords.
 */
export function placeNeckHand(prefs: NeckPreferences): PlacedNeckPreferences {
    return { ...prefs, home: prefs.home === 'key' ? [1, HOME_FRETS] : prefs.home };
}

export function defaultNeckPreferences(): NeckPreferences {
    return {
        instrument: 'guitar',
        home: 'key',
        rootStrings: 'all',
        labels: 'finger',
        fingers: false,
        shell: false,
    };
}

/** A home window lives on the instrument's fretted frets, 1 to its `maxFret`. */
const isHomeWindow = (value: unknown, instrument: NeckPrefs['instrument']): value is HomeWindow =>
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(
        (f) => Number.isInteger(f) && f >= 1 && f <= NECK_INSTRUMENTS[instrument].maxFret,
    ) &&
    value[0] <= value[1];

const pick = <T>(allowed: readonly T[], value: unknown, fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;

/** The stored shape that can say `home: 'key'` (#1598); a blob without it predates the rule. */
const NECK_PREFS_VERSION = 2;
/** The window each instrument opened on before #1598: that era's blob stored it like a moved one. */
const PRE_1598_HOME: Record<NeckPrefs['instrument'], HomeWindow> = {
    guitar: [2, 7],
    uke: [1, 6],
    'uke-low-g': [1, 6],
};

/**
 * Device-local neck preferences — never document fields: which instrument, where the hand
 * lives, which strings may hold a root, what the dots say, whether the fingers are spoken and
 * whether the shell is shown.
 * Each field is validated on its own, so one unknown value falls back to its default without
 * losing the rest; anything that is not a JSON object is all defaults.
 *
 * A blob from before #1598 always held a window, moved or not, so a window equal to that era's
 * fixed default (a guitar's 2–7, a uke's 1–6: `PRE_1598_HOME`) is read as never moved and takes
 * the default from now on; any other window was moved and is kept. The cost is a musician who
 * dragged away and back to exactly that default, who gets first position instead.
 */
export function neckPreferences(): NeckPreferences {
    const defaults = defaultNeckPreferences();
    let raw: unknown;
    try {
        const stored = localStorage.getItem(NECK_PREFS);
        if (stored === null) {
            return defaults;
        }
        raw = JSON.parse(stored);
    } catch {
        return defaults;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return defaults;
    }
    const stored = raw as Record<string, unknown>;
    const instrument = pick(NECK_INSTRUMENT_IDS, stored.instrument, defaults.instrument);
    let home: NeckHome = 'key';
    if (stored.home === null) {
        home = null;
    } else if (isHomeWindow(stored.home, instrument)) {
        const [from, to] = stored.home;
        const old = PRE_1598_HOME[instrument];
        const unmoved = stored.version !== NECK_PREFS_VERSION && from === old[0] && to === old[1];
        home = unmoved ? 'key' : [from, to];
    }
    return {
        instrument,
        home,
        rootStrings: pick(NECK_ROOT_STRINGS, stored.rootStrings, defaults.rootStrings),
        labels: pick(NECK_LABELS, stored.labels, defaults.labels),
        fingers: typeof stored.fingers === 'boolean' ? stored.fingers : defaults.fingers,
        shell: typeof stored.shell === 'boolean' ? stored.shell : defaults.shell,
    };
}

export function rememberNeckPreferences(prefs: NeckPreferences): void {
    try {
        const { instrument, home, rootStrings, labels, fingers, shell } = prefs;
        localStorage.setItem(
            NECK_PREFS,
            JSON.stringify({
                version: NECK_PREFS_VERSION,
                instrument,
                home,
                rootStrings,
                labels,
                fingers,
                shell,
            }),
        );
    } catch {
        // The neck still follows the change for this page; only the memory is lost.
    }
}

/**
 * Apply a change. The home window needs no rule of its own: an unchosen one is `'key'`, which
 * each instrument and each chart places for itself (`placeNeckHand`), so switching between
 * guitar and uke moves a default window and carries a chosen one along.
 */
export function patchNeckPreferences(
    prev: NeckPreferences,
    patch: Partial<NeckPreferences>,
): NeckPreferences {
    return { ...prev, ...patch };
}

const MASTER_VOLUME = 'ensemble-v2-preview:master-volume';

/**
 * Device-local mixer preference (#1276) — `playback.masterVolume` is classified
 * `preferences` in `STATE_OWNERSHIP_MANIFEST` (`../../core/songbook/state-ownership.ts`),
 * so it never belongs on a `ChartContent`/saved chart or a share link, the same way
 * `themePreference` above never does. `null` means "no preference recorded yet" —
 * callers fall back to the engine's own default.
 */
export function masterVolumePreference(): number | null {
    try {
        const stored = localStorage.getItem(MASTER_VOLUME);
        if (stored === null) {
            return null;
        }
        const value = Number(stored);
        return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
    } catch {
        return null;
    }
}

export function rememberMasterVolume(value: number): void {
    try {
        localStorage.setItem(MASTER_VOLUME, String(value));
    } catch {
        // Live volume still applies for this session; only the memory is lost.
    }
}

const COUNT_IN = 'ensemble-v2-preview:count-in';

/**
 * Device-local practice preference — `playback.countIn` is `preferences`-owned in
 * `STATE_OWNERSHIP_MANIFEST` (a player habit, not part of any one chart), so it persists here,
 * the same way `masterVolumePreference` above does rather than riding a saved chart or a share
 * link. `null` means "no preference recorded yet" — the caller falls back to the engine's own
 * default (`true`, matching v1's).
 */
export function countInPreference(): boolean | null {
    try {
        const stored = localStorage.getItem(COUNT_IN);
        return stored === null ? null : stored === '1';
    } catch {
        return null;
    }
}

export function rememberCountIn(value: boolean): void {
    try {
        localStorage.setItem(COUNT_IN, value ? '1' : '0');
    } catch {
        // The live toggle still applies for this session; only the memory is lost.
    }
}

const AUTO_SOUNDS = 'ensemble-v2-preview:auto-sounds';

/**
 * Whether the band fetches its style's sounds by itself when it plays (#1997): on unless this
 * device turned it off (the Players tab's switch). A device habit, never part of a chart. A
 * browser that refuses storage reads as on; with no Cache Storage the fetch skips itself anyway.
 */
export function autoSoundsPreference(): boolean {
    try {
        return localStorage.getItem(AUTO_SOUNDS) !== '0';
    } catch {
        return true;
    }
}

export function rememberAutoSounds(value: boolean): void {
    try {
        localStorage.setItem(AUTO_SOUNDS, value ? '1' : '0');
    } catch {
        // Storage refused: the band fetches as it would by default (`autoSoundsPreference`).
    }
}

const SONG_MODE = 'ensemble-v2-preview:song-mode';
/** The lengths song mode offers, in minutes (#1784); Off is no stored value at all. */
export const SONG_MINUTES = [3, 4, 5] as const;
export type SongMinutes = (typeof SONG_MINUTES)[number];

/**
 * Song mode (#1784): about how long a looping chart plays before the band wraps up, in minutes,
 * or null for Off. A practice habit of this device, like `countInPreference` above, and never
 * written to a chart: the performance is counted at Play time (`lib/song-mode.ts`). The stored
 * value is read strictly — only an offered length counts, anything else is Off.
 */
export function songModePreference(): SongMinutes | null {
    try {
        const stored = localStorage.getItem(SONG_MODE);
        return SONG_MINUTES.find((minutes) => String(minutes) === stored) ?? null;
    } catch {
        return null;
    }
}

export function rememberSongMode(minutes: SongMinutes | null): void {
    try {
        if (minutes === null) {
            localStorage.removeItem(SONG_MODE);
        } else {
            localStorage.setItem(SONG_MODE, String(minutes));
        }
    } catch {
        // The live setting still applies for this session; only the memory is lost.
    }
}
