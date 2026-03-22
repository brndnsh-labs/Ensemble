import { TIME_SIGNATURES } from '../public/config.js';
import { applyGrooveOverrides } from '../public/engine/groove-engine.js';
import { getStepInfo, getStepsPerMeasure } from '../public/utils.js';

/**
 * ALL BLUES EVALUATION SCRIPT
 * Specifically designed to test 6/8 and 12/8 Jazz/Blues feels
 * against musical benchmarks.
 */

function evaluateAllBlues(timeSignature = '6/8', intensity = 0.5) {
    const ts = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES['6/8'];
    const stepsPerBar = getStepsPerMeasure(timeSignature);

    const state = {
        soloist: { enabled: true, busySteps: 0 },
        arranger: {
            timeSignature,
            sectionMap: [{ start: 0, end: stepsPerBar * 8, label: 'Verse' }],
        },
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

    const playback = { bandIntensity: intensity };

    console.log(`Evaluating All Blues Feel (${timeSignature}) | Intensity: ${intensity}`);
    console.log(`Steps Per Bar: ${stepsPerBar} | Pulse: ${ts.pulse.join(', ')}`);
    console.log('------------------------------------------------------------------');

    let errors = 0;
    const barResults = [];

    for (let bar = 0; bar < 4; bar++) {
        const barHits = { Ride: [], HiHat: [], Kick: [], Snare: [] };
        for (let stepInBar = 0; stepInBar < stepsPerBar; stepInBar++) {
            const step = bar * stepsPerBar + stepInBar;
            const stepInfo = getStepInfo(step, ts, [], TIME_SIGNATURES);

            // Check all instruments
            ['Open', 'HiHat', 'Kick', 'Snare'].forEach((name) => {
                const res = applyGrooveOverrides(state, {
                    step,
                    inst: { name },
                    stepVal: 0,
                    playback,
                    groove,
                    ...stepInfo,
                });

                if (res.shouldPlay) {
                    const displayName = name === 'Open' ? 'Ride' : name;
                    barHits[displayName].push(stepInBar);
                }
            });
        }
        barResults.push(barHits);
    }

    // --- MUSICALITY AUDIT ---
    barResults.forEach((hits, i) => {
        console.log(`\nBar ${i + 1} Analysis:`);
        console.log(`  Ride: ${hits.Ride.join(', ')}`);
        console.log(`  HiHat (Foot): ${hits.HiHat.join(', ')}`);
        console.log(`  Kick: ${hits.Kick.join(', ')}`);
        console.log(`  Snare: ${hits.Snare.join(', ')}`);

        // Rule 1: Ride should follow the pulse (0 and 6 in 6/8)
        const rideOffPulse = hits.Ride.filter((s) => !ts.pulse.includes(s) && s % 2 === 0);
        if (rideOffPulse.length > 2) {
            console.log(
                `  [!] CRITIQUE: Ride pattern is too "straight" for 6/8. Found too many 8th notes off the pulse.`,
            );
            errors++;
        }

        // Rule 2: Foot chick should be sparse but present (usually step 6 in 6/8)
        if (timeSignature === '6/8' && !hits.HiHat.includes(6)) {
            console.log(`  [!] CRITIQUE: Missing the "dotted-quarter" foot chick (step 6).`);
            errors++;
        }

        // Rule 3: Kick feathering should be on pulse (0 and 6 in 6/8)
        const kickOffPulse = hits.Kick.filter((s) => !ts.pulse.includes(s));
        if (kickOffPulse.length > 2) {
            console.log(
                `  [!] CRITIQUE: Kick feathering is playing every 8th note. Should follow pulse.`,
            );
            errors++;
        }
    });

    console.log('\n------------------------------------------------------------------');
    if (errors > 0) {
        console.log(`FAILED: Found ${errors} musicality issues in the ${timeSignature} feel.`);
        process.exit(1);
    } else {
        console.log(`PASSED: The ${timeSignature} feel is musically correct.`);
    }
}

const tsArg = process.argv[2] || '6/8';
const intensityArg = parseFloat(process.argv[3]) || 0.5;

evaluateAllBlues(tsArg, intensityArg);
