// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer.js';

describe('UnifiedVisualizer Theme Cache', () => {
    let visualizer;
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        container.id = 'viz-container';
        document.body.appendChild(container);

        // Mock canvas context
        const mockCtx = {
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
        };
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
    });

    afterEach(() => {
        visualizer.destroy();
        document.body.removeChild(container);
    });

    it('initializes theme cache', () => {
        expect(visualizer.themeCache).toBeDefined();
        // Default light mode (implied by no matches and no data-theme='dark')
        expect(visualizer.themeCache.bgColor).toBe('#f8fafc');
    });

    it('updates cache when data-theme changes', async () => {
        // Change to dark mode
        document.documentElement.setAttribute('data-theme', 'dark');

        // Wait for MutationObserver to fire
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(visualizer.themeCache.bgColor).toBe('#0f172a');
    });

    it('updates cache when matchMedia changes', () => {
        // Simulate matchMedia change event
        // We mocked addEventListener to just spy, so we need to trigger the callback manually if we could access it.
        // Instead, we can verify that updateThemeCache is called if we call the listener.

        const updateSpy = vi.spyOn(visualizer, 'updateThemeCache');
        visualizer.themeListener({}); // Trigger manually
        expect(updateSpy).toHaveBeenCalled();
    });

    it('resolves track colors correctly', () => {
        // Mock getComputedStyle to return a specific color for a var
        const originalGetComputedStyle = window.getComputedStyle;
        window.getComputedStyle = vi.fn().mockReturnValue({
            getPropertyValue: (prop) => (prop === '--my-color' ? '#123456' : ''),
        });

        visualizer.addTrack('test-track', 'var(--my-color)');

        expect(visualizer.tracks['test-track'].resolvedColor).toBe('#123456');

        window.getComputedStyle = originalGetComputedStyle;
    });
});
