import { useEffect, useState } from 'react';
import { rememberTheme, type ThemeChoice, themePreference } from '../lib/session';

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
    const toggleTheme = () => {
        const next: ThemeChoice = stage ? 'day' : 'stage';
        setTheme(next);
        rememberTheme(next);
    };
    return { stage, toggleTheme };
}
