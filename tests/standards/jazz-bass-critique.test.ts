// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getFrequency, getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock state
const { mockState } = vi.hoisted(() => ({
    mockState: {
        playback: { bandIntensity: 0.9, bpm: 120, complexity: 0.9 },
        groove: { genreFeel: 'Jazz', pocket: 0, instruments: [] },
        soloist: makeSoloistMock({ busySteps: 0, tension: 0.5 }),
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
        // "Chromatic approach" is a phrase-end phenomenon: the "& of 4" of the bar before a
        // chord change leans into the next bar's root by a semitone. The previous metric
        // sampled every "& of beat" (2/6/10/14) — 4× more positions than musically meaningful —
        // and a 1-of-12 random pick gives ~8% as a baseline, so the engine's >1% threshold
        // guarded nothing. We now restrict detection to step 14 ahead of a real chord change
        // and report the per-chord-change rate, which is what the name actually claims.
        let chromaticApproachesToChordChange = 0;
        let chordChangesObserved = 0;
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
            const active = isBassActive(getState(), 'quarter', i, stepInMeasure, info);

            if (active) {
                const note = getBassNote(
                    getState(),
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

                        // Chromatic approach to a chord change: only the "& of 4" (step 14)
                        // ahead of a bar where the chord actually changes counts.
                        if (stepInMeasure === 14) {
                            const nextMeasure = (measure + 1) % progression.length;
                            const targetChord = progression[nextMeasure];
                            if (targetChord.rootMidi !== currentChord.rootMidi) {
                                chordChangesObserved++;
                                const diff = Math.abs((midi % 12) - (targetChord.rootMidi % 12));
                                if (diff === 1 || diff === 11) {
                                    chromaticApproachesToChordChange++;
                                }
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
        const chromaticApproachRate =
            chromaticApproachesToChordChange / (chordChangesObserved || 1);

        console.log(
            '\n--- JAZZ BASS CRITIQUE REPORT ---\n' +
                `[Pulse Consistency]    ${(quarterNoteRatio * 100).toFixed(1)}% (Target: >95%)\n` +
                `[The One (Root)]       ${(rootResRatio * 100).toFixed(1)}% (Target: >80%)\n` +
                `[Stepwise Motion]      ${(stepwiseRatio * 100).toFixed(1)}% (Target: >35%)\n` +
                `[Chromatic Approach]   ${(chromaticApproachRate * 100).toFixed(1)}% of ${chordChangesObserved} chord changes (Target: >50%)\n` +
                '------------------------------------\n',
        );

        expect(quarterNoteRatio).toBeGreaterThan(0.95);
        expect(rootResRatio).toBeGreaterThan(0.8);
        expect(stepwiseRatio).toBeGreaterThan(0.35);
        expect(chordChangesObserved).toBeGreaterThan(50);
        // Real jazz walking bass chromatically approaches the majority of chord changes.
        // Threshold reflects the engine's intended Jazz/high-intensity behavior (chromaticProb
        // 0.95 × ~80% of choices being chromatic ≈ 76% expected); a >50% floor still allows
        // headroom for the engine's diatonic-fifth alternative without being a placeholder.
        expect(chromaticApproachRate).toBeGreaterThan(0.5);
    });

    // why: epic-bass-voice-leading S1. Walking-bass approach notes should fire
    // only ahead of REAL chord changes (next bar differs from current). Previously
    // the engine gated on `nextChord && ...`, which fires on every bar boundary
    // including held-chord boundaries — sounds like a stumble. After the
    // isChordChangeApproach helper, a 16-bar held Cmaj7 should produce zero
    // chromatic neighbor-of-root notes on the "& of 4" (step 14).
    it('does not fire chromatic approaches inside a held chord', () => {
        const heldChord = {
            rootMidi: 48,
            quality: 'maj7',
            beats: 4,
            intervals: [0, 4, 7, 11],
            sectionId: 'A',
        };
        const totalMeasures = 16;
        const totalSteps = totalMeasures * 16;
        const tsConfig = TIME_SIGNATURES['4/4'];

        // Reset the shared stepMap so this test is independent of the prior test.
        mockState.arranger.stepMap = [];
        for (let m = 0; m < totalMeasures; m++) {
            mockState.arranger.stepMap.push({
                start: m * 16,
                end: (m + 1) * 16,
                chord: heldChord,
            });
        }

        let lastMidi = null;
        let chromaticNeighborHitsOnHeldBars = 0;
        let approachWindowsSampled = 0;
        const rootPc = heldChord.rootMidi % 12;

        for (let i = 0; i < totalSteps; i++) {
            const stepInMeasure = i % 16;
            const measure = Math.floor(i / 16);
            // nextChord is also the held chord — that is the whole point of the test.
            const nextChord = measure < totalMeasures - 1 ? heldChord : null;
            const info = getStepInfo(i, tsConfig, [], TIME_SIGNATURES);
            if (!isBassActive(getState(), 'quarter', i, stepInMeasure, info)) {
                continue;
            }
            const note = getBassNote(
                getState(),
                heldChord,
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
                if (stepInMeasure === 14) {
                    approachWindowsSampled++;
                    const diff = Math.abs((note.midi % 12) - rootPc);
                    if (diff === 1 || diff === 11) {
                        chromaticNeighborHitsOnHeldBars++;
                    }
                }
                lastMidi = note.midi;
            }
        }

        console.log(
            '\n--- HELD-CHORD APPROACH CRITIQUE ---\n' +
                `[Approach windows]      ${approachWindowsSampled}\n` +
                `[Chromatic-neighbor leans on held bars] ${chromaticNeighborHitsOnHeldBars} (target: 0)\n` +
                '-------------------------------------\n',
        );

        expect(approachWindowsSampled).toBeGreaterThan(0);
        expect(chromaticNeighborHitsOnHeldBars).toBe(0);
    });
});
