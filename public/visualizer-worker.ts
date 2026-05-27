/// <reference lib="webworker" />
import { VisualizerEngine } from './visualizer-engine.js';

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

function getInterpolatedTime() {
    if (!syncPerfTime) {
        return 0;
    }
    if (!isPlayingLocal) {
        return syncAudioTime;
    }
    return syncAudioTime + (performance.now() - syncPerfTime) / 1000;
}

function tick() {
    if (!isRunning) {
        return;
    }

    if (engine) {
        // While paused, only render once to paint the frozen frame, then skip
        // every subsequent frame until playback resumes.
        if (!isPlayingLocal) {
            if (needsPausedRender) {
                needsPausedRender = false;
                const now = getInterpolatedTime();
                if (now > 0) {
                    engine.render(now, currentBpm, currentTS);
                }
            }
            requestAnimationFrame(tick);
            return;
        }

        const now = getInterpolatedTime();
        if (now > 0) {
            engine.render(now, currentBpm, currentTS);
        }
    }
    requestAnimationFrame(tick);
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
        } = e.data;

        switch (type) {
            case 'INIT':
                engine = new VisualizerEngine(canvas, staticCanvas);
                isRunning = true;
                requestAnimationFrame(tick);
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
                // frozen frame is correct, then skip all subsequent frames until play resumes.
                if (wasPlaying && !isPlayingLocal) {
                    needsPausedRender = true;
                }
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

            case 'STOP':
                isRunning = false;
                break;

            case 'START':
                if (!isRunning) {
                    isRunning = true;
                    requestAnimationFrame(tick);
                }
                break;
        }
    };
}
