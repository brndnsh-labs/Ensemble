import { TIME_SIGNATURES } from '../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../public/engine/groove-engine.js';
import { getStepInfo } from '../public/utils.js';

// Mock state
globalThis.getState = () => ({
    soloist: { enabled: false, busySteps: 0 },
    groove: { genreFeel: 'Blues', creativity: true },
    arranger: { timeSignature: '4/4' },
});

function analyzeBlues(numBars, intensity) {
    console.log(`\n=== Analyzing Blues Groove (Intensity: ${intensity}) ===`);
    console.log(`Step | Beat | Type | Kick | Snare | HiHat/Ride`);
    console.log(`----------------------------------------------`);

    const tsConfig = TIME_SIGNATURES['4/4'];

    for (let bar = 0; bar < numBars; bar++) {
        console.log(`Bar ${bar + 1}:`);
        for (let step = 0; step < 16; step++) {
            const globalStep = bar * 16 + step;
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);

            const results = {};
            for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
                const params = {
                    step: globalStep,
                    inst: { name: instName, muted: false, steps: [] },
                    stepVal: 0,
                    playback: { bandIntensity: intensity },
                    groove: { genreFeel: 'Blues', creativity: true },
                    isDownbeat: info.isMeasureStart,
                    isBeatStart: info.isBeatStart,
                    isBackbeat: info.isBackbeat,
                    isGroupStart: info.isGroupStart,
                    beatIndex: info.beatIndex,
                    isOffbeat: info.isOffbeat,
                    isEOfBeat: info.isEOfBeat,
                    isAOfBeat: info.isAOfBeat,
                    tsConfig: info.tsConfig,
                    stepsPerBar: 16,
                };
                results[instName] = applyGrooveOverrides(params);
            }

            const stepLabel = String(step).padStart(2, ' ');
            const beatLabel = info.beatIndex + 1;
            let typeLabel = '    ';
            if (info.isMeasureStart) {
                typeLabel = 'DOWN';
            } else if (info.isBeatStart) {
                typeLabel = 'BEAT';
            } else if (info.isAOfBeat) {
                typeLabel = '  a ';
            }

            const k = results.Kick.shouldPlay ? `K(${results.Kick.velocity.toFixed(1)})` : '----';
            const s = results.Snare.shouldPlay
                ? `${results.Snare.soundName === 'Sidestick' ? 'S' : 'SN'}(${results.Snare.velocity.toFixed(1)})`
                : '----';
            const h =
                results.HiHat.shouldPlay || results.Open.shouldPlay
                    ? `${(results.HiHat.shouldPlay ? results.HiHat.soundName : results.Open.soundName).charAt(0)}(${(results.HiHat.shouldPlay ? results.HiHat.velocity : results.Open.velocity).toFixed(1)})`
                    : '----';

            console.log(
                `${stepLabel}   | ${beatLabel}    | ${typeLabel} | ${k.padEnd(6)} | ${s.padEnd(6)} | ${h}`,
            );
        }
        console.log(`----------------------------------------------`);
    }
}

const intensity = parseFloat(process.argv[2]) || 0.6;
analyzeBlues(2, intensity);
