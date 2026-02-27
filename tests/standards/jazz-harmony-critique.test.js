import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/harmonies.js';
import { getState } from '../../public/state.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Jazz Harmony Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Jazz',
                pocket: {
                    globalDrive: 0,
                    tightness: 1,
                    bassGravity: 1,
                    chordGravity: 1,
                    soloistGravity: 1,
                },
            },
            soloist: { enabled: true, isResting: true, notesInPhrase: 0 },
            harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0 },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Jazz comping performance', () => {
        const chordC = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], sectionId: 'A' };
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let charlestonHits = 0;
        let totalStabs = 0;
        let guideToneRatioSum = 0;
        let totalMidiIntervals = 0;
        let sumMidiIntervals = 0;
        let lastMidis = [];

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
            const stepInTwoBars = i % 32;
            const notes = getHarmonyNotes(chordC, null, i, 64, 'smart', stepInMeasure, null, {});

            if (notes.length > 0) {
                totalStabs++;
                const midis = notes.map((n) => n.midi);

                // 1. Rhythmic Alignment (Charleston focus on 0, 6 in bar 1, or syncopations in bar 2)
                if ([0, 6, 16, 22, 14, 30].includes(stepInTwoBars)) {
                    charlestonHits++;
                }

                // 2. Harmonic Content (Guide Tones: 3rds and 7ths)
                const guideTones = notes.filter((n) => {
                    const pc = n.midi % 12;
                    return [3, 4, 10, 11].includes((pc - (chordC.rootMidi % 12) + 12) % 12);
                });
                guideToneRatioSum += guideTones.length / notes.length;

                // 3. Melodic Smoothness (Voice Leading)
                if (lastMidis.length > 0) {
                    const avg1 = lastMidis.reduce((a, b) => a + b, 0) / lastMidis.length;
                    const avg2 = midis.reduce((a, b) => a + b, 0) / midis.length;
                    sumMidiIntervals += Math.abs(avg1 - avg2);
                    totalMidiIntervals++;
                }
                lastMidis = midis;
                mockState.harmony.lastMidis = midis; // Update state for engine
            }
        }

        const charlestonScore = charlestonHits / totalStabs;
        const avgGuideToneRatio = guideToneRatioSum / totalStabs;
        const avgVoiceLeadingJump = sumMidiIntervals / totalMidiIntervals;

        console.log(
            '\n--- JAZZ HARMONY CRITIQUE REPORT ---\n' +
                `[Charleston Frequency]  ${(charlestonScore * 100).toFixed(1)}% (Target: >40%)\n` +
                `[Guide Tone Weight]     ${(avgGuideToneRatio * 100).toFixed(1)}% (Target: >50%)\n` +
                `[Voice Leading Smooth]  ${avgVoiceLeadingJump.toFixed(2)} semitones (Target: <3.0)\n` +
                '------------------------------------\n',
        );

        expect(charlestonScore).toBeGreaterThan(0.4);
        expect(avgGuideToneRatio).toBeGreaterThan(0.5);
        expect(avgVoiceLeadingJump).toBeLessThan(3.0);
    });

    it('should thin out voicings when the soloist is busy', () => {
        const chord = {
            rootMidi: 60,
            quality: 'maj7',
            intervals: [0, 4, 7, 11, 2, 9],
            sectionId: 'A',
        };

        // Scenario 1: Soloist Resting
        mockState.soloist.isResting = true;
        const notesQuiet = getHarmonyNotes(chord, null, 0, 64, 'smart', 0, null, {});

        // Scenario 2: Soloist Busy
        mockState.soloist.isResting = false;
        mockState.soloist.notesInPhrase = 5;
        const notesBusy = getHarmonyNotes(
            chord,
            null,
            0,
            64,
            'smart',
            0,
            { midi: 72 },
            { soloistActive: true },
        );

        console.log(
            `[Coordination] Quiet polyphony: ${notesQuiet.length}, Busy polyphony: ${notesBusy.length}`,
        );
        expect(notesBusy.length).toBeLessThanOrEqual(notesQuiet.length);

        // Verify that high extensions are dropped when busy
        const hasHighExtension = notesBusy.some((n) =>
            [2, 9].includes(((n.midi % 12) - 0 + 12) % 12),
        );
        expect(hasHighExtension).toBe(false);
    });
});
