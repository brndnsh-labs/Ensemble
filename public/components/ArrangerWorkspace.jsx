import { useState } from 'preact/hooks';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { ChordVisualizer } from './ChordVisualizer.jsx';
import {
    KeySignatureMenuControl,
    MaximizeChordButton,
    TimeSignatureControl,
} from './KeySignatureControls.jsx';
import { LibraryModal } from './LibraryModal.jsx';
import { SoloistSeedMenuControl } from './SoloistControls.jsx';

/**
 * @param {keyof import('../types.js').ModalsState} modal
 */
function openModal(modal) {
    dispatch(ACTIONS.SET_MODAL_OPEN, { modal, open: true });
}

export function ArrangerWorkspace() {
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);

    const openLibrary = () => {
        setIsLibraryOpen(true);
    };

    const openEditor = () => {
        openModal('editor');
    };

    const openShare = () => {
        openModal('share');
    };

    return (
        <section class="workspace-view workspace-view--arranger" data-workspace="arranger">
            <div class="workspace-arranger-layout">
                <div
                    class="panel dashboard-panel workspace-panel workspace-panel--hero workspace-arranger-main"
                    id="panel-arranger"
                    data-id="arranger"
                    style="grid-area:auto;grid-column:1 / -1;grid-row:auto;width:100%;max-width:none;min-height:0;justify-self:stretch;align-self:stretch;"
                >
                    <div class="panel-header chord-panel-header">
                        <div>
                            <p class="workspace-kicker">Arranger</p>
                            <h2 class="panel-title workspace-arranger-header-title">Lead sheet</h2>
                            <div
                                class="workspace-arranger-controls-panel"
                                aria-label="Arranger controls"
                            >
                                <div class="workspace-arranger-controls-main">
                                    <div class="workspace-arranger-toolbar-cluster key-controls">
                                        <TimeSignatureControl />
                                        <KeySignatureMenuControl />
                                    </div>
                                </div>
                                <div
                                    class="workspace-arranger-controls-actions"
                                    aria-label="Arranger actions"
                                >
                                    <button
                                        id="arrangerLibraryInlineBtn"
                                        type="button"
                                        title="Open progression library"
                                        class="header-btn workspace-arranger-action-btn workspace-arranger-action-btn--primary"
                                        onClick={openLibrary}
                                    >
                                        Library
                                    </button>
                                    <button
                                        id="editArrangementBtn"
                                        type="button"
                                        title="Edit arrangement"
                                        class="header-btn workspace-arranger-action-btn workspace-arranger-action-btn--edit"
                                        onClick={openEditor}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        id="shareHubBtn"
                                        type="button"
                                        title="Share and export"
                                        class="header-btn workspace-arranger-action-btn"
                                        onClick={openShare}
                                    >
                                        Share
                                    </button>
                                    <SoloistSeedMenuControl buttonClassName="workspace-arranger-toolbar-trigger workspace-arranger-toolbar-trigger--seed" />
                                    <MaximizeChordButton className="workspace-arranger-action-btn workspace-arranger-action-btn--icon arranger-maximize-btn" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="workspace-arranger-chords">
                        <ChordVisualizer />
                    </div>
                </div>
            </div>
            <LibraryModal isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} />
        </section>
    );
}
