/**
 * 6/8 soloist audit for All Blues-style material.
 * Compact by default; add --drill-down or --full for more detail.
 */

import {
    bootstrapSoloistAudit,
    buildAllBluesArrangement,
    buildEventLogRows,
    buildFocusMeasures,
    buildLoopComparison,
    buildMeasureAudit,
    logEventRows,
    logFocusMeasures,
    logLoopComparison,
    logMeasureAudit,
    parseCliArgs,
    readBooleanOption,
    readNumberOption,
    simulateSoloistLoops,
} from './soloist-analysis-utils.js';

function evaluate68Soloist(argv = process.argv.slice(2)) {
    const options = parseCliArgs(argv);
    const intensity = readNumberOption(options, 'intensity', 0.6);
    const loops = Math.max(2, Math.floor(readNumberOption(options, 'loops', 2)));
    const drillDown =
        readBooleanOption(options, 'drill-down', false) ||
        readBooleanOption(options, 'deep', false);
    const full = readBooleanOption(options, 'full', false);
    const showSeederLog = readBooleanOption(options, 'show-seeder-log', false);

    const arrangement = buildAllBluesArrangement('6/8');
    const { state, sessionSeed } = bootstrapSoloistAudit({
        genre: 'Jazz',
        bpm: 110,
        intensity,
        timeSignature: arrangement.timeSignature,
        style: 'smart',
        key: 'G',
        seed: 'ALL_BLUES_AUDIT',
        arrangement,
        quietSeedLogs: !showSeederLog,
    });
    const capture = simulateSoloistLoops({ state, arrangement, loops, style: 'smart' });
    const headRows = buildMeasureAudit(capture, 0);
    const loopRows = buildLoopComparison(capture);
    const focusRows = buildFocusMeasures(capture, [0, 1], 10);

    const headEvents = capture.events.filter((event) => event.loop === 0 && event.loopStep >= 0);
    const pulseHits = headEvents.filter((event) =>
        arrangement.ts.pulse?.includes(event.stepInMeasure),
    ).length;
    const headSeedNotes = (sessionSeed?.notes || []).filter(
        (note) => note.step >= 0 && note.step < arrangement.totalSteps,
    );
    const seedPulseHits = headSeedNotes.filter((note) =>
        arrangement.ts.pulse?.includes(note.step % arrangement.stepsPerMeasure),
    ).length;

    console.log(`\n=== 6/8 Soloist Audit: Jazz @ 110 BPM ===`);
    console.log(
        `Intensity: ${intensity} | Measures: ${arrangement.measuresPerLoop} | Loops: ${loops}`,
    );
    console.log(
        `Seed notes: ${sessionSeed?.notes.length || 0} across ${Math.round((sessionSeed?.loopLengthSteps || arrangement.totalSteps) / arrangement.stepsPerMeasure)} macro measures`,
    );
    console.log(
        `Pulse adherence: seed ${seedPulseHits}/${headSeedNotes.length || 1}, loop0 ${pulseHits}/${headEvents.length || 1}`,
    );

    logMeasureAudit('Loop 0 6/8 head audit', headRows);
    logLoopComparison(loopRows);
    logFocusMeasures(focusRows);

    if (drillDown && loops > 1) {
        logMeasureAudit('Loop 1 6/8 variation audit', buildMeasureAudit(capture, 1));
    }

    if (full) {
        logEventRows(buildEventLogRows(capture, [0, 1], focusRows));
    }
}

evaluate68Soloist();
