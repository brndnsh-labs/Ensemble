import type { V1SessionMark } from './import-v1';
import type { HomeWindow, ShellPrefs } from './shells';

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

const STARRED = 'ensemble-v2-preview:starred';

/**
 * The device-local stars #1440 kept here — one small JSON blob of song ids — READ ONLY since
 * #1477. Stars are now the built-in Starred collection (`lib/collections.ts`), and this key is
 * what the guest's one-time copy reads (`migrateGuestStars` in `lib/repository.ts`). Nothing
 * writes or removes it any more: it is left exactly as it was, so the copy is reversible and an
 * older build still finds every star it had.
 */
export function legacyStarredIds(): Set<string> {
    const ids = new Set<string>();
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(STARRED);
    } catch {
        return ids;
    }
    if (!raw) {
        return ids;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            for (const id of parsed) {
                if (typeof id === 'string') {
                    ids.add(id);
                }
            }
        }
    } catch {
        // An unreadable ledger only costs "nothing starred"; never block startup on it.
    }
    return ids;
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

const SHELL_PREFS = 'ensemble-v2-preview:shell-prefs';

export type ShellLabels = 'finger' | 'degree' | 'note';
/** The neck's per-device settings (#1586): the voicer's `ShellPrefs` plus what the dots show. */
export interface ShellPreferences extends ShellPrefs {
    labels: ShellLabels;
}

const SHELL_INSTRUMENTS: readonly ShellPrefs['instrument'][] = ['guitar', 'uke', 'uke-low-g'];
const SHELL_ROOT_STRINGS: readonly ShellPrefs['rootStrings'][] = ['all', 'classic'];
const SHELL_LABELS: readonly ShellLabels[] = ['finger', 'degree', 'note'];
/** The neck draws frets 0–15; a home window lives on frets 1–15. */
const SHELL_MAX_FRET = 15;

/** A guitar's hand starts on frets 2–7; a uke's (either tuning) on 1–6. */
export function defaultShellHome(instrument: ShellPrefs['instrument']): HomeWindow {
    return instrument === 'guitar' ? [2, 7] : [1, 6];
}

export function defaultShellPreferences(): ShellPreferences {
    return {
        instrument: 'guitar',
        home: defaultShellHome('guitar'),
        rootStrings: 'all',
        labels: 'finger',
    };
}

const isHomeWindow = (value: unknown): value is HomeWindow =>
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((f) => Number.isInteger(f) && f >= 1 && f <= SHELL_MAX_FRET) &&
    value[0] <= value[1];

const pick = <T>(allowed: readonly T[], value: unknown, fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;

/**
 * Device-local neck preferences — never document fields: which instrument, where the hand
 * lives, which strings may hold a root and what the dots say. Each field is validated on its
 * own, so one unknown value falls back to its default without losing the rest; anything that is
 * not a JSON object is all defaults.
 */
export function shellPreferences(): ShellPreferences {
    const defaults = defaultShellPreferences();
    let raw: unknown;
    try {
        const stored = localStorage.getItem(SHELL_PREFS);
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
    const instrument = pick(SHELL_INSTRUMENTS, stored.instrument, defaults.instrument);
    let home: HomeWindow | null = defaultShellHome(instrument);
    if (stored.home === null) {
        home = null;
    } else if (isHomeWindow(stored.home)) {
        home = [stored.home[0], stored.home[1]];
    }
    return {
        instrument,
        home,
        rootStrings: pick(SHELL_ROOT_STRINGS, stored.rootStrings, defaults.rootStrings),
        labels: pick(SHELL_LABELS, stored.labels, defaults.labels),
    };
}

export function rememberShellPreferences(prefs: ShellPreferences): void {
    try {
        const { instrument, home, rootStrings, labels } = prefs;
        localStorage.setItem(
            SHELL_PREFS,
            JSON.stringify({ instrument, home, rootStrings, labels }),
        );
    } catch {
        // The neck still follows the change for this page; only the memory is lost.
    }
}

/**
 * Apply a change. Switching between guitar and uke carries the home window along only when the
 * musician moved it: a window still on the old instrument's default becomes the new one's.
 */
export function patchShellPreferences(
    prev: ShellPreferences,
    patch: Partial<ShellPreferences>,
): ShellPreferences {
    const next = { ...prev, ...patch };
    const sameWindow = (a: HomeWindow | null, b: HomeWindow) =>
        a !== null && a[0] === b[0] && a[1] === b[1];
    if (
        patch.home === undefined &&
        next.instrument !== prev.instrument &&
        sameWindow(prev.home, defaultShellHome(prev.instrument))
    ) {
        next.home = defaultShellHome(next.instrument);
    }
    return next;
}

const MASTER_VOLUME = 'ensemble-v2-preview:master-volume';

/**
 * Device-local mixer preference (#1276) — `playback.masterVolume` is classified
 * `preferences` in `STATE_OWNERSHIP_MANIFEST` (`../../public/songbook/state-ownership.ts`),
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

const V1_IMPORT = 'ensemble-v2-preview:v1-import';
/**
 * What this device has already done about one v1 item's exact bytes.
 *
 * `'imported'` — it is in the songbook. `'shown'` — it was reported and there is nothing
 * more to do about it (unreadable, unconvertible, or a copy edited here that the import
 * deliberately would not overwrite), so the automatic offer stops re-opening for it
 * (#1274 patch R1). `'declined'` is only ever READ: devices whose ledger predates the
 * per-device decline recorded it, and it means the same thing to the offer filter.
 */
export type V1ImportState = 'imported' | 'shown' | 'declined';
/**
 * A cap, not a quota: the ledger holds one short digest per v1 item this device has
 * imported or declined, and the oldest entries fall off first.
 *
 * Set comfortably above `import-v1.ts`'s own `MAX_PRESETS` (500) plus the one session
 * item: a profile at that cap produces 501 digests in a single run, and a limit set to
 * exactly 500 would evict one of THIS run's own just-written entries on the very write
 * that recorded it — a permanent re-offer for whichever digest fell off, indistinguishable
 * from the ledger never having seen it. 1,024 covers that plus real headroom for later runs.
 */
const V1_IMPORT_LIMIT = 1024;

/**
 * What this device has already IMPORTED, keyed by the digest of the v1 bytes (#1274).
 *
 * A digest ledger rather than a single "offered once" boolean because it answers the
 * question a rerun asks: are these exact v1 bytes already in the songbook? That is what
 * makes "run the import again on an unchanged profile and nothing is written" true without
 * reading IndexedDB, and what lets a progression saved in v1 LATER still be offered. The
 * separate question "should we open the offer by ourselves at all?" is one per-device
 * answer, and lives in `hasDeclinedV1Import` below.
 *
 * `'declined'` is still read for devices whose ledger was written before that split (this
 * suppresses the auto-offer for those bytes, which is what it was recorded to mean), but
 * nothing writes it any more.
 *
 * A Map, not a plain object: the stored JSON is untrusted (hand-edited storage, a
 * `__proto__` key) and a `Record` read with `ledger[digest]` is exactly the
 * prototype-pollution shape the codebase guards against. It also stays a digest ledger
 * rather than a single "offered once" boolean so v1 data that changes or appears later
 * is offered again instead of being silently swallowed.
 *
 * This is a per-device convenience under v2's OWN key prefix. It never touches a v1
 * key, and losing it only means the offer reappears — the deterministic document ids
 * in `import-v1.ts` still stop a second copy from landing.
 */
export function v1ImportLedger(): Map<string, V1ImportState> {
    const ledger = new Map<string, V1ImportState>();
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(V1_IMPORT);
    } catch {
        return ledger;
    }
    if (!raw) {
        return ledger;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return ledger;
        }
        for (const [digest, state] of Object.entries(parsed)) {
            if (state === 'imported' || state === 'shown' || state === 'declined') {
                ledger.set(digest, state);
            }
        }
    } catch {
        // An unreadable ledger only costs a repeated offer; never block startup on it.
    }
    return ledger;
}

/** Records the outcome for one or more v1 items, merging into what is already there. */
export function rememberV1Import(digests: readonly string[], state: V1ImportState): void {
    if (!digests.length) {
        return;
    }
    const ledger = v1ImportLedger();
    for (const digest of digests) {
        // Re-set so a re-recorded digest moves to the end of the insertion order and
        // survives the trim below.
        ledger.delete(digest);
        ledger.set(digest, state);
    }
    const entries = [...ledger.entries()].slice(-V1_IMPORT_LIMIT);
    try {
        localStorage.setItem(V1_IMPORT, JSON.stringify(Object.fromEntries(entries)));
    } catch {
        // The songs are already saved in the songbook; only the "don't ask again"
        // memory is lost, and the import is idempotent if it is offered again.
    }
}

const V1_IMPORT_DECLINED = 'ensemble-v2-preview:v1-import-declined';

/**
 * Has this device answered "Not now" to the v1 import offer (DECISION 2026-09-19)?
 *
 * One per-device answer, deliberately not per item: declining means "stop asking me", and a
 * musician who saves another progression in v1 next week did not ask to be interrupted
 * again. The song menu's permanent "Bring over old Ensemble songs" entry is the way back,
 * and it ignores this entirely — this only ever suppresses the AUTOMATIC offer.
 *
 * Same shape as #1268's `hasDecidedAdoption` (`lib/account/adopt-guest.ts`): presence of a
 * timestamped key, and unreadable storage reads as "decided" so a browser that refuses
 * storage is never nagged on every load.
 */
export function hasDeclinedV1Import(): boolean {
    try {
        return localStorage.getItem(V1_IMPORT_DECLINED) !== null;
    } catch {
        return true;
    }
}

export function rememberV1ImportDecline(): void {
    try {
        localStorage.setItem(V1_IMPORT_DECLINED, new Date().toISOString());
    } catch {
        // Best-effort preference. The offer reappearing is safe; the import is idempotent.
    }
}

const V1_SESSION_MARK = 'ensemble-v2-preview:v1-session-import';

/**
 * What the last import of the v1 session wrote on this device: the v1 bytes it read, the
 * content it produced, and the content it replaced (#1274; shape per patch R5).
 *
 * The v1 session is the one item with a FIXED document id, so a rerun updates it in place —
 * and the only way to tell "this copy is still exactly what the import put here" from "the
 * musician has since edited it here" is to remember what the import itself left. The
 * document's own revision cannot answer that: the import's update bumps it, and the revision
 * a half-finished write would have produced is the same number the musician's own next Save
 * produces. Content digests do not have that ambiguity. `V1SessionMark` in `import-v1.ts`
 * owns the rules; this only stores and validates.
 *
 * Its own key rather than a richer ledger value: the ledger is a digest → state map with an
 * eviction cap, and this is a single record that must not be evicted by 500 progressions.
 */
export function v1SessionMark(): V1SessionMark | null {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(V1_SESSION_MARK);
    } catch {
        return null;
    }
    if (!raw) {
        return null;
    }
    const mark = parseV1SessionMark(raw);
    if (!mark) {
        // Drop it (#1274 patch N4). This is v2's OWN key — never a v1 one, which this
        // feature only ever reads — and a record that does not validate has no meaning to
        // anything: the earlier `{digest, revision}` shape from this branch's first build, a
        // half-written value, something hand-edited. Leaving it would re-read and re-reject
        // it on every run, and `rememberV1SessionMark` would overwrite it anyway the moment
        // an import writes. Removing makes the fallback deterministic instead of sticky.
        try {
            localStorage.removeItem(V1_SESSION_MARK);
        } catch {
            // Read-only storage: the fallback below is already the safe one.
        }
    }
    return mark;
}

/**
 * The stored record, or null for anything this build cannot trust. Nullish rather than
 * lenient on purpose: the fallback is `import-v1.ts`'s conservative revision-0 rule, which
 * refuses to overwrite rather than risking an edited copy.
 */
function parseV1SessionMark(raw: string): V1SessionMark | null {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        const { digest, document, replaced } = parsed as {
            digest?: unknown;
            document?: unknown;
            replaced?: unknown;
        };
        return typeof digest === 'string' &&
            digest !== '' &&
            typeof document === 'string' &&
            document !== '' &&
            (replaced === null || (typeof replaced === 'string' && replaced !== ''))
            ? { digest, document, replaced }
            : null;
    } catch {
        return null;
    }
}

export function rememberV1SessionMark(mark: V1SessionMark): void {
    try {
        localStorage.setItem(V1_SESSION_MARK, JSON.stringify(mark));
    } catch {
        // Lost, the next rerun simply refuses to overwrite a copy it cannot prove is
        // untouched — the safe direction.
    }
}
