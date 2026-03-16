import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { TIME_SIGNATURES } from '../config.js';
import { getVisualTime } from '../engine/engine.js';
import { switchMeasure } from '../instrument-controller.js';
import { dispatch, getState, stateMap } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { getStepsPerMeasure } from '../utils.js';
import { UnifiedVisualizer } from '../visualizer.js';

let lastFrameTime = 0;
let missedFrames = 0;
let vizCrashCount = 0;

export function Visualizer({ enabled }) {
    const containerRef = useRef(null);
    const vizRef = useRef(null);
    const loopRef = useRef(null);
    const prevPlayingRef = useRef(false);

    const { isPlaying, theme } = useEnsembleState((s) => ({
        isPlaying: s.playback.isPlaying,
        theme: s.playback.theme,
    }));

    // Initialize visualizer
    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        const viz = new UnifiedVisualizer('unifiedVizContainer');
        viz.addTrack('bass', 'var(--success-color)');
        viz.addTrack('soloist', 'var(--soloist-color)');
        viz.addTrack('harmony', 'var(--harmony-color)');
        viz.addTrack('drums', 'var(--text-color)');

        vizRef.current = viz;

        return () => {
            if (vizRef.current) {
                vizRef.current.destroy();
                vizRef.current = null;
            }
        };
    }, []); // Only run once on mount

    // Handle render loop
    useEffect(() => {
        if (!vizRef.current || !enabled) {
            return;
        }

        const loop = () => {
            const state = getState();
            const { playback, groove, chords, bass, soloist, harmony, arranger } = state;

            if (!playback.isDrawing) {
                loopRef.current = requestAnimationFrame(loop);
                return;
            }

            // --- Performance Resilience Monitoring ---
            const nowFrame = performance.now();
            if (lastFrameTime > 0) {
                const delta = nowFrame - lastFrameTime;
                if (delta > 35) {
                    // Missed at least 2 frames (at 60fps)
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

            if (!playback.audio) {
                playback.isDrawing = false; // @direct-mutation
                loopRef.current = requestAnimationFrame(loop);
                return;
            }
            if (!playback.isPlaying && playback.drawQueue.length === 0) {
                playback.isDrawing = false; // @direct-mutation
                if (chords.lastActiveChordIndex !== null) {
                    chords.lastActiveChordIndex = null; // @direct-mutation
                    dispatch('VIS_RESET');
                }
                if (vizRef.current) {
                    vizRef.current.clear();
                }
                loopRef.current = requestAnimationFrame(loop);
                return;
            }
            const now = getVisualTime(stateMap);
            while (playback.drawQueue.length > 0 && playback.drawQueue[0].time < now - 2.0) {
                playback.drawQueue.shift();
            }
            if (playback.drawQueue.length > 300) {
                playback.drawQueue = playback.drawQueue.slice(playback.drawQueue.length - 200); // @direct-mutation
            }
            const spm = getStepsPerMeasure(arranger.timeSignature);
            while (playback.drawQueue.length && playback.drawQueue[0].time <= now) {
                const ev = playback.drawQueue.shift();
                if (ev.type === 'drum_vis') {
                    const stepMeasure = Math.floor(ev.step / spm);
                    if (
                        groove.followPlayback &&
                        stepMeasure !== groove.currentMeasure &&
                        playback.isPlaying
                    ) {
                        switchMeasure(stepMeasure, true);
                    }
                    playback.lastPlayingStep = ev.step; // @direct-mutation
                } else if (ev.type === 'chord_vis') {
                    if (chords.lastActiveChordIndex !== ev.index) {
                        chords.lastActiveChordIndex = ev.index; // @direct-mutation
                        dispatch('VIS_UPDATE', { type: 'chord', index: ev.index });
                    }
                    if (vizRef.current && enabled && playback.isDrawing) {
                        ev.notes = ev.chordNotes;
                        vizRef.current.pushChord(ev);
                    }
                } else if (ev.type === 'bass_vis') {
                    if (vizRef.current && enabled && playback.isDrawing) {
                        ev.noteName = ev.name;
                        vizRef.current.pushNote('bass', ev);
                    }
                } else if (ev.type === 'soloist_vis') {
                    if (vizRef.current && enabled && playback.isDrawing) {
                        vizRef.current.truncateNotes('soloist', ev.time);
                        ev.noteName = ev.name;
                        vizRef.current.pushNote('soloist', ev);
                    }
                } else if (ev.type === 'harmony_vis') {
                    if (vizRef.current && enabled && playback.isDrawing) {
                        ev.noteName = ev.name;
                        vizRef.current.pushNote('harmony', ev);
                    }
                } else if (ev.type === 'drums_vis') {
                    if (vizRef.current && enabled && playback.isDrawing) {
                        vizRef.current.pushNote('drums', ev);
                    }
                } else if (ev.type === 'fill_active') {
                    if (vizRef.current && enabled && playback.isDrawing) {
                        vizRef.current.isFillActive = ev.active;
                    }
                }
            }
            if (vizRef.current && enabled && playback.isDrawing) {
                try {
                    vizRef.current.setRegister('bass', bass.octave);
                    vizRef.current.setRegister('soloist', soloist.octave);
                    vizRef.current.setRegister('chords', chords.octave);
                    vizRef.current.setRegister('harmony', harmony.octave);
                    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
                    vizRef.current.render(now, playback.bpm, ts);
                    vizCrashCount = 0;
                } catch (e) {
                    console.error('[Visualizer Error]', e);
                    vizCrashCount++;
                    if (vizCrashCount > 3) {
                        console.warn('Visualizer disabled due to repeated errors.');
                        dispatch(ACTIONS.SET_VIZ_ENABLED, false);
                        vizCrashCount = 0;
                    }
                }
            }

            loopRef.current = requestAnimationFrame(loop);
        };

        // Ensure state is updated before starting the loop
        if (isPlaying && !prevPlayingRef.current) {
            const state = getState();
            state.playback.isDrawing = true; // @direct-mutation
            if (vizRef.current) {
                const { playback, arranger } = state;
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
    }, [enabled, isPlaying]);

    // Apply theme
    useEffect(() => {
        if (vizRef.current && theme) {
            // Visualizer automatically inherits CSS variables set by the body theme handler
            // Force a clear to update colors immediately if stopped
            if (!isPlaying) {
                vizRef.current.clear();
            }
        }
    }, [theme, isPlaying]);

    // Cleanup and visual clear on disable or stop
    useEffect(() => {
        if (!enabled || !isPlaying) {
            if (vizRef.current) {
                vizRef.current.clear();
            }
        }
    }, [enabled, isPlaying]);

    return <div id="unifiedVizContainer" ref={containerRef} />;
}
