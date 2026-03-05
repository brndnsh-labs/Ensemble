import {
    INTERVAL_TO_NNS,
    INTERVAL_TO_ROMAN,
    KEY_ORDER,
    NNS_OFFSETS,
    ROMAN_VALS,
    TIME_SIGNATURES,
} from './config.js';
import { dispatch, getState } from './state.js';
import { getFrequency, normalizeKey } from './utils.js';

const ROMAN_REGEX = /^([#b])?(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)/;
const NNS_REGEX = /^([#b])?([1-7])/;
const NOTE_REGEX = /^([A-G][#b]?)/i;

/**
 * Extracts quality and 7th status from a chord symbol string.
 * @param {string} symbol
 * @returns {{quality: string, is7th: boolean, suffix: string}}
 */
export function getChordDetails(symbol) {
    let quality = 'major',
        is7th =
            symbol.includes('7') ||
            symbol.includes('9') ||
            symbol.includes('11') ||
            symbol.includes('13') ||
            symbol.includes('alt');
    const suffixMatch = symbol.match(
        /(maj7#11|maj7#5|maj7\+|maj7|maj9|maj11|maj13|maj|M7#5|M7\+|M7|m13|m11|m9|m7b5|m7|m6|min|m|dim7|dim|o7|o|°7|°|7#5|7\+|7aug|aug7|aug|\+7|\+|-|ø7|ø|h7|7b5|sus4|sus2|add9|7alt|7b13|7#11|7b9|7#9|7|alt|13|11|9|6|5)/,
    );
    const suffix = suffixMatch ? suffixMatch[1] : '';

    if (suffix === 'maj13') {
        quality = 'maj13';
    } else if (suffix === 'maj11') {
        quality = 'maj11';
    } else if (suffix === 'maj9') {
        quality = 'maj9';
    } else if (suffix === 'maj7#11') {
        quality = 'maj7#11';
    } else if (suffix === 'maj7#5' || suffix === 'maj7+' || suffix === 'M7#5' || suffix === 'M7+') {
        quality = 'augmaj7';
        is7th = true;
    } else if (suffix.includes('maj') || suffix === 'M7') {
        quality = 'maj7';
    } else if (suffix === 'm13') {
        quality = 'm13';
    } else if (suffix === 'm11') {
        quality = 'm11';
    } else if (suffix === 'm9') {
        quality = 'm9';
    } else if (
        suffix === 'm7b5' ||
        suffix === 'ø7' ||
        suffix === 'ø' ||
        suffix === 'h7' ||
        symbol.includes('7b5')
    ) {
        quality = 'halfdim';
    } else if (suffix === 'm6') {
        quality = 'm6';
    } else if (suffix === 'm7' || suffix === 'min' || suffix === 'm' || suffix === '-') {
        quality = 'minor';
    } else if (
        suffix === 'o7' ||
        (suffix === 'o' && is7th) ||
        suffix === 'dim7' ||
        suffix === '°7' ||
        (suffix === '°' && is7th)
    ) {
        quality = 'dim';
        is7th = true;
    } else if (suffix === 'o' || suffix === 'dim' || suffix === '°') {
        quality = 'dim';
    } else if (
        suffix === '7#5' ||
        suffix === '7+' ||
        suffix === '7aug' ||
        suffix === 'aug7' ||
        suffix === '+7'
    ) {
        quality = 'aug';
        is7th = true;
    } else if (suffix.includes('aug') || suffix === '+') {
        quality = 'aug';
    } else if (suffix === 'sus4') {
        quality = 'sus4';
    } else if (suffix === 'sus2') {
        quality = 'sus2';
    } else if (suffix === 'add9') {
        quality = 'add9';
    } else if (suffix === '7alt' || suffix === 'alt') {
        quality = '7alt';
    } else if (suffix === '7b13') {
        quality = '7b13';
    } else if (suffix === '7#11') {
        quality = '7#11';
    } else if (suffix === '7b9') {
        quality = '7b9';
    } else if (suffix === '7#9') {
        quality = '7#9';
    } else if (suffix === '13') {
        quality = '13';
    } else if (suffix === '11') {
        quality = '11';
    } else if (suffix === '9') {
        quality = '9';
    } else if (suffix === '7') {
        quality = '7';
    } else if (suffix === '6') {
        quality = '6';
    } else if (suffix === '5') {
        quality = '5';
    }

    return { quality, is7th, suffix };
}

/**
 * Calculates the best inversion for a chord to maintain smooth voice leading
 * while preventing register creep using an anchored "Home Register".
 *
 * @param {number} rootMidi - The raw root MIDI note.
 * @param {number[]} intervals - Semitone intervals from the root.
 * @param {number[]} previousMidis - MIDI notes of the previous chord.
 * @param {boolean} isPivot - Whether this chord is a section/phrase pivot point.
 * @param {number|null} anchor - Optional custom anchor MIDI note.
 * @param {number} min - Minimum allowed MIDI note for the average.
 * @param {number} max - Maximum allowed MIDI note for the average.
 * @param {string} style - The style of the music, e.g., 'stabs', 'organ'.
 * @returns {number[]} - Optimized MIDI notes for the chord.
 */
export function getBestInversion(
    rootMidi,
    intervals,
    previousMidis,
    isPivot = false,
    anchor = null,
    min = 40,
    max = 80,
    style = 'stabs',
) {
    const { chords } = getState();
    const homeAnchor = anchor || chords.octave || 60;

    // Organ needs more aggressive correction back to the anchor to avoid mud
    const registerPullWeight = style === 'organ' ? 0.8 : 0.6;
    const RANGE_MIN = min;
    const RANGE_MAX = max;

    let targetCenter = homeAnchor;
    if (previousMidis && previousMidis.length > 0) {
        // Optimization: Replace Array.prototype.reduce with a standard for loop to avoid closure overhead in hot audio path
        let sum = 0;
        for (let i = 0; i < previousMidis.length; i++) {
            sum += previousMidis[i];
        }
        const prevAvg = sum / previousMidis.length;
        const drift = prevAvg - homeAnchor;
        const driftLimit = style === 'organ' || isPivot ? 3 : 5;
        targetCenter =
            Math.abs(drift) > driftLimit ? prevAvg - drift * registerPullWeight : prevAvg;
    }

    // VOICING PRESERVATION: If the intervals are spread (> 12 semitones),
    // shift the entire block as a unit to preserve the harmonic structure.
    const isSpread = Math.max(...intervals) > 12;

    if (isSpread) {
        let bestShift = 0;
        let minDistance = Infinity;
        for (let shift = -24; shift <= 24; shift += 12) {
            // Optimization: Replace Array.prototype.reduce with a standard for loop to avoid closure overhead in hot audio path
            let sum = 0;
            for (let i = 0; i < intervals.length; i++) {
                sum += intervals[i] + rootMidi + shift;
            }
            const currentAvg = sum / intervals.length;
            const dist = Math.abs(currentAvg - targetCenter);
            if (dist < minDistance) {
                minDistance = dist;
                bestShift = shift;
            }
        }
        return intervals.map((i) => rootMidi + i + bestShift).sort((a, b) => a - b);
    }

    const result = [];
    intervals.forEach((inter, i) => {
        const note = rootMidi + inter;
        const pc = note % 12;
        const octaves = [-24, -12, 0, 12, 24];
        const candidates = octaves.map((o) => Math.floor(targetCenter / 12) * 12 + o + pc);
        candidates.sort((a, b) => Math.abs(a - targetCenter) - Math.abs(b - targetCenter));

        let best = candidates[0];
        if (i > 0 && best < 48) {
            while (best - result[i - 1] < 7) {
                best += 12;
            }
        }
        result.push(best);
    });

    let finalResult = result;
    const minNote = Math.min(...finalResult);
    if (minNote < RANGE_MIN) {
        finalResult = finalResult.map((n) => n + 12);
    }
    const maxNote = Math.max(...finalResult);
    if (maxNote > RANGE_MAX) {
        finalResult = finalResult.map((n) => n - 12);
    }

    return finalResult.sort((a, b) => a - b);
}

/**
 * Mutates an existing progression string by subtly changing one or more chords.
 * @returns {{ value: string, mutatedIndex: number }}
 */
export function mutateProgression(progressionStr) {
    if (!progressionStr || !progressionStr.trim()) {
        return { value: progressionStr, mutatedIndex: -1 };
    }
    const parts = progressionStr.split('|').map((p) => p.trim());

    // Pick 1 random index to mutate
    const mutatedParts = [...parts];
    const idx = Math.floor(Math.random() * parts.length);
    const original = parts[idx];

    // Simple substitutions based on common harmonic functions
    const substitutions = {
        I: ['vi', 'IV', 'Imaj7'],
        IV: ['ii', 'IVmaj7', 'iv'],
        V: ['V7', 'viio', 'bVII'],
        vi: ['I', 'iii', 'IV'],
        ii: ['IV', 'ii7', 'bIImaj7'],
        1: ['6-', '4', '1maj7'],
        4: ['2-', '4maj7', '4m'],
        5: ['57', '7o', 'b7'],
        '6-': ['1', '3-', '4'],
    };

    // If we have a known substitution, use it
    const choices = substitutions[original] || [];
    if (choices.length > 0) {
        mutatedParts[idx] = choices[Math.floor(Math.random() * choices.length)];
    } else {
        // Just change the extension if it's a simple chord
        if (!original.includes('7') && !original.includes('maj')) {
            mutatedParts[idx] = original + (Math.random() > 0.5 ? 'maj7' : '7');
        } else {
            // Re-randomize just this one spot from a general pool
            const pool = ['I', 'ii', 'iii', 'IV', 'V', 'vi'];
            mutatedParts[idx] = pool[Math.floor(Math.random() * pool.length)];
        }
    }

    return { value: mutatedParts.join(' | '), mutatedIndex: idx };
}

/**
 * Intelligent transposition for relative major/minor toggles.
 * Rewrites the progression string while maintaining original pitches.
 * @param {string} input - The progression string.
 * @param {number} semitoneShift - How many semitones the key is moving (e.g., -3 for Maj->Min).
 * @param {boolean} targetIsMinor - Whether the new key is minor.
 * @returns {string} The transformed progression string.
 */
export function transformRelativeProgression(input, semitoneShift) {
    const parts = input.split(/([\s,|,-]+|\/)/);
    const transformed = parts.map((part) => {
        if (!part.trim() || part === '|' || part === '/' || part === ',' || part === '-') {
            return part;
        }

        const romanMatch = part.match(ROMAN_REGEX);
        const nnsMatch = part.match(NNS_REGEX);
        const noteMatch = part.match(NOTE_REGEX);

        if (romanMatch) {
            const accidental = romanMatch[1] || '';
            const numeral = romanMatch[2];
            const suffix = part.slice(romanMatch[0].length);

            let originalOffset = ROMAN_VALS[numeral.toUpperCase()];
            if (accidental === 'b') {
                originalOffset -= 1;
            }
            if (accidental === '#') {
                originalOffset += 1;
            }

            // Calculate new offset relative to the new key
            const newOffset = (originalOffset - semitoneShift + 12) % 12;
            let newRoman = INTERVAL_TO_ROMAN[newOffset];

            // Preserve the original casing/quality of the chord
            const isSourceMinorChord = numeral === numeral.toLowerCase();
            if (isSourceMinorChord) {
                newRoman = newRoman.toLowerCase();
            }

            return newRoman + suffix;
        } else if (nnsMatch) {
            const accidental = nnsMatch[1] || '';
            const number = parseInt(nnsMatch[2], 10);
            const suffix = part.slice(nnsMatch[0].length);

            let originalOffset = NNS_OFFSETS[number - 1];
            if (accidental === 'b') {
                originalOffset -= 1;
            }
            if (accidental === '#') {
                originalOffset += 1;
            }

            const newOffset = (originalOffset - semitoneShift + 12) % 12;
            const newNNS = INTERVAL_TO_NNS[newOffset];

            return newNNS + suffix;
        } else if (noteMatch) {
            const root = normalizeKey(
                noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase(),
            );
            const suffix = part.slice(noteMatch[0].length);
            const originalIndex = KEY_ORDER.indexOf(root);
            if (originalIndex !== -1) {
                const newIndex = (originalIndex + semitoneShift + 12) % 12;
                return KEY_ORDER[newIndex] + suffix;
            }
        }

        return part;
    });

    return transformed.join('');
}

function resolveChordRoot(part, keyRootMidi, baseOctave) {
    const romanMatch = part.match(ROMAN_REGEX);
    const nnsMatch = part.match(NNS_REGEX);
    const noteMatch = part.match(NOTE_REGEX);

    let rootMidi = keyRootMidi;
    let rootPart = '';
    let rootRomanBase = '';

    if (romanMatch) {
        rootPart = romanMatch[0];
        const accidental = romanMatch[1] || '',
            numeral = romanMatch[2];
        rootRomanBase = numeral;
        let rootOffset = ROMAN_VALS[numeral.toUpperCase()];
        if (accidental === 'b') {
            rootOffset -= 1;
        }
        if (accidental === '#') {
            rootOffset += 1;
        }
        rootMidi = keyRootMidi + rootOffset;
    } else if (nnsMatch) {
        rootPart = nnsMatch[0];
        rootRomanBase = 'I'; // Fallback
        const accidental = nnsMatch[1] || '',
            number = parseInt(nnsMatch[2], 10);
        let rootOffset = NNS_OFFSETS[number - 1];
        if (accidental === 'b') {
            rootOffset -= 1;
        }
        if (accidental === '#') {
            rootOffset += 1;
        }
        rootMidi = keyRootMidi + rootOffset;
    } else if (noteMatch) {
        rootPart = noteMatch[0];
        rootRomanBase = 'I'; // Fallback
        const note = normalizeKey(
            noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase(),
        );
        rootMidi = baseOctave + KEY_ORDER.indexOf(note);
    }

    return { rootMidi, rootPart, romanMatch, nnsMatch, noteMatch, rootRomanBase };
}

/**
 * Generates pro-level rootless jazz voicings.
 * Omits root and often the 5th to focus on 3rd, 7th, and extensions.
 */
function getRootlessVoicing(quality, is7th, isRich) {
    const { groove, playback } = getState();
    const genre = groove.genreFeel;
    const intensity = playback.bandIntensity;

    // JAZZ BLOCK CHORDS (Red Garland Style)
    // Triggered at high intensity in Jazz genre
    if (genre === 'Jazz' && intensity > 0.7) {
        // Red Garland: 1-5-8 in RH, 3-7 in LH (Shell)
        // Expressed as intervals: [3, 10, 12, 19, 24] (m7) or [4, 11, 12, 19, 24] (maj7)
        if (quality === 'minor') {
            return [3, 10, 12, 19, 24];
        }
        if (quality === 'maj7' || quality === 'major') {
            return [4, 11, 12, 19, 24];
        }
        if (quality === '7' || quality === '9') {
            return [4, 10, 12, 19, 24];
        }
    }

    // Basic types
    const isMinor = quality.startsWith('m') && !quality.startsWith('maj');
    const isDominant =
        !isMinor &&
        !['dim', 'halfdim'].includes(quality) &&
        (is7th ||
            ['9', '11', '13', '7alt', '7b9', '7#9', '7#11', '7b13'].includes(quality) ||
            quality.startsWith('7'));
    const isMajor7 = ['maj7', 'maj9', 'maj11', 'maj13', 'maj7#11'].includes(quality);

    if (isMajor7) {
        if (quality === 'augmaj7') {
            return isRich ? [4, 8, 11, 14, 18] : [4, 8, 11]; // 3, #5, 7, (9, #11)
        }
        if (quality === 'maj13') {
            return isRich ? [4, 11, 14, 18, 21] : [4, 11, 14, 21]; // 3, 7, 9, (#11), 13
        }
        if (quality === 'maj7#11') {
            return isRich ? [4, 11, 14, 18] : [4, 11, 18]; // 3, 7, (9), #11
        }
        if (quality === 'maj9') {
            return isRich ? [4, 11, 14, 21] : [4, 11, 14];
        }

        // Standard Maj7: Use 3-5-7 for clarity, 3-7-9 for richness
        return isRich ? [4, 11, 14] : [4, 7, 11];
    }

    if (isMinor) {
        // Neo-Soul Quartal / Clusters
        if (genre === 'Neo-Soul' && quality === 'minor' && is7th) {
            // Modern quartal stacks: 4, b7, b3, 5, (9)
            // Added Clusters: 2nd + b3rd (2, 3) for that "crunch"
            if (isRich || intensity > 0.6) {
                return [2, 3, 5, 10, 15, 19];
            }
            return [5, 10, 15, 19];
        }
        if (quality === 'm13') {
            return isRich ? [3, 10, 14, 17, 21] : [3, 10, 14, 21]; // b3, b7, 9, (11), 13
        }
        if (quality === 'm11') {
            return isRich ? [3, 10, 14, 17] : [3, 10, 17]; // b3, (b7), 11
        }
        if (quality === 'm9') {
            return isRich ? [3, 10, 14, 17] : [3, 10, 14]; // b3, b7, 9, (11)
        }

        // Standard Minor 7: Use b3-5-b7 for clarity, b3-b7-9 for richness
        return isRich ? [3, 10, 14] : [3, 7, 10];
    }

    if (isDominant) {
        // Augmented Dominants
        if (quality === 'aug') {
            return isRich ? [4, 8, 10, 14] : [4, 8, 10]; // 3, #5, b7, (9)
        }

        // Alt Dominants
        if (quality === '7alt') {
            return isRich ? [4, 10, 13, 15, 18, 20] : [4, 10, 15, 20]; // 3, b7, #9, b13
        }
        if (quality === '7b9') {
            return isRich ? [4, 10, 13, 16, 20] : [4, 10, 13, 16]; // 3, b7, b9, (5 or b13)
        }
        if (quality === '7#9') {
            return isRich ? [4, 10, 15, 16, 20] : [4, 10, 15, 16]; // 3, b7, #9, (5 or b13)
        }
        if (quality === '7b13') {
            return isRich ? [4, 10, 14, 20, 26] : [4, 10, 14, 20]; // 3, b7, 9, b13
        }
        if (quality === '7#11') {
            return isRich ? [4, 10, 14, 18, 21] : [4, 10, 14, 18]; // 3, b7, 9, #11
        }

        // Characteristic dominant extensions
        if (quality === '13' || isRich) {
            return [4, 10, 14, 21]; // 3, b7, 9, 13
        }
        if (quality === '11') {
            return [5, 7, 10, 14]; // 11, 5, b7, 9
        }
        if (quality === '9') {
            return [4, 10, 14]; // 3, b7, 9
        }

        return [4, 7, 10]; // 3, 5, b7
    }

    if (quality === 'dim') {
        return [3, 6, 9, 14]; // b3, b5, bb7, 9
    }
    if (quality === 'halfdim') {
        return [3, 5, 6, 10]; // b3, 11, b5, b7
    }

    return null; // Fallback to standard triads
}

export function getIntervals(quality, is7th, density, genre = 'Rock', bassEnabled = true) {
    const { playback, groove } = getState();
    const isRich = density === 'rich';
    const intensity = playback.bandIntensity;

    const isAltered5 =
        quality.includes('alt') ||
        quality.includes('b5') ||
        quality.includes('#5') ||
        quality.includes('aug');
    const isAug = quality.includes('aug') || quality.includes('+');

    // 1. JAZZ & SOUL: ROOTLESS VOICINGS
    const shouldBeRootless =
        bassEnabled &&
        (groove.genreFeel === 'Swing' ||
            genre === 'Jazz' ||
            genre === 'Neo-Soul' ||
            genre === 'Funk' ||
            genre === 'Blues');
    if (shouldBeRootless) {
        const rootless = getRootlessVoicing(quality, is7th, isRich || intensity > 0.6);
        if (rootless) {
            return rootless;
        }
    }

    let intervals = null;

    // 2. POP & ROCK: SPREAD 10ths
    if (genre === 'Rock' || (genre === 'Bossa' && !shouldBeRootless)) {
        if (quality === 'major') {
            intervals = [0, 7, 16, 19]; // 1, 5, 10, 12
        } else if (quality === 'minor') {
            intervals = [0, 7, 15, 19]; // 1, 5, b10, 12
        }
    }

    if (!intervals) {
        // Standard Triad Fallback for others
        const isMinorQuality =
            (quality.startsWith('m') && !quality.startsWith('maj')) || quality === 'minor';

        if (quality === 'halfdim') {
            intervals = [0, 3, 6, 10];
        } else if (isMinorQuality) {
            intervals = [0, 3, 7];
        } else if (quality === 'dim') {
            intervals = [0, 3, 6];
        } else if (quality === 'aug') {
            intervals = is7th ? [0, 4, 8, 10] : [0, 4, 8];
        } else if (quality === 'augmaj7') {
            intervals = [0, 4, 8, 11];
        } else if (quality === 'maj7') {
            intervals = [0, 4, 7, 11];
        } else if (quality === 'sus4') {
            intervals = [0, 5, 7];
        } else if (quality === 'sus2') {
            intervals = [0, 2, 7];
        } else if (quality === 'add9') {
            intervals = [0, 4, 7, 14];
        } else if (quality === '6') {
            intervals = [0, 4, 7, 9];
        } else if (quality === 'm6') {
            intervals = [0, 3, 7, 9];
        } else if (quality === '9') {
            intervals = [0, 4, 7, 10, 14];
        } else if (quality === 'maj9') {
            intervals = [0, 4, 7, 11, 14];
        } else if (quality === 'm9') {
            intervals = [0, 3, 7, 10, 14];
        } else if (quality === '11') {
            intervals = [0, 5, 7, 10, 14, 17];
        } else if (quality === 'm11') {
            intervals = [0, 3, 7, 10, 14, 17];
        } else if (quality === 'maj11') {
            intervals = [0, 4, 7, 11, 14, 17];
        } else if (quality === 'maj7#11') {
            intervals = [0, 4, 7, 11, 14, 18];
        } else if (quality === '13') {
            intervals = [0, 4, 7, 10, 14, 21];
        } else if (quality === 'm13') {
            intervals = [0, 3, 7, 10, 14, 21];
        } else if (quality === 'maj13') {
            intervals = [0, 4, 7, 11, 14, 21];
        } else if (quality === '7alt') {
            intervals = [0, 4, 10, 13, 15, 18, 20];
        } else if (quality === '7b13') {
            intervals = [0, 4, 7, 10, 14, 20];
        } else if (quality === '7#11') {
            intervals = [0, 4, 7, 10, 14, 18];
        } else if (quality === '7b9') {
            intervals = [0, 4, 7, 10, 13];
        } else if (quality === '7#9') {
            intervals = [0, 4, 7, 10, 15];
        } else if (quality === '7b5') {
            intervals = [0, 4, 6, 10];
        } else if (quality === '5') {
            intervals = [0, 7];
        } else {
            intervals = [0, 4, 7]; // Default Major Triad
        }
    }

    // 3. INTENSITY-BASED EXTENSIONS
    // 0.6 - 0.7: Add 7ths/9ths (Targeting Pop/Rock/Acoustic)
    if (
        intensity >= 0.6 &&
        quality !== '5' &&
        !['Rock', 'Jazz', 'Funk'].includes(genre) &&
        !isAltered5
    ) {
        if (!is7th && quality !== '6' && quality !== 'm6') {
            const isMajor7th = ['maj7', 'maj9', 'maj11', 'maj13', 'maj7#11'].includes(quality);

            // Diatonic aware: If this is the tonic chord in a major key, prefer Maj7 (11)
            // Note: rootMidi isn't available here, but we can assume if it's a Major triad in a major key,
            // we should be careful.
            // Better strategy: Only add b7 if quality is explicitly dominant or if genre is bluesy.
            const seven = isMajor7th ? 11 : 10;

            // If it's a plain Major triad, don't just slam a b7 on it in Pop/Acoustic.
            if (quality === 'major' && !['Blues', 'Funk'].includes(genre)) {
                // Add nothing or add Maj7 (11) - let's stay safe and add 9th (14) only for now
            } else {
                if (!intervals.includes(seven)) {
                    intervals.push(seven);
                }
            }
        }
        if (!intervals.includes(14)) {
            intervals.push(14); // 9th
        }
    }

    // 0.8 - 1.0: Full Octave (add Root an octave up)
    if (intensity >= 0.8) {
        if (!intervals.includes(12)) {
            intervals.push(12);
        }
        // Also ensure 5th is there for "Wall of Sound"
        if (!isAltered5 && !isAug && !intervals.includes(7)) {
            intervals.push(7);
        }
        // For Rock, if high intensity, also add the 7th for more "grit"
        if (genre === 'Rock' && !intervals.includes(10) && quality !== 'maj7') {
            if (!intervals.includes(10)) {
                intervals.push(10);
            }
        }
    }

    // 4. DENSITY-BASED MODIFICATIONS
    if (density === 'thin' && intervals.length >= 4) {
        if (intervals.includes(7)) {
            intervals = intervals.filter((i) => i !== 7);
        }
    } else if (isRich && intervals.length <= 5 && quality !== '5') {
        const safeExtensions = {
            major: [14], // 9
            maj7: [14, 18], // 9, #11
            minor: [14, 17], // 9, 11
            m7: [14, 17], // 9, 11
            7: [14, 21], // 9, 13
            halfdim: [17], // 11
            aug: [14, 22], // 9, #11
            augmaj7: [14, 18], // 9, #11
            '7alt': [13, 15, 20], // b9, #9, b13
            9: [21], // 13
            13: [18], // #11
        };

        const potential = safeExtensions[quality] || (isAltered5 ? [14, 18] : [14]);
        for (const ext of potential) {
            if (!intervals.includes(ext) && !intervals.includes(ext % 12)) {
                // Final safety: don't add natural 5th if quality is altered/augmented
                if (ext % 12 === 7 && (isAltered5 || isAug)) {
                    continue;
                }

                intervals.push(ext);
                if (intervals.length >= 5) {
                    break;
                }
            }
        }
    }

    // 5. ENSURE 7th if requested but not present
    if (
        is7th &&
        ![
            'maj7',
            'maj9',
            'maj11',
            'maj13',
            'maj7#11',
            'aug',
            'augmaj7',
            'halfdim',
            '7b9',
            '7#9',
            '7alt',
            '9',
            'dim',
        ].includes(quality)
    ) {
        if (!intervals.includes(10)) {
            intervals.push(10);
        }
    }
    if (quality === 'dim' && is7th && !intervals.includes(9)) {
        intervals.push(9);
    }

    // FINAL SAFETY: if augmented or altered 5th, ensure natural 5th is NOT present
    if (isAltered5 || isAug) {
        intervals = intervals.filter((i) => i % 12 !== 7);
    }

    return intervals;
}

export function getFormattedChordNames(rootName, rootNNS, rootRomanBase, quality, is7th) {
    let absSuffix = '',
        nnsSuffix = '',
        romSuffix = '';
    if (quality === 'minor') {
        absSuffix = 'm';
        nnsSuffix = '-';
    } else if (quality === 'dim') {
        absSuffix = 'dim';
        nnsSuffix = '°';
        romSuffix = '°';
    } else if (quality === 'halfdim') {
        absSuffix = 'm7b5';
        nnsSuffix = 'ø';
        romSuffix = 'ø';
    } else if (quality === 'aug') {
        if (is7th) {
            absSuffix = '7+';
            nnsSuffix = '7+';
            romSuffix = '7+';
        } else {
            absSuffix = 'aug';
            nnsSuffix = '+';
            romSuffix = '+';
        }
    } else if (quality === 'augmaj7') {
        absSuffix = 'maj7#5';
        nnsSuffix = 'maj7+';
        romSuffix = 'maj7+';
    } else if (quality === 'maj7') {
        absSuffix = 'maj7';
        nnsSuffix = 'maj7';
        romSuffix = 'maj7';
    } else if (quality === 'maj9') {
        absSuffix = 'maj9';
        nnsSuffix = 'maj9';
        romSuffix = 'maj9';
    } else if (quality === 'maj13') {
        absSuffix = 'maj13';
        nnsSuffix = 'maj13';
        romSuffix = 'maj13';
    } else if (quality === 'm9') {
        absSuffix = 'm9';
        nnsSuffix = '-9';
        romSuffix = '9';
    } else if (quality === 'm11') {
        absSuffix = 'm11';
        nnsSuffix = '-11';
        romSuffix = '11';
    } else if (quality === 'm13') {
        absSuffix = 'm13';
        nnsSuffix = '-13';
        romSuffix = '13';
    } else if (quality === 'maj11') {
        absSuffix = 'maj11';
        nnsSuffix = 'maj11';
        romSuffix = 'maj11';
    } else if (quality === 'maj7#11') {
        absSuffix = 'maj7#11';
        nnsSuffix = 'maj7#11';
        romSuffix = 'maj7#11';
    } else if (quality === 'sus4') {
        absSuffix = 'sus4';
        nnsSuffix = 'sus4';
        romSuffix = 'sus4';
    } else if (quality === 'sus2') {
        absSuffix = 'sus2';
        nnsSuffix = 'sus2';
        romSuffix = 'sus2';
    } else if (quality === 'add9') {
        absSuffix = 'add9';
        nnsSuffix = 'add9';
        romSuffix = 'add9';
    } else if (quality === '6') {
        absSuffix = '6';
        nnsSuffix = '6';
        romSuffix = '6';
    } else if (quality === 'm6') {
        absSuffix = 'm6';
        nnsSuffix = '-6';
        romSuffix = '6';
    } else if (quality === '9') {
        absSuffix = '9';
        nnsSuffix = '9';
        romSuffix = '9';
    } else if (quality === '11') {
        absSuffix = '11';
        nnsSuffix = '11';
        romSuffix = '11';
    } else if (quality === '13') {
        absSuffix = '13';
        nnsSuffix = '13';
        romSuffix = '13';
    } else if (quality === '7alt') {
        absSuffix = '7alt';
        nnsSuffix = '7alt';
        romSuffix = '7alt';
    } else if (quality === '7b9') {
        absSuffix = '7b9';
        nnsSuffix = '7b9';
        romSuffix = '7b9';
    } else if (quality === '7#9') {
        absSuffix = '7#9';
        nnsSuffix = '7#9';
        romSuffix = '7#9';
    } else if (quality === '7#11') {
        absSuffix = '7#11';
        nnsSuffix = '7#11';
        romSuffix = '7#11';
    } else if (quality === '7b13') {
        absSuffix = '7b13';
        nnsSuffix = '7b13';
        romSuffix = '7b13';
    } else if (quality === '5') {
        absSuffix = '5';
        nnsSuffix = '5';
        romSuffix = '5';
    }

    if (
        is7th &&
        ![
            'maj7',
            'maj9',
            'maj11',
            'maj13',
            'maj7#11',
            'aug',
            'augmaj7',
            'halfdim',
            '7b9',
            '7#9',
            '7alt',
            '7#11',
            '7b13',
            '9',
            '11',
            '13',
            'm9',
            'm11',
            'm13',
        ].includes(quality)
    ) {
        absSuffix += '7';
        nnsSuffix += '7';
        romSuffix += '7';
    }

    let romanName;
    if (
        quality === 'minor' ||
        quality === 'dim' ||
        quality === 'halfdim' ||
        quality === 'm9' ||
        quality === 'm11' ||
        quality === 'm13' ||
        quality === 'm6'
    ) {
        romanName = rootRomanBase.toLowerCase();
    } else {
        romanName = rootRomanBase;
    }

    return {
        name: { root: rootName, suffix: absSuffix },
        nns: { root: rootNNS, suffix: nnsSuffix },
        roman: { root: romanName, suffix: romSuffix },
    };
}

/**
 * Parses a single progression string part (e.g., from one section).
 * @param {string} input
 * @param {string} key
 * @param {string} timeSignature
 * @param {number[]} initialMidis
 * @returns {{chords: Array, finalMidis: number[]}}
 */
function parseProgressionPart(input, key, timeSignature, initialMidis) {
    const { chords, groove, bass } = getState();
    const parsed = [];
    const baseOctave = Math.floor(chords.octave / 12) * 12;
    const keyRootMidi = baseOctave + KEY_ORDER.indexOf(normalizeKey(key));

    const barParts = input.split(/(\|)/);
    let lastMidis = initialMidis || [];
    let charOffset = 0;

    barParts.forEach((barOrPipe) => {
        if (barOrPipe === '|') {
            charOffset += 1;
            return;
        }

        const barText = barOrPipe;
        const chordTokens = barText.split(/(\s+)/);
        const actualChordParts = chordTokens.filter((t) => t.trim() && t !== '|');

        const ts = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES['4/4'];
        const beatsPerChord = actualChordParts.length > 0 ? ts.beats / actualChordParts.length : 0;

        let barInternalOffset = 0;
        chordTokens.forEach((token) => {
            if (token.trim().length > 0) {
                const part = token.trim();
                const [chordPart, bassPart] = part.split('/');

                const { rootMidi, rootPart, romanMatch } = resolveChordRoot(
                    chordPart,
                    keyRootMidi,
                    baseOctave,
                );

                // Handle slash bass if present
                let bassMidi = null;
                let bassNameAbs = null,
                    bassNameNNS = null,
                    bassNameRom = null;
                if (bassPart) {
                    const resolvedBass = resolveChordRoot(bassPart, keyRootMidi, baseOctave);
                    bassMidi = resolvedBass.rootMidi;

                    const bassInterval = (bassMidi - keyRootMidi + 24) % 12;
                    bassNameAbs = KEY_ORDER[bassMidi % 12];
                    bassNameNNS = INTERVAL_TO_NNS[bassInterval];
                    bassNameRom = INTERVAL_TO_ROMAN[bassInterval];
                }

                const suffixPart = chordPart.slice(rootPart.length);
                let { quality, is7th } = getChordDetails(suffixPart);

                if (romanMatch) {
                    const accidental = romanMatch[1] || '';
                    const numeral = romanMatch[2];
                    const isLowercase = numeral === numeral.toLowerCase();

                    if (isLowercase) {
                        if (quality === 'major' || quality === '7') {
                            quality = 'minor';
                        } else if (quality === '9') {
                            quality = 'm9';
                        } else if (quality === '11') {
                            quality = 'm11';
                        } else if (quality === '13') {
                            quality = 'm13';
                        }
                    }

                    // Only auto-diminished if it's a natural vii (no b or # prefix)
                    if (
                        numeral.toLowerCase() === 'vii' &&
                        !accidental &&
                        !suffixPart.match(/(maj|min|m|dim|o|°|aug|\+|ø|h|7b5)/)
                    ) {
                        quality = 'halfdim';
                        is7th = true;
                    }
                }

                const intervals = getIntervals(
                    quality,
                    is7th,
                    chords.density,
                    groove.genreFeel,
                    bass.enabled || chords.pianoRoots,
                );
                // Reduce mud: if bass is active, keep piano above E3 (52)
                const pianoMin = bass.enabled || chords.pianoRoots ? 52 : 43;
                const isPivot = parsed.length === 0;
                let currentMidis = getBestInversion(
                    rootMidi,
                    intervals,
                    lastMidis,
                    isPivot,
                    chords.octave,
                    pianoMin,
                    84,
                );
                if (bassMidi !== null) {
                    const bassPC = bassMidi % 12;
                    const filtered = currentMidis.filter((m) => m % 12 !== bassPC);
                    if (filtered.length > 0) {
                        currentMidis = filtered;
                    }
                    currentMidis.unshift(bassMidi);
                    currentMidis.sort((a, b) => a - b);
                }
                lastMidis = currentMidis;

                const interval = (rootMidi - keyRootMidi + 24) % 12;
                const rootNNS = INTERVAL_TO_NNS[interval];
                const displayRomanBase = INTERVAL_TO_ROMAN[interval];
                const rootName = KEY_ORDER[rootMidi % 12];

                const formatted = getFormattedChordNames(
                    rootName,
                    rootNNS,
                    displayRomanBase,
                    quality,
                    is7th,
                );

                let finalAbsName = formatted.name.root + formatted.name.suffix;
                let finalNNSName = formatted.nns.root + formatted.nns.suffix;
                let finalRomName = formatted.roman.root + formatted.roman.suffix;

                if (bassPart && bassNameAbs) {
                    finalAbsName += `/${bassNameAbs}`;
                    finalNNSName += `/${bassNameNNS}`;
                    finalRomName += `/${bassNameRom}`;
                    formatted.name.bass = bassNameAbs;
                    formatted.nns.bass = bassNameNNS;
                    formatted.roman.bass = bassNameRom;
                }

                const isMinor =
                    quality === 'minor' ||
                    quality === 'dim' ||
                    quality === 'halfdim' ||
                    quality === 'm9' ||
                    quality === 'm11' ||
                    quality === 'm13' ||
                    quality === 'm6';

                parsed.push({
                    romanName: finalRomName,
                    absName: finalAbsName,
                    nnsName: finalNNSName,
                    display: formatted,
                    isMinor: isMinor,
                    beats: beatsPerChord,
                    freqs: currentMidis.map(getFrequency),
                    rootMidi: rootMidi,
                    bassMidi: bassMidi,
                    intervals: intervals,
                    quality: quality,
                    is7th: is7th,
                    charStart: charOffset + barInternalOffset,
                    charEnd: charOffset + barInternalOffset + token.length,
                    timeSignature: timeSignature,
                    key: key,
                });
            }
            barInternalOffset += token.length;
        });
        charOffset += barText.length;
    });

    return { chords: parsed, finalMidis: lastMidis };
}

/**
 * Parses the progression input string and updates the chord state.
 * @param {Function} renderCallback - Callback to trigger visual update.
 */
export function validateProgression(renderCallback) {
    const { arranger } = getState();
    let allChords = [];
    let lastMidis = [];

    arranger.sections.forEach((section) => {
        try {
            const repeats = section.repeat || 1;
            const sectionKey = section.key || arranger.key;
            const sectionTS = section.timeSignature || arranger.timeSignature;

            for (let r = 0; r < repeats; r++) {
                const { chords, finalMidis } = parseProgressionPart(
                    section.value,
                    sectionKey,
                    sectionTS,
                    lastMidis,
                );
                const taggedChords = chords.map((c, idx) => ({
                    ...c,
                    sectionId: section.id,
                    sectionLabel: section.label,
                    localIndex: idx,
                    repeatIndex: r,
                }));
                allChords = allChords.concat(taggedChords);
                lastMidis = finalMidis;
            }
        } catch (e) {
            console.error(`[Arranger] Error parsing section "${section.label}":`, e);
            // Optionally add a placeholder "Error" chord to the progression to keep the structure intact
        }
    });

    arranger.progression = allChords;
    Object.assign(arranger, { progression: allChords });
    updateProgressionCache();
    dispatch('PROG_VALIDATED'); // Notify Preact
    if (renderCallback) {
        renderCallback();
    }
}

/**
 * Caches progression metadata to avoid redundant calculations in the scheduler.
 */
function updateProgressionCache() {
    const { arranger } = getState();
    if (!arranger.progression.length) {
        Object.assign(arranger, {
            totalSteps: 0,
            stepMap: [],
            measureMap: [],
            sectionMap: [],
        });
        return;
    }

    let current = 0;
    const newStepMap = arranger.progression.map((chord) => {
        const tsName = chord.timeSignature || arranger.timeSignature;
        const ts = TIME_SIGNATURES[tsName] || TIME_SIGNATURES['4/4'];
        const steps = Math.round(chord.beats * ts.stepsPerBeat);
        const entry = { start: current, end: current + steps, chord };
        current += steps;
        return entry;
    });

    const newSectionMap = [];
    const newMeasureMap = [];

    let mapIndex = 0;
    let sectionAcc = 0;

    arranger.sections.forEach((section) => {
        const sectionStart = sectionAcc;
        let iterationSteps = 0;

        const startMapIndex = mapIndex;

        while (mapIndex < newStepMap.length) {
            const entry = newStepMap[mapIndex];

            if (entry.chord.sectionId !== section.id) {
                break;
            }

            if (mapIndex > startMapIndex) {
                const prevEntry = newStepMap[mapIndex - 1];
                if (entry.chord.localIndex <= prevEntry.chord.localIndex) {
                    if (entry.chord.repeatIndex !== prevEntry.chord.repeatIndex + 1) {
                        break;
                    }
                }
            }

            if (entry.chord.repeatIndex === 0) {
                iterationSteps += entry.end - entry.start;
            }

            mapIndex++;
        }

        const totalSectionSteps =
            mapIndex > startMapIndex
                ? newStepMap[mapIndex - 1].end - newStepMap[startMapIndex].start
                : 0;

        newSectionMap.push({
            id: section.id,
            start: sectionStart,
            end: sectionStart + totalSectionSteps,
            label: section.label,
            syllables: section.syllables,
        });
        sectionAcc += totalSectionSteps;

        if (iterationSteps > 0) {
            const repeats = section.repeat || 1;
            const tsName = section.timeSignature || arranger.timeSignature;
            const ts = TIME_SIGNATURES[tsName] || TIME_SIGNATURES['4/4'];
            const stepsPerMeasure = Math.round(ts.beats * ts.stepsPerBeat);

            let stepAccLocal = sectionStart;

            for (let r = 0; r < repeats; r++) {
                let sectionStep = 0;
                while (sectionStep < iterationSteps) {
                    const measureEnd = Math.min(sectionStep + stepsPerMeasure, iterationSteps);
                    newMeasureMap.push({
                        start: stepAccLocal + sectionStep,
                        end: stepAccLocal + measureEnd,
                        ts: tsName,
                    });
                    sectionStep += stepsPerMeasure;
                }
                stepAccLocal += iterationSteps;
            }
        }
    });

    Object.assign(arranger, {
        totalSteps: current,
        stepMap: newStepMap,
        sectionMap: newSectionMap,
        measureMap: newMeasureMap,
    });
}
