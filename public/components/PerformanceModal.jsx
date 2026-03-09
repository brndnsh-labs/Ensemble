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

    const [activeKeys, setActiveKeys] = useState(new Set());

    // Unified trigger for both keyboard and pointer events
    const triggerNote = (midiNote, sourceKey = null) => {
        initAudio();
        restoreGains();

        // Enforce strict monophonic rule by killing any existing note
        killSoloistNote();

        const freq = 440 * 2 ** ((midiNote - 69) / 12);
        playSoloNote(freq, 0, 60.0, 0.8);

        const noteInfo = midiToNote(midiNote);
        setCurrentNoteName(`${noteInfo.name}${noteInfo.octave}`);

        if (sourceKey) {
            setActiveKeys((prev) => new Set(prev).add(sourceKey));
        }
    };

    const stopNote = (sourceKey = null) => {
        killSoloistNote();
        setCurrentNoteName('');
        if (sourceKey) {
            setActiveKeys((prev) => {
                const next = new Set(prev);
                next.delete(sourceKey);
                return next;
            });
        } else {
            setActiveKeys(new Set());
        }
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.repeat) {
                return;
            }
            const key = e.key.toLowerCase();
            const currentMap = { a: 0, s: 1, d: 2, f: 3, g: 4 };
            const nextMap = { q: 0, w: 1, e: 2, r: 3, t: 4 };

            let midiNote = null;
            if (key in currentMap && currentNotesRef.current.length > 0) {
                midiNote = currentNotesRef.current[currentMap[key]];
            } else if (key in nextMap && nextNotesRef.current.length > 0) {
                midiNote = nextNotesRef.current[nextMap[key]];
            }

            if (midiNote !== null) {
                e.preventDefault();
                triggerNote(midiNote, key);
            }
        };

        const handleKeyUp = (e) => {
            const key = e.key.toLowerCase();
            const allKeys = ['a', 's', 'd', 'f', 'g', 'q', 'w', 'e', 'r', 't'];
            if (allKeys.includes(key)) {
                e.preventDefault();
                stopNote(key);
            }
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
        const isActive = activeKeys.has(sourceKey);
        const noteInfo = midi ? midiToNote(midi) : null;
        const noteLabel = noteInfo ? `${noteInfo.name}${noteInfo.octave}` : '';

        return (
            <button
                key={sourceKey}
                onPointerDown={(e) => {
                    e.preventDefault();
                    if (midi) {
                        triggerNote(midi, sourceKey);
                    }
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
                    width: 60px; height: 80px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
                    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
                    font-weight: bold; cursor: pointer; transition: all 0.1s;
                    ${isActive ? `background: var(${colorVar}); color: #fff; transform: translateY(2px); box-shadow: none;` : 'background: rgba(255,255,255,0.05); color: #94a3b8; box-shadow: 0 4px 0 rgba(0,0,0,0.3);'}
                `}
            >
                <span style="font-size: 1.2rem;">{label}</span>
                <span style="font-size: 0.7rem; opacity: 0.6;">{noteLabel}</span>
            </button>
        );
    };

    return (
        <div
            class="modal-overlay active"
            onClick={close}
            style="z-index: 1000; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;"
        >
            <div
                ref={modalRef}
                tabIndex={0}
                class="modal PerformanceSurfaceModal"
                onClick={(e) => e.stopPropagation()}
                style="width: 90vw; max-width: 1000px; height: 80vh; max-height: 600px; display: flex; flex-direction: column; background: #0f172a; border-radius: 12px; border: 1px solid #334155; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); outline: none; position: relative;"
            >
                <div class="modal-header">
                    <h2>Soloist Performance Mode</h2>
                    <button class="icon-btn close-btn" onClick={close} aria-label="Close">
                        ✖
                    </button>
                </div>

                <div
                    class="modal-content"
                    style="flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; align-items: center; padding: 2rem;"
                >
                    <div style="height: 4rem; display: flex; align-items: center; justify-content: center;">
                        {currentNoteName && (
                            <div style="font-size: 4rem; font-weight: 900; color: var(--soloist-color); text-shadow: 0 0 20px rgba(var(--soloist-color-rgb), 0.5); font-family: monospace;">
                                {currentNoteName}
                            </div>
                        )}
                    </div>

                    <div
                        class="chord-timeline"
                        style="display: flex; gap: 4rem; align-items: flex-start; width: 100%; justify-content: center;"
                    >
                        <div class="active-chord" style="text-align: center;">
                            <h3 style="color: var(--soloist-color); font-size: 1rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">
                                Current Chord
                            </h3>
                            <div style="font-size: 2.5rem; font-weight: bold; padding: 0.75rem 2rem; background: rgba(var(--soloist-color-rgb), 0.1); border: 2px solid var(--soloist-color); border-radius: 12px; margin-bottom: 1.5rem; min-width: 140px;">
                                {currentChord ? currentChord.chord : '---'}
                            </div>
                            <div style="display: flex; gap: 0.75rem; justify-content: center;">
                                {['A', 'S', 'D', 'F', 'G'].map((k, i) =>
                                    renderKey(
                                        k,
                                        currentNotes[i],
                                        k.toLowerCase(),
                                        '--soloist-color',
                                    ),
                                )}
                            </div>
                        </div>

                        <div style="font-size: 2rem; color: #334155; align-self: center; margin-top: 2rem;">
                            ➡
                        </div>

                        <div class="upcoming-chord" style="text-align: center; opacity: 0.8;">
                            <h3 style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">
                                Next Chord
                            </h3>
                            <div style="font-size: 2rem; font-weight: bold; padding: 0.5rem 1.5rem; background: rgba(255, 255, 255, 0.05); border: 2px dashed #475569; border-radius: 12px; color: #cbd5e1; margin-bottom: 1.5rem; min-width: 120px;">
                                {nextChord ? nextChord.chord : '---'}
                            </div>
                            <div style="display: flex; gap: 0.75rem; justify-content: center;">
                                {['Q', 'W', 'E', 'R', 'T'].map((k, i) =>
                                    renderKey(k, nextNotes[i], k.toLowerCase(), '--text-secondary'),
                                )}
                            </div>
                        </div>
                    </div>

                    <div
                        class="keyboard-instructions"
                        style="text-align: center; color: #475569; font-size: 0.9rem;"
                    >
                        <p>
                            Use your keyboard or click the buttons above to play manual soloist
                            lines.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
