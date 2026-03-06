import { applyGrooveOverrides, getDrumMotif } from '../public/engine/groove-engine.js';
import { getStepsPerMeasure } from '../public/utils.js';

// Mock state and dependencies for standalone execution
globalThis.getState = () => ({
    soloist: { isBusy: false },
    arranger: { timeSignature: '4/4' },
});

function evaluateGroove(genreFeel, durationMinutes, bpm, creativity = true) {
    const timeSignature = '4/4';
    const stepsPerBar = getStepsPerMeasure(timeSignature); // typically 16 for 4/4 (16th notes)
    const beatsPerBar = 4;
    const totalBars = Math.floor((durationMinutes * bpm) / beatsPerBar); // Approximate bars
    const totalSteps = totalBars * stepsPerBar;

    console.log(
        `Evaluating Groove: ${genreFeel} | ${durationMinutes} mins | ${bpm} BPM | Creativity: ${creativity}`,
    );
    console.log(`Total Bars: ${totalBars}, Total Steps: ${totalSteps}\n`);

    // Simulate session evolution
    const _maxIntensity = 1.0;

    // Track stats
    const stats = {
        Kick: new Array(totalBars).fill(0),
        Snare: new Array(totalBars).fill(0),
        HiHat: new Array(totalBars).fill(0),
        Motifs: new Array(totalBars).fill(0),
    };

    const instruments = [
        { name: 'Kick', muted: false },
        { name: 'Snare', muted: false },
        { name: 'HiHat', muted: false },
    ];

    const sectionSeeds = [
        0.1, 0.4, 0.7, 0.2, 0.8, 0.5, 0.9, 0.3, 0.6, 0.15, 0.45, 0.75, 0.25, 0.85, 0.55,
    ];

    for (let step = 0; step < totalSteps; step++) {
        const barIndex = Math.floor(step / stepsPerBar);
        const loopStep = step % stepsPerBar;
        const isDownbeat = loopStep === 0;
        const isBackbeat = loopStep === 4 || loopStep === 12; // Beats 2 and 4 in 4/4

        // Simulate intensity rising over the session
        // In reality, it goes from ~0.2 up to 1.0 over minutes
        const progress = step / totalSteps;
        const intensity = 0.2 + progress * 0.8;

        // Mock groove state
        const groove = {
            genreFeel: genreFeel,
            creativity: creativity,
            lastDrumPreset: genreFeel,
            lastSmartGenre: genreFeel,
        };

        // Simulate section changes every 8 bars for a new seed
        const sectionIndex = Math.floor(barIndex / 8);
        const sectionSeed = sectionSeeds[sectionIndex % sectionSeeds.length];

        const playback = { bandIntensity: intensity };

        const drumComplexity = creativity ? 0.8 : 0.3;
        const activeMotif = getDrumMotif(sectionSeed, genreFeel, drumComplexity, intensity);

        if (loopStep === 0) {
            stats.Motifs[barIndex] = activeMotif;
        }

        // Note: applyGrooveOverrides relies on a module-scoped `sectionSeed` in groove-engine.js
        // that is updated locally. As long as it behaves procedurally based on barIndex,
        // we'll see the motif evolve correctly.

        for (const inst of instruments) {
            let stepVal = 0;
            if (inst.name === 'HiHat' && loopStep % 2 === 0) {
                stepVal = 1; // 8th notes
            }
            if (inst.name === 'Kick' && (loopStep === 0 || loopStep === 8)) {
                stepVal = 2; // 1 and 3
            }
            if (inst.name === 'Snare' && isBackbeat) {
                stepVal = 2; // 2 and 4
            }

            const result = applyGrooveOverrides({
                step,
                inst,
                stepVal,
                playback,
                groove,
                isDownbeat,
                isBackbeat,
            });

            if (result?.shouldPlay) {
                stats[inst.name][barIndex]++;
            }
        }
    }

    // Aggregate and log results
    console.log('--- Results summary (Averages per 8-bar section) ---');
    console.log('Section | Intensity | Motif | Kick Hits | Snare Hits | HiHat Hits');

    for (let i = 0; i < totalBars; i += 8) {
        let kickAvg = 0,
            snareAvg = 0,
            hatAvg = 0;
        const motifMap = {};
        for (let j = 0; j < 8; j++) {
            if (i + j >= totalBars) {
                break;
            }
            kickAvg += stats.Kick[i + j];
            snareAvg += stats.Snare[i + j];
            hatAvg += stats.HiHat[i + j];

            // To get the real motif used by the engine, let's recalculate it
            // using the engine's real seed logic.
            const drumComplexity = creativity ? 0.8 : 0.3;
            const engineSeed = (((i + j) * 137 + (creativity ? 42 : 0)) % 256) / 256;
            const progress = ((i + j) * stepsPerBar) / totalSteps;
            const currentIntensity = 0.2 + progress * 0.8;
            const m = getDrumMotif(engineSeed, genreFeel, drumComplexity, currentIntensity);

            motifMap[m] = (motifMap[m] || 0) + 1;
        }

        kickAvg /= 8;
        snareAvg /= 8;
        hatAvg /= 8;

        const dominantMotif = Object.keys(motifMap).reduce(
            (a, b) => (motifMap[a] > motifMap[b] ? a : b),
            -1,
        );
        const progress = (i * stepsPerBar) / totalSteps;
        const intensity = (0.2 + progress * 0.8).toFixed(2);

        console.log(
            `Sec ${String(i / 8).padStart(2, '0')}  |   ${intensity}    |   ${dominantMotif}   |    ${kickAvg.toFixed(1)}    |     ${snareAvg.toFixed(1)}    |    ${hatAvg.toFixed(1)}`,
        );
    }
}

const genre = process.argv[2] || 'Rock';
const duration = parseFloat(process.argv[3]) || 3;
const bpm = parseInt(process.argv[4], 10) || 120;

evaluateGroove(genre, duration, bpm, true);
