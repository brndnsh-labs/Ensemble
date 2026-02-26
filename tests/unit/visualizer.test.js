/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedVisualizer } from '../../public/visualizer.js';

describe('UnifiedVisualizer', () => {
    let visualizer;
    let mockCtx;
    let mockCanvas;
    let getPropertyValueSpy;

    beforeEach(() => {
        // Setup DOM
        document.body.innerHTML =
            '<div id="viz-container" style="width: 800px; height: 600px;"></div>';

        // Mock Context
        mockCtx = {
            fillRect: vi.fn(),
            rect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fill: vi.fn(),
            closePath: vi.fn(),
            arc: vi.fn(),
            clearRect: vi.fn(),
            scale: vi.fn(),
            fillText: vi.fn(),
            drawImage: vi.fn(),
            measureText: vi.fn(() => ({ width: 10 })),
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            globalAlpha: 1.0,
            font: '',
            textAlign: '',
            textBaseline: '',
            set lineCap(_v) {},
            set lineJoin(_v) {},
        };

        // Create a REAL canvas element from happy-dom
        const canvas = document.createElement('canvas');
        canvas.getContext = vi.fn(() => mockCtx);
        mockCanvas = canvas;

        // Mock ResizeObserver with proper spies
        vi.stubGlobal(
            'ResizeObserver',
            class {
                constructor(callback) {
                    this.callback = callback;
                    this.observe = vi.fn();
                    this.unobserve = vi.fn();
                    this.disconnect = vi.fn();
                }
            },
        );

        // Mock matchMedia
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        // Mock getComputedStyle with spy
        getPropertyValueSpy = vi.fn((prop) => {
            if (prop?.startsWith('--')) {
                return '#123456';
            }
            return '#000000';
        });

        vi.spyOn(window, 'getComputedStyle').mockReturnValue({
            getPropertyValue: getPropertyValueSpy,
        });

        // Use a safer way to mock createElement to avoid recursion
        const _originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
            if (tagName.toLowerCase() === 'canvas') {
                return mockCanvas;
            }
            // Use the prototype's original method to avoid recursion if vitest wraps the instance method
            return HTMLDocument.prototype.createElement.call(document, tagName);
        });

        visualizer = new UnifiedVisualizer('viz-container');
        visualizer.resize({ width: 800, height: 600 });
    });

    afterEach(() => {
        if (visualizer) {
            visualizer.destroy();
        }
        vi.restoreAllMocks();
    });

    it('should initialize with a canvas and info layer', () => {
        const container = document.getElementById('viz-container');
        expect(container.contains(mockCanvas)).toBe(true);
        expect(visualizer.infoLayer).toBeDefined();
        expect(mockCanvas.getContext).toHaveBeenCalledWith('2d', { alpha: false });
    });

    it('should correctly handle track additions', () => {
        visualizer.addTrack('bass', '#ff0000');
        expect(visualizer.tracks.bass).toBeDefined();
        expect(visualizer.tracks.bass.color).toBe('#ff0000');
        expect(visualizer.infoLayer.children.length).toBe(1);
    });

    it('should push notes into track history', () => {
        visualizer.addTrack('soloist', 'blue');
        const noteEvent = { time: 1.0, midi: 60, duration: 0.5, noteName: 'C', octave: 4 };
        visualizer.pushNote('soloist', noteEvent);

        expect(visualizer.tracks.soloist.history.length).toBe(1);
        expect(visualizer.tracks.soloist.label.textContent).toBe('C4');
    });

    it('should push chords into chord events', () => {
        const chordEvent = { time: 0, notes: [60, 64, 67], rootMidi: 60, intervals: [0, 4, 7] };
        visualizer.pushChord(chordEvent);

        expect(visualizer.chordEvents.length).toBe(1);
        expect(visualizer.chordEvents[0].notes).toEqual([60, 64, 67]);
    });

    it('should truncate notes correctly for monophonic rendering', () => {
        visualizer.addTrack('bass', 'red');
        visualizer.pushNote('bass', { time: 0, midi: 36, duration: 1.0 });

        visualizer.truncateNotes('bass', 0.5);
        expect(visualizer.tracks.bass.history.at(0).duration).toBe(0.5);
    });

    it('should execute draw calls during render', () => {
        visualizer.addTrack('bass', 'red');
        visualizer.pushNote('bass', { time: 10, midi: 36, duration: 1.0 });
        visualizer.setBeatReference(0);

        visualizer.render(10.5, 120, 4);

        // Verify background was drawn
        expect(mockCtx.fillRect).toHaveBeenCalled();
        // Verify piano roll keys were drawn (startMidi to endMidi loop)
        expect(mockCtx.beginPath).toHaveBeenCalled();
        // Verify notes/tracks were processed
        expect(mockCtx.moveTo).toHaveBeenCalled();
        expect(mockCtx.lineTo).toHaveBeenCalled();
    });

    it('should clear all tracks and events on clear()', () => {
        visualizer.addTrack('bass', 'red');
        visualizer.pushNote('bass', { time: 0, midi: 36 });
        visualizer.pushChord({ time: 0 });

        visualizer.clear();

        expect(visualizer.tracks.bass.history.length).toBe(0);
        expect(visualizer.chordEvents.length).toBe(0);
        expect(mockCtx.clearRect).toHaveBeenCalled();
    });

    describe('Lifecycle', () => {
        it('should remove canvas and info layer on destroy', () => {
            const container = document.getElementById('viz-container');
            expect(container.contains(mockCanvas)).toBe(true);

            visualizer.destroy();

            expect(container.contains(mockCanvas)).toBe(false);
            expect(container.querySelector('div')).toBeNull(); // Info layer should be gone
        });

        it('should disconnect ResizeObserver on destroy', () => {
            const disconnectSpy = vi.spyOn(visualizer.resizeObserver, 'disconnect');
            visualizer.destroy();
            expect(disconnectSpy).toHaveBeenCalled();
        });
    });

    describe('Performance Optimizations', () => {
        it('should have ZERO getPropertyValue calls during render loop (caching enabled)', () => {
            // Setup scene
            visualizer.addTrack('bass', 'var(--blue)');
            visualizer.addTrack('drums', 'var(--green)');
            visualizer.addTrack('melody', 'var(--red)');

            visualizer.pushNote('bass', { time: 1, midi: 60, duration: 1 });
            visualizer.pushNote('drums', { time: 1, midi: 36, duration: 1 });
            visualizer.pushNote('melody', { time: 1, midi: 72, duration: 1 });

            // Trigger initial lazy cache setup
            visualizer.render(1.5, 120);

            // Clear any calls from setup and initial lazy init
            getPropertyValueSpy.mockClear();

            const iterations = 100;
            for (let i = 0; i < iterations; i++) {
                visualizer.render(1.5, 120);
            }

            // Assert: No CSS variable lookups in the hot loop
            expect(getPropertyValueSpy.mock.calls.length).toBe(0);
        });

        it('should re-resolve colors when theme changes', async () => {
            visualizer.addTrack('bass', 'var(--blue)');

            // Trigger initial lazy cache setup
            visualizer.render(0, 120);

            // Clear calls from init and initial lazy setup
            getPropertyValueSpy.mockClear();

            // 1. Subsequent Render should not trigger calls
            visualizer.render(0, 120);
            expect(getPropertyValueSpy.mock.calls.length).toBe(0);

            // 2. Change Theme
            document.documentElement.setAttribute('data-theme', 'dark');

            // Wait for MutationObserver (async)
            await new Promise((resolve) => setTimeout(resolve, 50));

            // 3. Should have re-resolved colors
            // Exact count depends on number of colors to resolve (chords x4 + tracks)
            const callsAfterThemeChange = getPropertyValueSpy.mock.calls.length;
            expect(callsAfterThemeChange).toBeGreaterThan(0);
        });
    });
});
