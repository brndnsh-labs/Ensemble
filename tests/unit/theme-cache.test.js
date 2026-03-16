// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisualizerEngine } from '../../public/visualizer.js';

describe('VisualizerEngine Theme Handling', () => {
    let engine;
    let mockCanvas;
    let mockStaticCanvas;

    beforeEach(() => {
        // Mock canvas context
        const createMockCtx = () => ({
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
            resetTransform: vi.fn(),
            measureText: vi.fn(() => ({ width: 10 })),
            shadowBlur: 0,
            shadowColor: '',
            font: '',
            textAlign: '',
            textBaseline: '',
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            globalAlpha: 1.0,
        });

        mockCanvas = {
            getContext: vi.fn(() => createMockCtx()),
            width: 800,
            height: 600,
        };

        mockStaticCanvas = {
            getContext: vi.fn(() => createMockCtx()),
            width: 800,
            height: 600,
        };

        engine = new VisualizerEngine(mockCanvas, mockStaticCanvas);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('updates theme cache and triggers static redraw', () => {
        engine.resize(800, 600, 1);
        const renderSpy = vi.spyOn(engine, 'renderStaticLayer');

        const theme = {
            bgColor: '#123456',
            keyWhite: '#fff',
            keyBlack: '#000',
            keySeparator: '#222',
            labelColor: '#333',
            gridColorMeasure: '#444',
            gridColorBeat: '#555',
            playheadColor: '#666',
            outlineColor: '#777',
            guideLineBlack: '#888',
            guideLineWhite: '#999',
            separatorColor: '#aaa',
            chordColors: ['#f00', '#0f0', '#00f', '#ff0'],
        };

        engine.setTheme(theme);

        expect(engine.themeCache).toBe(theme);
        expect(engine.intervalColors).toBeDefined();
        expect(renderSpy).toHaveBeenCalled();
    });

    it('resolves track colors correctly during addition', () => {
        engine.addTrack('test-track', 'var(--my-color)', '#123456');
        expect(engine.tracks['test-track'].resolvedColor).toBe('#123456');
    });
});
