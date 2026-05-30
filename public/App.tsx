import { Fragment } from 'preact';
import { useEffect } from 'preact/hooks';
import { ChartSurface } from './components/ChartSurface.jsx';
import { GlobalShortcuts } from './components/GlobalShortcuts.jsx';
import { Modals } from './components/Modals.jsx';
import { NotificationLayer } from './components/NotificationLayer.jsx';
import { PWAUpdateBanner } from './components/PWAUpdateBanner.jsx';
import { useEnsembleState } from './ui-bridge.js';

interface AppProps {
    getVisualTime: () => number;
}

export function App({ getVisualTime }: AppProps) {
    const { theme } = useEnsembleState((s) => ({
        theme: s.playback.theme,
    }));

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        // Only 'lead-sheet' is a light theme; everything else is dark-ground.
        const LIGHT_THEMES = new Set(['lead-sheet']);

        const updateTheme = () => {
            // Resolve the stored preference to a concrete [data-theme] key.
            // 'auto' follows the OS; 'dark'/'light' are legacy aliases kept so
            // older saved sessions and share URLs keep working.
            let resolved: string;
            if (theme === 'auto') {
                resolved = mediaQuery.matches ? 'after-hours' : 'lead-sheet';
            } else if (theme === 'dark') {
                resolved = 'after-hours';
            } else if (theme === 'light') {
                resolved = 'lead-sheet';
            } else {
                resolved = theme;
            }

            document.documentElement.setAttribute('data-theme', resolved);
            document.documentElement.style.colorScheme = LIGHT_THEMES.has(resolved)
                ? 'light'
                : 'dark';
        };

        updateTheme();

        if (theme === 'auto') {
            mediaQuery.addEventListener('change', updateTheme);
            return () => mediaQuery.removeEventListener('change', updateTheme);
        }
    }, [theme]);

    return (
        <Fragment>
            <GlobalShortcuts />
            <ChartSurface getVisualTime={getVisualTime} />
            <Modals />
            <NotificationLayer />
            <PWAUpdateBanner />
        </Fragment>
    );
}
