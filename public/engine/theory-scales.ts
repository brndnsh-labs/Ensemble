import { KEY_ORDER, resolveMappedStyle, SMART_SCALE_STYLE_MAP } from '../config.js';
import type { EnsembleState } from '../types.js';

// cspell:ignore tonicization

/**
 * THEORY-SCALES.TS
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
    LOCRIAN_NATURAL_2: [0, 2, 3, 5, 6, 8, 10],

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

function hasDominantFunction(chord: any): boolean {
    const quality = chord?.quality || 'major';
    const isMinor = quality.startsWith('m') && !quality.startsWith('maj');
    return (
        !isMinor &&
        !quality.startsWith('maj') &&
        !['dim', 'halfdim'].includes(quality) &&
        (chord?.is7th ||
            ['9', '11', '13', '7alt', '7b9', '7#9', '7#11', '7b13'].includes(quality) ||
            quality.startsWith('7'))
    );
}

function isMinorQuality(quality: string | undefined): boolean {
    return !!quality && quality.startsWith('m') && !quality.startsWith('maj');
}

function resolvesByDescendingFifth(chord: any, nextChord: any): boolean {
    return !!nextChord && (nextChord.rootMidi - chord.rootMidi + 120) % 12 === 5;
}

const ENHARMONIC_KEY_MAP: Record<string, string> = {
    'C#': 'Db',
    'D#': 'Eb',
    'F#': 'Gb',
    'G#': 'Ab',
    'A#': 'Bb',
};

function getKeyContext(
    state: EnsembleState,
    chord: any,
): { keyName: string | null; keyRootIdx: number; isMinor: boolean } {
    const { arranger } = state;
    const rawKey = chord?.key || arranger.key;
    const isMinor = typeof chord?.keyIsMinor === 'boolean' ? chord.keyIsMinor : arranger.isMinor;
    if (!rawKey) {
        return { keyName: null, keyRootIdx: -1, isMinor };
    }

    const keyName = Object.prototype.hasOwnProperty.call(ENHARMONIC_KEY_MAP, rawKey)
        ? ENHARMONIC_KEY_MAP[rawKey]
        : rawKey;
    return {
        keyName,
        keyRootIdx: KEY_ORDER.indexOf(keyName),
        isMinor,
    };
}

export function getScaleForChord(
    state: EnsembleState,
    chord: any,
    nextChord: any = null,
    style = 'smart',
): number[] {
    const { groove, soloist } = state;
    if (!chord) {
        return SCALE_INTERVALS.MAJOR;
    }
    const keyContext = getKeyContext(state, chord);

    // 1. Resolve 'smart' style to specific genre style if needed
    if (style === 'smart') {
        style = resolveMappedStyle(SMART_SCALE_STYLE_MAP, groove.genreFeel);
    }

    if (style === 'country') {
        const quality = chord.quality || 'major';
        if (quality.startsWith('m') && !quality.startsWith('maj')) {
            return SCALE_INTERVALS.MINOR_PENTATONIC;
        }
        // Signature Country: Pure Major Pentatonic
        // We add 3 (blue note) only if tension is high, but default to the sweet sound.
        if (soloist.session.tension > 0.7) {
            return [0, 2, 3, 4, 7, 9].sort((a, b) => a - b);
        }
        return SCALE_INTERVALS.MAJOR_PENTATONIC;
    }

    const quality = chord.quality || 'major';
    const isMinor = isMinorQuality(quality);
    const isDominant = hasDominantFunction(chord);

    // --- SPECIAL QUALITY HANDLING ---

    // Fully diminished chords typically want the symmetric collection.
    // Plain dim triads can still fall through to diatonic awareness (for example natural vii degrees).
    if (quality === 'dim7') {
        return SCALE_INTERVALS.WHOLE_HALF_DIMINISHED;
    }

    // Half-Diminished (m7b5)
    if (quality === 'halfdim') {
        if (nextChord && hasDominantFunction(nextChord)) {
            const pointsToMinorCadence =
                keyContext.isMinor ||
                nextChord.keyIsMinor === true ||
                ['7alt', '7b9', '7b13'].includes(nextChord.quality);
            if (resolvesByDescendingFifth(chord, nextChord) && pointsToMinorCadence) {
                return SCALE_INTERVALS.LOCRIAN_NATURAL_2;
            }
        }
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
        // Explicit altered dominants should always outrank global tension heuristics.
        if (quality === '7alt' || quality === '7#9') {
            if (style === 'funk' || style === 'blues') {
                return SCALE_INTERVALS.BLUES;
            }
            return SCALE_INTERVALS.ALTERED;
        }

        // Lydian Dominant (7#11)
        if (quality === '7#11') {
            return SCALE_INTERVALS.LYDIAN_DOMINANT;
        }

        // Phrygian Dominant (7b9, 7b13)
        if (quality === '7b9' || quality === '7b13') {
            return SCALE_INTERVALS.PHRYGIAN_DOMINANT;
        }

        // High Tension / Altered Dominants
        if (soloist.session.tension > 0.7 && !['rock', 'scalar', 'country'].includes(style)) {
            if (style === 'funk' || style === 'blues') {
                return SCALE_INTERVALS.BLUES;
            }
            return SCALE_INTERVALS.ALTERED;
        }

        // Lydian Dominant detection for Jazz/Bossa
        if (keyContext.keyRootIdx !== -1 && ['jazz', 'bird', 'bossa'].includes(style)) {
            const intervalFromKey = (chord.rootMidi - keyContext.keyRootIdx + 120) % 12;
            if (intervalFromKey === 10 || intervalFromKey === 2) {
                // b7 or II7
                return SCALE_INTERVALS.LYDIAN_DOMINANT;
            }
        }

        // V7 resolving to i (Minor) -> Phrygian Dominant (Harmonic Minor 5th mode)
        if (
            nextChord &&
            isMinorQuality(nextChord.quality) &&
            resolvesByDescendingFifth(chord, nextChord) &&
            (keyContext.isMinor || nextChord.keyIsMinor === true)
        ) {
            // Resolving down a 5th (or up a 4th) into an explicitly minor tonicization
            return SCALE_INTERVALS.PHRYGIAN_DOMINANT;
        }

        if (style === 'blues' || style === 'rock') {
            // Mixolydian with added b3 (Blue note)
            return [0, 2, 3, 4, 5, 7, 9, 10].sort((a, b) => a - b);
        }

        // #564: funk over plain dominants (the most common funk chord is a dom9
        // vamp). Previously funk fell through to plain MIXOLYDIAN — no b3, no b5,
        // a clean diatonic line over a chord the band voices bluesy. The SRV/
        // Hendrix/Maceo funk vocabulary lives on the b3 and b5 as *grit grace*
        // notes layered over the major-3 Mixolydian body. Give funk a dominant
        // blues scale: Mixolydian (natural 3 + 9, funk's major-3 prominence) PLUS
        // the blue notes b3 (3) and b5 (6). The picker's blue-note reward (tempered
        // for funk — grace, not landing) biases toward the grit; this just puts it
        // in reach. Sorted ascending to match the other scale returns.
        if (style === 'funk') {
            return [0, 2, 3, 4, 5, 6, 7, 9, 10];
        }

        if (style === 'metal') {
            // Metal's phrygian-dominant color over dominant chords; without this
            // it fell through to generic MIXOLYDIAN (generic-rock lead).
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
        if (keyContext.isMinor && keyContext.keyRootIdx !== -1) {
            const intervalFromKey = (chord.rootMidi - keyContext.keyRootIdx + 120) % 12;
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

    if (keyContext.keyRootIdx !== -1) {
        const keyIntervals = keyContext.isMinor
            ? SCALE_INTERVALS.NATURAL_MINOR
            : SCALE_INTERVALS.MAJOR;
        const keyNotes = keyIntervals.map((i) => (keyContext.keyRootIdx + i) % 12);

        const chordRootPC = chord.rootMidi % 12;
        const chordTones = chord.intervals.map((i: number) => (chordRootPC + i) % 12);

        const isDiatonic = chordTones.every((note: number) => keyNotes.includes(note));

        if (isDiatonic) {
            // Build the mode
            const mode = keyNotes
                .map((note) => (note - chordRootPC + 12) % 12)
                .sort((a, b) => a - b);
            return mode;
        }
    }

    if (quality === 'dim') {
        return SCALE_INTERVALS.WHOLE_HALF_DIMINISHED;
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
