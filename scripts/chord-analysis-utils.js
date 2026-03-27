import { TIME_SIGNATURES } from '../public/config.js';
import { compingState, getAccompanimentNotes } from '../public/engine/accompaniment.js';
import { validateProgression } from '../public/engine/chords-engine.js';
import { dispatch, getState } from '../public/state.js';
import { ACTIONS } from '../public/types.js';
import { getFrequency, getStepInfo, midiToNote } from '../public/utils.js';
import {
    parseCliArgs,
    readBooleanOption,
    readNumberOption,
    readStringOption,
} from './soloist-analysis-utils.js';

// cspell:ignore neosoul

const DEFAULT_SEED = 'CHORD_AUDIT';
const STICKY_GENRES = new Set(['Funk', 'Soul', 'Reggae', 'Neo-Soul', 'Ska']);

/**
 * @typedef {{
 *   id: string;
 *   label: string;
 *   value: string;
 *   repeat?: number;
 *   key?: string;
 *   isMinor?: boolean;
 *   timeSignature?: string;
 * }} AuditSection
 */

/**
 * @typedef {{
 *   name: string;
 *   key: string;
 *   timeSignature: string;
 *   isMinor: boolean;
 *   sections: AuditSection[];
 * }} ChordAuditArrangementSpec
 */

/**
 * @typedef {{
 *   loop: number;
 *   absoluteStep: number;
 *   loopStep: number;
 *   stepInLoop: number;
 *   measureIndex: number;
 *   measureNumber: number;
 *   stepInMeasure: number;
 *   chord: any;
 *   sectionLabel: string;
 *   notes: Array<{midi: number; velocity: number; durationSteps: number; timingOffset: number;}>;
 *   ccEvents: any[];
 *   pattern: number[];
 *   patternKey: string;
 *   vibe: string;
 *   grooveRetentionCount: number;
 *   scenario: string;
 *   soloistBusy: boolean;
 *   bassMidi: number;
 *   resolvedGenre: string;
 * }} ChordAuditStep
 */

function normalizeStep(step, loopLength) {
    return ((step % loopLength) + loopLength) % loopLength;
}

function average(values) {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundValue(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function formatPercent(value) {
    return `${(value * 100).toFixed(0)}%`;
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

function patternKey(pattern) {
    return pattern.map((value) => (value ? '1' : '0')).join('');
}

function patternToText(pattern, stepsPerBeat) {
    const groups = [];
    for (let index = 0; index < pattern.length; index += stepsPerBeat) {
        groups.push(
            pattern
                .slice(index, index + stepsPerBeat)
                .map((value) => (value ? 'x' : '.'))
                .join(''),
        );
    }
    return groups.join(' ');
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

function getResolvedGenre(style, genre) {
    let resolved = genre;
    if (style === 'jazz') {
        return 'Jazz';
    }
    if (style === 'funk') {
        return 'Funk';
    }
    if (style === 'strum8') {
        return 'Rock';
    }
    if (style === 'strum-country') {
        return 'Country';
    }
    if (style === 'power-metal') {
        return 'Metal';
    }
    if (style === 'ska-upstroke') {
        return 'Ska';
    }
    if (style === 'smart') {
        const smartMapping = {
            Afrobeat: 'Funk',
            Blues: 'Jazz',
            Country: 'Rock',
        };
        resolved = smartMapping[resolved] || resolved;
    }
    return resolved;
}

function getChordLabel(chord) {
    return chord?.absName || chord?.quality || 'Chord';
}

function getIntervalFlavor(midi, chord) {
    if (!chord) {
        return 'unknown';
    }
    const semitones = normalizeStep(midi - chord.rootMidi, 12);
    const chordTones = new Set(
        (chord.intervals || []).map((interval) => normalizeStep(interval, 12)),
    );
    if (semitones === 0 || semitones === 3 || semitones === 4 || semitones === 7) {
        return 'chord';
    }
    if (semitones === 10 || semitones === 11) {
        return 'guide';
    }
    if (chordTones.has(semitones)) {
        return 'chord';
    }
    if (semitones === 2 || semitones === 5 || semitones === 9) {
        return 'color';
    }
    return 'tension';
}

function countNoteFlavors(notes, chord) {
    const counts = {
        chord: 0,
        guide: 0,
        color: 0,
        tension: 0,
    };
    for (const note of notes) {
        const flavor = getIntervalFlavor(note.midi, chord);
        if (flavor === 'guide') {
            counts.guide++;
        } else if (flavor === 'color') {
            counts.color++;
        } else if (flavor === 'tension') {
            counts.tension++;
        } else {
            counts.chord++;
        }
    }
    return counts;
}

function getPitchClassSet(midis) {
    return new Set(midis.map((midi) => normalizeStep(midi, 12)));
}

function getSharedPitchClasses(currentMidis, previousMidis) {
    const current = getPitchClassSet(currentMidis);
    const previous = getPitchClassSet(previousMidis);
    let shared = 0;
    for (const pitchClass of current) {
        if (previous.has(pitchClass)) {
            shared++;
        }
    }
    return shared;
}

function formatStepVoicings(steps, stepsPerBeat, maxTokens = 6) {
    if (steps.length === 0) {
        return '-';
    }
    const tokens = steps.map((step) => {
        const notes = step.notes.map((note) => formatMidi(note.midi)).join(',');
        return `${formatPosition(step.stepInMeasure, stepsPerBeat)}:[${notes}]`;
    });
    if (tokens.length <= maxTokens) {
        return tokens.join(' ');
    }
    return `${tokens.slice(0, maxTokens).join(' ')} ...(+${tokens.length - maxTokens})`;
}

function getMeasureSteps(capture, loop, measureIndex) {
    return capture.steps.filter((step) => step.loop === loop && step.measureIndex === measureIndex);
}

function getMeasureSnapshot(capture, loop, measureIndex) {
    return (
        capture.measureSnapshots.find(
            (snapshot) => snapshot.loop === loop && snapshot.measureIndex === measureIndex,
        ) || null
    );
}

function getLoopCount(capture) {
    return (
        capture.measureSnapshots.reduce(
            (maxLoop, snapshot) => Math.max(maxLoop, snapshot.loop),
            -1,
        ) + 1
    );
}

function getScenarioState(state, scenario, measureIndex, stepInfo) {
    const normalized = String(scenario || 'default').toLowerCase();
    const soloistBusy =
        normalized === 'soloist-busy' ||
        normalized === 'busy-soloist' ||
        (normalized === 'call-response' && measureIndex % 2 === 0);
    const bassMidi = normalized === 'bass-pressure' ? 47 : 36;

    state.bass.lastFreq = getFrequency(bassMidi);
    state.soloist.enabled = soloistBusy;
    state.soloist.busySteps = soloistBusy
        ? stepInfo.tsConfig.beats * stepInfo.tsConfig.stepsPerBeat
        : 0;
    state.soloist.lastFreq = soloistBusy ? getFrequency(79) : 0;

    return {
        name: normalized,
        bassMidi,
        soloistBusy,
        soloistMidi: soloistBusy ? 79 : 0,
    };
}

function resetCompingAuditState(stepsPerMeasure = 16) {
    compingState.currentVibe = 'balanced';
    compingState.currentCell = new Array(stepsPerMeasure).fill(0);
    compingState.lockedUntil = 0;
    compingState.soloistActivity = 0;
    compingState.lastChordIndex = -1;
    compingState.lastChordQuality = null;
    compingState.grooveRetentionCount = 0;
    compingState.maxGrooveLength = 4;
    compingState.lastSectionId = null;
    compingState.lastVoicingMidis = [];
}

function buildChangesArrangement(timeSignature = '4/4') {
    return {
        name: 'changes',
        key: 'C',
        timeSignature,
        isMinor: false,
        sections: [
            { id: 'a1', label: 'A', value: 'Imaj7 | vi7 | iim7 | V7', timeSignature },
            { id: 'a2', label: 'A', value: 'Imaj7 | vi7 | iim7 | V7', timeSignature },
            { id: 'b', label: 'B', value: 'iiim7 | VI7 | iim7 | V7', timeSignature },
            { id: 'a3', label: 'A', value: 'Imaj7 | vi7 | iim7 | V7', timeSignature },
        ],
    };
}

function buildTurnaroundArrangement(timeSignature = '4/4') {
    return {
        name: 'turnaround',
        key: 'C',
        timeSignature,
        isMinor: false,
        sections: [
            {
                id: 'main',
                label: 'Turn',
                value: 'iim7 | V7 | Imaj7 | VI7 | iim7 | V7 | Imaj7 | Imaj7',
                timeSignature,
            },
        ],
    };
}

function buildBluesArrangement(timeSignature = '4/4') {
    return {
        name: 'blues',
        key: 'C',
        timeSignature,
        isMinor: false,
        sections: [
            {
                id: 'blues',
                label: 'Blues',
                value: 'I7 | IV7 | I7 | I7 | IV7 | IV7 | I7 | VI7 | iim7 | V7 | I7 | V7',
                timeSignature,
            },
        ],
    };
}

function buildVampArrangement(timeSignature = '4/4') {
    return {
        name: 'vamp',
        key: 'C',
        timeSignature,
        isMinor: false,
        sections: [
            {
                id: 'vamp',
                label: 'Vamp',
                value: 'iim7 | iim7 | V7 | V7 | iim7 | iim7 | V7 | V7',
                timeSignature,
            },
        ],
    };
}

function buildNeoSoulArrangement(timeSignature = '4/4') {
    return {
        name: 'neo-soul',
        key: 'C',
        timeSignature,
        isMinor: false,
        sections: [
            {
                id: 'head',
                label: 'Head',
                value: 'iim11 | V13 | Imaj9 | VI7#11 | iim11 | V13 | iiim7 | VI7alt',
                timeSignature,
            },
        ],
    };
}

function buildFiveFourArrangement() {
    return {
        name: 'five-four',
        key: 'C',
        timeSignature: '5/4',
        isMinor: false,
        sections: [
            {
                id: 'a',
                label: 'A',
                value: 'iim7 | V7 | Imaj7 | Imaj7',
                timeSignature: '5/4',
            },
            {
                id: 'b',
                label: 'B',
                value: 'vim7 | II7 | V7 | V7',
                timeSignature: '5/4',
            },
        ],
    };
}

function buildRuntimeArrangement(state, spec) {
    validateProgression(state);
    const totalSteps = state.arranger.totalSteps;
    const stepMap = [...state.arranger.stepMap];
    const sectionMap = [...state.arranger.sectionMap];
    const ts = TIME_SIGNATURES[state.arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;

    return {
        name: spec.name,
        key: state.arranger.key,
        timeSignature: state.arranger.timeSignature,
        ts,
        stepsPerMeasure,
        totalSteps,
        stepMap,
        sectionMap,
        measurePlan: stepMap.map((entry, index) => ({
            label: entry.chord.sectionLabel || 'Main',
            chord: entry.chord,
            start: entry.start,
            end: entry.end,
            measureIndex: index,
        })),
        measuresPerLoop: stepMap.length,
        getEntryAtStep(step) {
            const normalized = normalizeStep(step, totalSteps || 1);
            return (
                stepMap.find((entry) => normalized >= entry.start && normalized < entry.end) || null
            );
        },
        getSectionAtStep(step) {
            const normalized = normalizeStep(step, totalSteps || 1);
            return (
                sectionMap.find((entry) => normalized >= entry.start && normalized < entry.end) ||
                null
            );
        },
    };
}

function summarizeFlags({
    attackCount,
    intentHits,
    tensionShare,
    centerDrift,
    bassGap,
    soloistBusyShare,
    retentionBreak,
}) {
    const flags = [];
    if (attackCount === 0) {
        flags.push('silent-bar');
    }
    if (intentHits >= 3 && attackCount <= Math.floor(intentHits / 2)) {
        flags.push('under-firing');
    }
    if (tensionShare > 0.2) {
        flags.push('outside-heavy');
    }
    if (Math.abs(centerDrift) > 7) {
        flags.push('voice-jump');
    }
    if (typeof bassGap === 'number' && bassGap < 12) {
        flags.push('bass-crowd');
    }
    if (soloistBusyShare >= 0.75 && attackCount > Math.max(1, intentHits - 1)) {
        flags.push('crowding-solo');
    }
    if (retentionBreak) {
        flags.push('retention-break');
    }
    return flags;
}

function buildMeasureReplayRows(capture, limit = 8) {
    const rows = [];

    for (let measureIndex = 0; measureIndex < capture.arrangement.measuresPerLoop; measureIndex++) {
        const snapshots = capture.measureSnapshots
            .filter((snapshot) => snapshot.measureIndex === measureIndex)
            .sort((a, b) => a.loop - b.loop);

        if (snapshots.length === 0) {
            continue;
        }

        const baseline = snapshots[0];
        const row = {
            Measure: measureIndex + 1,
            Section: baseline.sectionLabel,
            Chord: baseline.chordLabel,
        };

        let exactMatches = 0;
        snapshots.forEach((snapshot) => {
            row[`L${snapshot.loop}`] = snapshot.patternText;
            if (snapshot.patternKey === baseline.patternKey) {
                exactMatches++;
            }
        });

        row['Pattern match'] = formatPercent(exactMatches / snapshots.length);
        rows.push(row);
    }

    return rows
        .sort((left, right) => {
            const leftScore = Number.parseInt(left['Pattern match'], 10);
            const rightScore = Number.parseInt(right['Pattern match'], 10);
            return leftScore - rightScore;
        })
        .slice(0, limit);
}

/**
 * @param {string} [kind]
 * @param {string} [timeSignature]
 * @returns {ChordAuditArrangementSpec}
 */
export function buildChordAuditArrangement(kind = 'changes', timeSignature = undefined) {
    const normalized = String(kind || 'changes').toLowerCase();
    if (normalized === 'hook') {
        return buildChangesArrangement(timeSignature || '4/4');
    }
    if (normalized === 'turnaround') {
        return buildTurnaroundArrangement(timeSignature || '4/4');
    }
    if (normalized === 'blues') {
        return buildBluesArrangement(timeSignature || '4/4');
    }
    if (normalized === 'vamp') {
        return buildVampArrangement(timeSignature || '4/4');
    }
    if (normalized === 'neo-soul' || normalized === 'neosoul') {
        return buildNeoSoulArrangement(timeSignature || '4/4');
    }
    if (normalized === 'five-four' || normalized === '5-4' || normalized === '5/4') {
        return buildFiveFourArrangement();
    }
    return buildChangesArrangement(timeSignature || '4/4');
}

/**
 * @param {{
 *   genre: string;
 *   bpm: number;
 *   intensity: number;
 *   complexity?: number;
 *   timeSignature?: string;
 *   style?: string;
 *   density?: string;
 *   key?: string;
 *   pianoRoots?: boolean;
 *   arrangementName?: string;
 * }} options
 */
export function bootstrapChordAudit({
    genre,
    bpm,
    intensity,
    complexity = intensity,
    timeSignature,
    style = 'smart',
    density = 'standard',
    key = 'C',
    pianoRoots = false,
    arrangementName = 'changes',
}) {
    const arrangementSpec = buildChordAuditArrangement(arrangementName, timeSignature);

    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, arrangementSpec.timeSignature);
    dispatch(ACTIONS.SET_KEY, key);
    dispatch(ACTIONS.UPDATE_GB, {
        enabled: true,
        genreFeel: genre,
    });
    dispatch(ACTIONS.SET_STYLE, { module: 'chords', style });
    dispatch(ACTIONS.SET_DENSITY, density);
    dispatch(ACTIONS.SET_PIANO_ROOTS, pianoRoots);
    dispatch(ACTIONS.SET_BPM, bpm);
    dispatch(ACTIONS.SET_BAND_INTENSITY, intensity);
    dispatch(ACTIONS.SET_COMPLEXITY, complexity);

    const state = getState();
    state.arranger.key = key;
    state.arranger.isMinor = arrangementSpec.isMinor;
    state.arranger.timeSignature = arrangementSpec.timeSignature;
    state.arranger.sections = arrangementSpec.sections.map((section) => ({
        ...section,
        key,
        isMinor: arrangementSpec.isMinor,
        timeSignature: section.timeSignature || arrangementSpec.timeSignature,
    }));
    state.chords.enabled = true;
    state.bass.enabled = true;
    state.harmony.enabled = false;
    state.soloist.enabled = false;
    state.bass.lastFreq = getFrequency(36);
    state.playback.currentLoopCount = 0;

    const ts = TIME_SIGNATURES[arrangementSpec.timeSignature] || TIME_SIGNATURES['4/4'];
    resetCompingAuditState(ts.beats * ts.stepsPerBeat);
    const arrangement = buildRuntimeArrangement(state, arrangementSpec);

    return {
        state,
        arrangement,
        spec: arrangementSpec,
    };
}

/**
 * @param {{
 *   state: any;
 *   arrangement: ReturnType<typeof buildRuntimeArrangement>;
 *   loops?: number;
 *   seed?: string;
 *   scenario?: string;
 * }} options
 */
export function simulateChordLoops({
    state,
    arrangement,
    loops = 3,
    seed = DEFAULT_SEED,
    scenario = 'default',
}) {
    return withSeededRandom(seed, () => {
        const steps = /** @type {ChordAuditStep[]} */ ([]);
        const measureSnapshots = [];
        const resolvedGenre = getResolvedGenre(state.chords.style, state.groove.genreFeel);

        for (let loop = 0; loop < loops; loop++) {
            state.playback.currentLoopCount = loop;

            for (let loopStep = 0; loopStep < arrangement.totalSteps; loopStep++) {
                const absoluteStep = loop * arrangement.totalSteps + loopStep;
                const stepInLoop = normalizeStep(loopStep, arrangement.totalSteps);
                const currentEntry = arrangement.getEntryAtStep(stepInLoop);
                if (!currentEntry) {
                    continue;
                }

                const currentSection =
                    arrangement.getSectionAtStep(stepInLoop) || arrangement.sectionMap[0];
                const measureIndex = Math.floor(stepInLoop / arrangement.stepsPerMeasure);
                const measureNumber = measureIndex + 1;
                const stepInfo = getStepInfo(
                    absoluteStep,
                    arrangement.ts,
                    arrangement.stepMap,
                    TIME_SIGNATURES,
                );
                const scenarioState = getScenarioState(state, scenario, measureIndex, stepInfo);
                const stepInChord = stepInLoop - currentEntry.start;
                const notes = getAccompanimentNotes(
                    state,
                    currentEntry.chord,
                    absoluteStep,
                    stepInChord,
                    stepInfo.mStep,
                    stepInfo,
                    {
                        bassHit: stepInfo.isBeatStart,
                        bassMidi: scenarioState.bassMidi,
                        soloistBusy: scenarioState.soloistBusy,
                        soloistActive: scenarioState.soloistBusy,
                        soloistMidi: scenarioState.soloistMidi,
                    },
                );
                const voicedNotes = notes
                    .filter((note) => note.midi > 0 && !note.muted)
                    .map((note) => ({
                        midi: note.midi,
                        velocity: note.velocity || 0,
                        durationSteps: note.durationSteps || 0,
                        timingOffset: note.timingOffset || 0,
                    }));
                const ccEvents = notes.flatMap((note) => note.ccEvents || []);
                const pattern = [...compingState.currentCell];
                const snapshot = {
                    loop,
                    measureIndex,
                    measureNumber,
                    sectionLabel:
                        currentSection?.label || currentEntry.chord.sectionLabel || 'Main',
                    chordLabel: getChordLabel(currentEntry.chord),
                    pattern,
                    patternKey: patternKey(pattern),
                    patternText: patternToText(pattern, arrangement.ts.stepsPerBeat),
                    vibe: compingState.currentVibe,
                    grooveRetentionCount: compingState.grooveRetentionCount,
                };

                steps.push({
                    loop,
                    absoluteStep,
                    loopStep,
                    stepInLoop,
                    measureIndex,
                    measureNumber,
                    stepInMeasure: stepInfo.mStep,
                    chord: currentEntry.chord,
                    sectionLabel: snapshot.sectionLabel,
                    notes: voicedNotes,
                    ccEvents,
                    pattern,
                    patternKey: snapshot.patternKey,
                    vibe: snapshot.vibe,
                    grooveRetentionCount: snapshot.grooveRetentionCount,
                    scenario: scenarioState.name,
                    soloistBusy: scenarioState.soloistBusy,
                    bassMidi: scenarioState.bassMidi,
                    resolvedGenre,
                });

                if (stepInfo.isMeasureStart) {
                    measureSnapshots.push(snapshot);
                }
            }
        }

        return {
            arrangement,
            steps,
            measureSnapshots,
            seed,
            scenario,
            resolvedGenre,
            stepsPerMeasure: arrangement.stepsPerMeasure,
            ts: arrangement.ts,
        };
    });
}

/**
 * @param {ReturnType<typeof simulateChordLoops>} capture
 * @param {number} loop
 */
export function buildMeasureAudit(capture, loop) {
    const rows = [];
    const stickyGenre = STICKY_GENRES.has(capture.resolvedGenre);

    for (let measureIndex = 0; measureIndex < capture.arrangement.measuresPerLoop; measureIndex++) {
        const measure = capture.arrangement.measurePlan[measureIndex];
        const steps = getMeasureSteps(capture, loop, measureIndex);
        const hitSteps = steps.filter((step) => step.notes.length > 0);
        const playedNotes = hitSteps.flatMap((step) => step.notes);
        const playedMidis = playedNotes.map((note) => note.midi);
        const counts = countNoteFlavors(playedNotes, measure.chord);
        const totalNotes = playedNotes.length;
        const centerMidi = playedMidis.length > 0 ? average(playedMidis) : 0;
        const previousRow = rows[rows.length - 1] || null;
        const previousMidis = previousRow?.playedMidis || [];
        const previousSnapshot = getMeasureSnapshot(capture, loop, measureIndex - 1);
        const snapshot = getMeasureSnapshot(capture, loop, measureIndex);
        const intentHits = snapshot?.pattern.filter((value) => value === 1).length || 0;
        const bassMidi = snapshot ? steps[0]?.bassMidi || 0 : 0;
        const bassGap =
            playedMidis.length > 0 && bassMidi ? Math.min(...playedMidis) - bassMidi : null;
        const centerDrift =
            previousRow && playedMidis.length > 0 ? centerMidi - previousRow.centerMidi : 0;
        const retentionBreak =
            stickyGenre &&
            !!previousSnapshot &&
            (snapshot?.grooveRetentionCount || 0) > 1 &&
            snapshot?.patternKey !== previousSnapshot.patternKey;
        const soloistBusyShare = steps.length
            ? steps.filter((step) => step.soloistBusy).length / steps.length
            : 0;
        const tensionShare = totalNotes > 0 ? counts.tension / totalNotes : 0;
        const flags = summarizeFlags({
            attackCount: hitSteps.length,
            intentHits,
            tensionShare,
            centerDrift,
            bassGap,
            soloistBusyShare,
            retentionBreak,
        });

        rows.push({
            loop,
            measureNumber: measureIndex + 1,
            sectionLabel: measure.label,
            chordLabel: getChordLabel(measure.chord),
            pattern: snapshot?.patternText || patternToText([], capture.ts.stepsPerBeat),
            patternKey: snapshot?.patternKey || '',
            vibe: snapshot?.vibe || 'balanced',
            grooveRetentionCount: snapshot?.grooveRetentionCount || 0,
            intentHits,
            attackCount: hitSteps.length,
            noteCount: totalNotes,
            avgVoices: hitSteps.length > 0 ? average(hitSteps.map((step) => step.notes.length)) : 0,
            minMidi: playedMidis.length > 0 ? Math.min(...playedMidis) : null,
            maxMidi: playedMidis.length > 0 ? Math.max(...playedMidis) : null,
            centerMidi,
            range: playedMidis.length > 0 ? Math.max(...playedMidis) - Math.min(...playedMidis) : 0,
            chordToneShare: totalNotes > 0 ? (counts.chord + counts.guide) / totalNotes : 1,
            colorShare: totalNotes > 0 ? counts.color / totalNotes : 0,
            tensionShare,
            commonToneCount: getSharedPitchClasses(playedMidis, previousMidis),
            centerDrift,
            bassGap,
            ccCount: steps.reduce((sum, step) => sum + step.ccEvents.length, 0),
            soloistBusyShare,
            flags,
            playedLine: formatStepVoicings(hitSteps, capture.ts.stepsPerBeat),
            playedMidis,
        });
    }

    return rows;
}

/**
 * @param {ReturnType<typeof simulateChordLoops>} capture
 */
export function buildLoopComparison(capture) {
    const loopCount = getLoopCount(capture);
    const rows = [];

    for (let loop = 0; loop < loopCount; loop++) {
        const measureRows = buildMeasureAudit(capture, loop);
        const heldPatterns = measureRows.filter((row, index) => {
            if (index === 0) {
                return false;
            }
            return row.patternKey === measureRows[index - 1].patternKey;
        }).length;

        rows.push({
            Loop: loop,
            'Hits/M': average(measureRows.map((row) => row.attackCount)).toFixed(1),
            'Voices/H': average(measureRows.map((row) => row.avgVoices)).toFixed(1),
            'Chord %': formatPercent(average(measureRows.map((row) => row.chordToneShare))),
            'Color %': formatPercent(average(measureRows.map((row) => row.colorShare))),
            'Tension %': formatPercent(average(measureRows.map((row) => row.tensionShare))),
            'Hold %': formatPercent(
                measureRows.length > 1 ? heldPatterns / (measureRows.length - 1) : 0,
            ),
            'Avg drift': average(measureRows.map((row) => Math.abs(row.centerDrift))).toFixed(1),
            Flags: measureRows.reduce((sum, row) => sum + row.flags.length, 0),
        });
    }

    return rows;
}

/**
 * @param {ReturnType<typeof simulateChordLoops>} capture
 */
export function buildLoopMetrics(capture) {
    const rows = [];

    for (let loop = 0; loop < getLoopCount(capture); loop++) {
        const measureRows = buildMeasureAudit(capture, loop);
        const heldPatterns = measureRows.filter((row, index) => {
            if (index === 0) {
                return false;
            }
            return row.patternKey === measureRows[index - 1].patternKey;
        }).length;

        rows.push({
            loop,
            hitsPerMeasure: roundValue(average(measureRows.map((row) => row.attackCount)), 2),
            voicesPerHit: roundValue(average(measureRows.map((row) => row.avgVoices)), 2),
            chordShare: roundValue(average(measureRows.map((row) => row.chordToneShare))),
            colorShare: roundValue(average(measureRows.map((row) => row.colorShare))),
            tensionShare: roundValue(average(measureRows.map((row) => row.tensionShare))),
            holdShare: roundValue(
                measureRows.length > 1 ? heldPatterns / (measureRows.length - 1) : 0,
            ),
            averageDrift: roundValue(
                average(measureRows.map((row) => Math.abs(row.centerDrift))),
                2,
            ),
            flagCount: measureRows.reduce((sum, row) => sum + row.flags.length, 0),
        });
    }

    return rows;
}

/**
 * @param {ReturnType<typeof simulateChordLoops>} capture
 * @param {number} loop
 */
export function buildSectionSummary(capture, loop) {
    const measureRows = buildMeasureAudit(capture, loop);
    const rows = [];
    const occurrenceMap = new Map();

    for (const section of capture.arrangement.sectionMap) {
        const occurrence = (occurrenceMap.get(section.label) || 0) + 1;
        occurrenceMap.set(section.label, occurrence);
        const sectionRows = measureRows.filter((row) => {
            const measure = capture.arrangement.measurePlan[row.measureNumber - 1];
            return measure.start >= section.start && measure.end <= section.end;
        });

        rows.push({
            Section: `${section.label}${occurrence}`,
            Measures: `${Math.floor(section.start / capture.stepsPerMeasure) + 1}-${Math.ceil(section.end / capture.stepsPerMeasure)}`,
            'Hits/M': average(sectionRows.map((row) => row.attackCount)).toFixed(1),
            'Voices/H': average(sectionRows.map((row) => row.avgVoices)).toFixed(1),
            'Chord %': formatPercent(average(sectionRows.map((row) => row.chordToneShare))),
            'Color %': formatPercent(average(sectionRows.map((row) => row.colorShare))),
            'Tension %': formatPercent(average(sectionRows.map((row) => row.tensionShare))),
            Flags: sectionRows.reduce((sum, row) => sum + row.flags.length, 0),
        });
    }

    return rows;
}

/**
 * @param {ReturnType<typeof simulateChordLoops>} capture
 * @param {number} loop
 */
export function buildSectionMetrics(capture, loop) {
    const measureRows = buildMeasureAudit(capture, loop);
    const rows = [];
    const occurrenceMap = new Map();

    for (const section of capture.arrangement.sectionMap) {
        const occurrence = (occurrenceMap.get(section.label) || 0) + 1;
        occurrenceMap.set(section.label, occurrence);
        const sectionRows = measureRows.filter((row) => {
            const measure = capture.arrangement.measurePlan[row.measureNumber - 1];
            return measure.start >= section.start && measure.end <= section.end;
        });

        rows.push({
            sectionLabel: section.label,
            occurrence,
            measureStart: Math.floor(section.start / capture.stepsPerMeasure) + 1,
            measureEnd: Math.ceil(section.end / capture.stepsPerMeasure),
            hitsPerMeasure: roundValue(average(sectionRows.map((row) => row.attackCount)), 2),
            voicesPerHit: roundValue(average(sectionRows.map((row) => row.avgVoices)), 2),
            chordShare: roundValue(average(sectionRows.map((row) => row.chordToneShare))),
            colorShare: roundValue(average(sectionRows.map((row) => row.colorShare))),
            tensionShare: roundValue(average(sectionRows.map((row) => row.tensionShare))),
            flagCount: sectionRows.reduce((sum, row) => sum + row.flags.length, 0),
        });
    }

    return rows;
}

/**
 * @param {ReturnType<typeof simulateChordLoops>} capture
 * @param {number[]} [loops]
 * @param {number} [limit]
 */
export function buildFocusMeasures(capture, loops = [0, 1], limit = 8) {
    const focusRows = [];
    const maxLoop = getLoopCount(capture) - 1;
    for (const loop of loops.filter((value) => value >= 0 && value <= maxLoop)) {
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
                Pattern: row.pattern,
                Hits: `${row.attackCount}/${row.intentHits}`,
                Focus: row.flags.join(', '),
            });
        }
    }
    return focusRows.slice(0, limit);
}

/**
 * @param {ReturnType<typeof simulateChordLoops>} capture
 * @param {number[]} [loops]
 * @param {number} [limit]
 */
export function buildFocusMetrics(capture, loops = [0, 1], limit = 8) {
    const focusRows = [];
    const maxLoop = getLoopCount(capture) - 1;
    for (const loop of loops.filter((value) => value >= 0 && value <= maxLoop)) {
        const rows = buildMeasureAudit(capture, loop);
        for (const row of rows) {
            if (row.flags.length === 0) {
                continue;
            }
            focusRows.push({
                loop,
                measureNumber: row.measureNumber,
                sectionLabel: row.sectionLabel,
                chordLabel: row.chordLabel,
                pattern: row.pattern,
                patternKey: row.patternKey,
                vibe: row.vibe,
                grooveRetentionCount: row.grooveRetentionCount,
                attackCount: row.attackCount,
                intentHits: row.intentHits,
                avgVoices: roundValue(row.avgVoices, 2),
                chordToneShare: roundValue(row.chordToneShare),
                colorShare: roundValue(row.colorShare),
                tensionShare: roundValue(row.tensionShare),
                centerDrift: roundValue(row.centerDrift, 2),
                bassGap: row.bassGap === null ? null : roundValue(row.bassGap, 2),
                flags: [...row.flags],
            });
        }
    }
    return focusRows.slice(0, limit);
}

/**
 * @param {ReturnType<typeof simulateChordLoops>} capture
 * @param {number} loop
 */
export function buildCoordinationAudit(capture, loop) {
    return buildMeasureAudit(capture, loop)
        .filter((row) => row.soloistBusyShare > 0)
        .map((row) => ({
            Measure: row.measureNumber,
            Chord: row.chordLabel,
            'Solo busy': formatPercent(row.soloistBusyShare),
            'Hits/Intent': `${row.attackCount}/${row.intentHits}`,
            Vibe: row.vibe,
            Flags: row.flags.join(', ') || '-',
        }));
}

/**
 * @param {ReturnType<typeof simulateChordLoops>} capture
 * @param {number} loop
 */
export function buildCoordinationMetrics(capture, loop) {
    return buildMeasureAudit(capture, loop)
        .filter((row) => row.soloistBusyShare > 0)
        .map((row) => ({
            measureNumber: row.measureNumber,
            chordLabel: row.chordLabel,
            soloistBusyShare: roundValue(row.soloistBusyShare),
            attackCount: row.attackCount,
            intentHits: row.intentHits,
            vibe: row.vibe,
            flags: [...row.flags],
        }));
}

/**
 * @param {ReturnType<typeof simulateChordLoops>} capture
 * @param {number[]} [loops]
 * @param {Array<{Loop: number; Measure: number}> | null} [flaggedMeasures]
 */
export function buildEventLogRows(capture, loops = [0], flaggedMeasures = null) {
    const flaggedSet =
        flaggedMeasures && flaggedMeasures.length > 0
            ? new Set(flaggedMeasures.map((row) => `${row.Loop}:${row.Measure}`))
            : null;

    return capture.steps
        .filter((step) => loops.includes(step.loop))
        .filter((step) => step.notes.length > 0 || step.ccEvents.length > 0)
        .filter((step) => {
            if (!flaggedSet) {
                return true;
            }
            return flaggedSet.has(`${step.loop}:${step.measureNumber}`);
        })
        .map((step) => ({
            loop: step.loop,
            measure: step.measureNumber,
            beat: formatPosition(step.stepInMeasure, capture.ts.stepsPerBeat),
            chord: getChordLabel(step.chord),
            notes:
                step.notes.length > 0
                    ? step.notes.map((note) => formatMidi(note.midi)).join(',')
                    : '-',
            cc: step.ccEvents.length,
            vibe: step.vibe,
            busy: step.soloistBusy ? 'yes' : 'no',
            pattern: patternToText(step.pattern, capture.ts.stepsPerBeat),
        }));
}

/**
 * @param {ReturnType<typeof simulateChordLoops>} capture
 * @param {number[]} [loops]
 * @param {Array<{loop: number; measureNumber: number}> | null} [flaggedMeasures]
 */
export function buildEventLogEntries(capture, loops = [0], flaggedMeasures = null) {
    const flaggedSet =
        flaggedMeasures && flaggedMeasures.length > 0
            ? new Set(flaggedMeasures.map((row) => `${row.loop}:${row.measureNumber}`))
            : null;

    return capture.steps
        .filter((step) => loops.includes(step.loop))
        .filter((step) => step.notes.length > 0 || step.ccEvents.length > 0)
        .filter((step) => {
            if (!flaggedSet) {
                return true;
            }
            return flaggedSet.has(`${step.loop}:${step.measureNumber}`);
        })
        .map((step) => ({
            loop: step.loop,
            measureNumber: step.measureNumber,
            beat: formatPosition(step.stepInMeasure, capture.ts.stepsPerBeat),
            chordLabel: getChordLabel(step.chord),
            sectionLabel: step.sectionLabel,
            notes: step.notes.map((note) => ({
                midi: note.midi,
                note: formatMidi(note.midi),
                velocity: roundValue(note.velocity, 3),
                durationSteps: note.durationSteps,
                timingOffset: roundValue(note.timingOffset, 4),
            })),
            ccCount: step.ccEvents.length,
            vibe: step.vibe,
            soloistBusy: step.soloistBusy,
            bassMidi: step.bassMidi,
            pattern: patternToText(step.pattern, capture.ts.stepsPerBeat),
            patternKey: step.patternKey,
        }));
}

/**
 * @param {ReturnType<typeof simulateChordLoops>} capture
 * @param {number} [limit]
 */
export function buildReplayMetrics(capture, limit = 8) {
    const rows = [];

    for (let measureIndex = 0; measureIndex < capture.arrangement.measuresPerLoop; measureIndex++) {
        const snapshots = capture.measureSnapshots
            .filter((snapshot) => snapshot.measureIndex === measureIndex)
            .sort((a, b) => a.loop - b.loop);

        if (snapshots.length === 0) {
            continue;
        }

        const baseline = snapshots[0];
        const exactMatches = snapshots.filter(
            (snapshot) => snapshot.patternKey === baseline.patternKey,
        ).length;
        rows.push({
            measureNumber: measureIndex + 1,
            sectionLabel: baseline.sectionLabel,
            chordLabel: baseline.chordLabel,
            patternMatchShare: roundValue(exactMatches / snapshots.length),
            patterns: snapshots.map((snapshot) => ({
                loop: snapshot.loop,
                pattern: snapshot.patternText,
                patternKey: snapshot.patternKey,
                vibe: snapshot.vibe,
                grooveRetentionCount: snapshot.grooveRetentionCount,
            })),
        });
    }

    return rows
        .sort((left, right) => left.patternMatchShare - right.patternMatchShare)
        .slice(0, limit);
}

function buildArrangementMetadata(arrangement) {
    return {
        name: arrangement.name,
        key: arrangement.key,
        timeSignature: arrangement.timeSignature,
        measuresPerLoop: arrangement.measuresPerLoop,
        stepsPerMeasure: arrangement.stepsPerMeasure,
        totalSteps: arrangement.totalSteps,
        sections: arrangement.sectionMap.map((section) => ({
            label: section.label,
            startStep: section.start,
            endStep: section.end,
            measureStart: Math.floor(section.start / arrangement.stepsPerMeasure) + 1,
            measureEnd: Math.ceil(section.end / arrangement.stepsPerMeasure),
        })),
        measures: arrangement.measurePlan.map((measure) => ({
            measureNumber: measure.measureIndex + 1,
            sectionLabel: measure.label,
            chordLabel: getChordLabel(measure.chord),
            startStep: measure.start,
            endStep: measure.end,
        })),
    };
}

/**
 * @param {{
 *   capture: ReturnType<typeof simulateChordLoops>;
 *   genre: string;
 *   bpm: number;
 *   intensity: number;
 *   complexity: number;
 *   loops: number;
 *   arrangementName: string;
 *   style: string;
 *   density: string;
 *   key: string;
 *   scenario: string;
 *   seed: string;
 *   pianoRoots: boolean;
 *   drillDown?: boolean;
 *   full?: boolean;
 * }} options
 */
export function buildChordAuditReport({
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
    pianoRoots,
    drillDown = false,
    full = false,
}) {
    const availableLoops = Array.from({ length: getLoopCount(capture) }, (_, index) => index);
    const focusLoops = drillDown ? availableLoops : availableLoops.length > 1 ? [0, 1] : [0];
    const focusMeasures = buildFocusMetrics(capture, focusLoops, 10);

    return {
        reportType: 'chord-audit',
        options: {
            genre,
            bpm,
            intensity,
            complexity,
            loops,
            arrangementName,
            style,
            density,
            key,
            timeSignature: capture.arrangement.timeSignature,
            scenario,
            seed,
            pianoRoots,
            drillDown,
            full,
        },
        arrangement: buildArrangementMetadata(capture.arrangement),
        runtime: {
            resolvedGenre: capture.resolvedGenre,
            scenario: capture.scenario,
            seed: capture.seed,
        },
        summaries: {
            loopComparison: buildLoopMetrics(capture),
            sections: buildSectionMetrics(capture, 0),
            patternReplay: buildReplayMetrics(capture, 8),
            coordination: buildCoordinationMetrics(capture, 0),
            focusMeasures,
        },
        loops: availableLoops.map((loop) => ({
            loop,
            measures: buildMeasureAudit(capture, loop),
        })),
        eventLog: full
            ? buildEventLogEntries(
                  capture,
                  [0, 1].filter((loop) => availableLoops.includes(loop)),
                  focusMeasures.length > 0 ? focusMeasures : null,
              )
            : [],
    };
}

/**
 * @param {{
 *   capture: ReturnType<typeof simulateChordLoops>;
 *   genre: string;
 *   bpm: number;
 *   intensity: number;
 *   complexity: number;
 *   loops: number;
 *   arrangementName: string;
 *   style: string;
 *   density: string;
 *   key: string;
 *   scenario: string;
 *   seed: string;
 *   pianoRoots: boolean;
 *   full?: boolean;
 * }} options
 */
export function buildChordDeepDiveReport({
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
    pianoRoots,
    full = false,
}) {
    const availableLoops = Array.from({ length: getLoopCount(capture) }, (_, index) => index);
    const focusMeasures = buildFocusMetrics(capture, availableLoops, 12);

    return {
        reportType: 'chord-deep-dive',
        options: {
            genre,
            bpm,
            intensity,
            complexity,
            loops,
            arrangementName,
            style,
            density,
            key,
            timeSignature: capture.arrangement.timeSignature,
            scenario,
            seed,
            pianoRoots,
            full,
        },
        arrangement: buildArrangementMetadata(capture.arrangement),
        runtime: {
            resolvedGenre: capture.resolvedGenre,
            scenario: capture.scenario,
            seed: capture.seed,
        },
        summaries: {
            loopComparison: buildLoopMetrics(capture),
            sections: buildSectionMetrics(capture, 0),
            patternReplay: buildReplayMetrics(capture, capture.arrangement.measuresPerLoop),
            coordination: buildCoordinationMetrics(capture, 0),
            focusMeasures,
        },
        loops: availableLoops.map((loop) => ({
            loop,
            measures: buildMeasureAudit(capture, loop),
        })),
        eventLog: full ? buildEventLogEntries(capture, availableLoops) : [],
    };
}

export function logMeasureAudit(title, rows) {
    console.log(`\n--- ${title} ---`);
    for (const row of rows) {
        console.log(
            `M${String(row.measureNumber).padStart(2, '0')} ${row.sectionLabel.padEnd(2)} ${row.chordLabel.padEnd(8)} | ${row.pattern} | hits ${row.attackCount}/${row.intentHits} | voices ${row.avgVoices.toFixed(1)} | chord ${formatPercent(row.chordToneShare)} color ${formatPercent(row.colorShare)} tension ${formatPercent(row.tensionShare)} | drift ${row.centerDrift.toFixed(1)}${row.flags.length > 0 ? ` | flags ${row.flags.join(', ')}` : ''}`,
        );
        console.log(`          played ${row.playedLine}`);
    }
}

export function logLoopComparison(rows) {
    console.log('\n--- Loop Comparison ---');
    console.table(rows);
}

export function logSectionSummary(rows) {
    console.log('\n--- Section Summary ---');
    console.table(rows);
}

export function logFocusMeasures(rows) {
    console.log('\n--- Focus Measures ---');
    if (rows.length === 0) {
        console.log('No flagged measures in this run.');
        return;
    }
    console.table(rows);
}

export function logCoordinationAudit(rows) {
    if (rows.length === 0) {
        return;
    }
    console.log('\n--- Coordination Audit ---');
    console.table(rows);
}

export function logPatternReplay(rows) {
    console.log('\n--- Pattern Replay ---');
    console.table(rows);
}

export function logEventRows(rows) {
    console.log('\n--- Event Log ---');
    for (const row of rows) {
        console.log(
            `L${row.loop} M${String(row.measure).padStart(2, '0')} ${row.beat.padEnd(3)} | ${row.chord.padEnd(
                8,
            )} | ${row.notes.padEnd(20)} | cc ${String(row.cc).padStart(2)} | vibe ${row.vibe.padEnd(8)} | busy ${row.busy} | ${row.pattern}`,
        );
    }
}

export function buildReplaySummary(capture, limit = 8) {
    return buildMeasureReplayRows(capture, limit);
}

export { DEFAULT_SEED, parseCliArgs, readBooleanOption, readNumberOption, readStringOption };
