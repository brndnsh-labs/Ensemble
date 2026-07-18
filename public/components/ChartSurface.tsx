import { lazy, Suspense } from 'preact/compat';
import { useCallback, useState } from 'preact/hooks';
import { COMPACT_MQ } from '../breakpoints.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState, useMediaQuery } from '../ui-bridge.js';
import { ChordVisualizer } from './ChordVisualizer.jsx';
import { Icon } from './Icon.jsx';
import { InlineEditor } from './InlineEditor.jsx';
import { InstrumentRail } from './InstrumentRail.jsx';
import { KeySignatureMenuControl, TimeSignatureControl } from './KeySignatureControls.jsx';
import { MobileActionBar } from './MobileActionBar.jsx';
import { SongSeedControl } from './SongSeedControl.jsx';
import { ToolbarPopover } from './ToolbarPopover.jsx';
import { Transport } from './Transport.jsx';

const VisualizerOverlay = lazy(() =>
    import('./VisualizerOverlay.jsx').then((m) => ({ default: m.VisualizerOverlay })),
);

interface ChartSurfaceProps {
    getVisualTime: () => number;
}

export function ChartSurface({ getVisualTime }: ChartSurfaceProps) {
    const [isVizOpen, setIsVizOpen] = useState(false);
    const [isSharedUrl, setIsSharedUrl] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        const p = new URLSearchParams(window.location.search);
        return !!(p.get('s') || p.get('prog'));
    });
    const isNarrow = useMediaQuery(COMPACT_MQ);
    const { chartLocked } = useEnsembleState((s) => ({
        chartLocked: s.playback.chartLocked,
    }));

    const openModal = (modal: string) => dispatch(ACTIONS.SET_MODAL_OPEN, { modal, open: true });

    // Unlock-while-playing pauses the band (the music-stand metaphor:
    // you don't rewrite the chart mid-take). Lock-while-stopped just locks.
    const toggleLock = useCallback(() => {
        // Unlock-pauses-playback is centralized in the SET_CHART_LOCKED effect
        // (#1128) — this is now a plain toggle.
        dispatch(ACTIONS.SET_CHART_LOCKED, !chartLocked);
    }, [chartLocked]);

    const closeViz = useCallback(() => setIsVizOpen(false), []);

    return (
        <div class="chart-surface">
            <div class="chart-surface__topbar">
                <div class="chart-surface__zone chart-surface__zone--play">
                    <Transport />
                </div>
                <div class="chart-surface__zone chart-surface__zone--shape">
                    <TimeSignatureControl />
                    <KeySignatureMenuControl />
                    <SongSeedControl />
                </div>
                <div class="chart-surface__zone chart-surface__zone--output">
                    {isSharedUrl && (
                        <div class="chart-surface__shared-pill" role="note">
                            <span>Shared with you</span>
                            <button
                                type="button"
                                aria-label="Dismiss shared notice"
                                onClick={() => setIsSharedUrl(false)}
                            >
                                ×
                            </button>
                        </div>
                    )}
                    {!isNarrow && (
                        <>
                            <button
                                type="button"
                                class="header-btn chart-surface__surprise-btn"
                                title="Library — presets, templates, roll the dice"
                                onClick={() => openModal('surpriseMe')}
                            >
                                <Icon name="book" />
                                <span class="chart-surface__surprise-label"> Library</span>
                            </button>
                            <button
                                type="button"
                                class={`header-btn chart-surface__lock-btn${
                                    chartLocked ? '' : ' active'
                                }`}
                                aria-pressed={!chartLocked}
                                aria-label={chartLocked ? 'Unlock chart to edit' : 'Lock chart'}
                                title={
                                    chartLocked ? 'Unlock to edit (stops playback)' : 'Lock chart'
                                }
                                onClick={toggleLock}
                            >
                                <Icon name={chartLocked ? 'lock' : 'edit'} />
                                <span class="chart-surface__lock-label">
                                    {chartLocked ? 'Edit' : 'Lock'}
                                </span>
                            </button>
                            <button
                                type="button"
                                class="header-btn header-btn--primary chart-surface__share-btn"
                                onClick={() => openModal('share')}
                            >
                                Share
                            </button>
                            <button
                                type="button"
                                class={`header-btn header-btn--icon chart-surface__viz-btn${isVizOpen ? ' active' : ''}`}
                                aria-label="Open visualizer"
                                onClick={() => setIsVizOpen(true)}
                            >
                                <Icon name="visualizer" />
                            </button>
                        </>
                    )}
                    <ToolbarPopover
                        panelId="chartOverflowPanel"
                        triggerAriaLabel="More options"
                        panelLabel="More options"
                        triggerClassName="header-btn header-btn--icon chart-surface__overflow-btn"
                        triggerContent={<Icon name="more" />}
                    >
                        {({ closePopover }) => (
                            <div class="chart-surface__overflow-menu">
                                {isNarrow && (
                                    <button
                                        type="button"
                                        class="workspace-toolbar-panel__action"
                                        onClick={() => {
                                            toggleLock();
                                            closePopover();
                                        }}
                                    >
                                        <Icon name={chartLocked ? 'edit' : 'lock'} />
                                        {chartLocked ? ' Edit' : ' Lock'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    class="workspace-toolbar-panel__action"
                                    onClick={() => {
                                        openModal('surpriseMe');
                                        closePopover();
                                    }}
                                >
                                    <Icon name="book" /> Library
                                </button>
                                <button
                                    type="button"
                                    class="workspace-toolbar-panel__action"
                                    onClick={() => {
                                        openModal('settings');
                                        closePopover();
                                    }}
                                >
                                    <Icon name="gear" /> Settings
                                </button>
                                <button
                                    type="button"
                                    class="workspace-toolbar-panel__action"
                                    onClick={() => {
                                        openModal('manual');
                                        closePopover();
                                    }}
                                >
                                    Manual
                                </button>
                            </div>
                        )}
                    </ToolbarPopover>
                </div>
            </div>
            <div
                class={`chart-surface__chart${chartLocked ? '' : ' chart-surface__chart--unlocked'}`}
            >
                {chartLocked ? <ChordVisualizer /> : <InlineEditor />}
            </div>
            {!isNarrow && (
                <div class="chart-surface__rail">
                    <InstrumentRail />
                </div>
            )}
            {isNarrow && (
                <MobileActionBar isVizOpen={isVizOpen} onOpenViz={() => setIsVizOpen(true)} />
            )}
            {isVizOpen && (
                <Suspense fallback={null}>
                    <VisualizerOverlay getVisualTime={getVisualTime} onClose={closeViz} />
                </Suspense>
            )}
        </div>
    );
}
