import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { KEY_ORDER } from '../config.js';
import { killSoloistNote, playSoloNote } from '../engine/engine.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { getChordMidiNotes } from '../utils.js';

export function PerformanceModal() {
    const { step, stepMap, isPlaying, key, isMinor } = useEnsembleState((s) => ({
        step: s.playback.step,
        stepMap: s.arranger.stepMap,
        isPlaying: s.playback.isPlaying,
        key: s.arranger.key,
        isMinor: s.arranger.isMinor,
    }));

    // Find current and next chords
    let currentChord = stepMap[step] || null;
    let nextChord = null;

    let isFallback = false;
    // Fallback: If playback is stopped or no chord is found, default to the global key signature
    if (!isPlaying && !currentChord) {
        isFallback = true;
        const keyIndex = KEY_ORDER.indexOf(key);
        // Base MIDI for C4 is 60. rootMidi corresponds to the offset from C.
        const rootMidi = 60 + (keyIndex >= 0 ? keyIndex : 0);
        currentChord = {
            chord: key + (isMinor ? 'm' : ''),
            rootMidi: rootMidi,
            quality: isMinor ? 'minor' : 'major',
        };
    }

    if (currentChord && !isFallback) {
        // Find the next chord that is different
        for (let i = step + 1; i < stepMap.length; i++) {
            if (stepMap[i] && stepMap[i] !== currentChord) {
                nextChord = stepMap[i];
                break;
            }
        }
    }

    const currentNotes = useMemo(() => getChordMidiNotes(currentChord, 4), [currentChord]);
    const nextNotes = useMemo(() => getChordMidiNotes(nextChord, 4), [nextChord]);

    const activeKeysRef = useRef(new Map());
    const [activeKeys, setActiveKeys] = useState(new Set());
    const lastPlayedKeyRef = useRef(null);

    // Helper to send note to the engine
    const triggerNote = (midiNote) => {
        // We use 0 for time (immediate)
        const freq = 440 * 2 ** ((midiNote - 69) / 12);
        const velocity = 0.8;
        const duration = 2.0; // Sustained note, will be killed on release
        playSoloNote(freq, 0, duration, velocity);
    };

    const stopNote = () => {
        killSoloistNote();
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.repeat) {
                return;
            } // Ignore OS key repeats

            const key = e.key.toLowerCase();
            let midiNote = null;

            // Map home row (A S D F G) to current chord
            const currentMap = { a: 0, s: 1, d: 2, f: 3, g: 4 };
            // Map top row (Q W E R T) to upcoming chord
            const nextMap = { q: 0, w: 1, e: 2, r: 3, t: 4 };

            if (key in currentMap && currentNotes.length > 0) {
                midiNote = currentNotes[currentMap[key]];
            } else if (key in nextMap && nextNotes.length > 0) {
                midiNote = nextNotes[nextMap[key]];
            }

            if (midiNote !== null) {
                e.preventDefault();

                // Note: kill previous note before triggering new one to enforce strict monophonic rule
                if (activeKeysRef.current.size > 0) {
                    stopNote();
                }

                activeKeysRef.current.set(key, midiNote);
                lastPlayedKeyRef.current = key;

                triggerNote(midiNote);

                // Update UI state
                setActiveKeys(new Set(activeKeysRef.current.keys()));
            }
        };

        const handleKeyUp = (e) => {
            const key = e.key.toLowerCase();
            if (activeKeysRef.current.has(key)) {
                e.preventDefault();
                activeKeysRef.current.delete(key);

                if (activeKeysRef.current.size === 0) {
                    stopNote();
                    lastPlayedKeyRef.current = null;
                } else if (lastPlayedKeyRef.current === key) {
                    // Fallback to the most recently pressed remaining key
                    const remainingKeys = Array.from(activeKeysRef.current.keys());
                    const fallbackKey = remainingKeys[remainingKeys.length - 1];
                    lastPlayedKeyRef.current = fallbackKey;
                    triggerNote(activeKeysRef.current.get(fallbackKey));
                }

                // Update UI state
                setActiveKeys(new Set(activeKeysRef.current.keys()));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            stopNote(); // Cleanup lingering notes when modal closes
        };
    }, [currentNotes, nextNotes]);

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'performance', open: false });
    };

    return (
        <div
            class="modal-overlay active"
            onClick={close}
            style="z-index: 1000; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;"
        >
            <div
                class="modal PerformanceSurfaceModal"
                onClick={(e) => e.stopPropagation()}
                style="width: 90vw; max-width: none; height: 85vh; max-height: none; display: flex; flex-direction: column; background: #0f172a; border-radius: 12px; border: 1px solid #334155; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);"
            >
                <div class="modal-header">
                    <h2>Soloist Performance Mode</h2>
                    <button class="icon-btn close-btn" onClick={close} aria-label="Close">
                        ✖
                    </button>
                </div>

                <div
                    class="modal-content"
                    style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 2rem; padding: 2rem;"
                >
                    <div
                        class="chord-timeline"
                        style="display: flex; gap: 4rem; align-items: center; width: 100%; justify-content: center;"
                    >
                        <div class="active-chord" style="text-align: center;">
                            <h3 style="color: var(--soloist-color); font-size: 1.2rem; margin-bottom: 0.5rem;">
                                Current Chord
                            </h3>
                            <div style="font-size: 3rem; font-weight: bold; padding: 1rem 2rem; background: rgba(var(--soloist-color-rgb), 0.1); border: 2px solid var(--soloist-color); border-radius: 12px; margin-bottom: 1rem;">
                                {currentChord ? currentChord.chord : '---'}
                            </div>
                            <div style="display: flex; gap: 0.5rem; justify-content: center;">
                                {['A', 'S', 'D', 'F', 'G'].map((k) => (
                                    <div
                                        style={`width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; ${activeKeys.has(k.toLowerCase()) ? 'background: var(--soloist-color); color: #fff;' : 'background: rgba(255,255,255,0.1); color: #94a3b8;'}`}
                                    >
                                        {k}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style="font-size: 2rem; color: #64748b;">➡</div>

                        <div class="upcoming-chord" style="text-align: center; opacity: 0.7;">
                            <h3 style="color: #94a3b8; font-size: 1rem; margin-bottom: 0.5rem;">
                                Upcoming Chord
                            </h3>
                            <div style="font-size: 2rem; font-weight: bold; padding: 0.75rem 1.5rem; background: rgba(255, 255, 255, 0.05); border: 2px dashed #475569; border-radius: 12px; color: #cbd5e1; margin-bottom: 1rem;">
                                {nextChord ? nextChord.chord : '---'}
                            </div>
                            <div style="display: flex; gap: 0.5rem; justify-content: center;">
                                {['Q', 'W', 'E', 'R', 'T'].map((k) => (
                                    <div
                                        style={`width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; ${activeKeys.has(k.toLowerCase()) ? 'background: #cbd5e1; color: #000;' : 'background: rgba(255,255,255,0.05); color: #64748b;'}`}
                                    >
                                        {k}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div
                        class="keyboard-instructions"
                        style="text-align: center; color: #94a3b8; max-width: 600px; margin-top: 2rem;"
                    >
                        <p>
                            <strong>A S D F G</strong> play the Root, 3rd, 5th, 7th, 9th of the{' '}
                            <strong>Current Chord</strong>
                        </p>
                        <p>
                            <strong>Q W E R T</strong> play the Root, 3rd, 5th, 7th, 9th of the{' '}
                            <strong>Upcoming Chord</strong>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
