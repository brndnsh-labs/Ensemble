// @ts-nocheck
import { TIME_SIGNATURES } from '../public/config.js';
import { createPRNG } from '../public/engine/hash-utils.js';
import { resolveSoloistStyle } from '../public/engine/soloist-config.js';
import { getSoloistNotePhraseFirst as getSoloistNote } from '../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../public/state.js';
import { ACTIONS } from '../public/types.js';
import { getStepInfo, midiToNote } from '../public/utils.js';

const QUALITY_INTERVALS = {
    maj7: [0, 4, 7, 11],
    m7: [0, 3, 7, 10],
    7: [0, 4, 7, 10],
    dim: [0, 3, 6, 9],
    triad: [0, 4, 7],
};

const INTERVAL_LABELS = ['R', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

function normalizeStep(step, loopLength) {
    return ((step % loopLength) + loopLength) % loopLength;
}

function shouldSuppressLog(message) {
    return message.startsWith('[Seeder Debug]') || message.startsWith('[Composer]');
}

export function withMutedComposerLogs(callback, muted = true) {
    if (!muted) {
        return callback();
    }

    const originalLog = console.log;
    console.log = (...args) => {
        const message = args.map((arg) => String(arg)).join(' ');
        if (!shouldSuppressLog(message)) {
            originalLog(...args);
        }
    };

    try {
        return callback();
    } finally {
        console.log = originalLog;
    }
}

/**
 * Temporarily replaces Math.random with a seeded PRNG.
 * @param {string} seed
 * @param {() => any} callback
 */
function withSeededRandom(seed, callback) {
    const originalRandom = Math.random;
    const prng = createPRNG(seed);
    Math.random = () => prng();

    try {
        return callback();
    } finally {
        Math.random = originalRandom;
    }
}

function getOptionValue(options, key, fallback) {
    return Object.hasOwn(options, key) ? options[key] : fallback;
}

function formatMidi(midi) {
    const note = midiToNote(midi);
    return `${note.name}${note.octave}`;
}

function formatPosition(stepInMeasure, stepsPerBeat) {
    const beat = Math.floor(stepInMeasure / stepsPerBeat) + 1;
    const subdivision = stepInMeasure % stepsPerBeat;
    return `${beat}.${subdivision}`;
}

function getIntervalInfo(midi, chord) {
    if (!chord) {
        return { semitones: 0, label: 'R', flavor: 'unknown' };
    }

    const semitones = normalizeStep(midi - chord.rootMidi, 12);
    const label = INTERVAL_LABELS[semitones] || `${semitones}`;
    const chordTones = new Set(
        (chord.intervals || []).map((interval) => normalizeStep(interval, 12)),
    );

    if (semitones === 0) {
        return { semitones, label, flavor: 'root' };
    }
    if (semitones === 3 || semitones === 4) {
        return { semitones, label, flavor: 'third' };
    }
    if (semitones === 7) {
        return { semitones, label, flavor: 'fifth' };
    }
    if (semitones === 10 || semitones === 11) {
        return { semitones, label, flavor: 'seventh' };
    }
    if (chordTones.has(semitones)) {
        return { semitones, label, flavor: 'chord-tone' };
    }
    if (semitones === 2 || semitones === 5 || semitones === 9) {
        return { semitones, label, flavor: 'color' };
    }
    return { semitones, label, flavor: 'tension' };
}

function classifyCadence(note, chord) {
    if (!note || !chord) {
        return { text: 'rest', flavor: 'rest' };
    }

    const interval = getIntervalInfo(note.midi, chord);
    if (
        interval.flavor === 'root' ||
        interval.flavor === 'third' ||
        interval.flavor === 'fifth' ||
        interval.flavor === 'seventh'
    ) {
        return { text: `stable:${interval.label}`, flavor: 'stable' };
    }
    if (interval.flavor === 'color') {
        return { text: `color:${interval.label}`, flavor: 'color' };
    }
    return { text: `tense:${interval.label}`, flavor: 'tension' };
}

function classifyContour(midis) {
    if (midis.length === 0) {
        return 'rest';
    }
    if (midis.length === 1) {
        return 'single';
    }

    const directions = [];
    for (let i = 1; i < midis.length; i++) {
        const diff = midis[i] - midis[i - 1];
        if (diff > 0) {
            directions.push(1);
        } else if (diff < 0) {
            directions.push(-1);
        }
    }

    if (directions.length === 0) {
        return 'static';
    }
    if (directions.every((value) => value > 0)) {
        return 'ascend';
    }
    if (directions.every((value) => value < 0)) {
        return 'descend';
    }

    const firstDirection = directions[0];
    let changeCount = 0;
    let lastDirection = firstDirection;
    for (let i = 1; i < directions.length; i++) {
        if (directions[i] !== lastDirection) {
            changeCount++;
            lastDirection = directions[i];
        }
    }

    if (changeCount === 1) {
        return firstDirection > 0 ? 'arch' : 'valley';
    }
    return 'mixed';
}

function formatNoteToken(noteLike, stepInMeasure, stepsPerBeat) {
    const tags = [];
    if (noteLike.isAnchor) {
        tags.push('*');
    }
    const tripletPlacement = noteLike.tripletPlacement || noteLike.seedNote?.tripletPlacement;
    if (tripletPlacement) {
        tags.push(tripletPlacement);
    }
    if (noteLike.device) {
        tags.push(noteLike.device);
    }

    const tagSuffix = tags.length > 0 ? `[${tags.join(',')}]` : '';
    return `${formatPosition(stepInMeasure, stepsPerBeat)}:${formatMidi(noteLike.midi)}x${noteLike.durationSteps || 1}${tagSuffix}`;
}

function formatNoteList(tokens, maxTokens = 6) {
    if (tokens.length === 0) {
        return '-';
    }
    if (tokens.length <= maxTokens) {
        return tokens.join(' ');
    }
    return `${tokens.slice(0, maxTokens).join(' ')} ...(+${tokens.length - maxTokens})`;
}

function buildSeedLookups(seed, loopLength) {
    const byExactStep = new Map();
    const byWrappedStep = new Map();

    if (!seed?.notes) {
        return { byExactStep, byWrappedStep };
    }

    for (const note of seed.notes) {
        const exactBucket = byExactStep.get(note.step) || [];
        exactBucket.push(note);
        byExactStep.set(note.step, exactBucket);

        const wrappedStep = normalizeStep(note.step, loopLength);
        const wrappedBucket = byWrappedStep.get(wrappedStep) || [];
        wrappedBucket.push(note);
        byWrappedStep.set(wrappedStep, wrappedBucket);
    }

    return { byExactStep, byWrappedStep };
}

function isStepInWindow(step, windowStart, windowLength, loopLength) {
    const normalizedStart = normalizeStep(windowStart, loopLength);
    const normalizedEnd = normalizedStart + windowLength;

    if (normalizedEnd <= loopLength) {
        return step >= normalizedStart && step < normalizedEnd;
    }

    return step >= normalizedStart || step < normalizedEnd - loopLength;
}

function countMatches(seedNotes, events, matchPredicate) {
    let matches = 0;
    for (const seedNote of seedNotes) {
        if (events.some((event) => matchPredicate(seedNote, event))) {
            matches++;
        }
    }
    return matches;
}

function summarizeFlags({
    anchorCount,
    anchorStepHits,
    anchorExactHits,
    cadence,
    deviceCount,
    loop,
    noteCount,
    seedNoteCount,
    seedlessCount,
}) {
    const flags = [];

    if (seedNoteCount > 0 && noteCount === 0) {
        flags.push('head-drop');
    }
    if (anchorCount > 0 && anchorStepHits < anchorCount) {
        flags.push('anchor-miss');
    } else if (anchorCount > 0 && anchorExactHits < anchorCount) {
        flags.push('pitch-drift');
    }
    if (cadence.flavor === 'tension') {
        flags.push('open-cadence');
    }
    if (loop > 0 && seedlessCount > Math.max(1, Math.floor(noteCount / 2))) {
        flags.push('departing');
    }
    if (deviceCount > Math.max(1, Math.floor(noteCount / 2))) {
        flags.push('device-heavy');
    }

    return flags;
}

function getLoopEvents(capture, loop) {
    return capture.events.filter((event) => event.loop === loop && event.loopStep >= 0);
}

function getLoopAttackEvents(capture, loop) {
    const loopEvents = getLoopEvents(capture, loop).sort(
        (a, b) => a.absoluteStep - b.absoluteStep || a.note.midi - b.note.midi,
    );
    const attacks = [];
    for (const event of loopEvents) {
        const lastAttack = attacks[attacks.length - 1];
        if (!lastAttack || lastAttack.absoluteStep !== event.absoluteStep) {
            attacks.push(event);
        } else {
            attacks[attacks.length - 1] = event;
        }
    }
    return attacks;
}

function average(values) {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isCloseDuration(value, target) {
    return Math.abs(value - target) < 0.001;
}

function getMonotonyScore(row) {
    return row.oneBeatShare * 0.45 + row.stepShare * 0.35 - row.richContourShare * 0.2;
}

export function buildPerformanceMetrics(capture, loop = 0) {
    const attacks = getLoopAttackEvents(capture, loop);
    const durations = attacks.map((event) => event.note.durationSteps || 1);
    const midis = attacks.map((event) => event.note.midi);
    const tripletAttacks = attacks.filter(
        (event) => event.note.tripletPlacement || event.seedNote?.tripletPlacement,
    ).length;
    const intervals = [];

    for (let index = 1; index < attacks.length; index++) {
        const diff = Math.abs(attacks[index].note.midi - attacks[index - 1].note.midi);
        if (diff > 0) {
            intervals.push(diff);
        }
    }

    const measureRows = buildMeasureAudit(capture, loop);
    const totalAnchors = measureRows.reduce((sum, row) => sum + row.anchorCount, 0);
    const exactAnchors = measureRows.reduce((sum, row) => sum + row.anchorExactHits, 0);
    const richContours = measureRows.filter((row) =>
        ['arch', 'valley', 'mixed'].includes(row.contour),
    ).length;

    return {
        loop,
        attackCount: attacks.length,
        notesPerMeasure: attacks.length / Math.max(1, capture.arrangement.measuresPerLoop),
        oneBeatShare: durations.length
            ? durations.filter((duration) => isCloseDuration(duration, capture.ts.stepsPerBeat))
                  .length / durations.length
            : 0,
        subBeatShare: durations.length
            ? durations.filter((duration) => duration < capture.ts.stepsPerBeat).length /
              durations.length
            : 0,
        longShare: durations.length
            ? durations.filter((duration) => duration > capture.ts.stepsPerBeat).length /
              durations.length
            : 0,
        avgInterval: average(intervals),
        stepShare: intervals.length
            ? intervals.filter((interval) => interval <= 2).length / intervals.length
            : 0,
        skipShare: intervals.length
            ? intervals.filter((interval) => interval >= 3 && interval <= 4).length /
              intervals.length
            : 0,
        leapShare: intervals.length
            ? intervals.filter((interval) => interval >= 5).length / intervals.length
            : 0,
        octaveLeapShare: intervals.length
            ? intervals.filter((interval) => interval >= 12).length / intervals.length
            : 0,
        range: midis.length ? Math.max(...midis) - Math.min(...midis) : 0,
        richContourShare: measureRows.length ? richContours / measureRows.length : 0,
        stableCadenceShare: measureRows.length
            ? measureRows.filter((row) => row.cadenceFlavor === 'stable').length /
              measureRows.length
            : 0,
        anchorExactRate: totalAnchors > 0 ? exactAnchors / totalAnchors : 1,
        tripletAttackShare: attacks.length ? tripletAttacks / attacks.length : 0,
    };
}

function getResponseAttackTokens(events, stepsPerBeat = 4) {
    const tokens = [];
    const seen = new Set();
    const structuralSubdivision =
        stepsPerBeat % 2 === 0 ? Math.max(1, stepsPerBeat / 2) : Math.max(1, stepsPerBeat);
    for (const event of events) {
        const isStructuralDeviceAttack =
            !event.note.device ||
            Boolean(event.seedNote) ||
            Boolean(event.note.tripletPlacement) ||
            event.stepInMeasure % structuralSubdivision === 0;
        if (!isStructuralDeviceAttack) {
            continue;
        }
        const tripletPlacement =
            event.note.tripletPlacement || event.seedNote?.tripletPlacement || '-';
        const token = `${event.stepInMeasure}:${tripletPlacement}`;
        if (seen.has(token)) {
            continue;
        }
        seen.add(token);
        tokens.push(token);
    }
    return tokens;
}

function getContourFamily(contour) {
    if (contour === 'rest') {
        return 'rest';
    }
    if (contour === 'ascend') {
        return 'rise';
    }
    if (contour === 'descend') {
        return 'fall';
    }
    if (['arch', 'valley', 'mixed'].includes(contour)) {
        return 'shaped';
    }
    return contour;
}

function getContourEchoScore(sourceContour, targetContour) {
    if (sourceContour === targetContour) {
        return 1;
    }
    return getContourFamily(sourceContour) === getContourFamily(targetContour) ? 0.55 : 0;
}

export function buildLoopResponseMetrics(capture, sourceLoop = 0, targetLoop = 1) {
    const sourceRows = buildMeasureAudit(capture, sourceLoop);
    const targetRows = buildMeasureAudit(capture, targetLoop);
    const rhythmScores = [];
    const contourScores = [];
    const cadenceScores = [];
    const tripletScores = [];
    const targetPerformance = buildPerformanceMetrics(capture, targetLoop);

    for (let measureIndex = 0; measureIndex < capture.arrangement.measuresPerLoop; measureIndex++) {
        const sourceEvents = getMeasureEvents(capture, sourceLoop, measureIndex);
        const targetEvents = getMeasureEvents(capture, targetLoop, measureIndex);
        const sourceTokens = getResponseAttackTokens(sourceEvents, capture.ts.stepsPerBeat);
        const targetTokens = getResponseAttackTokens(targetEvents, capture.ts.stepsPerBeat);
        const targetTokenSet = new Set(targetTokens);
        const overlapCount = sourceTokens.filter((token) => targetTokenSet.has(token)).length;
        rhythmScores.push(
            sourceTokens.length > 0
                ? overlapCount / sourceTokens.length
                : targetTokens.length === 0
                  ? 1
                  : 0,
        );
        contourScores.push(
            getContourEchoScore(
                sourceRows[measureIndex]?.contour || 'rest',
                targetRows[measureIndex]?.contour || 'rest',
            ),
        );
        cadenceScores.push(
            sourceRows[measureIndex]?.cadenceFlavor === targetRows[measureIndex]?.cadenceFlavor
                ? 1
                : 0,
        );

        const sourceTriplet = sourceEvents.some(
            (event) => event.note.tripletPlacement || event.seedNote?.tripletPlacement,
        );
        if (sourceTriplet) {
            const targetTriplet = targetEvents.some(
                (event) => event.note.tripletPlacement || event.seedNote?.tripletPlacement,
            );
            tripletScores.push(targetTriplet ? 1 : 0);
        }
    }

    return {
        loop: targetLoop,
        responseRhythmReuseShare: average(rhythmScores),
        responseContourEchoShare: average(contourScores),
        responseCadenceStability: average(cadenceScores),
        tripletCarryShare: average(tripletScores),
        anchorExactRate: targetPerformance.anchorExactRate,
    };
}

export function buildAggregateResponseMetrics(capture, sourceLoop = 0, targetLoops = []) {
    const effectiveLoops = targetLoops.filter((loop) =>
        capture.events.some((event) => event.loop === loop && event.loopStep >= 0),
    );
    const loopMetrics = effectiveLoops.map((loop) =>
        buildLoopResponseMetrics(capture, sourceLoop, loop),
    );
    const loop1 = loopMetrics.find((row) => row.loop === 1) || null;
    const laterRows = loopMetrics.filter((row) => row.loop > 1);
    const aggregateLaterRows = laterRows.length > 0 ? laterRows : loop1 ? [loop1] : [];

    return {
        loop1RhythmReuseShare: loop1?.responseRhythmReuseShare || 0,
        loop1ContourEchoShare: loop1?.responseContourEchoShare || 0,
        loop1CadenceStability: loop1?.responseCadenceStability || 0,
        loop1AnchorExactRate: loop1?.anchorExactRate || 0,
        laterLoopRhythmReuseShare: average(
            aggregateLaterRows.map((row) => row.responseRhythmReuseShare),
        ),
        laterLoopContourEchoShare: average(
            aggregateLaterRows.map((row) => row.responseContourEchoShare),
        ),
        laterLoopCadenceStability: average(
            aggregateLaterRows.map((row) => row.responseCadenceStability),
        ),
        laterLoopTripletCarryShare: average(aggregateLaterRows.map((row) => row.tripletCarryShare)),
        laterLoopAnchorExactRate: average(aggregateLaterRows.map((row) => row.anchorExactRate)),
    };
}

export function buildSectionRecallMetrics(capture, loop = 0) {
    const measureRows = buildMeasureAudit(capture, loop);
    const loopEvents = getLoopEvents(capture, loop);
    const grouped = new Map();
    const occurrenceMap = new Map();

    for (const section of capture.arrangement.sectionMap) {
        const occurrence = (occurrenceMap.get(section.label) || 0) + 1;
        occurrenceMap.set(section.label, occurrence);
        const sectionMeasures = capture.arrangement.measurePlan.filter(
            (measure) => measure.start >= section.start && measure.end <= section.end,
        );
        const sectionEvents = loopEvents.filter(
            (event) => event.stepInLoop >= section.start && event.stepInLoop < section.end,
        );
        const sectionSeedNotes = getSeedWindowNotes(
            capture,
            loop,
            section.start,
            section.end - section.start,
        );
        const anchorNotes = sectionSeedNotes.filter((note) => note.isAnchor);
        const anchorExact = countMatches(
            anchorNotes,
            sectionEvents,
            (seedNote, event) =>
                seedNote.step === event.seedPosition && seedNote.midi === event.note.midi,
        );
        const lastMeasure = sectionMeasures[sectionMeasures.length - 1];
        const lastSectionEvent = sectionEvents[sectionEvents.length - 1] || null;
        const cadenceFlavor = lastSectionEvent
            ? classifyCadence(lastSectionEvent.note, lastSectionEvent.chord).flavor
            : measureRows[lastMeasure?.measureIndex || 0]?.cadenceFlavor || 'rest';
        const row = {
            label: section.label,
            occurrence,
            tokens: getResponseAttackTokens(sectionEvents, capture.ts.stepsPerBeat),
            cadenceFlavor,
            anchorExactRate:
                anchorNotes.length > 0 ? anchorExact / Math.max(1, anchorNotes.length) : 1,
        };
        const bucket = grouped.get(section.label) || [];
        bucket.push(row);
        grouped.set(section.label, bucket);
    }

    const rhythmScores = [];
    const cadenceScores = [];
    const anchorScores = [];

    for (const rows of grouped.values()) {
        if (rows.length < 2) {
            continue;
        }
        const baseline = rows[0];
        for (const row of rows.slice(1)) {
            const targetTokenSet = new Set(row.tokens);
            const overlapCount = baseline.tokens.filter((token) =>
                targetTokenSet.has(token),
            ).length;
            rhythmScores.push(
                baseline.tokens.length > 0
                    ? overlapCount / baseline.tokens.length
                    : row.tokens.length === 0
                      ? 1
                      : 0,
            );
            cadenceScores.push(baseline.cadenceFlavor === row.cadenceFlavor ? 1 : 0);
            anchorScores.push(row.anchorExactRate);
        }
    }

    return {
        loop,
        sectionRhythmRecallShare: average(rhythmScores),
        sectionCadenceStability: average(cadenceScores),
        sectionAnchorExactRate: average(anchorScores),
    };
}

export function buildAggregateSectionRecallMetrics(capture, targetLoops = []) {
    const effectiveLoops = targetLoops.filter((loop) =>
        capture.events.some((event) => event.loop === loop && event.loopStep >= 0),
    );
    const loopMetrics = effectiveLoops.map((loop) => buildSectionRecallMetrics(capture, loop));
    const loop1 = loopMetrics.find((row) => row.loop === 1) || null;
    const laterRows = loopMetrics.filter((row) => row.loop > 1);
    const aggregateLaterRows = laterRows.length > 0 ? laterRows : loop1 ? [loop1] : [];

    return {
        loop1SectionRhythmRecallShare: loop1?.sectionRhythmRecallShare || 0,
        loop1SectionCadenceStability: loop1?.sectionCadenceStability || 0,
        loop1SectionAnchorExactRate: loop1?.sectionAnchorExactRate || 0,
        laterLoopSectionRhythmRecallShare: average(
            aggregateLaterRows.map((row) => row.sectionRhythmRecallShare),
        ),
        laterLoopSectionCadenceStability: average(
            aggregateLaterRows.map((row) => row.sectionCadenceStability),
        ),
        laterLoopSectionAnchorExactRate: average(
            aggregateLaterRows.map((row) => row.sectionAnchorExactRate),
        ),
    };
}

export function buildAggregateFormArcMetrics(capture, targetLoops = []) {
    const effectiveLoops = targetLoops.filter((loop) =>
        capture.events.some((event) => event.loop === loop && event.loopStep >= 0),
    );
    const loopMetrics = effectiveLoops.map((loop) => {
        const loopEvents = getLoopEvents(capture, loop);
        const responseEvents = loopEvents.filter((event) => event.role === 'response');
        const formEvents = responseEvents.filter((event) => event.responseSource === 'form');
        const formDeviceEvents = formEvents.filter((event) => event.note.device);
        return {
            loop,
            formResponseShare: responseEvents.length
                ? formEvents.length / responseEvents.length
                : 0,
            formDeviceShare: formEvents.length ? formDeviceEvents.length / formEvents.length : 0,
        };
    });
    const loop1 = loopMetrics.find((row) => row.loop === 1) || null;
    const laterRows = loopMetrics.filter((row) => row.loop > 1);
    const aggregateLaterRows = laterRows.length > 0 ? laterRows : loop1 ? [loop1] : [];

    return {
        loop1FormResponseShare: loop1?.formResponseShare || 0,
        laterLoopFormResponseShare: average(aggregateLaterRows.map((row) => row.formResponseShare)),
        laterLoopFormDeviceShare: average(aggregateLaterRows.map((row) => row.formDeviceShare)),
    };
}

export function buildSeedSweep({
    genre,
    bpm,
    intensity,
    timeSignature,
    style = 'smart',
    key = 'C',
    arrangement,
    seeds = [],
    loops = 2,
    quietSeedLogs = true,
}) {
    const auditArrangement = arrangement || buildAuditArrangement('hook', timeSignature);
    const effectiveSeeds = seeds.length > 0 ? seeds : ['AUDIT_SEED'];
    const sweepRows = [];

    for (const seed of effectiveSeeds) {
        const { state, seedStyle, sessionSeed } = bootstrapSoloistAudit({
            genre,
            bpm,
            intensity,
            timeSignature: auditArrangement.timeSignature,
            style,
            key,
            seed,
            arrangement: auditArrangement,
            quietSeedLogs,
        });
        const capture = simulateSoloistLoops({
            state,
            arrangement: auditArrangement,
            loops: Math.max(1, loops),
            style,
        });
        const responseMetrics = buildAggregateResponseMetrics(
            capture,
            0,
            Array.from({ length: Math.max(0, loops - 1) }, (_, index) => index + 1),
        );
        const sectionMetrics = buildAggregateSectionRecallMetrics(
            capture,
            Array.from({ length: Math.max(0, loops - 1) }, (_, index) => index + 1),
        );
        const formArcMetrics = buildAggregateFormArcMetrics(
            capture,
            Array.from({ length: Math.max(0, loops - 1) }, (_, index) => index + 1),
        );

        sweepRows.push({
            genre,
            bpm,
            intensity,
            timeSignature: auditArrangement.timeSignature,
            seed,
            seedStyle,
            sessionSeedNotes: sessionSeed?.notes.length || 0,
            measuresPerLoop: auditArrangement.measuresPerLoop,
            ...buildPerformanceMetrics(capture, 0),
            ...responseMetrics,
            ...sectionMetrics,
            ...formArcMetrics,
        });
    }

    return sweepRows;
}

export function buildSeedSweepSummary(rows, focusCount = 5) {
    const focusRows = [...rows]
        .map((row) => ({
            ...row,
            monotonyScore: getMonotonyScore(row),
        }))
        .sort((a, b) => b.monotonyScore - a.monotonyScore)
        .slice(0, focusCount);

    return {
        rows,
        focusRows,
        aggregate: {
            seedCount: rows.length,
            notesPerMeasure: average(rows.map((row) => row.notesPerMeasure)),
            oneBeatShare: average(rows.map((row) => row.oneBeatShare)),
            subBeatShare: average(rows.map((row) => row.subBeatShare)),
            longShare: average(rows.map((row) => row.longShare)),
            avgInterval: average(rows.map((row) => row.avgInterval)),
            stepShare: average(rows.map((row) => row.stepShare)),
            skipShare: average(rows.map((row) => row.skipShare)),
            leapShare: average(rows.map((row) => row.leapShare)),
            octaveLeapShare: average(rows.map((row) => row.octaveLeapShare)),
            range: average(rows.map((row) => row.range)),
            richContourShare: average(rows.map((row) => row.richContourShare)),
            stableCadenceShare: average(rows.map((row) => row.stableCadenceShare)),
            anchorExactRate: average(rows.map((row) => row.anchorExactRate)),
            tripletAttackShare: average(rows.map((row) => row.tripletAttackShare || 0)),
            loop1RhythmReuseShare: average(rows.map((row) => row.loop1RhythmReuseShare || 0)),
            loop1ContourEchoShare: average(rows.map((row) => row.loop1ContourEchoShare || 0)),
            loop1CadenceStability: average(rows.map((row) => row.loop1CadenceStability || 0)),
            loop1AnchorExactRate: average(rows.map((row) => row.loop1AnchorExactRate || 0)),
            laterLoopRhythmReuseShare: average(
                rows.map((row) => row.laterLoopRhythmReuseShare || 0),
            ),
            laterLoopContourEchoShare: average(
                rows.map((row) => row.laterLoopContourEchoShare || 0),
            ),
            laterLoopCadenceStability: average(
                rows.map((row) => row.laterLoopCadenceStability || 0),
            ),
            laterLoopTripletCarryShare: average(
                rows.map((row) => row.laterLoopTripletCarryShare || 0),
            ),
            laterLoopAnchorExactRate: average(rows.map((row) => row.laterLoopAnchorExactRate || 0)),
            loop1SectionRhythmRecallShare: average(
                rows.map((row) => row.loop1SectionRhythmRecallShare || 0),
            ),
            loop1SectionCadenceStability: average(
                rows.map((row) => row.loop1SectionCadenceStability || 0),
            ),
            laterLoopSectionRhythmRecallShare: average(
                rows.map((row) => row.laterLoopSectionRhythmRecallShare || 0),
            ),
            laterLoopSectionCadenceStability: average(
                rows.map((row) => row.laterLoopSectionCadenceStability || 0),
            ),
            loop1FormResponseShare: average(rows.map((row) => row.loop1FormResponseShare || 0)),
            laterLoopFormResponseShare: average(
                rows.map((row) => row.laterLoopFormResponseShare || 0),
            ),
            laterLoopFormDeviceShare: average(rows.map((row) => row.laterLoopFormDeviceShare || 0)),
        },
    };
}

function getMeasureEvents(capture, loop, measureIndex) {
    return capture.events.filter(
        (event) =>
            event.loop === loop && event.loopStep >= 0 && event.measureIndex === measureIndex,
    );
}

function getSeedWindowNotes(capture, loop, startOffset, windowLength) {
    if (!capture.seed?.notes) {
        return [];
    }

    const windowStart = loop * capture.arrangement.totalSteps + startOffset;
    return capture.seed.notes.filter(
        (note) =>
            note.step >= 0 &&
            isStepInWindow(note.step, windowStart, windowLength, capture.seedLoopLength),
    );
}

function getSeedMeasureNotes(capture, loop, measureIndex) {
    const measure = capture.arrangement.measurePlan[measureIndex];
    if (!measure) {
        return [];
    }

    return getSeedWindowNotes(capture, loop, measure.start, capture.stepsPerMeasure);
}

function getSeedPickupNotes(capture) {
    if (!capture.seed?.notes) {
        return [];
    }
    return capture.seed.notes.filter((note) => note.step < 0);
}

function getChordLabel(chord) {
    return chord?.absName || chord?.quality || 'Chord';
}

/**
 * @param {string[]} argv
 */
export function parseCliArgs(argv) {
    const options = {};
    for (const arg of argv) {
        if (!arg.startsWith('--')) {
            continue;
        }
        const token = arg.slice(2);
        const separatorIndex = token.indexOf('=');
        if (separatorIndex === -1) {
            options[token] = true;
            continue;
        }
        const key = token.slice(0, separatorIndex);
        const value = token.slice(separatorIndex + 1);
        options[key] = value;
    }
    return options;
}

export function readBooleanOption(options, key, fallback = false) {
    const value = getOptionValue(options, key, fallback);
    if (typeof value === 'boolean') {
        return value;
    }
    if (value === undefined || value === null) {
        return fallback;
    }
    return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

export function readNumberOption(options, key, fallback) {
    const value = getOptionValue(options, key, fallback);
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function readStringOption(options, key, fallback) {
    const value = getOptionValue(options, key, fallback);
    return value === undefined || value === null || value === '' ? fallback : String(value);
}

export function createChord(
    absName,
    rootMidi,
    quality = 'maj7',
    intervals = QUALITY_INTERVALS[quality],
) {
    return {
        absName,
        rootMidi,
        quality,
        intervals: intervals || QUALITY_INTERVALS.triad,
        beats: 4,
    };
}

export function buildMeasureArrangement(timeSignature, sections) {
    const ts = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    const stepMap = [];
    const sectionMap = [];
    const measurePlan = [];
    let currentStep = 0;

    for (const section of sections) {
        const sectionStart = currentStep;
        for (const chord of section.measures) {
            const start = currentStep;
            const end = start + stepsPerMeasure;
            stepMap.push({ start, end, chord });
            measurePlan.push({
                label: section.label,
                chord,
                start,
                end,
                measureIndex: measurePlan.length,
            });
            currentStep = end;
        }
        sectionMap.push({ start: sectionStart, end: currentStep, label: section.label });
    }

    return {
        timeSignature,
        ts,
        stepsPerMeasure,
        totalSteps: currentStep,
        stepMap,
        sectionMap,
        measurePlan,
        measuresPerLoop: measurePlan.length,
        getEntryAtStep(step) {
            const normalized = normalizeStep(step, currentStep || 1);
            return (
                stepMap.find((entry) => normalized >= entry.start && normalized < entry.end) || null
            );
        },
        getSectionAtStep(step) {
            const normalized = normalizeStep(step, currentStep || 1);
            return (
                sectionMap.find((entry) => normalized >= entry.start && normalized < entry.end) ||
                null
            );
        },
    };
}

export function buildHookAuditArrangement(timeSignature = '4/4') {
    const cMaj7 = createChord('Cmaj7', 60, 'maj7');
    const g7 = createChord('G7', 67, '7');
    const aMin7 = createChord('Am7', 69, 'm7');
    const fMaj7 = createChord('Fmaj7', 65, 'maj7');
    const dMin7 = createChord('Dm7', 62, 'm7');
    const eMin7 = createChord('Em7', 64, 'm7');
    const a7 = createChord('A7', 69, '7');

    return buildMeasureArrangement(timeSignature, [
        { label: 'A', measures: [cMaj7, g7, aMin7, fMaj7] },
        { label: 'A', measures: [cMaj7, g7, aMin7, fMaj7] },
        { label: 'B', measures: [dMin7, g7, eMin7, a7] },
        { label: 'A', measures: [cMaj7, g7, aMin7, fMaj7] },
    ]);
}

export function buildAllBluesArrangement(timeSignature = '6/8') {
    const g7 = createChord('G7', 55, '7');
    const c7 = createChord('C7', 60, '7');
    const d7 = createChord('D7', 62, '7');
    const eb7 = createChord('Eb7', 63, '7');

    return buildMeasureArrangement(timeSignature, [
        { label: 'I', measures: [g7, g7, g7, g7] },
        { label: 'IV', measures: [c7, c7] },
        { label: 'I', measures: [g7, g7] },
        { label: 'Turn', measures: [d7, eb7] },
        { label: 'I', measures: [g7, g7] },
    ]);
}

export function buildAuditArrangement(kind = 'hook', timeSignature = undefined) {
    const normalized = String(kind || 'hook').toLowerCase();
    if (normalized === 'blues' || normalized === 'all-blues' || normalized === 'all_blues') {
        return buildAllBluesArrangement(timeSignature || '6/8');
    }
    return buildHookAuditArrangement(timeSignature || '4/4');
}

export function bootstrapSoloistAudit({
    genre,
    bpm,
    intensity,
    timeSignature,
    style = 'smart',
    key = 'C',
    seed = 'AUDIT_SEED',
    arrangement,
    quietSeedLogs = true,
}) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, timeSignature);
    dispatch(ACTIONS.SET_KEY, key);
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: genre });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style });
    dispatch(ACTIONS.SET_BPM, bpm);
    dispatch(ACTIONS.SET_BAND_INTENSITY, intensity);
    dispatch(ACTIONS.SET_SOLOIST_SEED, seed);

    const state = getState();
    state.arranger.totalSteps = arrangement.totalSteps;
    state.arranger.stepMap = arrangement.stepMap;
    state.arranger.sectionMap = arrangement.sectionMap;
    state.playback.currentLoopCount = 0;
    state.soloist.analysisSeed = seed;

    const seedStyle = resolveSoloistStyle(style, genre);
    const sessionSeed = withMutedComposerLogs(
        () => generateSessionSeed(state, state.arranger, seedStyle, intensity, seed),
        quietSeedLogs,
    );

    state.soloist.session.seed = sessionSeed;

    return {
        state,
        arrangement,
        seedStyle,
        ts: arrangement.ts,
        sessionSeed,
    };
}

export function simulateSoloistLoops({ state, arrangement, loops = 3, style = 'smart' }) {
    const analysisSeed = state.soloist.analysisSeed || 'SOLOIST_ANALYSIS';

    return withSeededRandom(analysisSeed, () => {
        const seedLoopLength =
            state.soloist.session.seed?.loopLengthSteps || arrangement.totalSteps;
        const stepLookup = buildSeedLookups(state.soloist.session.seed, seedLoopLength);
        const events = [];
        const stepsPerMeasure = arrangement.stepsPerMeasure;

        for (let loop = 0; loop < loops; loop++) {
            state.playback.currentLoopCount = loop;
            const startLoopStep = loop === 0 ? -stepsPerMeasure : 0;

            for (let loopStep = startLoopStep; loopStep < arrangement.totalSteps; loopStep++) {
                const absoluteStep = loop * arrangement.totalSteps + loopStep;
                const stepInLoop = normalizeStep(loopStep, arrangement.totalSteps);
                const currentEntry = arrangement.getEntryAtStep(stepInLoop);
                if (!currentEntry) {
                    continue;
                }

                const nextEntry = arrangement.getEntryAtStep(currentEntry.end) || currentEntry;
                const currentSection =
                    arrangement.getSectionAtStep(stepInLoop) || arrangement.sectionMap[0];
                const currentSectionIndex = Math.max(
                    0,
                    arrangement.sectionMap.indexOf(currentSection),
                );
                const nextSection =
                    arrangement.sectionMap[
                        (currentSectionIndex + 1) % arrangement.sectionMap.length
                    ] || currentSection;
                const stepInfo = getStepInfo(
                    absoluteStep,
                    arrangement.ts,
                    arrangement.stepMap,
                    TIME_SIGNATURES,
                );
                const coordination = {
                    sectionStart: currentSection?.start ?? 0,
                    sectionEnd: currentSection?.end ?? arrangement.totalSteps,
                    bypassRhythm: false,
                    isTurnaround:
                        stepInLoop >=
                        (currentSection?.end ?? arrangement.totalSteps) - stepsPerMeasure,
                    stepCoordination: {
                        isMeasureEnd:
                            stepInfo?.isMeasureEnd ||
                            stepInfo?.mStep === arrangement.stepsPerMeasure - 1,
                        upcomingSectionFirstChord:
                            arrangement.getEntryAtStep(nextSection.start)?.chord || null,
                    },
                };

                const stepInChord = stepInLoop - currentEntry.start;
                const result = getSoloistNote(
                    state,
                    currentEntry.chord,
                    nextEntry.chord,
                    absoluteStep,
                    440,
                    0,
                    style,
                    stepInChord,
                    coordination,
                    stepInfo,
                );

                if (!result) {
                    continue;
                }

                const notes = Array.isArray(result) ? result : [result];
                const seedPosition = normalizeStep(absoluteStep, seedLoopLength);
                const seedCandidates =
                    loop === 0 && loopStep < 0
                        ? stepLookup.byExactStep.get(loopStep) || []
                        : stepLookup.byWrappedStep.get(seedPosition) || [];
                const seedNote = seedCandidates[0] || null;

                for (const note of notes) {
                    events.push({
                        loop,
                        absoluteStep,
                        loopStep,
                        stepInLoop,
                        seedPosition,
                        measureIndex: Math.floor(stepInLoop / stepsPerMeasure),
                        measureNumber: Math.floor(stepInLoop / stepsPerMeasure) + 1,
                        stepInMeasure: stepInLoop % stepsPerMeasure,
                        chord: currentEntry.chord,
                        sectionLabel: currentSection?.label || 'Main',
                        role: state.soloist.session.currentPhrase.context?.role || '-',
                        profile: state.soloist.session.currentPhrase.context?.profile || '-',
                        responseMode:
                            state.soloist.session.currentPhrase.context?.responseMode || 'free',
                        responseSource:
                            state.soloist.session.currentPhrase.context?.responseSource || 'free',
                        note,
                        seedNote,
                        isSeedStep: Boolean(seedNote),
                        seedExactMatch: Boolean(seedNote && note.midi === seedNote.midi),
                        seedPitchClassMatch: Boolean(
                            seedNote &&
                                normalizeStep(note.midi, 12) === normalizeStep(seedNote.midi, 12),
                        ),
                    });
                }
            }
        }

        return {
            arrangement,
            seed: state.soloist.session.seed,
            seedLoopLength,
            events,
            stepsPerMeasure,
            ts: arrangement.ts,
        };
    });
}

export function buildPickupSummary(capture) {
    const pickupSeedNotes = getSeedPickupNotes(capture);
    const pickupEvents = capture.events.filter((event) => event.loop === 0 && event.loopStep < 0);

    return {
        seedCount: pickupSeedNotes.length,
        playedCount: pickupEvents.length,
        seedLine: formatNoteList(
            pickupSeedNotes.map((note) =>
                formatNoteToken(note, note.step + capture.stepsPerMeasure, capture.ts.stepsPerBeat),
            ),
        ),
        playedLine: formatNoteList(
            pickupEvents.map((event) =>
                formatNoteToken(
                    event.note,
                    event.loopStep + capture.stepsPerMeasure,
                    capture.ts.stepsPerBeat,
                ),
            ),
        ),
    };
}

export function buildMeasureAudit(capture, loop) {
    const rows = [];

    for (let measureIndex = 0; measureIndex < capture.arrangement.measuresPerLoop; measureIndex++) {
        const measure = capture.arrangement.measurePlan[measureIndex];
        const seedNotes = getSeedMeasureNotes(capture, loop, measureIndex);
        const events = getMeasureEvents(capture, loop, measureIndex);
        const seedWindowStart = loop * capture.arrangement.totalSteps + measure.start;
        const anchorNotes = seedNotes.filter((note) => note.isAnchor);
        const noteCount = events.length;
        const pulseHits = events.filter((event) =>
            capture.ts.pulse?.includes(event.stepInMeasure),
        ).length;
        const deviceCount = events.filter((event) => event.note.device).length;
        const seedlessCount = events.filter((event) => !event.seedNote).length;
        const lastEvent = events[events.length - 1] || null;
        const cadence = classifyCadence(lastEvent?.note || null, measure.chord);
        const contour = classifyContour(events.map((event) => event.note.midi));
        const anchorStepHits = countMatches(
            anchorNotes,
            events,
            (seedNote, event) => seedNote.step === event.seedPosition,
        );
        const anchorExactHits = countMatches(
            anchorNotes,
            events,
            (seedNote, event) =>
                seedNote.step === event.seedPosition && seedNote.midi === event.note.midi,
        );
        const seedPitchMatches = countMatches(
            seedNotes,
            events,
            (seedNote, event) =>
                seedNote.step === event.seedPosition &&
                normalizeStep(seedNote.midi, 12) === normalizeStep(event.note.midi, 12),
        );
        const flags = summarizeFlags({
            anchorCount: anchorNotes.length,
            anchorStepHits,
            anchorExactHits,
            cadence,
            deviceCount,
            loop,
            noteCount,
            seedNoteCount: seedNotes.length,
            seedlessCount,
        });

        rows.push({
            loop,
            measureNumber: measureIndex + 1,
            sectionLabel: measure.label,
            chordLabel: getChordLabel(measure.chord),
            seedCount: seedNotes.length,
            noteCount,
            anchorCount: anchorNotes.length,
            anchorStepHits,
            anchorExactHits,
            seedPitchMatches,
            deviceCount,
            seedlessCount,
            pulseHits,
            pulseCount: noteCount,
            cadence: cadence.text,
            cadenceFlavor: cadence.flavor,
            contour,
            flags,
            seedLine: formatNoteList(
                seedNotes.map((note) =>
                    formatNoteToken(
                        note,
                        normalizeStep(note.step - seedWindowStart, capture.seedLoopLength),
                        capture.ts.stepsPerBeat,
                    ),
                ),
            ),
            playedLine: formatNoteList(
                events.map((event) =>
                    formatNoteToken(event.note, event.stepInMeasure, capture.ts.stepsPerBeat),
                ),
            ),
        });
    }

    return rows;
}

export function buildLoopComparison(capture) {
    const loopCount =
        capture.events.reduce((maxLoop, event) => Math.max(maxLoop, event.loop), -1) + 1;
    const rows = [];

    for (let loop = 0; loop < loopCount; loop++) {
        const events = getLoopEvents(capture, loop);
        const seedNotes = getSeedWindowNotes(capture, loop, 0, capture.arrangement.totalSteps);
        const anchorNotes = seedNotes.filter((note) => note.isAnchor);
        const measureRows = buildMeasureAudit(capture, loop);
        const responseMetrics = loop > 0 ? buildLoopResponseMetrics(capture, 0, loop) : null;
        const exactMatches = countMatches(
            seedNotes,
            events,
            (seedNote, event) =>
                seedNote.step === event.seedPosition && seedNote.midi === event.note.midi,
        );
        const pitchMatches = countMatches(
            seedNotes,
            events,
            (seedNote, event) =>
                seedNote.step === event.seedPosition &&
                normalizeStep(seedNote.midi, 12) === normalizeStep(event.note.midi, 12),
        );
        const anchorPresence = countMatches(
            anchorNotes,
            events,
            (seedNote, event) => seedNote.step === event.seedPosition,
        );
        const anchorExact = countMatches(
            anchorNotes,
            events,
            (seedNote, event) =>
                seedNote.step === event.seedPosition && seedNote.midi === event.note.midi,
        );
        const pulseHits = events.filter((event) =>
            capture.ts.pulse?.includes(event.stepInMeasure),
        ).length;

        rows.push({
            Loop: loop,
            'Notes/M': (events.length / Math.max(1, capture.arrangement.measuresPerLoop)).toFixed(
                1,
            ),
            'Seed exact': `${exactMatches}/${seedNotes.length}`,
            'Seed pc': `${pitchMatches}/${seedNotes.length}`,
            'Anchor hit': `${anchorPresence}/${anchorNotes.length}`,
            'Anchor exact': `${anchorExact}/${anchorNotes.length}`,
            Seedless: events.filter((event) => !event.seedNote).length,
            Devices: events.filter((event) => event.note.device).length,
            'Stable cadences': `${measureRows.filter((row) => row.cadenceFlavor === 'stable').length}/${measureRows.length}`,
            'Pulse hits': `${pulseHits}/${events.length || 1}`,
            'Rhythm reuse': responseMetrics
                ? formatPercent(responseMetrics.responseRhythmReuseShare)
                : '-',
            'Contour echo': responseMetrics
                ? formatPercent(responseMetrics.responseContourEchoShare)
                : '-',
            'Cadence echo': responseMetrics
                ? formatPercent(responseMetrics.responseCadenceStability)
                : '-',
            'Triplet carry': responseMetrics
                ? formatPercent(responseMetrics.tripletCarryShare)
                : '-',
        });
    }

    return rows;
}

export function buildSectionSummary(capture, loop) {
    const occurrenceMap = new Map();
    const measureRows = buildMeasureAudit(capture, loop);
    const rows = [];
    const baselineByLabel = new Map();
    const loopEvents = getLoopEvents(capture, loop);

    for (const section of capture.arrangement.sectionMap) {
        const occurrence = (occurrenceMap.get(section.label) || 0) + 1;
        occurrenceMap.set(section.label, occurrence);
        const sectionMeasures = capture.arrangement.measurePlan.filter(
            (measure) => measure.start >= section.start && measure.end <= section.end,
        );
        const sectionEvents = loopEvents.filter(
            (event) => event.stepInLoop >= section.start && event.stepInLoop < section.end,
        );
        const sectionSeedNotes = getSeedWindowNotes(
            capture,
            loop,
            section.start,
            section.end - section.start,
        );
        const anchorNotes = sectionSeedNotes.filter((note) => note.isAnchor);
        const anchorExact = countMatches(
            anchorNotes,
            sectionEvents,
            (seedNote, event) =>
                seedNote.step === event.seedPosition && seedNote.midi === event.note.midi,
        );
        const lastMeasure = sectionMeasures[sectionMeasures.length - 1];
        const cadenceRow = measureRows[lastMeasure?.measureIndex || 0];
        const sectionTokens = getResponseAttackTokens(sectionEvents);
        const baseline = baselineByLabel.get(section.label) || null;
        const targetTokenSet = new Set(sectionTokens);
        const rhythmEcho = baseline
            ? baseline.tokens.length > 0
                ? baseline.tokens.filter((token) => targetTokenSet.has(token)).length /
                  baseline.tokens.length
                : sectionTokens.length === 0
                  ? 1
                  : 0
            : null;
        const cadenceEcho = baseline
            ? baseline.cadenceFlavor === cadenceRow?.cadenceFlavor
                ? 1
                : 0
            : null;

        if (!baseline) {
            baselineByLabel.set(section.label, {
                tokens: sectionTokens,
                cadenceFlavor: cadenceRow?.cadenceFlavor || 'rest',
            });
        }

        rows.push({
            label: section.label,
            instance: occurrence,
            Section: `${section.label}${occurrence}`,
            Measures: `${Math.floor(section.start / capture.stepsPerMeasure) + 1}-${Math.ceil(section.end / capture.stepsPerMeasure)}`,
            'Notes/M': (sectionEvents.length / Math.max(1, sectionMeasures.length)).toFixed(1),
            'Anchor exact': `${anchorExact}/${anchorNotes.length}`,
            'Rhythm echo': baseline ? formatPercent(rhythmEcho) : '-',
            'Cadence echo': baseline ? (cadenceEcho ? 'yes' : 'no') : '-',
            Cadence: cadenceRow?.cadence || 'rest',
            seedAnchorExact: anchorExact,
            seedAnchorCount: anchorNotes.length,
            sectionRhythmRecall: rhythmEcho,
            sectionCadenceRecall: cadenceEcho,
        });
    }

    return rows;
}

export function buildRestatementNotes(sectionRows) {
    const grouped = new Map();
    for (const row of sectionRows) {
        const bucket = grouped.get(row.label) || [];
        bucket.push(row);
        grouped.set(row.label, bucket);
    }

    const lines = [];
    for (const [label, rows] of grouped.entries()) {
        if (rows.length < 2) {
            continue;
        }
        const baseline = rows[0];
        const comparisons = rows
            .slice(1)
            .map(
                (row) =>
                    `${row.Section} ${row['Anchor exact']} rhythm ${row['Rhythm echo']} cadence ${row.Cadence}`,
            )
            .join(' | ');
        lines.push(
            `${label} restatement -> ${baseline.Section} baseline ${baseline['Anchor exact']}; ${comparisons}`,
        );
    }

    return lines;
}

export function buildFocusMeasures(capture, loops = [0, 1], limit = 8) {
    const focusRows = [];
    for (const loop of loops) {
        const rows = buildMeasureAudit(capture, loop);
        for (const row of rows) {
            if (row.flags.length === 0) {
                continue;
            }
            focusRows.push({
                Loop: loop,
                Measure: row.measureNumber,
                Section: row.sectionLabel,
                Chord: row.chordLabel,
                Anchors: `${row.anchorExactHits}/${row.anchorCount}`,
                Cadence: row.cadence,
                Focus: row.flags.join(', '),
            });
        }
    }

    return focusRows.slice(0, limit);
}

export function buildEventLogRows(capture, loops = [0], flaggedMeasures = null) {
    const flaggedSet =
        flaggedMeasures && flaggedMeasures.length > 0
            ? new Set(flaggedMeasures.map((row) => `${row.Loop}:${row.Measure}`))
            : null;

    return capture.events
        .filter((event) => loops.includes(event.loop))
        .filter((event) => {
            if (!flaggedSet) {
                return true;
            }
            return flaggedSet.has(`${event.loop}:${event.measureNumber}`);
        })
        .map((event) => ({
            loop: event.loop,
            measure: event.measureNumber,
            beat: formatPosition(event.stepInMeasure, capture.ts.stepsPerBeat),
            note: formatMidi(event.note.midi),
            midi: event.note.midi,
            dur: event.note.durationSteps || 1,
            role: event.role,
            profile: event.profile,
            chord: getChordLabel(event.chord),
            seed: event.seedNote ? formatMidi(event.seedNote.midi) : '-',
            match: event.seedExactMatch ? 'exact' : event.seedPitchClassMatch ? 'pc' : '-',
            device: event.note.device || '-',
        }));
}

function formatPercent(value) {
    return `${(value * 100).toFixed(0)}%`;
}

export function logMeasureAudit(title, rows) {
    console.log(`\n--- ${title} ---`);
    for (const row of rows) {
        console.log(
            `M${String(row.measureNumber).padStart(2, '0')} ${row.sectionLabel.padEnd(2)} ${row.chordLabel.padEnd(6)} | seed ${row.seedLine}`,
        );
        console.log(
            `          played ${row.playedLine} | anchors ${row.anchorExactHits}/${row.anchorCount} exact, ${row.anchorStepHits}/${row.anchorCount} step | cadence ${row.cadence} | contour ${row.contour}${row.flags.length > 0 ? ` | flags ${row.flags.join(', ')}` : ''}`,
        );
    }
}

export function logLoopComparison(rows) {
    console.log('\n--- Loop Comparison ---');
    console.table(rows);
}

export function logSectionSummary(rows, restatementNotes = []) {
    console.log('\n--- Section Summary ---');
    console.table(
        rows.map((row) => ({
            Section: row.Section,
            Measures: row.Measures,
            'Notes/M': row['Notes/M'],
            'Anchor exact': row['Anchor exact'],
            Cadence: row.Cadence,
        })),
    );

    if (restatementNotes.length > 0) {
        console.log('\nRestatement checks:');
        for (const line of restatementNotes) {
            console.log(`- ${line}`);
        }
    }
}

export function logFocusMeasures(rows) {
    console.log('\n--- Focus Measures ---');
    if (rows.length === 0) {
        console.log('No flagged measures in this run.');
        return;
    }
    console.table(rows);
}

export function logEventRows(rows) {
    console.log('\n--- Event Log ---');
    for (const row of rows) {
        console.log(
            `L${row.loop} M${String(row.measure).padStart(2, '0')} ${row.beat.padEnd(3)} | ${row.note.padEnd(4)} ${String(row.midi).padStart(3)} x${String(row.dur).padEnd(2)} | ${row.chord.padEnd(6)} | role ${row.role.padEnd(8)} | profile ${row.profile.padEnd(8)} | seed ${row.seed.padEnd(4)} | ${row.match.padEnd(5)} | ${row.device}`,
        );
    }
}

export function logSeedSweepSummary(summary) {
    console.log(`\n--- Seed Sweep Summary (${summary.aggregate.seedCount} seeds) ---`);
    console.table(
        summary.rows.map((row) => ({
            Seed: row.seed,
            Style: row.seedStyle,
            'Attacks/M': row.notesPerMeasure.toFixed(2),
            '1-beat %': formatPercent(row.oneBeatShare),
            '<1 beat %': formatPercent(row.subBeatShare),
            'Triplet %': formatPercent(row.tripletAttackShare || 0),
            'Step %': formatPercent(row.stepShare),
            'Skip %': formatPercent(row.skipShare),
            'Leap %': formatPercent(row.leapShare),
            'Rich contour %': formatPercent(row.richContourShare),
            Range: row.range.toFixed(1),
            'Anchor exact %': formatPercent(row.anchorExactRate),
            'L1 rhythm %': formatPercent(row.loop1RhythmReuseShare || 0),
            'L1 contour %': formatPercent(row.loop1ContourEchoShare || 0),
            'L1 section %': formatPercent(row.loop1SectionRhythmRecallShare || 0),
            'L+ rhythm %': formatPercent(row.laterLoopRhythmReuseShare || 0),
            'L+ section %': formatPercent(row.laterLoopSectionRhythmRecallShare || 0),
            'L+ cadence %': formatPercent(row.laterLoopCadenceStability || 0),
            'L+ triplet %': formatPercent(row.laterLoopTripletCarryShare || 0),
        })),
    );

    console.log('\nAggregate averages:');
    console.table([
        {
            'Attacks/M': summary.aggregate.notesPerMeasure.toFixed(2),
            '1-beat %': formatPercent(summary.aggregate.oneBeatShare),
            '<1 beat %': formatPercent(summary.aggregate.subBeatShare),
            'Triplet %': formatPercent(summary.aggregate.tripletAttackShare || 0),
            '>1 beat %': formatPercent(summary.aggregate.longShare),
            'Avg interval': summary.aggregate.avgInterval.toFixed(2),
            'Step %': formatPercent(summary.aggregate.stepShare),
            'Skip %': formatPercent(summary.aggregate.skipShare),
            'Leap %': formatPercent(summary.aggregate.leapShare),
            'Oct+ %': formatPercent(summary.aggregate.octaveLeapShare),
            Range: summary.aggregate.range.toFixed(1),
            'Rich contour %': formatPercent(summary.aggregate.richContourShare),
            'Stable cadence %': formatPercent(summary.aggregate.stableCadenceShare),
            'Anchor exact %': formatPercent(summary.aggregate.anchorExactRate),
            'L1 rhythm %': formatPercent(summary.aggregate.loop1RhythmReuseShare || 0),
            'L1 contour %': formatPercent(summary.aggregate.loop1ContourEchoShare || 0),
            'L1 cadence %': formatPercent(summary.aggregate.loop1CadenceStability || 0),
            'L1 section %': formatPercent(summary.aggregate.loop1SectionRhythmRecallShare || 0),
            'L+ rhythm %': formatPercent(summary.aggregate.laterLoopRhythmReuseShare || 0),
            'L+ section %': formatPercent(summary.aggregate.laterLoopSectionRhythmRecallShare || 0),
            'L+ cadence %': formatPercent(summary.aggregate.laterLoopCadenceStability || 0),
            'L+ sec cad %': formatPercent(summary.aggregate.laterLoopSectionCadenceStability || 0),
            'L+ triplet %': formatPercent(summary.aggregate.laterLoopTripletCarryShare || 0),
        },
    ]);

    if (summary.focusRows.length > 0) {
        console.log('\nMost monotony-prone seeds:');
        console.table(
            summary.focusRows.map((row) => ({
                Seed: row.seed,
                Score: row.monotonyScore.toFixed(3),
                '1-beat %': formatPercent(row.oneBeatShare),
                'Triplet %': formatPercent(row.tripletAttackShare || 0),
                'Step %': formatPercent(row.stepShare),
                'Leap %': formatPercent(row.leapShare),
                'Rich contour %': formatPercent(row.richContourShare),
                Range: row.range.toFixed(1),
                'L1 rhythm %': formatPercent(row.loop1RhythmReuseShare || 0),
                'L1 section %': formatPercent(row.loop1SectionRhythmRecallShare || 0),
                'L+ rhythm %': formatPercent(row.laterLoopRhythmReuseShare || 0),
                'L+ section %': formatPercent(row.laterLoopSectionRhythmRecallShare || 0),
                'L+ cadence %': formatPercent(row.laterLoopCadenceStability || 0),
            })),
        );
    }
}
