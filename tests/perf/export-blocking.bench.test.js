import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock postMessage globally before importing logic-worker
globalThis.postMessage = vi.fn();

// Import the worker logic
import { handleExport } from '../../public/engine/midi-worker-logic.js';
import { getState } from '../../public/state.js';

describe('Export Blocking Performance', () => {
    const { arranger, chords, bass, soloist, groove, harmony, playback } = getState();

    beforeEach(() => {
        vi.clearAllMocks();

        // Reset state
        arranger.progression = [];
        arranger.stepMap = [];
        arranger.sectionMap = [];
        arranger.totalSteps = 0;

        // Setup a large project to export
        // 3 minutes at 120 BPM = 3 * 120 = 360 beats
        // 16 steps per beat (internally?) No, 4 steps per beat usually.
        // PPQ 480.
        // Let's create a progression.

        const numSections = 50; // Enough to cause a delay
        const measuresPerSection = 4;
        const stepsPerMeasure = 16;
        const totalSteps = numSections * measuresPerSection * stepsPerMeasure;

        arranger.totalSteps = totalSteps;
        arranger.timeSignature = '4/4';
        playback.bpm = 120;

        let currentStep = 0;
        for (let i = 0; i < numSections; i++) {
            const sectionStart = currentStep;
            const sectionEnd = currentStep + measuresPerSection * stepsPerMeasure;

            arranger.sectionMap.push({
                start: sectionStart,
                end: sectionEnd,
                id: `s${i}`,
                label: `Section ${i}`,
            });

            for (let m = 0; m < measuresPerSection; m++) {
                const chordStart = currentStep;
                const chordEnd = currentStep + stepsPerMeasure;

                // Mock chord object
                const chord = {
                    rootMidi: 60,
                    quality: 'maj7',
                    freqs: [261.63, 329.63, 392.0, 493.88], // C E G B
                    intervals: [0, 4, 7, 11],
                    start: chordStart,
                    end: chordEnd,
                    duration: stepsPerMeasure,
                    beats: 4,
                    sectionId: `s${i}`,
                    sectionLabel: `Section ${i}`,
                };

                arranger.stepMap.push({
                    start: chordStart,
                    end: chordEnd,
                    chord: chord,
                });
                arranger.progression.push(chord);

                currentStep += stepsPerMeasure;
            }
        }

        // Enable all tracks to maximize processing
        chords.enabled = true;
        bass.enabled = true;
        soloist.enabled = true;
        harmony.enabled = true;
        groove.enabled = true;

        // Mock styles
        bass.style = 'basic';
        chords.style = 'strum8';
        soloist.style = 'lyrical';
        harmony.style = 'pad';
    });

    it('measures blocking time of async export', async () => {
        const start = performance.now();

        // Call handleExport directly
        // It should return almost immediately now
        handleExport({
            includedTracks: ['chords', 'bass', 'soloist', 'harmonies', 'drums'],
            targetDuration: 3, // 3 minutes
            loopMode: 'time',
            filename: 'test-export',
        });

        const end = performance.now();
        const blockingDuration = end - start;

        console.log(`[Improved] Export Blocking Time: ${blockingDuration.toFixed(2)}ms`);

        // Expect blocking time to be minimal (e.g. < 50ms)
        expect(blockingDuration).toBeLessThan(50);

        // Wait for completion
        await new Promise((resolve) => {
            const check = () => {
                const calls = globalThis.postMessage.mock.calls;
                if (calls.length > 0) {
                    const lastCall = calls[calls.length - 1][0];
                    if (lastCall.type === 'exportComplete' || lastCall.type === 'error') {
                        resolve();
                        return;
                    }
                }
                setTimeout(check, 10);
            };
            check();
        });

        const calls = globalThis.postMessage.mock.calls;
        const lastCall = calls[calls.length - 1][0];

        if (lastCall.type === 'error') {
            console.error('Export Error:', lastCall.data, lastCall.stack);
        }

        expect(lastCall.type).toBe('exportComplete');

        // Check if progress messages were sent
        const progressCalls = calls.filter((c) => c[0].type === 'exportProgress');
        expect(progressCalls.length).toBeGreaterThan(0);
        console.log(`Progress updates received: ${progressCalls.length}`);
    });
});
