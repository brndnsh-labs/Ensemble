/**
 * UnifiedVisualizer (Proxy)
 * Main thread class that manages the VisualizerWorker.
 */
/**
 * @typedef {Object} WorkerLike
 * @property {(message: any, transfer?: Transferable[]) => void} postMessage
 * @property {() => void} terminate
 */

export class UnifiedVisualizer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {HTMLCanvasElement} staticCanvas
     */
    constructor(canvas, staticCanvas) {
        this.canvas = canvas;
        this.staticCanvas = staticCanvas;

        if (
            !canvas ||
            !staticCanvas ||
            typeof canvas.transferControlToOffscreen !== 'function' ||
            typeof staticCanvas.transferControlToOffscreen !== 'function'
        ) {
            console.warn(
                '[UnifiedVisualizer] Missing canvas elements or OffscreenCanvas support. Running in NOOP mode.',
            );
            this.worker = { postMessage: () => {}, terminate: () => {} };
            return;
        }

        // In production, VIZ_WORKER_PATH is injected by esbuild --define
        const workerPath =
            typeof VIZ_WORKER_PATH !== 'undefined'
                ? /** @type {string} */ (VIZ_WORKER_PATH)
                : 'visualizer-worker.js';

        /** @type {Worker | WorkerLike | null} */
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

        /** @type {any} */
        this.themeCache = null;
        /** @type {Record<string, any>} */
        this.tracks = {};
    }

    /**
     * @param {any} val
     * @returns {any}
     */
    toRaw(val) {
        if (!val || typeof val !== 'object') {
            return val;
        }
        try {
            return JSON.parse(JSON.stringify(val));
        } catch (_e) {
            return val;
        }
    }

    /**
     * @param {any} themeCache
     */
    setTheme(themeCache) {
        this.themeCache = themeCache;
        if (this.worker) {
            this.worker.postMessage({ type: 'THEME', themeCache: this.toRaw(themeCache) }, []);
        }
    }

    /**
     * @param {number} width
     * @param {number} height
     * @param {number} dpr
     */
    resize(width, height, dpr = 1) {
        if (this.worker) {
            this.worker.postMessage({ type: 'RESIZE', width, height, dpr }, []);
        }
    }

    /**
     * @param {string} name
     * @param {string} color
     * @param {string} resolvedColor
     */
    addTrack(name, color, resolvedColor) {
        this.tracks[name] = { color, resolvedColor };
        if (this.worker) {
            this.worker.postMessage({ type: 'ADD_TRACK', name, color, resolvedColor }, []);
        }
    }

    /**
     * @param {string} name
     * @param {any} midi
     */
    setRegister(name, midi) {
        if (this.worker) {
            this.worker.postMessage({ type: 'SET_REGISTER', name, midi: this.toRaw(midi) }, []);
        }
    }

    /**
     * @param {number} time
     */
    setBeatReference(time) {
        if (this.worker) {
            this.worker.postMessage({ type: 'SET_BEAT_REFERENCE', time }, []);
        }
    }

    /**
     * @param {boolean} isPlaying
     */
    setPlaying(isPlaying) {
        if (this.worker) {
            this.worker.postMessage({ type: 'SET_PLAYING', isPlaying }, []);
        }
    }

    /**
     * @param {string} name
     * @param {any} event
     */
    pushNote(name, event) {
        if (this.worker) {
            this.worker.postMessage({ type: 'PUSH_NOTE', name, event: this.toRaw(event) }, []);
        }
    }

    /**
     * @param {any} event
     */
    pushChord(event) {
        if (this.worker) {
            this.worker.postMessage({ type: 'PUSH_CHORD', event: this.toRaw(event) }, []);
        }
    }

    /**
     * @param {string} name
     * @param {number} time
     */
    truncateNotes(name, time) {
        if (this.worker) {
            this.worker.postMessage({ type: 'TRUNCATE', name, time }, []);
        }
    }

    clear() {
        if (this.worker) {
            this.worker.postMessage({ type: 'CLEAR' }, []);
        }
    }

    /**
     * @param {number} currentTime
     * @param {number} bpm
     * @param {any} tsConfig
     */
    render(currentTime, bpm, tsConfig) {
        if (this.worker) {
            this.worker.postMessage(
                { type: 'RENDER', currentTime, bpm, tsConfig: this.toRaw(tsConfig) },
                [],
            );
        }
    }

    /**
     * @param {number} audioTime
     * @param {number} perfTime
     */
    syncClock(audioTime, perfTime) {
        if (this.worker) {
            this.worker.postMessage({ type: 'SYNC_CLOCK', audioTime, perfTime }, []);
        }
    }

    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}
