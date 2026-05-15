// @ts-nocheck
import { describe, expect, it } from 'vitest';
import * as HipHop from '../../../public/engine/grooves/hiphop.js';

describe('HipHop Genre Integrity', () => {
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
        barIndex: 0,
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

    it('should have a valid genre config', () => {
        expect(HipHop.config).toBeDefined();
        expect(HipHop.config.entropyMultiplier).toBe(0.08);
    });

    it('should handle muted instruments (line 57)', () => {
        const context = createBaseContext({ inst: { name: 'Kick', muted: true } });
        const state = createBaseState();
        const result = HipHop.applyOverrides(context, state);
        expect(result).toBe(state);
    });

    describe('Motif Selection (getMotif)', () => {
        it('should return Motif 0 for low complexity/intensity', () => {
            expect(HipHop.getMotif(0.5, 0.1, 0.8)).toBe(0);
            expect(HipHop.getMotif(0.5, 0.5, 0.2)).toBe(0);
        });

        it('should return Motif 0 for low-mid intensity and low seed (line 25)', () => {
            expect(HipHop.getMotif(0.4, 0.5, 0.5)).toBe(0);
        });

        it('should return Motif 1 for low-mid intensity and high seed (line 27)', () => {
            expect(HipHop.getMotif(0.7, 0.5, 0.5)).toBe(1);
        });

        it('should return correct motifs for high intensity', () => {
            expect(HipHop.getMotif(0.2, 0.5, 0.8)).toBe(1); // seed < 0.3
            expect(HipHop.getMotif(0.5, 0.5, 0.8)).toBe(2); // seed < 0.7
            expect(HipHop.getMotif(0.8, 0.5, 0.8)).toBe(3); // seed >= 0.7
        });
    });

    describe('Kick Drum Patterns', () => {
        it('should play Boom Bap kick on downbeat (activeMotif 0)', () => {
            const context = createBaseContext({
                playback: { bandIntensity: 0.3 }, // Motif 0
                isDownbeat: true,
            });
            const result = HipHop.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
        });

        it('should play optional Boom Bap kick on offbeat of beat 2 (lines 72-74)', () => {
            const context = createBaseContext({
                playback: { bandIntensity: 0.4 }, // Motif 0
                isOffbeat: true,
                beatIndex: 2,
            });
            let hits = 0;
            for (let i = 0; i < 100; i++) {
                if (HipHop.applyOverrides(context, createBaseState()).shouldPlay) {
                    hits++;
                }
            }
            expect(hits).toBeGreaterThan(0);
        });

        it('should play Trap kick on A-of-beat (line 83)', () => {
            const context = createBaseContext({
                playback: { bandIntensity: 0.9 },
                sectionSeed: 0.2, // Motif 1 (Trap)
                isAOfBeat: true,
            });
            let hits = 0;
            for (let i = 0; i < 100; i++) {
                if (HipHop.applyOverrides(context, createBaseState()).shouldPlay) {
                    hits++;
                }
            }
            expect(hits).toBeGreaterThan(0);
        });
    });

    describe('Snare Patterns', () => {
        it('should use Sidestick for low intensity (line 97)', () => {
            const context = createBaseContext({
                inst: { name: 'Snare' },
                playback: { bandIntensity: 0.2 },
                isBackbeat: true,
            });
            const result = HipHop.applyOverrides(context, createBaseState());
            expect(result.soundName).toBe('Sidestick');
        });

        it('should play ghost chatter in Boom Bap (lines 105-109)', () => {
            const context = createBaseContext({
                inst: { name: 'Snare' },
                playback: { bandIntensity: 0.7 },
                drumComplexity: 0.1, // Forces Motif 0
                isOffbeat: true,
            });
            let hits = 0;
            for (let i = 0; i < 100; i++) {
                const result = HipHop.applyOverrides(context, createBaseState());
                if (result.shouldPlay) {
                    hits++;
                    expect(result.soundName).toBe('Sidestick');
                    expect(result.velocity).toBe(0.4);
                }
            }
            expect(hits).toBeGreaterThan(0);
        });
    });

    describe('HiHat Patterns', () => {
        it('should fill 16ths for Trap (lines 120-125)', () => {
            const context = createBaseContext({
                inst: { name: 'HiHat' },
                playback: { bandIntensity: 0.7 },
                sectionSeed: 0.5, // Motif 1 (actually 2 here because intensity 0.7 seed 0.5 -> Motif 2)
                isEOfBeat: true,
            });
            const result = HipHop.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
            expect(result.soundName).toBe('HiHat');
            expect(result.velocity).toBeGreaterThan(0.43);
            expect(result.velocity).toBeLessThan(0.5);
        });

        it('should play phrase-selected skitters in Motif 2/3', () => {
            const context = createBaseContext({
                inst: { name: 'HiHat' },
                playback: { bandIntensity: 0.9 },
                sectionSeed: 0.65, // Motif 2 with a phrase-selected skitter on the "a" of 3
                beatIndex: 2,
                isAOfBeat: true,
            });
            const result = HipHop.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
            expect(result.soundName).toBe('HiHat');
            expect(result.velocity).toBeLessThan(0.4);
        });

        it('should route phrase-release open accents through the open lane', () => {
            const openContext = createBaseContext({
                inst: { name: 'Open' },
                playback: { bandIntensity: 0.8 },
                sectionSeed: 0.5,
                beatIndex: 3,
                isOffbeat: true,
            });
            const closedContext = { ...openContext, inst: { name: 'HiHat' } };

            const openResult = HipHop.applyOverrides(openContext, createBaseState());
            const closedResult = HipHop.applyOverrides(closedContext, createBaseState());

            expect(openResult.shouldPlay).toBe(true);
            expect(openResult.soundName).toBe('Open');
            expect(closedResult.shouldPlay).toBe(false);
        });
    });
});
