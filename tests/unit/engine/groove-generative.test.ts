import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import { applyGrooveOverrides } from '../../../public/engine/groove-engine.js';
import { getState } from '../../../public/state.js';
import { getStepInfo } from '../../../public/utils.js';

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        soloist: { enabled: false, busySteps: 0 },
        groove: {
            creativity: false,
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

describe('Groove Engine - Generative (Creativity) Mode', () => {
    const ts44 = TIME_SIGNATURES['4/4'];

    const createParams = (step: any, instName: any, creativity = false, intensity = 0.5) => {
        const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
        return {
            step,
            inst: { name: instName, muted: false },
            stepVal: 0,
            playback: { bandIntensity: intensity, complexity: 0.5 },
            groove: {
                creativity: creativity,
                genreFeel: 'Rock',
                lastDrumPreset: 'Basic Rock',
                instruments: [],
            },
            isDownbeat: info.isMeasureStart,
            isBeatStart: info.isBeatStart,
            isBackbeat: info.isBackbeat,
            isGroupStart: info.isGroupStart,
            beatIndex: info.beatIndex,
            isOffbeat: info.isOffbeat,
            isEOfBeat: info.isEOfBeat,
            isAOfBeat: info.isAOfBeat,
            tsConfig: info.tsConfig,
        };
    };

    it('should NOT generate extra hits when creativity is disabled', () => {
        const step = 1; // Offbeat

        // Run many times to ensure no random hits
        for (let i = 0; i < 100; i++) {
            const params = createParams(step, 'Snare', false);
            const result = applyGrooveOverrides(getState(), params);
            expect(result.shouldPlay).toBe(false);
        }
    });

    it('should generate extra hits (Entropy) when creativity is enabled', () => {
        const step = 7; // Syncopated step (not blocked for Rock)

        let generatedHits = 0;
        for (let i = 0; i < 200; i++) {
            const params = createParams(step, 'Snare', true, 1.0);
            const result = applyGrooveOverrides(getState(), params);
            if (result.shouldPlay) {
                generatedHits++;
            }
        }

        // Probability is bandIntensity * 0.15 = 0.15.
        // In 200 runs, we expect ~30 hits.
        expect(generatedHits).toBeGreaterThan(0);
    });

    it('should respect genre boundaries even in creativity mode', () => {
        const step = 0; // Downbeat

        let entropyHits = 0;
        for (let i = 0; i < 100; i++) {
            const params = createParams(step, 'HiHat', true, 1.0);
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
