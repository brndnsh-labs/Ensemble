import { useEffect, useRef, useState } from 'preact/hooks';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { ChordVisualizer } from './ChordVisualizer.jsx';
import { KeySignatureControls } from './KeySignatureControls.jsx';
import { PresetLibrary } from './PresetLibrary.jsx';

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
                    <PresetLibrary type="chord" onSelect={onClose} />
                </div>
            </div>
        </div>
    );
}

export function ArrangerWorkspace() {
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

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
                            <h2 class="panel-title">Current chords</h2>
                        </div>
                        <div class="panel-header-controls">
                            <KeySignatureControls />
                            <div
                                class={`workspace-fab-menu${isActionMenuOpen ? ' is-open' : ''}`}
                                onMouseEnter={() => setIsActionMenuOpen(true)}
                                onMouseLeave={() => setIsActionMenuOpen(false)}
                                onFocusCapture={() => setIsActionMenuOpen(true)}
                                onBlurCapture={(event) => {
                                    const relatedTarget =
                                        event.relatedTarget instanceof Node
                                            ? event.relatedTarget
                                            : null;
                                    if (!event.currentTarget.contains(relatedTarget)) {
                                        setIsActionMenuOpen(false);
                                    }
                                }}
                            >
                                <button
                                    type="button"
                                    class="primary-btn workspace-fab-trigger"
                                    aria-label="Open arranger actions"
                                    aria-expanded={isActionMenuOpen}
                                    onClick={() => setIsActionMenuOpen((value) => !value)}
                                >
                                    ✨ Actions
                                </button>
                                <div class="workspace-fab-items" aria-label="Arranger actions">
                                    <button
                                        id="editArrangementBtn"
                                        class="workspace-fab-item"
                                        onClick={() => {
                                            openModal('editor');
                                            setIsActionMenuOpen(false);
                                        }}
                                    >
                                        ✏️ Edit
                                    </button>
                                    <button
                                        id="shareHubBtn"
                                        class="workspace-fab-item"
                                        onClick={() => {
                                            openModal('share');
                                            setIsActionMenuOpen(false);
                                        }}
                                    >
                                        📤 Share
                                    </button>
                                    <button
                                        type="button"
                                        class="workspace-fab-item workspace-library-fab"
                                        aria-label="Open progression library"
                                        onClick={() => {
                                            setIsLibraryOpen(true);
                                            setIsActionMenuOpen(false);
                                        }}
                                    >
                                        📚 Library
                                    </button>
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
