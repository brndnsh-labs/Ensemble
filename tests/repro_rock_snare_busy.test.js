import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../public/config.js';
import { applyGrooveOverrides } from '../public/engine/groove-engine.js';
import { getState } from '../public/state.js';
import { getStepInfo } from '../public/utils.js';

vi.mock('../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Rock Snare Density Reproduction', () => {
    const simulateRockPerformance = (numBars, intensity = 0.8, creativity = true) => {
        const mockState = {
            playback: { bandIntensity: intensity, bpm: 120, songMode: false },
            groove: {
                genreFeel: 'Rock',
                creativity: creativity,
                lastDrumPreset: 'Basic Rock',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                sectionMap: [{ id: 'test', start: 0, end: numBars * 16, label: 'Test' }],
                stepMap: [{ start: 0, end: numBars * 16, chord: { sectionId: 'test' } }],
            },
            soloist: { enabled: false, busySteps: 0 },
        };
        getState.mockReturnValue(mockState);

        const snareHits = [];
        const ts44 = TIME_SIGNATURES['4/4'];
        for (let bar = 0; bar < numBars; bar++) {
            for (let step = 0; step < 16; step++) {
                const globalStep = bar * 16 + step;
                const info = getStepInfo(globalStep, ts44, [], TIME_SIGNATURES);
                const params = {
                    step: globalStep,
                    inst: { name: 'Snare', muted: false, steps: [] },
                    stepVal: 0,
                    playback: mockState.playback,
                    groove: mockState.groove,
                    isDownbeat: info.isMeasureStart,
                    isBeatStart: info.isBeatStart,
                    isBackbeat: info.isBackbeat,
                    isGroupStart: info.isGroupStart,
                    beatIndex: info.beatIndex,
                    isOffbeat: info.isOffbeat,
                    isEOfBeat: info.isEOfBeat,
                    isAOfBeat: info.isAOfBeat,
                    isTurnaround: false,
                    stepsPerBar: 16,
                    loopStep: step,
                };
                const result = applyGrooveOverrides(params);
                if (result.shouldPlay) {
                    snareHits.push({ bar, step, velocity: result.velocity });
                }
            }
        }
        return snareHits;
    };

    it('should measure snare density in Rock 4/4 at MAX intensity', () => {
        const numBars = 100;
        const hits = simulateRockPerformance(numBars, 1.0, true);

        const backbeatHits = hits.filter((h) => h.step === 4 || h.step === 12).length;
        const nonBackbeatHits = hits.filter((h) => h.step !== 4 && h.step !== 12).length;
        const avgNonBackbeatPerBar = nonBackbeatHits / numBars;

        console.log(`\n--- ROCK SNARE DENSITY REPORT (Intensity 1.0) ---`);
        console.log(`Total Bars: ${numBars}`);
        console.log(
            `Backbeat Hits (expected 2/bar): ${backbeatHits} (Avg: ${(backbeatHits / numBars).toFixed(2)})`,
        );
        console.log(
            `Non-Backbeat Hits: ${nonBackbeatHits} (Avg: ${avgNonBackbeatPerBar.toFixed(2)} per bar)`,
        );

        // Distribution of non-backbeat hits
        const distribution = {};
        hits.filter((h) => h.step !== 4 && h.step !== 12).forEach((h) => {
            distribution[h.step] = (distribution[h.step] || 0) + 1;
        });
        console.log('Non-Backbeat Step Distribution:', distribution);
    });

    it('should BLOCK snare anticipations (steps 3 and 11) in Rock 4/4 with creativity', () => {
        const numBars = 100;
        const hits = simulateRockPerformance(numBars, 1.0, true);

        const step3Hits = hits.filter((h) => h.step === 3).length;
        const step11Hits = hits.filter((h) => h.step === 11).length;

        console.log(`\n--- ROCK SNARE ANTICIPATION CHECK ---`);
        console.log(`Step 3 Hits: ${step3Hits}`);
        console.log(`Step 11 Hits: ${step11Hits}`);

        expect(step3Hits).toBe(0);
        expect(step11Hits).toBe(0);
    });
});
