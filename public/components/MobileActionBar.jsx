import { useState } from 'preact/hooks';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { InstrumentRail, StudioSurface } from './InstrumentRail.jsx';

/**
 * Fixed bottom action bar for mobile (<640px). Replaces the horizontal
 * instrument strip with three top-level actions: Mix, Share, Visualizer.
 *
 * @param {{
 *   isVizOpen: boolean,
 *   onOpenViz: () => void,
 * }} props
 */
export function MobileActionBar({ isVizOpen, onOpenViz }) {
    const [isMixOpen, setIsMixOpen] = useState(false);

    return (
        <>
            <nav class="mobile-action-bar" aria-label="Quick actions">
                <button
                    type="button"
                    class={`mobile-action-bar__btn ${isMixOpen ? 'is-active' : ''}`}
                    aria-haspopup="dialog"
                    aria-expanded={isMixOpen}
                    onClick={() => setIsMixOpen(true)}
                >
                    <span class="mobile-action-bar__icon" aria-hidden="true">
                        🎚️
                    </span>
                    <span class="mobile-action-bar__label">Mix</span>
                </button>
                <button
                    type="button"
                    class="mobile-action-bar__btn"
                    aria-haspopup="dialog"
                    onClick={() => dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'share', open: true })}
                >
                    <span class="mobile-action-bar__icon" aria-hidden="true">
                        📤
                    </span>
                    <span class="mobile-action-bar__label">Share</span>
                </button>
                <button
                    type="button"
                    class={`mobile-action-bar__btn ${isVizOpen ? 'is-active' : ''}`}
                    aria-haspopup="dialog"
                    aria-expanded={isVizOpen}
                    aria-label="Open visualizer"
                    onClick={onOpenViz}
                >
                    <span class="mobile-action-bar__icon" aria-hidden="true">
                        🌈
                    </span>
                    <span class="mobile-action-bar__label">Visuals</span>
                </button>
            </nav>
            <StudioSurface
                accent="mixer"
                className="workspace-studio-surface--settings mobile-mix-sheet"
                closeLabel="Close mix"
                isCompactViewport={true}
                isOpen={isMixOpen}
                kicker="Band"
                onClose={() => setIsMixOpen(false)}
                subtitle="Choose feel, set the mix, toggle players."
                title="Mix"
            >
                <InstrumentRail orientation="vertical" />
            </StudioSurface>
        </>
    );
}
