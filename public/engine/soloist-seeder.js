import { TIME_SIGNATURES } from '../config.js';
import { createPRNG, generateRandomSeed } from '../utils.js';
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
    /** @type {Map<string, Array<{beatOffset: number, isPickup: boolean, scaleDegreeOffset: number, duration: number, isRest: boolean}>>} */
    const sectionMotifs = new Map();

    // Walk through each section
    console.log(
        `[Seeder Debug] Starting seed generation. Total steps: ${totalSteps}, time signature: ${arranger.timeSignature}`,
    );

    arranger.sectionMap.forEach((sectionRange) => {
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

        // Generate or retrieve the motif for this section category
        // A motif is a 2-measure rhythmic/melodic contour template
        if (!sectionMotifs.has(category)) {
            const motif = [];
            // Generate a 2-measure template
            let currentBeat = 0;
            const totalBeats = tsConfig.beats * 2;
            let currentDegreeOffset = 0; // Relative to a target chord tone

            // Allow for pickups at the very start of the motif (before beat 0)
            if (prng() > 0.5) {
                // Pickup 1 beat before
                motif.push({
                    beatOffset: -1,
                    isPickup: true,
                    scaleDegreeOffset: -1,
                    duration: stepsPerBeat,
                    isRest: false,
                });
                currentBeat = 0;
            }

            while (currentBeat < totalBeats) {
                const isRest = prng() > 0.8;
                let durationBeats = 1;

                if (currentBeat % tsConfig.beats === 0) {
                    // Downbeat
                    durationBeats = prng() > 0.5 ? 2 : 1;
                } else {
                    durationBeats = prng() > 0.7 ? 0.5 : 1; // Sometimes play eighth notes
                }

                // Ensure we don't overflow the 2-measure motif
                if (currentBeat + durationBeats > totalBeats) {
                    durationBeats = totalBeats - currentBeat;
                }

                if (!isRest) {
                    // Decide melodic motion
                    let motion = 0; // 0 = same, 1 = step up, -1 = step down, 2 = leap up, etc.
                    if (motif.length > 0) {
                        const r = prng();
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
                    currentDegreeOffset += motion;

                    motif.push({
                        beatOffset: currentBeat,
                        isPickup: false,
                        scaleDegreeOffset: currentDegreeOffset,
                        duration: durationBeats * stepsPerBeat,
                        isRest: false,
                    });
                } else {
                    motif.push({
                        beatOffset: currentBeat,
                        isPickup: false,
                        scaleDegreeOffset: 0,
                        duration: durationBeats * stepsPerBeat,
                        isRest: true,
                    });
                }

                currentBeat += durationBeats;
            }

            // Adjust the end of the motif to resolve (rest) more often to leave space
            if (motif.length > 0) {
                const lastIdx = motif.length - 1;
                if (!motif[lastIdx].isRest && prng() > 0.3) {
                    motif[lastIdx].isRest = true;
                }
            }

            sectionMotifs.set(category, motif);
        }

        const motif = sectionMotifs.get(category) || [];

        // Apply motif to the section, 2 measures at a time
        let registerBase = 60; // Middle C
        if (category === 'chorus') {
            registerBase += 12;
        } // Octave higher for chorus
        if (category === 'intro') {
            registerBase -= 12;
        }

        let lastMidi = registerBase;

        for (let m = sectionStartMeasure; m < sectionEndMeasure; m += 2) {
            const baseStep = m * stepsPerMeasure;

            // Pick a target chord tone for the downbeat of these 2 measures
            const entryForMeasure = arranger.stepMap[Math.min(baseStep, totalSteps - 1)];
            if (!entryForMeasure || !entryForMeasure.chord) {
                continue;
            }
            /** @type {any} */
            const targetChord = entryForMeasure.chord;
            const chordTones = targetChord.intervals; // e.g., [0, 4, 7]
            const targetInterval = chordTones[Math.floor(prng() * chordTones.length)]; // Root, 3rd, 5th, etc.
            const targetPitchClass = (targetChord.rootMidi + targetInterval) % 12;

            let anchorMidi = registerBase + targetPitchClass;
            // Octave anchoring to keep it reasonable
            if (Math.abs(anchorMidi - lastMidi) > 9) {
                if (anchorMidi > lastMidi) {
                    anchorMidi -= 12;
                } else {
                    anchorMidi += 12;
                }
            }

            motif.forEach((motifNote) => {
                if (motifNote.isRest) {
                    return;
                }

                const exactStep = baseStep + Math.round(motifNote.beatOffset * stepsPerBeat);

                // Skip if out of bounds (e.g., negative step at start of song, or past end)
                if (exactStep < 0 || exactStep >= totalSteps) {
                    return;
                }

                // Don't bleed into next section unless it's a pickup
                if (exactStep >= sectionRange.end && !motifNote.isPickup) {
                    return;
                }

                const stepEntry = arranger.stepMap[exactStep];
                if (!stepEntry || !stepEntry.chord) {
                    return;
                }

                /** @type {any} */
                const currentChord = stepEntry.chord;
                const scale = getScaleForChord(state, currentChord, null, style);

                // Map scale degree offset to an actual interval
                const scaleLen = scale.length;
                const degree = motifNote.scaleDegreeOffset;
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
