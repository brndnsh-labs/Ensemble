import type { V1SessionMark } from './import-v1';

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
