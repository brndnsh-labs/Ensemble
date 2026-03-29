import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    generateExtraNotes,
    generateMelodicDevice,
} from '../../../public/engine/soloist-devices.js';

describe('Soloist Melodic Devices Deep Dive', () => {
    let ctx;

    beforeEach(() => {
        ctx = {
            state: {
                arranger: { key: 'C', isMinor: false },
            },
            selectedMidi: 60,
            targetChord: { rootMidi: 60, intervals: [0, 4, 7, 10], freqs: [] },
            currentChord: { rootMidi: 60, intervals: [0, 4, 7, 10] },
            activeStyle: 'blues',
            effectiveIntensity: 0.5,
            minMidi: 20,
            maxMidi: 100,
            lastMidi: 60,
            playback: { bpm: 120 },
            soloist: { mode: 'monophonic', isResting: false },
            isPolyphonic: true,
            isPiano: false,
            dynamicCenter: 60,
            scaleMask: 0b101010110101, // Major scale-ish
        };
    });

    describe('generateMelodicDevice - bluesLick intervals', () => {
        it('should handle root (relInt 0) variant A', () => {
            ctx.selectedMidi = 60;
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
            const device = generateMelodicDevice('bluesLick', ctx);
            expect(device.length).toBe(5);
            randomSpy.mockRestore();
        });

        it('should handle root (relInt 0) variant B', () => {
            ctx.selectedMidi = 60;
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);
            const device = generateMelodicDevice('bluesLick', ctx);
            expect(device.length).toBe(3);
            randomSpy.mockRestore();
        });

        it('should handle minor 3rd (relInt 3) variant A', () => {
            ctx.selectedMidi = 63;
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
            const device = generateMelodicDevice('bluesLick', ctx);
            expect(device.length).toBe(4);
            randomSpy.mockRestore();
        });

        it('should handle minor 3rd (relInt 3) variant B', () => {
            ctx.selectedMidi = 63;
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9);
            const device = generateMelodicDevice('bluesLick', ctx);
            expect(device.length).toBe(4);
            randomSpy.mockRestore();
        });

        it('should handle 4th (relInt 5)', () => {
            ctx.selectedMidi = 65;
            const device = generateMelodicDevice('bluesLick', ctx);
            expect(device.length).toBe(4);
        });

        it('should handle 5th (relInt 7)', () => {
            ctx.selectedMidi = 67;
            const device = generateMelodicDevice('bluesLick', ctx);
            expect(device.length).toBe(4);
        });

        it('should handle minor 7th (relInt 10)', () => {
            ctx.selectedMidi = 70;
            const device = generateMelodicDevice('bluesLick', ctx);
            expect(device.length).toBe(5);
        });
    });

    describe('generateMelodicDevice - other devices', () => {
        it('should handle birdFlurry at high BPM', () => {
            ctx.playback.bpm = 200;
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
            const device = generateMelodicDevice('birdFlurry', ctx);
            expect(device).toBeNull();
            randomSpy.mockRestore();
        });

        it('should handle birdFlurry at low BPM and exercise scale mask loop', () => {
            ctx.playback.bpm = 120;
            ctx.scaleMask = 0b000000000001; // Only root is valid
            ctx.selectedMidi = 60;
            const device = generateMelodicDevice('birdFlurry', ctx);
            expect(device.length).toBe(4);
        });

        it('should handle bluesCurl', () => {
            const device = generateMelodicDevice('bluesCurl', ctx);
            expect(device).toHaveLength(3);
        });

        it('should handle bluesTurnaround', () => {
            const device = generateMelodicDevice('bluesTurnaround', ctx);
            expect(device.length).toBe(5);
        });

        it('should handle chromaticEnclosure', () => {
            const device = generateMelodicDevice('chromaticEnclosure', ctx);
            expect(device.length).toBe(3);
        });

        it('should handle run and enclosure', () => {
            const run = generateMelodicDevice('run', ctx);
            const enc = generateMelodicDevice('enclosure', ctx);
            expect(run.length).toBe(3);
            expect(enc.length).toBe(3);
        });

        it('should handle slide with variants', () => {
            ctx.soloist.mode = 'guitar';
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
            const slide = generateMelodicDevice('slide', ctx);
            expect(slide.length).toBe(1);
            randomSpy.mockRestore();
        });

        it('should handle quartal', () => {
            const device = generateMelodicDevice('quartal', ctx);
            expect(Array.isArray(device[0])).toBe(true);
        });

        it('tags generated device notes for downstream analysis', () => {
            const device = generateMelodicDevice('quartal', ctx);
            const notes = device.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
            expect(notes.every((note) => note.device === 'quartal')).toBe(true);
        });

        it('should handle quartalStack', () => {
            const device = generateMelodicDevice('quartalStack', ctx);
            expect(Array.isArray(device[0])).toBe(true);
        });

        it('should handle sheetsOfSound', () => {
            const device = generateMelodicDevice('sheetsOfSound', ctx);
            expect(device.length).toBe(8);
        });

        it('should handle soloist resting octave shift', () => {
            ctx.soloist.isResting = true;
            ctx.dynamicCenter = 72;
            const device = generateMelodicDevice('graceNote', ctx);
            expect(device[0].midi).toBeGreaterThanOrEqual(60);
        });

        it('should return null for unknown device', () => {
            expect(generateMelodicDevice('unknown', ctx)).toBeNull();
        });
    });

    describe('generateExtraNotes - mode variants', () => {
        it('should handle country style specifically', () => {
            ctx.activeStyle = 'country';
            ctx.seedNote = {
                supportHints: {
                    role: 'line',
                    sustainBias: 0.2,
                },
            };
            const extra = generateExtraNotes(ctx);
            expect(extra.length).toBe(1);
            expect(extra[0].durationScale).toBeLessThan(0.6);
        });

        it('should handle guitar mode with chord tones', () => {
            ctx.soloist.mode = 'guitar';
            ctx.currentChord.intervals = [0, 4, 7];
            ctx.selectedMidi = 60;
            const extra = generateExtraNotes(ctx);
            expect(extra.length).toBe(1);
        });

        it('prefers open-string-friendly support for neo guitar sustain hints', () => {
            ctx.soloist.mode = 'guitar';
            ctx.activeStyle = 'neo';
            ctx.selectedMidi = 72;
            ctx.seedNote = {
                supportHints: {
                    role: 'sustain',
                    sustainBias: 0.95,
                    guitar: {
                        allowDoubleStop: true,
                        intervalPalette: 'open',
                        preferBelow: true,
                    },
                },
            };
            const extra = generateExtraNotes(ctx);
            expect(extra).toHaveLength(1);
            expect([63, 65, 67, 68, 69]).toContain(extra[0].midi);
            expect(extra[0].durationScale).toBeGreaterThanOrEqual(0.8);
        });

        it('keeps moving guitar support shorter than the lead note', () => {
            ctx.soloist.mode = 'guitar';
            ctx.activeStyle = 'rock';
            ctx.selectedMidi = 69;
            ctx.seedNote = {
                supportHints: {
                    role: 'line',
                    sustainBias: 0.25,
                    guitar: {
                        allowDoubleStop: true,
                        intervalPalette: 'tight',
                        preferBelow: true,
                    },
                },
            };
            const extra = generateExtraNotes(ctx);
            expect(extra).toHaveLength(1);
            expect(extra[0].durationScale).toBeLessThan(0.6);
        });

        it('keeps funk guitar accents clipped and groove-friendly', () => {
            ctx.soloist.mode = 'guitar';
            ctx.activeStyle = 'funk';
            ctx.selectedMidi = 72;
            ctx.seedNote = {
                supportHints: {
                    role: 'accent',
                    sustainBias: 0.45,
                    guitar: {
                        allowDoubleStop: true,
                        intervalPalette: 'tight',
                        preferBelow: true,
                    },
                },
            };
            const extra = generateExtraNotes(ctx);
            expect(extra).toHaveLength(1);
            expect(extra[0].durationScale).toBeLessThanOrEqual(0.58);
            expect(extra[0].midi).toBeLessThan(72);
        });

        it('keeps bossa guitar support compact on line movement', () => {
            ctx.soloist.mode = 'guitar';
            ctx.activeStyle = 'bossa';
            ctx.selectedMidi = 72;
            ctx.seedNote = {
                supportHints: {
                    role: 'line',
                    sustainBias: 0.35,
                    guitar: {
                        allowDoubleStop: true,
                        intervalPalette: 'tight',
                        preferBelow: true,
                    },
                },
            };
            const extra = generateExtraNotes(ctx);
            expect(extra).toHaveLength(1);
            expect(72 - extra[0].midi).toBeLessThanOrEqual(7);
            expect(extra[0].durationScale).toBeLessThan(0.6);
        });

        it('should handle guitar mode fallback', () => {
            ctx.soloist.mode = 'guitar';
            ctx.currentChord.intervals = [1]; // Force fallback
            ctx.selectedMidi = 60;
            const extra = generateExtraNotes(ctx);
            expect(extra.length).toBe(1);
        });

        it('should handle generic mode fallback', () => {
            ctx.soloist.mode = 'other';
            const extra = generateExtraNotes(ctx);
            expect(extra.length).toBe(1);
        });
    });
});
