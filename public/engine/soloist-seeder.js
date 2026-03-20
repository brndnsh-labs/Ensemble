import { TIME_SIGNATURES } from '../config.js';

/**
 * Soloist Seeder Module
 * Generates a "Dynamic Head" (Seed Melody) for the entire arrangement using a Hierarchical Composition Engine.
 */

/**
 * @typedef {Object} SeedNote
 * @property {number} step - Global step target within the loop.
 * @property {number} midi - MIDI note value.
 * @property {boolean} isAnchor - True if it's a structural anchor.
 * @property {number} durationSteps - Suggested duration in steps.
 */

/**
 * Returns a primary chord tone (1, 3, 5, 7) for a given chord object
 * @param {any} chord
 * @param {number} rootMidi
 * @param {number} beatIndex
 * @returns {number}
 */
function getPrimaryChordTone(chord, rootMidi, beatIndex) {
    const primaryIntervals = [0, 4, 7];
    // Add 7th if present
    if (chord.intervals.includes(10)) {
        primaryIntervals.push(10); // m7 / dom7
    }
    if (chord.intervals.includes(11)) {
        primaryIntervals.push(11); // maj7
    }

    // Check if the 3rd is minor
    if (chord.intervals.includes(3)) {
        primaryIntervals[1] = 3;
    }

    // Pick a tone based on the beat index to give some melodic shape
    const interval = primaryIntervals[beatIndex % primaryIntervals.length];
    return rootMidi + interval;
}

/**
 * Generates a song-wide seed melody for the soloist.
 * @param {import('../types.js').EnsembleState} _state
 * @param {import('../state/arranger.js').ArrangerState} arranger
 * @param {string} _style
 * @param {number} [_intensity]
 * @param {string} [_seedStr]
 * @returns {{ notes: SeedNote[], loopLengthSteps: number }}
 */
export function generateSessionSeed(_state, arranger, _style, _intensity, _seedStr) {
    if (!arranger.stepMap || arranger.stepMap.length === 0) {
        return { notes: [], loopLengthSteps: 0 };
    }

    const timeSig = arranger.timeSignature || '4/4';
    const sigConfig = /** @type {any} */ (TIME_SIGNATURES)[timeSig] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = sigConfig.stepsPerBeat || 4;
    const beatsPerMeasure = sigConfig.beats || 4;
    const stepsPerMeasure = stepsPerBeat * beatsPerMeasure;

    const totalSteps = arranger.totalSteps || arranger.stepMap.length;

    /** @type {SeedNote[]} */
    const notes = [];

    // Form Analysis & Contour Mapping
    const sections =
        arranger.sectionMap && arranger.sectionMap.length > 0
            ? arranger.sectionMap
            : [{ id: 'main', start: 0, end: totalSteps, label: 'Main' }];

    // Thematic memory
    const generatedContours = new Map();
    const _nextContourId = 0;

    sections.forEach((sectionRange) => {
        const label = (sectionRange.label || 'Main').toLowerCase();

        let contourGroup = 'A'; // Default contour
        if (label.match(/b|chorus|bridge|drop/i)) {
            contourGroup = 'B';
        } else if (label.match(/a|verse|main/i)) {
            contourGroup = 'A';
        } else if (label.match(/c|solo|outro|end/i)) {
            contourGroup = 'C';
        }

        const sectionSteps = sectionRange.end - sectionRange.start;
        const _sectionMeasures = Math.floor(sectionSteps / stepsPerMeasure);

        if (generatedContours.has(contourGroup)) {
            // Clone and shift
            const templateSection = generatedContours.get(contourGroup);
            const templateNotes = templateSection.notes;
            const stepShift = sectionRange.start - templateSection.start;

            /** @type {SeedNote[]} */
            const clonedNotes = [];

            templateNotes.forEach((/** @type {SeedNote} */ tn) => {
                const newStep = tn.step + stepShift;
                if (newStep >= sectionRange.end || newStep >= totalSteps) {
                    return;
                }

                // Turnaround divergence check (last 2 measures)
                const isTurnaround = newStep >= sectionRange.end - stepsPerMeasure * 2;
                let midi = tn.midi;

                const currentEntry = arranger.stepMap[newStep];
                const currentChord = /** @type {any} */ (currentEntry?.chord);
                const templateEntry = arranger.stepMap[tn.step];
                const templateChord = /** @type {any} */ (templateEntry?.chord);

                if (
                    isTurnaround &&
                    currentChord &&
                    templateChord &&
                    currentChord.value !== templateChord.value
                ) {
                    // Divergence: snap to new chord tone
                    const measureStep = newStep % stepsPerMeasure;
                    const isStrongBeat = measureStep % stepsPerBeat === 0;
                    if (isStrongBeat) {
                        const beatIndex = Math.floor(measureStep / stepsPerBeat);
                        // Use base octave of original note, but force to primary chord tone
                        const octave = Math.floor(midi / 12) * 12;
                        const root = currentChord.rootMidi % 12;
                        midi = getPrimaryChordTone(currentChord, octave + root, beatIndex);
                    }
                }

                clonedNotes.push({
                    step: newStep,
                    midi: midi,
                    isAnchor: tn.isAnchor,
                    durationSteps: tn.durationSteps,
                });
            });
            notes.push(...clonedNotes);
        } else {
            // Generate new thematic contour block
            /** @type {SeedNote[]} */
            const blockNotes = [];
            let currentStep = sectionRange.start;

            // Register Offset based on contour
            const registerOffset = contourGroup === 'B' ? 12 : 0;
            const baseOctave = 60 + registerOffset;

            // Generate phrases in 4-measure blocks (Antecedent & Consequent)
            while (currentStep < sectionRange.end) {
                const blockEnd = Math.min(currentStep + stepsPerMeasure * 4, sectionRange.end);

                // Antecedent (first 2 measures)
                for (
                    let step = currentStep;
                    step < currentStep + stepsPerMeasure * 2 && step < blockEnd;
                    step += stepsPerBeat / 2 // Iterate by 8th notes to allow syncopation
                ) {
                    const entry = arranger.stepMap[step];
                    const entryChord = /** @type {any} */ (entry?.chord);
                    if (!entryChord) {
                        continue;
                    }

                    const measureStep = step % stepsPerMeasure;
                    const beatIndex = Math.floor(measureStep / stepsPerBeat);
                    const isBeatStart = measureStep % stepsPerBeat === 0;
                    const measureNumber = Math.floor((step - currentStep) / stepsPerMeasure);

                    // Autumn Leaves-esque Motif:
                    // Measure 1: Quarter, Quarter, Quarter, Quarter
                    // Measure 2: Whole note (tied into next if possible, but let's do Whole)

                    if (measureNumber === 0) {
                        // Four quarters
                        if (isBeatStart) {
                            const root = entryChord.rootMidi % 12;
                            // Stepwise contour (1, 2, 3, 5) simulated via primary tones based on beat index
                            const midi = getPrimaryChordTone(
                                entryChord,
                                baseOctave + root,
                                beatIndex,
                            );
                            blockNotes.push({
                                step,
                                midi,
                                isAnchor: beatIndex === 0,
                                durationSteps: stepsPerBeat, // quarter note duration
                            });
                        }
                    } else if (measureNumber === 1) {
                        if (isBeatStart && beatIndex === 0) {
                            const root = entryChord.rootMidi % 12;
                            const midi = getPrimaryChordTone(
                                entryChord,
                                baseOctave + root,
                                beatIndex,
                            );
                            blockNotes.push({
                                step,
                                midi,
                                isAnchor: true,
                                durationSteps: stepsPerMeasure, // whole note
                            });
                        }
                    }
                }

                // Consequent (last 2 measures)
                for (
                    let step = currentStep + stepsPerMeasure * 2;
                    step < currentStep + stepsPerMeasure * 4 && step < blockEnd;
                    step += stepsPerBeat / 2 // Iterate by 8th notes to allow syncopation
                ) {
                    const entry = arranger.stepMap[step];
                    const entryChord = /** @type {any} */ (entry?.chord);
                    if (!entryChord) {
                        continue;
                    }

                    const measureStep = step % stepsPerMeasure;
                    const beatIndex = Math.floor(measureStep / stepsPerBeat);
                    const isBeatStart = measureStep % stepsPerBeat === 0;
                    const measureNumber = Math.floor((step - currentStep) / stepsPerMeasure);

                    // Consequent Motif:
                    // Measure 3: Syncopated pickup on beat 2.5, quarter on beat 3, 8th on beat 4.5
                    // Measure 4: Whole note
                    if (measureNumber === 2) {
                        if (measureStep === stepsPerBeat * 2.5) {
                            // beat 3 "and" (pickup)
                            const root = entryChord.rootMidi % 12;
                            const midi = getPrimaryChordTone(
                                entryChord,
                                baseOctave + root,
                                beatIndex,
                            );
                            blockNotes.push({
                                step,
                                midi,
                                isAnchor: false,
                                durationSteps: stepsPerBeat * 0.5,
                            });
                        } else if (isBeatStart && beatIndex === 3) {
                            // beat 4
                            const root = entryChord.rootMidi % 12;
                            const midi = getPrimaryChordTone(
                                entryChord,
                                baseOctave + root,
                                beatIndex,
                            );
                            blockNotes.push({
                                step,
                                midi,
                                isAnchor: false,
                                durationSteps: stepsPerBeat * 1.0, // Prevent overlap with next measure
                            });
                        }
                    } else if (measureNumber === 3) {
                        if (isBeatStart && beatIndex === 0) {
                            const root = entryChord.rootMidi % 12;
                            const midi = getPrimaryChordTone(
                                entryChord,
                                baseOctave + root,
                                beatIndex,
                            );
                            blockNotes.push({
                                step,
                                midi,
                                isAnchor: true,
                                durationSteps: stepsPerMeasure - 2, // Let it ring, but leave gap for next phrase
                            });
                        }
                    }
                }

                currentStep = blockEnd;
            }

            generatedContours.set(contourGroup, { start: sectionRange.start, notes: blockNotes });
            notes.push(...blockNotes);
        }
    });

    return { notes, loopLengthSteps: totalSteps };
}
