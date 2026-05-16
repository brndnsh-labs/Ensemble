// @ts-nocheck
/**
 * Chord accompaniment audit.
 * Default output is compact and measure-focused; add --drill-down or --full for more detail.
 */

import {
    bootstrapChordAudit,
    buildChordAuditArrangement,
    buildChordAuditReport,
    buildCoordinationAudit,
    buildEventLogRows,
    buildFocusMeasures,
    buildLoopComparison,
    buildMeasureAudit,
    buildReplaySummary,
    buildSectionSummary,
    DEFAULT_SEED,
    logCoordinationAudit,
    logEventRows,
    logFocusMeasures,
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

function evaluateChords(argv = process.argv.slice(2)) {
    const options = parseCliArgs(argv);
    const genre = readStringOption(options, 'genre', 'Jazz');
    const bpm = readNumberOption(options, 'bpm', 112);
    const intensity = readNumberOption(options, 'intensity', 0.55);
    const complexity = readNumberOption(options, 'complexity', intensity);
    const loops = Math.max(1, Math.floor(readNumberOption(options, 'loops', 3)));
    const arrangementName = readStringOption(options, 'arrangement', 'changes');
    const timeSignature = readStringOption(options, 'time-signature', '4/4');
    const style = readStringOption(options, 'style', 'smart');
    const density = readStringOption(options, 'density', 'standard');
    const key = readStringOption(options, 'key', 'C');
    const scenario = readStringOption(options, 'scenario', 'default');
    const seed = readStringOption(options, 'seed', DEFAULT_SEED);
    const drillDown =
        readBooleanOption(options, 'drill-down', false) ||
        readBooleanOption(options, 'deep', false);
    const full = readBooleanOption(options, 'full', false);
    const json = readBooleanOption(options, 'json', false);

    const arrangement = buildChordAuditArrangement(arrangementName, timeSignature);
    const { state, arrangement: runtimeArrangement } = bootstrapChordAudit({
        genre,
        bpm,
        intensity,
        complexity,
        timeSignature: arrangement.timeSignature,
        style,
        density,
        key,
        arrangementName,
    });
    const capture = simulateChordLoops({
        state,
        arrangement: runtimeArrangement,
        loops,
        seed,
        scenario,
    });

    if (json) {
        console.log(
            JSON.stringify(
                buildChordAuditReport({
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
                    drillDown,
                    full,
                }),
                null,
                2,
            ),
        );
        return;
    }

    const headRows = buildMeasureAudit(capture, 0);
    const loopRows = buildLoopComparison(capture);
    const sectionRows = buildSectionSummary(capture, 0);
    const focusLoops = drillDown
        ? Array.from({ length: loops }, (_, index) => index)
        : loops > 1
          ? [0, 1]
          : [0];
    const focusRows = buildFocusMeasures(capture, focusLoops, 10);
    const replayRows = buildReplaySummary(capture, 8);
    const coordinationRows = buildCoordinationAudit(capture, 0);

    console.log(`\n=== Chord Audit: ${genre} @ ${bpm} BPM ===`);
    console.log(
        `Form: ${arrangement.name} | Measures: ${runtimeArrangement.measuresPerLoop} | Loops: ${loops} | Style: ${style} | Density: ${density} | Seed: ${seed} | Scenario: ${scenario}`,
    );
    console.log(`Key: ${key} | Time signature: ${runtimeArrangement.timeSignature}`);

    logMeasureAudit('Loop 0 chord audit', headRows);
    logLoopComparison(loopRows);
    logSectionSummary(sectionRows);
    logPatternReplay(replayRows);
    logCoordinationAudit(coordinationRows);
    logFocusMeasures(focusRows);

    if (drillDown && loops > 1) {
        for (let loop = 1; loop < loops; loop++) {
            logMeasureAudit(`Loop ${loop} variation audit`, buildMeasureAudit(capture, loop));
        }
    }

    if (full) {
        const flaggedMeasures = focusRows.length > 0 ? focusRows : null;
        logEventRows(buildEventLogRows(capture, [0, 1], flaggedMeasures));
    }
}

evaluateChords();
