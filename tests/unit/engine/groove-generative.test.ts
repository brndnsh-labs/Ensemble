import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import { applyGrooveOverrides } from '../../../public/engine/groove-engine.js';
import { getState } from '../../../public/state.js';
import type { EnsembleState } from '../../../public/types.js';
import { getStepInfo } from '../../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        groove: {
            genreFeel: 'Rock',
            lastDrumPreset: 'Basic Rock',
            instruments: [],
        },
        playback: { bandIntensity: 0.5, complexity: 0.5 },
        arranger: { timeSignature: '4/4', stepMap: [] },
    };
    return {
        stateMap: mockState,
        getState: () => mockState,
    };
});

describe('Groove Engine - Generative Mode', () => {
    const ts44 = TIME_SIGNATURES['4/4'];

    const createParams = (step: any, instName: any, intensity = 0.5) => {
        const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
        return {
            step,
            inst: { name: instName, muted: false },
            stepVal: 0,
            playback: {
                bandIntensity: intensity,
                complexity: 0.5,
            } as unknown as EnsembleState['playback'],
            groove: {
                genreFeel: 'Rock',
                lastDrumPreset: 'Basic Rock',
                instruments: [],
            } as unknown as EnsembleState['groove'],
            isDownbeat: info.isMeasureStart,
            isBeatStart: info.isBeatStart,
            isBackbeat: info.isBackbeat,
            isGroupStart: info.isGroupStart,
            beatIndex: info.beatIndex,
            isOffbeat: info.isOffbeat,
            isEOfBeat: info.isEOfBeat,
            isAOfBeat: info.isAOfBeat,
            tsConfig: info.tsConfig,
            sectionOccurrence: 0,
            isFinalMeasure: false,
        };
    };

    it('should generate extra hits (Entropy) in generative mode', () => {
        // why: Epic 12 S4 — after the Math.random()→scrambleHash migration the entropy
        // gate is deterministic per (barIndex, sectionId, loopStep). Repeating the SAME
        // step 200× now always gives the same hash → always fires or never fires, making
        // the old "repeat 200× and check > 0" approach a tautology.
        //
        // New approach: sweep across 200 DIFFERENT syncopated steps across many bars.
        // Each unique (barIndex, loopStep) pair produces a different scrambleHash value,
        // giving a spread of gate-fire decisions. Rock entropyMultiplier=0.05, intensity=1.0
        // → threshold 0.05. scrambleHash is well-distributed, so ~5% of the 200 distinct
        // steps should fire. Expect at least 1 hit out of 200 (very conservative lower
        // bound that guards against the branch being dead without relying on exact counts).
        let generatedHits = 0;
        // Syncopated steps in 4/4: loopStep % 2 === 1 (i.e. odd positions 1,3,5,7,9,11,13,15)
        // blocked steps for Rock: [3,5,11,13] (adjacent to backbeat) and [1,9] (e-of-beat)
        // non-blocked syncopated step: 7 or 15 → use loopStep=7 (step = bar*16 + 7)
        for (let bar = 0; bar < 200; bar++) {
            const step = bar * 16 + 7; // always loopStep=7 (syncopated, non-blocked in Rock)
            const params = createParams(step, 'Snare', 1.0);
            const result = applyGrooveOverrides(getState(), params);
            if (result.shouldPlay) {
                generatedHits++;
            }
        }

        // With entropyMultiplier=0.05 at intensity=1.0, ~5% of steps should fire.
        // Over 200 distinct bars, expect ~10 hits. Lower bound 1 gives wide
        // stochastic headroom while still guarding against the branch being dead.
        expect(generatedHits).toBeGreaterThan(0);
    });

    it('should produce well-distributed ghost-snare velocity samples (draw 2)', () => {
        // why: Epic 12 S4 patch — the entropy-gate test above only exercises
        // draw 1 (gate fire/no-fire). This test independently asserts draws 2
        // (ghost-snare velocity) lands in the documented range [0.10, 0.25)
        // AND spans a non-trivial portion of that range — guards against a
        // regression that makes scrambleHash((_entropyBaseSeed + 3) | 0)
        // return a constant or correlate with draw 1.
        const velocities: number[] = [];
        for (let bar = 0; bar < 400; bar++) {
            const step = bar * 16 + 7; // loopStep=7 (non-blocked syncopated)
            const params = createParams(step, 'Snare', 1.0);
            const result = applyGrooveOverrides(getState(), params);
            if (result.shouldPlay && typeof result.velocity === 'number') {
                velocities.push(result.velocity);
            }
        }

        // Need a meaningful sample to assert distribution.
        expect(velocities.length).toBeGreaterThan(5);

        const min = Math.min(...velocities);
        const max = Math.max(...velocities);
        // why: ghost-snare base assignment is 0.10 + scrambleHash * 0.15
        // (∈ [0.10, 0.25)). Downstream velocity scaling can lift the upper
        // bound modestly, so the assertion bands the OUTPUT velocity to a
        // ghost-quiet range and guards against the draw collapsing to a
        // constant. A draw returning the same value 5+ times across 400
        // bars would shrink the spread below 0.04.
        expect(min).toBeGreaterThanOrEqual(0.09);
        expect(max).toBeLessThan(0.35);
        expect(max - min).toBeGreaterThan(0.04);
    });

    it('should respect genre boundaries even in generative mode', () => {
        const step = 0; // Downbeat

        let entropyHits = 0;
        for (let i = 0; i < 100; i++) {
            const params = createParams(step, 'HiHat', 1.0);
            const result = applyGrooveOverrides(getState(), params);
            // In Rock, Downbeat HiHat might be forced to play by global logic,
            // but we want to ensure ENTROPY doesn't just fire everywhere.
            // Our entropy block uses (loopStep % 2 === 1) or (loopStep % 4 === 2).
            // Step 0 matches neither.
            if (result.shouldPlay && result.velocity < 0.5) {
                entropyHits++; // Entropy hits are low velocity
            }
        }

        expect(entropyHits).toBe(0);
    });
});
