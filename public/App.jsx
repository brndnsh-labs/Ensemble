import { Fragment } from 'preact';
import { useEffect } from 'preact/hooks';
import { ChartSurface } from './components/ChartSurface.jsx';
import { GlobalShortcuts } from './components/GlobalShortcuts.jsx';
import { Modals } from './components/Modals.jsx';
import { NotificationLayer } from './components/NotificationLayer.jsx';
import { PWAUpdateBanner } from './components/PWAUpdateBanner.jsx';
import { useEnsembleState } from './ui-bridge.js';

/**
 * @typedef {Object} AppProps
 * @property {() => number} getVisualTime
 */

/**
 * @param {AppProps} props
 */
export function App({ getVisualTime }) {
    const { theme } = useEnsembleState((/** @type {import('./types.js').EnsembleState} */ s) => ({
        theme: s.playback.theme,
    }));

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const updateTheme = () => {
            const isDark = theme === 'dark' || (theme === 'auto' && mediaQuery.matches);
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
            document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
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
