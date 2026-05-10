import { Fragment } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useEffect } from 'preact/hooks';
import { ArrangerWorkspace } from './components/ArrangerWorkspace.jsx';
import { ChartSurface } from './components/ChartSurface.jsx';
import { GlobalShortcuts } from './components/GlobalShortcuts.jsx';
import { Modals } from './components/Modals.jsx';
import { NotificationLayer } from './components/NotificationLayer.jsx';
import { PWAUpdateBanner } from './components/PWAUpdateBanner.jsx';
import { Transport } from './components/Transport.jsx';
import { WORKSPACE_META, WorkspaceNav } from './components/WorkspaceNav.jsx';
import { debounceSaveState } from './persistence.js';
import { dispatch } from './state.js';
import { ACTIONS } from './types.js';
import { useEnsembleState } from './ui-bridge.js';
import { getActiveSurface } from './ui-surface.js';

const StudioWorkspace = lazy(() =>
    import('./components/StudioWorkspace.jsx').then((module) => ({
        default: module.StudioWorkspace,
    })),
);
const VisualsWorkspace = lazy(() =>
    import('./components/VisualsWorkspace.jsx').then((module) => ({
        default: module.VisualsWorkspace,
    })),
);

/**
 * @typedef {Object} AppProps
 * @property {() => number} getVisualTime
 */

/**
 * @param {AppProps} props
 */
export function App({ getVisualTime }) {
    const activeSurface = getActiveSurface();
    const { theme, isMaximized, activeWorkspace, vizEnabled } = useEnsembleState(
        (/** @type {import('./types.js').EnsembleState} */ s) => ({
            theme: s.playback.theme,
            isMaximized: s.vizState.isMaximized,
            activeWorkspace: s.ui.activeWorkspace,
            vizEnabled: s.vizState.enabled,
        }),
    );

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

    useEffect(() => {
        document.body.classList.toggle('chord-maximized', isMaximized);
    }, [isMaximized]);

    useEffect(() => {
        document.body.dataset.workspace = activeWorkspace;
    }, [activeWorkspace]);

    useEffect(() => {
        const shouldEnableVisualizer = activeWorkspace === 'visuals';
        if (vizEnabled !== shouldEnableVisualizer) {
            dispatch(ACTIONS.SET_PARAM, {
                module: 'vizState',
                param: 'enabled',
                value: shouldEnableVisualizer,
            });
            debounceSaveState();
        }
    }, [activeWorkspace, vizEnabled]);

    const renderWorkspace = () => {
        switch (activeWorkspace) {
            case 'studio':
                return <StudioWorkspace />;
            case 'visuals':
                return <VisualsWorkspace getVisualTime={getVisualTime} />;
            default:
                return <ArrangerWorkspace />;
        }
    };

    const workspaceContent = renderWorkspace();
    const isEagerWorkspace = activeWorkspace === 'arranger';

    return (
        <Fragment>
            <GlobalShortcuts />
            {activeSurface === 'chart' ? (
                <ChartSurface />
            ) : (
                <div class="app-container">
                    <Header activeWorkspace={activeWorkspace} />
                    <main class="app-main-layout workspace-shell loaded" id="dashboardGrid">
                        <WorkspaceNav />
                        <div class="workspace-content">
                            {isEagerWorkspace ? (
                                <div
                                    key={activeWorkspace}
                                    class={`workspace-stage workspace-stage--${activeWorkspace}`}
                                >
                                    {workspaceContent}
                                </div>
                            ) : (
                                <Suspense
                                    fallback={
                                        <div
                                            class={`workspace-stage workspace-stage--${activeWorkspace}`}
                                        >
                                            <section
                                                class="workspace-view"
                                                data-workspace={activeWorkspace}
                                            >
                                                <div class="workspace-grid">
                                                    <div class="panel dashboard-panel workspace-panel workspace-panel--hero">
                                                        <div class="panel-header">
                                                            <div>
                                                                <p class="workspace-kicker">
                                                                    Loading workspace
                                                                </p>
                                                                <h2 class="panel-title">
                                                                    {
                                                                        WORKSPACE_META[
                                                                            activeWorkspace
                                                                        ].label
                                                                    }
                                                                </h2>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </section>
                                        </div>
                                    }
                                >
                                    <div
                                        key={activeWorkspace}
                                        class={`workspace-stage workspace-stage--${activeWorkspace}`}
                                    >
                                        {workspaceContent}
                                    </div>
                                </Suspense>
                            )}
                        </div>
                    </main>
                </div>
            )}
            <Modals />
            <NotificationLayer />
            <PWAUpdateBanner />
        </Fragment>
    );
}

/**
 * @param {{ activeWorkspace: keyof typeof WORKSPACE_META }} props
 */
function Header({ activeWorkspace }) {
    const description =
        activeWorkspace === 'visuals' ? '' : WORKSPACE_META[activeWorkspace].description;

    return (
        <header>
            <div class="app-title-group">
                <h1>Ensemble</h1>
                {description ? <p class="app-subtitle">{description}</p> : null}
            </div>
            <Transport />
        </header>
    );
}
