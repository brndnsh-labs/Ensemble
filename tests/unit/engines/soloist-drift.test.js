import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getState } from '../../../public/state.js';
import { getSoloistNote } from '../../../public/soloist.js';

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

    it('should measure density increase over time', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        const measuresToSimulate = 500;
        const stepsPerMeasure = 16;
        
        const measureDensities = [];
        const phraseLengths = [];
        const intensitySamples = [];
        let currentPhraseLen = 0;
        let currentMeasureNotes = 0;
        let restSteps = 0;
        let activeSteps = 0;

        for (let step = 0; step < measuresToSimulate * stepsPerMeasure; step++) {
            const stepInMeasure = step % stepsPerMeasure;
            
            const note = getSoloistNote(chord, null, step, null, 5, 'ska', stepInMeasure, false);
            
            // Log actual effective intensity (requires peaking into logic used in soloist.js)
            // Since effectiveIntensity is local to getSoloistNote, we verify it by the side-effects or state if possible.
            // But we already know the logic from the code read.
            const maturityFactor = Math.min(1.0, (soloist.sessionSteps || 0) / 1024);
            const effIntensity = Math.min(1.0, playback.bandIntensity + (maturityFactor * 0.1));
            intensitySamples.push(effIntensity);
            
            if (note) {
                if (Array.isArray(note)) currentMeasureNotes += note.length;
                else currentMeasureNotes++;
                activeSteps++;
                currentPhraseLen++;
            } else if (soloist.isResting) {
                restSteps++;
                if (currentPhraseLen > 0) {
                    phraseLengths.push(currentPhraseLen);
                    currentPhraseLen = 0;
                }
            }

            if (stepInMeasure === stepsPerMeasure - 1) {
                measureDensities.push(currentMeasureNotes);
                currentMeasureNotes = 0;
            }
        }

        const startEffInt = intensitySamples.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
        const endEffInt = intensitySamples.slice(-20).reduce((a, b) => a + b, 0) / 20;

        console.log(`[Drift Test] Start Effective Intensity: ${startEffInt.toFixed(2)}`);
        console.log(`[Drift Test] End Effective Intensity: ${endEffInt.toFixed(2)}`);

        const startPhrases = phraseLengths.slice(0, 10);
        const endPhrases = phraseLengths.slice(-10);
        const startPhraseAvg = startPhrases.reduce((a, b) => a + b, 0) / startPhrases.length;
        const endPhraseAvg = endPhrases.reduce((a, b) => a + b, 0) / endPhrases.length;

        console.log(`[Drift Test] Start Phrase Len (Avg): ${startPhraseAvg.toFixed(2)} steps`);
        console.log(`[Drift Test] End Phrase Len (Avg): ${endPhraseAvg.toFixed(2)} steps`);

        const startAvg = measureDensities.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
        const endAvg = measureDensities.slice(480, 500).reduce((a, b) => a + b, 0) / 20;
        const overallDutyCycle = activeSteps / (measuresToSimulate * stepsPerMeasure);

        console.log(`[Drift Test] Start Density (Avg): ${startAvg.toFixed(2)} notes/measure`);
        console.log(`[Drift Test] End Density (Avg): ${endAvg.toFixed(2)} notes/measure`);
        console.log(`[Drift Test] Overall Duty Cycle: ${(overallDutyCycle * 100).toFixed(1)}%`);
        console.log(`[Drift Test] Total Rest Steps: ${restSteps}`);

        console.log(`[Drift Test] Start Density (Avg): ${startAvg.toFixed(2)} notes/measure`);
        console.log(`[Drift Test] End Density (Avg): ${endAvg.toFixed(2)} notes/measure`);
        console.log(`[Drift Test] Increase: ${((endAvg / startAvg - 1) * 100).toFixed(1)}%`);

        // Assert that density does not increase significantly (e.g. > 25%)
        expect(endAvg / startAvg).toBeLessThan(1.25);
    });
});
