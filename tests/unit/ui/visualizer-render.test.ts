// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULES } from '../../../public/constants.js';
import { VisualizerEngine } from '../../../public/visualizer-engine.js';

describe('VisualizerEngine Rendering Deep Dive', () => {
    let engine;
    let mockCtx;
    let mockCanvas;
    let mockStaticCanvas;
    let mockStaticCtx;

    beforeEach(() => {
        const createMockCtx = () => ({
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
            resetTransform: vi.fn(),
            createLinearGradient: vi.fn(() => ({
                addColorStop: vi.fn(),
            })),
            set lineCap(_v) {},
            set lineJoin(_v) {},
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            globalAlpha: 1.0,
            font: '',
            textAlign: '',
            textBaseline: '',
            measureText: vi.fn(() => ({ width: 10 })),
            shadowBlur: 0,
            shadowColor: '',
        });

        mockCtx = createMockCtx();
        mockStaticCtx = createMockCtx();

        mockCanvas = {
            getContext: vi.fn(() => mockCtx),
            width: 800,
            height: 600,
        };

        mockStaticCanvas = {
            getContext: vi.fn(() => mockStaticCtx),
            width: 800,
            height: 600,
        };

        engine = new VisualizerEngine(mockCanvas, mockStaticCanvas);
        engine.setTheme({
            bgColor: '#000',
            keyWhite: '#fff',
            keyBlack: '#111',
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
        });
        engine.resize(800, 600, 1);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should render soloist notes with different types inside the soloist lane', () => {
        engine.addTrack(MODULES.SOLOIST, 'blue', 'blue');
        engine.pushNote(MODULES.SOLOIST, { time: 10, midi: 60, duration: 1, noteType: 'arp' });
        engine.pushNote(MODULES.SOLOIST, {
            time: 11,
            midi: 62,
            duration: 1,
            noteType: 'target',
        });
        engine.pushNote(MODULES.SOLOIST, {
            time: 12,
            midi: 64,
            duration: 1,
            noteType: 'altered',
        });
        engine.pushNote(MODULES.SOLOIST, { time: 13, midi: 65, duration: 1 }); // default

        engine.render(14, 120);

        expect(mockCtx.fillRect).toHaveBeenCalled();
        expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('should render drum hits', () => {
        engine.addTrack('drums', 'purple', 'purple');
        engine.pushNote('drums', { time: 10, midi: 36, velocity: 0.8 });
        engine.pushNote('drums', { time: 10.5, midi: 38, velocity: 1.0 });

        engine.render(11, 120);

        // Drums use lineTo/moveTo to draw diamond shapes
        expect(mockCtx.lineTo).toHaveBeenCalled();
        expect(mockCtx.fill).toHaveBeenCalled();
    });

    it('should render guide tones for chords', () => {
        engine.addTrack('chords', '#268bd2', '#268bd2');
        engine.pushChord({
            time: 10,
            duration: 2,
            rootMidi: 60,
            notes: [60, 64, 67],
            intervals: [0, 4, 7],
        });

        engine.render(11, 120);

        // Guide tones are drawn with rect() batches at low alpha
        expect(mockCtx.rect).toHaveBeenCalled();
        expect(mockCtx.fill).toHaveBeenCalled();
    });

    it('should overlay chord tones inside the soloist lane', () => {
        engine.addTrack(MODULES.SOLOIST, '#d33682', '#d33682');
        mockCtx.rect.mockClear();
        mockCtx.fill.mockClear();

        engine.pushChord({
            time: 10,
            duration: 2,
            rootMidi: 60,
            notes: [60, 64, 67, 71],
            intervals: [0, 4, 7, 11],
        });

        engine.render(11, 120);

        expect(mockCtx.rect).toHaveBeenCalled();
        expect(mockCtx.fill).toHaveBeenCalled();
    });

    it('should render fill highlight', () => {
        engine.isFillActive = true;
        engine.render(10, 120);

        expect(mockCtx.createLinearGradient).toHaveBeenCalled();
        expect(mockCtx.fillRect).toHaveBeenCalled();
    });

    it('should handle complex time signatures', () => {
        engine.setBeatReference(0);

        // 7/8 with 2+2+3 grouping
        const tsConfig = {
            beats: 7,
            grouping: [2, 2, 3],
            stepsPerBeat: 2,
        };

        engine.render(1, 120, tsConfig);

        // Verify it doesn't crash and draws something
        expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('should handle wrapped RingBuffer during rendering', () => {
        engine.addTrack('bass', 'red', 'red');
        for (let i = 0; i < 150; i++) {
            engine.pushNote('bass', { time: i, midi: 36, duration: 0.1 });
        }

        engine.render(149, 120);
        expect(mockCtx.stroke).toHaveBeenCalled();
    });
});
