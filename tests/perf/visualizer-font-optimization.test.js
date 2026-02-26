// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer.js';

describe('UnifiedVisualizer Font Optimization', () => {
    let visualizer;
    let container;
    let mockCtx;
    let fontSetCount = 0;
    let textAlignSetCount = 0;
    let textBaselineSetCount = 0;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'viz-font-perf';
        document.body.appendChild(container);

        fontSetCount = 0;
        textAlignSetCount = 0;
        textBaselineSetCount = 0;

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
            set fillStyle(_val) {},
            set strokeStyle(_val) {},
            set globalAlpha(_val) {},
            set lineWidth(_val) {},
            set lineCap(_val) {},
            set lineJoin(_val) {},
            set font(_val) {
                fontSetCount++;
            },
            set textAlign(_val) {
                textAlignSetCount++;
            },
            set textBaseline(_val) {
                textBaselineSetCount++;
            },
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

        visualizer = new UnifiedVisualizer('viz-font-perf');
        visualizer.resize({ width: 800, height: 600 });
    });

    afterEach(() => {
        visualizer.destroy();
        document.body.removeChild(container);
    });

    it('measures redundant font property assignments per frame', () => {
        // Clear counts from initialization/static render
        fontSetCount = 0;
        textAlignSetCount = 0;
        textBaselineSetCount = 0;

        // Render one frame
        visualizer.render(0.5, 120);

        console.log(`ctx.font sets: ${fontSetCount}`);
        console.log(`ctx.textAlign sets: ${textAlignSetCount}`);
        console.log(`ctx.textBaseline sets: ${textBaselineSetCount}`);

        // OPTIMIZED ASSERTION:
        // We expect exactly 1 assignment for each property per frame.
        expect(fontSetCount).toBe(1);
        expect(textAlignSetCount).toBe(1);
        expect(textBaselineSetCount).toBe(1);
    });
});
