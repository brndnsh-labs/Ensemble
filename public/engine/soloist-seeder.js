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
    const stepsPerBeat = 4;
    const totalSteps = arranger.totalSteps || arranger.stepMap.length;

    /** @type {SeedNote[]} */
    const notes = [];

    // Motif Memory: Keyed by Category to ensure repetition across same section types
    /** @type {Map<string, { startStep: number, notes: SeedNote[] }>} */
    const categorySeeds = new Map();

    // Strategy Templates (Section Contours)
    const TEMPLATES = {
        // Static/Rhythmic: fewer passing tones, rhythmic anchors on downbeats
        a: [
            [
                1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0,
            ],
            [
                1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0,
            ],
        ],
        // Ascending Arpeggio: 8th notes, more motion
        b: [
            [
                1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0,
                0, 0, 0, 0,
            ],
        ],
        // Scale Walk-up: pickups
        pickup: [
            [
                0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0,
            ],
            [
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0,
            ],
        ],
    };

    if (!arranger.sectionMap || arranger.sectionMap.length === 0) {
        return { notes: [], loopLengthSteps: totalSteps };
    }

    arranger.sectionMap.forEach((sectionRange) => {
        const label = (sectionRange.label || 'Main').toLowerCase();

        let category = 'a';
        if (
            label.includes('b') ||
            label.includes('bridge') ||
            label.includes('chorus') ||
            label.includes('drop')
        ) {
            category = 'b';
        } else if (label.includes('intro') || label.includes('pickup')) {
            category = 'pickup';
        } else if (label.includes('a') || label.includes('verse') || label.includes('main')) {
            category = 'a';
        } else if (style === 'jazz' || style === 'bird' || style === 'bossa') {
            category = 'pickup'; // Default to pickup style for jazz if not explicitly labeled A/B
        }

        const sectionSteps = sectionRange.end - sectionRange.start;
        const sectionMeasures = Math.floor(sectionSteps / stepsPerMeasure);
        const isTurnaroundStart = sectionRange.end - stepsPerMeasure * 2; // last 2 measures

        if (categorySeeds.has(category)) {
            // CLONE PREVIOUS SECTION
            const cachedData = categorySeeds.get(category);
            const cachedNotes = cachedData ? cachedData.notes : [];
            const originalStart = cachedData ? cachedData.startStep : 0;


            cachedNotes.forEach((cachedNote) => {
                const relativeStep = cachedNote.step - originalStart;
                const globalStep = sectionRange.start + relativeStep;

                if (globalStep >= sectionRange.end || globalStep >= totalSteps) {
                    return;
                }

                const entry = arranger.stepMap[globalStep];
                if (!entry) {
                    return;
                }

                const newChord = entry.chord;
                let newMidi = cachedNote.midi;

                // Turnaround handling: snap to primary chord tones if chords differ
                if (globalStep >= isTurnaroundStart) {
                    // We need the original chord at cachedNote.step to see if it differs
                    const originalEntry = arranger.stepMap[cachedNote.step];
                    const originalChord = /** @type {any} */ (
                        originalEntry ? originalEntry.chord : null
                    );
                    const targetChord = /** @type {any} */ (newChord);

                    if (
                        originalChord &&
                        (originalChord.rootMidi !== targetChord.rootMidi ||
                            originalChord.quality !== targetChord.quality)
                    ) {
                        // Snap to primary chord tone
                        newMidi = snapToPrimaryChordTone(cachedNote.midi, targetChord);
                    }
                }

                notes.push({
                    step: globalStep,
                    midi: newMidi,
                    isAnchor: cachedNote.isAnchor,
                    durationSteps: cachedNote.durationSteps,
                });
            });
        } else {
            // GENERATE NEW SECTION
            const pool = TEMPLATES[/** @type {keyof typeof TEMPLATES} */ (category)] || TEMPLATES.a;
            const template = pool[Math.floor(prng() * pool.length)];

            const generatedNotes = [];

            // Base octave
            let baseOctave = 5; // C5 = 72
            if (category === 'pickup') {
                baseOctave = 4;
            } else if (category === 'b') {
                baseOctave = 6;
            }

            for (let m = 0; m < sectionMeasures; m += 2) {
                const measureStartStep = sectionRange.start + m * stepsPerMeasure;

                let lastAnchorMidi = -1;

                for (let i = 0; i < template.length; i++) {
                    if (template[i] === 1) {
                        const globalStep = measureStartStep + i;
                        if (globalStep >= sectionRange.end || globalStep >= totalSteps) {
                            continue;
                        }

                        const entry = arranger.stepMap[globalStep];
                        if (!entry) {
                            continue;
                        }

                        /** @type {any} */
                        const chord = entry.chord;
                        const scale = getScaleForChord(state, chord, null, style);

                        const measureStep = globalStep % stepsPerMeasure;
                        const isStrongBeat = measureStep % (stepsPerBeat * 2) === 0; // Beat 1 and 3

                        let midi = 60;
                        let isAnchor = false;

                        if (isStrongBeat) {
                            // Anchor on primary chord tones (1, 3, 5, 7)
                            isAnchor = true;

                            let primaryIntervals = [];
                            // Extract primary chord tones from intervals
                            // Typically 0, 4, 7, 10/11
                            for (let idx = 0; idx < Math.min(4, chord.intervals.length); idx++) {
                                primaryIntervals.push(chord.intervals[idx] % 12);
                            }
                            if (primaryIntervals.length === 0) {
                                primaryIntervals = [0, 4, 7];
                            }

                            // Pick one randomly
                            const interval =
                                primaryIntervals[Math.floor(prng() * primaryIntervals.length)];
                            midi = 12 * baseOctave + (chord.rootMidi % 12) + interval;

                            // Keep it within a reasonable range (e.g. 60 - 84)
                            while (midi < 60) {
                                midi += 12;
                            }
                            while (midi > 84) {
                                midi -= 12;
                            }

                            lastAnchorMidi = midi;
                        } else {
                            // Weak beat - passing tone
                            if (lastAnchorMidi !== -1) {
                                // Try to find a scale tone close to the last anchor
                                const targetIntervals = scale;
                                let bestMidi = lastAnchorMidi;
                                let minDistance = 999;

                                // Search around last anchor
                                for (
                                    let testMidi = lastAnchorMidi - 5;
                                    testMidi <= lastAnchorMidi + 5;
                                    testMidi++
                                ) {
                                    if (testMidi === lastAnchorMidi) {
                                        continue;
                                    }
                                    const pc = ((testMidi % 12) - (chord.rootMidi % 12) + 12) % 12;
                                    if (targetIntervals.includes(pc)) {
                                        const dist = Math.abs(testMidi - lastAnchorMidi);
                                        if (dist < minDistance) {
                                            minDistance = dist;
                                            bestMidi = testMidi;
                                        }
                                    }
                                }
                                midi = bestMidi;
                            } else {
                                // Fallback if no anchor yet
                                midi = 12 * baseOctave + (chord.rootMidi % 12);
                            }
                        }

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

                        const newNote = {
                            step: globalStep,
                            midi,
                            isAnchor,
                            durationSteps: duration,
                        };
                        notes.push(newNote);
                        generatedNotes.push(newNote);
                    }
                }
            }
            categorySeeds.set(category, { startStep: sectionRange.start, notes: generatedNotes });
        }
    });

    return { notes, loopLengthSteps: totalSteps };
}

/**
 * Snaps a MIDI pitch to the nearest primary chord tone of the given chord.
 * @param {number} midi
 * @param {any} chord
 * @returns {number}
 */
function snapToPrimaryChordTone(midi, chord) {
    let primaryIntervals = [];
    for (let idx = 0; idx < Math.min(4, chord.intervals.length); idx++) {
        primaryIntervals.push(chord.intervals[idx] % 12);
    }
    if (primaryIntervals.length === 0) {
        primaryIntervals = [0, 4, 7];
    }

    let bestMidi = midi;
    let minDistance = 999;

    for (const interval of primaryIntervals) {
        // Try to match the octave of the original midi
        const octaveBase = Math.floor(midi / 12) * 12;
        const testMidi = octaveBase + (chord.rootMidi % 12) + interval;

        // Check this octave, the one below, and the one above
        for (const offset of [-12, 0, 12]) {
            const m = testMidi + offset;
            const dist = Math.abs(midi - m);
            if (dist < minDistance) {
                minDistance = dist;
                bestMidi = m;
            }
        }
    }

    return bestMidi;
}
