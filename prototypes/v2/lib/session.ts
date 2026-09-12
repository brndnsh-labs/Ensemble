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
