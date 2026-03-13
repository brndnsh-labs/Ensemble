/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { draw } from '../../../public/animation-loop.js';
import * as Engine from '../../../public/engine/engine.js';
import * as InstrumentController from '../../../public/instrument-controller.js';
import { dispatch, getState } from '../../../public/state.js';

vi.mock('../../../public/instrument-controller.js', () => ({
    switchMeasure: vi.fn(),
}));

vi.mock('../../../public/engine/engine.js', () => ({
    getVisualTime: vi.fn(),
}));

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    const mockState = {
        playback: {
            isDrawing: true,
            audio: { currentTime: 0 },
            isPlaying: true,
            drawQueue: [],
            lastPlayingStep: 0,
            bpm: 120,
        },
        groove: { followPlayback: true, currentMeasure: 0 },
        chords: { lastActiveChordIndex: null, octave: 65 },
        bass: { octave: 38 },
        soloist: { octave: 72 },
        harmony: { octave: 60 },
        vizState: { enabled: true },
        arranger: { timeSignature: '4/4' },
    };
    return {
        ...actual,
        getState: () => mockState,
        dispatch: vi.fn(),
    };
});

describe('Animation Loop', () => {
    let mockViz;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        mockViz = {
            clear: vi.fn(),
            pushChord: vi.fn(),
            pushNote: vi.fn(),
            truncateNotes: vi.fn(),
            setRegister: vi.fn(),
            render: vi.fn(),
            isFillActive: false,
        };

        const state = getState();
        state.playback.isDrawing = true;
        state.playback.audio = { currentTime: 0 };
        state.playback.isPlaying = true;
        state.playback.drawQueue = [];
        state.vizState.enabled = true;

        // Mock requestAnimationFrame to avoid infinite loops in test
        global.requestAnimationFrame = vi.fn();
    });

    it('should exit early if isDrawing is false', () => {
        getState().playback.isDrawing = false;
        draw(mockViz);
        expect(global.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should handle missing audio context', () => {
        getState().playback.audio = null;
        draw(mockViz);
        expect(getState().playback.isDrawing).toBe(false);
    });

    it('should handle stop state and clear viz', () => {
        const state = getState();
        state.playback.isPlaying = false;
        state.chords.lastActiveChordIndex = 1;

        draw(mockViz);

        expect(state.playback.isDrawing).toBe(false);
        expect(state.chords.lastActiveChordIndex).toBe(null);
        expect(dispatch).toHaveBeenCalledWith('VIS_RESET');
        expect(mockViz.clear).toHaveBeenCalled();
    });

    it('should consume drum_vis events and switch measure', () => {
        const state = getState();
        Engine.getVisualTime.mockReturnValue(1.0);
        state.playback.drawQueue.push({ type: 'drum_vis', time: 0.5, step: 16 });

        draw(mockViz);

        // 16 steps in 4/4 = measure 1 (0-indexed measure starts at 0, 16 is measure 1)
        expect(InstrumentController.switchMeasure).toHaveBeenCalledWith(1, true);
        expect(state.playback.lastPlayingStep).toBe(16);
    });

    it('should consume chord_vis events and dispatch update', () => {
        const state = getState();
        Engine.getVisualTime.mockReturnValue(1.0);
        state.playback.drawQueue.push({
            type: 'chord_vis',
            time: 0.5,
            index: 2,
            chordNotes: [60, 64, 67],
        });

        draw(mockViz);

        expect(state.chords.lastActiveChordIndex).toBe(2);
        expect(dispatch).toHaveBeenCalledWith('VIS_UPDATE', { type: 'chord', index: 2 });
        expect(mockViz.pushChord).toHaveBeenCalledWith(
            expect.objectContaining({ index: 2, notes: [60, 64, 67] }),
        );
    });

    it('should consume note visual events (bass, soloist, harmony, drums)', () => {
        const state = getState();
        Engine.getVisualTime.mockReturnValue(1.0);
        state.playback.drawQueue.push({ type: 'bass_vis', time: 0.1, name: 'C2' });
        state.playback.drawQueue.push({ type: 'soloist_vis', time: 0.2, name: 'E4' });
        state.playback.drawQueue.push({ type: 'harmony_vis', time: 0.3, name: 'G4' });
        state.playback.drawQueue.push({ type: 'drums_vis', time: 0.4 });

        draw(mockViz);

        expect(mockViz.pushNote).toHaveBeenCalledWith(
            'bass',
            expect.objectContaining({ noteName: 'C2' }),
        );
        expect(mockViz.pushNote).toHaveBeenCalledWith(
            'soloist',
            expect.objectContaining({ noteName: 'E4' }),
        );
        expect(mockViz.pushNote).toHaveBeenCalledWith(
            'harmony',
            expect.objectContaining({ noteName: 'G4' }),
        );
        expect(mockViz.pushNote).toHaveBeenCalledWith('drums', expect.anything());
        expect(mockViz.truncateNotes).toHaveBeenCalledWith('soloist', 0.2);
    });

    it('should consume fill_active events', () => {
        const state = getState();
        Engine.getVisualTime.mockReturnValue(1.0);
        state.playback.drawQueue.push({ type: 'fill_active', time: 0.5, active: true });

        draw(mockViz);

        expect(mockViz.isFillActive).toBe(true);
    });

    it('should clean up old events from queue', () => {
        const state = getState();
        Engine.getVisualTime.mockReturnValue(5.0); // Now is 5.0
        // Time < 3.0 (5.0 - 2.0) should be shifted
        state.playback.drawQueue.push({ type: 'old_event', time: 1.0 });
        state.playback.drawQueue.push({ type: 'new_event', time: 4.0 });

        draw(mockViz);

        // Old event is gone, new event is processed (but unrecognized type does nothing)
        expect(state.playback.drawQueue.length).toBe(0);
    });

    it('should truncate queue if it gets too large', () => {
        const state = getState();
        Engine.getVisualTime.mockReturnValue(0.0); // Don't process any
        // Push 301 events in future
        for (let i = 0; i < 301; i++) {
            state.playback.drawQueue.push({ type: 'future', time: 100.0 + i });
        }

        draw(mockViz);

        // Queue size > 300 triggers slice down to 200
        expect(state.playback.drawQueue.length).toBe(200);
    });

    it('should disable visualizer on repeated errors', () => {
        const state = getState();
        Engine.getVisualTime.mockReturnValue(1.0);
        mockViz.render.mockImplementation(() => {
            throw new Error('Render fail');
        });

        // Call draw 4 times to trigger the crash threshold (>3)
        draw(mockViz);
        draw(mockViz);
        draw(mockViz);
        draw(mockViz);

        expect(state.vizState.enabled).toBe(false);
    });

    it('should monitor performance and trigger emergency lookahead on missed frames', () => {
        // Need to simulate performance.now() returning increasing values
        // First frame
        vi.spyOn(performance, 'now').mockReturnValue(100);
        draw(mockViz);

        // Simulate missing frames (delta > 35ms, need > 15 times to trigger)
        for (let i = 1; i <= 16; i++) {
            vi.spyOn(performance, 'now').mockReturnValue(100 + i * 40); // 40ms delta
            draw(mockViz);
        }

        expect(dispatch).toHaveBeenCalledWith('TRIGGER_EMERGENCY_LOOKAHEAD');
    });
});
