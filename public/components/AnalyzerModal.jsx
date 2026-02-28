import { Fragment, h } from 'preact';
import React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { refreshArrangerUI } from '../arranger-controller.js';
import { pushHistory } from '../history.js';
import { ACTIONS } from '../types.js';
import { showToast } from '../ui.js';
import { useDispatch, useEnsembleState } from '../ui-bridge.js';
import { formatUnicodeSymbols, generateId } from '../utils.js';

export function AnalyzerModal() {
    const dispatch = useDispatch();
    const isOpen = useEnsembleState((s) => s.playback.modals.analyzer);
    const arrangerKey = useEnsembleState((s) => s.arranger.key);
    const bandIntensity = useEnsembleState((s) => s.playback.bandIntensity);
    const sessionTimer = useEnsembleState((s) => s.playback.sessionTimer);
    const sessionStartTime = useEnsembleState((s) => s.playback.sessionStartTime);
    const overlayRef = useRef(null);

    useEffect(() => {
        if (isOpen && overlayRef.current) {
            const focusable = overlayRef.current.querySelector(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            );
            if (focusable) {
                setTimeout(() => focusable.focus(), 50);
            }
        }
    }, [isOpen]);

    // View States: 'idle', 'live', 'trim', 'processing', 'results'
    const [view, setView] = useState('idle');
    const [mode, setMode] = useState('chords'); // 'chords' | 'melody'
    const [strategyMode, setStrategyMode] = useState('balanced'); // 'consonant' | 'balanced' | 'complex' | 'auto'
    const [forceKey, setForceKey] = useState(false);
    const [stagedChords, setStagedChords] = useState([]);
    const [currentStableChord, setCurrentStableChord] = useState(null);
    const [detectedKey, setDetectedKey] = useState('--');
    const [autoAdd, setAutoAdd] = useState(false);
    const [replaceExisting, setReplaceExisting] = useState(true);
    const [trimRange, setTrimRange] = useState({ start: 0, end: 0 });
    const [audioBuffer, setAudioBuffer] = useState(null);
    const [progress, setProgress] = useState(0);
    const [analysisData, setAnalysisData] = useState(null);
    const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);

    // Audio / Analysis Refs
    const audioCtxRef = useRef(null);
    const streamRef = useRef(null);
    const analyzerRef = useRef(null);
    const harmonizerRef = useRef(null);
    const stabilityRef = useRef({ lastChord: null, counter: 0 });
    const autoAddTimerRef = useRef(null);
    const canvasRef = useRef(null);

    const STABILITY_THRESHOLD = 3;
    const AUTO_ADD_DELAY = 1200;

    // --- HOISTED FUNCTIONS ---

    function close() {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'analyzer', open: false });
    }

    function stopLiveListen() {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close();
            audioCtxRef.current = null;
        }
        analyzerRef.current = null;
        harmonizerRef.current = null;
        if (autoAddTimerRef.current) {
            clearTimeout(autoAddTimerRef.current);
        }

        setCurrentStableChord(null);
        setDetectedKey('--');
        setView('idle');
    }

    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
            }
            if (audioCtxRef.current) {
                audioCtxRef.current.close();
            }
            if (autoAddTimerRef.current) {
                clearTimeout(autoAddTimerRef.current);
            }
        };
    }, []);

    function addCurrentChord() {
        if (!currentStableChord) {
            return;
        }
        setStagedChords((prev) => {
            const last = prev[prev.length - 1];
            if (last === `${currentStableChord} `) {
                return prev; // Avoid duplicates
            }
            return [...prev, `${currentStableChord} `];
        });
    }

    async function startLiveListen() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Live Listen requires a Secure Context (HTTPS or localhost).');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: true,
                },
            });

            const { ChordAnalyzerLite } = await import('../audio-analyzer-lite.js');
            analyzerRef.current = new ChordAnalyzerLite();

            if (mode === 'melody') {
                const { Harmonizer } = await import('../melody-harmonizer.js');
                harmonizerRef.current = new Harmonizer();
            }

            streamRef.current = stream;
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtxRef.current.createMediaStreamSource(stream);

            const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
            source.connect(processor);
            processor.connect(audioCtxRef.current.destination);

            const targetSamples = Math.floor(audioCtxRef.current.sampleRate * 0.5);
            let chunks = [];
            let totalChunkLen = 0;

            processor.onaudioprocess = (e) => {
                const input = e.inputBuffer.getChannelData(0);
                chunks.push(new Float32Array(input));
                totalChunkLen += input.length;

                if (totalChunkLen >= targetSamples) {
                    const fullBuffer = new Float32Array(totalChunkLen);
                    let offset = 0;
                    for (const c of chunks) {
                        fullBuffer.set(c, offset);
                        offset += c.length;
                    }

                    const analysisBuffer = fullBuffer.slice(-targetSamples);
                    chunks = [fullBuffer.slice(-Math.floor(targetSamples / 2))];
                    totalChunkLen = chunks[0].length;

                    processAnalysis(analysisBuffer);
                }
            };

            setView('live');
        } catch (err) {
            console.error('[LiveListen] Error:', err);
            showToast(`Microphone access denied or error: ${err.message}`);
        }
    }

    function processAnalysis(buffer) {
        if (!analyzerRef.current || !audioCtxRef.current) {
            return;
        }
        const sampleRate = audioCtxRef.current.sampleRate;
        let detected = null;

        if (mode === 'melody') {
            const rms = Math.sqrt(buffer.reduce((s, x) => s + x * x, 0) / buffer.length);
            if (rms > 0.02) {
                const chroma = analyzerRef.current.calculateChromagram(buffer, sampleRate, {
                    minMidi: 48,
                    maxMidi: 84,
                });
                const keyRes = analyzerRef.current.identifySimpleKey(chroma);
                const keyStr =
                    analyzerRef.current.notes[keyRes.root] + (keyRes.type === 'minor' ? 'm' : '');
                setDetectedKey(keyStr);

                // --- Harmonizer Auto-Strategy Bridge ---
                if (harmonizerRef.current) {
                    let effectiveStrategy = strategyMode;
                    if (strategyMode === 'auto') {
                        const elapsedMins = (performance.now() - sessionStartTime) / 60000;
                        const progress =
                            sessionTimer > 0 ? Math.min(1.0, elapsedMins / sessionTimer) : 0;

                        if (bandIntensity > 0.8 || progress > 0.8) {
                            effectiveStrategy = 'complex';
                        } else if (bandIntensity < 0.4 || progress < 0.25) {
                            effectiveStrategy = 'consonant';
                        } else {
                            effectiveStrategy = 'balanced';
                        }
                    }

                    const pulse = { bpm: 120, downbeatOffset: 0 }; // Live dummy pulse
                    analyzerRef.current
                        .extractMelody(new Float32Array(buffer), pulse, { keyBias: keyRes })
                        .then((melodyLine) => {
                            const options = harmonizerRef.current.generateOptions(
                                melodyLine,
                                keyStr,
                            );
                            const match = options.find(
                                (o) => o.type.toLowerCase() === effectiveStrategy.toLowerCase(),
                            );
                            if (match && match.chords.length > 0) {
                                const bestChord = match.chords[0].roman;

                                // Update stability for the harmonized chord
                                if (bestChord === stabilityRef.current.lastChord) {
                                    stabilityRef.current.counter++;
                                } else {
                                    stabilityRef.current.counter = 0;
                                    stabilityRef.current.lastChord = bestChord;
                                }

                                if (stabilityRef.current.counter >= STABILITY_THRESHOLD) {
                                    setCurrentStableChord(bestChord);
                                }
                            }
                        });
                }
            }
        } else {
            const chroma = analyzerRef.current.calculateChromagram(buffer, sampleRate, {
                minMidi: 32,
                maxMidi: 80,
            });
            detected = analyzerRef.current.identifyChord(chroma);
        }

        if (mode !== 'melody' && detected && detected !== 'Rest') {
            if (detected === stabilityRef.current.lastChord) {
                stabilityRef.current.counter++;
            } else {
                stabilityRef.current.counter = 0;
                stabilityRef.current.lastChord = detected;
            }

            if (stabilityRef.current.counter >= STABILITY_THRESHOLD) {
                setCurrentStableChord(detected);
            }
        } else if (mode !== 'melody') {
            stabilityRef.current.counter = 0;
            stabilityRef.current.lastChord = null;
        }
    }

    async function processFile(file) {
        if (!file) {
            return;
        }
        setView('processing');
        setProgress(10);

        try {
            const arrayBuffer = await file.arrayBuffer();
            import('../state.js').then(async ({ playback }) => {
                if (!playback.audio) {
                    const { initAudio } = await import('../engine/engine.js');
                    initAudio();
                }
                const decoded = await playback.audio.decodeAudioData(arrayBuffer);
                setAudioBuffer(decoded);
                setTrimRange({ start: 0, end: Math.floor(decoded.duration) });
                setView('trim');
            });
        } catch (err) {
            console.error('[Analyzer] Load Error:', err);
            showToast('Failed to load audio');
            setView('idle');
        }
    }

    async function handleFileUpload(e) {
        processFile(e.target.files[0]);
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files?.[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    }

    async function performAnalysis() {
        if (!audioBuffer) {
            return;
        }
        setView('processing');
        setProgress(20);

        try {
            const { ChordAnalyzerLite } = await import('../audio-analyzer-lite.js');
            const analyzer = new ChordAnalyzerLite();
            const pulse = await analyzer.identifyPulse(audioBuffer, {
                onProgress: (p) => setProgress(20 + p * 0.1),
            });

            if (mode === 'melody') {
                const { Harmonizer } = await import('../melody-harmonizer.js');
                const harmonizer = new Harmonizer();
                setProgress(40);
                const melodyLine = await analyzer.extractMelody(audioBuffer, pulse, {
                    onProgress: (p) => setProgress(40 + p * 0.4),
                });
                setProgress(80);
                const options = harmonizer.generateOptions(melodyLine, arrangerKey);
                setAnalysisData({
                    summary: `Harmonized ${Math.ceil(melodyLine.length / 4)} measures`,
                    bpm: Math.round(pulse.bpm),
                    options: options,
                    mode: 'melody',
                });
            } else {
                const { extractForm } = await import('../form-extractor.js');
                setProgress(40);
                const result = await analyzer.analyze(audioBuffer, {
                    startTime: trimRange.start,
                    endTime: trimRange.end,
                    onProgress: (p) => setProgress(40 + p * 0.4),
                });
                setProgress(80);
                const sections = extractForm(result.chords, result.pulse);
                setAnalysisData({
                    summary: `Detected ${sections.length} sections`,
                    bpm: Math.round(result.pulse.bpm),
                    sections: sections,
                    mode: 'chords',
                });
            }
            setView('results');
        } catch (err) {
            console.error('[Analyzer] Analysis Error:', err);
            showToast('Analysis failed');
            setView('trim');
        }
    }

    function importResults() {
        if (!analysisData) {
            return;
        }
        pushHistory();

        let newSections = [];
        if (analysisData.mode === 'melody') {
            const opt = analysisData.options[selectedOptionIdx];
            newSections = [
                {
                    id: generateId(),
                    label: `Harmonized (${opt.type})`,
                    value: opt.progression,
                    repeat: 1,
                    key: '',
                    timeSignature: '',
                    seamless: false,
                },
            ];
        } else {
            newSections = analysisData.sections.map((s) => ({
                id: generateId(),
                label: s.label,
                value: s.value,
                repeat: s.repeat,
                key: '',
                timeSignature: '',
                seamless: false,
            }));
        }

        import('../state.js').then(({ arranger }) => {
            if (replaceExisting) {
                arranger.sections = newSections;
            } else {
                arranger.sections.push(...newSections);
            }

            arranger.isDirty = true;
            refreshArrangerUI();
            close();
            showToast(`Imported ${newSections.length} sections.`);
        });
    }

    function captureLiveHistory() {
        if (stagedChords.length === 0) {
            return;
        }
        pushHistory();

        const progressionStr = stagedChords.join('').trim();
        const cleanProgression = progressionStr.endsWith('|')
            ? progressionStr.slice(0, -1).trim()
            : progressionStr;

        const newSection = {
            id: generateId(),
            label: 'Live Input',
            value: cleanProgression,
            repeat: 1,
            key: '',
            timeSignature: '',
            seamless: false,
        };

        import('../state.js').then(({ arranger }) => {
            if (replaceExisting) {
                arranger.sections = [newSection];
            } else {
                arranger.sections.push(newSection);
            }

            arranger.isDirty = true;
            refreshArrangerUI();
            close();
            showToast(`Imported sequence.`);
        });
    }

    // --- EFFECTS ---

    // Waveform Drawing
    useEffect(() => {
        if (view === 'trim' && audioBuffer && canvasRef.current) {
            const canvas = canvasRef.current;
            const canvasCtx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();

            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;

            const width = canvas.width;
            const height = canvas.height;
            const data = audioBuffer.getChannelData(0);
            const step = Math.ceil(data.length / width);
            const amp = height / 2;

            canvasCtx.fillStyle = 'rgba(59, 130, 246, 0.5)';
            canvasCtx.clearRect(0, 0, width, height);

            canvasCtx.strokeStyle = 'rgba(255,255,255,0.1)';
            canvasCtx.beginPath();
            canvasCtx.moveTo(0, amp);
            canvasCtx.lineTo(width, amp);
            canvasCtx.stroke();

            for (let i = 0; i < width; i++) {
                let min = 1.0,
                    max = -1.0;
                for (let j = 0; j < step; j++) {
                    const datum = data[i * step + j];
                    if (datum < min) {
                        min = datum;
                    }
                    if (datum > max) {
                        max = datum;
                    }
                }
                canvasCtx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
            }
        }
    }, [view, audioBuffer]);

    // Auto-add logic
    useEffect(() => {
        if (autoAdd && currentStableChord) {
            if (autoAddTimerRef.current) {
                clearTimeout(autoAddTimerRef.current);
            }
            autoAddTimerRef.current = setTimeout(addCurrentChord, AUTO_ADD_DELAY);
        }
    }, [currentStableChord, autoAdd]);

    // Keyboard Handler
    useEffect(() => {
        function handleKeyDown(e) {
            if (e.code === 'Space' && isOpen && view === 'live') {
                e.preventDefault();
                addCurrentChord();
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, view, currentStableChord]);

    return (
        <div
            id="analyzerOverlay"
            ref={overlayRef}
            class={`modal-overlay ${isOpen ? 'active' : ''}`}
            aria-hidden={!isOpen ? 'true' : 'false'}
            onClick={(e) => {
                if (e.target.id === 'analyzerOverlay') {
                    close();
                }
            }}
        >
            <div
                class="modal-content analyzer-modal settings-content"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    class="close-modal-btn"
                    id="closeAnalyzerBtn"
                    aria-label="Close Analyzer"
                    onClick={close}
                >
                    ✕
                </button>

                <div class="analyzer-body">
                    <h3>{mode === 'melody' ? 'Melody Harmonizer' : 'Audio Chord Analyzer'}</h3>

                    <div
                        class="analyzer-mode-switch"
                        style="display: flex; gap: 8px; margin: 1rem 0; background: var(--input-bg); padding: 4px; border-radius: 8px; border: 1px solid var(--border-color);"
                    >
                        <label
                            class={`mode-option ${mode === 'chords' ? 'active' : ''}`}
                            style={getModeStyle(mode === 'chords')}
                        >
                            <input
                                type="radio"
                                name="analyzerMode"
                                value="chords"
                                checked={mode === 'chords'}
                                onChange={() => setMode('chords')}
                                class="sr-only"
                            />
                            <span style="font-size: 1.1rem;">🎼</span>
                            <span style="font-size: 0.85rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">
                                Chords
                            </span>
                        </label>
                        <label
                            class={`mode-option ${mode === 'melody' ? 'active' : ''}`}
                            style={getModeStyle(mode === 'melody')}
                        >
                            <input
                                type="radio"
                                name="analyzerMode"
                                value="melody"
                                checked={mode === 'melody'}
                                onChange={() => setMode('melody')}
                                class="sr-only"
                            />
                            <span style="font-size: 1.1rem;">🎤</span>
                            <span style="font-size: 0.85rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">
                                Melody
                            </span>
                        </label>
                    </div>

                    {mode === 'melody' && (
                        <div
                            class="harmonizer-strategy-switch"
                            style="display: flex; gap: 4px; margin: 0.5rem 0 1rem 0; background: rgba(0,0,0,0.1); padding: 4px; border-radius: 8px; border: 1px solid var(--border-color); overflow-x: auto;"
                        >
                            {['Consonant', 'Balanced', 'Complex', 'Auto'].map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setStrategyMode(s.toLowerCase())}
                                    style={{
                                        flex: 1,
                                        padding: '6px 8px',
                                        fontSize: '0.75rem',
                                        borderRadius: '4px',
                                        border: 'none',
                                        background:
                                            strategyMode === s.toLowerCase()
                                                ? s === 'Auto'
                                                    ? 'var(--accent-color)'
                                                    : 'var(--border-color)'
                                                : 'transparent',
                                        color:
                                            strategyMode === s.toLowerCase()
                                                ? 'white'
                                                : 'var(--text-secondary)',
                                        fontWeight: s === 'Auto' ? 'bold' : 'normal',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {s === 'Auto' ? '✨ Auto' : s}
                                </button>
                            ))}
                        </div>
                    )}

                    {view === 'idle' && (
                        <Fragment>
                            <label
                                class="analyzer-drop-zone"
                                id="analyzerDropZone"
                                for="analyzerFileInput"
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                            >
                                <div class="drop-zone-content">
                                    <span class="drop-icon">🎵</span>
                                    <p>Drag & drop an audio file here</p>
                                    <p class="drop-subtext">Supports MP3, WAV, M4A, AAC</p>
                                    <input
                                        type="file"
                                        id="analyzerFileInput"
                                        accept="audio/*,.m4a,.aac"
                                        class="sr-only"
                                        onChange={handleFileUpload}
                                    />
                                </div>
                            </label>

                            <div
                                id="liveListenContainer"
                                style="display: flex; gap: 1rem; margin-bottom: 1rem;"
                            >
                                <button
                                    id="liveListenBtn"
                                    class="primary-btn"
                                    onClick={startLiveListen}
                                    style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: var(--green); color: white; border: none;"
                                >
                                    <span>🎤</span> Live Listen
                                </button>
                            </div>
                        </Fragment>
                    )}

                    {view === 'live' && (
                        <div
                            id="liveListenView"
                            class="live-listen-view"
                            style="display: block; text-align: center; padding: 2rem 1rem; background: rgba(0,0,0,0.2); border-radius: 12px; border: 2px solid var(--green);"
                        >
                            <div class="pulse-icon">🎤</div>
                            <div
                                id="liveKeyContainer"
                                style="margin-bottom: 0.5rem; display: flex; justify-content: center; align-items: center; gap: 1rem;"
                            >
                                <span
                                    id="liveKeyLabel"
                                    style="font-size: 1.1rem; color: var(--accent-color); font-weight: bold;"
                                >
                                    Key: {formatUnicodeSymbols(detectedKey)}
                                </span>
                                <label style="font-size: 0.8rem; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; gap: 0.3rem;">
                                    <input
                                        type="checkbox"
                                        checked={forceKey}
                                        onChange={(e) => setForceKey(e.target.checked)}
                                    />{' '}
                                    Lock Key
                                </label>
                            </div>

                            <h2
                                id="liveChordDisplay"
                                style="font-size: 4rem; margin: 0.5rem 0 1rem 0; color: var(--green); text-shadow: 0 0 20px rgba(133, 153, 0, 0.4); min-height: 1.2em;"
                            >
                                {currentStableChord
                                    ? formatUnicodeSymbols(currentStableChord)
                                    : '---'}
                            </h2>

                            <div style="display: flex; justify-content: center; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
                                <button
                                    onClick={addCurrentChord}
                                    class="primary-btn"
                                    style="background: var(--green); color: white; border: none; padding: 0.8rem 2rem; font-size: 1.1rem;"
                                >
                                    Add Chord (Space)
                                </button>
                                <label style="font-size: 0.9rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer;">
                                    <input
                                        type="checkbox"
                                        checked={autoAdd}
                                        onChange={(e) => setAutoAdd(e.target.checked)}
                                    />
                                    <span>Auto-Add</span>
                                </label>
                            </div>

                            <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; text-align: left;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                    <label style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">
                                        Your Progression
                                    </label>
                                    <div style="display: flex; gap: 0.5rem;">
                                        <button
                                            onClick={() =>
                                                setStagedChords((prev) => prev.slice(0, -1))
                                            }
                                            style="font-size: 0.8rem; padding: 0.3rem 0.6rem; background: rgba(255,255,255,0.1); border: none; border-radius: 4px; color: var(--text-color); cursor: pointer;"
                                        >
                                            ⎌ Undo
                                        </button>
                                        <button
                                            onClick={() => setStagedChords([])}
                                            style="font-size: 0.8rem; padding: 0.3rem 0.6rem; background: rgba(255,255,255,0.1); border: none; border-radius: 4px; color: var(--text-color); cursor: pointer;"
                                        >
                                            🗑 Clear
                                        </button>
                                    </div>
                                </div>
                                <div
                                    id="liveStagedDisplay"
                                    style="font-family: monospace; font-size: 1.2rem; color: white; min-height: 1.5em; word-break: break-all; line-height: 1.6;"
                                >
                                    {stagedChords.length > 0 ? (
                                        stagedChords.join('')
                                    ) : (
                                        <span style="color: var(--text-muted); font-style: italic;">
                                            Start playing to build a sequence...
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                                <button
                                    onClick={captureLiveHistory}
                                    class="primary-btn"
                                    style={`flex: 2; background: var(--accent-color); color: white; border: none; ${stagedChords.length === 0 ? 'opacity: 0.5; pointer-events: none;' : ''}`}
                                >
                                    Import Sequence
                                </button>
                                <button
                                    onClick={stopLiveListen}
                                    class="primary-btn"
                                    style="flex: 1; background: var(--error-color); color: white; border: none;"
                                >
                                    Stop
                                </button>
                            </div>
                        </div>
                    )}

                    {view === 'trim' && (
                        <div
                            id="analyzerTrimView"
                            class="analyzer-trim-view"
                            style="display: block;"
                        >
                            <div class="waveform-container">
                                <canvas ref={canvasRef} id="analyzerWaveformCanvas" />
                                <div id="analyzerSelectionOverlay" class="waveform-selection" />
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                                <div class="setting-item">
                                    <label class="setting-label">Start (sec)</label>
                                    <input
                                        type="number"
                                        value={trimRange.start}
                                        min="0"
                                        max={trimRange.end - 1}
                                        step="1"
                                        onInput={(e) =>
                                            setTrimRange((prev) => ({
                                                ...prev,
                                                start: parseInt(e.target.value, 10),
                                            }))
                                        }
                                        style="width: 100%;"
                                    />
                                </div>
                                <div class="setting-item">
                                    <label class="setting-label">End (sec)</label>
                                    <input
                                        type="number"
                                        value={trimRange.end}
                                        min={trimRange.start + 1}
                                        max={Math.floor(audioBuffer?.duration || 0)}
                                        step="1"
                                        onInput={(e) =>
                                            setTrimRange((prev) => ({
                                                ...prev,
                                                end: parseInt(e.target.value, 10),
                                            }))
                                        }
                                        style="width: 100%;"
                                    />
                                </div>
                            </div>
                            <p
                                id="analyzerDurationLabel"
                                style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1rem;"
                            >
                                Duration: {(trimRange.end - trimRange.start).toFixed(1)}s
                            </p>

                            <div style="margin-bottom: 1rem;">
                                <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text-secondary); cursor: pointer;">
                                    <input
                                        type="checkbox"
                                        checked={forceKey}
                                        onChange={(e) => setForceKey(e.target.checked)}
                                    />
                                    <span>Use Arranger Key ({arrangerKey})</span>
                                </label>
                            </div>

                            <button
                                onClick={performAnalysis}
                                class="primary-btn"
                                style="width: 100%;"
                            >
                                Analyze Selection
                            </button>
                        </div>
                    )}

                    {view === 'processing' && (
                        <div
                            id="analyzerProcessing"
                            class="analyzer-processing"
                            style="display: block;"
                        >
                            <div class="spinner" />
                            <p>Ensemble is listening...</p>
                            <div class="progress-bar-container">
                                <div
                                    id="analyzerProgressBar"
                                    class="progress-bar"
                                    style={`width: ${progress}%`}
                                />
                            </div>
                        </div>
                    )}

                    {view === 'results' && analysisData && (
                        <div id="analyzerResults" class="analyzer-results" style="display: block;">
                            <h3>Analysis Complete</h3>
                            <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;">
                                {analysisData.summary}
                            </p>

                            <div id="bpmCandidateContainer" style="margin-bottom: 1.5rem;">
                                <label
                                    class="setting-label"
                                    style="display: block; margin-bottom: 0.5rem;"
                                >
                                    Detected Tempo:
                                </label>
                                <div style="display: flex; gap: 0.5rem; align-items: center;">
                                    <span style="font-size: 1.2rem; font-weight: bold; color: var(--accent-color);">
                                        {analysisData.bpm} BPM
                                    </span>
                                </div>

                                <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
                                    <span style="font-size: 0.85rem;">Sync project BPM</span>
                                    <input type="checkbox" checked={true} />
                                </div>
                            </div>

                            <div class="suggested-sections-container">
                                {analysisData.mode === 'melody' ? (
                                    <div class="harmonizer-options-list">
                                        <label class="setting-label">
                                            Select Harmonization Strategy:
                                        </label>
                                        {analysisData.options.map((opt, idx) => (
                                            <div
                                                key={idx}
                                                class={`harmonizer-option-card ${selectedOptionIdx === idx ? 'active' : ''}`}
                                                onClick={() => setSelectedOptionIdx(idx)}
                                                style={{
                                                    padding: '12px',
                                                    margin: '8px 0',
                                                    borderRadius: '8px',
                                                    background:
                                                        selectedOptionIdx === idx
                                                            ? 'rgba(59, 130, 246, 0.2)'
                                                            : 'rgba(255,255,255,0.05)',
                                                    border: `2px solid ${selectedOptionIdx === idx ? 'var(--accent-color)' : 'transparent'}`,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                                    <div style="flex: 1;">
                                                        <div style="font-weight: bold; font-size: 1rem; color: var(--accent-color);">
                                                            {opt.type}
                                                        </div>
                                                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">
                                                            {opt.description}
                                                        </div>
                                                        <div style="font-family: monospace; font-size: 1.1rem; letter-spacing: 0.05em; color: white;">
                                                            {formatUnicodeSymbols(opt.progression)}
                                                        </div>

                                                        {selectedOptionIdx === idx &&
                                                            opt.chords && (
                                                                <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; flex-wrap: wrap; gap: 4px;">
                                                                    {opt.chords.map((c, cIdx) => (
                                                                        <div
                                                                            key={cIdx}
                                                                            style="text-align: center; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px; min-width: 60px;"
                                                                        >
                                                                            <div style="font-size: 0.6rem; text-transform: uppercase; color: var(--text-muted);">
                                                                                {c.structuralState.slice(
                                                                                    0,
                                                                                    4,
                                                                                )}
                                                                            </div>
                                                                            <div style="font-weight: bold; font-size: 0.85rem;">
                                                                                {formatUnicodeSymbols(
                                                                                    c.roman,
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                    </div>
                                                    {selectedOptionIdx === idx && (
                                                        <div style="color: var(--accent-color); font-size: 1.2rem;">
                                                            ✓
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    analysisData.sections.map((s, idx) => (
                                        <div key={idx} class="section-preview-chip">
                                            <strong>{s.label}:</strong> {s.value}
                                        </div>
                                    ))
                                )}
                            </div>

                            <div
                                class="analyzer-actions"
                                style="margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1rem;"
                            >
                                <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; margin-bottom: 1rem; cursor: pointer;">
                                    <input
                                        type="checkbox"
                                        checked={replaceExisting}
                                        onChange={(e) => setReplaceExisting(e.target.checked)}
                                    />
                                    <span>Replace existing arrangement</span>
                                </label>
                                <button
                                    onClick={importResults}
                                    class="primary-btn"
                                    style="width: 100%;"
                                >
                                    Import Arrangement
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function getModeStyle(isActive) {
    return {
        flex: 1,
        textAlign: 'center',
        padding: '10px',
        cursor: 'pointer',
        borderRadius: '6px',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        background: isActive ? 'var(--accent-color)' : 'transparent',
        color: isActive ? 'white' : 'var(--text-secondary)',
        boxShadow: isActive ? '0 2px 4px rgba(0,0,0,0.2)' : 'none',
    };
}
