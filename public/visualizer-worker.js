import { VisualizerEngine } from './visualizer.js';

let engine = null;
let currentBpm = 120;
let currentTS = { beats: 4, grouping: [4], stepsPerBeat: 4 };
let syncAudioTime = 0;
let syncPerfTime = 0;
let isRunning = false;

function getInterpolatedTime() {
    return syncAudioTime + (performance.now() - syncPerfTime) / 1000;
}

function tick() {
    if (!isRunning) {
        return;
    }

    if (engine) {
        const now = getInterpolatedTime();
        engine.render(now, currentBpm, currentTS);
    }
    requestAnimationFrame(tick);
}

self.onmessage = (e) => {
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
        midi,
        time,
        event,
        audioTime,
        perfTime,
        bpm,
        tsConfig,
        active,
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

        case 'ADD_TRACK':
            if (engine) {
                engine.addTrack(name, color, resolvedColor);
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
            // Manual render trigger (optional, usually handled by tick)
            currentBpm = bpm;
            currentTS = tsConfig;
            break;

        case 'SYNC_CLOCK':
            syncAudioTime = audioTime;
            syncPerfTime = perfTime;
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
