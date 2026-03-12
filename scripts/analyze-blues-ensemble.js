import { getBassNote, isBassActive } from '../public/bass.js';
import { TIME_SIGNATURES } from '../public/config.js';
import { applyGrooveOverrides } from '../public/engine/groove-engine.js';
import { getStepInfo } from '../public/utils.js';

// Mock state
globalThis.getState = () => ({
    soloist: { enabled: false, busySteps: 0 },
    groove: {
        genreFeel: 'Blues',
        creativity: true,
        instruments: [
            { name: 'Kick', steps: new Array(128).fill(0) },
            { name: 'Snare', steps: new Array(128).fill(0) },
            { name: 'HiHat', steps: new Array(128).fill(0) },
            { name: 'Open', steps: new Array(128).fill(0) },
        ],
    },
    arranger: { timeSignature: '4/4', totalSteps: 128 },
    playback: { bandIntensity: 0.7, complexity: 0.7, nextNoteTime: 0 },
});

function analyzeEnsemble(numBars, intensity, complexity) {
    console.log(`\n=== BLUES ENSEMBLE ANALYSIS ===`);
    console.log(`Intensity: ${intensity.toFixed(2)} | Complexity: ${complexity.toFixed(2)}`);
    console.log(`Step | Beat | Type | Kick  | Snare | Ride  | Bass (Note/Vel/Dur)`);
    console.log(`-------------------------------------------------------------------`);

    const tsConfig = TIME_SIGNATURES['4/4'];
    const chordC7 = { rootMidi: 48, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
    let _prevBassMidi = 0;
    let prevBassFreq = 0;

    for (let bar = 0; bar < numBars; bar++) {
        console.log(`Bar ${bar + 1}:`);
        for (let step = 0; step < 16; step++) {
            const globalStep = bar * 16 + step;
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);

            // --- DRUMS ---
            const drumResults = {};
            for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
                const params = {
                    step: globalStep,
                    inst: { name: instName, muted: false, steps: [] },
                    stepVal: 0,
                    playback: { bandIntensity: intensity },
                    groove: { genreFeel: 'Blues', creativity: complexity > 0.5 },
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
                    drumComplexity: complexity,
                };
                drumResults[instName] = applyGrooveOverrides(params);
            }

            // --- BASS ---
            // Update global state for bass.js internal lookups
            globalThis.getState = () => ({
                soloist: { enabled: false, busySteps: 0 },
                groove: {
                    genreFeel: 'Blues',
                    creativity: complexity > 0.5,
                    instruments: [
                        {
                            name: 'Kick',
                            steps: new Array(128)
                                .fill(0)
                                .map((_, i) => (i % 16 === 0 || i % 16 === 8 ? 2 : 0)),
                        },
                    ],
                },
                arranger: { timeSignature: '4/4', totalSteps: 128 },
                playback: { bandIntensity: intensity, complexity: complexity },
            });

            const bassActive = isBassActive('blues', globalStep, step, info, {});
            let bassDisplay = '----';
            if (bassActive) {
                const note = getBassNote(
                    chordC7,
                    null,
                    info.beatIndex,
                    prevBassFreq,
                    48,
                    'blues',
                    0,
                    globalStep,
                    step,
                    {},
                    info,
                );
                if (note) {
                    const pc = note.midi % 12;
                    const pcLabel = [
                        'C',
                        'Db',
                        'D',
                        'Eb',
                        'E',
                        'F',
                        'Gb',
                        'G',
                        'Ab',
                        'A',
                        'Bb',
                        'B',
                    ][pc];
                    bassDisplay = `${pcLabel}(${note.velocity.toFixed(1)}/${note.durationSteps.toFixed(1)})`;
                    _prevBassMidi = note.midi;
                    prevBassFreq = note.freq;
                }
            }

            // --- Formatting ---
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

            const k = drumResults.Kick.shouldPlay
                ? `K(${drumResults.Kick.velocity.toFixed(1)})`
                : '----';
            const s = drumResults.Snare.shouldPlay
                ? `${drumResults.Snare.soundName === 'Sidestick' ? 'S' : 'SN'}(${drumResults.Snare.velocity.toFixed(1)})`
                : '----';
            const h =
                drumResults.HiHat.shouldPlay || drumResults.Open.shouldPlay
                    ? `${(drumResults.HiHat.shouldPlay ? drumResults.HiHat.soundName : drumResults.Open.soundName).charAt(0)}(${(drumResults.HiHat.shouldPlay ? drumResults.HiHat.velocity : drumResults.Open.velocity).toFixed(1)})`
                    : '----';

            console.log(
                `${stepLabel}   | ${beatLabel}    | ${typeLabel} | ${k.padEnd(5)} | ${s.padEnd(5)} | ${h.padEnd(5)} | ${bassDisplay}`,
            );
        }
        console.log(`-------------------------------------------------------------------`);
    }
}

const intensity = parseFloat(process.argv[2]) || 0.7;
const complexity = parseFloat(process.argv[3]) || 0.7;
analyzeEnsemble(2, intensity, complexity);
