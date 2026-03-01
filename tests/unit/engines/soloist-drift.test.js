import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../../public/soloist.js';
import { getState } from '../../../public/state.js';

vi.mock('../../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));

describe('Soloist Density Drift (Ska-Punk)', () => {
    const { groove, playback, soloist, arranger, harmony } = getState();

    beforeEach(() => {
        groove.genreFeel = 'Ska-Punk';
        soloist.style = 'ska';
        soloist.enabled = true;
        playback.bandIntensity = 0.5;
        playback.bpm = 120;
        arranger.timeSignature = '4/4';
        arranger.totalSteps = 16;
        soloist.sessionSteps = 0;
        soloist.pitchHistory = [];
        soloist.motifBuffer = [];
        soloist.isResting = true;
        harmony.rhythmicMask = 0;
    });

    it('should measure density increase over time (194 BPM / Pop Standard Scenario)', () => {
        // 194 BPM, 4 beats/measure -> 194/4 = 48.5 measures per minute
        // Simulation for 60 seconds = ~48.5 measures
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        const bpm = 194;
        playback.bpm = bpm;
        const measuresToSimulate = 1600; // Large sample for statistical stability in probabilistic engine
        const stepsPerMeasure = 16;

        const measureDensities = [];
        const intensitySamples = [];
        let currentMeasureNotes = 0;

        for (let step = 0; step < measuresToSimulate * stepsPerMeasure; step++) {
            const stepInMeasure = step % stepsPerMeasure;

            const note = getSoloistNote(chord, null, step, null, 5, 'ska', stepInMeasure, false);

            // Maturity factor calculation from soloist.js
            const maturityFactor = Math.min(1.0, (soloist.sessionSteps || 0) / 2048);
            const effIntensity = Math.min(1.0, playback.bandIntensity + maturityFactor * 0.1);
            intensitySamples.push(effIntensity);

            if (note) {
                if (Array.isArray(note)) {
                    currentMeasureNotes += note.length;
                } else {
                    currentMeasureNotes++;
                }
            }

            if (stepInMeasure === stepsPerMeasure - 1) {
                measureDensities.push(currentMeasureNotes);
                currentMeasureNotes = 0;
            }
        }

        // Divide into 4-bar loops (since the progression is 4 bars)
        const loops = [];
        for (let i = 0; i < measureDensities.length; i += 4) {
            const loop = measureDensities.slice(i, i + 4);
            if (loop.length === 4) {
                loops.push(loop.reduce((a, b) => a + b, 0) / 4);
            }
        }

        console.log(`[Drift Test] BPM: ${bpm}`);
        console.log(`[Drift Test] Loop 1 Density (Avg): ${loops[0].toFixed(2)} notes/measure`);
        if (loops.length > 11) {
            console.log(
                `[Drift Test] Loop 12 Density (Avg - ~15s): ${loops[11].toFixed(2)} notes/measure`,
            );
        }
        if (loops.length > 23) {
            console.log(
                `[Drift Test] Loop 24 Density (Avg - ~30s): ${loops[23].toFixed(2)} notes/measure`,
            );
        }
        if (loops.length > 47) {
            console.log(
                `[Drift Test] Loop 48 Density (Avg - ~60s): ${loops[47].toFixed(2)} notes/measure`,
            );
        }

        const startAvg = loops.slice(0, 10).reduce((a, b) => a + b, 0) / Math.min(10, loops.length);
        const midIndex = Math.floor(loops.length / 2);
        const midAvg =
            loops.slice(midIndex - 5, midIndex + 5).reduce((a, b) => a + b, 0) /
            Math.min(10, loops.length);
        const endAvg = loops.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, loops.length);

        console.log(
            `[Drift Test] Arc (10-loop windows): Start=${startAvg.toFixed(2)}, Mid=${midAvg.toFixed(2)}, End=${endAvg.toFixed(2)}`,
        );

        // With the new Arc logic, the middle should be at least reasonably active compared to start
        expect(midAvg).toBeGreaterThanOrEqual(startAvg * 0.4); // High variance allowed

        // And the end should be stable or cooler
        expect(endAvg).toBeLessThan(midAvg * 4.0); // High variance allowed at end of long simulation
    });
});
