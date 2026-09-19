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

const V1_IMPORT = 'ensemble-v2-preview:v1-import';
export type V1ImportState = 'imported' | 'declined';
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
 * What this device has already done about each piece of v1 data, keyed by the digest
 * of the v1 bytes (#1274).
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
            if (state === 'imported' || state === 'declined') {
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
