import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { transposeKey } from '../arranger-controller.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { ChordVisualizer } from './ChordVisualizer.jsx';
import { KeySignatureControls } from './KeySignatureControls.jsx';
import { PresetLibrary } from './PresetLibrary.jsx';
import { SoloistSeedControl } from './SoloistControls.jsx';

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
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [actionMenuStyle, setActionMenuStyle] = useState(
        /** @type {import('preact').JSX.CSSProperties | undefined} */ (undefined),
    );
    /** @type {import('preact/hooks').MutableRef<HTMLDivElement|null>} */
    const menuRef = useRef(null);
    /** @type {import('preact/hooks').MutableRef<HTMLButtonElement|null>} */
    const triggerRef = useRef(null);
    const isTouchLike =
        typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const { isMaximized } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            isMaximized: s.vizState.isMaximized,
        }),
    );

    useEffect(() => {
        if (!isActionMenuOpen) {
            return;
        }

        const handlePointerDown = (/** @type {PointerEvent} */ event) => {
            const target = event.target instanceof Node ? event.target : null;

            if (!target) {
                return;
            }

            if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
                return;
            }

            setIsActionMenuOpen(false);
        };

        const handleKeyDown = (/** @type {KeyboardEvent} */ event) => {
            if (event.key !== 'Escape') {
                return;
            }

            setIsActionMenuOpen(false);
            triggerRef.current?.focus();
        };

        window.addEventListener('pointerdown', handlePointerDown, true);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('pointerdown', handlePointerDown, true);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isActionMenuOpen]);

    useLayoutEffect(() => {
        if (!isActionMenuOpen || isTouchLike || typeof window === 'undefined') {
            setActionMenuStyle(undefined);
            return;
        }

        const updateMenuPosition = () => {
            const trigger = triggerRef.current;
            const menu = menuRef.current;
            if (!trigger || !menu) {
                return;
            }

            const triggerRect = trigger.getBoundingClientRect();
            const menuWidth = Math.min(
                Math.max(menu.offsetWidth || 216, 216),
                window.innerWidth - 24,
            );
            const menuHeight = menu.offsetHeight || 0;
            const gap = 8;
            const viewportPadding = 12;
            const spaceBelow = window.innerHeight - triggerRect.bottom - gap - viewportPadding;
            const spaceAbove = triggerRect.top - gap - viewportPadding;
            const shouldOpenUpward = menuHeight > spaceBelow && spaceAbove > spaceBelow;
            const maxHeight = Math.max(
                180,
                shouldOpenUpward ? spaceAbove : Math.max(spaceBelow, 180),
            );
            const left = Math.min(
                Math.max(viewportPadding, triggerRect.right - menuWidth),
                window.innerWidth - menuWidth - viewportPadding,
            );
            const top = shouldOpenUpward
                ? Math.max(viewportPadding, triggerRect.top - Math.min(menuHeight, maxHeight) - gap)
                : Math.min(
                      triggerRect.bottom + gap,
                      window.innerHeight - maxHeight - viewportPadding,
                  );

            setActionMenuStyle({
                position: 'fixed',
                top: `${top}px`,
                left: `${left}px`,
                right: 'auto',
                bottom: 'auto',
                width: `${menuWidth}px`,
                maxHeight: `${maxHeight}px`,
            });
        };

        updateMenuPosition();
        window.addEventListener('resize', updateMenuPosition);
        window.addEventListener('scroll', updateMenuPosition, true);
        return () => {
            window.removeEventListener('resize', updateMenuPosition);
            window.removeEventListener('scroll', updateMenuPosition, true);
        };
    }, [isActionMenuOpen, isTouchLike]);

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
                                    <KeySignatureControls
                                        showMaximize={false}
                                        showTranspose={true}
                                    />
                                </div>
                                <div class="workspace-arranger-controls-side">
                                    <div
                                        class="workspace-arranger-controls-actions"
                                        aria-label="Arranger actions"
                                    >
                                        <button
                                            id="maximizeChordBtn"
                                            title={isMaximized ? 'Exit Maximize' : 'Maximize'}
                                            class={`header-btn arranger-maximize-btn ${
                                                isMaximized ? 'active' : ''
                                            }`}
                                            aria-label={
                                                isMaximized ? 'Exit Maximize' : 'Maximize Chords'
                                            }
                                            onClick={() =>
                                                dispatch(ACTIONS.TOGGLE_MAXIMIZED_CHORDS)
                                            }
                                        >
                                            {isMaximized ? '✕' : '⛶'}
                                        </button>
                                        <div
                                            class={`workspace-fab-menu${
                                                isActionMenuOpen ? ' is-open' : ''
                                            }`}
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
                                                ref={triggerRef}
                                                type="button"
                                                class="header-btn workspace-actions-trigger"
                                                aria-label="Open arranger actions"
                                                aria-haspopup="dialog"
                                                aria-expanded={isActionMenuOpen}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setIsActionMenuOpen((value) => !value);
                                                }}
                                            >
                                                ⋮
                                            </button>
                                            <div
                                                ref={menuRef}
                                                class={`workspace-fab-items${
                                                    !isTouchLike
                                                        ? ' workspace-fab-items--fixed'
                                                        : ''
                                                }`}
                                                role="dialog"
                                                aria-label="Arranger actions"
                                                style={actionMenuStyle}
                                                onClick={(event) => event.stopPropagation()}
                                            >
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
                                                <div class="menu-divider" aria-hidden="true" />
                                                <button
                                                    type="button"
                                                    class="workspace-fab-item workspace-transpose-fab"
                                                    aria-label="Transpose down"
                                                    onClick={() => {
                                                        transposeKey(-1);
                                                        setIsActionMenuOpen(false);
                                                    }}
                                                >
                                                    ♭ Transpose down
                                                </button>
                                                <button
                                                    type="button"
                                                    class="workspace-fab-item workspace-transpose-fab"
                                                    aria-label="Transpose up"
                                                    onClick={() => {
                                                        transposeKey(1);
                                                        setIsActionMenuOpen(false);
                                                    }}
                                                >
                                                    ♯ Transpose up
                                                </button>
                                                <div class="menu-divider" aria-hidden="true" />
                                                <div class="workspace-fab-item workspace-fab-item--seed">
                                                    <SoloistSeedControl />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
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
