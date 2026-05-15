// @ts-nocheck
import { beforeEach, describe, expect, it } from 'vitest';
import { applyOverrides, getMotif } from '../../../public/engine/grooves/minimal.js';

describe('Minimal Groove Deep Dive', () => {
    describe('getMotif', () => {
        it('should return 0 for low intensity', () => {
            expect(getMotif(1, 0.5, 0.2)).toBe(0);
        });
        it('should return 1 for medium intensity', () => {
            expect(getMotif(1, 0.5, 0.5)).toBe(1);
        });
        it('should return 2 for high intensity', () => {
            expect(getMotif(1, 0.5, 0.8)).toBe(2);
        });
    });

    describe('applyOverrides', () => {
        let context;
        let state;

        beforeEach(() => {
            context = {
                inst: { name: 'Kick', muted: false },
                playback: { bandIntensity: 0.5 },
                isDownbeat: false,
                isBeatStart: false,
                isBackbeat: false,
                isOffbeat: false,
                beatIndex: 0,
                drumComplexity: 0.5,
                sectionSeed: 1,
                stepsPerBar: 16,
                loopStep: 0,
            };
            state = { shouldPlay: true, velocity: 1.0, soundName: 'Kick', instTimeOffset: 0 };
        });

        it('should handle muted instruments', () => {
            context.inst.muted = true;
            const result = applyOverrides(context, state);
            expect(result).toBe(state);
        });

        it('should handle Kick logic for medium intensity (motif 1)', () => {
            context.inst.name = 'Kick';
            context.playback.bandIntensity = 0.5; // Motif 1

            // Beat 3 (beatIndex 2)
            context.isBeatStart = true;
            context.beatIndex = 2;
            let result = applyOverrides(context, state);
            expect(result.shouldPlay).toBe(true);

            // Other beats
            context.beatIndex = 1;
            result = applyOverrides(context, state);
            expect(result.shouldPlay).toBe(false);
        });

        it('should handle Kick logic for high intensity (motif 2)', () => {
            context.inst.name = 'Kick';
            context.playback.bandIntensity = 0.8; // Motif 2

            // "And" of 2 (Offbeat, BeatIndex 1)
            context.isOffbeat = true;
            context.beatIndex = 1;
            const result = applyOverrides(context, state);
            expect(result.shouldPlay).toBe(true);
        });

        it('should handle Snare/Sidestick logic', () => {
            context.inst.name = 'Snare';
            context.playback.bandIntensity = 0.5; // < 0.8 -> Sidestick
            context.isBackbeat = true;

            const result = applyOverrides(context, state);
            expect(result.shouldPlay).toBe(true);
            expect(result.soundName).toBe('Sidestick');
        });

        it('should handle HiHat motifs', () => {
            context.inst.name = 'HiHat';

            // Motif 0
            context.playback.bandIntensity = 0.2;
            context.isDownbeat = true;
            expect(applyOverrides(context, state).shouldPlay).toBe(true);
            context.isDownbeat = false;
            expect(applyOverrides(context, state).shouldPlay).toBe(false);

            // Motif 1
            context.playback.bandIntensity = 0.5;
            context.isBeatStart = true;
            expect(applyOverrides(context, state).shouldPlay).toBe(true);

            // Motif 2
            context.playback.bandIntensity = 0.8;
            context.isOffbeat = true;
            expect(applyOverrides(context, state).shouldPlay).toBe(true);
        });
    });
});
