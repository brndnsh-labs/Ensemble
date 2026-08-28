// @ts-nocheck
import { TIME_SIGNATURES } from '../public/config.js';
import { loadDrumPreset } from '../public/controllers/instrument-controller.js';
import { DRUM_PRESETS } from '../public/data/drum-presets.js';
import { SMART_GENRES } from '../public/data/smart-genres.js';
import type { CoordinationCarryover } from '../public/engine/coordination-engine.js';
import { generateDrumFills, generateDrumOrchestration } from '../public/engine/drum-seeder.js';
import { createPRNG } from '../public/engine/hash-utils.js';
import { resolveSoloistStyle } from '../public/engine/soloist-config.js';
import { generateSessionSeed } from '../public/engine/soloist-seeder.js';
import { applyWorkerTransition, generateNotesForStep } from '../public/engine/tick-logic.js';
import { dispatch } from '../public/state.js';
import { ACTIONS } from '../public/types.js';
import { getStepInfo } from '../public/utils.js';
import { bootstrapChordAudit } from './chord-analysis-utils.js';
import { withMutedComposerLogs } from './soloist-analysis-utils.js';

const DEFAULT_SEED = 'ENSEMBLE_AUDIT';
const DEFAULT_DRUM_PRESET = 'Basic Rock';
const TIMING_MODULES = ['drums', 'bass', 'chords', 'soloist', 'harmony'];

function average(values) {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundValue(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function slugifyValue(value) {
    return (
        String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'scene'
    );
}

function standardDeviation(values) {
    if (values.length <= 1) {
        return 0;
    }
    const mean = average(values);
    const variance =
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
    return Math.sqrt(variance);
}

function buildTimingStats(values) {
    return {
        mean: roundValue(average(values), 2),
        meanAbs: roundValue(average(values.map((value) => Math.abs(value))), 2),
        stdDev: roundValue(standardDeviation(values), 2),
    };
}

function getMeasureEntryAtStep(arrangement, stepInLoop) {
    return (
        arrangement.measurePlan.find(
            (entry) => stepInLoop >= entry.start && stepInLoop < entry.end,
        ) ||
        arrangement.measurePlan[arrangement.measurePlan.length - 1] ||
        null
    );
}

function getActiveNotes(step, module = undefined) {
    return step.notes.filter((note) => !note.muted && (!module || note.module === module));
}

function getDrumHits(step, soundName = undefined) {
    return step.drumHits.filter((hit) => !soundName || hit.soundName === soundName);
}

function buildSectionSeedMap(sectionMap, seed) {
    return Object.fromEntries(
        sectionMap.map((section) => {
            const sectionId = section.id || section.label || 'section';
            const prng = createPRNG(`${seed}:${sectionId}`);
            return [sectionId, roundValue(prng(), 6)];
        }),
    );
}

function collectTopFlags(flagList, limit = 3) {
    const counts = new Map();
    flagList.forEach((flag) => {
        counts.set(flag, (counts.get(flag) || 0) + 1);
    });
    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, limit)
        .map(([flag]) => flag);
}

function summarizeMeasureFlags({
    drumHits,
    bassSteps,
    chordSteps,
    soloistSteps,
    mutedCount,
    maxPitchedVoices,
    bassKickLockMs,
    chordSoloistOverlapShare,
}) {
    const flags = [];
    if (drumHits === 0 && bassSteps === 0 && chordSteps <= 1) {
        flags.push('thin-rhythm');
    }
    if (typeof bassKickLockMs === 'number' && bassKickLockMs > 18) {
        flags.push('loose-lock');
    }
    if (chordSteps > 0 && soloistSteps > 0 && chordSoloistOverlapShare > 0.55) {
        flags.push('crowding-lead');
    }
    if (mutedCount > 0) {
        flags.push('muted-stack');
    }
    if (maxPitchedVoices > 6) {
        flags.push('dense-stack');
    }
    return flags;
}

function buildArrangementMetadata(arrangement) {
    return {
        name: arrangement.name,
        key: arrangement.key,
        timeSignature: arrangement.timeSignature,
        totalSteps: arrangement.totalSteps,
        measuresPerLoop: arrangement.measuresPerLoop,
        sections: arrangement.sectionMap.map((section) => ({
            id: section.id || null,
            label: section.label,
            measureStart: Math.floor(section.start / arrangement.stepsPerMeasure) + 1,
            measureEnd: Math.ceil(section.end / arrangement.stepsPerMeasure),
        })),
    };
}

export function buildEnsembleRenderScene({ options, profile, arrangementSpec }) {
    const arrangementName = arrangementSpec?.name || options.arrangementName || 'arrangement';
    const requestedGenre = profile?.genre || options.genre;
    const feel = profile?.genreFeel || requestedGenre || 'Ensemble';

    return {
        id: `ensemble-${slugifyValue(requestedGenre)}-${slugifyValue(arrangementName)}`,
        label: `${feel} ${arrangementName}`,
        source: 'ensemble-audit',
        genreFeel: feel,
        requestedGenre,
        drumPreset: profile?.drumPreset || null,
        chordStyle: profile?.chordStyle || null,
        bassStyle: profile?.bassStyle || null,
        soloistStyle: profile?.soloistStyle || null,
        harmonyStyle: profile?.harmonyStyle || null,
        density: profile?.density || options.density || 'standard',
        creativity: profile?.creativity ?? true,
        includeBass: profile?.includeBass ?? true,
        includeChords: profile?.includeChords ?? true,
        includeSoloist: profile?.includeSoloist ?? true,
        includeHarmony: profile?.includeHarmony ?? true,
        includeDrums: profile?.includeDrums ?? true,
        bpm: options.bpm,
        intensity: options.intensity,
        complexity: options.complexity ?? options.intensity,
        key: options.key,
        timeSignature: options.timeSignature,
        sections: (arrangementSpec?.sections || []).map((section) => ({
            ...section,
            key: section.key || options.key,
            isMinor: section.isMinor ?? arrangementSpec?.isMinor ?? false,
            timeSignature:
                section.timeSignature || arrangementSpec?.timeSignature || options.timeSignature,
        })),
    };
}

function collectTimingBuckets(capture) {
    const buckets = {
        drums: [],
        bass: [],
        chords: [],
        soloist: [],
        harmony: [],
    };

    capture.steps.forEach((step) => {
        step.drumHits.forEach((hit) => {
            buckets.drums.push(hit.timingOffsetMs);
        });
        step.notes.forEach((note) => {
            if (!note.muted && buckets[note.module]) {
                buckets[note.module].push(note.timingOffsetMs);
            }
        });
    });

    return Object.fromEntries(
        TIMING_MODULES.map((module) => [module, buildTimingStats(buckets[module] || [])]),
    );
}

function buildFocusSeeds(seedSummaries, limit = 5) {
    return [...seedSummaries]
        .sort((left, right) => {
            if (right.issueScore !== left.issueScore) {
                return right.issueScore - left.issueScore;
            }
            if (right.bassKickLockMs !== left.bassKickLockMs) {
                return right.bassKickLockMs - left.bassKickLockMs;
            }
            return right.chordSoloistOverlapShare - left.chordSoloistOverlapShare;
        })
        .slice(0, limit)
        .map((row) => ({
            seed: row.seed,
            issueScore: row.issueScore,
            flags: row.flags,
            bassKickLockMs: row.bassKickLockMs,
            chordSoloistOverlapShare: row.chordSoloistOverlapShare,
            mutedShare: row.mutedShare,
        }));
}

/**
 * Temporarily replaces Math.random with a seeded PRNG.
 *
 * @param {string} seed
 * @param {() => any} callback
 */
export function withSeededRandom(seed, callback) {
    const originalRandom = Math.random;
    const prng = createPRNG(seed);
    Math.random = () => prng();

    try {
        return callback();
    } finally {
        Math.random = originalRandom;
    }
}

/**
 * @param {string} [baseSeed]
 * @param {string} [sweepOption]
 * @returns {string[]}
 */
export function normalizeSeedList(baseSeed = DEFAULT_SEED, sweepOption = '') {
    const requested = String(sweepOption || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    const effectiveSeeds = requested.length > 0 ? requested : [baseSeed || DEFAULT_SEED];
    return [...new Set(effectiveSeeds)];
}

/**
 * @param {{
 *   genre: string;
 *   drumPreset?: string;
 *   chordStyle?: string;
 *   bassStyle?: string;
 *   soloistStyle?: string;
 *   harmonyStyle?: string;
 * }} options
 */
export function resolveEnsembleProfile({
    genre,
    drumPreset,
    chordStyle,
    bassStyle,
    soloistStyle,
    harmonyStyle,
}) {
    const smartProfile = SMART_GENRES[genre] || {};
    const resolvedDrumPreset =
        drumPreset || smartProfile.drum || (DRUM_PRESETS[genre] ? genre : DEFAULT_DRUM_PRESET);

    return {
        genre,
        feel: smartProfile.feel || genre,
        drumPreset: DRUM_PRESETS[resolvedDrumPreset] ? resolvedDrumPreset : DEFAULT_DRUM_PRESET,
        chordStyle: chordStyle || smartProfile.chord || 'smart',
        bassStyle: bassStyle || smartProfile.bass || 'smart',
        soloistStyle: soloistStyle || smartProfile.soloist || 'smart',
        harmonyStyle: harmonyStyle || smartProfile.harmony || 'smart',
        swing: smartProfile.swing,
        sub: smartProfile.sub,
    };
}

/**
 * @param {{
 *   genre: string;
 *   bpm: number;
 *   intensity: number;
 *   complexity?: number;
 *   arrangementName?: string;
 *   timeSignature?: string;
 *   key?: string;
 *   density?: string;
 *   seed?: string;
 *   creativity?: boolean;
 *   includeBass?: boolean;
 *   includeChords?: boolean;
 *   includeSoloist?: boolean;
 *   includeHarmony?: boolean;
 *   includeDrums?: boolean;
 *   quietSeedLogs?: boolean;
 *   drumPreset?: string;
 *   chordStyle?: string;
 *   bassStyle?: string;
 *   soloistStyle?: string;
 *   harmonyStyle?: string;
 * }} options
 */
export async function bootstrapEnsembleAudit({
    genre,
    bpm,
    intensity,
    complexity = intensity,
    arrangementName = 'changes',
    timeSignature = '4/4',
    key = 'C',
    density = 'standard',
    seed = DEFAULT_SEED,
    creativity = true,
    includeBass = true,
    includeChords = true,
    includeSoloist = true,
    includeHarmony = true,
    includeDrums = true,
    quietSeedLogs = true,
    drumPreset,
    chordStyle,
    bassStyle,
    soloistStyle,
    harmonyStyle,
}) {
    const profile = resolveEnsembleProfile({
        genre,
        drumPreset,
        chordStyle,
        bassStyle,
        soloistStyle,
        harmonyStyle,
    });

    const { state, arrangement, spec } = bootstrapChordAudit({
        genre: profile.feel,
        bpm,
        intensity,
        complexity,
        timeSignature,
        style: profile.chordStyle,
        density,
        key,
        arrangementName,
    });

    dispatch(ACTIONS.UPDATE_GB, {
        enabled: includeDrums,
        creativity,
        genreFeel: profile.feel,
        lastSmartGenre: genre,
        swing: profile.swing ?? state.groove.swing,
        swingSub: profile.sub ?? state.groove.swingSub,
    });
    dispatch(ACTIONS.SET_STYLE, { module: 'chords', style: profile.chordStyle });
    dispatch(ACTIONS.SET_STYLE, { module: 'bass', style: profile.bassStyle });
    dispatch(ACTIONS.SET_STYLE, { module: 'soloist', style: profile.soloistStyle });
    dispatch(ACTIONS.SET_STYLE, { module: 'harmony', style: profile.harmonyStyle });

    if (includeDrums) {
        await loadDrumPreset(profile.drumPreset);
    } else {
        dispatch(ACTIONS.SET_PARAM, {
            module: 'groove',
            param: 'lastDrumPreset',
            value: profile.drumPreset,
        });
    }

    state.groove.enabled = includeDrums;
    state.groove.seedTimelineStartStep = 0;
    state.bass.enabled = includeBass;
    state.chords.enabled = includeChords;
    state.soloist.enabled = includeSoloist;
    state.harmony.enabled = includeHarmony;
    state.playback.currentLoopCount = 0;
    state.playback.autoIntensity = false;
    state.soloist.analysisSeed = seed;

    dispatch(ACTIONS.SET_SOLOIST_SEED, seed);

    const seedStyle = resolveSoloistStyle(profile.soloistStyle, profile.feel);
    const sessionSeed = includeSoloist
        ? withMutedComposerLogs(
              () => generateSessionSeed(state, state.arranger, seedStyle, intensity, seed),
              quietSeedLogs,
          )
        : null;

    state.soloist.session.seed = sessionSeed;

    const sectionSeedMap = buildSectionSeedMap(state.arranger.sectionMap, seed);
    const orchestrationMap = includeDrums
        ? generateDrumOrchestration(state, state.arranger, profile.feel, intensity, seed)
        : null;
    const fillMap = includeDrums
        ? generateDrumFills(state, state.arranger, profile.feel, intensity, seed)
        : null;

    dispatch(ACTIONS.UPDATE_GB, {
        sectionSeedMap,
        orchestrationMap,
        fillMap,
        fillActive: false,
        fillSteps: {},
        fillStartStep: 0,
        fillLength: 0,
        pendingCrash: false,
        lastDrumPreset: profile.drumPreset,
    });

    return {
        state,
        arrangement,
        arrangementSpec: spec,
        profile: {
            genre,
            genreFeel: profile.feel,
            drumPreset: profile.drumPreset,
            chordStyle: state.chords.style,
            bassStyle: state.bass.style,
            soloistStyle: state.soloist.style,
            harmonyStyle: state.harmony.style,
            density,
            creativity,
            includeBass,
            includeChords,
            includeSoloist,
            includeHarmony,
            includeDrums,
        },
        seedStyle,
        sessionSeed,
    };
}

/**
 * @param {{
 *   state: any;
 *   arrangement: any;
 *   profile: any;
 *   seed: string;
 *   loops?: number;
 *   includeBass?: boolean;
 *   includeChords?: boolean;
 *   includeSoloist?: boolean;
 *   includeHarmony?: boolean;
 *   includeDrums?: boolean;
 *   renderScene?: any;
 * }} options
 */
export function simulateEnsembleLoops({
    state,
    arrangement,
    profile,
    seed,
    loops = 2,
    includeBass = true,
    includeChords = true,
    includeSoloist = true,
    includeHarmony = true,
    includeDrums = true,
    renderScene = null,
}) {
    return withSeededRandom(seed, () => {
        const steps = [];
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };
        const conductorState = {
            loopCount: 0,
            formIteration: 0,
            totalLoops: loops,
        };
        const carryover: CoordinationCarryover = {
            lastActiveSoloistMidi: 0,
            lastActiveSoloistStep: 0,
        };

        for (let absoluteStep = 0; absoluteStep < arrangement.totalSteps * loops; absoluteStep++) {
            applyWorkerTransition(state, absoluteStep, conductorState);

            const stepInLoop = absoluteStep % arrangement.totalSteps;
            const measure = getMeasureEntryAtStep(arrangement, stepInLoop);
            if (!measure) {
                continue;
            }

            const section = arrangement.getSectionAtStep(stepInLoop) || arrangement.sectionMap[0];
            const stepInfo = getStepInfo(
                absoluteStep,
                arrangement.ts,
                state.arranger.measureMap,
                TIME_SIGNATURES,
            );
            const tickResult = generateNotesForStep(
                state,
                absoluteStep,
                cursors,
                {
                    includeBass,
                    includeChords,
                    includeSoloist,
                    includeHarmony,
                    includeDrums,
                },
                carryover,
            );

            if (tickResult.coordination.lastActiveSoloistMidi) {
                carryover.lastActiveSoloistMidi = tickResult.coordination.lastActiveSoloistMidi;
                carryover.lastActiveSoloistStep = tickResult.coordination.lastActiveSoloistStep;
            }

            steps.push({
                loop: conductorState.loopCount,
                absoluteStep,
                stepInLoop,
                measureIndex: measure.measureIndex,
                measureNumber: measure.measureIndex + 1,
                stepInMeasure: stepInfo.mStep,
                chordLabel: measure.chord?.absName || measure.chord?.quality || 'Chord',
                sectionId: section?.id || null,
                sectionLabel: section?.label || measure.label || 'Main',
                bandIntensity: state.playback.bandIntensity || 0,
                isTurnaround: Boolean(tickResult.coordination.isTurnaround),
                kickHit: Boolean(tickResult.coordination.kickHit),
                snareHit: Boolean(tickResult.coordination.snareHit),
                notes: tickResult.notes.map((note) => ({
                    module: note.module,
                    midi: note.midi ?? null,
                    velocity: note.velocity || 0,
                    durationSteps: note.durationSteps || 0,
                    timingOffsetMs: (note.timingOffset || 0) * 1000,
                    muted: Boolean(note.muted),
                })),
                drumHits: tickResult.drumHits.map((hit) => ({
                    soundName: hit.soundName,
                    velocity: hit.velocity || 0,
                    timingOffsetMs: (hit.instTimeOffset || 0) * 1000,
                })),
            });
        }

        return {
            reportType: 'ensemble-capture',
            arrangement,
            profile,
            seed,
            loops,
            renderScene,
            steps,
        };
    });
}

/**
 * @param {ReturnType<typeof simulateEnsembleLoops>} capture
 * @param {number} loop
 */
export function buildEnsembleMeasureRows(capture, loop) {
    const rows = [];

    for (let measureIndex = 0; measureIndex < capture.arrangement.measuresPerLoop; measureIndex++) {
        const measure = capture.arrangement.measurePlan[measureIndex];
        const steps = capture.steps.filter(
            (step) => step.loop === loop && step.measureIndex === measureIndex,
        );

        let activeSteps = 0;
        let drumHits = 0;
        let pitchedNotes = 0;
        let mutedCount = 0;
        let bassSteps = 0;
        let chordSteps = 0;
        let soloistSteps = 0;
        let harmonySteps = 0;
        let chordVoices = 0;
        let harmonyVoices = 0;
        let maxPitchedVoices = 0;
        let chordSoloistOverlapSteps = 0;
        let harmonySupportSteps = 0;
        const bassKickPairs = [];

        steps.forEach((step) => {
            const activeNotes = getActiveNotes(step);
            const bassNotes = getActiveNotes(step, 'bass');
            const chordNotes = getActiveNotes(step, 'chords');
            const soloistNotes = getActiveNotes(step, 'soloist');
            const harmonyNotes = getActiveNotes(step, 'harmony');
            const kicks = getDrumHits(step, 'Kick');

            if (activeNotes.length > 0 || step.drumHits.length > 0) {
                activeSteps++;
            }

            pitchedNotes += activeNotes.length;
            drumHits += step.drumHits.length;
            mutedCount += step.notes.filter((note) => note.muted).length;
            maxPitchedVoices = Math.max(maxPitchedVoices, activeNotes.length);

            if (bassNotes.length > 0) {
                bassSteps++;
            }
            if (chordNotes.length > 0) {
                chordSteps++;
                chordVoices += chordNotes.length;
            }
            if (soloistNotes.length > 0) {
                soloistSteps++;
            }
            if (harmonyNotes.length > 0) {
                harmonySteps++;
                harmonyVoices += harmonyNotes.length;
            }
            if (chordNotes.length > 0 && soloistNotes.length > 0) {
                chordSoloistOverlapSteps++;
            }
            if (harmonyNotes.length > 0 && soloistNotes.length > 0) {
                harmonySupportSteps++;
            }
            if (bassNotes.length > 0 && kicks.length > 0) {
                bassKickPairs.push(
                    Math.abs(
                        average(bassNotes.map((note) => note.timingOffsetMs)) -
                            average(kicks.map((hit) => hit.timingOffsetMs)),
                    ),
                );
            }
        });

        const bassKickLockMs = bassKickPairs.length > 0 ? average(bassKickPairs) : null;
        const chordSoloistOverlapShare =
            chordSteps > 0 && soloistSteps > 0 ? chordSoloistOverlapSteps / steps.length : 0;
        const harmonySupportShare =
            harmonySteps > 0 && soloistSteps > 0 ? harmonySupportSteps / steps.length : 0;

        const flags = summarizeMeasureFlags({
            drumHits,
            bassSteps,
            chordSteps,
            soloistSteps,
            mutedCount,
            maxPitchedVoices,
            bassKickLockMs,
            chordSoloistOverlapShare,
        });

        rows.push({
            loop,
            measureNumber: measureIndex + 1,
            sectionLabel: measure.label,
            chordLabel: measure.chord?.absName || measure.chord?.quality || 'Chord',
            activeSteps,
            drumHits,
            pitchedNotes,
            bassSteps,
            chordSteps,
            soloistSteps,
            harmonySteps,
            chordVoicesPerStep: roundValue(chordVoices / Math.max(1, chordSteps), 2),
            harmonyVoicesPerStep: roundValue(harmonyVoices / Math.max(1, harmonySteps), 2),
            maxPitchedVoices,
            mutedCount,
            bassKickLockMs: bassKickLockMs === null ? null : roundValue(bassKickLockMs, 2),
            chordSoloistOverlapShare: roundValue(chordSoloistOverlapShare),
            harmonySupportShare: roundValue(harmonySupportShare),
            flags,
        });
    }

    return rows;
}

/**
 * @param {ReturnType<typeof simulateEnsembleLoops>} capture
 */
export function buildEnsembleSeedSummary(capture) {
    const measureRows = [];
    for (let loop = 0; loop < capture.loops; loop++) {
        measureRows.push(...buildEnsembleMeasureRows(capture, loop));
    }

    const totalNoteEvents = capture.steps.reduce((sum, step) => sum + step.notes.length, 0);
    const totalMuted = capture.steps.reduce(
        (sum, step) => sum + step.notes.filter((note) => note.muted).length,
        0,
    );
    const bassKickRows = measureRows
        .map((row) => row.bassKickLockMs)
        .filter((value) => typeof value === 'number');

    return {
        seed: capture.seed,
        measuresAnalyzed: measureRows.length,
        activeStepsPerMeasure: roundValue(average(measureRows.map((row) => row.activeSteps)), 2),
        pitchedNotesPerMeasure: roundValue(average(measureRows.map((row) => row.pitchedNotes)), 2),
        drumHitsPerMeasure: roundValue(average(measureRows.map((row) => row.drumHits)), 2),
        bassStepsPerMeasure: roundValue(average(measureRows.map((row) => row.bassSteps)), 2),
        chordStepsPerMeasure: roundValue(average(measureRows.map((row) => row.chordSteps)), 2),
        soloistStepsPerMeasure: roundValue(average(measureRows.map((row) => row.soloistSteps)), 2),
        harmonyStepsPerMeasure: roundValue(average(measureRows.map((row) => row.harmonySteps)), 2),
        chordVoicesPerStep: roundValue(
            average(measureRows.map((row) => row.chordVoicesPerStep)),
            2,
        ),
        harmonyVoicesPerStep: roundValue(
            average(measureRows.map((row) => row.harmonyVoicesPerStep)),
            2,
        ),
        maxPitchedVoices: Math.max(0, ...measureRows.map((row) => row.maxPitchedVoices)),
        bassKickLockMs: roundValue(average(bassKickRows), 2),
        chordSoloistOverlapShare: roundValue(
            average(measureRows.map((row) => row.chordSoloistOverlapShare)),
        ),
        harmonySupportShare: roundValue(average(measureRows.map((row) => row.harmonySupportShare))),
        mutedShare: roundValue(totalMuted / Math.max(1, totalNoteEvents)),
        issueScore: measureRows.reduce((sum, row) => sum + row.flags.length, 0),
        flags: collectTopFlags(measureRows.flatMap((row) => row.flags)),
        timingOffsetMs: collectTimingBuckets(capture),
    };
}

/**
 * @param {ReturnType<typeof buildEnsembleSeedSummary>[]} seedSummaries
 */
export function buildEnsembleAggregateSummary(seedSummaries) {
    return {
        seedCount: seedSummaries.length,
        activeStepsPerMeasure: roundValue(
            average(seedSummaries.map((row) => row.activeStepsPerMeasure)),
            2,
        ),
        pitchedNotesPerMeasure: roundValue(
            average(seedSummaries.map((row) => row.pitchedNotesPerMeasure)),
            2,
        ),
        drumHitsPerMeasure: roundValue(
            average(seedSummaries.map((row) => row.drumHitsPerMeasure)),
            2,
        ),
        bassStepsPerMeasure: roundValue(
            average(seedSummaries.map((row) => row.bassStepsPerMeasure)),
            2,
        ),
        chordStepsPerMeasure: roundValue(
            average(seedSummaries.map((row) => row.chordStepsPerMeasure)),
            2,
        ),
        soloistStepsPerMeasure: roundValue(
            average(seedSummaries.map((row) => row.soloistStepsPerMeasure)),
            2,
        ),
        harmonyStepsPerMeasure: roundValue(
            average(seedSummaries.map((row) => row.harmonyStepsPerMeasure)),
            2,
        ),
        chordVoicesPerStep: roundValue(
            average(seedSummaries.map((row) => row.chordVoicesPerStep)),
            2,
        ),
        harmonyVoicesPerStep: roundValue(
            average(seedSummaries.map((row) => row.harmonyVoicesPerStep)),
            2,
        ),
        maxPitchedVoices: Math.max(0, ...seedSummaries.map((row) => row.maxPitchedVoices)),
        bassKickLockMs: roundValue(average(seedSummaries.map((row) => row.bassKickLockMs)), 2),
        chordSoloistOverlapShare: roundValue(
            average(seedSummaries.map((row) => row.chordSoloistOverlapShare)),
        ),
        harmonySupportShare: roundValue(
            average(seedSummaries.map((row) => row.harmonySupportShare)),
        ),
        mutedShare: roundValue(average(seedSummaries.map((row) => row.mutedShare))),
        avgIssueScore: roundValue(average(seedSummaries.map((row) => row.issueScore)), 2),
        focusFlags: collectTopFlags(
            seedSummaries.flatMap((row) => row.flags),
            5,
        ),
        timingOffsetMs: Object.fromEntries(
            TIMING_MODULES.map((module) => [
                module,
                {
                    mean: roundValue(
                        average(seedSummaries.map((row) => row.timingOffsetMs[module].mean)),
                        2,
                    ),
                    meanAbs: roundValue(
                        average(seedSummaries.map((row) => row.timingOffsetMs[module].meanAbs)),
                        2,
                    ),
                    stdDev: roundValue(
                        average(seedSummaries.map((row) => row.timingOffsetMs[module].stdDev)),
                        2,
                    ),
                },
            ]),
        ),
    };
}

/**
 * @param {{
 *   captures: Array<ReturnType<typeof simulateEnsembleLoops>>;
 *   options: Record<string, any>;
 *   full?: boolean;
 * }} options
 */
export function buildEnsembleAuditReport({ captures, options, full = false }) {
    const seedSummaries = captures.map((capture) => buildEnsembleSeedSummary(capture));
    const measures = full
        ? captures.flatMap((capture) => {
              const rows = [];
              for (let loop = 0; loop < capture.loops; loop++) {
                  rows.push(
                      ...buildEnsembleMeasureRows(capture, loop).map((row) => ({
                          seed: capture.seed,
                          ...row,
                      })),
                  );
              }
              return rows;
          })
        : [];

    return {
        reportType: 'ensemble-audit',
        options: {
            ...options,
            seeds: [...(options.seeds || captures.map((capture) => capture.seed))],
        },
        profile: captures[0]?.profile || null,
        arrangement: captures[0] ? buildArrangementMetadata(captures[0].arrangement) : null,
        renderScene: captures[0]?.renderScene || null,
        aggregate: buildEnsembleAggregateSummary(seedSummaries),
        seeds: seedSummaries,
        focusSeeds: buildFocusSeeds(seedSummaries),
        measures,
    };
}

/**
 * @param {{
 *   genre: string;
 *   bpm: number;
 *   intensity: number;
 *   complexity?: number;
 *   arrangementName?: string;
 *   timeSignature?: string;
 *   key?: string;
 *   density?: string;
 *   seeds?: string[];
 *   loops?: number;
 *   creativity?: boolean;
 *   includeBass?: boolean;
 *   includeChords?: boolean;
 *   includeSoloist?: boolean;
 *   includeHarmony?: boolean;
 *   includeDrums?: boolean;
 *   quietSeedLogs?: boolean;
 *   drumPreset?: string;
 *   chordStyle?: string;
 *   bassStyle?: string;
 *   soloistStyle?: string;
 *   harmonyStyle?: string;
 * }} options
 */
export async function runEnsembleSweep({
    genre,
    bpm,
    intensity,
    complexity = intensity,
    arrangementName = 'changes',
    timeSignature = '4/4',
    key = 'C',
    density = 'standard',
    seeds = [DEFAULT_SEED],
    loops = 2,
    creativity = true,
    includeBass = true,
    includeChords = true,
    includeSoloist = true,
    includeHarmony = true,
    includeDrums = true,
    quietSeedLogs = true,
    drumPreset,
    chordStyle,
    bassStyle,
    soloistStyle,
    harmonyStyle,
}) {
    const captures = [];

    for (const seed of seeds) {
        const bootstrap = await bootstrapEnsembleAudit({
            genre,
            bpm,
            intensity,
            complexity,
            arrangementName,
            timeSignature,
            key,
            density,
            seed,
            creativity,
            includeBass,
            includeChords,
            includeSoloist,
            includeHarmony,
            includeDrums,
            quietSeedLogs,
            drumPreset,
            chordStyle,
            bassStyle,
            soloistStyle,
            harmonyStyle,
        });

        captures.push(
            simulateEnsembleLoops({
                state: bootstrap.state,
                arrangement: bootstrap.arrangement,
                profile: bootstrap.profile,
                seed,
                loops,
                includeBass,
                includeChords,
                includeSoloist,
                includeHarmony,
                includeDrums,
                renderScene: buildEnsembleRenderScene({
                    options: {
                        genre,
                        bpm,
                        intensity,
                        complexity,
                        arrangementName,
                        timeSignature,
                        key,
                        density,
                    },
                    profile: bootstrap.profile,
                    arrangementSpec: bootstrap.arrangementSpec,
                }),
            }),
        );
    }

    return captures;
}

/**
 * @param {ReturnType<typeof buildEnsembleAuditReport>} report
 * @param {{jsonl?: boolean; pretty?: boolean}} [options]
 */
export function formatEnsembleAuditOutput(report, options = {}) {
    const { jsonl = false, pretty = false } = options;
    if (!jsonl) {
        return JSON.stringify(report, null, pretty ? 2 : undefined);
    }

    const lines = [
        JSON.stringify({
            kind: 'aggregate',
            reportType: report.reportType,
            options: report.options,
            profile: report.profile,
            arrangement: report.arrangement,
            renderScene: report.renderScene,
            aggregate: report.aggregate,
        }),
    ];

    report.seeds.forEach((seedRow) => {
        lines.push(
            JSON.stringify({
                kind: 'seed',
                reportType: report.reportType,
                ...seedRow,
            }),
        );
    });

    report.focusSeeds.forEach((focusRow) => {
        lines.push(
            JSON.stringify({
                kind: 'focus',
                reportType: report.reportType,
                ...focusRow,
            }),
        );
    });

    report.measures.forEach((measureRow) => {
        lines.push(
            JSON.stringify({
                kind: 'measure',
                reportType: report.reportType,
                ...measureRow,
            }),
        );
    });

    return lines.join('\n');
}
