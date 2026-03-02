// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer.js';

describe('UnifiedVisualizer Performance Benchmarks', () => {
    let visualizer;
    let container;
    let mockCtx;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'viz-container';
        document.body.appendChild(container);

        // Mock canvas context
        mockCtx = {
            scale: vi.fn(),
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

        visualizer = new UnifiedVisualizer('viz-container');
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
        visualizer.destroy();
        document.body.removeChild(container);
    });

    describe('Draw Call Efficiency', () => {
        it('counts draw calls per frame', () => {
            visualizer.addTrack('bass', 'var(--blue)');
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

        it('should reduce moveTo/lineTo calls by reusing path for generic tracks', () => {
            visualizer.addTrack('bass', '#00ff00');
            for (let i = 0; i < 10; i++) {
                visualizer.pushNote('bass', { time: i, duration: 0.5, midi: 60, velocity: 0.8 });
            }
            visualizer.windowSize = 20.0;

            mockCtx.moveTo.mockClear();
            mockCtx.lineTo.mockClear();
            mockCtx.beginPath.mockClear();
            mockCtx.stroke.mockClear();

            visualizer.render(11.0, 0);

            const moveToCount = mockCtx.moveTo.mock.calls.length;
            const lineToCount = mockCtx.lineTo.mock.calls.length;

            console.log(`moveTo: ${moveToCount}, lineTo: ${lineToCount}`);

            // Expectation based on optimized behavior: 10 note segments + 1 playhead segment
            expect(moveToCount).toBe(11);
            expect(lineToCount).toBe(11);
        });
    });

    describe('State/Context Optimization', () => {
        it('measures redundant font property assignments per frame', () => {
            mockCtx._fontSetCount = 0;
            mockCtx._textAlignSetCount = 0;
            mockCtx._textBaselineSetCount = 0;

            visualizer.render(0.5, 120);

            console.log(`ctx.font sets: ${mockCtx._fontSetCount}`);
            console.log(`ctx.textAlign sets: ${mockCtx._textAlignSetCount}`);
            console.log(`ctx.textBaseline sets: ${mockCtx._textBaselineSetCount}`);

            expect(mockCtx._fontSetCount).toBe(1);
            expect(mockCtx._textAlignSetCount).toBe(1);
            expect(mockCtx._textBaselineSetCount).toBe(1);
        });
    });
});
