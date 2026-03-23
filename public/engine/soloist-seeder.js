import { TIME_SIGNATURES } from '../config.js';
import { binarySearchMap, createPRNG, generateRandomSeed, isSectionTurnaround } from '../utils.js';
import { unrollArrangement } from './arranger-utils.js';
import { STYLE_CONFIG } from './soloist-config.js';
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
 * Generates a song-wide seed melody for the soloist.
 * @param {import('../types.js').EnsembleState} state
 * @param {import('../state/arranger.js').ArrangerState} arranger
 * @param {string} style
 * @param {number} [_intensity]
 * @param {string} [seedStr]
 * @returns {{ notes: SeedNote[], loopLengthSteps: number }}
 */
export function generateSessionSeed(state, arranger, style, _intensity, seedStr) {
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

        // Generalize labels
        let category = 'verse';
        if (label.includes('intro')) {
            category = 'intro';
        } else if (label.includes('chorus') || label.includes('drop')) {
            category = 'chorus';
        } else if (label.includes('outro') || label.includes('end')) {
            category = 'outro';
        } else if (style === 'jazz' || style === 'bird' || style === 'bossa') {
            category = 'jazz';
        } else {
            // Keep generic label like "a", "b", "verse" if standard to allow them to map to themselves
            category = label.replace(/[^a-z]/g, '');
            if (!category) {
                category = 'main';
            }
        }

        const sectionStartMeasure = Math.floor(sectionRange.start / stepsPerMeasure);
        const sectionEndMeasure = Math.ceil(sectionRange.end / stepsPerMeasure);

        console.log(
            `[Seeder Debug] Section ${label}: start measure ${sectionStartMeasure}, end measure ${sectionEndMeasure}. Applying motif.`,
        );

        const isDeparture =
            category === 'chorus' ||
            category === 'bridge' ||
            category === 'b' ||
            category === 'prechorus';

        // Track iterations to apply restatement mutations
        const iteration = sectionIterationCount.get(category) || 0;
        sectionIterationCount.set(category, iteration + 1);

        const config = /** @type {any} */ (STYLE_CONFIG)[style] || STYLE_CONFIG.scalar;
        const rhythmicDensity = config.rhythmicDensity || 0.5;

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
                if (beatsPerCell === 3) {
                    pool = RH_CELLS.WALTZ;
                } else if (density > 0.7 || dense || prng() < 0.3) {
                    pool = [...RH_CELLS.BASIC, ...RH_CELLS.SYNC];
                }

                const selectedPattern = pool[Math.floor(prng() * pool.length)];
                const restProb = 1.0 - density;

                selectedPattern.forEach((beatOffset, idx) => {
                    // Sparse mode drops non-anchors
                    if (sparse && idx % 2 !== 0 && prng() < 0.6) {
                        return;
                    }

                    // General rest probability (significantly reduced since dictionary cells are already musical)
                    if (!dense && prng() < restProb * 0.15) {
                        return;
                    }

                    const nextOffset = selectedPattern[idx + 1] || beatsPerCell;
                    let dur = (nextOffset - beatOffset) * stepsPerBeat;

                    // Add some length variety to basic patterns
                    if (!dense && dur === stepsPerBeat && prng() < 0.2) {
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
            const stationaryProb = config.stationaryProb || 0.05;
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
            const contourType = ['ASCEND', 'DESCEND', 'ARCH', 'VALLEY', 'STATIC'][
                Math.floor(prng() * 5)
            ];
            console.log(`[Composer] Assigned contour: ${contourType} to category: ${category}`);

            // 1. Generate the initial A cell
            const cellA = generateCell(forceSparse, forceDense, rhythmicDensity);

            // Generate secondary cells for longer phrases
            const cellB = generateCell(forceSparse, forceDense, rhythmicDensity);
            const cellC = generateCell(forceSparse, forceDense, rhythmicDensity);

            // Determine motif structure based on phrase length
            const structureRoll = prng();
            let structureType = 'A-B'; // fallback

            if (phraseLength === 4) {
                if (structureRoll < 0.25) {
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
                if (structureRoll < 0.5) {
                    structureType = 'A-A';
                } else if (structureRoll < 0.7 && ['jazz', 'bird', 'bossa'].includes(style)) {
                    structureType = 'A-Rest';
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

                    // Imperfect Symmetry: Even if A-A, let repeated measures drift slightly
                    if (measure > 0 && cellType === 'A' && prng() < 0.3) {
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
                            if (Math.abs(lastMotion) >= 3) {
                                motion = lastMotion > 0 ? -1 : 1; // Step in opposite direction
                            } else {
                                // Normal motion logic
                                if (r < 0.6) {
                                    motion = prng() < upProb ? 1 : -1; // Step
                                } else if (r < 0.8) {
                                    motion = prng() < upProb ? 2 : -2; // Skip
                                } else if (r < 0.9) {
                                    motion = 0; // Repeat
                                } else {
                                    motion = prng() < upProb ? 3 : -3; // Leap
                                }
                            }

                            // Magnetic Center: Pull back towards 0 if we drift too far
                            // This ensures contour doesn't drift too high or low
                            if (currentDegreeOffset > 5 && motion > 0) {
                                motion = prng() > 0.5 ? -1 : -2;
                            }
                            if (currentDegreeOffset < -5 && motion < 0) {
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

        let { motif, phraseLength, isStationaryMotif } = sectionMotifs.get(category) || {
            motif: [],
            phraseLength: 2,
            isStationaryMotif: false,
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
                // Stationary Transformation: Collapse all pitches to a single anchor tone (Root/5th)
                // This creates "tension hooks" during restatements
                motif.forEach((n) => {
                    n.scaleDegreeOffset = 0;
                });
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
        let registerBase = 60; // Middle C
        const intensityVal = _intensity || 0.5;

        if (category === 'chorus') {
            // Chorus boost: 0 or 12. For Jazz/Bossa Head, we stay grounded to keep it singable.
            const isJazzStyle = ['jazz', 'bird', 'bossa'].includes(style);
            const boost = isJazzStyle ? 0 : 12;
            registerBase += intensityVal >= 0.5 ? boost : 0;
        } else if (category === 'intro' || index === 0) {
            // Force lower start for Intros or the very first section
            registerBase = 48;
        } else {
            // Verse/Standard: slight climb based on intensity (still multiples of 12)
            registerBase = intensityVal > 0.7 ? 60 : 48;
        }

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

            if (!entryForMeasure || !entryForMeasure.chord) {
                continue;
            }
            /** @type {any} */
            const targetChord = entryForMeasure.chord;
            const chordTones = targetChord.intervals || [0, 4, 7]; // Fallback to triad if not parsed
            const targetInterval = chordTones[Math.floor(prng() * chordTones.length)]; // Root, 3rd, 5th, etc.
            const targetPitchClass = (targetChord.rootMidi + targetInterval) % 12;

            let anchorMidi = registerBase + targetPitchClass;
            // Octave anchoring: Keep Head melody centered within a tighter +/- 6 semitone range
            // to avoid shrill jumps at low intensity.
            if (Math.abs(anchorMidi - lastMidi) > 6) {
                if (anchorMidi > lastMidi) {
                    anchorMidi -= 12;
                } else {
                    anchorMidi += 12;
                }
            }

            // Find the last active note in the motif to apply resolution biases
            const lastActiveMotifNote = activeMotif.filter((n) => !n.isRest).pop();
            const isLastMeasureOfSection = m >= sectionEndMeasure - 2;

            /** @type {any} */
            let prevNoteChord = null;
            /** @type {number[]} */
            let prevScalePitches = [];

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
                if (!stepEntry || !stepEntry.chord) {
                    return;
                }

                /** @type {any} */
                const currentChord = stepEntry.chord;
                const scale = getScaleForChord(state, currentChord, null, style);
                const currentScalePitches = scale.map((ivl) => (currentChord.rootMidi + ivl) % 12);

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
                        // Conclusion: Resolve to Root (0) or 3rd (2)
                        degree = prng() > 0.3 ? 0 : 2;
                    } else if (!isDeparture) {
                        // Statement: Chance to end on "Tense" degrees (2nd, 5th, 7th) to ask a question
                        if (prng() > 0.5) {
                            const tenseDegrees = [1, 4, 6]; // 2nd, 5th, 7th
                            degree = tenseDegrees[Math.floor(prng() * tenseDegrees.length)];
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
                let bestMidi = registerBase + pitchClass + octaveShift;
                let minScore = 999;

                // Search all scale degrees for the "best" melodic path
                for (let d = 0; d < scaleLen; d++) {
                    const testInterval = scale[d];
                    const testPC = (currentChord.rootMidi + testInterval) % 12;

                    // Possible Octaves
                    for (const oShift of [-12, 0, 12]) {
                        const testMidi = registerBase + testPC + oShift;
                        const distToLast = Math.abs(testMidi - lastMidi);
                        const distToAnchor = Math.abs(testMidi - anchorMidi);

                        // Scoring components
                        const jumpPenalty = distToLast * 1.5; // High penalty for large jumps
                        const anchorPenalty = distToAnchor * 0.3; // Slight pull to anchor

                        // Motif adherence: How far is this degree from the intended motif degree?
                        const degreeDist = Math.abs(d - modDegree);
                        const motifPenalty = degreeDist * 2.0;

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

                        // Singable Register Penalty: Penalize notes above MIDI 76 (E5)
                        // to avoid "neck creep" or shrillness in the Head.
                        const ceilingPenalty = testMidi > 76 ? (testMidi - 76) * 2.0 : 0;

                        const totalScore =
                            jumpPenalty +
                            anchorPenalty +
                            motifPenalty +
                            guideBonus +
                            pivotBonus +
                            ceilingPenalty;

                        if (totalScore < minScore) {
                            minScore = totalScore;
                            bestMidi = testMidi;
                        }
                    }
                }

                const midi = bestMidi;
                lastMidi = midi;
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

    console.log(`[Seeder Debug] Finished generation. Total seed notes: ${notes.length}.`);
    return { notes, loopLengthSteps: actualTotalSteps };
}
