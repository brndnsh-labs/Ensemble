// @ts-nocheck
/**
 * Soloist deep-dive script.
 * Defaults to focus-first output; add --full for the raw event log.
 */

import {
    bootstrapSoloistAudit,
    buildAuditArrangement,
    buildEventLogRows,
    buildFocusMeasures,
    buildLoopComparison,
    buildMeasureAudit,
    buildRestatementNotes,
    buildSectionSummary,
    logEventRows,
    logFocusMeasures,
    logLoopComparison,
    logMeasureAudit,
    logSectionSummary,
    parseCliArgs,
    readBooleanOption,
    readNumberOption,
    readStringOption,
    simulateSoloistLoops,
} from './soloist-analysis-utils.js';

function deepDiveSession(argv = process.argv.slice(2)) {
    const options = parseCliArgs(argv);
    const genre = readStringOption(options, 'genre', 'Rock');
    const bpm = readNumberOption(options, 'bpm', 102);
    const intensity = readNumberOption(options, 'intensity', 0.6);
    const loops = Math.max(2, Math.floor(readNumberOption(options, 'loops', 3)));
    const arrangementName = readStringOption(options, 'arrangement', 'hook');
    const timeSignature = readStringOption(
        options,
        'time-signature',
        arrangementName.toLowerCase() === 'blues' ? '6/8' : '4/4',
    );
    const seed = readStringOption(options, 'seed', 'DEEP_DIVE');
    const full = readBooleanOption(options, 'full', false);
    const showSeederLog = readBooleanOption(options, 'show-seeder-log', false);

    const arrangement = buildAuditArrangement(arrangementName, timeSignature);
    const { state, seedStyle, sessionSeed } = bootstrapSoloistAudit({
        genre,
        bpm,
        intensity,
        timeSignature: arrangement.timeSignature,
        style: 'smart',
        key: 'C',
        seed,
        arrangement,
        quietSeedLogs: !showSeederLog,
    });
    const capture = simulateSoloistLoops({ state, arrangement, loops, style: 'smart' });
    const loopRows = buildLoopComparison(capture);
    const headRows = buildMeasureAudit(capture, 0);
    const sectionRows = buildSectionSummary(capture, 0);
    const restatementNotes = buildRestatementNotes(sectionRows);
    const focusRows = buildFocusMeasures(
        capture,
        Array.from({ length: loops }, (_, index) => index),
        12,
    );

    console.log(`\n=== Soloist Deep Dive: ${genre} @ ${bpm} BPM ===`);
    console.log(
        `Form: ${arrangementName} | Measures: ${arrangement.measuresPerLoop} | Loops: ${loops} | Seed style: ${seedStyle} | Seed: ${seed}`,
    );
    console.log(
        `Seed notes: ${sessionSeed?.notes.length || 0} across ${Math.round((sessionSeed?.loopLengthSteps || arrangement.totalSteps) / arrangement.stepsPerMeasure)} macro measures`,
    );

    logLoopComparison(loopRows);
    logMeasureAudit('Loop 0 head audit', headRows);
    logSectionSummary(sectionRows, restatementNotes);
    logFocusMeasures(focusRows);

    if (full) {
        logEventRows(
            buildEventLogRows(
                capture,
                Array.from({ length: loops }, (_, index) => index),
                focusRows,
            ),
        );
    }
}

deepDiveSession();
