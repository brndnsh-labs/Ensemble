import { useState } from 'preact/hooks';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { Icon } from './Icon.jsx';
import { InstrumentRail, StudioSurface } from './InstrumentRail.jsx';

interface MobileActionBarProps {
    isVizOpen: boolean;
    onOpenViz: () => void;
}

export function MobileActionBar({ isVizOpen, onOpenViz }: MobileActionBarProps) {
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
                        <Icon name="mixer" />
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
                        <Icon name="upload" />
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
                        <Icon name="visualizer" />
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
                onClose={() => setIsMixOpen(false)}
                subtitle="Choose feel, set the mix, toggle players."
                title="Mix"
            >
                <InstrumentRail orientation="vertical" />
            </StudioSurface>
        </>
    );
}
