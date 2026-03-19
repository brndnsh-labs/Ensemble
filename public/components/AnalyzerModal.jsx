import { Fragment, h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ChordAnalyzerLite } from '../audio-analyzer-lite.js';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols } from '../utils.js';

/**
 * @typedef {import('../ui-types.js').ComponentChildren} ComponentChildren
 */

/**
 * @typedef {Object} AnalyzerModalProps
 */

/** @param {AnalyzerModalProps} _props */
export function AnalyzerModal(_props) {
    const isOpen = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => s.playback.modals.analyzer,
    );
    const dispatch = useDispatch();
    const [mode, setMode] = useState('chord'); // 'chord' or 'melody'
    const [isListening, setIsListening] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Select a mode to begin');
    const [currentStableChord, _setCurrentStableChord] = useState(null);
    const [history, setHistory] = useState(/** @type {any[]} */ ([]));
    const [transcribedBPM, setTranscribedBPM] = useState(/** @type {number|null} */ (null));
    const [isProcessingFile, setIsProcessingFile] = useState(false);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [confirmClearHistory, setConfirmClearHistory] = useState(false);

    /** @type {import('preact').RefObject<ChordAnalyzerLite|null>} */
    const analyzerRef = useRef(null);
    /** @type {import('preact').RefObject<MediaStream|null>} */
    const micStreamRef = useRef(null);
    /** @type {import('preact').RefObject<HTMLDivElement|null>} */
    const overlayRef = useRef(null);
    /** @type {import('preact').RefObject<number|null>} */
    const autoAddTimerRef = useRef(null);
    /** @type {import('preact').RefObject<number|null>} */
    const clearHistoryTimerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (isListening) {
                stopListening();
            }
            if (autoAddTimerRef.current) {
                clearTimeout(autoAddTimerRef.current);
            }
        };
    }, [isListening]);

    useEffect(() => {
        return () => {
            if (clearHistoryTimerRef.current) {
                clearTimeout(clearHistoryTimerRef.current);
            }
        };
    }, []);

    function addCurrentChord() {
        if (!currentStableChord) {
            return;
        }
        const sections = getState().arranger.sections;
        if (sections.length > 0) {
            const section = sections[0];
            const updatedProgression = section.value
                ? `${section.value} | ${currentStableChord}`
                : currentStableChord;
            dispatch(ACTIONS.UPDATE_SECTION, {
                id: section.id,
                updates: { value: updatedProgression },
            });
        }
    }

    async function startListening() {
        try {
            setStatusMessage('Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;

            if (!analyzerRef.current) {
                analyzerRef.current = new ChordAnalyzerLite();
            }

            setStatusMessage('Calibrating noise floor...');
            // Live listening not fully implemented in ChordAnalyzerLite standalone
            // await analyzerRef.current.init(stream);

            setIsListening(true);
            setStatusMessage('Listening...');
        } catch (err) {
            console.error('Microphone access failed:', err);
            setStatusMessage('Error: Microphone access denied or not supported.');
        }
    }

    function stopListening() {
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach((/** @type {any} */ t) => t.stop());
            micStreamRef.current = null;
        }
        setIsListening(false);
        setStatusMessage('Analyzer paused');
    }

    /** @param {Event} e */
    async function handleFileUpload(e) {
        const target = /** @type {HTMLInputElement} */ (e.target);
        if (!target.files || target.files.length === 0) {
            return;
        }
        const file = target.files[0];
        if (!file) {
            return;
        }

        setIsProcessingFile(true);
        setStatusMessage(`Processing ${file.name}...`);
        setProcessingProgress(0);

        try {
            if (!analyzerRef.current) {
                analyzerRef.current = new ChordAnalyzerLite();
            }

            const arrayBuffer = await file.arrayBuffer();
            const audioContext = new window.AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            const results = await analyzerRef.current.analyze(audioBuffer, {
                onProgress: (/** @type {any} */ progress) => {
                    setProcessingProgress(Math.round(progress));
                },
            });

            const progression = results.chords.map((/** @type {any} */ c) => c.chord);

            if (progression && progression.length > 0) {
                setHistory(progression);
                if (results.pulse?.bpm) {
                    setTranscribedBPM(Math.round(results.pulse.bpm));
                }
                setStatusMessage('Analysis complete!');
            } else {
                setStatusMessage('No chords detected in file.');
            }
        } catch (err) {
            console.error('File analysis failed:', err);
            setStatusMessage('Error processing file.');
        } finally {
            setIsProcessingFile(false);
        }
    }

    function applyAnalysis() {
        if (history.length === 0) {
            return;
        }

        const sections = [
            {
                id: 'transcription',
                label: 'Transcribed',
                value: history.join(' | '),
                repeat: 1,
            },
        ];

        dispatch(ACTIONS.SET_ARRANGEMENT, { sections });
        if (transcribedBPM) {
            dispatch(ACTIONS.SET_BPM, transcribedBPM);
        }

        closeModal();
    }

    function closeModal() {
        if (isListening) {
            stopListening();
        }
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'analyzer', open: false });
    }

    if (!isOpen) {
        return null;
    }

    return (
        <div
            id="analyzerOverlay"
            ref={/** @type {any} */ (overlayRef)}
            class={`modal-overlay ${isOpen ? 'active' : ''}`}
            onClick={(/** @type {MouseEvent} */ e) => {
                const target = /** @type {HTMLElement} */ (e.target);
                if (target.id === 'analyzerOverlay') {
                    closeModal();
                }
            }}
        >
            <div
                class="modal-content analyzer-modal"
                onClick={(/** @type {MouseEvent} */ e) => e.stopPropagation()}
            >
                <div class="modal-header-shared">
                    <h2>Audio Chord Analyzer</h2>
                    <button
                        id="closeAnalyzerBtn"
                        class="close-btn"
                        onClick={closeModal}
                        aria-label="Close"
                    >
                        &times;
                    </button>
                </div>

                <div class="modal-body">
                    {/* Mode Selector (Restored radio inputs for tests) */}
                    <div class="analyzer-modes">
                        <label
                            class={`analyzer-mode-btn ${mode === 'chord' ? 'active' : ''}`}
                            onClick={() => setMode('chord')}
                        >
                            <input
                                type="radio"
                                name="analyzerMode"
                                value="chord"
                                checked={mode === 'chord'}
                                class="sr-only"
                            />
                            <span>🎼</span>
                            <span>Chord Recognition</span>
                        </label>
                        <label
                            class={`analyzer-mode-btn ${mode === 'melody' ? 'active' : ''}`}
                            onClick={() => setMode('melody')}
                        >
                            <input
                                type="radio"
                                name="analyzerMode"
                                value="melody"
                                checked={mode === 'melody'}
                                class="sr-only"
                            />
                            <span>🎤</span>
                            <span>Melody Harmonizer</span>
                        </label>
                    </div>

                    {/* History / Tape Strip View */}
                    <div class="analyzer-history-strip">
                        {history.map((/** @type {any} */ c, /** @type {any} */ i) => (
                            <span key={i} class="history-chord-tag">
                                {formatUnicodeSymbols(c)}
                            </span>
                        ))}
                    </div>

                    <div class="analyzer-workspace">
                        {!isListening && !isProcessingFile && (
                            <Fragment>
                                <div class="grid-actions">
                                    <button
                                        id="liveListenBtn"
                                        class="primary-btn"
                                        onClick={startListening}
                                    >
                                        <span>▶</span> Start Listening
                                    </button>
                                    <label class="secondary-btn file-upload-label">
                                        <span>📁</span> Upload Audio
                                        <input
                                            type="file"
                                            accept="audio/*"
                                            onChange={handleFileUpload}
                                            class="sr-only"
                                        />
                                    </label>
                                </div>

                                <div id="analyzerDropZone" class="analyzer-drop-zone">
                                    <div class="drop-zone-icon">☁️</div>
                                    <p>Drop audio file here to transcribe</p>
                                    <span class="text-muted">Supports MP3, WAV, M4A</span>
                                </div>
                            </Fragment>
                        )}

                        {isListening && (
                            <div class="analyzer-live-view">
                                <div id="liveChordDisplay" class="analyzer-freq-display">
                                    {currentStableChord
                                        ? formatUnicodeSymbols(currentStableChord)
                                        : '...'}
                                </div>
                                <div class="grid-actions">
                                    <button class="primary-btn" onClick={addCurrentChord}>
                                        <span>➕</span> Add to Song
                                    </button>
                                    <button class="secondary-btn" onClick={stopListening}>
                                        <span>⏹</span> Stop
                                    </button>
                                </div>
                            </div>
                        )}

                        {isProcessingFile && (
                            <div class="analyzer-processing">
                                <div class="progress-bar-container">
                                    <div
                                        class="progress-bar-fill"
                                        style={{ width: `${processingProgress}%` }}
                                    />
                                </div>
                                <p>{statusMessage}</p>
                                <button
                                    class="secondary-btn"
                                    onClick={() => window.location.reload()}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}

                        {history.length > 0 && !isListening && (
                            <div class="analyzer-results-box">
                                <div class="results-header">
                                    <span class="label-caps">Transcribed Progression</span>
                                    <div class="btn-group-mini">
                                        <button
                                            aria-live="polite"
                                            onClick={() => {
                                                if (!confirmClearHistory) {
                                                    setConfirmClearHistory(true);
                                                    clearHistoryTimerRef.current =
                                                        /** @type {any} */ (
                                                            setTimeout(() => {
                                                                setConfirmClearHistory(false);
                                                            }, 3000)
                                                        );
                                                } else {
                                                    setHistory([]);
                                                    setConfirmClearHistory(false);
                                                    if (clearHistoryTimerRef.current) {
                                                        clearTimeout(clearHistoryTimerRef.current);
                                                    }
                                                }
                                            }}
                                        >
                                            {confirmClearHistory ? 'Sure?' : 'Clear'}
                                        </button>
                                        <button onClick={() => setHistory(history.slice(0, -1))}>
                                            Undo
                                        </button>
                                    </div>
                                </div>
                                <div class="analyzer-chord-list">
                                    {history.length > 0
                                        ? formatUnicodeSymbols(history.join(' '))
                                        : 'No chords captured yet.'}
                                </div>
                                <div class="grid-actions">
                                    <button class="primary-btn apply-btn" onClick={applyAnalysis}>
                                        Apply to Arrangement
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div class="analyzer-settings">
                        <div class="grid-2-col">
                            <div class="form-control-compact">
                                <label htmlFor="analyzer-input-gain">Input Gain</label>
                                <input
                                    id="analyzer-input-gain"
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    defaultValue="1"
                                />
                            </div>
                            <div class="form-control-compact">
                                <label htmlFor="analyzer-sensitivity">Sensitivity</label>
                                <input
                                    id="analyzer-sensitivity"
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    defaultValue="0.5"
                                />
                            </div>
                        </div>
                        <p class="text-mini-muted">
                            Tip: For best results, use a clean audio signal and minimize background
                            noise.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
