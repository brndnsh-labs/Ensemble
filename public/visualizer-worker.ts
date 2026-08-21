/// <reference lib="webworker" />
import { VisualizerEngine } from './visualizer/visualizer-engine.js';

interface TimeSignatureConfig {
    beats: number;
    grouping: number[];
    stepsPerBeat: number;
}

let engine: VisualizerEngine | null = null;
let currentBpm = 120;
let currentTS: TimeSignatureConfig = { beats: 4, grouping: [4], stepsPerBeat: 4 };
let syncAudioTime = 0;
let syncPerfTime = 0;
let isRunning = false;
let isPlayingLocal = false;
/** True while the playing→paused transition render hasn't fired yet. */
let needsPausedRender = false;
/**
 * #540 — prefers-reduced-motion. When true, the canvas does NOT scroll smoothly:
 * render time is quantized to step boundaries and we only repaint when the step
 * index changes, so the visual advances in discrete event steps (the OS-decided
 * calmer mode) instead of a continuous vestibular-trigger scroll. CSS can gate UI
 * animation but cannot pause a canvas rAF loop, so this lives in the JS pipeline.
 */
let reducedMotionLocal = false;
/** Last step index painted under reduced-motion, so we skip intra-step frames. */
let lastReducedStepIndex = -1;
/**
 * #1008 — explicit pending-frame lifecycle. The loop never free-spins: every
 * frame must be requested (by an incoming message, or by the previous playing
 * frame), so a paused worker sits at zero steady-state rAF callbacks.
 */
let framePending = false;

/** Schedule exactly one frame; coalesces bursts and no-ops while one is queued. */
function requestFrame() {
    if (!isRunning || framePending) {
        return;
    }
    framePending = true;
    requestAnimationFrame(runFrame);
}

function runFrame() {
    framePending = false;
    if (!isRunning || !engine) {
        return;
    }

    const now = getInterpolatedTime();

    // Paused: paint at most the one requested frozen frame, then stop scheduling
    // until playback resumes or a message changes what's on screen.
    if (!isPlayingLocal) {
        if (needsPausedRender) {
            needsPausedRender = false;
            if (now > 0) {
                engine.render(now, currentBpm, currentTS);
            }
        }
        return;
    }

    if (now > 0) {
        if (reducedMotionLocal) {
            // Event-stepped: quantize to the current step boundary and only
            // repaint when the step changes — no smooth interpolation between
            // steps (the /unblock 2026-06-18 decision for reduced-motion).
            const stepsPerBeat = currentTS.stepsPerBeat || 4;
            const stepIndex = reducedMotionStepIndex(now, currentBpm, stepsPerBeat);
            if (stepIndex !== lastReducedStepIndex) {
                lastReducedStepIndex = stepIndex;
                const stepDur = 60 / currentBpm / stepsPerBeat;
                engine.render(stepIndex * stepDur, currentBpm, currentTS);
            }
        } else {
            engine.render(now, currentBpm, currentTS);
        }
    }

    // Playing: the continuous animation loop — each frame requests the next.
    requestFrame();
}

/**
 * #540 — reduced-motion quantization. Maps a continuous time (seconds) to the
 * index of the step it falls in, so the renderer can advance in discrete event
 * steps instead of scrolling smoothly. Pure + exported for unit testing.
 */
export function reducedMotionStepIndex(time: number, bpm: number, stepsPerBeat: number): number {
    const stepDur = 60 / bpm / (stepsPerBeat || 4);
    return stepDur > 0 ? Math.floor(time / stepDur) : 0;
}

function getInterpolatedTime() {
    if (!syncPerfTime) {
        return 0;
    }
    if (!isPlayingLocal) {
        return syncAudioTime;
    }
    return syncAudioTime + (performance.now() - syncPerfTime) / 1000;
}

if (typeof self !== 'undefined') {
    const workerSelf = self as unknown as DedicatedWorkerGlobalScope;
    workerSelf.onmessage = (e: MessageEvent) => {
        const {
            type,
            canvas,
            staticCanvas,
            width,
            height,
            dpr,
            themeCache,
            name,
            color,
            resolvedColor,
            label,
            midi,
            time,
            event,
            audioTime,
            bpm,
            tsConfig,
            active,
            isPlaying,
            reducedMotion,
        } = e.data;

        switch (type) {
            case 'INIT':
                engine = new VisualizerEngine(canvas, staticCanvas);
                isRunning = true;
                break;

            case 'RESIZE':
                if (engine) {
                    engine.resize(width, height, dpr);
                }
                break;

            case 'THEME':
                if (engine) {
                    engine.setTheme(themeCache);
                }
                break;

            case 'SET_FILL':
                if (engine) {
                    engine.isFillActive = active;
                }
                break;

            case 'SET_PLAYING': {
                const wasPlaying = isPlayingLocal;
                isPlayingLocal = !!isPlaying;
                // Transitioning playing→paused: request one final render so the
                // frozen frame is correct, then the loop stops scheduling entirely.
                if (wasPlaying && !isPlayingLocal) {
                    needsPausedRender = true;
                }
                // Resume (or any playing transition) explicitly requests the next
                // frame — #1008, nothing restarts the loop implicitly anymore.
                requestFrame();
                break;
            }

            case 'ADD_TRACK':
                if (engine) {
                    engine.addTrack(name, color, resolvedColor, label);
                }
                break;

            case 'SET_REGISTER':
                if (engine) {
                    engine.setRegister(name, midi);
                }
                break;

            case 'SET_BEAT_REFERENCE':
                if (engine) {
                    engine.setBeatReference(time);
                }
                break;

            case 'PUSH_NOTE':
                if (engine) {
                    engine.pushNote(name, event);
                }
                break;

            case 'PUSH_CHORD':
                if (engine) {
                    engine.pushChord(event);
                }
                break;

            case 'TRUNCATE':
                if (engine) {
                    engine.truncateNotes(name, time);
                }
                break;

            case 'CLEAR':
                if (engine) {
                    engine.clear();
                }
                break;

            case 'RENDER':
                currentBpm = bpm;
                currentTS = tsConfig;
                break;

            case 'SYNC_CLOCK':
                syncAudioTime = audioTime;
                syncPerfTime = performance.now();
                break;

            case 'SET_REDUCED_MOTION':
                reducedMotionLocal = Boolean(reducedMotion);
                // Reset so the next frame repaints immediately at the right time:
                // turning OFF resumes smooth motion at once; turning ON snaps to the
                // current step rather than waiting for the index to roll over.
                lastReducedStepIndex = -1;
                break;
        }

        // #1008 — every message that can change what's on screen requests exactly
        // one frame (theme flip, resize, a pushed note while paused, …). While
        // playing this is usually a no-op: the loop already has a frame queued.
        requestFrame();
    };
}
