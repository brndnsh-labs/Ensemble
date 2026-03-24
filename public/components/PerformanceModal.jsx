import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { KEY_ORDER } from '../config.js';
import { stopSoloist, triggerSoloNote } from '../performance-controller.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import {
    binarySearchMapIndex,
    formatUnicodeSymbols,
    getChordMidiNotes,
    midiToNote,
} from '../utils.js';
import { PerformanceCanvas } from './PerformanceCanvas.jsx';

function useMobile() {
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 900);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    return isMobile;
}

export function PerformanceModal() {
    /** @type {import('preact/hooks').MutableRef<HTMLDivElement|null>} */
    const modalRef = useRef(null);
    const [currentNoteName, setCurrentNoteName] = useState('');
    const isMobile = useMobile();
    const [showLegend, setShowLegend] = useState(false);

    // Ensure routing is updated for performance mode and handle focus
    useLayoutEffect(() => {
        dispatch(ACTIONS.INIT_AUDIO);
        dispatch(ACTIONS.RESTORE_GAINS);
        stopSoloist(); // Immediate silence of any automatic phrases

        // Focus management: Use a multi-stage approach to ensure focus is captured
        // even if there's a slight delay from animations or first-time interactions.
        let retryCount = 0;
        const focusModal = () => {
            if (modalRef.current) {
                modalRef.current.focus({ preventScroll: true });
                // If we're not focused yet, retry in the next frame
                if (document.activeElement !== modalRef.current && retryCount < 30) {
                    retryCount++;
                    requestAnimationFrame(focusModal);
                }
            }
        };

        // Start focus attempts immediately
        focusModal();
        // Additional safety checks with exponential-ish backoff to cover transition durations
        const t1 = setTimeout(focusModal, 50);
        const t2 = setTimeout(focusModal, 150);
        const t3 = setTimeout(focusModal, 300);
        const t4 = setTimeout(focusModal, 600);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
            clearTimeout(t4);
        };
    }, []);

    // Ensure routing is updated for performance mode
    useEffect(() => {
        dispatch(ACTIONS.RESTORE_GAINS);
        return () => {
            dispatch(ACTIONS.RESTORE_GAINS);
        };
    }, []);

    const { step, stepMap, key, isMinor, totalSteps, notation, bpm } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            step: s.playback.step,
            stepMap: s.arranger.stepMap,
            key: s.arranger.key,
            isMinor: s.arranger.isMinor,
            totalSteps: s.arranger.totalSteps,
            notation: s.arranger.notation || 'roman',
            bpm: s.playback.bpm,
        }),
    );

    // Find current and next chords by finding the current step range in stepMap
    let currentEntry = null;
    let nextEntry = null;

    if (stepMap && stepMap.length > 0) {
        // Use modulo to wrap the step during song looping
        const loopStep = totalSteps > 0 ? step % totalSteps : step;
        const currentIdx = binarySearchMapIndex(stepMap, loopStep);
        if (currentIdx !== -1) {
            currentEntry = stepMap[currentIdx];
            if (currentIdx + 1 < stepMap.length) {
                nextEntry = stepMap[currentIdx + 1];
            } else {
                nextEntry = stepMap[0]; // Loop around
            }
        }
    }

    let currentChord = currentEntry ? currentEntry.chord : null;
    const nextChord = nextEntry ? nextEntry.chord : null;

    // Fallback: If no chord is found (empty song or at boundaries), default to the global key signature
    if (!currentChord) {
        const keyIndex = KEY_ORDER.indexOf(key);
        // Base MIDI for C4 is 60. rootMidi corresponds to the offset from C.
        const rootMidi = 60 + (keyIndex >= 0 ? keyIndex : 0);
        currentChord = {
            absName: key + (isMinor ? 'm' : ''),
            rootMidi: rootMidi,
            quality: isMinor ? 'minor' : 'major',
        };
    }

    const getChordName = (/** @type {any} */ chordObj) => {
        if (!chordObj) {
            return '---';
        }

        // 1. Try formatted display name (handles Roman, NNS, Absolute)
        if (chordObj.display?.[notation]) {
            const d = chordObj.display[notation];
            let name = d.root + d.suffix;
            if (d.bass) {
                name += `/${d.bass}`;
            }
            return formatUnicodeSymbols(name);
        }

        // 2. Fallback to basic names
        const basicName = chordObj.absName || chordObj.chord || '---';
        return formatUnicodeSymbols(basicName);
    };

    const currentNotes = useMemo(() => getChordMidiNotes(currentChord, 4), [currentChord]);
    const nextNotes = useMemo(() => getChordMidiNotes(nextChord, 4), [nextChord]);

    const bridgePitchNames = useMemo(() => {
        const currentNames = new Set(currentNotes.map((n) => midiToNote(n)?.name).filter(Boolean));
        const nextNames = new Set(nextNotes.map((n) => midiToNote(n)?.name).filter(Boolean));
        return new Set([...currentNames].filter((x) => nextNames.has(x)));
    }, [currentNotes, nextNotes]);

    const currentNotesRef = useRef(currentNotes);
    const nextNotesRef = useRef(nextNotes);

    useEffect(() => {
        currentNotesRef.current = currentNotes;
        nextNotesRef.current = nextNotes;
    }, [currentNotes, nextNotes]);

    /** @type {import('preact/hooks').MutableRef<{key: string, midi: number}[]>} */
    const heldKeysRef = useRef([]); // Stack of { key, midi }
    const [activeKeys_set, setActiveKeys_set] = useState(new Set()); // Keys that are held
    /** @type {import('preact/hooks').StateUpdater<string|null>|any} */
    const [playingKey, setPlayingKey] = useState(null); // The one currently sounding

    const activeNoteNames = useMemo(() => {
        const names = new Set();
        heldKeysRef.current.forEach((h) => {
            const info = /** @type {any} */ (midiToNote(h.midi));
            if (info) {
                names.add(info.name);
            }
        });
        return names;
    }, [activeKeys_set]);

    // Unified trigger for both keyboard and pointer events
    const triggerNote = (
        /** @type {number} */ midiNote,
        /** @type {string} */ sourceKey,
        isLegato = false,
    ) => {
        dispatch(ACTIONS.INIT_AUDIO);
        dispatch(ACTIONS.RESTORE_GAINS);

        const freq = 440 * 2 ** ((midiNote - 69) / 12);
        // Use a very long duration (60s) for manual performance to allow sustains
        triggerSoloNote(freq, 0, 60.0, 0.8, 0, 'scalar', isLegato);

        const noteInfo = /** @type {any} */ (midiToNote(midiNote));
        setCurrentNoteName(`${noteInfo.name}${noteInfo.octave}`);
        setPlayingKey(sourceKey);
    };

    const stopNote = (/** @type {string|null} */ sourceKey = null) => {
        if (!sourceKey) {
            // Kill everything
            stopSoloist();
            setCurrentNoteName('');
            heldKeysRef.current = [];
            setActiveKeys_set(new Set());
            setPlayingKey(null);
            return;
        }

        const index = heldKeysRef.current.findIndex((h) => h.key === sourceKey);
        if (index === -1) {
            return;
        }

        const wasPlaying = index === heldKeysRef.current.length - 1;
        heldKeysRef.current.splice(index, 1);

        // Update UI state
        const nextHeld = new Set(heldKeysRef.current.map((h) => h.key));
        setActiveKeys_set(nextHeld);

        if (heldKeysRef.current.length === 0) {
            stopSoloist();
            setCurrentNoteName('');
            setPlayingKey(null);
        } else if (wasPlaying) {
            // Fallback to the next note in the stack
            const next = heldKeysRef.current[heldKeysRef.current.length - 1];
            triggerNote(next.midi, next.key, true);
        }
    };

    useEffect(() => {
        const handleKeyDown = (/** @type {KeyboardEvent} */ e) => {
            // Ignore if we are closing (AnimatedModalWrapper adds .closing)
            if (/** @type {any} */ (modalRef.current)?.closest('.closing')) {
                return;
            }

            if (e.repeat) {
                return;
            }
            const key = e.key.toLowerCase();

            // CHORD TONES (LEFT) | TENSIONS (RIGHT)
            // Group 1: 0-4 (Left Hand Range)
            // Group 2: 5-9 (Right Hand Range)

            // Layout per row: [A S D F G] [H J K L ;]
            /** @type {Record<string, number>} */
            const currentKeys = {
                a: 0,
                s: 1,
                d: 2,
                f: 3,
                g: 4,
                h: 5,
                j: 6,
                k: 7,
                l: 8,
                ';': 9,
            };

            // Layout per row: [Q W E R T] [Y U I O P]
            /** @type {Record<string, number>} */
            const nextKeys = {
                q: 0,
                w: 1,
                e: 2,
                r: 3,
                t: 4,
                y: 5,
                u: 6,
                i: 7,
                o: 8,
                p: 9,
            };

            let midiNote = null;

            if (key in currentKeys && currentNotesRef.current.length > 0) {
                midiNote = currentNotesRef.current[/** @type {any} */ (currentKeys)[key]];
            } else if (key in nextKeys && nextNotesRef.current.length > 0) {
                midiNote = nextNotesRef.current[/** @type {any} */ (nextKeys)[key]];
            }

            if (midiNote !== null) {
                e.preventDefault();
                const isLegato = heldKeysRef.current.length > 0;

                // Push to stack
                heldKeysRef.current.push({ key, midi: midiNote });
                setActiveKeys_set(new Set(heldKeysRef.current.map((h) => h.key)));

                triggerNote(midiNote, key, isLegato);
            } else if (key === 'escape' || key === ' ' || key in currentKeys || key in nextKeys) {
                // Prevent default for keys that might scroll or affect the UI
                // even if they didn't map to a note (e.g. semicolon or space)
                e.preventDefault();
            }
        };

        const handleKeyUp = (/** @type {KeyboardEvent} */ e) => {
            const key = e.key.toLowerCase();
            stopNote(key);
        };

        window.addEventListener('keydown', handleKeyDown, { passive: false });
        window.addEventListener('keyup', handleKeyUp, { passive: false });

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            stopNote();
        };
    }, []);

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'performance', open: false });
    };

    const renderKey = (
        /** @type {any} */ label,
        /** @type {any} */ midi,
        /** @type {any} */ sourceKey,
        /** @type {any} */ type,
        isNext = false,
    ) => {
        const isHeld = activeKeys_set.has(sourceKey);
        const isPlaying = playingKey === sourceKey;
        const noteInfo = typeof midi === 'number' ? /** @type {any} */ (midiToNote(midi)) : null;
        const noteLabel = noteInfo ? `${noteInfo.name}${noteInfo.octave}` : '';
        const isSympathetic = noteInfo && activeNoteNames.has(noteInfo.name) && !isPlaying;

        const COLOR_MAP = {
            safe: { var: 'var(--yellow)', rgb: 'var(--yellow-rgb)', hex: '181, 137, 0' },
            tense: { var: 'var(--cyan)', rgb: 'var(--cyan-rgb)', hex: '42, 161, 152' },
            bridge: { var: 'var(--magenta)', rgb: 'var(--magenta-rgb)', hex: '211, 54, 130' },
        };

        const config = /** @type {any} */ (COLOR_MAP)[type] || COLOR_MAP.safe;
        const baseColor = config.var;
        const rgbColor = config.rgb;
        const shadowColor = `rgba(${config.hex}, 0.4)`;

        return (
            <button
                key={sourceKey}
                tabIndex={-1}
                onPointerDown={(e) => {
                    e.preventDefault();
                    if (modalRef.current) {
                        /** @type {any} */ (modalRef.current).focus({ preventScroll: true });
                    }
                    if (midi === null || midi === undefined) {
                        return;
                    }
                    const isLegato = heldKeysRef.current.length > 0;
                    heldKeysRef.current.push({ key: sourceKey, midi });
                    setActiveKeys_set(new Set(heldKeysRef.current.map((h) => h.key)));
                    triggerNote(midi, sourceKey, isLegato);
                }}
                onPointerUp={(e) => {
                    e.preventDefault();
                    stopNote(sourceKey);
                }}
                onPointerLeave={(e) => {
                    e.preventDefault();
                    if (activeKeys_set.has(sourceKey)) {
                        stopNote(sourceKey);
                    }
                }}
                style={`
                    width: 55px; height: 75px; border-radius: 8px; 
                    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
                    font-weight: bold; cursor: pointer; transition: all 0.2s; font-size: 0.95rem;
                    touch-action: none; -webkit-user-select: none; user-select: none;
                    position: relative; overflow: hidden;
                    ${
                        isPlaying
                            ? `background: ${baseColor}; color: #fff; transform: translateY(2px); box-shadow: 0 0 20px ${shadowColor}; border: 1px solid rgba(255,255,255,0.5);`
                            : isHeld
                              ? `background: rgba(${rgbColor}, 0.3); color: #fff; border: 1px solid ${baseColor};`
                              : isSympathetic
                                ? `background: rgba(${rgbColor}, 0.2); color: #fff; border: 2px dashed ${baseColor}; transform: scale(1.02);`
                                : `background: rgba(${rgbColor}, ${isNext ? '0.05' : '0.12'}); color: ${isNext ? '#64748b' : '#94a3b8'}; border: 1px solid rgba(255,255,255,0.05); border-top: 3px solid ${baseColor}; box-shadow: 0 4px 6px rgba(0,0,0,0.3);`
                    }
                `}
                onMouseEnter={(e) => {
                    if (!isPlaying && !isHeld) {
                        e.currentTarget.style.background = `rgba(${rgbColor}, 0.25)`;
                        e.currentTarget.style.color = '#fff';
                    }
                }}
                onMouseLeave={(e) => {
                    if (!isPlaying && !isHeld && !isSympathetic) {
                        e.currentTarget.style.background = `rgba(${rgbColor}, ${isNext ? '0.05' : '0.12'})`;
                        e.currentTarget.style.color = isNext ? '#64748b' : '#94a3b8';
                    }
                }}
            >
                <span class="performance-note-label">{label}</span>
                <span
                    class={`performance-note-octave ${
                        isNext ? 'performance-note-octave--dim' : 'performance-note-octave--normal'
                    }`}
                >
                    {noteLabel}
                </span>
            </button>
        );
    };

    const renderDeckRow = (
        /** @type {any} */ keys,
        /** @type {any} */ notes,
        /** @type {any} */ chordObj,
        isNext = false,
    ) => {
        const chordName = getChordName(chordObj);
        const accentColor = isNext ? '#94a3b8' : 'var(--soloist-color)';
        const safeLabelColor = isNext ? '#94a3b8' : 'var(--yellow)';
        const tenseLabelColor = isNext ? '#94a3b8' : 'var(--cyan)';

        return (
            <div class={`performance-deck-row ${isNext ? 'upcoming-chord' : 'active-chord'}`}>
                {/* Header Row: Chord Name + Label indicators */}
                <div class="performance-deck-header-row">
                    <div class="performance-deck-label-side performance-deck-label-side--left">
                        <div class="performance-deck-subtitle" style={`color: ${safeLabelColor};`}>
                            Chord Tones
                        </div>
                    </div>

                    <div class="performance-deck-title-wrap">
                        <div
                            style={`
                                font-size: ${isNext ? '1.2rem' : '1.5rem'}; font-weight: bold; 
                                color: ${accentColor}; 
                                background: rgba(15, 23, 42, 0.9); 
                                border: 1.5px solid ${accentColor}; 
                                padding: 0.4rem 2rem; border-radius: 20px; min-width: 140px;
                                box-shadow: ${isNext ? 'none' : '0 0 15px rgba(var(--soloist-color-rgb), 0.2)'};
                                backdrop-filter: blur(4px);
                                display: flex; align-items: center; justify-content: center;
                            `}
                        >
                            {chordName}
                        </div>
                        <div class="performance-deck-state-label" style={`color: ${accentColor};`}>
                            {isNext ? 'UPCOMING' : 'CURRENT'}
                        </div>
                    </div>

                    <div class="performance-deck-label-side performance-deck-label-side--right">
                        <div class="performance-deck-subtitle" style={`color: ${tenseLabelColor};`}>
                            Scale Tensions
                        </div>
                    </div>
                </div>

                {/* Keys Row */}
                <div class="performance-deck-keys-row">
                    {/* CHORD ZONE */}
                    <div class="performance-deck-zone">
                        {keys.slice(0, 5).map((/** @type {any} */ k, /** @type {any} */ i) => {
                            const midi = notes[i];
                            const noteInfo =
                                typeof midi === 'number'
                                    ? /** @type {any} */ (midiToNote(midi))
                                    : null;
                            const type =
                                noteInfo && bridgePitchNames.has(noteInfo.name) ? 'bridge' : 'safe';
                            return renderKey(k, midi, k.toLowerCase(), type, isNext);
                        })}
                    </div>

                    {/* DIVIDER */}
                    <div class="performance-deck-divider" />

                    {/* TENSION ZONE */}
                    <div class="performance-deck-zone">
                        {keys.slice(5).map((/** @type {any} */ k, /** @type {any} */ i) => {
                            const midi = notes[i + 5];
                            const noteInfo =
                                typeof midi === 'number'
                                    ? /** @type {any} */ (midiToNote(midi))
                                    : null;
                            const type =
                                noteInfo && bridgePitchNames.has(noteInfo.name)
                                    ? 'bridge'
                                    : 'tense';
                            return renderKey(k, midi, k.toLowerCase(), type, isNext);
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const handleNoteChange = (/** @type {any} */ midi) => {
        if (midi === null || midi === undefined) {
            setCurrentNoteName('');
            return;
        }
        const noteInfo = midiToNote(midi);
        setCurrentNoteName(`${noteInfo.name}${noteInfo.octave}`);
    };

    const renderMobileLayout = () => {
        const noteGroups = [
            currentNotes.slice(0, 5), // Lane 0: Left Edge (Safe)
            currentNotes.slice(5, 10), // Lane 1: Left Mid (Color)
            nextNotes.slice(5, 10), // Lane 2: Right Mid (Color)
            nextNotes.slice(0, 5), // Lane 3: Right Edge (Safe)
        ];

        return (
            <div class="performance-mobile-shell">
                {/* Floating Buttons */}
                <div class="performance-floating-actions">
                    <button
                        class="performance-floating-btn performance-floating-btn--strong"
                        onClick={() => setShowLegend(!showLegend)}
                        aria-label="Toggle Legend"
                    >
                        ?
                    </button>
                    <button class="performance-floating-btn" onClick={close} aria-label="Close">
                        ✖
                    </button>
                </div>

                {showLegend && (
                    <div class="performance-legend-overlay" onClick={() => setShowLegend(false)}>
                        <h3 class="performance-legend-title">How to Play</h3>

                        <div class="performance-legend-list">
                            <div class="performance-legend-item">
                                <div class="legend-color-box legend-color-box--yellow performance-instruction-swatch" />
                                <div class="legend-text-container">
                                    <div class="legend-title legend-title--yellow">
                                        Safe Arpeggios
                                    </div>
                                    <div class="legend-desc">Stable chord tones</div>
                                </div>
                            </div>

                            <div class="performance-legend-item">
                                <div class="legend-color-box legend-color-box--cyan" />
                                <div class="legend-text-container">
                                    <div class="legend-title legend-title--cyan">
                                        Color Extensions
                                    </div>
                                    <div class="legend-desc">Flavorful scale tensions</div>
                                </div>
                            </div>

                            <div class="performance-legend-item">
                                <div class="legend-color-box legend-color-box--magenta" />
                                <div class="legend-text-container">
                                    <div class="legend-title legend-title--magenta">
                                        Bridge Tones
                                    </div>
                                    <div class="legend-desc">Common to both chords</div>
                                </div>
                            </div>

                            <div class="performance-instruction-divider">
                                <div class="performance-mobile-legend-note">
                                    Dashed border = Same note in other octaves
                                </div>
                            </div>
                        </div>

                        <button
                            class="performance-legend-button"
                            onClick={() => setShowLegend(false)}
                        >
                            Got it
                        </button>
                    </div>
                )}

                <PerformanceCanvas
                    noteGroups={noteGroups}
                    onNoteChange={handleNoteChange}
                    bpm={bpm}
                    currentNoteName={currentNoteName}
                    currentChordName={getChordName(currentChord)}
                    nextChordName={getChordName(nextChord)}
                />
            </div>
        );
    };

    const renderDesktopLayout = () => (
        <div class="modal-content performance-modal-shell performance-modal-shell--desktop">
            <div class="performance-note-display">
                {currentNoteName && <div class="performance-note-name">{currentNoteName}</div>}
            </div>

            <div class="keyboard-layout performance-keyboard-layout">
                {/* UPCOMING CHORD - TOP ROW */}
                {renderDeckRow(
                    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
                    nextNotes,
                    nextChord,
                    true,
                )}

                {/* CURRENT CHORD - HOME ROW */}
                {renderDeckRow(
                    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';'],
                    currentNotes,
                    currentChord,
                    false,
                )}
            </div>

            <div class="keyboard-instructions performance-instructions">
                <div class="performance-instructions-row">
                    <div class="performance-instruction-item">
                        <div class="performance-instruction-swatch legend-color-box legend-color-box--yellow" />
                        <span class="performance-instruction-label">Safe Arpeggios</span>
                    </div>
                    <div class="performance-instruction-item">
                        <div class="performance-instruction-swatch legend-color-box legend-color-box--cyan" />
                        <span class="performance-instruction-label">Color Extensions</span>
                    </div>
                    <div class="performance-instruction-item">
                        <div class="performance-instruction-swatch legend-color-box legend-color-box--magenta" />
                        <span class="performance-instruction-label">Bridge Tones</span>
                    </div>
                    <div class="performance-instruction-divider">
                        <span class="performance-instruction-note">
                            Dashed border = Same note in other octaves
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div
            ref={modalRef}
            tabIndex={0}
            class="modal-overlay active"
            onClick={close}
            onPointerEnter={() => {
                // Focus on hover to ensure immediate readiness
                if (modalRef.current) {
                    modalRef.current.focus();
                }
            }}
            onPointerDown={() => {
                // Ensure focus is restored if the user clicks the overlay
                if (modalRef.current) {
                    modalRef.current.focus();
                }
            }}
        >
            <div
                class={`modal PerformanceSurfaceModal performance-modal-shell ${
                    isMobile
                        ? 'performance-modal-shell--mobile'
                        : 'performance-modal-shell--desktop'
                }`}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    // Use pointerdown for immediate focus response on touch devices
                    if (modalRef.current) {
                        modalRef.current.focus({ preventScroll: true });
                    }
                }}
                onClick={(/** @type {Event} */ e) => {
                    e.stopPropagation();
                }}
            >
                {!isMobile && (
                    <div class="modal-header">
                        <h2>Soloist Performance Mode</h2>
                        <button class="icon-btn close-btn" onClick={close} aria-label="Close">
                            ✖
                        </button>
                    </div>
                )}

                {isMobile ? renderMobileLayout() : renderDesktopLayout()}
            </div>
        </div>
    );
}
