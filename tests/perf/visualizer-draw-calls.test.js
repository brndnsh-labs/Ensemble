// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer.js';

describe('UnifiedVisualizer Optimization Check', () => {
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
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fill: vi.fn(),
            arc: vi.fn(),
            fillText: vi.fn(),
            drawImage: vi.fn(),
            set fillStyle(_val) {},
            set strokeStyle(_val) {},
            set globalAlpha(_val) {},
            set lineWidth(_val) {},
            set font(_val) {},
            set textAlign(_val) {},
            set textBaseline(_val) {},
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
                addListener: vi.fn(), // deprecated
                removeListener: vi.fn(), // deprecated
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });

        visualizer = new UnifiedVisualizer('viz-container');
        // Set dimensions manually since ResizeObserver is mocked
        visualizer.resize({ width: 800, height: 600 });
    });

    afterEach(() => {
        visualizer.destroy();
        document.body.removeChild(container);
    });

    it('counts draw calls per frame', () => {
        // Add some data to make render do work
        visualizer.addTrack('bass', 'var(--blue)');
        visualizer.pushNote('bass', { time: 0, duration: 1, midi: 60 });
        visualizer.pushChord({ time: 0, duration: 1, rootMidi: 60, notes: [60, 64, 67] });

        // Clear mocks to ignore initialization/static render calls
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

        // Assert that draw calls are batched (should be much less than if we drew every note individually)
        expect(strokeCalls).toBeLessThan(15);
        expect(beginPathCalls).toBeLessThan(15);
        expect(fillRectCalls).toBeLessThan(100);
    });
});
