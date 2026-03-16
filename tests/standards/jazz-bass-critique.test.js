import { describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/bass-engine.js';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getFrequency, getStepInfo } from '../../public/utils.js';

// Mock state
const { mockState } = vi.hoisted(() => ({
    mockState: {
        playback: { bandIntensity: 0.9, bpm: 120, complexity: 0.9 },
        groove: { genreFeel: 'Jazz', pocket: 0, instruments: [] },
        soloist: { busySteps: 0, tension: 0.5 },
        arranger: {
            timeSignature: '4/4',
            totalSteps: 1000,
            stepMap: [],
        },
    },
}));

vi.mock('../../public/state.js', () => ({
    stateMap: mockState,
    getState: () => mockState,
}));

describe('Jazz Bass Critique', () => {
    it('should pass an authenticity critique for a 128-bar Jazz walking bass performance', () => {
        const chordC = { rootMidi: 48, quality: 'maj7', beats: 4, intervals: [0, 4, 7, 11] };
        const chordEb = { rootMidi: 51, quality: 'dim7', beats: 4, intervals: [0, 3, 6, 9] };
        const chordD = { rootMidi: 50, quality: 'm7', beats: 4, intervals: [0, 3, 7, 10] };
        const chordDb = { rootMidi: 49, quality: '7', beats: 4, intervals: [0, 4, 7, 10] };

        const progression = [chordC, chordEb, chordD, chordDb];
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;
        const tsConfig = TIME_SIGNATURES['4/4'];

        // Build stepMap
        for (let m = 0; m < totalMeasures; m++) {
            mockState.arranger.stepMap.push({
                start: m * 16,
                end: (m + 1) * 16,
                chord: { ...progression[m % 4], sectionId: '1' },
            });
        }

        let quarterNoteHits = 0;
        let stepwiseMotion = 0;
        let chromaticApproaches = 0;
        let rootResolutions = 0;
        let lastMidi = null;
        let totalTransitions = 0;

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
            const measure = Math.floor(i / 16);
            const currentChord = progression[measure % 4];

            // Critical: Engine logic for nextChord
            let nextChord = currentChord;
            const stepsPerBeat = 4;
            const isEndOfChord = stepInMeasure / stepsPerBeat >= currentChord.beats - 1;
            if (isEndOfChord) {
                nextChord = progression[(measure + 1) % 4];
            }

            const info = getStepInfo(i, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive('quarter', i, stepInMeasure, info);

            if (active) {
                const note = getBassNote(
                    currentChord,
                    nextChord,
                    Math.floor(stepInMeasure / 4),
                    lastMidi ? getFrequency(lastMidi) : 0,
                    48,
                    'quarter',
                    0,
                    i,
                    stepInMeasure,
                    {},
                    info,
                );

                if (note && !note.muted) {
                    const midi = note.midi;

                    if (stepInMeasure % 4 === 0) {
                        quarterNoteHits++;
                        if (stepInMeasure === 0) {
                            if (midi % 12 === currentChord.rootMidi % 12) {
                                rootResolutions++;
                            }
                        }
                    }

                    if (lastMidi !== null) {
                        totalTransitions++;
                        if (Math.abs(midi - lastMidi) <= 2) {
                            stepwiseMotion++;
                        }

                        // Verify chromatic approach
                        if ([2, 6, 10, 14].includes(stepInMeasure)) {
                            const targetStep = i + 2;
                            const targetChord = progression[Math.floor(targetStep / 16) % 4];
                            const diff = Math.abs((midi % 12) - (targetChord.rootMidi % 12));
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
        const stepwiseRatio = stepwiseMotion / (totalTransitions || 1);
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
