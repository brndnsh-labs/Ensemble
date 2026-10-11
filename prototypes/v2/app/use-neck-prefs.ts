import { useCallback, useEffect, useRef, useState } from 'react';
import {
    defaultNeckPreferences,
    type NeckPreferences,
    neckPreferences,
    patchNeckPreferences,
    rememberNeckPreferences,
} from '../lib/session';

// The neck's settings are a per-device convenience (#1586), never document fields — the
// `use-stage-theme.ts` pattern. The first render uses the defaults (the static export prerenders
// without storage); the stored choice is read on mount.
export function useNeckPrefs() {
    const [prefs, setState] = useState<NeckPreferences>(defaultNeckPreferences);
    // The latest value, so two changes in one frame (a fast handle drag) build on each other.
    const latest = useRef(prefs);
    useEffect(() => {
        const stored = neckPreferences();
        latest.current = stored;
        setState(stored);
    }, []);
    const setPrefs = useCallback((patch: Partial<NeckPreferences>) => {
        const next = patchNeckPreferences(latest.current, patch);
        latest.current = next;
        setState(next);
        rememberNeckPreferences(next);
    }, []);
    return { prefs, setPrefs };
}
