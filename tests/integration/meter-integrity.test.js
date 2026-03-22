import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getStepInfo, getStepsPerMeasure } from '../../public/utils.js';

describe('Meter Integrity & Musicality', () => {
    const defaultState = {
        soloist: { enabled: true, busySteps: 0 },
        arranger: {
            timeSignature: '6/8',
            sectionMap: [{ start: 0, end: 128, label: 'Verse' }],
        },
    };

    const defaultGroove = {
        genreFeel: 'Jazz',
        creativity: true,
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
    };

    const playback = { bandIntensity: 0.5 };

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
                ...stepInfo,
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
                ...stepInfo,
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
                ...stepInfo,
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
