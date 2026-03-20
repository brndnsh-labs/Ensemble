import { createPRNG, generateRandomSeed } from '../utils.js';
import { getScaleForChord } from './theory-scales.js';

/**
 * Soloist Seeder Module (v3)
 * Generates a "Dynamic Head" (Seed Melody) for the entire arrangement.
 * Implements Label-Aware Strategies, Thematic Repetition, and Melodic Sequencing.
 */

/**
 * @typedef {Object} SeedNote
 * @property {number} step - Global step target within the loop.
 * @property {number} midi - MIDI note value.
 * @property {boolean} isAnchor - True if it's a structural anchor.
 * @property {number} durationSteps - Suggested duration in steps.
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

    const stepsPerMeasure = 16;
    const totalSteps = arranger.totalSteps || arranger.stepMap.length;

    /** @type {SeedNote[]} */
    const notes = [];

    // Motif Memory: Keyed by Label to ensure repetition across same section types
    /** @type {Map<string, Array<{offset: number, interval: number, duration: number}>>} */
    const labelMotifs = new Map();

    // Strategy Templates
    const TEMPLATES = {
        intro: [
            [
                1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0,
            ],
        ], // Spaced
        chorus: [
            [
                1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0,
                1, 0, 0, 0,
            ],
        ], // High Energy
        verse: [
            [
                1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0,
            ],
        ], // Balanced
        jazz: [
            [
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0,
            ],
        ], // Pickup (Autumn Leaves style)
    };

    if (!arranger.sectionMap || arranger.sectionMap.length === 0) {
        return { notes: [], loopLengthSteps: totalSteps };
    }

    arranger.sectionMap.forEach((sectionRange) => {
        const label = (sectionRange.label || 'Main').toLowerCase();
        // Use a generic label category for motif matching
        let category = 'verse';
        if (label.includes('intro')) {
            category = 'intro';
        } else if (label.includes('chorus') || label.includes('drop')) {
            category = 'chorus';
        } else if (label.includes('outro') || label.includes('end')) {
            category = 'outro';
        } else if (style === 'jazz' || style === 'bird' || style === 'bossa') {
            category = 'jazz';
        }

        const sectionSteps = sectionRange.end - sectionRange.start;
        const sectionMeasures = Math.floor(sectionSteps / stepsPerMeasure);

        if (!labelMotifs.has(category)) {
            const pool =
                TEMPLATES[/** @type {keyof typeof TEMPLATES} */ (category)] || TEMPLATES.verse;
            const template = pool[Math.floor(prng() * pool.length)];
            const motif = [];
            let lastInterval = 0;

            for (let i = 0; i < template.length; i++) {
                if (template[i] === 1) {
                    let intervalChange = 0;
                    if (motif.length > 0) {
                        const r = prng();
                        if (r < 0.75) {
                            intervalChange = prng() > 0.5 ? 1 : -1; // Stepwise
                        } else if (r < 0.95) {
                            intervalChange = prng() > 0.5 ? 2 : -2; // Skip
                        } else {
                            intervalChange = prng() > 0.5 ? 4 : -4; // Leap
                        }
                    }
                    lastInterval += intervalChange;

                    let duration = 4;
                    for (let j = i + 1; j < template.length; j++) {
                        if (template[j] === 1) {
                            duration = j - i;
                            break;
                        }
                        if (j === template.length - 1) {
                            duration = template.length - i;
                        }
                    }
                    motif.push({ offset: i, interval: lastInterval, duration });
                }
            }
            labelMotifs.set(category, motif);
        }

        const motif = labelMotifs.get(category) || [];

        for (let m = 0; m < sectionMeasures; m += 2) {
            const measureStartStep = sectionRange.start + m * stepsPerMeasure;

            motif.forEach((motifNote) => {
                const globalStep = measureStartStep + motifNote.offset;
                if (globalStep >= sectionRange.end || globalStep >= totalSteps) {
                    return;
                }

                const entry = arranger.stepMap[globalStep];
                if (!entry) {
                    return;
                }

                /** @type {any} */
                const chord = entry.chord;
                const scale = getScaleForChord(state, chord, null, style);

                // Strategy Register: Intro is lower, Chorus is higher
                let registerOffset = 12; // Adjusted to be relative so we don't force massive octave jumps
                if (category === 'intro') {
                    registerOffset = 0;
                } else if (category === 'chorus') {
                    registerOffset = 24;
                }

                const scaleIdx =
                    ((motifNote.interval % scale.length) + scale.length) % scale.length;

                // Use a normalized base (like 60) plus the interval, rather than adding the chord root
                // directly, which can cause wild octave leaps when the chords change.
                const baseMidi = 60 + registerOffset; // e.g. 60 (C4) or 72 (C5)
                const pitchClass = (chord.rootMidi + scale[scaleIdx]) % 12;

                let midi =
                    baseMidi + pitchClass + Math.floor(motifNote.interval / scale.length) * 12;

                // Smooth out chord transitions by forcing the new note to be as close
                // as possible to the last generated note in the sequence, UNLESS
                // we've crossed into a new structural section (which defines its own register)
                if (notes.length > 0 && motifNote.offset > 0) {
                    const lastNote = notes[notes.length - 1];
                    let bestMidi = midi;
                    let minDistance = Math.abs(midi - lastNote.midi);

                    // Try moving it up or down an octave to see if it's closer
                    for (const offset of [-12, 12, -24, 24]) {
                        const testMidi = midi + offset;
                        const dist = Math.abs(testMidi - lastNote.midi);
                        if (dist < minDistance) {
                            minDistance = dist;
                            bestMidi = testMidi;
                        }
                    }
                    midi = bestMidi;
                }

                notes.push({
                    step: globalStep,
                    midi,
                    isAnchor: motifNote.offset % 8 === 0,
                    durationSteps: motifNote.duration,
                });
            });
        }
    });

    return { notes, loopLengthSteps: totalSteps };
}
