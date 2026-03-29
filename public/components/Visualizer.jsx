import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { TIME_SIGNATURES } from '../config.js';
import { switchMeasure } from '../instrument-controller.js';
import { dispatch, getState, stateMap } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { getStepsPerMeasure } from '../utils.js';
import {
    resolveVisualizerTrack,
    VISUALIZER_TRACK_ORDER,
    VISUALIZER_TRACKS,
} from '../visualizer-events.js';
import { UnifiedVisualizer } from '../visualizer-proxy.js';

let lastFrameTime = 0;
let missedFrames = 0;
const STALE_DRAW_QUEUE_WINDOW_SECONDS = 2.0;
const MAX_DRAW_QUEUE_EVENTS = 300;
const RETAINED_DRAW_QUEUE_EVENTS = 200;

/**
 * Partitions the visual event queue into due events for this frame and the remaining backlog.
 * Old events are dropped in a single batch so Visuals startup never replays a long stale queue.
 *
 * @param {Array<{time?: number}>} drawQueue
 * @param {number} now
 * @returns {{ readyEvents: Array<any>, remainingEvents: Array<any> }}
 */
export function partitionDrawQueue(drawQueue, now) {
    let startIndex = 0;

    while (startIndex < drawQueue.length) {
        const event = drawQueue[startIndex];
        if (!event || typeof event.time !== 'number') {
            break;
        }
        if (event.time >= now - STALE_DRAW_QUEUE_WINDOW_SECONDS) {
            break;
        }
        startIndex++;
    }

    if (drawQueue.length - startIndex > MAX_DRAW_QUEUE_EVENTS) {
        startIndex = Math.max(startIndex, drawQueue.length - RETAINED_DRAW_QUEUE_EVENTS);
    }

    let readyEndIndex = startIndex;
    while (readyEndIndex < drawQueue.length) {
        const event = drawQueue[readyEndIndex];
        if (!event || typeof event.time !== 'number' || event.time > now) {
            break;
        }
        readyEndIndex++;
    }

    if (startIndex === 0 && readyEndIndex === 0) {
        return { readyEvents: [], remainingEvents: drawQueue };
    }

    return {
        readyEvents: drawQueue.slice(startIndex, readyEndIndex),
        remainingEvents: drawQueue.slice(readyEndIndex),
    };
}

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

        const resolve = (/** @type {string} */ v, /** @type {string} */ fallback) =>
            style.getPropertyValue(v).trim() || fallback;

        for (const trackId of VISUALIZER_TRACK_ORDER) {
            const trackMeta = VISUALIZER_TRACKS[trackId];
            viz.addTrack(
                trackId,
                `var(${trackMeta.cssVar})`,
                resolve(trackMeta.cssVar, trackMeta.fallback),
                trackMeta.label,
            );
        }

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
        const resolve = (/** @type {string} */ prop, /** @type {string} */ fallback) =>
            style.getPropertyValue(prop).trim() || fallback;

        /** @type {Record<string, string|string[]>} */
        const themeCache = {
            bgColor: resolve('--surface-sunken', isDark ? '#0f172a' : '#f8fafc'),
            labelRailBg: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(226, 232, 240, 0.92)',
            laneBg: isDark ? 'rgba(255, 255, 255, 0.025)' : 'rgba(255, 255, 255, 0.82)',
            laneAltBg: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(226, 232, 240, 0.72)',
            keyWhite: isDark ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
            keyBlack: isDark ? 'rgba(15, 23, 42, 0.72)' : 'rgba(148, 163, 184, 0.42)',
            keySeparator: resolve('--border-color', isDark ? '#334155' : '#e2e8f0'),
            gridColorMeasure: isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(2, 132, 199, 0.3)',
            gridColorBeat: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
            playheadColor: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
            outlineColor: isDark ? 'rgba(0, 0, 0, 0.85)' : '#ffffff',
            labelColor: resolve('--text-muted', isDark ? '#64748b' : '#94a3b8'),
            trackLabelColor: resolve('--text-color', isDark ? '#e2e8f0' : '#0f172a'),
            noteLabelColor: resolve('--text-muted', isDark ? '#cbd5e1' : '#334155'),
            guideLineBlack: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
            guideLineWhite: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)',
            laneGuideColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)',
            separatorColor: resolve('--border-color', isDark ? '#334155' : '#cbd5e1'),
            chordMarkerColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.14)',
            fillGradientTop: 'rgba(211, 54, 130, 0)',
            fillGradientMid: isDark ? 'rgba(211, 54, 130, 0.18)' : 'rgba(211, 54, 130, 0.12)',
            fillGradientBottom: 'rgba(211, 54, 130, 0)',
            chordColors: [
                resolve('--accent-color', '#268bd2'),
                resolve('--green', '#859900'),
                resolve('--orange', '#cb4b16'),
                resolve('--magenta', '#d33682'),
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

            if (!playback.audio?.currentTime) {
                if (!playback.isPlaying) {
                    dispatch(ACTIONS.SET_PARAM, {
                        module: 'playback',
                        param: 'isDrawing',
                        value: false,
                    });
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
                dispatch(ACTIONS.SET_PARAM, {
                    module: 'playback',
                    param: 'isDrawing',
                    value: false,
                });
                if (chords.lastActiveChordIndex !== null) {
                    dispatch(ACTIONS.SET_PARAM, {
                        module: 'chords',
                        param: 'lastActiveChordIndex',
                        value: null,
                    });
                    dispatch('VIS_RESET');
                }
                if (enabled && vizRef.current) {
                    vizRef.current.clear();
                }
                loopRef.current = requestAnimationFrame(loop);
                return;
            }

            const { readyEvents, remainingEvents } = partitionDrawQueue(playback.drawQueue, now);
            if (remainingEvents !== playback.drawQueue) {
                dispatch(ACTIONS.SET_PARAM, {
                    module: 'playback',
                    param: 'drawQueue',
                    value: remainingEvents,
                });
            }
            const spm = getStepsPerMeasure(arranger.timeSignature);

            for (const ev of readyEvents) {
                if (!ev) {
                    continue;
                }

                if (ev.type === 'step') {
                    const stepMeasure = Math.floor(ev.step / spm);
                    if (
                        groove.followPlayback &&
                        stepMeasure !== groove.currentMeasure &&
                        playback.isPlaying
                    ) {
                        // @ts-expect-error second arg isn't actually typed in instrument-controller
                        switchMeasure(stepMeasure, true);
                    }
                    dispatch(ACTIONS.SET_PARAM, {
                        module: 'playback',
                        param: 'lastPlayingStep',
                        value: ev.step,
                    });
                } else if (ev.type === 'chord') {
                    if (chords.lastActiveChordIndex !== ev.index) {
                        dispatch(ACTIONS.SET_PARAM, {
                            module: 'chords',
                            param: 'lastActiveChordIndex',
                            value: ev.index,
                        });
                        dispatch('VIS_UPDATE', { type: 'chord', index: ev.index });
                    }
                    if (enabled && playback.isDrawing && vizRef.current) {
                        ev.notes = ev.chordNotes;
                        vizRef.current.pushChord(ev);
                    }
                } else if (ev.type === 'note') {
                    if (enabled && playback.isDrawing && vizRef.current) {
                        const trackId = resolveVisualizerTrack(ev.track);
                        if (!trackId) {
                            continue;
                        }
                        if (trackId === 'soloist') {
                            vizRef.current.truncateNotes(trackId, ev.time);
                        }
                        vizRef.current.pushNote(trackId, ev);
                    }
                } else if (ev.type === 'fill') {
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
            dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'isDrawing', value: true });
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
