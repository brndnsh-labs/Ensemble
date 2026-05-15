// @ts-nocheck
import { describe, expect, it } from 'vitest';
import * as Metal from '../../../public/engine/grooves/metal.js';
import * as Shred from '../../../public/engine/grooves/shred.js';

describe('Metal/Shred Genre Integrity', () => {
    const createBaseContext = (overrides = {}) => ({
        inst: { name: 'Kick', muted: false },
        playback: { bandIntensity: 0.8 },
        isDownbeat: false,
        isBeatStart: false,
        isBackbeat: false,
        isOffbeat: false,
        isEOfBeat: false,
        isAOfBeat: false,
        beatIndex: 0,
        drumComplexity: 0.5,
        sectionSeed: 0.5,
        stepsPerBar: 16,
        loopStep: 0,
        isTurnaround: false,
        ...overrides,
    });

    const createBaseState = () => ({
        shouldPlay: false,
        velocity: 1.0,
        soundName: '',
        instTimeOffset: 0,
    });

    it('should export the same config and functions from both metal and shred', () => {
        expect(Metal.config).toEqual(Shred.config);
        expect(Metal.getMotif).toBe(Shred.getMotif);
        expect(Metal.applyOverrides).toBe(Shred.applyOverrides);
    });

    it('should handle muted instruments (coverage for line 70)', () => {
        const context = createBaseContext({ inst: { name: 'Kick', muted: true } });
        const state = createBaseState();
        const result = Metal.applyOverrides(context, state);
        expect(result).toBe(state);
    });

    describe('Motif Selection (getMotif)', () => {
        it('should return Motif 0 for low complexity or intensity', () => {
            expect(Metal.getMotif(0.5, 0.1, 0.8)).toBe(0);
            expect(Metal.getMotif(0.5, 0.5, 0.2)).toBe(0);
        });

        it('should return Motif 4 (Blast Beat) for high intensity and specific seed', () => {
            // High Intensity (>0.8), seed > 0.6
            expect(Metal.getMotif(0.7, 0.8, 0.9)).toBe(4);
        });

        it('should return correct motifs for medium-high intensity (coverage for lines 31-37)', () => {
            // Intensity between 0.65 and 0.8 (INTENSITY_BANDS.HIGH)
            expect(Metal.getMotif(0.2, 0.5, 0.7)).toBe(1); // seed < 0.3
            expect(Metal.getMotif(0.5, 0.5, 0.7)).toBe(2); // seed < 0.7
            expect(Metal.getMotif(0.8, 0.5, 0.7)).toBe(3); // seed >= 0.7
        });
    });

    describe('Kick Drum Patterns', () => {
        it('should play Standard Heavy (Motif 0) on beat starts but not backbeats', () => {
            const context = createBaseContext({
                playback: { bandIntensity: 0.3 }, // Forces Motif 0
                isBeatStart: true,
                isBackbeat: false,
            });
            const result = Metal.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
        });

        it('should play Standard Heavy on offbeat of beat 2 (coverage for line 88)', () => {
            const context = createBaseContext({
                playback: { bandIntensity: 0.3 }, // Forces Motif 0
                isOffbeat: true,
                beatIndex: 2,
            });
            const result = Metal.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
        });

        it('should play 8th notes in Motif 1', () => {
            const context = createBaseContext({
                playback: { bandIntensity: 0.5 },
                sectionSeed: 0.7, // Forces Motif 1
                isOffbeat: true,
            });
            const result = Metal.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
        });

        it('should humanize continuous runs (coverage for line 118)', () => {
            const context = createBaseContext({
                playback: { bandIntensity: 0.9 },
                sectionSeed: 0.5, // Forces Motif 3 (Continuous 16ths)
                isBeatStart: false,
                isEOfBeat: true,
            });
            const state = createBaseState();
            const result = Metal.applyOverrides(context, state);
            expect(result.shouldPlay).toBe(true);
            expect(result.instTimeOffset).not.toBe(0);
        });
    });

    describe('Snare Patterns', () => {
        it('should play Blast Beat at high intensity (coverage for lines 127-132)', () => {
            const context = createBaseContext({
                inst: { name: 'Snare' },
                playback: { bandIntensity: 0.95 },
                sectionSeed: 0.9, // Forces Motif 4
                isOffbeat: true,
            });
            const result = Shred.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
            expect(result.soundName).toBe('Snare');
        });

        it('should use Sidestick for low intensity (coverage for line 153)', () => {
            const context = createBaseContext({
                inst: { name: 'Snare' },
                playback: { bandIntensity: 0.2 },
                isBackbeat: true,
            });
            const result = Metal.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
            expect(result.soundName).toBe('Sidestick');
        });
    });

    describe('Cymbals/Hats', () => {
        it('should use HiHat for low-medium intensity (coverage for line 170)', () => {
            const context = createBaseContext({
                inst: { name: 'HiHat' },
                playback: { bandIntensity: 0.4 },
                isOffbeat: true,
            });
            const result = Metal.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
            expect(result.soundName).toBe('HiHat');
        });

        it('should use Open hat for medium-high intensity (coverage for line 169)', () => {
            const context = createBaseContext({
                inst: { name: 'HiHat' },
                playback: { bandIntensity: 0.6 },
                isOffbeat: true,
            });
            const result = Metal.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
            expect(result.soundName).toBe('Open');
        });
    });
});
