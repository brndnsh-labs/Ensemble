import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { KEY_ORDER } from '../config.js';
import { initAudio, killSoloistNote, playSoloNote, restoreGains } from '../engine/engine.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { getChordMidiNotes, midiToNote } from '../utils.js';

export function PerformanceModal() {
    const modalRef = useRef(null);
    const [currentNoteName, setCurrentNoteName] = useState('');

    // Ensure routing is updated for performance mode and handle focus
    useEffect(() => {
        initAudio();
        restoreGains();
        killSoloistNote(); // Immediate silence of any automatic phrases
        if (modalRef.current) {
            modalRef.current.focus();
        }
        return () => {
            restoreGains();
        };
    }, []);

    const { step, stepMap, key, isMinor, totalSteps } = useEnsembleState((s) => ({
        step: s.playback.step,
        stepMap: s.arranger.stepMap,
        key: s.arranger.key,
        isMinor: s.arranger.isMinor,
        totalSteps: s.arranger.totalSteps,
    }));

    // Find current and next chords by finding the current step range in stepMap
    let currentEntry = null;
    let nextEntry = null;

    if (stepMap && stepMap.length > 0) {
        // Use modulo to wrap the step during song looping
        const loopStep = totalSteps > 0 ? step % totalSteps : step;
        const currentIdx = stepMap.findIndex((e) => loopStep >= e.start && loopStep < e.end);
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
            chord: key + (isMinor ? 'm' : ''),
            rootMidi: rootMidi,
            quality: isMinor ? 'minor' : 'major',
        };
    }

    const currentNotes = useMemo(() => getChordMidiNotes(currentChord, 4), [currentChord]);
    const nextNotes = useMemo(() => getChordMidiNotes(nextChord, 4), [nextChord]);

    const currentNotesRef = useRef(currentNotes);
    const nextNotesRef = useRef(nextNotes);

    useEffect(() => {
        currentNotesRef.current = currentNotes;
        nextNotesRef.current = nextNotes;
    }, [currentNotes, nextNotes]);

    const heldKeysRef = useRef([]); // Stack of { key, midi }
    const [activeKeys, setActiveKeys] = useState(new Set()); // Keys that are held
    const [playingKey, setPlayingKey] = useState(null); // The one currently sounding

    // Unified trigger for both keyboard and pointer events
    const triggerNote = (midiNote, sourceKey, isLegato = false) => {
        initAudio();
        restoreGains();

        const freq = 440 * 2 ** ((midiNote - 69) / 12);
        // Use a very long duration (60s) for manual performance to allow sustains
        playSoloNote(freq, 0, 60.0, 0.8, 0, 'scalar', isLegato);

        const noteInfo = midiToNote(midiNote);
        setCurrentNoteName(`${noteInfo.name}${noteInfo.octave}`);
        setPlayingKey(sourceKey);
    };

    const stopNote = (sourceKey = null) => {
        if (!sourceKey) {
            // Kill everything
            killSoloistNote();
            setCurrentNoteName('');
            heldKeysRef.current = [];
            setActiveKeys(new Set());
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
        setActiveKeys(nextHeld);

        if (heldKeysRef.current.length === 0) {
            killSoloistNote();
            setCurrentNoteName('');
            setPlayingKey(null);
        } else if (wasPlaying) {
            // Fallback to the next note in the stack
            const next = heldKeysRef.current[heldKeysRef.current.length - 1];
            triggerNote(next.midi, next.key, true);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.repeat) {
                return;
            }
            const key = e.key.toLowerCase();

            // HOME ROW: Current Chord (10 keys)
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

            // TOP ROW: Upcoming Chord (10 keys)
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
                midiNote = currentNotesRef.current[currentKeys[key]];
            } else if (key in nextKeys && nextNotesRef.current.length > 0) {
                midiNote = nextNotesRef.current[nextKeys[key]];
            }

            if (midiNote !== null) {
                e.preventDefault();
                const isLegato = heldKeysRef.current.length > 0;

                // Push to stack
                heldKeysRef.current.push({ key, midi: midiNote });
                setActiveKeys(new Set(heldKeysRef.current.map((h) => h.key)));

                triggerNote(midiNote, key, isLegato);
            }
        };

        const handleKeyUp = (e) => {
            const key = e.key.toLowerCase();
            stopNote(key);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            stopNote();
        };
    }, []);

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'performance', open: false });
    };

    const renderKey = (label, midi, sourceKey, colorVar) => {
        const isHeld = activeKeys.has(sourceKey);
        const isPlaying = playingKey === sourceKey;
        const noteInfo = midi ? midiToNote(midi) : null;
        const noteLabel = noteInfo ? `${noteInfo.name}${noteInfo.octave}` : '';

        return (
            <button
                key={sourceKey}
                onPointerDown={(e) => {
                    e.preventDefault();
                    if (!midi) {
                        return;
                    }
                    const isLegato = heldKeysRef.current.length > 0;
                    heldKeysRef.current.push({ key: sourceKey, midi });
                    setActiveKeys(new Set(heldKeysRef.current.map((h) => h.key)));
                    triggerNote(midi, sourceKey, isLegato);
                }}
                onPointerUp={(e) => {
                    e.preventDefault();
                    stopNote(sourceKey);
                }}
                onPointerLeave={(e) => {
                    e.preventDefault();
                    if (activeKeys.has(sourceKey)) {
                        stopNote(sourceKey);
                    }
                }}
                style={`
                    width: 55px; height: 70px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
                    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
                    font-weight: bold; cursor: pointer; transition: all 0.1s; font-size: 0.9rem;
                    ${isPlaying ? `background: var(${colorVar}); color: #fff; transform: translateY(2px); box-shadow: none;` : isHeld ? 'background: rgba(255,255,255,0.2); color: #fff;' : 'background: rgba(255,255,255,0.05); color: #94a3b8; box-shadow: 0 3px 0 rgba(0,0,0,0.3);'}
                `}
            >
                <span style="font-size: 1.1rem;">{label}</span>
                <span style="font-size: 0.6rem; opacity: 0.6;">{noteLabel}</span>
            </button>
        );
    };

    return (
        <div class="modal-overlay active" onClick={close}>
            <div
                ref={modalRef}
                tabIndex={0}
                class="modal PerformanceSurfaceModal"
                onClick={(e) => e.stopPropagation()}
                style="max-width: 1200px; height: 85vh; max-height: 700px;"
            >
                <div class="modal-header">
                    <h2>Soloist Performance Mode</h2>
                    <button class="icon-btn close-btn" onClick={close} aria-label="Close">
                        ✖
                    </button>
                </div>

                <div
                    class="modal-content"
                    style="flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; align-items: center; padding: 1rem;"
                >
                    <div style="height: 4rem; display: flex; align-items: center; justify-content: center;">
                        {currentNoteName && (
                            <div style="font-size: 4rem; font-weight: 900; color: var(--soloist-color); text-shadow: 0 0 20px rgba(var(--soloist-color-rgb), 0.5); font-family: monospace;">
                                {currentNoteName}
                            </div>
                        )}
                    </div>

                    <div
                        class="keyboard-layout"
                        style="display: flex; flex-direction: column; gap: 2.5rem; width: 100%; align-items: center;"
                    >
                        {/* UPCOMING CHORD - TOP ROW */}
                        <div style="text-align: center; width: 100%;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; padding: 0 4rem;">
                                <span style="color: #94a3b8; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8;">
                                    Upcoming Chord (Top Row)
                                </span>
                                <div style="font-size: 1.5rem; font-weight: bold; color: #cbd5e1; background: rgba(255,255,255,0.05); border: 1px dashed #475569; padding: 0.2rem 1rem; border-radius: 8px; min-width: 100px;">
                                    {nextChord ? nextChord.chord : '---'}
                                </div>
                            </div>
                            <div style="display: flex; gap: 0.5rem; justify-content: center;">
                                {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((k, i) =>
                                    renderKey(k, nextNotes[i], k.toLowerCase(), '--text-secondary'),
                                )}
                            </div>
                        </div>

                        {/* CURRENT CHORD - HOME ROW */}
                        <div style="text-align: center; width: 100%;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; padding: 0 4rem;">
                                <span style="color: var(--soloist-color); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8;">
                                    Current Chord (Home Row)
                                </span>
                                <div style="font-size: 2rem; font-weight: bold; color: var(--soloist-color); background: rgba(var(--soloist-color-rgb), 0.1); border: 2px solid var(--soloist-color); padding: 0.2rem 1.5rem; border-radius: 8px; min-width: 120px;">
                                    {currentChord ? currentChord.chord : '---'}
                                </div>
                            </div>
                            <div style="display: flex; gap: 0.5rem; justify-content: center;">
                                {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';'].map((k, i) =>
                                    renderKey(
                                        k,
                                        currentNotes[i],
                                        k.toLowerCase(),
                                        '--soloist-color',
                                    ),
                                )}
                            </div>
                        </div>
                    </div>

                    <div
                        class="keyboard-instructions"
                        style="text-align: center; color: #475569; font-size: 0.8rem;"
                    >
                        <p>
                            Use <strong>Home Row</strong> for the Current Chord and{' '}
                            <strong>Top Row</strong> to anticipate the Upcoming Chord. The scale is
                            laid out linearly from left to right.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
