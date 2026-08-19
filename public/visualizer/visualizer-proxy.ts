/**
 * UnifiedVisualizer (Proxy)
 * Main thread class that manages the VisualizerWorker.
 */

import type { TimeSignatureConfig } from '../config.js';
import type { VisualizerChordEvent, VisualizerNoteEvent } from './visualizer-events.js';

interface WorkerLike {
    postMessage(message: unknown, transfer?: Transferable[]): void;
    terminate(): void;
}

export class UnifiedVisualizer {
    canvas: HTMLCanvasElement;
    staticCanvas: HTMLCanvasElement;
    worker: Worker | WorkerLike | null;
    themeCache: unknown;
    tracks: Record<string, { color: string; resolvedColor: string; label: string }>;

    constructor(canvas: HTMLCanvasElement, staticCanvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.staticCanvas = staticCanvas;
        this.themeCache = null;
        this.tracks = {};

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

        this.worker = new Worker(new URL('../visualizer-worker.ts', import.meta.url), {
            type: 'module',
        });

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
    }

    toRaw<T>(val: T): T {
        if (!val || typeof val !== 'object') {
            return val;
        }
        try {
            return JSON.parse(JSON.stringify(val)) as T;
        } catch (_e) {
            return val;
        }
    }

    setTheme(themeCache: unknown): void {
        this.themeCache = themeCache;
        if (this.worker) {
            this.worker.postMessage({ type: 'THEME', themeCache: this.toRaw(themeCache) }, []);
        }
    }

    resize(width: number, height: number, dpr = 1): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'RESIZE', width, height, dpr }, []);
        }
    }

    addTrack(name: string, color: string, resolvedColor: string, label?: string): void {
        this.tracks[name] = { color, resolvedColor, label: label || name };
        if (this.worker) {
            const message: {
                type: string;
                name: string;
                color: string;
                resolvedColor: string;
                label?: string;
            } = {
                type: 'ADD_TRACK',
                name,
                color,
                resolvedColor,
            };
            if (label) {
                message.label = label;
            }
            this.worker.postMessage(message, []);
        }
    }

    setRegister(name: string, midi: number): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'SET_REGISTER', name, midi: this.toRaw(midi) }, []);
        }
    }

    setBeatReference(time: number): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'SET_BEAT_REFERENCE', time }, []);
        }
    }

    setPlaying(isPlaying: boolean): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'SET_PLAYING', isPlaying }, []);
        }
    }

    // #540 — relay the OS prefers-reduced-motion preference into the canvas
    // worker, which CSS cannot reach. On `true` the worker renders event-stepped
    // (quantized to step boundaries, no smooth scroll).
    setReducedMotion(reducedMotion: boolean): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'SET_REDUCED_MOTION', reducedMotion }, []);
        }
    }

    // #1168 — SET_FILL used to be the one visualizer message that bypassed this
    // proxy, posted straight from Visualizer.tsx via `(vizRef.current as any).worker`.
    // An agent reading the proxy surface would never learn one message skipped it.
    // The worker reads the `active` key (visualizer-worker.ts SET_FILL case).
    setFill(active: boolean): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'SET_FILL', active }, []);
        }
    }

    pushNote(name: string, event: VisualizerNoteEvent): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'PUSH_NOTE', name, event: this.toRaw(event) }, []);
        }
    }

    pushChord(event: VisualizerChordEvent): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'PUSH_CHORD', event: this.toRaw(event) }, []);
        }
    }

    truncateNotes(name: string, time: number): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'TRUNCATE', name, time }, []);
        }
    }

    clear(): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'CLEAR' }, []);
        }
    }

    render(currentTime: number, bpm: number, tsConfig: TimeSignatureConfig): void {
        if (this.worker) {
            this.worker.postMessage(
                { type: 'RENDER', currentTime, bpm, tsConfig: this.toRaw(tsConfig) },
                [],
            );
        }
    }

    syncClock(audioTime: number, perfTime: number): void {
        if (this.worker) {
            this.worker.postMessage({ type: 'SYNC_CLOCK', audioTime, perfTime }, []);
        }
    }

    destroy(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}
