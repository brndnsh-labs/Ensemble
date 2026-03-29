import { describe, expect, it } from 'vitest';
import * as Disco from '../../../public/engine/grooves/disco.js';

describe('Disco Genre Integrity', () => {
    const createBaseContext = (overrides = {}) => ({
        inst: { name: 'Kick', muted: false },
        playback: { bandIntensity: 0.8 },
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
        expect(Disco.config).toBeDefined();
        expect(Disco.config.entropyMultiplier).toBe(0.08);
    });

    it('should handle muted instruments (line 59)', () => {
        const context = createBaseContext({ inst: { name: 'Kick', muted: true } });
        const state = createBaseState();
        const result = Disco.applyOverrides(context, state);
        expect(result).toBe(state);
    });

    describe('Motif Selection (getMotif)', () => {
        it('should return Motif 0 for low complexity/intensity', () => {
            expect(Disco.getMotif(0.5, 0.1, 0.8)).toBe(0);
            expect(Disco.getMotif(0.5, 0.5, 0.2)).toBe(0);
        });

        it('should return correct motifs for high intensity and high seed', () => {
            // Intensity >= 0.7, seed 0.55 - 0.8
            expect(Disco.getMotif(0.7, 0.5, 0.8)).toBe(2);
            // Intensity >= 0.7, seed > 0.8
            expect(Disco.getMotif(0.9, 0.5, 0.8)).toBe(3);
        });

        it('should return Motif 1 for medium intensity and mid-range seed', () => {
            expect(Disco.getMotif(0.4, 0.5, 0.5)).toBe(1);
        });

        it('should handle medium intensity high seed boundary (line 31)', () => {
            // intensity < 0.7, seed > 0.55
            expect(Disco.getMotif(0.7, 0.5, 0.6)).toBe(0); // seed < 0.8
            expect(Disco.getMotif(0.85, 0.5, 0.6)).toBe(1); // seed >= 0.8
        });
    });

    describe('Snare Patterns', () => {
        it('should play ghost notes at high intensity (coverage for lines 85-91)', () => {
            const context = createBaseContext({
                inst: { name: 'Snare' },
                playback: { bandIntensity: 0.95 },
                sectionSeed: 0.7, // Forces Motif 2
                isAOfBeat: true,
                beatIndex: 3,
            });
            // Loop to handle the roll(0.4)
            let hits = 0;
            for (let i = 0; i < 50; i++) {
                if (Disco.applyOverrides(context, createBaseState()).shouldPlay) {
                    hits++;
                }
            }
            expect(hits).toBeGreaterThan(0);
        });

        it('should play energetic finish on turnaround (coverage for lines 93-100)', () => {
            const context = createBaseContext({
                inst: { name: 'Snare' },
                playback: { bandIntensity: 0.9 },
                isTurnaround: true,
                loopStep: 15,
                stepsPerBar: 16,
            });
            const result = Disco.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
            expect(result.velocity).toBe(1.3);
        });

        it('should use Sidestick for low intensity snare (coverage for lines 103, 163)', () => {
            const context = createBaseContext({
                inst: { name: 'Snare' },
                playback: { bandIntensity: 0.2 },
                isBackbeat: true,
            });
            const result = Disco.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
            expect(result.soundName).toBe('Sidestick');
        });
    });

    describe('HiHat / Open Patterns', () => {
        it('should play shimmering 16ths in Motif 1 (coverage for lines 117-128)', () => {
            const context = createBaseContext({
                inst: { name: 'HiHat' },
                playback: { bandIntensity: 0.8 },
                sectionSeed: 0.4, // Forces Motif 1
                beatIndex: 2,
                isAOfBeat: true,
            });
            let hits = 0;
            for (let i = 0; i < 50; i++) {
                if (Disco.applyOverrides(context, createBaseState()).shouldPlay) {
                    hits++;
                }
            }
            expect(hits).toBeGreaterThan(0);
        });

        it('should route syncopated motif-2 hat barks through the open lane', () => {
            const openContext = createBaseContext({
                inst: { name: 'Open' },
                playback: { bandIntensity: 0.8 },
                sectionSeed: 0.7, // Forces Motif 2
                isOffbeat: true,
                beatIndex: 3,
            });
            const closedContext = { ...openContext, inst: { name: 'HiHat' } };

            const openResult = Disco.applyOverrides(openContext, createBaseState());
            const closedResult = Disco.applyOverrides(closedContext, createBaseState());

            expect(openResult.shouldPlay).toBe(true);
            expect(openResult.soundName).toBe('Open');
            expect(openResult.velocity).toBeGreaterThan(1.1);
            expect(closedResult.shouldPlay).toBe(false);
        });

        it('should apply shimmer velocity multiplier to Open hats (line 167)', () => {
            const context = createBaseContext({
                inst: { name: 'Open' },
                isOffbeat: true,
            });
            const result = Disco.applyOverrides(context, createBaseState());
            // Basic velocity is 1.15 * scaleVelocity(1.15, 0.8, 0.1) approx
            expect(result.velocity).toBeGreaterThan(1.15);
        });
    });

    describe('Percussion / Cowbell', () => {
        it('should play octave cowbells in Motif 3 (coverage for lines 141-150)', () => {
            const context = createBaseContext({
                inst: { name: 'Cowbell' },
                playback: { bandIntensity: 0.9 },
                sectionSeed: 0.9, // Forces Motif 3
                isBeatStart: true,
                beatIndex: 0,
            });
            const result = Disco.applyOverrides(context, createBaseState());
            expect(result.shouldPlay).toBe(true);
            expect(result.soundName).toBe('CowbellHigh');

            const contextLow = { ...context, beatIndex: 1 };
            const resultLow = Disco.applyOverrides(contextLow, createBaseState());
            // Beat Index 1 is NOT 0 or 2, so should be CowbellLow
            expect(resultLow.soundName).toBe('CowbellLow');
        });

        it('should add extra syncopation at peak intensity (coverage for lines 152-156)', () => {
            const context = createBaseContext({
                inst: { name: 'Perc' },
                playback: { bandIntensity: 0.95 },
                sectionSeed: 0.9, // Forces Motif 3
                isEighthNote: false, // ensures !isEighthNote
                isEOfBeat: true,
            });
            let hits = 0;
            for (let i = 0; i < 100; i++) {
                if (Disco.applyOverrides(context, createBaseState()).shouldPlay) {
                    hits++;
                }
            }
            expect(hits).toBeGreaterThan(0);
        });
    });
});
