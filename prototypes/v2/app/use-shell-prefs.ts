import { useCallback, useEffect, useRef, useState } from 'react';
import {
    defaultShellPreferences,
    patchShellPreferences,
    rememberShellPreferences,
    type ShellPreferences,
    shellPreferences,
} from '../lib/session';

// The neck's settings are a per-device convenience (#1586), never document fields — the
// `use-stage-theme.ts` pattern. The first render uses the defaults (the static export prerenders
// without storage); the stored choice is read on mount.
export function useShellPrefs() {
    const [prefs, setState] = useState<ShellPreferences>(defaultShellPreferences);
    // The latest value, so two changes in one frame (a fast handle drag) build on each other.
    const latest = useRef(prefs);
    useEffect(() => {
        const stored = shellPreferences();
        latest.current = stored;
        setState(stored);
    }, []);
    const setPrefs = useCallback((patch: Partial<ShellPreferences>) => {
        const next = patchShellPreferences(latest.current, patch);
        latest.current = next;
        setState(next);
        rememberShellPreferences(next);
    }, []);
    return { prefs, setPrefs };
}
