/**
 * UnifiedVisualizer (Proxy)
 * Main thread class that manages the VisualizerWorker.
 */
export class UnifiedVisualizer {
    constructor(canvas, staticCanvas) {
        this.canvas = canvas;
        this.staticCanvas = staticCanvas;

        // In production, VIZ_WORKER_PATH is injected by esbuild --define
        const workerPath =
            typeof VIZ_WORKER_PATH !== 'undefined' ? VIZ_WORKER_PATH : 'visualizer-worker.js';
        this.worker = new Worker(workerPath, { type: 'module' });

        const offscreen = canvas.transferControlToOffscreen();
        const staticOffscreen = staticCanvas.transferControlToOffscreen();

        this.worker.postMessage(
            {
                type: 'INIT',
                canvas: offscreen,
                staticCanvas: staticOffscreen,
            },
            [offscreen, staticOffscreen],
        );

        this.themeCache = null;
        this.tracks = {};
    }

    setTheme(themeCache) {
        this.themeCache = themeCache;
        this.worker.postMessage({ type: 'THEME', themeCache });
    }

    resize(width, height, dpr = 1) {
        this.worker.postMessage({ type: 'RESIZE', width, height, dpr });
    }

    addTrack(name, color, resolvedColor) {
        this.tracks[name] = { color, resolvedColor };
        this.worker.postMessage({ type: 'ADD_TRACK', name, color, resolvedColor });
    }

    setRegister(name, midi) {
        this.worker.postMessage({ type: 'SET_REGISTER', name, midi });
    }

    setBeatReference(time) {
        this.worker.postMessage({ type: 'SET_BEAT_REFERENCE', time });
    }

    setPlaying(isPlaying) {
        this.worker.postMessage({ type: 'SET_PLAYING', isPlaying });
    }

    pushNote(name, event) {
        this.worker.postMessage({ type: 'PUSH_NOTE', name, event });
    }

    pushChord(event) {
        this.worker.postMessage({ type: 'PUSH_CHORD', event });
    }

    truncateNotes(name, time) {
        this.worker.postMessage({ type: 'TRUNCATE', name, time });
    }

    clear() {
        this.worker.postMessage({ type: 'CLEAR' });
    }

    render(currentTime, bpm, tsConfig) {
        this.worker.postMessage({ type: 'RENDER', currentTime, bpm, tsConfig });
    }

    syncClock(audioTime, perfTime) {
        this.worker.postMessage({ type: 'SYNC_CLOCK', audioTime, perfTime });
    }

    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}
