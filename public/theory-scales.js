import { KEY_ORDER } from './config.js';
import { getState } from './state.js';

/**
 * THEORY-SCALES.JS
 *
 * Centralized logic for musical scale theory.
 * This module provides the "correct" scale intervals for any given chord,
 * taking into account genre, harmonic context, and tension.
 */

const SCALE_INTERVALS = {
    // Diatonic
    MAJOR: [0, 2, 4, 5, 7, 9, 11],
    NATURAL_MINOR: [0, 2, 3, 5, 7, 8, 10],
    HARMONIC_MINOR: [0, 2, 3, 5, 7, 8, 11],
    MELODIC_MINOR: [0, 2, 3, 5, 7, 9, 11],

    // Modes
    DORIAN: [0, 2, 3, 5, 7, 9, 10],
    PHRYGIAN: [0, 1, 3, 5, 7, 8, 10],
    LYDIAN: [0, 2, 4, 6, 7, 9, 11],
    MIXOLYDIAN: [0, 2, 4, 5, 7, 9, 10],
    LOCRIAN: [0, 1, 3, 5, 6, 8, 10],

    // Pentatonics / Blues
    MAJOR_PENTATONIC: [0, 2, 4, 7, 9],
    MINOR_PENTATONIC: [0, 3, 5, 7, 10],
    BLUES: [0, 3, 5, 6, 7, 10], // Minor pentatonic + b5
    MAJOR_BLUES: [0, 2, 3, 4, 7, 9], // Major pentatonic + b3

    // Jazz / Exotic
    LYDIAN_DOMINANT: [0, 2, 4, 6, 7, 9, 10], // 4th mode of melodic minor
    ALTERED: [0, 1, 3, 4, 6, 8, 10], // 7th mode of melodic minor (Super Locrian)
    HALF_WHOLE_DIMINISHED: [0, 1, 3, 4, 6, 7, 9, 10], // Dominant function
    WHOLE_HALF_DIMINISHED: [0, 2, 3, 5, 6, 8, 9, 11], // Diminished chord function
    WHOLE_TONE: [0, 2, 4, 6, 8, 10],
    PHRYGIAN_DOMINANT: [0, 1, 4, 5, 7, 8, 10], // 5th mode of harmonic minor
};

/**
 * Determines the most appropriate musical scale for a given chord and context.
 *
 * @param {any} chord - The current chord object.
 * @param {any} [nextChord] - The upcoming chord object (for resolution logic).
 * @param {string} [style] - The soloist or instrument style (e.g., 'smart', 'blues').
 * @returns {number[]} An array of semitone intervals representing the selected scale.
 */
export function getScaleForChord(chord, nextChord = null, style = 'smart') {
    /** @type {import('./types.js').EnsembleState} */
    const state = getState();
    const { arranger, groove, soloist } = state;
    if (!chord) {
        return SCALE_INTERVALS.MAJOR;
    }

    // 1. Resolve 'smart' style to specific genre style if needed
    if (style === 'smart') {
        /** @type {any} */
        const mapping = {
            Rock: 'rock',
            Jazz: 'jazz',
            Funk: 'funk',
            Blues: 'blues',
            'Neo-Soul': 'neo',
            Disco: 'disco',
            Bossa: 'bossa',
            'Bossa Nova': 'bossa',
            Afrobeat: 'funk',
            Acoustic: 'minimal',
            Reggae: 'minimal',
            Country: 'country',
            Metal: 'metal',
            'Rock/Metal': 'metal',
            'Ska-Punk': 'rock',
            Ska: 'rock',
        };
        style = mapping[groove.genreFeel] || 'rock';
    }

    if (style === 'country') {
        const quality = chord.quality || 'major';
        if (quality.startsWith('m') && !quality.startsWith('maj')) {
            return SCALE_INTERVALS.MINOR_PENTATONIC;
        }
        // Signature Country: Pure Major Pentatonic
        // We add 3 (blue note) only if tension is high, but default to the sweet sound.
        if (soloist.tension > 0.7) {
            return [0, 2, 3, 4, 7, 9].sort((a, b) => a - b);
        }
        return SCALE_INTERVALS.MAJOR_PENTATONIC;
    }

    const quality = chord.quality || 'major';
    const isMinor = quality.startsWith('m') && !quality.startsWith('maj');
    const isDominant =
        !isMinor &&
        !quality.startsWith('maj') &&
        !['dim', 'halfdim'].includes(quality) &&
        (chord.is7th ||
            ['9', '11', '13', '7alt', '7b9', '7#9', '7#11', '7b13'].includes(quality) ||
            quality.startsWith('7'));

    // --- SPECIAL QUALITY HANDLING ---

    // Diminished
    if (quality === 'dim' || quality === 'dim7') {
        return SCALE_INTERVALS.WHOLE_HALF_DIMINISHED;
    }

    // Half-Diminished (m7b5)
    if (quality === 'halfdim') {
        return SCALE_INTERVALS.LOCRIAN;
    }

    // Augmented
    if (quality === 'aug') {
        return SCALE_INTERVALS.WHOLE_TONE;
    }
    if (quality === 'augmaj7') {
        return [0, 2, 4, 6, 8, 9, 11]; // Lydian Augmented
    }

    // --- DOMINANT CHORD HANDLING ---

    if (isDominant) {
        // High Tension / Altered Dominants
        if (
            quality === '7alt' ||
            quality === '7#9' ||
            (soloist.tension > 0.7 && !['rock', 'scalar', 'country'].includes(style))
        ) {
            if (style === 'funk' || style === 'blues') {
                return SCALE_INTERVALS.BLUES;
            }
            return SCALE_INTERVALS.ALTERED;
        }

        // Lydian Dominant (7#11)
        if (quality === '7#11') {
            return SCALE_INTERVALS.LYDIAN_DOMINANT;
        }

        // Lydian Dominant detection for Jazz/Bossa
        if (arranger.key && ['jazz', 'bird', 'bossa'].includes(style)) {
            const keyRootIdx = KEY_ORDER.indexOf(arranger.key);
            const intervalFromKey = (chord.rootMidi - keyRootIdx + 120) % 12;
            if (intervalFromKey === 10 || intervalFromKey === 2) {
                // b7 or II7
                return SCALE_INTERVALS.LYDIAN_DOMINANT;
            }
        }

        // Phrygian Dominant (7b9, 7b13)
        if (quality === '7b9' || quality === '7b13') {
            return SCALE_INTERVALS.PHRYGIAN_DOMINANT;
        }

        // V7 resolving to i (Minor) -> Phrygian Dominant (Harmonic Minor 5th mode)
        if (nextChord) {
            const isNextMinor =
                nextChord.quality.startsWith('m') && !nextChord.quality.startsWith('maj');
            if (isNextMinor) {
                const interval = (nextChord.rootMidi - chord.rootMidi + 120) % 12;
                if (interval === 5) {
                    // Resolving down a 5th (or up a 4th) to a minor chord
                    return SCALE_INTERVALS.PHRYGIAN_DOMINANT;
                }
            }
        }

        if (style === 'blues' || style === 'rock') {
            // Mixolydian with added b3 (Blue note)
            return [0, 2, 3, 4, 5, 7, 9, 10].sort((a, b) => a - b);
        }

        if (style === 'metal') {
            return SCALE_INTERVALS.PHRYGIAN_DOMINANT;
        }

        return SCALE_INTERVALS.MIXOLYDIAN;
    }

    // --- MINOR CHORD HANDLING ---

    if (isMinor) {
        // Flavor overrides: Neo-Soul/Jazz/Funk often prefer Dorian over Aeolian
        const favorDorian =
            ['neo', 'bird', 'funk', 'bossa'].includes(style) ||
            groove.genreFeel === 'Jazz' ||
            groove.genreFeel === 'Neo-Soul';

        if (favorDorian) {
            // Even if diatonic is Aeolian, these genres often reharmonize to Dorian
            return SCALE_INTERVALS.DORIAN;
        }

        // For other genres, we rely on Diatonic Fallback below.
        // If not diatonic, Natural Minor is the safe default.
    }

    // --- MAJOR CHORD HANDLING ---

    if (quality === 'major' || quality.startsWith('maj')) {
        if ((style === 'blues' || style === 'funk') && !quality.includes('maj7')) {
            return SCALE_INTERVALS.MAJOR_BLUES;
        }

        // V in Minor Key -> Phrygian Dominant (Dominant function even if triad)
        if (arranger.isMinor && arranger.key) {
            const keyRootIdx = KEY_ORDER.indexOf(arranger.key);
            const intervalFromKey = (chord.rootMidi - keyRootIdx + 120) % 12;
            if (intervalFromKey === 7) {
                // V
                return SCALE_INTERVALS.PHRYGIAN_DOMINANT;
            }
        }

        // Lydian is handled by Diatonic Logic (IV chord)
    }

    // --- DIATONIC AWARENESS ---
    // If the chord fits within the current Key, use the Key's mode starting on the Chord Root.
    // This correctly handles ii(Dorian), iii(Phrygian), IV(Lydian), vi(Aeolian).

    if (arranger.key) {
        const keyRootIdx = KEY_ORDER.indexOf(arranger.key);
        const keyIntervals = arranger.isMinor
            ? SCALE_INTERVALS.NATURAL_MINOR
            : SCALE_INTERVALS.MAJOR;
        const keyNotes = keyIntervals.map((/** @type {number} */ i) => (keyRootIdx + i) % 12);

        const chordRootPC = chord.rootMidi % 12;
        const chordTones = chord.intervals.map((/** @type {number} */ i) => (chordRootPC + i) % 12);

        const isDiatonic = chordTones.every((/** @type {number} */ note) =>
            keyNotes.includes(note),
        );

        if (isDiatonic) {
            // Build the mode
            const mode = keyNotes
                .map((/** @type {number} */ note) => (note - chordRootPC + 12) % 12)
                .sort((a, b) => a - b);
            return mode;
        }
    }

    // --- GENRE SPECIFIC FALLBACKS ---

    // Default Fallbacks if not Diatonic
    if (isMinor) {
        return SCALE_INTERVALS.NATURAL_MINOR;
    }

    // Jazz/Bossa/Neo prefer Lydian for non-diatonic Major chords (e.g. bIImaj7, bVImaj7) to avoid clash with Key
    if (['bird', 'bossa', 'jazz', 'neo'].includes(style)) {
        return SCALE_INTERVALS.LYDIAN;
    }

    // Default to Ionian (Major) for all other styles to ensure consonance
    return SCALE_INTERVALS.MAJOR;
}
