import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { resolveMode } from '../controllers/app-controller.js';
import { switchMeasure } from '../controllers/instrument-controller.js';
import { getEffectiveMeterAtStep, getEffectiveTimeSignature } from '../meter.js';
import { dispatch, getState, stateMap } from '../state.js';
import type { EnsembleState } from '../types.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import type { VisualizerQueuedEvent } from '../visualizer/visualizer-events.js';
import {
    resolveVisualizerTrack,
    VISUALIZER_CHORD_SWATCHES,
    VISUALIZER_TRACK_ORDER,
    VISUALIZER_TRACKS,
} from '../visualizer/visualizer-events.js';
import { UnifiedVisualizer } from '../visualizer/visualizer-proxy.js';

let lastFrameTime = 0;
let missedFrames = 0;
const STALE_DRAW_QUEUE_WINDOW_SECONDS = 2.0;
const MAX_DRAW_QUEUE_EVENTS = 300;
const RETAINED_DRAW_QUEUE_EVENTS = 200;

/**
 * Partitions the visual event queue into due events for this frame and the remaining backlog.
 * Old events are dropped in a single batch so Visuals startup never replays a long stale queue.
 */
export function partitionDrawQueue(
    drawQueue: VisualizerQueuedEvent[],
    now: number,
): { readyEvents: VisualizerQueuedEvent[]; remainingEvents: VisualizerQueuedEvent[] } {
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

interface VisualizerProps {
    enabled: boolean;
    getVisualTime: (stateMap: EnsembleState) => number;
}

/** Resolve the visual grid config and its audio-time measure origin for one step. */
export function getVisualizerMeterFrame(
    arranger: EnsembleState['arranger'],
    step: number,
    eventTime: number,
    bpm: number,
) {
    const { stepInfo, ts } = getEffectiveMeterAtStep(arranger, step);
    const secondsPerStep = 60 / bpm / 4;
    return {
        key: `${stepInfo.tsName || arranger.timeSignature}:${ts.grouping.join('+')}`,
        ts,
        referenceTime: eventTime - stepInfo.mStep * secondsPerStep,
    };
}

export function Visualizer({ enabled, getVisualTime }: VisualizerProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const vizRef = useRef<UnifiedVisualizer | null>(null);
    const loopRef = useRef<number | null>(null);
    const prevPlayingRef = useRef(false);
    const meterCacheRef = useRef<string | null>(null);
    /**
     * #1009 — last MIDI register transmitted per lane. The drawing frame used to
     * post all four SET_REGISTER messages every rAF (~240 redundant cross-thread
     * messages/sec at 60fps); now each lane sends once on change only.
     */
    const registerCacheRef = useRef<Record<string, number> | null>(null);

    const syncRegisters = (state: EnsembleState) => {
        const viz = vizRef.current;
        if (!viz) {
            return;
        }
        if (!registerCacheRef.current) {
            registerCacheRef.current = {};
        }
        const cache = registerCacheRef.current;
        const lanes: [string, number][] = [
            ['bass', state.bass.octave],
            ['soloist', state.soloist.octave],
            ['chords', state.chords.octave],
            ['harmony', state.harmony.octave],
        ];
        for (const [lane, octave] of lanes) {
            if (cache[lane] !== octave) {
                cache[lane] = octave;
                viz.setRegister(lane, octave);
            }
        }
    };

    const { isPlaying, palette, mode, bpm, timeSignature, grouping } = useEnsembleState((s) => ({
        isPlaying: s.playback.isPlaying,
        palette: s.playback.palette,
        mode: s.playback.mode,
        bpm: s.playback.bpm,
        timeSignature: s.arranger.timeSignature,
        grouping: s.arranger.grouping,
    }));

    useLayoutEffect(() => {
        if (!canvasRef.current || !staticCanvasRef.current) {
            return;
        }

        const viz = new UnifiedVisualizer(canvasRef.current, staticCanvasRef.current);
        const style = getComputedStyle(document.documentElement);

        const resolve = (v: string, fallback: string) =>
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

        // #1009 — a fresh visualizer starts with the four current registers
        // (the cache is seeded with them, so subsequent frames stay silent
        // until an octave actually changes).
        const initialState = getState();
        registerCacheRef.current = {};
        syncRegisters(initialState);

        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            viz.resize(rect.width, rect.height, window.devicePixelRatio || 1);
        }

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

    useEffect(() => {
        // #540 — honor prefers-reduced-motion in the canvas pipeline. CSS gates UI
        // animation but cannot pause the OffscreenCanvas rAF loop, so a reduced-motion
        // user opening the 🌈 overlay would still get continuous scrolling (the
        // vestibular trigger). Like the prefers-color-scheme listener, push the
        // preference into the worker (event-stepped render) and re-respond live when
        // the OS toggle flips. Decision (/unblock 2026-06-18): event-stepped.
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        vizRef.current?.setReducedMotion(mediaQuery.matches);
        const onChange = (e: MediaQueryListEvent) => vizRef.current?.setReducedMotion(e.matches);
        mediaQuery.addEventListener('change', onChange);
        return () => mediaQuery.removeEventListener('change', onChange);
    }, []);

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

    const updateTheme = (viz: UnifiedVisualizer | null) => {
        if (!viz) {
            return;
        }
        const style = getComputedStyle(document.documentElement);
        const isDark = resolveMode(mode) === 'dark';
        const resolve = (prop: string, fallback: string) =>
            style.getPropertyValue(prop).trim() || fallback;

        const themeCache: Record<string, string | string[]> = {
            bgColor: resolve('--surface-sunken', isDark ? '#14110d' : '#f6efe1'),
            labelRailBg: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(226, 232, 240, 0.92)',
            laneBg: isDark ? 'rgba(255, 255, 255, 0.025)' : 'rgba(255, 255, 255, 0.82)',
            laneAltBg: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(226, 232, 240, 0.72)',
            keyWhite: isDark ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
            keyBlack: isDark ? 'rgba(15, 23, 42, 0.72)' : 'rgba(148, 163, 184, 0.42)',
            keySeparator: resolve('--border-color', isDark ? '#334155' : '#e2e8f0'),
            gridColorMeasure: isDark ? 'rgba(217, 164, 65, 0.34)' : 'rgba(176, 125, 31, 0.3)',
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
            fillGradientTop: 'rgba(224, 86, 143, 0)',
            fillGradientMid: isDark ? 'rgba(224, 86, 143, 0.18)' : 'rgba(176, 36, 104, 0.12)',
            fillGradientBottom: 'rgba(224, 86, 143, 0)',
            // Single source of truth with the legend (VisualizerOverlay reads
            // the same constant) so renderer + legend can't drift.
            chordColors: VISUALIZER_CHORD_SWATCHES.map((s) => resolve(s.cssVar, s.fallback)),
        };
        viz.setTheme(themeCache);
    };

    useEffect(() => {
        // The canvas reads its colors through JS (getComputedStyle + the resolved
        // isDark), so unlike the CSS-driven UI it won't re-theme on its own. Mirror
        // App.tsx: while mode is 'auto', re-run on OS light/dark flips so an open
        // overlay re-themes live.
        updateTheme(vizRef.current);

        if (mode === 'auto') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const onChange = () => updateTheme(vizRef.current);
            mediaQuery.addEventListener('change', onChange);
            return () => mediaQuery.removeEventListener('change', onChange);
        }
    }, [palette, mode]);

    useEffect(() => {
        if (vizRef.current) {
            vizRef.current.setPlaying(isPlaying);
        }
    }, [isPlaying]);

    useEffect(() => {
        if (vizRef.current) {
            const ts = getEffectiveTimeSignature(timeSignature, grouping);
            vizRef.current.render(0, bpm, ts);
            meterCacheRef.current = null;
        }
    }, [bpm, grouping, timeSignature]);

    useEffect(() => {
        if (!vizRef.current) {
            return;
        }

        const loop = () => {
            const state = getState();
            const { playback, groove, chords, arranger } = state;

            if (!playback.isDrawing) {
                // #1008 — nothing left to draw; stop scheduling instead of spinning.
                loopRef.current = null;
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
                    // #1008 — paused with no audio clock: settle and stop.
                    loopRef.current = null;
                    return;
                }
                // Still starting up — keep waiting for the audio clock.
                loopRef.current = requestAnimationFrame(loop);
                return;
            }

            const typedStateMap: EnsembleState = stateMap;
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
                    dispatch(ACTIONS.VIS_RESET);
                }
                if (enabled && vizRef.current) {
                    vizRef.current.clear();
                }
                // #1008 — drain complete: final frame painted, state settled, stop.
                loopRef.current = null;
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
            for (const ev of readyEvents) {
                if (!ev) {
                    continue;
                }

                if (ev.type === 'step') {
                    const meterFrame = getVisualizerMeterFrame(
                        arranger,
                        ev.chartStep,
                        ev.time,
                        bpm,
                    );
                    if (meterCacheRef.current !== meterFrame.key && vizRef.current) {
                        meterCacheRef.current = meterFrame.key;
                        vizRef.current.setBeatReference(meterFrame.referenceTime);
                        vizRef.current.render(now, bpm, meterFrame.ts);
                    }
                    const localStepsPerMeasure = meterFrame.ts.beats * meterFrame.ts.stepsPerBeat;
                    const stepMeasure = Math.floor(ev.step / localStepsPerMeasure);
                    // #1181: `groove.followPlayback` gated this and was removed — it had
                    // been persisted and hydrated but no control could set it since the
                    // chart-first migration, so the false branch was unreachable and the
                    // pinned-measure behavior is the only one anyone has seen. Inlined
                    // as always-on rather than resurrecting a hidden toggle.
                    if (stepMeasure !== groove.currentMeasure && playback.isPlaying) {
                        switchMeasure(stepMeasure);
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
                        dispatch(ACTIONS.VIS_UPDATE, { type: 'chord', index: ev.index });
                    }
                    if (enabled && playback.isDrawing && vizRef.current) {
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
                    if (enabled && playback.isDrawing) {
                        vizRef.current?.setFill(ev.active);
                    }
                }
            }

            if (enabled && playback.isDrawing && vizRef.current) {
                syncRegisters(state);
            }

            loopRef.current = requestAnimationFrame(loop);
        };

        if (isPlaying) {
            const typedStateMap2: EnsembleState = stateMap;
            dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'isDrawing', value: true });
            if (enabled) {
                const { playback, arranger } = typedStateMap2;
                const meterFrame = getVisualizerMeterFrame(
                    arranger,
                    playback.step,
                    playback.unswungNextNoteTime,
                    playback.bpm,
                );
                meterCacheRef.current = meterFrame.key;
                vizRef.current!.setBeatReference(meterFrame.referenceTime);
                vizRef.current!.render(getVisualTime(typedStateMap2), playback.bpm, meterFrame.ts);
            }
        }

        prevPlayingRef.current = isPlaying;
        // #1008 — a fresh draw session starts the frame clock over: a stale
        // lastFrameTime from before an idle pause would read as one huge frame
        // delta and spuriously escalate to emergency lookahead on resume.
        lastFrameTime = 0;
        missedFrames = 0;
        if (isPlaying) {
            loopRef.current = requestAnimationFrame(loop);
        } else {
            // Paused (or pause transition): schedule only a final drain pass if a
            // draw session is still open — the loop stops itself once it settles.
            const { playback: pausedPlayback } = getState();
            if (pausedPlayback.isDrawing) {
                loopRef.current = requestAnimationFrame(loop);
            }
        }

        return () => {
            if (loopRef.current) {
                cancelAnimationFrame(loopRef.current);
                loopRef.current = null;
            }
        };
    }, [isPlaying, enabled]);

    useEffect(() => {
        if (!enabled || !isPlaying) {
            if (vizRef.current) {
                vizRef.current.clear();
            }
        }
    }, [enabled, isPlaying]);

    return (
        <div id="unifiedVizContainer" ref={containerRef}>
            <canvas
                ref={canvasRef}
                role="img"
                aria-label="Live note visualization — see legend below for instrument and chord-tone colors"
            />
            <canvas ref={staticCanvasRef} hidden />
        </div>
    );
}
