import { TIME_SIGNATURES } from '../config.js';
import { binarySearchMap, createPRNG, generateRandomSeed, isSectionTurnaround } from '../utils.js';
import { unrollArrangement } from './arranger-utils.js';
import { getSoloistRegisterProfile, resolveSoloistStyle, STYLE_CONFIG } from './soloist-config.js';
import { getScaleForChord } from './theory-scales.js';

/**
 * Rhythmic Cell Dictionary
 * Common musical motifs used to build the "Head".
 * Expressed in beats relative to the start of the cell.
 */
const RH_CELLS = {
    // 4/4 Basic Cells
    BASIC: [
        [0, 1, 2, 3], // Straight Quarters
        [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], // Straight 8ths
        [0, 1.5, 2, 3.5], // Syncopated (And of 1, And of 4)
        [0, 1, 2], // The "Missing 4"
        [1, 2, 3], // The "Late Start"
    ],
    // 4/4 Stylistic/Complex
    SYNC: [
        [0, 0.75, 1.5, 2.25, 3], // Dotted 8th (Bossa-ish)
        [0, 0.5, 1.25, 1.5, 2, 2.5, 3.25, 3.5], // 16th pushes
        [0.5, 1, 1.5, 2, 2.5, 3, 3.5], // Off-beat start
        [0, 1, 2, 2.75, 3, 3.75], // Gallop finish
    ],
    LINE: [
        [0, 0.5, 1, 2, 2.5, 3], // Quarter anchors with 8th-note continuation
        [0, 0.5, 1.5, 2, 2.5, 3.5], // 8th-note line with a small breath
        [0.5, 1, 1.5, 2.5, 3, 3.5], // Pickup-leaning line
        [0, 1, 1.5, 2, 2.5, 3, 3.5], // Hooky quarter + 8th tail
    ],
    // 3/4 Cells
    WALTZ: [
        [0, 1, 2], // Straight
        [0, 0.5, 1, 1.5, 2, 2.5], // 8ths
        [0, 1.5, 2], // Syncopated 2
        [0, 0.75, 1.5, 2.25], // Dotted
    ],
};

/**
 * Pickup Dictionary (Anacrusis)
 * Common run-ups and pushes leading into a downbeat.
 * Expressed in beats relative to the downbeat (negative values).
 */
const PICKUP_DICTIONARY = {
    SCALE_RUN: [-0.75, -0.5, -0.25], // 16th note walk-up
    CHORD_PUSH: [-0.5], // Syncopated 'And' of 4
    DOUBLE_HIT: [-1.0, -0.5], // Two 8th notes (dun-dun)
    LATE_SWEEP: [-0.375, -0.25, -0.125], // Fast 32nd note flurry
    TRIPLET_RUN: [-0.666, -0.333], // Triplet lead-in
};

/**
 * Soloist Seeder Module (v4)
 * Generates a "Dynamic Head" (Seed Melody) for the entire arrangement.
 * Implements a continuous, musically connected line utilizing target notes,
 * stepwise motion, and pickups (anacrusis).
 */

/**
 * @typedef {Object} SeedNote
 * @property {number} step - Global step target within the loop.
 * @property {number} midi - MIDI note value.
 * @property {boolean} isAnchor - True if it's a structural anchor.
 * @property {number} durationSteps - Suggested duration in steps.
 * @property {number} velocity - Suggested velocity (0.0 - 1.0).
 */

/**
 * @param {number} interval
 * @returns {number}
 */
function normalizeInterval(interval) {
    return ((interval % 12) + 12) % 12;
}

/**
 * @param {string | undefined} label
 * @param {string} style
 * @returns {string}
 */
function getSectionCategory(label, style) {
    const normalized = (label || 'Main').toLowerCase();

    if (normalized.includes('intro')) {
        return 'intro';
    }
    if (normalized.includes('chorus') || normalized.includes('drop')) {
        return 'chorus';
    }
    if (normalized.includes('outro') || normalized.includes('end')) {
        return 'outro';
    }
    if (style === 'jazz' || style === 'bird' || style === 'bossa') {
        return 'jazz';
    }

    const category = normalized.replace(/[^a-z]/g, '');
    return category || 'main';
}

/**
 * @param {string} category
 * @returns {boolean}
 */
function isDepartureCategory(category) {
    return (
        category === 'chorus' ||
        category === 'bridge' ||
        category === 'b' ||
        category === 'prechorus'
    );
}

/**
 * @param {number} interval
 * @returns {boolean}
 */
function isSoftCadenceInterval(interval) {
    const normalized = normalizeInterval(interval);
    return normalized === 2 || normalized === 5 || normalized === 9;
}

/**
 * @param {number} interval
 * @param {number[]} chordIntervals
 * @returns {boolean}
 */
function isStableCadenceInterval(interval, chordIntervals) {
    const normalized = normalizeInterval(interval);
    return chordIntervals.some((chordInterval) => normalizeInterval(chordInterval) === normalized);
}

/**
 * @param {number[]} scale
 * @param {number[]} chordIntervals
 * @param {{ preferStable?: boolean, preferConclusive?: boolean }} [options]
 * @returns {number[]}
 */
function buildCadenceDegreePool(
    scale,
    chordIntervals,
    { preferStable = false, preferConclusive = false } = {},
) {
    /** @type {number[]} */
    const rootDegrees = [];
    /** @type {number[]} */
    const thirdDegrees = [];
    /** @type {number[]} */
    const stableDegrees = [];
    /** @type {number[]} */
    const colorDegrees = [];

    scale.forEach((interval, degree) => {
        const normalized = normalizeInterval(interval);

        if (normalized === 0) {
            rootDegrees.push(degree);
        }
        if (normalized === 3 || normalized === 4) {
            thirdDegrees.push(degree);
        }
        if (isStableCadenceInterval(normalized, chordIntervals)) {
            stableDegrees.push(degree);
        } else if (isSoftCadenceInterval(normalized)) {
            colorDegrees.push(degree);
        }
    });

    if (preferConclusive) {
        return [...rootDegrees, ...rootDegrees, ...thirdDegrees, ...thirdDegrees, ...stableDegrees];
    }

    if (preferStable) {
        return [...thirdDegrees, ...stableDegrees, ...stableDegrees, ...colorDegrees];
    }

    return [...stableDegrees, ...stableDegrees, ...colorDegrees];
}

/**
 * @param {SeedNote} note
 * @param {SeedNote | null} previousNote
 * @param {any} chord
 * @param {boolean} allowSoftColor
 * @returns {number}
 */
function selectLandingMidi(note, previousNote, chord, allowSoftColor) {
    const chordIntervals = chord.intervals || [0, 4, 7];
    /** @type {number[]} */
    const allowedIntervals = [...chordIntervals];

    if (allowSoftColor) {
        allowedIntervals.push(2, 5, 9);
    }

    let bestMidi = note.midi;
    let minScore = Number.POSITIVE_INFINITY;
    const baseOctave = Math.floor(note.midi / 12) * 12;

    for (const interval of allowedIntervals) {
        const targetPitchClass = normalizeInterval(chord.rootMidi + interval);
        for (const octaveShift of [-12, 0, 12]) {
            const candidateMidi = baseOctave + targetPitchClass + octaveShift;
            const movePenalty = Math.abs(candidateMidi - note.midi) * 2.0;
            const linePenalty = previousNote
                ? Math.abs(candidateMidi - previousNote.midi) * 0.5
                : 0;
            const stableBonus =
                interval === 0 || interval === 3 || interval === 4
                    ? -1.25
                    : interval === 7 || interval === 10 || interval === 11
                      ? -0.5
                      : 0;
            const totalScore = movePenalty + linePenalty + stableBonus;

            if (totalScore < minScore) {
                minScore = totalScore;
                bestMidi = candidateMidi;
            }
        }
    }

    return bestMidi;
}

/**
 * @param {SeedNote[]} notes
 * @param {any[]} stepMap
 * @param {any[]} sectionMap
 * @param {number} actualTotalSteps
 * @param {number} stepsPerMeasure
 * @param {string} style
 * @returns {SeedNote[]}
 */
function polishCadenceLandings(
    notes,
    stepMap,
    sectionMap,
    actualTotalSteps,
    stepsPerMeasure,
    style,
) {
    const polishedNotes = [...notes].sort((a, b) => a.step - b.step);

    for (let measureStart = 0; measureStart < actualTotalSteps; measureStart += stepsPerMeasure) {
        const measureEnd = measureStart + stepsPerMeasure;
        const noteIndexes = [];

        for (let i = 0; i < polishedNotes.length; i++) {
            const note = polishedNotes[i];
            if (note.step >= measureStart && note.step < measureEnd) {
                noteIndexes.push(i);
            }
        }

        if (noteIndexes.length === 0) {
            continue;
        }

        const lastIndex = noteIndexes[noteIndexes.length - 1];
        const note = polishedNotes[lastIndex];
        const stepEntry = binarySearchMap(stepMap, Math.min(note.step, actualTotalSteps - 1));

        if (!stepEntry?.chord) {
            continue;
        }

        const currentSection = sectionMap.find(
            (/** @type {any} */ section) =>
                measureStart >= section.start && measureStart < section.end,
        );
        const category = getSectionCategory(currentSection?.label, style);
        const isDeparture = isDepartureCategory(category);
        const isSectionEnding = currentSection ? measureEnd >= currentSection.end : false;
        const chordIntervals = stepEntry.chord.intervals || [0, 4, 7];
        const interval = normalizeInterval(note.midi - stepEntry.chord.rootMidi);
        const isStable = isStableCadenceInterval(interval, chordIntervals);
        const isSoft = isSoftCadenceInterval(interval);
        const shouldRepairHarshLanding = !isStable && !isSoft;
        const shouldTightenStatementEnding = !isDeparture && isSectionEnding && !isStable;

        if (!shouldRepairHarshLanding && !shouldTightenStatementEnding) {
            continue;
        }

        const previousNote = lastIndex > 0 ? polishedNotes[lastIndex - 1] : null;
        const replacementMidi = selectLandingMidi(
            note,
            previousNote,
            stepEntry.chord,
            !shouldTightenStatementEnding,
        );

        if (replacementMidi !== note.midi) {
            polishedNotes[lastIndex] = { ...note, midi: replacementMidi };
        }
    }

    return polishedNotes;
}

/**
 * Generates a song-wide seed melody for the soloist.
 * @param {import('../types.js').EnsembleState} state
 * @param {import('../state/arranger.js').ArrangerState} arranger
 * @param {string} style
 * @param {number} [_intensity]
 * @param {string} [seedStr]
 * @returns {{ notes: SeedNote[], loopLengthSteps: number }}
 */
export function generateSessionSeed(state, arranger, style, _intensity, seedStr) {
    style = resolveSoloistStyle(style, state?.groove?.genreFeel);

    // Unroll the arrangement for virtual macro-form (max 128 bars for performance)
    const unrolled = unrollArrangement(arranger, 128);
    const { stepMap, sectionMap, totalSteps } = unrolled;

    if (!stepMap || stepMap.length === 0) {
        return { notes: [], loopLengthSteps: 0 };
    }

    const prng = createPRNG(seedStr || generateRandomSeed());

    const tsConfig =
        /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;

    /** @type {SeedNote[]} */
    const notes = [];

    // Ensure totalSteps is a valid number
    const actualTotalSteps =
        typeof totalSteps === 'number' && !Number.isNaN(totalSteps)
            ? totalSteps
            : sectionMap[sectionMap.length - 1]?.end || 0;

    if (!sectionMap || sectionMap.length === 0 || actualTotalSteps === 0) {
        return { notes: [], loopLengthSteps: actualTotalSteps };
    }

    // To ensure repetition across identical sections (e.g. AABA form),
    // we'll memorize the target note sequence for each section label.
    // For even more musicality, we'll store the 'motif' of steps and intervals relative to chords.
    /** @type {Map<string, { motif: Array<{beatOffset: number, isPickup: boolean, scaleDegreeOffset: number, duration: number, isRest: boolean}>, phraseLength: number, contourType: string, metrics: { density: number, syncopationRatio: number }, isStationaryMotif: boolean }>} */
    const sectionMotifs = new Map();

    /** @type {Map<string, number>} */
    const sectionIterationCount = new Map();

    // Find macro turnaround index
    const turnaroundIndex = sectionMap.length - 1;
    // ... (rest of logic remains same, but using actualTotalSteps)

    // Walk through each section
    console.log(
        `[Seeder Debug] Starting seed generation. Total steps: ${actualTotalSteps}, time signature: ${arranger.timeSignature}`,
    );

    sectionMap.forEach((sectionRange, index) => {
        const label = (sectionRange.label || 'Main').toLowerCase();

        const category = getSectionCategory(label, style);

        const sectionStartMeasure = Math.floor(sectionRange.start / stepsPerMeasure);
        const sectionEndMeasure = Math.ceil(sectionRange.end / stepsPerMeasure);

        console.log(
            `[Seeder Debug] Section ${label}: start measure ${sectionStartMeasure}, end measure ${sectionEndMeasure}. Applying motif.`,
        );

        const isDeparture = isDepartureCategory(category);

        // Track iterations to apply restatement mutations
        const iteration = sectionIterationCount.get(category) || 0;
        sectionIterationCount.set(category, iteration + 1);

        const config = /** @type {any} */ (STYLE_CONFIG)[style] || STYLE_CONFIG.scalar;
        const registerProfile = getSoloistRegisterProfile(style);
        const rhythmicDensity = config.rhythmicDensity || 0.5;
        const syncBias = config.syncopationLikelihood || 0.2;
        const isBossaStyle = style === 'bossa';
        const isNeoStyle = style === 'neo';
        const isSmoothSyncStyle = isBossaStyle || isNeoStyle;
        const isJazzStyle = ['jazz', 'bird', 'bossa'].includes(style);
        const isForwardStatement = !isJazzStyle && (index === 0 || !isDeparture);
        const statementDensity = isForwardStatement
            ? Math.min(0.8, rhythmicDensity + 0.08 + syncBias * 0.1)
            : rhythmicDensity;

        /**
         * Helper to generate a 1-measure rhythmic cell
         * @param {boolean} sparse
         * @param {boolean} dense
         * @param {number} density
         * @returns {any[]}
         */
        const generateCell = (sparse, dense, density) => {
            /** @type {any[]} */
            const cell = [];
            const beatsPerCell = tsConfig.beats;
            const isCompound = tsConfig.pulse && tsConfig.pulse.length > 0;

            if (isCompound) {
                // Compound Meter Pulse-Aware Generation (e.g. 6/8)
                const grouping = tsConfig.grouping || [beatsPerCell];
                let currentGroupStep = 0;

                grouping.forEach((/** @type {number} */ groupSize) => {
                    const groupSteps = groupSize * stepsPerBeat;
                    let stepInGroup = 0;

                    while (stepInGroup < groupSteps) {
                        const isPulseStart = stepInGroup === 0;
                        let isRest = false;

                        if (sparse) {
                            isRest = prng() > (isPulseStart ? density * 0.6 : density * 0.4);
                        } else if (dense) {
                            isRest = prng() > Math.min(0.98, density * 1.5);
                        } else {
                            isRest = prng() > (isPulseStart ? density * 1.1 : density * 0.9);
                        }

                        // Calculate duration
                        let durationSteps = stepsPerBeat;
                        if (dense) {
                            durationSteps = prng() > 0.5 ? stepsPerBeat / 2 : stepsPerBeat;
                        } else if (sparse) {
                            durationSteps = groupSteps - stepInGroup;
                        } else {
                            if (stepInGroup + stepsPerBeat > groupSteps) {
                                durationSteps = groupSteps - stepInGroup;
                            }
                        }

                        if (!isRest) {
                            cell.push({
                                beatOffset: (currentGroupStep + stepInGroup) / stepsPerBeat,
                                duration: durationSteps,
                                isRest: false,
                            });
                        }

                        stepInGroup += durationSteps;
                    }
                    currentGroupStep += groupSteps;
                });
            } else {
                // Standard Meter: Use Rhythm Dictionary
                let pool = RH_CELLS.BASIC;
                const forwardPool = [
                    RH_CELLS.BASIC[0],
                    RH_CELLS.BASIC[1],
                    RH_CELLS.SYNC[1],
                    RH_CELLS.SYNC[3],
                ];
                const linePool = [
                    RH_CELLS.BASIC[1],
                    RH_CELLS.SYNC[1],
                    RH_CELLS.SYNC[2],
                    ...RH_CELLS.LINE,
                ];
                const hookPool = [
                    RH_CELLS.BASIC[2],
                    RH_CELLS.BASIC[3],
                    RH_CELLS.SYNC[3],
                    RH_CELLS.LINE[3],
                ];
                if (beatsPerCell === 3) {
                    pool = RH_CELLS.WALTZ;
                } else if (isJazzStyle) {
                    if (dense || density > 0.72 || syncBias > 0.82) {
                        pool = [...linePool, ...hookPool, ...RH_CELLS.SYNC, ...RH_CELLS.SYNC];
                    } else if (density >= 0.55) {
                        pool =
                            prng() < 0.55 + syncBias * 0.25
                                ? [...linePool, ...hookPool, ...RH_CELLS.SYNC]
                                : [...linePool, ...RH_CELLS.BASIC];
                    } else {
                        pool =
                            prng() < 0.65 + syncBias * 0.15
                                ? [...linePool, ...RH_CELLS.SYNC, RH_CELLS.BASIC[3]]
                                : [...RH_CELLS.BASIC, ...RH_CELLS.LINE];
                    }
                } else if (isForwardStatement && density >= 0.55) {
                    pool =
                        syncBias > 0.65
                            ? prng() < 0.8
                                ? [...RH_CELLS.LINE, ...forwardPool, ...RH_CELLS.SYNC]
                                : [...RH_CELLS.SYNC, ...hookPool]
                            : prng() < 0.65
                              ? forwardPool
                              : [...forwardPool, ...RH_CELLS.SYNC];
                } else if (syncBias > 0.6 && (density > 0.5 || dense)) {
                    pool =
                        prng() < 0.7
                            ? [...RH_CELLS.LINE, ...RH_CELLS.SYNC, ...hookPool]
                            : [...RH_CELLS.BASIC, ...RH_CELLS.SYNC];
                } else if (density > 0.7 || dense || prng() < 0.3) {
                    pool = [...RH_CELLS.BASIC, ...RH_CELLS.SYNC];
                }

                const selectedPattern = pool[Math.floor(prng() * pool.length)];
                const restProb = 1.0 - density;
                const restScale = isJazzStyle ? 0.08 : Math.max(0.06, 0.15 - syncBias * 0.08);

                selectedPattern.forEach((beatOffset, idx) => {
                    // Sparse mode drops non-anchors
                    if (sparse && idx % 2 !== 0 && prng() < 0.6) {
                        return;
                    }

                    // General rest probability (significantly reduced since dictionary cells are already musical)
                    if (!dense && prng() < restProb * restScale) {
                        return;
                    }

                    const nextOffset = selectedPattern[idx + 1] || beatsPerCell;
                    let dur = (nextOffset - beatOffset) * stepsPerBeat;

                    // Add some length variety to basic patterns
                    if (
                        !dense &&
                        !isJazzStyle &&
                        dur === stepsPerBeat &&
                        prng() < Math.max(0.05, 0.2 - syncBias * 0.12)
                    ) {
                        dur *= 2;
                    }

                    cell.push({
                        beatOffset,
                        duration: dur,
                        isRest: false,
                    });
                });
            }
            return cell;
        };

        // Generate or retrieve the motif for this section category
        // A motif is a 2-measure rhythmic/melodic contour template
        if (!sectionMotifs.has(category)) {
            const stationaryProb = Math.max(
                isSmoothSyncStyle && !isDeparture ? 0.01 : 0.02,
                (config.stationaryProb || 0.05) *
                    Math.max(0.35, 1 - syncBias * 0.7) *
                    (isSmoothSyncStyle && !isDeparture ? 0.4 : 1),
            );
            const isStationaryMotif = prng() < stationaryProb;

            // Generate a 2-measure template
            /** @type {any[]} */
            const motif = [];
            let currentDegreeOffset = 0;

            // Check for contrast needs
            let forceSparse = false;
            let forceDense = false;
            if (isDeparture) {
                // Find primary motif metrics to create contrast
                const primaryMetrics =
                    sectionMotifs.get('verse')?.metrics ||
                    sectionMotifs.get('main')?.metrics ||
                    sectionMotifs.get('a')?.metrics;
                if (primaryMetrics) {
                    if (primaryMetrics.density > 4 && primaryMetrics.syncopationRatio > 0.4) {
                        forceSparse = true;
                    } else if (primaryMetrics.density < 3) {
                        forceDense = true;
                    }
                }
            }

            // Determine phrase length dynamically
            const sectionTotalMeasures = sectionEndMeasure - sectionStartMeasure;
            let phraseLength = 2; // default
            if (sectionTotalMeasures > 0) {
                if (sectionTotalMeasures % 12 === 0) {
                    phraseLength = 4; // Blues phrasing
                } else if (sectionTotalMeasures % 8 === 0) {
                    phraseLength = 4; // Pop/Jazz standard
                } else if (sectionTotalMeasures % 4 === 0) {
                    phraseLength = 4;
                }
            }

            // --- Melodic Intent Phase ---
            const contourPool = isBossaStyle
                ? [
                      'ASCEND',
                      'DESCEND',
                      'ARCH',
                      'ARCH',
                      'VALLEY',
                      'HOOK',
                      'ARPEGGIATE',
                      'ARPEGGIATE',
                      'ARPEGGIATE',
                  ]
                : isJazzStyle
                  ? [
                        'ASCEND',
                        'DESCEND',
                        'ARCH',
                        'VALLEY',
                        'HOOK',
                        'ARPEGGIATE',
                        'HOOK',
                        'ARPEGGIATE',
                        'ARCH',
                    ]
                  : isNeoStyle
                    ? [
                          'ASCEND',
                          'DESCEND',
                          'ARCH',
                          'ARCH',
                          'VALLEY',
                          'HOOK',
                          'ARPEGGIATE',
                          'ARPEGGIATE',
                          'ARPEGGIATE',
                      ]
                    : isForwardStatement
                      ? syncBias > 0.65
                          ? [
                                'ASCEND',
                                'DESCEND',
                                'ARCH',
                                'VALLEY',
                                'HOOK',
                                'HOOK',
                                'ARPEGGIATE',
                                'ARPEGGIATE',
                                'ARCH',
                            ]
                          : [
                                'ASCEND',
                                'DESCEND',
                                'ARCH',
                                'VALLEY',
                                'STATIC',
                                'HOOK',
                                'HOOK',
                                'ARPEGGIATE',
                            ]
                      : syncBias > 0.55
                        ? [
                              'ASCEND',
                              'DESCEND',
                              'ARCH',
                              'VALLEY',
                              'HOOK',
                              'ARPEGGIATE',
                              'ARPEGGIATE',
                              'STATIC',
                          ]
                        : ['ASCEND', 'DESCEND', 'ARCH', 'VALLEY', 'STATIC', 'HOOK', 'ARPEGGIATE'];
            const contourType = contourPool[Math.floor(prng() * contourPool.length)];
            console.log(`[Composer] Assigned contour: ${contourType} to category: ${category}`);

            // 1. Generate the initial A cell
            const cellA = generateCell(forceSparse, forceDense, statementDensity);

            // Generate secondary cells for longer phrases
            const cellB = generateCell(forceSparse, forceDense, statementDensity);
            const cellC = generateCell(forceSparse, forceDense, statementDensity);

            // Determine motif structure based on phrase length
            const structureRoll = prng();
            let structureType = 'A-B'; // fallback

            if (phraseLength === 4) {
                if (isJazzStyle || isForwardStatement) {
                    if (structureRoll < 0.35) {
                        structureType = 'A-A-B-A';
                    } else if (structureRoll < 0.65) {
                        structureType = 'A-A-A-B';
                    } else if (structureRoll < 0.82) {
                        structureType = 'A-B-A-B';
                    } else if (structureRoll < 0.95) {
                        structureType = 'A-B-A-C';
                    } else {
                        structureType = 'A-B-A-Rest';
                    }
                } else if (structureRoll < 0.25) {
                    structureType = 'A-A-A-B';
                } else if (structureRoll < 0.5) {
                    structureType = 'A-B-A-C';
                } else if (structureRoll < 0.75) {
                    structureType = 'A-A-B-A';
                } else if (structureRoll < 0.9) {
                    structureType = 'A-B-A-B';
                } else {
                    structureType = 'A-B-A-Rest'; // More tasteful than A-Rest-B-Rest
                }
            } else {
                if (isJazzStyle) {
                    if (structureRoll < 0.62) {
                        structureType = 'A-A';
                    } else if (structureRoll < 0.92) {
                        structureType = 'A-B';
                    } else {
                        structureType = 'A-Rest';
                    }
                } else if (structureRoll < 0.5) {
                    structureType = 'A-A';
                }
            }

            // 2. Build the motif based on the chosen structure
            currentDegreeOffset = 0;
            // Contour-based starting offset
            if (contourType === 'ASCEND') {
                currentDegreeOffset = -2;
            } else if (contourType === 'DESCEND') {
                currentDegreeOffset = 4;
            }

            let lastMotion = 0;
            const structureArray = structureType.split('-');

            /** @type {Map<string, number[]>} */
            const cellMemory = new Map();

            let tiedDurationBeats = 0;

            for (let measure = 0; measure < phraseLength; measure++) {
                let currentCell = cellA;
                const cellType = structureArray[measure % structureArray.length];

                if (cellType === 'B') {
                    currentCell = cellB;
                } else if (cellType === 'C') {
                    currentCell = cellC;
                } else if (cellType === 'Rest') {
                    // Create a mostly empty cell
                    currentCell = [
                        {
                            beatOffset: 0,
                            duration: tsConfig.beats * stepsPerBeat,
                            isRest: true,
                        },
                    ];
                    // 30% chance for a small closing hit on beat 4
                    if (prng() < 0.3) {
                        currentCell[0].duration = (tsConfig.beats - 1) * stepsPerBeat;
                        currentCell.push({
                            beatOffset: tsConfig.beats - 1,
                            duration: stepsPerBeat,
                            isRest: false,
                        });
                    }
                }

                // --- Melodic Sequencing Logic ---
                // If we've seen this cell type before, reuse its relative intervals (offsets)
                const previousOffsets = cellMemory.get(cellType);
                /** @type {number[]} */
                const currentCellOffsets = [];

                currentCell.forEach((cellNote, noteIdx) => {
                    let isRest = cellNote.isRest;
                    let duration = cellNote.duration;

                    // BARLINE TIE: If the previous measure tied over, silence notes at the entrance
                    if (tiedDurationBeats > 0 && cellNote.beatOffset < tiedDurationBeats) {
                        isRest = true;
                    }

                    // Imperfect Symmetry: Even if A-A, let repeated measures drift slightly
                    const symmetryMutationProb =
                        contourType === 'HOOK' ? 0.15 : isJazzStyle ? 0.22 : 0.3;
                    if (measure > 0 && cellType === 'A' && prng() < symmetryMutationProb) {
                        const r = prng();
                        if (r < 0.4) {
                            isRest = !isRest; // Flip rest status
                        } else if (r < 0.7) {
                            duration = Math.max(
                                stepsPerBeat / 2,
                                duration + (prng() > 0.5 ? 2 : -2),
                            ); // Change duration
                        }
                    }

                    let motion = 0;
                    if (!isRest) {
                        if (previousOffsets && previousOffsets[noteIdx] !== undefined) {
                            // SEQUENCE: Reuse the motion from the first time we played this cell type
                            motion = previousOffsets[noteIdx];
                        } else if (!isStationaryMotif) {
                            const r = prng();
                            const highSyncContour =
                                syncBias > 0.75 && !['jazz', 'bird'].includes(style);

                            // CONTOUR BIASING
                            const progress = measure / phraseLength;
                            let upProb = 0.5;
                            if (contourType === 'ASCEND') {
                                upProb = 0.7;
                            } else if (contourType === 'DESCEND') {
                                upProb = 0.3;
                            } else if (contourType === 'ARCH') {
                                upProb = progress < 0.5 ? 0.7 : 0.3;
                            } else if (contourType === 'VALLEY') {
                                upProb = progress < 0.5 ? 0.3 : 0.7;
                            } else if (contourType === 'STATIC') {
                                upProb = currentDegreeOffset > 0 ? 0.2 : 0.8;
                            }

                            // Leap-and-Fill Logic: If we just jumped, must step back
                            if (
                                Math.abs(lastMotion) >=
                                (contourType === 'ARPEGGIATE' ? 5 : contourType === 'HOOK' ? 4 : 4)
                            ) {
                                motion = lastMotion > 0 ? -1 : 1; // Step in opposite direction
                            } else if (contourType === 'ARPEGGIATE') {
                                if (r < (highSyncContour ? 0.34 : 0.38)) {
                                    motion = prng() < upProb ? 2 : -2; // Thirds
                                } else if (r < (highSyncContour ? 0.74 : 0.68)) {
                                    motion = prng() < upProb ? 4 : -4; // Fifth-ish vaults
                                } else if (r < 0.92) {
                                    motion = prng() < upProb ? 1 : -1; // Filling step
                                } else {
                                    motion = 0; // Tasteful repeat
                                }
                            } else if (contourType === 'HOOK') {
                                if (r < (highSyncContour ? 0.18 : 0.24)) {
                                    motion = 0; // Repetition keeps the hook singable
                                } else if (r < (highSyncContour ? 0.58 : 0.6)) {
                                    motion = prng() < upProb ? 2 : -2; // Skips add contour
                                } else if (r < (highSyncContour ? 0.76 : 0.82)) {
                                    motion = prng() < upProb ? 1 : -1;
                                } else {
                                    motion =
                                        prng() < upProb
                                            ? highSyncContour
                                                ? 4
                                                : 3
                                            : highSyncContour
                                              ? -4
                                              : -3;
                                }
                            } else {
                                // Normal motion logic
                                if (r < (highSyncContour ? 0.44 : 0.52)) {
                                    motion = prng() < upProb ? 1 : -1; // Step
                                } else if (r < (highSyncContour ? 0.76 : 0.79)) {
                                    motion = prng() < upProb ? 2 : -2; // Skip
                                } else if (r < (highSyncContour ? 0.84 : 0.88)) {
                                    motion = 0; // Repeat
                                } else {
                                    motion =
                                        prng() < upProb
                                            ? highSyncContour
                                                ? 4
                                                : 3
                                            : highSyncContour
                                              ? -4
                                              : -3; // Leap
                                }
                            }

                            // Magnetic Center: Pull back towards 0 if we drift too far
                            // This ensures contour doesn't drift too high or low
                            const excursionLimit =
                                contourType === 'ARPEGGIATE'
                                    ? 8
                                    : contourType === 'HOOK'
                                      ? 7
                                      : syncBias > 0.75
                                        ? 7
                                        : 6;
                            if (currentDegreeOffset > excursionLimit && motion > 0) {
                                motion = prng() > 0.5 ? -1 : -2;
                            }
                            if (currentDegreeOffset < -excursionLimit && motion < 0) {
                                motion = prng() > 0.5 ? 1 : 2;
                            }
                        }
                        currentDegreeOffset += motion;
                        lastMotion = motion;
                        currentCellOffsets.push(motion);
                    } else {
                        currentCellOffsets.push(0);
                    }

                    motif.push({
                        beatOffset: cellNote.beatOffset + measure * tsConfig.beats,
                        isPickup: false,
                        scaleDegreeOffset: currentDegreeOffset,
                        duration: duration,
                        isRest: isRest,
                    });
                });

                // Store the offsets for future sequencing
                if (!cellMemory.has(cellType)) {
                    cellMemory.set(cellType, currentCellOffsets);
                }

                // BARLINE TIE: At the end of the measure, decide if we should tie the last note over
                tiedDurationBeats = 0; // Reset for next measure
                if (measure < phraseLength - 1) {
                    const lastActiveNote = motif.filter((n) => !n.isRest).pop();
                    // If the last note ends late in the measure (beat 3 or later)
                    if (
                        lastActiveNote &&
                        lastActiveNote.beatOffset >= measure * tsConfig.beats + (tsConfig.beats - 1)
                    ) {
                        const tieProb = isJazzStyle ? 0.5 : isForwardStatement ? 0.1 : 0.25;
                        if (prng() < tieProb) {
                            const tieLengthBeats = prng() > 0.5 ? 1 : 0.5;
                            lastActiveNote.duration += tieLengthBeats * stepsPerBeat;
                            tiedDurationBeats = tieLengthBeats;
                        }
                    }
                }
            }

            // SAFETY: If motif is empty (all rests), force a note on the first downbeat
            const activeNotes = motif.filter((n) => !n.isRest);
            if (activeNotes.length === 0 && motif.length > 0) {
                const firstDownbeat = motif.find((n) => n.beatOffset === 0);
                if (firstDownbeat) {
                    firstDownbeat.isRest = false;
                    firstDownbeat.scaleDegreeOffset = 0;
                }
            }

            // Calculate metrics for this new motif
            let attacks = 0;
            let syncopatedAttacks = 0;
            motif.forEach((n) => {
                if (!n.isRest) {
                    attacks++;
                    // An off-beat is any offset that is not a whole number or downbeat
                    const isDownbeat = n.beatOffset % tsConfig.beats === 0;
                    const isWholeBeat = n.beatOffset % 1 === 0;
                    if (!isWholeBeat || !isDownbeat) {
                        syncopatedAttacks++;
                    }
                }
            });
            const density = attacks / phraseLength; // attacks per measure
            const syncopationRatio = attacks > 0 ? syncopatedAttacks / attacks : 0;

            sectionMotifs.set(category, {
                motif,
                phraseLength,
                contourType,
                metrics: { density, syncopationRatio },
                isStationaryMotif,
            });
        }

        let { motif, phraseLength, isStationaryMotif, contourType } = sectionMotifs.get(
            category,
        ) || {
            motif: [],
            phraseLength: 2,
            isStationaryMotif: false,
            contourType: 'STATIC',
        };

        // Motivic Mutation (Restatement)
        if (iteration > 0) {
            // Create a deep copy to mutate
            motif = motif.map((n) => ({ ...n }));

            const r = prng();
            if (r < 0.2) {
                // Enhanced Rhythmic Displacement: Shift motif by 16th, 8th, or anticipate
                const shiftAmount = prng() > 0.5 ? 0.5 : prng() > 0.5 ? 0.25 : -0.5;
                motif.forEach((n) => {
                    n.beatOffset += shiftAmount;
                });
            } else if (r < 0.4) {
                // Rhythmic Compression / Subdivision
                const longNotes = motif.filter((n) => n.duration >= stepsPerBeat && !n.isRest);
                if (longNotes.length > 0) {
                    const target = longNotes[Math.floor(prng() * longNotes.length)];
                    const halfDur = target.duration / 2;
                    target.duration = halfDur;
                    // Insert the second note
                    const newNote = {
                        ...target,
                        beatOffset: target.beatOffset + halfDur / stepsPerBeat,
                        scaleDegreeOffset: target.scaleDegreeOffset + (prng() > 0.5 ? 1 : -1),
                    };
                    const idx = motif.indexOf(target);
                    motif.splice(idx + 1, 0, newNote);
                }
            } else if (r < 0.55) {
                // Note Drop (Less is More)
                const optionalNotes = motif.filter(
                    (n) => !n.isRest && n.beatOffset % tsConfig.beats !== 0,
                );
                if (optionalNotes.length > 0) {
                    const target = optionalNotes[Math.floor(prng() * optionalNotes.length)];
                    target.isRest = true;
                }
            } else if (r < 0.7) {
                // Interval Expansion: Push the highest pitch up a diatonic third
                let maxDegree = -999;
                /** @type {any} */
                let targetNote = null;
                motif.forEach((n) => {
                    if (!n.isRest && n.scaleDegreeOffset > maxDegree) {
                        maxDegree = n.scaleDegreeOffset;
                        targetNote = n;
                    }
                });
                if (targetNote) {
                    targetNote.scaleDegreeOffset += 2; // Diatonic third
                }
            } else if (r < 0.85) {
                if (isSmoothSyncStyle) {
                    // Smooth-sync styles still benefit from a memorable restatement,
                    // but a total pitch collapse tends to produce overly static weak seeds.
                    let gestureDir = prng() > 0.5 ? 1 : -1;
                    let activeIndex = 0;
                    motif.forEach((n) => {
                        if (n.isRest) {
                            return;
                        }
                        const gestureSlot = activeIndex % 4;
                        if (gestureSlot === 0 || gestureSlot === 2) {
                            n.scaleDegreeOffset = 0;
                        } else if (gestureSlot === 1) {
                            n.scaleDegreeOffset = gestureDir * 2;
                        } else {
                            n.scaleDegreeOffset = gestureDir;
                            gestureDir *= -1;
                        }
                        activeIndex++;
                    });
                } else {
                    // Stationary Transformation: Collapse all pitches to a single anchor tone (Root/5th)
                    // This creates "tension hooks" during restatements
                    motif.forEach((n) => {
                        n.scaleDegreeOffset = 0;
                    });
                }
            } else {
                // Sequencing: Transpose the entire motif by a diatonic step or third
                const shift = prng() > 0.5 ? 1 : 2;
                motif.forEach((n) => {
                    if (!n.isRest) {
                        n.scaleDegreeOffset += shift;
                    }
                });
            }
        }

        // Apply motif to the section, typically repeating in 2-measure blocks
        // within a larger 4 or 8 measure block with a forced rest at the end.
        let registerBase = registerProfile.seedCenter;
        const intensityVal = _intensity || 0.5;

        if (category === 'intro' || index === 0) {
            registerBase -= registerProfile.seedIntroDrop;
        } else if (category === 'chorus') {
            registerBase += registerProfile.seedChorusLift;
        } else if (isDeparture) {
            registerBase += registerProfile.seedDepartureLift;
        } else if (intensityVal > 0.7) {
            registerBase += 2;
        }
        registerBase = Math.max(
            registerProfile.seedFloor,
            Math.min(registerProfile.seedCeiling - 6, registerBase),
        );

        let lastMidi = registerBase;

        // Find if this is the last section before a structural reset (macro form turnaround)
        // Usually the last section in the arranger.sectionMap, or right before a loop
        const _isLastSectionOfForm = index === turnaroundIndex;

        // Apply motifs in phraseLength-measure blocks across the entire section range
        for (let m = sectionStartMeasure; m < sectionEndMeasure; m += phraseLength) {
            const baseStep = m * stepsPerMeasure;

            // --- Sectional Turnaround Logic (A-A-A-B) ---
            // If this is the last phraseLength measures of a >= 8 measure section,
            // trigger a unique turnaround motif to break predictability.
            const isTurnaroundMeasures =
                !isStationaryMotif &&
                sectionEndMeasure - sectionStartMeasure >= 8 &&
                isSectionTurnaround(baseStep, sectionMap, stepsPerMeasure, phraseLength);
            /** @type {Array<{beatOffset: number, isPickup: boolean, scaleDegreeOffset: number, duration: number, isRest: boolean}>} */
            let activeMotif = [...motif]; // Copy so we can safely inject one-off pickups

            if (isTurnaroundMeasures) {
                // Generate a one-off "Departure" motif for the turnaround
                // Busier turnaround (+0.2 density boost) but still respects genre
                const tDensity = Math.min(1.0, rhythmicDensity + 0.2);

                activeMotif = [];
                let tDegree = 0;
                for (let tc = 0; tc < phraseLength; tc++) {
                    const tCell = generateCell(false, true, tDensity);
                    tCell.forEach((cNote) => {
                        tDegree += prng() > 0.5 ? 1 : -1;
                        activeMotif.push({
                            beatOffset: cNote.beatOffset + tc * tsConfig.beats,
                            isPickup: false,
                            scaleDegreeOffset: tDegree,
                            duration: cNote.duration,
                            isRest: false,
                        });
                    });
                }
            } else if (m === sectionStartMeasure) {
                // --- Sectional Entrance (Anacrusis) ---
                // Only trigger at the start of a structural block (and avoid sparse sections)
                if (prng() > 0.3 && !isStationaryMotif) {
                    const pickupValues = Object.values(PICKUP_DICTIONARY);
                    const pickupKeys = Object.keys(PICKUP_DICTIONARY);
                    const pIdx = Math.floor(prng() * pickupValues.length);
                    const pPattern = pickupValues[pIdx];
                    const pKey = pickupKeys[pIdx];

                    // Find the target degree we are leading into
                    const firstNote = activeMotif.find((n) => !n.isRest && n.beatOffset >= 0);
                    const targetDegree = firstNote ? firstNote.scaleDegreeOffset : 0;

                    // Start below the target and walk up to it
                    let currentDegree = targetDegree - pPattern.length;

                    // Inject pickup notes at the beginning of the motif
                    const pickupNotes = pPattern.map(
                        (/** @type {number} */ pOffset, /** @type {number} */ i) => {
                            const nextOffset = pPattern[i + 1] || 0;
                            return {
                                beatOffset: pOffset,
                                isPickup: true,
                                scaleDegreeOffset: currentDegree++,
                                duration: (nextOffset - pOffset) * stepsPerBeat,
                                isRest: false,
                            };
                        },
                    );

                    activeMotif = [...pickupNotes, ...activeMotif];
                    console.log(`[Composer] Injected ${pKey} pickup into section ${label}`);
                }
            }

            // Pick a target chord tone for the downbeat of these 2 measures
            const stepToSearch = Math.min(baseStep, actualTotalSteps - 1);
            const entryForMeasure = binarySearchMap(stepMap, stepToSearch);

            if (!entryForMeasure?.chord) {
                continue;
            }
            /** @type {any} */
            const targetChord = entryForMeasure.chord;
            const chordTones = targetChord.intervals || [0, 4, 7]; // Fallback to triad if not parsed
            const targetInterval = chordTones[Math.floor(prng() * chordTones.length)]; // Root, 3rd, 5th, etc.
            const targetPitchClass = (targetChord.rootMidi + targetInterval) % 12;

            const registerOctaveBase = Math.floor(registerBase / 12) * 12;
            let anchorMidi = registerOctaveBase + targetPitchClass;
            while (anchorMidi < registerBase - 6) {
                anchorMidi += 12;
            }
            while (anchorMidi > registerBase + 6) {
                anchorMidi -= 12;
            }
            // Give arpeggio / hook contours a little more room before we fold the octave.
            const anchorSpan =
                contourType === 'ARPEGGIATE' || contourType === 'HOOK'
                    ? syncBias > 0.75 && !['jazz', 'bird'].includes(style)
                        ? 9
                        : 8
                    : syncBias > 0.75 && !['jazz', 'bird'].includes(style)
                      ? 7
                      : 6;
            if (Math.abs(anchorMidi - lastMidi) > anchorSpan) {
                if (anchorMidi > lastMidi) {
                    anchorMidi -= 12;
                } else {
                    anchorMidi += 12;
                }
            }
            anchorMidi = Math.max(
                registerProfile.seedFloor,
                Math.min(registerProfile.seedCeiling, anchorMidi),
            );

            // Find the last active note in the motif to apply resolution biases
            const lastActiveMotifNote = activeMotif.filter((n) => !n.isRest).pop();
            const isLastMeasureOfSection = m >= sectionEndMeasure - 2;
            const isArpeggioContour = contourType === 'ARPEGGIATE';
            const isHookContour = contourType === 'HOOK';

            /** @type {any} */
            let prevNoteChord = null;
            /** @type {number[]} */
            let prevScalePitches = [];
            /** @type {number | null} */
            let previousMotifDegree = null;

            activeMotif.forEach((motifNote) => {
                if (motifNote.isRest) {
                    return;
                }

                const exactStep = baseStep + Math.round(motifNote.beatOffset * stepsPerBeat);

                // Wrap the step for the chord lookup so pick-ups to measure 0 look at the end of the song
                let lookupStep = exactStep;
                if (lookupStep < 0) {
                    lookupStep = actualTotalSteps + lookupStep;
                }
                if (lookupStep >= actualTotalSteps) {
                    lookupStep = lookupStep % actualTotalSteps;
                }

                // Don't bleed into next section unless it's a pickup
                if (exactStep >= sectionRange.end && !motifNote.isPickup) {
                    return;
                }

                const stepEntry = binarySearchMap(stepMap, lookupStep);
                if (!stepEntry?.chord) {
                    return;
                }

                /** @type {any} */
                const currentChord = stepEntry.chord;
                const scale = getScaleForChord(state, currentChord, null, style);
                const currentScalePitches = scale.map((ivl) => (currentChord.rootMidi + ivl) % 12);
                const chordIntervals = currentChord.intervals || [0, 4, 7];

                // Map scale degree offset to an actual interval
                const scaleLen = scale.length;
                let degree = motifNote.scaleDegreeOffset;

                // --- Catchy Harmonic Resolution Bias ---
                const isFinalNoteOfSection =
                    motifNote === lastActiveMotifNote && isLastMeasureOfSection;
                const isConclusion =
                    category === 'outro' || (_isLastSectionOfForm && isLastMeasureOfSection);

                if (isFinalNoteOfSection) {
                    if (isConclusion) {
                        const conclusiveDegrees = buildCadenceDegreePool(scale, chordIntervals, {
                            preferConclusive: true,
                        });
                        if (conclusiveDegrees.length > 0) {
                            degree =
                                conclusiveDegrees[Math.floor(prng() * conclusiveDegrees.length)];
                        }
                    } else if (!isDeparture && !isJazzStyle) {
                        // Statement endings can still leave a question in the air, but they should
                        // do it with soft color or chord tones rather than a harsh landing.
                        const statementDegrees = buildCadenceDegreePool(scale, chordIntervals, {
                            preferStable: true,
                        });
                        if (statementDegrees.length > 0) {
                            degree = statementDegrees[Math.floor(prng() * statementDegrees.length)];
                        }
                    }
                }

                const octaveShift = Math.floor(degree / scaleLen) * 12;
                const modDegree = ((degree % scaleLen) + scaleLen) % scaleLen;

                const intervalFromRoot = scale[modDegree];
                const pitchClass = (currentChord.rootMidi + intervalFromRoot) % 12;

                // Pivot Check: Is this chord different from the one we played the last note over?
                const isPivotStep = prevNoteChord && currentChord !== prevNoteChord;

                // --- NEW: Voice-Leading Scoring Logic ---
                // If the chord has just changed, or we're in Loop 0, try to find a note in the scale
                // that is a "Common Tone" or "Guide Tone" and is close to lastMidi.
                let bestMidi = registerOctaveBase + pitchClass + octaveShift;
                let minScore = 999;
                const expectedDirection =
                    previousMotifDegree === null
                        ? 0
                        : Math.sign(motifNote.scaleDegreeOffset - previousMotifDegree);

                // Search all scale degrees for the "best" melodic path
                for (let d = 0; d < scaleLen; d++) {
                    const testInterval = scale[d];
                    const testPC = (currentChord.rootMidi + testInterval) % 12;

                    // Possible Octaves
                    for (const oShift of [-12, 0, 12]) {
                        const testMidi = registerOctaveBase + testPC + oShift;
                        const distToLast = Math.abs(testMidi - lastMidi);
                        const distToAnchor = Math.abs(testMidi - anchorMidi);

                        // Scoring components
                        const contourFreedom = syncBias > 0.75 && !['jazz', 'bird'].includes(style);
                        const jumpWeight = contourFreedom
                            ? isArpeggioContour
                                ? 0.75
                                : isHookContour
                                  ? 0.9
                                  : 1.15
                            : isArpeggioContour
                              ? 0.85
                              : isHookContour
                                ? 1.0
                                : 1.35;
                        const jumpPenalty = distToLast * jumpWeight;
                        const anchorPenalty =
                            distToAnchor *
                            (contourFreedom
                                ? 0.18
                                : isArpeggioContour || isHookContour
                                  ? 0.22
                                  : 0.3);

                        // Motif adherence: How far is this degree from the intended motif degree?
                        const degreeDist = Math.abs(d - modDegree);
                        const motifWeight = isStationaryMotif
                            ? 1.5
                            : contourFreedom
                              ? isArpeggioContour
                                  ? 1.9
                                  : isHookContour
                                    ? 2.3
                                    : 3.0
                              : isArpeggioContour
                                ? 2.1
                                : isHookContour
                                  ? 2.6
                                  : 3.6;
                        const motifPenalty = degreeDist * motifWeight;
                        const wrongWayPenalty = contourFreedom
                            ? isArpeggioContour
                                ? 2
                                : isHookContour
                                  ? 3
                                  : 5
                            : isArpeggioContour
                              ? 3
                              : isHookContour
                                ? 4
                                : 6;
                        const directionPenalty =
                            expectedDirection === 0
                                ? 0
                                : expectedDirection > 0
                                  ? testMidi <= lastMidi
                                      ? wrongWayPenalty
                                      : 0
                                  : testMidi >= lastMidi
                                    ? wrongWayPenalty
                                    : 0;
                        const motionPenalty =
                            expectedDirection !== 0 && testMidi === lastMidi
                                ? isHookContour
                                    ? 3
                                    : 7
                                : 0;

                        // Guide Tone Bonus (3rd or 7th)
                        const isGuideTone =
                            testInterval === 3 ||
                            testInterval === 4 ||
                            testInterval === 10 ||
                            testInterval === 11;
                        const guideBonus = isGuideTone ? -2 : 0;

                        // Pivot Bonus: Favor "Fresh" notes that weren't in the previous scale
                        // This helps highlight key changes (modulations).
                        const isFreshNote = isPivotStep && !prevScalePitches.includes(testPC);
                        const pivotBonus = isFreshNote ? -3 : 0;
                        const chordToneBonus =
                            (isArpeggioContour ||
                                (isHookContour && motifNote.beatOffset % 1 === 0)) &&
                            chordIntervals.includes(testInterval)
                                ? -2.5
                                : 0;
                        const arpeggioMotionBonus =
                            isArpeggioContour && distToLast >= 3 && distToLast <= 7 ? -1.5 : 0;
                        const hookMotionBonus = isHookContour && distToLast <= 5 ? -1.0 : 0;

                        const floorPenalty =
                            testMidi < registerProfile.seedFloor
                                ? (registerProfile.seedFloor - testMidi) * 2.5
                                : 0;
                        const ceilingPenalty =
                            testMidi > registerProfile.seedCeiling
                                ? (testMidi - registerProfile.seedCeiling) * 2.0
                                : 0;

                        const totalScore =
                            jumpPenalty +
                            anchorPenalty +
                            motifPenalty +
                            directionPenalty +
                            motionPenalty +
                            guideBonus +
                            pivotBonus +
                            chordToneBonus +
                            arpeggioMotionBonus +
                            hookMotionBonus +
                            floorPenalty +
                            ceilingPenalty;

                        if (totalScore < minScore) {
                            minScore = totalScore;
                            bestMidi = testMidi;
                        }
                    }
                }

                const midi = bestMidi;
                lastMidi = midi;
                previousMotifDegree = motifNote.scaleDegreeOffset;
                prevNoteChord = currentChord;
                prevScalePitches = currentScalePitches;

                // Adjust duration if it overlaps with the next section or end of song
                let duration = Math.round(motifNote.duration);
                if (exactStep + duration > actualTotalSteps) {
                    duration = actualTotalSteps - exactStep;
                }

                // Prevent multiple notes from stacking exactly on the same step (causes polyphony/choking bugs)
                const existingIdx = notes.findIndex((n) => n.step === exactStep);
                if (existingIdx !== -1) {
                    // Override the existing note if it's not an anchor, or just skip
                    if (motifNote.beatOffset === 0) {
                        notes[existingIdx] = {
                            step: exactStep,
                            midi: midi,
                            isAnchor: true,
                            durationSteps: duration,
                            velocity: 0.9,
                        };
                    }
                } else {
                    notes.push({
                        step: exactStep,
                        midi: midi,
                        isAnchor: motifNote.beatOffset === 0,
                        durationSteps: duration,
                        velocity: motifNote.beatOffset === 0 ? 0.9 : 0.75,
                    });
                }
            });
        }
    });

    // --- Improvisational Pass (Post-Processing) ---
    // Apply musical flair to the generated head to break up monotony
    // and make the melody sound more intentional and vocal.
    /** @type {SeedNote[]} */
    const processedNotes = [];
    const postSyncBias =
        /** @type {any} */ (STYLE_CONFIG[style] || STYLE_CONFIG.scalar).syncopationLikelihood ||
        0.2;
    const flairProb = Math.min(0.55, 0.22 + postSyncBias * 0.28);
    const subdivisionProb = Math.max(0, postSyncBias - 0.45);

    for (let i = 0; i < notes.length; i++) {
        const currentNote = notes[i];
        const nextNote = notes[i + 1];

        // We only apply flair probabilistically
        if (prng() < flairProb) {
            let mutationApplied = false;
            const r = prng();

            // Device 1: Syllable Splits (Repeated Notes)
            // Break up long sustained notes into two notes of the same pitch
            if (!mutationApplied && currentNote.durationSteps >= stepsPerBeat * 2) {
                if (r < 0.4) {
                    // Split a long note into a dotted-quarter and an eighth (or similar based on meter)
                    const splitPoint = stepsPerBeat * 1.5;
                    const firstDuration = splitPoint;
                    const secondDuration = currentNote.durationSteps - splitPoint;

                    if (secondDuration >= stepsPerBeat * 0.5) {
                        processedNotes.push({
                            ...currentNote,
                            durationSteps: firstDuration,
                        });
                        processedNotes.push({
                            ...currentNote,
                            step: currentNote.step + firstDuration,
                            durationSteps: secondDuration,
                            isAnchor: false,
                        });
                        mutationApplied = true;
                    }
                } else if (r < 0.7) {
                    // Split equally
                    const halfDuration = Math.floor(currentNote.durationSteps / 2);
                    if (halfDuration >= stepsPerBeat * 0.5) {
                        processedNotes.push({
                            ...currentNote,
                            durationSteps: halfDuration,
                        });
                        processedNotes.push({
                            ...currentNote,
                            step: currentNote.step + halfDuration,
                            durationSteps: currentNote.durationSteps - halfDuration,
                            isAnchor: false,
                        });
                        mutationApplied = true;
                    }
                }
            }

            // Device 1b: Split selected one-beat attacks into two lighter syllables.
            // This keeps high-sync heads from defaulting to too many square quarter-note attacks.
            if (
                !mutationApplied &&
                subdivisionProb > 0 &&
                currentNote.durationSteps === stepsPerBeat &&
                stepsPerBeat >= 2
            ) {
                const nextStep = nextNote
                    ? nextNote.step
                    : currentNote.step + currentNote.durationSteps + stepsPerBeat;
                const hasRoomToSplit = nextStep >= currentNote.step + currentNote.durationSteps;
                const splitChance = currentNote.isAnchor
                    ? subdivisionProb * 0.35
                    : subdivisionProb * 0.75;

                if (hasRoomToSplit && prng() < splitChance) {
                    const splitPoint = stepsPerBeat / 2;
                    processedNotes.push({
                        ...currentNote,
                        durationSteps: splitPoint,
                    });
                    processedNotes.push({
                        ...currentNote,
                        step: currentNote.step + splitPoint,
                        durationSteps: currentNote.durationSteps - splitPoint,
                        velocity: Math.max(0.55, (currentNote.velocity || 0.75) - 0.08),
                        isAnchor: false,
                    });
                    mutationApplied = true;
                }
            }

            // Device 2: Syncopated Anticipations (Pushes)
            // If the note lands squarely on a beat, push it early by half a beat and tie it
            if (!mutationApplied && currentNote.step % stepsPerBeat === 0) {
                // Only push if there's room before this note (i.e. it doesn't overlap the previous note)
                const prevNote = processedNotes[processedNotes.length - 1];
                const shiftAmount = stepsPerBeat * 0.5; // eighth note push

                const canPush =
                    !prevNote ||
                    prevNote.step + prevNote.durationSteps <= currentNote.step - shiftAmount;

                if (canPush && currentNote.durationSteps >= stepsPerBeat) {
                    processedNotes.push({
                        ...currentNote,
                        step: currentNote.step - shiftAmount,
                        durationSteps: currentNote.durationSteps + shiftAmount,
                    });
                    mutationApplied = true;
                }
            }

            // Device 3: Neighbor/Passing Tones (Motion)
            // If this pitch is the same as the next pitch, move this one to create motion
            if (!mutationApplied && nextNote && currentNote.midi === nextNote.midi) {
                // Find scale for the current step to select a diatonic neighbor
                let lookupStep = currentNote.step;
                if (lookupStep < 0) {
                    lookupStep = actualTotalSteps + lookupStep;
                }
                if (lookupStep >= actualTotalSteps) {
                    lookupStep = lookupStep % actualTotalSteps;
                }

                const stepEntry = binarySearchMap(stepMap, lookupStep);
                if (stepEntry?.chord) {
                    const scale = getScaleForChord(state, stepEntry.chord, null, style);
                    const scaleLen = scale.length;

                    // Find the current note's scale degree
                    let currentDegreeIndex = -1;
                    const targetPC = currentNote.midi % 12;
                    for (let d = 0; d < scaleLen; d++) {
                        const testPC = (stepEntry.chord.rootMidi + scale[d]) % 12;
                        if (testPC === targetPC) {
                            currentDegreeIndex = d;
                            break;
                        }
                    }

                    if (currentDegreeIndex !== -1) {
                        // Move up or down one scale step
                        const shiftDir = prng() > 0.5 ? 1 : -1;
                        const newDegreeIndex =
                            (((currentDegreeIndex + shiftDir) % scaleLen) + scaleLen) % scaleLen;

                        // Calculate octave adjustment
                        let octaveShift = 0;
                        if (currentDegreeIndex + shiftDir >= scaleLen) {
                            octaveShift = 12;
                        }
                        if (currentDegreeIndex + shiftDir < 0) {
                            octaveShift = -12;
                        }

                        const newPC = (stepEntry.chord.rootMidi + scale[newDegreeIndex]) % 12;
                        const baseOctave = Math.floor(currentNote.midi / 12) * 12;

                        let newMidi = baseOctave + newPC + octaveShift;

                        // Ensure we don't jump too far
                        if (Math.abs(newMidi - currentNote.midi) > 6) {
                            if (newMidi > currentNote.midi) {
                                newMidi -= 12;
                            } else {
                                newMidi += 12;
                            }
                        }

                        processedNotes.push({
                            ...currentNote,
                            midi: newMidi,
                        });
                        mutationApplied = true;
                    }
                }
            }

            if (!mutationApplied) {
                processedNotes.push(currentNote);
            }
        } else {
            processedNotes.push(currentNote);
        }
    }

    // Reinforce sparse late-entry statement bars with a lead-in attack so
    // non-jazz heads speak earlier in the measure instead of waiting until beat 4.
    if (!['jazz', 'bird', 'bossa'].includes(style)) {
        /** @type {SeedNote[]} */
        const reinforcedNotes = [];
        const sortedSeedNotes = [...processedNotes].sort((a, b) => a.step - b.step);

        for (let i = 0; i < sortedSeedNotes.length; i++) {
            const note = sortedSeedNotes[i];
            const measureStart =
                Math.floor(Math.max(0, note.step) / stepsPerMeasure) * stepsPerMeasure;
            const measureEnd = measureStart + stepsPerMeasure;
            const measureNotes = sortedSeedNotes.filter(
                (candidate) => candidate.step >= measureStart && candidate.step < measureEnd,
            );
            const isLateSingleAttack =
                note.step >= measureStart + stepsPerBeat * 2 &&
                measureNotes.length === 1 &&
                note.durationSteps >= stepsPerBeat;

            if (isLateSingleAttack) {
                const pickupStep = note.step - stepsPerBeat;
                const pickupDuration = note.step - pickupStep;
                const hasLeadInSpace =
                    pickupStep >= measureStart &&
                    pickupDuration >= stepsPerBeat / 2 &&
                    !sortedSeedNotes.some(
                        (candidate) =>
                            candidate !== note &&
                            candidate.step >= pickupStep &&
                            candidate.step < note.step,
                    );

                if (hasLeadInSpace) {
                    reinforcedNotes.push({
                        ...note,
                        step: pickupStep,
                        durationSteps: pickupDuration,
                        velocity: Math.min(note.velocity, 0.75),
                        isAnchor: false,
                    });
                }
            }

            reinforcedNotes.push(note);
        }

        processedNotes.length = 0;
        processedNotes.push(...reinforcedNotes);
    }

    // Sort the processed notes by step just in case our pushes or reinforcements messed up the order
    const polishedNotes = polishCadenceLandings(
        processedNotes,
        stepMap,
        sectionMap,
        actualTotalSteps,
        stepsPerMeasure,
        style,
    );
    polishedNotes.sort((/** @type {SeedNote} */ a, /** @type {SeedNote} */ b) => a.step - b.step);

    console.log(`[Seeder Debug] Finished generation. Total seed notes: ${polishedNotes.length}.`);
    return { notes: polishedNotes, loopLengthSteps: actualTotalSteps };
}
