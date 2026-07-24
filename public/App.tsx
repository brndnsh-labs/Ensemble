import { Fragment } from 'preact';
import { useEffect } from 'preact/hooks';
import { ChartSurface } from './components/ChartSurface.jsx';
import { GlobalShortcuts } from './components/GlobalShortcuts.jsx';
import { Modals } from './components/Modals.jsx';
import { NotificationLayer } from './components/NotificationLayer.jsx';
import { PWAUpdateBanner } from './components/PWAUpdateBanner.jsx';
import { applyThemeToDom } from './controllers/app-controller.js';
import { useEnsembleState } from './ui-bridge.js';

interface AppProps {
    getVisualTime: () => number;
}

export function App({ getVisualTime }: AppProps) {
    const { palette, mode } = useEnsembleState((s) => ({
        palette: s.playback.palette,
        mode: s.playback.mode,
    }));

    useEffect(() => {
        // Write the resolved palette + light/dark mode to <html>. While mode is
        // 'auto', keep it live by re-applying whenever the OS theme flips.
        applyThemeToDom(palette, mode);

        if (mode === 'auto') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const onChange = () => applyThemeToDom(palette, mode);
            mediaQuery.addEventListener('change', onChange);
            return () => mediaQuery.removeEventListener('change', onChange);
        }
    }, [palette, mode]);

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
