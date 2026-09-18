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
