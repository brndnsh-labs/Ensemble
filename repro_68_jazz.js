import { TIME_SIGNATURES } from './public/config.js';
import { applyGrooveOverrides } from './public/engine/groove-engine.js';
import { getStepInfo, getStepsPerMeasure } from './public/utils.js';

const state = {
    soloist: { enabled: true, busySteps: 0 },
    arranger: { timeSignature: '6/8', sectionMap: [{ start: 0, end: 120, label: 'Verse' }] },
};

const groove = {
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
const ts = TIME_SIGNATURES['6/8'];
const stepsPerBar = getStepsPerMeasure('6/8');

console.log('6/8 Jazz Drum Pattern (One Bar, Creativity On)');
console.log('Step | Beat | Ride | HiHat (Foot) | Kick | Snare');
console.log('------------------------------------------------');

for (let step = 0; step < stepsPerBar; step++) {
    const stepInfo = getStepInfo(step, ts, [], TIME_SIGNATURES);

    const rideResult = applyGrooveOverrides(state, {
        step,
        inst: { name: 'Open' }, // Open is used for Ride in jazz.js
        stepVal: 0,
        playback,
        groove,
        ...stepInfo,
    });

    const hhResult = applyGrooveOverrides(state, {
        step,
        inst: { name: 'HiHat' },
        stepVal: 0,
        playback,
        groove,
        ...stepInfo,
    });

    const kickResult = applyGrooveOverrides(state, {
        step,
        inst: { name: 'Kick' },
        stepVal: 0,
        playback,
        groove,
        ...stepInfo,
    });

    const snareResult = applyGrooveOverrides(state, {
        step,
        inst: { name: 'Snare' },
        stepVal: 0,
        playback,
        groove,
        ...stepInfo,
    });

    const ride = rideResult.shouldPlay ? 'X' : '.';
    const hh = hhResult.shouldPlay ? 'X' : '.';
    const kick = kickResult.shouldPlay ? 'X' : '.';
    const snare = snareResult.shouldPlay ? 'x' : '.';

    console.log(
        `${String(step).padStart(4)} | ${String(stepInfo.beatIndex).padStart(4)} | ${String(ride).padStart(4)} | ${String(hh).padStart(12)} | ${String(kick).padStart(4)} | ${String(snare).padStart(5)}`,
    );
}
