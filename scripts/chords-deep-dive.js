/**
 * Chord deep-dive script.
 * Defaults to focus-first output; add --full for the step log.
 */

import {
    bootstrapChordAudit,
    buildChordDeepDiveReport,
    buildCoordinationAudit,
    buildEventLogRows,
    buildLoopComparison,
    buildMeasureAudit,
    buildReplaySummary,
    buildSectionSummary,
    DEFAULT_SEED,
    logCoordinationAudit,
    logEventRows,
    logLoopComparison,
    logMeasureAudit,
    logPatternReplay,
    logSectionSummary,
    parseCliArgs,
    readBooleanOption,
    readNumberOption,
    readStringOption,
    simulateChordLoops,
} from './chord-analysis-utils.js';

function deepDiveChords(argv = process.argv.slice(2)) {
    const options = parseCliArgs(argv);
    const genre = readStringOption(options, 'genre', 'Jazz');
    const bpm = readNumberOption(options, 'bpm', 112);
    const intensity = readNumberOption(options, 'intensity', 0.65);
    const complexity = readNumberOption(options, 'complexity', intensity);
    const loops = Math.max(2, Math.floor(readNumberOption(options, 'loops', 3)));
    const arrangementName = readStringOption(options, 'arrangement', 'changes');
    const timeSignature = readStringOption(options, 'time-signature', '4/4');
    const style = readStringOption(options, 'style', 'smart');
    const density = readStringOption(options, 'density', 'standard');
    const key = readStringOption(options, 'key', 'C');
    const scenario = readStringOption(options, 'scenario', 'default');
    const seed = readStringOption(options, 'seed', DEFAULT_SEED);
    const full = readBooleanOption(options, 'full', false);
    const json = readBooleanOption(options, 'json', false);

    const { state, arrangement } = bootstrapChordAudit({
        genre,
        bpm,
        intensity,
        complexity,
        timeSignature,
        style,
        density,
        key,
        arrangementName,
    });
    const capture = simulateChordLoops({
        state,
        arrangement,
        loops,
        seed,
        scenario,
    });

    if (json) {
        console.log(
            JSON.stringify(
                buildChordDeepDiveReport({
                    capture,
                    genre,
                    bpm,
                    intensity,
                    complexity,
                    loops,
                    arrangementName,
                    style,
                    density,
                    key,
                    scenario,
                    seed,
                    full,
                }),
                null,
                2,
            ),
        );
        return;
    }

    console.log(`\n=== Chord Deep Dive: ${genre} @ ${bpm} BPM ===`);
    console.log(
        `Form: ${arrangementName} | Measures: ${arrangement.measuresPerLoop} | Loops: ${loops} | Style: ${style} | Density: ${density} | Seed: ${seed} | Scenario: ${scenario}`,
    );

    logLoopComparison(buildLoopComparison(capture));
    logPatternReplay(buildReplaySummary(capture, arrangement.measuresPerLoop));

    for (let loop = 0; loop < loops; loop++) {
        logMeasureAudit(`Loop ${loop} chord audit`, buildMeasureAudit(capture, loop));
    }

    logSectionSummary(buildSectionSummary(capture, 0));
    logCoordinationAudit(buildCoordinationAudit(capture, 0));

    if (full) {
        logEventRows(
            buildEventLogRows(
                capture,
                Array.from({ length: loops }, (_, index) => index),
            ),
        );
    }
}

deepDiveChords();
