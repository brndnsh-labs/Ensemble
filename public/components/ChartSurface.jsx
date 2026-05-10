import { useCallback, useEffect, useState } from 'preact/hooks';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { ChordVisualizer } from './ChordVisualizer.jsx';
import { InstrumentRail } from './InstrumentRail.jsx';
import { KeySignatureMenuControl, TimeSignatureControl } from './KeySignatureControls.jsx';
import { LibraryModal } from './LibraryModal.jsx';
import { SoloistSeedMenuControl } from './SoloistControls.jsx';
import { ToolbarPopover } from './ToolbarPopover.jsx';
import { Transport } from './Transport.jsx';
import { VisualizerOverlay } from './VisualizerOverlay.jsx';

const NARROW_MQ = '(max-width: 1023px)';

/**
 * @param {{ getVisualTime: () => number }} props
 */
export function ChartSurface({ getVisualTime }) {
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [isVizOpen, setIsVizOpen] = useState(false);
    const [isNarrow, setIsNarrow] = useState(() =>
        typeof window !== 'undefined' ? window.matchMedia(NARROW_MQ).matches : false,
    );

    useEffect(() => {
        const mq = window.matchMedia(NARROW_MQ);
        const update = () => setIsNarrow((prev) => (mq.matches !== prev ? mq.matches : prev));
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    const openModal = (/** @type {keyof import('../types.js').ModalsState} */ modal) =>
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal, open: true });

    const closeViz = useCallback(() => setIsVizOpen(false), []);

    return (
        <div class="chart-surface">
            <div class="chart-surface__topbar">
                <Transport />
                <div class="chart-surface__keytime">
                    <TimeSignatureControl />
                    <KeySignatureMenuControl />
                </div>
                <div class="chart-surface__actions">
                    <button type="button" class="header-btn" onClick={() => setIsLibraryOpen(true)}>
                        Library
                    </button>
                    <button type="button" class="header-btn" onClick={() => openModal('editor')}>
                        Edit
                    </button>
                    <button type="button" class="header-btn" onClick={() => openModal('share')}>
                        Share
                    </button>
                    <SoloistSeedMenuControl buttonClassName="workspace-arranger-toolbar-trigger workspace-arranger-toolbar-trigger--seed" />
                    <button
                        type="button"
                        class={`header-btn chart-surface__viz-btn${isVizOpen ? ' active' : ''}`}
                        aria-label="Open visualizer"
                        onClick={() => setIsVizOpen(true)}
                    >
                        🌈
                    </button>
                    <ToolbarPopover
                        panelId="chartOverflowPanel"
                        triggerAriaLabel="More options"
                        panelLabel="More options"
                        triggerClassName="header-btn chart-surface__overflow-btn"
                        triggerContent="⋯"
                    >
                        {({ closePopover }) => (
                            <div class="chart-surface__overflow-menu">
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
            <div class="chart-surface__rail">
                <InstrumentRail orientation={isNarrow ? 'horizontal' : 'vertical'} />
            </div>
            <LibraryModal isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} />
            {isVizOpen && <VisualizerOverlay getVisualTime={getVisualTime} onClose={closeViz} />}
        </div>
    );
}
