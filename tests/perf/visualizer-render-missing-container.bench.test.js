// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, it } from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer.js';

describe('UnifiedVisualizer Missing Container Benchmark', () => {
    let visualizer;
    let mockCtx;

    beforeEach(() => {
        // Ensure document is clean - NO container
        document.body.innerHTML = '';

        // Add noise to DOM to make getElementById have to work
        for (let i = 0; i < 10000; i++) {
            const div = document.createElement('div');
            div.id = `noise-${i}`;
            document.body.appendChild(div);
        }

        // Minimal Mock canvas context
        mockCtx = {
            scale: () => {},
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

        // Initialize with an ID that doesn't exist
        visualizer = new UnifiedVisualizer('non-existent-container');
    });

    afterEach(() => {
        visualizer.destroy();
    });

    it('benchmarks render loop when container is missing', () => {
        const start = performance.now();
        const iterations = 50000;

        // This loop should hit the document.getElementById check every time
        for (let i = 0; i < iterations; i++) {
            visualizer.render(5.5, 120);
        }

        const end = performance.now();
        const totalTime = end - start;
        console.log(
            `[Missing Container] Rendered ${iterations} frames in ${totalTime.toFixed(2)}ms`,
        );
        console.log(
            `[Missing Container] Average: ${(totalTime / iterations).toFixed(4)}ms per frame`,
        );
    });
});
