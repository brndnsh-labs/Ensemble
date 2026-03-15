/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULES } from '../../public/constants.js';
import { UnifiedVisualizer } from '../../public/visualizer.js';

describe('UnifiedVisualizer Rendering Deep Dive', () => {
    let visualizer;
    let mockCtx;
    let mockCanvas;

    beforeEach(() => {
        document.body.innerHTML = '<div id="viz-container"></div>';

        mockCtx = {
            fillRect: vi.fn(),
            rect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            fill: vi.fn(),
            arc: vi.fn(),
            fillText: vi.fn(),
            drawImage: vi.fn(),
            scale: vi.fn(),
            createLinearGradient: vi.fn(() => ({
                addColorStop: vi.fn(),
            })),
            set lineCap(_v) {},
            set lineJoin(_v) {},
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            globalAlpha: 1.0,
        };

        const canvas = document.createElement('canvas');
        canvas.getContext = vi.fn(() => mockCtx);
        mockCanvas = canvas;

        vi.stubGlobal(
            'ResizeObserver',
            class {
                observe() {}
                disconnect() {}
            },
        );

        vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
            if (tagName.toLowerCase() === 'canvas') {
                return mockCanvas;
            }
            return HTMLDocument.prototype.createElement.call(document, tagName);
        });

        visualizer = new UnifiedVisualizer('viz-container');
        visualizer.resize({ width: 800, height: 600 });
    });

    afterEach(() => {
        visualizer.destroy();
        vi.restoreAllMocks();
    });

    it('should render soloist notes with different types', () => {
        visualizer.addTrack(MODULES.SOLOIST, 'blue');
        visualizer.pushNote(MODULES.SOLOIST, { time: 10, midi: 60, duration: 1, noteType: 'arp' });
        visualizer.pushNote(MODULES.SOLOIST, {
            time: 11,
            midi: 62,
            duration: 1,
            noteType: 'target',
        });
        visualizer.pushNote(MODULES.SOLOIST, {
            time: 12,
            midi: 64,
            duration: 1,
            noteType: 'altered',
        });
        visualizer.pushNote(MODULES.SOLOIST, { time: 13, midi: 65, duration: 1 }); // default

        visualizer.render(14, 120);

        // Verify batch paths were created for each type
        // The stroke() call count is a good proxy for how many batches were rendered
        const strokeCalls = mockCtx.stroke.mock.calls.length;
        expect(strokeCalls).toBeGreaterThan(1);
    });

    it('should render drum hits', () => {
        visualizer.addTrack('drums', 'purple');
        visualizer.pushNote('drums', { time: 10, midi: 36, velocity: 0.8 });
        visualizer.pushNote('drums', { time: 10.5, midi: 38, velocity: 1.0 });

        visualizer.render(11, 120);

        // Drums use lineTo/moveTo to draw diamond shapes
        expect(mockCtx.lineTo).toHaveBeenCalled();
        expect(mockCtx.fill).toHaveBeenCalled();
    });

    it('should render guide tones for chords', () => {
        visualizer.pushChord({
            time: 10,
            duration: 2,
            rootMidi: 60,
            notes: [60, 64, 67],
            intervals: [0, 4, 7],
        });

        visualizer.render(11, 120);

        // Guide tones are drawn with rect() batches at low alpha
        expect(mockCtx.rect).toHaveBeenCalled();
        expect(mockCtx.fill).toHaveBeenCalled();
    });

    it('should render fill highlight', () => {
        visualizer.isFillActive = true;
        visualizer.render(10, 120);

        expect(mockCtx.createLinearGradient).toHaveBeenCalled();
        expect(mockCtx.fillRect).toHaveBeenCalled();
    });

    it('should handle complex time signatures', () => {
        visualizer.setBeatReference(0);

        // 7/8 with 2+2+3 grouping
        const tsConfig = {
            beats: 7,
            grouping: [2, 2, 3],
            stepsPerBeat: 2,
        };

        visualizer.render(1, 120, tsConfig);

        // Verify it doesn't crash and draws something
        expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('should handle missing container during render', () => {
        visualizer.container = null;
        expect(() => visualizer.render(10, 120)).not.toThrow();
    });

    it('should handle wrapped RingBuffer during rendering', () => {
        visualizer.addTrack('bass', 'red');
        // Capacity is 100. Fill it and wrap it.
        for (let i = 0; i < 150; i++) {
            visualizer.pushNote('bass', { time: i, midi: 36, duration: 0.1 });
        }

        visualizer.render(149, 120);
        expect(mockCtx.stroke).toHaveBeenCalled();
    });
});
