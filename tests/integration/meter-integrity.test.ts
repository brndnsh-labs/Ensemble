import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import type { EnsembleState } from '../../public/types.js';
import { getStepInfo, getStepsPerMeasure } from '../../public/utils.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';

describe('getStepInfo isOffbeat — stepsPerBeat generalization', () => {
    // S9: lock in Math.floor(stepsPerBeat / 2) formula for all supported stepsPerBeat values.

    it('stepsPerBeat=4 (4/4 etc.): isOffbeat fires at stepInBeat === 2', () => {
        // floor(4/2) = 2
        const ts4 = TIME_SIGNATURES['4/4'];
        for (let step = 0; step < 16; step++) {
            const info = getStepInfo(step, ts4, [], TIME_SIGNATURES);
            const stepInBeat = step % 4;
            expect(info.isOffbeat).toBe(stepInBeat === 2);
        }
    });

    it('stepsPerBeat=2 (6/8 etc.): isOffbeat fires at stepInBeat === 1', () => {
        // floor(2/2) = 1
        const ts68 = TIME_SIGNATURES['6/8'];
        for (let step = 0; step < 12; step++) {
            const info = getStepInfo(step, ts68, [], TIME_SIGNATURES);
            const stepInBeat = step % 2;
            expect(info.isOffbeat).toBe(stepInBeat === 1);
        }
    });

    it('stepsPerBeat=3 (hypothetical triplet-grid): isOffbeat fires at stepInBeat === 1', () => {
        // floor(3/2) = 1  — locks in the new formula for any future stepsPerBeat=3 TS
        // Synthetic TS: 3 beats × 3 stepsPerBeat = 9 steps/bar (like 9/8 with triplet grid)
        const syntheticTS = { beats: 3, stepsPerBeat: 3 as const, isCompound: false };
        for (let step = 0; step < 9; step++) {
            const info = getStepInfo(
                step,
                syntheticTS as Parameters<typeof getStepInfo>[1],
                [],
                TIME_SIGNATURES,
            );
            const stepInBeat = step % 3;
            // why: midpoint of a 3-step beat is step 1 (floor(3/2)=1), not step 2 (3/3 boundary)
            expect(info.isOffbeat).toBe(stepInBeat === 1);
        }
    });
});

describe('Meter Integrity & Musicality', () => {
    const defaultState = {
        soloist: makeSoloistMock({ enabled: true, busySteps: 0 }),
        arranger: {
            timeSignature: '6/8',
            sectionMap: [{ start: 0, end: 128, label: 'Verse' }],
        },
    };

    const defaultGroove = {
        genreFeel: 'Jazz',
        lastDrumPreset: 'Jazz',
        lastSmartGenre: 'Jazz',
        instruments: [
            { name: 'Ride', muted: false },
            { name: 'HiHat', muted: false },
            { name: 'Kick', muted: false },
            { name: 'Snare', muted: false },
        ],
        measures: 1,
        sectionSeedMap: {},
    } as unknown as EnsembleState['groove'];

    const playback = { bandIntensity: 0.5 } as unknown as EnsembleState['playback'];

    it('should maintain musical ride pulse in 6/8 Jazz', () => {
        const timeSignature = '6/8';
        const ts = TIME_SIGNATURES[timeSignature];
        const stepsPerBar = getStepsPerMeasure(timeSignature);
        const rideHits = [];

        for (let step = 0; step < stepsPerBar; step++) {
            const stepInfo = getStepInfo(step, ts, [], TIME_SIGNATURES);
            const res = applyGrooveOverrides(defaultState, {
                step,
                inst: { name: 'Open' }, // Open used for Ride
                stepVal: 0,
                playback,
                groove: defaultGroove,
                sectionOccurrence: 0,
                isFinalMeasure: false,
                ...stepInfo,
                isDownbeat: stepInfo.isMeasureStart,
                tsConfig: stepInfo.tsConfig,
            });

            if (res.shouldPlay) {
                rideHits.push(step);
            }
        }

        // Rule: Ride should follow the pulse (0 and 6)
        // It shouldn't be playing straight 8th notes (0, 2, 4, 6, 8, 10)
        const straight8ths = rideHits.filter((s) => s % 2 === 0 && !ts.pulse.includes(s));
        expect(straight8ths.length).toBeLessThanOrEqual(2);
    });

    it('should place the foot chick on the 6/8 backbeat (step 6)', () => {
        const timeSignature = '6/8';
        const ts = TIME_SIGNATURES[timeSignature];
        const hhHits = [];

        for (let step = 0; step < 12; step++) {
            const stepInfo = getStepInfo(step, ts, [], TIME_SIGNATURES);
            const res = applyGrooveOverrides(defaultState, {
                step,
                inst: { name: 'HiHat' },
                stepVal: 0,
                playback,
                groove: defaultGroove,
                sectionOccurrence: 0,
                isFinalMeasure: false,
                ...stepInfo,
                isDownbeat: stepInfo.isMeasureStart,
                tsConfig: stepInfo.tsConfig,
            });

            if (res.shouldPlay) {
                hhHits.push(step);
            }
        }

        expect(hhHits).toContain(6);
    });

    it('should feather the kick on pulses in 6/8 Jazz (0, 6)', () => {
        const timeSignature = '6/8';
        const ts = TIME_SIGNATURES[timeSignature];
        const kickHits = [];

        for (let step = 0; step < 12; step++) {
            const stepInfo = getStepInfo(step, ts, [], TIME_SIGNATURES);
            const res = applyGrooveOverrides(defaultState, {
                step,
                inst: { name: 'Kick' },
                stepVal: 0,
                playback,
                groove: defaultGroove,
                sectionOccurrence: 0,
                isFinalMeasure: false,
                ...stepInfo,
                isDownbeat: stepInfo.isMeasureStart,
                tsConfig: stepInfo.tsConfig,
            });

            if (res.shouldPlay) {
                kickHits.push(step);
            }
        }

        const offPulseHits = kickHits.filter((s) => !ts.pulse.includes(s));
        // We expect mostly pulse hits. Some creativity hits are okay, but not every beat.
        expect(offPulseHits.length).toBeLessThanOrEqual(2);
    });
});
