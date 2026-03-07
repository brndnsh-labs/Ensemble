import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGrooveOverrides } from '../../../public/engine/groove-engine.js';

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
    };
    return {
        getState: () => mockState,
    };
});

describe('Groove Engine - Generative (Creativity) Mode', () => {
    let mockParams;

    beforeEach(() => {
        mockParams = {
            step: 0,
            inst: { name: 'Snare', muted: false },
            stepVal: 0, // Not playing in grid
            playback: { bandIntensity: 0.5, complexity: 0.5 },
            groove: {
                creativity: false,
                genreFeel: 'Rock',
                lastDrumPreset: 'Basic Rock',
                instruments: [],
            },
            isDownbeat: false,
            isQuarter: false,
            isBackbeat: false,
            isGroupStart: false,
        };
    });

    it('should NOT generate extra hits when creativity is disabled', () => {
        mockParams.groove.creativity = false;
        mockParams.step = 1; // Offbeat

        // Run many times to ensure no random hits
        for (let i = 0; i < 100; i++) {
            const result = applyGrooveOverrides(mockParams);
            expect(result.shouldPlay).toBe(false);
        }
    });

    it('should generate extra hits (Entropy) when creativity is enabled', () => {
        mockParams.groove.creativity = true;
        mockParams.playback.bandIntensity = 1.0; // Max probability
        mockParams.step = 7; // Syncopated step (not blocked for Rock)

        let generatedHits = 0;
        for (let i = 0; i < 200; i++) {
            const result = applyGrooveOverrides(mockParams);
            if (result.shouldPlay) {
                generatedHits++;
            }
        }

        // Probability is bandIntensity * 0.15 = 0.15.
        // In 200 runs, we expect ~30 hits.
        expect(generatedHits).toBeGreaterThan(0);
    });

    it('should respect genre boundaries even in creativity mode', () => {
        mockParams.groove.creativity = true;
        mockParams.playback.bandIntensity = 1.0;
        mockParams.step = 0; // Downbeat - typically reserved for core genre markers
        mockParams.inst.name = 'HiHat';

        // The Entropy block only adds hits if stepVal === 0 AND it's a syncopated step
        // In Rock, applyGrooveOverrides might force HiHat on quarters anyway,
        // but let's check our new Entropy block specifically.

        // Reset stepVal to 0 and ensure it's NOT a syncopated step for Entropy
        mockParams.step = 0;

        let entropyHits = 0;
        for (let i = 0; i < 100; i++) {
            const result = applyGrooveOverrides(mockParams);
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
