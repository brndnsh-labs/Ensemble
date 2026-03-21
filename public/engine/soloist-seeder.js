import { TIME_SIGNATURES } from '../config.js';
import { binarySearchMap, createPRNG, generateRandomSeed } from '../utils.js';
import { STYLE_CONFIG } from './soloist-config.js';
import { getScaleForChord } from './theory-scales.js';

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
    if (!arranger.stepMap || arranger.stepMap.length === 0) {
        return { notes: [], loopLengthSteps: 0 };
    }

    const prng = createPRNG(seedStr || generateRandomSeed());

    const tsConfig =
        /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;

    // We use the last step map entry to dynamically get total steps
    const totalSteps = arranger.totalSteps || arranger.stepMap.at(-1)?.end || 0;

    /** @type {SeedNote[]} */
    const notes = [];

    if (!arranger.sectionMap || arranger.sectionMap.length === 0) {
        return { notes: [], loopLengthSteps: totalSteps };
    }

    // To ensure repetition across identical sections (e.g. AABA form),
    // we'll memorize the target note sequence for each section label.
    // For even more musicality, we'll store the 'motif' of steps and intervals relative to chords.
    /** @type {Map<string, { motif: Array<{beatOffset: number, isPickup: boolean, scaleDegreeOffset: number, duration: number, isRest: boolean}>, metrics: { density: number, syncopationRatio: number }, isStationaryMotif: boolean }>} */
    const sectionMotifs = new Map();

    /** @type {Map<string, number>} */
    const sectionIterationCount = new Map();

    // Find macro turnaround index
    let turnaroundIndex = arranger.sectionMap.length - 1;
    if (arranger.sectionMap.length > 2) {
        // e.g., A A B A -> the final A is the turnaround
        // Check if the last section matches a primary section
        const lastSectionLabel = (
            arranger.sectionMap[arranger.sectionMap.length - 1].label || ''
        ).toLowerCase();
        const primaryMatch = arranger.sectionMap.find(
            (s) => (s.label || '').toLowerCase() === lastSectionLabel,
        );
        if (primaryMatch && primaryMatch !== arranger.sectionMap[arranger.sectionMap.length - 1]) {
            // It repeats! The last one is indeed the turnaround.
            turnaroundIndex = arranger.sectionMap.length - 1;
        } else {
            // If the last section is something like "Outro", maybe the one before it is the turnaround
            for (let i = arranger.sectionMap.length - 1; i >= 0; i--) {
                const label = (arranger.sectionMap[i].label || '').toLowerCase();
                if (!label.includes('outro') && !label.includes('end')) {
                    turnaroundIndex = i;
                    break;
                }
            }
        }
    }

    // Walk through each section
    console.log(
        `[Seeder Debug] Starting seed generation. Total steps: ${totalSteps}, time signature: ${arranger.timeSignature}`,
    );

    arranger.sectionMap.forEach((sectionRange, index) => {
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
        const sectionEndMeasure = Math.floor(sectionRange.end / stepsPerMeasure);

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

        // Generate or retrieve the motif for this section category
        // A motif is a 2-measure rhythmic/melodic contour template
        if (!sectionMotifs.has(category)) {
            const config = /** @type {any} */ (STYLE_CONFIG)[style] || STYLE_CONFIG.scalar;
            const stationaryProb = config.stationaryProb || 0.05;
            const isStationaryMotif = prng() < stationaryProb;

            // Generate a 2-measure template
            const motif = [];
            let _currentBeat = 0;
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

            // Allow for pickups at the very start of the motif (before beat 0)
            if (!forceSparse && prng() > 0.4) {
                const isShortPickup = prng() > 0.5;
                motif.push({
                    beatOffset: isShortPickup ? -0.5 : -1,
                    isPickup: true,
                    scaleDegreeOffset: prng() > 0.5 ? -1 : 1, // Start slightly below or above target
                    duration: isShortPickup ? stepsPerBeat / 2 : stepsPerBeat,
                    isRest: false,
                });
                _currentBeat = 0;
            }

            // 1. Generate a 1-measure rhythmic cell template
            const rhythmicCell = [];
            let cellBeat = 0;
            const beatsPerCell = tsConfig.beats;

            while (cellBeat < beatsPerCell) {
                let isRest = false;
                if (forceSparse) {
                    isRest = prng() > 0.4;
                } else if (forceDense) {
                    isRest = prng() > 0.9;
                } else {
                    isRest = prng() > 0.85; // 15% chance of rest
                }

                let durationBeats = 1;
                if (forceSparse) {
                    durationBeats = prng() > 0.5 ? 4 : 2;
                } else if (forceDense) {
                    durationBeats = prng() > 0.6 ? 0.5 : 0.25;
                } else {
                    if (cellBeat % tsConfig.beats === 0) {
                        durationBeats = prng() > 0.5 ? 2 : 1;
                    } else {
                        durationBeats = prng() > 0.7 ? 0.5 : 1;
                    }
                }

                if (cellBeat + durationBeats > beatsPerCell) {
                    durationBeats = beatsPerCell - cellBeat;
                }

                rhythmicCell.push({
                    beatOffset: cellBeat,
                    duration: durationBeats * stepsPerBeat,
                    isRest,
                });
                cellBeat += durationBeats;
            }

            // 2. Clone the cell twice to create a 2-measure motif (Rhythmic Mirroring)
            // and apply melodic motion with Leap-and-Fill logic
            currentDegreeOffset = 0;
            let lastMotion = 0;

            for (let measure = 0; measure < 2; measure++) {
                rhythmicCell.forEach((cellNote) => {
                    let isRest = cellNote.isRest;
                    let duration = cellNote.duration;

                    // Imperfect Symmetry: Measure 2 has a chance to drift
                    if (measure === 1 && prng() < 0.3) {
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
                        if (!isStationaryMotif) {
                            const r = prng();
                            // Leap-and-Fill Logic: If we just jumped, must step back
                            if (Math.abs(lastMotion) >= 3) {
                                motion = lastMotion > 0 ? -1 : 1; // Step in opposite direction
                            } else {
                                // Normal motion logic
                                if (r < 0.6) {
                                    motion = prng() > 0.5 ? 1 : -1; // Step
                                } else if (r < 0.8) {
                                    motion = prng() > 0.5 ? 2 : -2; // Skip
                                } else if (r < 0.9) {
                                    motion = 0; // Repeat
                                } else {
                                    motion = prng() > 0.5 ? 3 : -3; // Leap
                                }
                            }

                            // Magnetic Center: Pull back towards 0 if we drift too far
                            if (currentDegreeOffset > 4 && motion > 0) {
                                motion = -1;
                            }
                            if (currentDegreeOffset < -4 && motion < 0) {
                                motion = 1;
                            }
                        }
                        currentDegreeOffset += motion;
                        lastMotion = motion;
                    }

                    motif.push({
                        beatOffset: cellNote.beatOffset + measure * tsConfig.beats,
                        isPickup: false,
                        scaleDegreeOffset: currentDegreeOffset,
                        duration: duration,
                        isRest: isRest,
                    });
                });
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
            const density = attacks / 2; // attacks per measure (2 measure motif)
            const syncopationRatio = attacks > 0 ? syncopatedAttacks / attacks : 0;

            sectionMotifs.set(category, {
                motif,
                metrics: { density, syncopationRatio },
                isStationaryMotif,
            });
        }

        let { motif, isStationaryMotif } = sectionMotifs.get(category) || {
            motif: [],
            isStationaryMotif: false,
        };

        // Motivic Mutation (Restatement)
        if (iteration > 0) {
            // Create a deep copy to mutate
            motif = motif.map((n) => ({ ...n }));

            const r = prng();
            if (r < 0.15) {
                // Rhythmic Displacement: Shift entire motif later by one 8th note
                motif.forEach((n) => {
                    n.beatOffset += 0.5;
                });
            } else if (r < 0.35) {
                // Subdivision: Split one quarter note into two 8ths
                const quarterNotes = motif.filter((n) => n.duration === stepsPerBeat && !n.isRest);
                if (quarterNotes.length > 0) {
                    const target = quarterNotes[Math.floor(prng() * quarterNotes.length)];
                    target.duration = stepsPerBeat / 2;
                    // Insert the second 8th note
                    const newNote = {
                        ...target,
                        beatOffset: target.beatOffset + 0.5,
                        scaleDegreeOffset: target.scaleDegreeOffset + (prng() > 0.5 ? 1 : -1),
                    };
                    const idx = motif.indexOf(target);
                    motif.splice(idx + 1, 0, newNote);
                }
            } else if (r < 0.55) {
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
            } else if (r < 0.8) {
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
            // Chorus boost is now tied to intensity: 0 or 12 semitones
            // We use an octave jump (>= 0.5 intensity) to keep notes in the same scale context
            registerBase += intensityVal >= 0.5 ? 12 : 0;
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

        // Apply motifs in 2-measure blocks across the entire section range
        for (let m = sectionStartMeasure; m < sectionEndMeasure; m += 2) {
            const baseStep = m * stepsPerMeasure;

            // --- Sectional Turnaround Logic (A-A-A-B) ---
            // If this is the last 2 measures of a >= 8 measure section,
            // trigger a unique turnaround motif to break predictability.
            const isTurnaroundMeasures =
                !isStationaryMotif &&
                m >= sectionEndMeasure - 2 &&
                sectionEndMeasure - sectionStartMeasure >= 8;
            /** @type {Array<{beatOffset: number, isPickup: boolean, scaleDegreeOffset: number, duration: number, isRest: boolean}>} */
            let activeMotif = motif;

            if (isTurnaroundMeasures) {
                // Generate a one-off "Departure" motif for the turnaround
                activeMotif = [];
                let turnaroundBeat = 0;
                let tDegree = 0;
                while (turnaroundBeat < tsConfig.beats * 2) {
                    const isRest = prng() > 0.7; // Busier turnaround
                    const duration = prng() > 0.5 ? 1 : 0.5;
                    if (!isRest) {
                        tDegree += prng() > 0.5 ? 1 : -1;
                        activeMotif.push({
                            beatOffset: turnaroundBeat,
                            isPickup: false,
                            scaleDegreeOffset: tDegree,
                            duration: duration * stepsPerBeat,
                            isRest: false,
                        });
                    }
                    turnaroundBeat += duration;
                }
            }

            // Pick a target chord tone for the downbeat of these 2 measures
            const stepToSearch = Math.min(baseStep, totalSteps - 1);
            const entryForMeasure = binarySearchMap(arranger.stepMap, stepToSearch);

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

            activeMotif.forEach((motifNote) => {
                if (motifNote.isRest) {
                    return;
                }

                const exactStep = baseStep + Math.round(motifNote.beatOffset * stepsPerBeat);

                // Wrap the step for the chord lookup so pick-ups to measure 0 look at the end of the song
                let lookupStep = exactStep;
                if (lookupStep < 0) {
                    lookupStep = totalSteps + lookupStep;
                }
                if (lookupStep >= totalSteps) {
                    lookupStep = lookupStep % totalSteps;
                }

                // Don't bleed into next section unless it's a pickup
                if (exactStep >= sectionRange.end && !motifNote.isPickup) {
                    return;
                }

                const stepEntry = binarySearchMap(arranger.stepMap, lookupStep);
                if (!stepEntry || !stepEntry.chord) {
                    return;
                }

                /** @type {any} */
                const currentChord = stepEntry.chord;
                const scale = getScaleForChord(state, currentChord, null, style);

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

                // We want to center the melody around the anchorMidi
                // Calculate the difference between anchor and this note's pitch class
                let midi = registerBase + pitchClass + octaveShift;

                // Octave adjustment to stay near lastMidi for stepwise motion
                let bestMidi = midi;
                let minDistance = Math.abs(midi - lastMidi);
                for (const offset of [-24, -12, 0, 12, 24]) {
                    const testMidi = midi + offset;
                    // Encourage staying near the anchor
                    const distToAnchor = Math.abs(testMidi - anchorMidi);
                    const distToLast = Math.abs(testMidi - lastMidi);
                    // Score = distance to last note + small penalty for distance from anchor
                    const score = distToLast + distToAnchor * 0.2;

                    if (score < minDistance) {
                        minDistance = score;
                        bestMidi = testMidi;
                    }
                }

                midi = bestMidi;
                lastMidi = midi;

                // Adjust duration if it overlaps with the next section or end of song
                let duration = Math.round(motifNote.duration);
                if (exactStep + duration > totalSteps) {
                    duration = totalSteps - exactStep;
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
    return { notes, loopLengthSteps: totalSteps };
}
