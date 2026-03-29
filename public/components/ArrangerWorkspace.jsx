import { useEffect, useRef, useState } from 'preact/hooks';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { ChordVisualizer } from './ChordVisualizer.jsx';
import {
    KeySignatureMenuControl,
    MaximizeChordButton,
    TimeSignatureControl,
} from './KeySignatureControls.jsx';
import { PresetLibrary } from './PresetLibrary.jsx';
import { SoloistSeedMenuControl } from './SoloistControls.jsx';

const LIBRARY_CLOSE_ANIMATION_MS = 180;

/**
 * @param {keyof import('../types.js').ModalsState} modal
 */
function openModal(modal) {
    dispatch(ACTIONS.SET_MODAL_OPEN, { modal, open: true });
}

/**
 * @param {{ isOpen: boolean; onClose: () => void }} props
 */
function LibraryModal({ isOpen, onClose }) {
    /** @type {import('preact/hooks').MutableRef<HTMLDivElement|null>} */
    const overlayRef = useRef(null);
    const closeTimerRef = useRef(/** @type {number | null} */ (null));
    const [isRendered, setIsRendered] = useState(isOpen);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            if (!isRendered) {
                return;
            }

            setIsClosing(true);
            closeTimerRef.current = window.setTimeout(() => {
                setIsRendered(false);
                setIsClosing(false);
            }, LIBRARY_CLOSE_ANIMATION_MS);
            return () => {
                if (closeTimerRef.current !== null) {
                    window.clearTimeout(closeTimerRef.current);
                    closeTimerRef.current = null;
                }
            };
        }

        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
        setIsRendered(true);
        setIsClosing(false);
        overlayRef.current?.focus();
        const handleKeyDown = (/** @type {KeyboardEvent} */ e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isRendered, onClose]);

    useEffect(
        () => () => {
            if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
            }
        },
        [],
    );

    if (!isRendered && !isOpen) {
        return null;
    }

    return (
        <div
            ref={overlayRef}
            class={`modal-overlay workspace-library-overlay${isOpen ? ' active' : ''}${
                isClosing ? ' closing' : ''
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspaceLibraryTitle"
            tabIndex={-1}
            onClick={onClose}
        >
            <div
                class={`settings-content workspace-library-modal${isClosing ? ' closing' : ''}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div class="panel-header workspace-library-header">
                    <div>
                        <p class="workspace-kicker">Recall</p>
                        <h2 id="workspaceLibraryTitle" class="panel-title">
                            Progression Library
                        </h2>
                    </div>
                    <button
                        type="button"
                        class="secondary-btn workspace-library-close"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
                <div class="workspace-library-body">
                    <PresetLibrary onSelect={onClose} />
                </div>
            </div>
        </div>
    );
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
