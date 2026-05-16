// @ts-nocheck
import { TIME_SIGNATURES } from '../public/config.js';
import { generateDrumFills, generateDrumOrchestration } from '../public/engine/drum-seeder.js';
import { applyGrooveOverrides, getDrumMotif } from '../public/engine/groove-engine.js';
import { dispatch, getState } from '../public/state.js';
import { ACTIONS } from '../public/types.js';
import { getStepInfo } from '../public/utils.js';
import {
    buildAuditArrangement,
    parseCliArgs,
    readBooleanOption,
    readNumberOption,
    readStringOption,
} from './soloist-analysis-utils.js';

const DEFAULT_SEED = 'DRUM_AUDIT';
const AUDIT_INSTRUMENTS = [
    'Kick',
    'Snare',
    'HiHat',
    'Open',
    'Ride',
    'Crash',
    'High Tom',
    'Mid Tom',
    'Low Tom',
];

function normalizeStep(step, loopLength) {
    return ((step % loopLength) + loopLength) % loopLength;
}

function roundValue(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function average(values) {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hashSeed(seed) {
    let hash = 2166136261;
    for (const char of String(seed || DEFAULT_SEED)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createSeededRandom(seed) {
    let state = hashSeed(seed) || 1;
    return () => {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function withSeededRandom(seed, callback) {
    const originalRandom = Math.random;
    Math.random = createSeededRandom(seed);
    try {
        return callback();
    } finally {
        Math.random = originalRandom;
    }
}

function findRangeEntry(entries, step) {
    if (!Array.isArray(entries)) {
        return null;
    }
    return entries.find((entry) => step >= entry.start && step < entry.end) || null;
}

function getSectionRole(label) {
    const normalized = String(label || 'Main').toLowerCase();
    if (normalized.includes('intro')) {
        return 'Intro';
    }
    if (normalized.includes('chorus') || normalized.includes('drop')) {
        return 'Chorus';
    }
    if (normalized.includes('bridge')) {
        return 'Bridge';
    }
    if (normalized.includes('outro') || normalized.includes('end')) {
        return 'Outro';
    }
    return 'Verse';
}

function countFillNotes(fillData) {
    if (!fillData?.steps) {
        return 0;
    }
    return Object.values(fillData.steps).reduce((sum, notes) => sum + notes.length, 0);
}

function getBaseStepValue(instName, stepInfo) {
    if (instName === 'Kick') {
        if (stepInfo.isMeasureStart) {
            return 2;
        }
        return stepInfo.isGroupStart ? 1 : 0;
    }
    if (instName === 'Snare') {
        return stepInfo.isBackbeat ? 2 : 0;
    }
    if (instName === 'HiHat') {
        return stepInfo.isBeatStart || stepInfo.isOffbeat || stepInfo.isPulseStart ? 1 : 0;
    }
    return 0;
}

function buildDrumAuditArrangement(kind = 'hook', timeSignature = undefined) {
    const base = buildAuditArrangement(kind, timeSignature);
    const sectionMap = base.sectionMap.map((section, index) => ({
        ...section,
        id: `section-${index}`,
    }));
    const stepMap = base.stepMap.map((entry) => {
        const section = findRangeEntry(sectionMap, entry.start);
        return {
            ...entry,
            chord: {
                ...entry.chord,
                sectionId: section?.id || 'section-0',
                sectionLabel: section?.label || 'Main',
            },
        };
    });
    const measurePlan = base.measurePlan.map((measure) => {
        const section = findRangeEntry(sectionMap, measure.start);
        return {
            ...measure,
            sectionId: section?.id || 'section-0',
            sectionLabel: section?.label || measure.label || 'Main',
        };
    });
    const totalSteps = base.totalSteps;

    return {
        ...base,
        stepMap,
        sectionMap,
        measurePlan,
        getEntryAtStep(step) {
            const normalized = normalizeStep(step, totalSteps || 1);
            return findRangeEntry(stepMap, normalized);
        },
        getSectionAtStep(step) {
            const normalized = normalizeStep(step, totalSteps || 1);
            return findRangeEntry(sectionMap, normalized);
        },
    };
}

function bootstrapDrumAudit({
    genre,
    bpm,
    intensity,
    timeSignature,
    arrangementName = 'hook',
    creativity = true,
    seed = DEFAULT_SEED,
}) {
    const arrangement = buildDrumAuditArrangement(arrangementName, timeSignature);

    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, arrangement.timeSignature);
    dispatch(ACTIONS.SET_BPM, bpm);
    dispatch(ACTIONS.SET_BAND_INTENSITY, intensity);
    dispatch(ACTIONS.SET_AUTO_INTENSITY, false);
    dispatch(ACTIONS.UPDATE_GB, {
        enabled: true,
        creativity,
        genreFeel: genre,
        lastDrumPreset: genre,
        lastSmartGenre: genre,
        fillActive: false,
        fillSteps: {},
        pendingCrash: false,
    });

    const state = getState();
    state.arranger.timeSignature = arrangement.timeSignature;
    state.arranger.stepMap = arrangement.stepMap;
    state.arranger.sectionMap = arrangement.sectionMap;
    state.arranger.totalSteps = arrangement.totalSteps;
    state.playback.currentLoopCount = 0;
    state.soloist.enabled = false;
    state.soloist.busySteps = 0;

    const sectionSeedMap = Object.fromEntries(
        arrangement.sectionMap.map((section) => [
            section.id,
            roundValue(createSeededRandom(`${seed}:${section.id}`)(), 6),
        ]),
    );
    const orchestrationMap = generateDrumOrchestration(
        state,
        state.arranger,
        genre,
        intensity,
        seed,
    );
    const fillMap = generateDrumFills(state, state.arranger, genre, intensity, seed);

    dispatch(ACTIONS.UPDATE_GB, {
        sectionSeedMap,
        orchestrationMap,
        fillMap,
    });

    return {
        state,
        arrangement,
    };
}

function createMeasureRow({
    loop,
    measure,
    orchestration,
    fillData,
    intensity,
    creativity,
    genre,
    sectionSeed,
}) {
    const role = getSectionRole(measure.sectionLabel);
    const motif = getDrumMotif(sectionSeed, genre, creativity ? 0.8 : 0.3, intensity);
    const nextSection = null;

    return {
        loop,
        measureIndex: measure.measureIndex,
        measureNumber: measure.measureIndex + 1,
        sectionLabel: measure.sectionLabel,
        role,
        intensity: roundValue(intensity, 2),
        energyLevel: roundValue(orchestration?.energyLevel ?? intensity, 2),
        motif,
        motifComplexity: orchestration?.motifComplexity ?? 0,
        rideVoice: orchestration?.rideVoice || '-',
        snareVoice: orchestration?.snareVoice || '-',
        fillStart: Boolean(fillData),
        fillCrash: !!fillData?.crash,
        fillNoteCount: countFillNotes(fillData),
        nextSectionLabel: nextSection?.label || '-',
        kickHits: 0,
        snareHits: 0,
        sidestickHits: 0,
        ghostSnareHits: 0,
        timekeepingHits: 0,
        openHits: 0,
        rideHits: 0,
        tomHits: 0,
        cymbalAccents: 0,
        flags: [],
    };
}

function tallyDrumHit(row, soundName, velocity) {
    if (soundName === 'Kick') {
        row.kickHits++;
        return;
    }
    if (soundName === 'Snare') {
        row.snareHits++;
        if (velocity < 0.65) {
            row.ghostSnareHits++;
        }
        return;
    }
    if (soundName === 'Sidestick') {
        row.sidestickHits++;
        return;
    }
    if (soundName === 'HiHat') {
        row.timekeepingHits++;
        return;
    }
    if (soundName === 'Open') {
        row.timekeepingHits++;
        row.openHits++;
        row.cymbalAccents++;
        return;
    }
    if (soundName === 'Ride') {
        row.timekeepingHits++;
        row.rideHits++;
        return;
    }
    if (soundName === 'Crash') {
        row.cymbalAccents++;
        return;
    }
    if (soundName.includes('Tom')) {
        row.tomHits++;
    }
}

function flagMeasure(row, genre) {
    if (row.fillStart && row.fillNoteCount === 0) {
        row.flags.push('empty-fill');
    }
    if ((genre === 'Rock' || genre === 'Metal' || genre === 'Country') && row.timekeepingHits < 4) {
        row.flags.push('thin-time');
    }
    if (row.role === 'Chorus' && row.energyLevel < row.intensity) {
        row.flags.push('flat-chorus');
    }
    if (row.fillStart && row.fillCrash) {
        row.flags.push('crash-entry');
    }
}

function buildLoopSummary(rows) {
    const loopMap = new Map();
    for (const row of rows) {
        const bucket = loopMap.get(row.loop) || [];
        bucket.push(row);
        loopMap.set(row.loop, bucket);
    }

    return Array.from(loopMap.entries()).map(([loop, loopRows]) => ({
        Loop: loop,
        Measures: loopRows.length,
        'Avg kick': roundValue(average(loopRows.map((row) => row.kickHits)), 2),
        'Avg snare': roundValue(
            average(loopRows.map((row) => row.snareHits + row.sidestickHits)),
            2,
        ),
        'Avg time': roundValue(average(loopRows.map((row) => row.timekeepingHits)), 2),
        'Open hats': loopRows.reduce((sum, row) => sum + row.openHits, 0),
        Fills: loopRows.filter((row) => row.fillStart).length,
    }));
}

function buildSectionSummary(rows) {
    const sectionMap = new Map();
    for (const row of rows) {
        const bucket = sectionMap.get(row.sectionLabel) || [];
        bucket.push(row);
        sectionMap.set(row.sectionLabel, bucket);
    }

    return Array.from(sectionMap.entries()).map(([sectionLabel, sectionRows]) => ({
        Section: sectionLabel,
        Role: sectionRows[0]?.role || 'Verse',
        Measures: sectionRows.length,
        Energy: roundValue(average(sectionRows.map((row) => row.energyLevel)), 2),
        'Ride voices': Array.from(new Set(sectionRows.map((row) => row.rideVoice))).join(', '),
        'Snare voices': Array.from(new Set(sectionRows.map((row) => row.snareVoice))).join(', '),
        'Fill starts': sectionRows.filter((row) => row.fillStart).length,
        'Avg time': roundValue(average(sectionRows.map((row) => row.timekeepingHits)), 2),
    }));
}

function buildMeasureTable(rows) {
    return rows.map((row) => ({
        Loop: row.loop,
        Measure: row.measureNumber,
        Section: row.sectionLabel,
        Role: row.role,
        Int: row.intensity,
        Energy: row.energyLevel,
        Motif: row.motif,
        Ride: row.rideVoice,
        Snare: row.snareVoice,
        Fill: row.fillStart ? `${row.fillNoteCount}${row.fillCrash ? ' +crash' : ''}` : '-',
        Kick: row.kickHits,
        SnareHits: row.snareHits + row.sidestickHits,
        Ghosts: row.ghostSnareHits,
        Time: row.timekeepingHits,
        Open: row.openHits,
        Toms: row.tomHits,
        Flags: row.flags.join(', ') || '-',
    }));
}

function simulateDrumLoops({ state, arrangement, loops = 3, seed = DEFAULT_SEED }) {
    return withSeededRandom(seed, () => {
        const measureRows = [];

        for (let loop = 0; loop < loops; loop++) {
            state.playback.currentLoopCount = loop;

            for (const measure of arrangement.measurePlan) {
                const orchestration = findRangeEntry(state.groove.orchestrationMap, measure.start);
                const fillData = state.groove.fillMap?.[measure.start] || null;
                const sectionSeed =
                    state.groove.sectionSeedMap?.[measure.sectionId] ??
                    ((measure.measureIndex * 137 + (state.groove.creativity ? 42 : 0)) % 256) / 256;
                const row = createMeasureRow({
                    loop,
                    measure,
                    orchestration,
                    fillData,
                    intensity: state.playback.bandIntensity,
                    creativity: state.groove.creativity,
                    genre: state.groove.genreFeel,
                    sectionSeed,
                });

                for (
                    let stepInMeasure = 0;
                    stepInMeasure < arrangement.stepsPerMeasure;
                    stepInMeasure++
                ) {
                    const stepInLoop = measure.start + stepInMeasure;
                    const absoluteStep = loop * arrangement.totalSteps + stepInLoop;
                    const info = getStepInfo(
                        stepInLoop,
                        arrangement.ts,
                        arrangement.stepMap,
                        TIME_SIGNATURES,
                    );

                    for (const instName of AUDIT_INSTRUMENTS) {
                        const result = applyGrooveOverrides(state, {
                            step: absoluteStep,
                            inst: { name: instName, muted: false },
                            stepVal: getBaseStepValue(instName, info),
                            playback: state.playback,
                            groove: state.groove,
                            isDownbeat: info.isMeasureStart,
                            isBeatStart: info.isBeatStart,
                            isPulse: info.isPulse,
                            isPulseStart: info.isPulseStart,
                            isGroupStart: info.isGroupStart,
                            isBackbeat: info.isBackbeat,
                            isOffbeat: info.isOffbeat,
                            isEOfBeat: info.isEOfBeat,
                            isAOfBeat: info.isAOfBeat,
                            beatIndex: info.beatIndex,
                            tsConfig: info.tsConfig,
                            mStep: info.mStep,
                            isCompound: info.isCompound,
                            stepInGroup: info.stepInGroup,
                            groupIndex: info.groupIndex,
                        });

                        if (!result?.shouldPlay) {
                            continue;
                        }

                        tallyDrumHit(row, result.soundName || instName, result.velocity || 0);
                    }
                }

                flagMeasure(row, state.groove.genreFeel);
                measureRows.push(row);
            }
        }

        return {
            arrangement,
            measureRows,
            loopRows: buildLoopSummary(measureRows),
            sectionRows: buildSectionSummary(measureRows),
        };
    });
}

function evaluateGroove(argv = process.argv.slice(2)) {
    const options = parseCliArgs(argv);
    const genre = readStringOption(options, 'genre', 'Rock');
    const bpm = readNumberOption(options, 'bpm', 112);
    const intensity = readNumberOption(options, 'intensity', 0.55);
    const loops = Math.max(1, Math.floor(readNumberOption(options, 'loops', 3)));
    const arrangementName = readStringOption(options, 'arrangement', 'hook');
    const timeSignature = readStringOption(
        options,
        'time-signature',
        arrangementName.toLowerCase() === 'blues' ? '6/8' : '4/4',
    );
    const seed = readStringOption(options, 'seed', DEFAULT_SEED);
    const creativity = readBooleanOption(options, 'creativity', true);
    const json = readBooleanOption(options, 'json', false);
    const full = readBooleanOption(options, 'full', false);

    const { state, arrangement } = bootstrapDrumAudit({
        genre,
        bpm,
        intensity,
        timeSignature,
        arrangementName,
        creativity,
        seed,
    });
    const capture = simulateDrumLoops({ state, arrangement, loops, seed });

    if (json) {
        console.log(
            JSON.stringify(
                {
                    genre,
                    bpm,
                    intensity,
                    loops,
                    arrangementName,
                    seed,
                    creativity,
                    timeSignature: arrangement.timeSignature,
                    measuresPerLoop: arrangement.measuresPerLoop,
                    loopRows: capture.loopRows,
                    sectionRows: capture.sectionRows,
                    measures: capture.measureRows,
                },
                null,
                2,
            ),
        );
        return;
    }

    console.log(`\n=== Drum Audit: ${genre} @ ${bpm} BPM ===`);
    console.log(
        `Form: ${arrangementName} | Measures: ${arrangement.measuresPerLoop} | Loops: ${loops} | Intensity: ${intensity} | Creativity: ${creativity ? 'on' : 'off'} | Seed: ${seed}`,
    );
    console.log(`Time signature: ${arrangement.timeSignature}`);

    console.log('\nLoop summary');
    console.table(capture.loopRows);

    console.log('Section summary');
    console.table(capture.sectionRows);

    console.log('Measure audit');
    console.table(
        buildMeasureTable(
            full ? capture.measureRows : capture.measureRows.slice(0, arrangement.measuresPerLoop),
        ),
    );
}

evaluateGroove();
