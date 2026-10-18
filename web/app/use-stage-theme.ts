import { useEffect, useState } from 'react';
import { forgetTheme, rememberTheme, type ThemeChoice, themePreference } from '../lib/session';

// Day/Stage is a per-device convenience (#1208), never a document field. Null
// follows the system; the stored choice is applied before hydration by the
// inline script in layout.tsx, and here on every change.
export function useStageTheme() {
    const [theme, setTheme] = useState<ThemeChoice | null>(null);
    const [systemDark, setSystemDark] = useState(false);
    const stage = theme ? theme === 'stage' : systemDark;
    useEffect(() => {
        setTheme(themePreference());
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const readSystem = () => setSystemDark(media.matches);
        readSystem();
        media.addEventListener('change', readSystem);
        return () => media.removeEventListener('change', readSystem);
    }, []);
    useEffect(() => {
        if (theme) {
            document.documentElement.dataset.theme = theme;
        } else {
            delete document.documentElement.dataset.theme;
        }
    }, [theme]);
    /** Null is System: the stored choice is cleared and the OS drives the theme again. */
    const chooseTheme = (next: ThemeChoice | null) => {
        setTheme(next);
        if (next) {
            rememberTheme(next);
        } else {
            forgetTheme();
        }
    };
    // The header's quick toggle always lands on an explicit Day or Stage.
    const toggleTheme = () => chooseTheme(stage ? 'day' : 'stage');
    return { theme, stage, chooseTheme, toggleTheme };
}
