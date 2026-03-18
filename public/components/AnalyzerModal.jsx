import { Fragment, h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ChordAnalyzerLite } from '../audio-analyzer-lite.js';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols } from '../utils.js';

/**
 * @param {Object} props
 */
export function AnalyzerModal() {
    const isOpen = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => s.playback.modals.analyzer,
    );
    const dispatch = useDispatch();
    const [mode, setMode] = useState('chord'); // 'chord' or 'melody'
    const [isListening, setIsListening] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Select a mode to begin');
    const [currentStableChord, setCurrentStableChord] = useState(null);
    const [history, setHistory] = useState([]);
    const [transcribedBPM, setTranscribedBPM] = useState(null);
    const [isProcessingFile, setIsProcessingFile] = useState(false);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [confirmClearHistory, setConfirmClearHistory] = useState(false);

    const analyzerRef = useRef(null);
    const micStreamRef = useRef(null);
    const overlayRef = useRef(null);
    const autoAddTimerRef = useRef(null);
    const clearHistoryTimerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (isListening) {
                stopListening();
            }
            if (analyzerRef.current) {
                analyzerRef.current.close();
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
        dispatch(ACTIONS.APPEND_CHORD_TO_SECTION, {
            sectionId: getState().arranger.sections[0].id,
            chord: currentStableChord,
        });
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
            await analyzerRef.current.init(stream);

            setIsListening(true);
            setStatusMessage('Listening...');

            analyzerRef.current.onUpdate = (/** @type {any} */ data) => {
                if (data.chord) {
                    setCurrentStableChord(data.chord);
                    // Add to history if unique
                    setHistory((prev) => {
                        if (prev[prev.length - 1] !== data.chord) {
                            return [...prev.slice(-19), data.chord];
                        }
                        return prev;
                    });
                }
            };
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
        if (analyzerRef.current) {
            analyzerRef.current.stop();
        }
        setIsListening(false);
        setStatusMessage('Analyzer paused');
    }

    async function handleFileUpload(/** @type {any} */ e) {
        const file = e.target.files[0];
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

            const results = await analyzerRef.current.analyzeFile(
                file,
                (/** @type {any} */ progress) => {
                    setProcessingProgress(Math.round(progress * 100));
                },
            );

            if (results.progression && results.progression.length > 0) {
                setHistory(results.progression);
                if (results.bpm) {
                    setTranscribedBPM(Math.round(results.bpm));
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
                progression: history.join(' | '),
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
            ref={overlayRef}
            class={`modal-overlay ${isOpen ? 'active' : ''}`}
            onClick={(/** @type {any} */ e) => e.target.id === 'analyzerOverlay' && closeModal()}
        >
            <div
                class="modal-content analyzer-modal"
                onClick={(/** @type {any} */ e) => e.stopPropagation()}
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
                                                    clearHistoryTimerRef.current = setTimeout(
                                                        () => {
                                                            setConfirmClearHistory(false);
                                                        },
                                                        3000,
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
