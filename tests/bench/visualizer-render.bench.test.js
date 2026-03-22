// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, it } from 'vitest';
import { VisualizerEngine } from '../../public/visualizer-engine.js';

describe('UnifiedVisualizer Render Benchmark', () => {
    let visualizer;

    let mockCtx;
    let mockCanvas;
    let mockStaticCanvas;

    beforeEach(() => {
        mockCtx = {
            fillRect: vi.fn(),
            rect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fill: vi.fn(),
            closePath: vi.fn(),
            clearRect: vi.fn(),
            arc: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
            fillText: vi.fn(),
            measureText: vi.fn(() => ({ width: 10 })),
            drawImage: vi.fn(),
            setLineDash: vi.fn(),
            translate: vi.fn(),
            roundRect: vi.fn(),
            clip: vi.fn(),
            scale: vi.fn(),
            transform: vi.fn(),
            resetTransform: vi.fn(),
            createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            _fillStyle: '',
            get fillStyle() {
                return this._fillStyle;
            },
            set fillStyle(v) {
                this._fillStyle = v;
            },
            _strokeStyle: '',
            get strokeStyle() {
                return this._strokeStyle;
            },
            set strokeStyle(v) {
                this._strokeStyle = v;
            },
            _lineWidth: 1,
            get lineWidth() {
                return this._lineWidth;
            },
            set lineWidth(v) {
                this._lineWidth = v;
            },
            _globalAlpha: 1.0,
            get globalAlpha() {
                return this._globalAlpha;
            },
            set globalAlpha(v) {
                this._globalAlpha = v;
            },
            _font: '',
            _fontSetCount: 0,
            get font() {
                return this._font;
            },
            set font(v) {
                this._font = v;
                this._fontSetCount++;
            },
            _textAlign: '',
            _textAlignSetCount: 0,
            get textAlign() {
                return this._textAlign;
            },
            set textAlign(v) {
                this._textAlign = v;
                this._textAlignSetCount++;
            },
            _textBaseline: '',
            _textBaselineSetCount: 0,
            get textBaseline() {
                return this._textBaseline;
            },
            set textBaseline(v) {
                this._textBaseline = v;
                this._textBaselineSetCount++;
            },
            set lineCap(_v) {},
            set lineJoin(_v) {},
            shadowBlur: 0,
            shadowColor: '',
        };
        mockCanvas = { getContext: () => mockCtx, width: 800, height: 600 };
        mockStaticCanvas = { getContext: () => mockCtx, width: 800, height: 600 };
    });

    let container;

    // biome-ignore lint/suspicious/noDuplicateTestHooks: Need separate hook for container
    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'viz-container';
        document.body.appendChild(container);

        // Minimal Mock canvas context for speed
        mockCtx = {
            scale: () => {},
            resetTransform: () => {},
            fillRect: () => {},
            rect: () => {},
            clearRect: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            fill: () => {},
            arc: () => {},
            fillText: () => {},
            drawImage: () => {},
            createLinearGradient: () => ({ addColorStop: () => {} }),
        };

        // Stub property setters
        [
            'fillStyle',
            'strokeStyle',
            'globalAlpha',
            'lineWidth',
            'font',
            'textAlign',
            'textBaseline',
            'lineCap',
            'lineJoin',
        ].forEach((prop) => {
            Object.defineProperty(mockCtx, prop, { set: () => {} });
        });

        HTMLCanvasElement.prototype.getContext = () => mockCtx;

        global.ResizeObserver = class {
            observe() {}
            disconnect() {}
        };

        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: () => ({
                matches: false,
                addEventListener: () => {},
                removeEventListener: () => {},
            }),
        });

        visualizer = new VisualizerEngine(mockCanvas, mockStaticCanvas);
        visualizer.resize({ width: 800, height: 600 });

        // Setup heavy scene
        visualizer.addTrack('bass', '#ff0000', '#ff0000');
        visualizer.addTrack('soloist', '#00ff00');

        // Add 100 notes history
        for (let i = 0; i < 100; i++) {
            visualizer.pushNote('bass', { time: i * 0.1, duration: 0.1, midi: 40 + (i % 12) });
            visualizer.pushNote('soloist', { time: i * 0.1, duration: 0.1, midi: 60 + (i % 12) });
        }
        // Add chords
        visualizer.pushChord({
            time: 5,
            duration: 2,
            rootMidi: 60,
            notes: [60, 64, 67],
            intervals: [0, 4, 7],
        });
    });

    afterEach(() => {
        if (visualizer?.destroy) {
            visualizer.destroy();
        }
    });

    // Using a manual loop instead of vitest 'bench' if not available or for simpler setup
    it('benchmarks render loop', () => {
        const start = performance.now();
        const iterations = 50000;

        for (let i = 0; i < iterations; i++) {
            visualizer.render(5.5, 120);
        }

        const end = performance.now();
        console.log(`Rendered ${iterations} frames in ${(end - start).toFixed(2)}ms`);
        console.log(`Average: ${((end - start) / iterations).toFixed(4)}ms per frame`);
    });
});
