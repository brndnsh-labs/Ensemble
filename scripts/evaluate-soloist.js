/**
 * Soloist head and thematic-retention audit.
 * Default output is compact and measure-focused; add --drill-down or --full for more detail.
 */

import {
    bootstrapSoloistAudit,
    buildEventLogRows,
    buildFocusMeasures,
    buildHookAuditArrangement,
    buildLoopComparison,
    buildMeasureAudit,
    buildPickupSummary,
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

function evaluateSoloist(argv = process.argv.slice(2)) {
    const options = parseCliArgs(argv);
    const genre = readStringOption(options, 'genre', 'Rock');
    const bpm = readNumberOption(options, 'bpm', 102);
    const intensity = readNumberOption(options, 'intensity', 0.5);
    const loops = Math.max(1, Math.floor(readNumberOption(options, 'loops', 3)));
    const drillDown =
        readBooleanOption(options, 'drill-down', false) ||
        readBooleanOption(options, 'deep', false);
    const full = readBooleanOption(options, 'full', false);
    const showSeederLog = readBooleanOption(options, 'show-seeder-log', false);

    const arrangement = buildHookAuditArrangement('4/4');
    const { state, seedStyle, sessionSeed } = bootstrapSoloistAudit({
        genre,
        bpm,
        intensity,
        timeSignature: arrangement.timeSignature,
        style: 'smart',
        key: 'C',
        seed: 'HEAD_AUDIT',
        arrangement,
        quietSeedLogs: !showSeederLog,
    });
    const capture = simulateSoloistLoops({ state, arrangement, loops, style: 'smart' });

    const pickupSummary = buildPickupSummary(capture);
    const headRows = buildMeasureAudit(capture, 0);
    const loopRows = buildLoopComparison(capture);
    const sectionRows = buildSectionSummary(capture, 0);
    const restatementNotes = buildRestatementNotes(sectionRows);
    const focusRows = buildFocusMeasures(
        capture,
        drillDown ? Array.from({ length: loops }, (_, index) => index) : [0, 1],
        10,
    );

    console.log(`\n=== Soloist Head Audit: ${genre} @ ${bpm} BPM ===`);
    console.log(
        `Form: hook-AABA | Measures: ${arrangement.measuresPerLoop} | Loops: ${loops} | Seed style: ${seedStyle}`,
    );
    console.log(
        `Seed notes: ${sessionSeed?.notes.length || 0} across ${Math.round((sessionSeed?.loopLengthSteps || arrangement.totalSteps) / arrangement.stepsPerMeasure)} macro measures`,
    );
    console.log(`Pickups: seed ${pickupSummary.seedCount}, performed ${pickupSummary.playedCount}`);
    if (pickupSummary.seedCount > 0 || pickupSummary.playedCount > 0) {
        console.log(`Pickup seed : ${pickupSummary.seedLine}`);
        console.log(`Pickup live : ${pickupSummary.playedLine}`);
    }

    logMeasureAudit('Loop 0 head audit', headRows);
    logLoopComparison(loopRows);
    logSectionSummary(sectionRows, restatementNotes);
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

evaluateSoloist();
