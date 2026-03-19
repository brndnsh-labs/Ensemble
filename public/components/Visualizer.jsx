import { h } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { TIME_SIGNATURES } from '../config.js';
import { switchMeasure } from '../instrument-controller.js';
import { dispatch, getState, stateMap } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { getStepsPerMeasure } from '../utils.js';
import { UnifiedVisualizer } from '../visualizer-proxy.js';

let lastFrameTime = 0;
let missedFrames = 0;

/**
 * @typedef {Object} VisualizerProps
 * @property {boolean} enabled - Whether the visualizer is enabled.
 * @property {function(import('../state.js').StateMap): number} getVisualTime - Callback to get current visual time.
 */

/**
 * @param {VisualizerProps} props
 */
export function Visualizer({ enabled, getVisualTime }) {
    /** @type {import('preact').RefObject<HTMLDivElement>} */
    const containerRef = useRef(null);
    /** @type {import('preact').RefObject<HTMLCanvasElement>} */
    const canvasRef = useRef(null);
    /** @type {import('preact').RefObject<HTMLCanvasElement>} */
    const staticCanvasRef = useRef(null);
    /** @type {import('preact').RefObject<import('../visualizer-proxy.js').UnifiedVisualizer|null>} */
    const vizRef = useRef(null);
    /** @type {import('preact').RefObject<number|null>} */
    const loopRef = useRef(null);
    const prevPlayingRef = useRef(false);

    const { isPlaying, theme, bpm, timeSignature } = useEnsembleState(
        /** @param {import('../types.js').EnsembleState} s */
        (s) => ({
            isPlaying: s.playback.isPlaying,
            theme: s.playback.theme,
            bpm: s.playback.bpm,
            timeSignature: s.arranger.timeSignature,
        }),
    );

    // Initialize visualizer with OffscreenCanvas
    useLayoutEffect(() => {
        if (!canvasRef.current || !staticCanvasRef.current) {
            return;
        }

        const viz = new UnifiedVisualizer(canvasRef.current, staticCanvasRef.current);
        const style = getComputedStyle(document.documentElement);

        const resolve = (/** @type {any} */ v, /** @type {any} */ fallback) =>
            style.getPropertyValue(v).trim() || fallback;

        viz.addTrack('bass', 'var(--success-color)', resolve('--success-color', '#22c55e'));
        viz.addTrack('soloist', 'var(--soloist-color)', resolve('--soloist-color', '#3b82f6'));
        viz.addTrack('harmony', 'var(--harmony-color)', resolve('--harmony-color', '#a855f7'));
        viz.addTrack('drums', 'var(--text-color)', resolve('--text-color', '#64748b'));

        vizRef.current = viz;

        // Initial Resize
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            viz.resize(rect.width, rect.height, window.devicePixelRatio || 1);
        }

        // Initial Theme
        if (vizRef.current) {
            updateTheme(vizRef.current);
        }

        return () => {
            if (vizRef.current) {
                vizRef.current.destroy();
                vizRef.current = null;
            }
        };
    }, []);

    // Handle resizing
    useEffect(() => {
        if (!containerRef.current || !vizRef.current) {
            return;
        }

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0 && vizRef.current) {
                    vizRef.current.resize(width, height, window.devicePixelRatio || 1);
                }
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Helper to extract theme colors for the worker
    /** @param {import('../visualizer-proxy.js').UnifiedVisualizer|null} viz */
    const updateTheme = (viz) => {
        if (!viz) {
            return;
        }
        const style = getComputedStyle(document.documentElement);
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        /** @type {Record<string, string|string[]>} */
        const themeCache = {
            bgColor: isDark ? '#0f172a' : '#f8fafc',
            keyWhite: isDark ? '#cbd5e1' : '#ffffff',
            keyBlack: isDark ? '#1e293b' : '#1e293b',
            keySeparator: isDark ? '#334155' : '#e2e8f0',
            gridColorMeasure: isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(2, 132, 199, 0.3)',
            gridColorBeat: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            playheadColor: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
            outlineColor: isDark ? '#000' : '#fff',
            labelColor: isDark ? '#64748b' : '#94a3b8',
            guideLineBlack: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
            guideLineWhite: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)',
            separatorColor: isDark ? '#334155' : '#cbd5e1',
            chordColors: [
                style.getPropertyValue('--blue').trim() || '#268bd2',
                style.getPropertyValue('--green').trim() || '#859900',
                style.getPropertyValue('--orange').trim() || '#cb4b16',
                style.getPropertyValue('--magenta').trim() || '#d33682',
            ],
        };
        viz.setTheme(themeCache);
    };

    // Apply theme changes
    useEffect(() => {
        updateTheme(vizRef.current);
    }, [theme]);

    // Sync playing state to worker
    useEffect(() => {
        if (vizRef.current) {
            vizRef.current.setPlaying(isPlaying);
        }
    }, [isPlaying]);

    // Update worker loop parameters
    useEffect(() => {
        if (vizRef.current) {
            /** @type {any} */
            const signatures = TIME_SIGNATURES;
            const ts = signatures[timeSignature] || signatures['4/4'];
            vizRef.current.render(0, bpm, ts); // Note: 0 is ignored by worker loop, but triggers param update
        }
    }, [bpm, timeSignature]);

    // Handle render loop (Data Forwarding Only)
    useEffect(() => {
        if (!vizRef.current) {
            return;
        }

        const loop = () => {
            const state = getState();
            const { playback, groove, chords, bass, soloist, harmony, arranger } = state;

            if (!playback.isDrawing) {
                loopRef.current = requestAnimationFrame(loop);
                return;
            }

            const nowFrame = performance.now();
            if (lastFrameTime > 0) {
                const delta = nowFrame - lastFrameTime;
                if (delta > 35) {
                    missedFrames++;
                    if (missedFrames > 15) {
                        dispatch(ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD);
                        missedFrames = 0;
                    }
                } else if (delta < 20) {
                    missedFrames = Math.max(0, missedFrames - 1);
                }
            }
            lastFrameTime = nowFrame;

            if (!playback.audio || !playback.audio.currentTime) {
                if (!playback.isPlaying) {
                    playback.isDrawing = false; // @direct-mutation
                }
                loopRef.current = requestAnimationFrame(loop);
                return;
            }

            // Sync clock periodically or every frame for high precision
            // Apply visual offset to worker clock as well for perfect sync
            /** @type {import('../state.js').StateMap} */
            const typedStateMap = stateMap;
            const now = getVisualTime(typedStateMap);
            if (enabled && vizRef.current) {
                vizRef.current.syncClock(now, performance.now());
            }

            if (!playback.isPlaying && playback.drawQueue.length === 0) {
                playback.isDrawing = false; // @direct-mutation
                if (chords.lastActiveChordIndex !== null) {
                    chords.lastActiveChordIndex = null; // @direct-mutation
                    dispatch('VIS_RESET');
                }
                if (enabled && vizRef.current) {
                    vizRef.current.clear();
                }
                loopRef.current = requestAnimationFrame(loop);
                return;
            }

            while (
                playback.drawQueue.length > 0 &&
                /** @type {any} */ (playback.drawQueue[0]).time < now - 2.0
            ) {
                playback.drawQueue.shift(); // @direct-mutation
            }
            if (playback.drawQueue.length > 300) {
                playback.drawQueue = playback.drawQueue.slice(playback.drawQueue.length - 200); // @direct-mutation
            }
            const spm = getStepsPerMeasure(arranger.timeSignature);

            while (
                playback.drawQueue.length &&
                /** @type {any} */ (playback.drawQueue[0]).time <= now
            ) {
                /** @type {any} */
                const ev = playback.drawQueue.shift(); // @direct-mutation
                if (!ev) {
                    continue;
                }

                if (ev.type === 'drum_vis') {
                    const stepMeasure = Math.floor(ev.step / spm);
                    if (
                        groove.followPlayback &&
                        stepMeasure !== groove.currentMeasure &&
                        playback.isPlaying
                    ) {
                        // @ts-expect-error second arg isn't actually typed in instrument-controller
                        switchMeasure(stepMeasure, true);
                    }
                    playback.lastPlayingStep = ev.step; // @direct-mutation
                } else if (ev.type === 'chord_vis') {
                    if (chords.lastActiveChordIndex !== ev.index) {
                        chords.lastActiveChordIndex = ev.index; // @direct-mutation
                        dispatch('VIS_UPDATE', { type: 'chord', index: ev.index });
                    }
                    if (enabled && playback.isDrawing && vizRef.current) {
                        ev.notes = ev.chordNotes;
                        vizRef.current.pushChord(ev);
                    }
                } else if (ev.type === 'bass_vis') {
                    if (enabled && playback.isDrawing && vizRef.current) {
                        ev.noteName = ev.name;
                        vizRef.current.pushNote('bass', ev);
                    }
                } else if (ev.type === 'soloist_vis') {
                    if (enabled && playback.isDrawing && vizRef.current) {
                        vizRef.current.truncateNotes('soloist', ev.time);
                        ev.noteName = ev.name;
                        vizRef.current.pushNote('soloist', ev);
                    }
                } else if (ev.type === 'harmony_vis') {
                    if (enabled && playback.isDrawing && vizRef.current) {
                        ev.noteName = ev.name;
                        vizRef.current.pushNote('harmony', ev);
                    }
                } else if (ev.type === 'drums_vis') {
                    if (enabled && playback.isDrawing && vizRef.current) {
                        vizRef.current.pushNote('drums', ev);
                    }
                } else if (ev.type === 'fill_active') {
                    if (
                        enabled &&
                        playback.isDrawing &&
                        /** @type {any} */ (vizRef.current)?.worker
                    ) {
                        /** @type {any} */ (vizRef.current).worker.postMessage({
                            type: 'SET_FILL',
                            active: ev.active,
                        });
                    }
                }
            }

            if (enabled && playback.isDrawing && vizRef.current) {
                vizRef.current.setRegister('bass', bass.octave);
                vizRef.current.setRegister('soloist', soloist.octave);
                vizRef.current.setRegister('chords', chords.octave);
                vizRef.current.setRegister('harmony', harmony.octave);
            }

            loopRef.current = requestAnimationFrame(loop);
        };

        if (isPlaying) {
            /** @type {import('../state.js').StateMap} */
            const typedStateMap2 = stateMap;
            typedStateMap2.playback.isDrawing = true; // @direct-mutation
            if (enabled) {
                const { playback, arranger } = typedStateMap2;
                const secondsPerBeat = 60.0 / playback.bpm;
                const sixteenth = 0.25 * secondsPerBeat;
                const stepsPerMeasure = getStepsPerMeasure(arranger.timeSignature);
                const measureTime =
                    playback.unswungNextNoteTime - (playback.step % stepsPerMeasure) * sixteenth;
                vizRef.current.setBeatReference(measureTime);
            }
        }

        prevPlayingRef.current = isPlaying;
        loopRef.current = requestAnimationFrame(loop);

        return () => {
            if (loopRef.current) {
                cancelAnimationFrame(loopRef.current);
                loopRef.current = null;
            }
        };
    }, [isPlaying, enabled]);

    // Cleanup and visual clear on disable or stop
    useEffect(() => {
        if (!enabled || !isPlaying) {
            if (vizRef.current) {
                vizRef.current.clear();
            }
        }
    }, [enabled, isPlaying]);

    return (
        <div
            id="unifiedVizContainer"
            ref={containerRef}
            style={{ position: 'relative', width: '100%', height: '100%' }}
        >
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
            <canvas ref={staticCanvasRef} style={{ display: 'none' }} />
        </div>
    );
}
