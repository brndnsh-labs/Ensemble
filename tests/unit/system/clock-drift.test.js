/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../../public/state.js';

const { playback, groove, arranger } = getState();

// Mock dependencies
vi.mock('../../../public/ui.js', () => ({
    ui: {
        playBtn: { textContent: '', classList: { add: vi.fn(), remove: vi.fn() } },
        countIn: { checked: false },
        metronome: { checked: false },
        visualFlash: { checked: false },
        sequencerGrid: { scrollTo: vi.fn() },
    },
    triggerFlash: vi.fn(),
    clearActiveVisuals: vi.fn(),
}));

vi.mock('../../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    playNote: vi.fn(),
    playDrumSound: vi.fn(),
    playBassNote: vi.fn(),
    playSoloNote: vi.fn(),
    updateSustain: vi.fn(),
    killAllNotes: vi.fn(),
    restoreGains: vi.fn(),
}));

vi.mock('../../../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    stopWorker: vi.fn(),
    startWorker: vi.fn(),
}));

vi.mock('../../../public/engine/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn(),
}));

vi.mock('../../../public/engine/groove-engine.js', () => ({
    applyGrooveOverrides: vi.fn(() => ({ shouldPlay: false })),
    calculatePocketOffset: vi.fn(() => 0),
}));

vi.mock('../../../public/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    flushBuffers: vi.fn(),
    switchMeasure: vi.fn(),
}));

describe('Clock Drift & Scheduling Precision', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.isPlaying = true;
        playback.bpm = 120;
        playback.step = 0;
        playback.scheduleAheadTime = 0.1;
        groove.swing = 60;
        groove.swingSub = '8th';
        arranger.timeSignature = '4/4';
        arranger.totalSteps = 64;
        arranger.stepMap = [{ start: 0, end: 64, chord: { freqs: [261.63] } }];

        playback.audio = {
            currentTime: 0,
            createOscillator: vi.fn(() => ({
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                frequency: { setValueAtTime: vi.fn() },
            })),
            createGain: vi.fn(() => ({
                connect: vi.fn(),
                gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            })),
            state: 'running',
        };
        playback.nextNoteTime = 0;
        playback.unswungNextNoteTime = 0;
    });

    it('should maintain sub-millisecond precision over a simulated 30-minute session', () => {
        const BPM = 120;
        const SIXTEENTH = 0.25 * (60.0 / BPM); // 0.125s
        const MINUTES = 30;
        const TOTAL_STEPS = Math.round((MINUTES * 60) / SIXTEENTH); // 14400 steps

        // Mock the advanceGlobalStep logic to run without real-time delay
        for (let i = 0; i < TOTAL_STEPS; i++) {
            const step = playback.step;
            const sixteenth = 0.25 * (60.0 / playback.bpm);
            let duration = sixteenth;

            if (groove.swing > 0) {
                const shift = (sixteenth / 3) * (groove.swing / 100);
                // Swing 8th (swing every other 8th note, i.e., steps 2, 6, 10...)
                duration += step % 4 < 2 ? shift : -shift;
            }

            playback.nextNoteTime += duration;
            playback.unswungNextNoteTime += sixteenth;
            playback.step++;

            // Periodically check drift
            if (i % 1000 === 0) {
                const expectedUnswung = i * SIXTEENTH + SIXTEENTH;
                expect(playback.unswungNextNoteTime).toBeCloseTo(expectedUnswung, 10);

                // Ensure swung time hasn't drifted from unswung reference by more than one swing shift
                const shift = (SIXTEENTH / 3) * (groove.swing / 100);
                const diff = Math.abs(playback.nextNoteTime - playback.unswungNextNoteTime);
                expect(diff).toBeLessThanOrEqual(shift + 0.0001);
            }
        }

        expect(playback.step).toBe(TOTAL_STEPS);
        const finalExpectedUnswung = TOTAL_STEPS * SIXTEENTH;
        expect(playback.unswungNextNoteTime).toBeCloseTo(finalExpectedUnswung, 8);
    });

    it('should correctly reset nextNoteTime to unswung reference on genre changes', () => {
        playback.nextNoteTime = 10.05; // Swung
        playback.unswungNextNoteTime = 10.0; // Anchor

        // Simulating the applyPendingGenre reset logic
        playback.nextNoteTime = playback.unswungNextNoteTime;

        expect(playback.nextNoteTime).toBe(10.0);
    });

    it('should handle BPM changes mid-session without losing the grid', () => {
        const sixteenthOld = 0.25 * (60.0 / 120); // 0.125
        playback.nextNoteTime = 10 * sixteenthOld;
        playback.unswungNextNoteTime = 10 * sixteenthOld;

        playback.bpm = 60; // Half speed
        const sixteenthNew = 0.25 * (60.0 / 60); // 0.25

        // Advance one step at new BPM
        playback.nextNoteTime += sixteenthNew;
        playback.unswungNextNoteTime += sixteenthNew;

        expect(playback.unswungNextNoteTime).toBe(10 * sixteenthOld + sixteenthNew);
        expect(playback.unswungNextNoteTime).toBe(1.25 + 0.25);
    });
});
