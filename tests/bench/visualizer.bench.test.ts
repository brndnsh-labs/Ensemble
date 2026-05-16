// @ts-nocheck
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisualizerEngine } from '../../public/visualizer-engine.js';

describe('UnifiedVisualizer Performance Benchmarks', () => {
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

        // Mock canvas context
        mockCtx = {
            scale: vi.fn(),
            resetTransform: vi.fn(),
            fillRect: vi.fn(),
            rect: vi.fn(),
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fill: vi.fn(),
            arc: vi.fn(),
            fillText: vi.fn(),
            drawImage: vi.fn(),
            measureText: vi.fn(() => ({ width: 10 })),
            set fillStyle(_val) {},
            get fillStyle() {
                return '#000';
            },
            set strokeStyle(_val) {},
            get strokeStyle() {
                return '#000';
            },
            set globalAlpha(_val) {},
            get globalAlpha() {
                return 1;
            },
            set lineWidth(_val) {},
            set font(_val) {
                this._fontSetCount = (this._fontSetCount || 0) + 1;
            },
            set textAlign(_val) {
                this._textAlignSetCount = (this._textAlignSetCount || 0) + 1;
            },
            set textBaseline(_val) {
                this._textBaselineSetCount = (this._textBaselineSetCount || 0) + 1;
            },
            set lineCap(_val) {},
            set lineJoin(_val) {},
            createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        };

        // Mock getContext
        HTMLCanvasElement.prototype.getContext = () => mockCtx;

        // Mock ResizeObserver
        global.ResizeObserver = class {
            observe() {}
            disconnect() {}
        };

        // Mock matchMedia
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });

        visualizer = new VisualizerEngine(mockCanvas, mockStaticCanvas);
        visualizer.resize({ width: 800, height: 600 });

        // Setup theme cache for path optimization tests
        visualizer.themeCache = {
            bgColor: '#000',
            keyWhite: '#fff',
            keyBlack: '#333',
            keySeparator: '#555',
            gridColorMeasure: '#444',
            gridColorBeat: '#222',
            playheadColor: '#f00',
            outlineColor: '#fff',
            labelColor: '#aaa',
            guideLineBlack: '#111',
            guideLineWhite: '#222',
            separatorColor: '#666',
            chordColors: { root: '#f00', third: '#0f0', fifth: '#00f', seventh: '#ff0' },
        };
        visualizer.categoryColors = ['#f00', '#0f0', '#00f', '#ff0'];
    });

    afterEach(() => {
        if (visualizer?.destroy) {
            visualizer.destroy();
        }
    });

    describe('Draw Call Efficiency', () => {
        it('counts draw calls per frame', () => {
            visualizer.addTrack('bass', 'var(--blue)', 'var(--blue)');
            visualizer.pushNote('bass', { time: 0, duration: 1, midi: 60 });
            visualizer.pushChord({ time: 0, duration: 1, rootMidi: 60, notes: [60, 64, 67] });

            vi.clearAllMocks();
            visualizer.render(0.5, 120);

            const strokeCalls = mockCtx.stroke.mock.calls.length;
            const beginPathCalls = mockCtx.beginPath.mock.calls.length;
            const fillRectCalls = mockCtx.fillRect.mock.calls.length;
            const drawImageCalls = mockCtx.drawImage.mock.calls.length;

            console.log(`Stroke calls: ${strokeCalls}`);
            console.log(`BeginPath calls: ${beginPathCalls}`);
            console.log(`FillRect calls: ${fillRectCalls}`);
            console.log(`DrawImage calls: ${drawImageCalls}`);

            expect(strokeCalls).toBeLessThan(15);
            expect(beginPathCalls).toBeLessThan(15);
            expect(fillRectCalls).toBeLessThan(100);
        });

        it('draws generic-track notes as fillRect, not stroked paths', () => {
            visualizer.resize(800, 600, 1);
            visualizer.addTrack('bass', '#00ff00', '#00ff00');
            for (let i = 0; i < 10; i++) {
                visualizer.pushNote('bass', { time: i, duration: 0.5, midi: 60, velocity: 0.8 });
            }
            visualizer.windowSize = 20.0;

            mockCtx.moveTo.mockClear();
            mockCtx.lineTo.mockClear();
            mockCtx.fillRect.mockClear();

            visualizer.render(11.0, 0);

            // Non-drum tracks render notes via fillRect, not lines. Per-note
            // moveTo/lineTo are reserved for drum-track diamonds and grid/playhead
            // overlays — staying small here is the regression bound.
            expect(mockCtx.moveTo.mock.calls.length).toBeLessThan(15);
            expect(mockCtx.lineTo.mock.calls.length).toBeLessThan(15);
            // Each note paints two rects (outline + fill) plus lane backdrops.
            expect(mockCtx.fillRect.mock.calls.length).toBeGreaterThanOrEqual(20);
        });
    });

    describe('State/Context Optimization', () => {
        it('measures redundant font property assignments per frame', () => {
            // resize() triggers a one-time static-layer render with many font
            // sets; reset counters AFTER setup so we measure per-frame render
            // only, which is the hot path that benefits from caching.
            visualizer.resize(800, 600, 1);
            mockCtx._fontSetCount = 0;
            mockCtx._textAlignSetCount = 0;
            mockCtx._textBaselineSetCount = 0;

            visualizer.render(0.5, 120);

            console.log(`ctx.font sets: ${mockCtx._fontSetCount}`);
            console.log(`ctx.textAlign sets: ${mockCtx._textAlignSetCount}`);
            console.log(`ctx.textBaseline sets: ${mockCtx._textBaselineSetCount}`);

            expect(mockCtx._fontSetCount).toBeLessThan(5);
            expect(mockCtx._textAlignSetCount).toBeLessThan(5);
            expect(mockCtx._textBaselineSetCount).toBeLessThan(5);
        });
    });
});
