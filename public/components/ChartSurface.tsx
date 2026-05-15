import { useCallback, useState } from 'preact/hooks';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useMediaQuery } from '../ui-bridge.js';
import { ChordVisualizer } from './ChordVisualizer.jsx';
import { InstrumentRail } from './InstrumentRail.jsx';
import { KeySignatureMenuControl, TimeSignatureControl } from './KeySignatureControls.jsx';
import { LibraryModal } from './LibraryModal.jsx';
import { MobileActionBar } from './MobileActionBar.jsx';
import { ToolbarPopover } from './ToolbarPopover.jsx';
import { Transport } from './Transport.jsx';
import { VisualizerOverlay } from './VisualizerOverlay.jsx';

const NARROW_MQ = '(max-width: 1023px)';
const MOBILE_MQ = '(max-width: 640px)';

interface ChartSurfaceProps {
    getVisualTime: () => number;
}

export function ChartSurface({ getVisualTime }: ChartSurfaceProps) {
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [isVizOpen, setIsVizOpen] = useState(false);
    const [isSharedUrl, setIsSharedUrl] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        const p = new URLSearchParams(window.location.search);
        return !!(p.get('s') || p.get('prog'));
    });
    const isNarrow = useMediaQuery(NARROW_MQ);
    const isMobile = useMediaQuery(MOBILE_MQ);

    const openModal = (modal: string) => dispatch(ACTIONS.SET_MODAL_OPEN, { modal, open: true });

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
                    {!isMobile && (
                        <>
                            <button
                                type="button"
                                class="header-btn"
                                onClick={() => setIsLibraryOpen(true)}
                            >
                                Library
                            </button>
                            <button
                                type="button"
                                class="header-btn"
                                onClick={() => openModal('editor')}
                            >
                                Edit
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
                                🌈
                            </button>
                        </>
                    )}
                    <ToolbarPopover
                        panelId="chartOverflowPanel"
                        triggerAriaLabel="More options"
                        panelLabel="More options"
                        triggerClassName="header-btn header-btn--icon chart-surface__overflow-btn"
                        triggerContent="⋯"
                    >
                        {({ closePopover }) => (
                            <div class="chart-surface__overflow-menu">
                                {isMobile && (
                                    <>
                                        <button
                                            type="button"
                                            class="workspace-toolbar-panel__action"
                                            onClick={() => {
                                                setIsLibraryOpen(true);
                                                closePopover();
                                            }}
                                        >
                                            Library
                                        </button>
                                        <button
                                            type="button"
                                            class="workspace-toolbar-panel__action"
                                            onClick={() => {
                                                openModal('editor');
                                                closePopover();
                                            }}
                                        >
                                            Edit
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    class="workspace-toolbar-panel__action"
                                    onClick={() => {
                                        openModal('generateSong');
                                        closePopover();
                                    }}
                                >
                                    Generate Song
                                </button>
                                <button
                                    type="button"
                                    class="workspace-toolbar-panel__action"
                                    onClick={() => {
                                        openModal('settings');
                                        closePopover();
                                    }}
                                >
                                    Settings
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
            <div class="chart-surface__chart">
                <ChordVisualizer />
            </div>
            {!isMobile && (
                <div class="chart-surface__rail">
                    <InstrumentRail orientation={isNarrow ? 'horizontal' : 'vertical'} />
                </div>
            )}
            {isMobile && (
                <MobileActionBar isVizOpen={isVizOpen} onOpenViz={() => setIsVizOpen(true)} />
            )}
            <LibraryModal isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} />
            {isVizOpen && <VisualizerOverlay getVisualTime={getVisualTime} onClose={closeViz} />}
        </div>
    );
}
