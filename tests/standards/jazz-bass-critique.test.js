import { describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/bass.js';
import { getFrequency } from '../../public/utils.js';

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: () => ({
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5 },
        groove: { genreFeel: 'Jazz', pocket: 0 },
        soloist: { busySteps: 0 },
        arranger: { timeSignature: '4/4', totalSteps: 1000 },
    }),
}));

describe('Jazz Bass Critique', () => {
    it('should pass an authenticity critique for a 128-bar Jazz walking bass performance', () => {
        const chordC = { rootMidi: 48, quality: 'maj7', beats: 4, intervals: [0, 4, 7, 11] };
        const chordEb = { rootMidi: 51, quality: 'dim7', beats: 4, intervals: [0, 3, 6, 9] };
        const chordD = { rootMidi: 50, quality: 'm7', beats: 4, intervals: [0, 3, 7, 10] };
        const chordDb = { rootMidi: 49, quality: '7', beats: 4, intervals: [0, 4, 7, 10] };

        const progression = [chordC, chordEb, chordD, chordDb]; // standard chromatic turnaround
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let _activeSteps = 0;
        let _downbeatHits = 0;
        let quarterNoteHits = 0;
        let stepwiseMotion = 0;
        let chromaticApproaches = 0;
        let rootResolutions = 0;
        let lastMidi = null;
        let totalTransitions = 0;

        for (let i = 0; i < totalSteps; i++) {
            const measure = Math.floor(i / 16);
            const stepInMeasure = i % 16;
            const chordIdx = Math.floor(measure % 4);
            const currentChord = progression[chordIdx];
            const nextChord = progression[(chordIdx + 1) % 4];
            const beatInMeasure = stepInMeasure / 4;

            const active = isBassActive('smart', i, i % (currentChord.beats * 4));

            if (active) {
                _activeSteps++;
                const note = getBassNote(
                    currentChord,
                    nextChord,
                    beatInMeasure,
                    lastMidi ? getFrequency(lastMidi) : 440,
                    48,
                    'smart',
                    chordIdx,
                    i,
                    i % (currentChord.beats * 4),
                );

                if (note && !note.muted) {
                    const midi = note.midi;

                    // 1. Check Quarter Note Pulse
                    if (stepInMeasure % 4 === 0) {
                        quarterNoteHits++;
                        if (stepInMeasure === 0) {
                            _downbeatHits++;
                        }
                    }

                    // 2. Harmonic Resolution (Root on Beat 1 of new chord)
                    if (stepInMeasure === 0) {
                        if (midi % 12 === currentChord.rootMidi % 12) {
                            rootResolutions++;
                        }
                    }

                    // 3. Melodic Motion
                    if (lastMidi !== null) {
                        totalTransitions++;
                        const interval = Math.abs(midi - lastMidi);
                        if (interval <= 2) {
                            stepwiseMotion++;
                        }

                        // Chromatic approach to any beat boundary
                        if ([3, 7, 11, 15].includes(stepInMeasure)) {
                            const nextTargetMidi =
                                stepInMeasure === 15 ? nextChord.rootMidi : currentChord.rootMidi;
                            const diff = Math.abs((midi % 12) - (nextTargetMidi % 12));
                            if (diff === 1 || diff === 11) {
                                chromaticApproaches++;
                            }
                        }
                    }
                    lastMidi = midi;
                }
            }
        }

        const quarterNoteRatio = quarterNoteHits / (totalMeasures * 4);
        const rootResRatio = rootResolutions / totalMeasures;
        const stepwiseRatio = stepwiseMotion / totalTransitions;
        const chromaticRatio = chromaticApproaches / (totalMeasures * 4);

        console.log(
            '\n--- JAZZ BASS CRITIQUE REPORT ---\n' +
                `[Pulse Consistency]    ${(quarterNoteRatio * 100).toFixed(1)}% (Target: >95%)\n` +
                `[The One (Root)]       ${(rootResRatio * 100).toFixed(1)}% (Target: >80%)\n` +
                `[Stepwise Motion]      ${(stepwiseRatio * 100).toFixed(1)}% (Target: >35%)\n` +
                `[Chromatic Approaches] ${(chromaticRatio * 100).toFixed(1)}% (Target: >1%)\n` +
                '------------------------------------\n',
        );

        expect(quarterNoteRatio).toBeGreaterThan(0.95);
        expect(rootResRatio).toBeGreaterThan(0.8);
        expect(stepwiseRatio).toBeGreaterThan(0.35);
        expect(chromaticRatio).toBeGreaterThan(0.01);
    });
});
