import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getState } from '../../../public/state.js';
import { getSoloistNote } from '../../../public/soloist.js';

vi.mock('../../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));

describe('Soloist Song Arc Logic', () => {
    const { groove, playback, soloist, arranger, harmony } = getState();
    let originalNow;

    beforeEach(() => {
        groove.genreFeel = 'Ska-Punk';
        soloist.style = 'ska';
        soloist.enabled = true;
        playback.bandIntensity = 0.5;
        playback.bpm = 120;
        playback.sessionTimer = 1; // 1 minute session
        playback.sessionStartTime = 1000; // Mock start time
        
        arranger.timeSignature = '4/4';
        arranger.totalSteps = 16;
        soloist.sessionSteps = 0;
        soloist.pitchHistory = [];
        soloist.motifBuffer = [];
        soloist.isResting = true;
        harmony.rhythmicMask = 0;

        originalNow = performance.now;
    });

    afterEach(() => {
        performance.now = originalNow;
    });

    const runSimulationStep = (timeOffsetMs, stepIndex) => {
        performance.now = () => 1000 + timeOffsetMs;
        // Ensure session start time is consistent with our mock clock
        // If performance.now is 1000 at start, and we want elapsed to be timeOffsetMs,
        // then sessionStartTime should be 1000.
        // It is already set in beforeEach: playback.sessionStartTime = 1000;
        
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        const note = getSoloistNote(chord, null, stepIndex, null, 5, 'ska', stepIndex % 16, false);
        return note ? (Array.isArray(note) ? note.length : 1) : 0;
    };

    it('should follow a maturity arc (Low -> High -> Low) based on session timer', () => {
        // We need to simulate continuous steps to allow sessionSteps to increment naturally
        // while also manipulating time.
        
        let warmupDensity = 0;
        let climaxDensity = 0;
        let cooldownDensity = 0;
        
        const totalSteps = 16 * 100; // 100 measures
        // 1 minute session -> 60000ms.
        // Step duration approx (60000 / totalSteps) if we map linearly, 
        // but we want to control time explicitly.
        
        for (let i = 0; i < totalSteps; i++) {
            // Map step 'i' to time 0 -> 60000
            const time = (i / totalSteps) * 60000;
            const notes = runSimulationStep(time, i);
            
            const progress = time / 60000;
            if (progress < 0.15) warmupDensity += notes;
            else if (progress > 0.65 && progress < 0.85) climaxDensity += notes;
            else if (progress > 0.90) cooldownDensity += notes;
        }
        
        // Normalize by duration of segment
        const warmupAvg = warmupDensity / (totalSteps * 0.15);
        const climaxAvg = climaxDensity / (totalSteps * 0.20);
        const cooldownAvg = cooldownDensity / (totalSteps * 0.10);

        console.log(`Densities: Warmup=${warmupAvg.toFixed(2)}, Climax=${climaxAvg.toFixed(2)}, Cooldown=${cooldownAvg.toFixed(2)}`);

        // Climax should be significantly higher than Warmup
        expect(climaxAvg).toBeGreaterThan(warmupAvg);
        
        // Cooldown should drop off from Climax
        expect(cooldownAvg).toBeLessThan(climaxAvg);
    });
});
