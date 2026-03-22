/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisualizerEngine } from '../../../public/visualizer-engine.js';
import { UnifiedVisualizer } from '../../../public/visualizer-proxy.js';

describe('Visualizer System', () => {
    let mockCtx;
    let mockCanvas;
    let mockStaticCanvas;
    let mockStaticCtx;
    let getPropertyValueSpy;

    beforeEach(() => {
        // Mock Context
        const createMockCtx = () => ({
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
            resetTransform: vi.fn(),
            createLinearGradient: vi.fn(() => ({
                addColorStop: vi.fn(),
            })),
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            globalAlpha: 1.0,
            font: '',
            textAlign: '',
            textBaseline: '',
            set lineCap(_v) {},
            set lineJoin(_v) {},
            shadowBlur: 0,
            shadowColor: '',
        });

        mockCtx = createMockCtx();
        mockStaticCtx = createMockCtx();

        mockCanvas = {
            getContext: vi.fn(() => mockCtx),
            width: 800,
            height: 600,
            transferControlToOffscreen: vi.fn(() => ({})),
        };

        mockStaticCanvas = {
            getContext: vi.fn(() => mockStaticCtx),
            width: 800,
            height: 600,
            transferControlToOffscreen: vi.fn(() => ({})),
        };

        // Mock Worker
        vi.stubGlobal(
            'Worker',
            class {
                constructor() {
                    this.postMessage = vi.fn();
                    this.terminate = vi.fn();
                }
            },
        );

        // Mock getComputedStyle
        getPropertyValueSpy = vi.fn((prop) => {
            if (prop?.startsWith('--')) {
                return '#123456';
            }
            return '#000000';
        });

        vi.stubGlobal('getComputedStyle', () => ({
            getPropertyValue: getPropertyValueSpy,
        }));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('VisualizerEngine (Logic Core)', () => {
        let engine;

        beforeEach(() => {
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

        it('should initialize correctly', () => {
            expect(engine.canvas).toBe(mockCanvas);
            expect(engine.staticCanvas).toBe(mockStaticCanvas);
            expect(mockCanvas.getContext).toHaveBeenCalledWith('2d', { alpha: false });
        });

        it('should handle track additions', () => {
            engine.addTrack('bass', '#ff0000', '#ff0000');
            expect(engine.tracks.bass).toBeDefined();
            expect(engine.tracks.bass.color).toBe('#ff0000');
        });

        it('should push notes and update labels', () => {
            engine.addTrack('soloist', 'blue', 'blue');
            engine.pushNote('soloist', { time: 1.0, midi: 60, noteName: 'C', octave: 4 });
            expect(engine.tracks.soloist.history.length).toBe(1);
            expect(engine.tracks.soloist.currentNoteLabel).toBe('C4');
        });

        it('should truncate notes correctly', () => {
            engine.addTrack('bass', 'red', 'red');
            engine.pushNote('bass', { time: 0, midi: 36, duration: 1.0 });
            engine.truncateNotes('bass', 0.5);
            expect(engine.tracks.bass.history.at(0).duration).toBe(0.5);
        });

        it('should draw during render', () => {
            engine.addTrack('bass', 'red', 'red');
            engine.pushNote('bass', { time: 10, midi: 36, duration: 1.0 });
            engine.setBeatReference(0);
            engine.render(10.5, 120, 4);

            expect(mockCtx.drawImage).toHaveBeenCalled();
            expect(mockCtx.fillRect).toHaveBeenCalled();
            expect(mockCtx.beginPath).toHaveBeenCalled();
        });

        it('should clear data on clear()', () => {
            engine.addTrack('bass', 'red', 'red');
            engine.pushNote('bass', { time: 0, midi: 36 });
            engine.pushChord({ time: 0 });
            engine.clear();

            expect(engine.tracks.bass.history.length).toBe(0);
            expect(engine.chordEvents.length).toBe(0);
            expect(mockCtx.clearRect).toHaveBeenCalled();
        });
    });

    describe('UnifiedVisualizer (Proxy)', () => {
        let proxy;

        beforeEach(() => {
            proxy = new UnifiedVisualizer(mockCanvas, mockStaticCanvas);
        });

        it('should instantiate a worker and transfer control', () => {
            expect(proxy.worker).toBeDefined();
            expect(mockCanvas.transferControlToOffscreen).toHaveBeenCalled();
            expect(proxy.worker.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'INIT' }),
                expect.any(Array),
            );
        });

        it('should forward resize messages', () => {
            proxy.resize(1024, 768, 2);
            expect(proxy.worker.postMessage).toHaveBeenCalledWith(
                {
                    type: 'RESIZE',
                    width: 1024,
                    height: 768,
                    dpr: 2,
                },
                [],
            );
        });

        it('should forward data messages', () => {
            const note = { time: 1 };
            proxy.pushNote('bass', note);
            expect(proxy.worker.postMessage).toHaveBeenCalledWith(
                {
                    type: 'PUSH_NOTE',
                    name: 'bass',
                    event: note,
                },
                [],
            );
        });

        it('should terminate worker on destroy', () => {
            const terminateSpy = vi.spyOn(proxy.worker, 'terminate');
            proxy.destroy();
            expect(terminateSpy).toHaveBeenCalled();
        });
    });
});
