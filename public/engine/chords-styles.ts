import type { EnsembleState } from '../types.js';
import { shouldUseRootlessVoicing } from './voicing-policy.js';

export function getRootlessVoicing(
    state: EnsembleState,
    quality: string,
    is7th: boolean,
    isRich: boolean,
): number[] | null {
    const { groove, playback } = state;
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
            // why: D'Angelo quartal m11 voicing — b3, 4, b7, 9 (pcs 3, 5, 10, 14).
            // Prior [2, 3, 5, 10, 15, 19] stacked pc 2 (9) and 3 (b3) as adjacent
            // semitones in the SAME octave — a half-step cluster that reads as a
            // mistake, not the canonical "neo-soul crunch." The replacement keeps
            // the b3 (which is what makes the chord sound minor) and lifts the 9
            // up a whole step from the b3, so no in-octave half-step neighbors.
            if (isRich || intensity > 0.6) {
                return [3, 5, 10, 14];
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
            // Must have: 3, b7 AND at least one altered extension (b9/13 or #9/20)
            const base = [4, 10];
            const altExtensions = intensity > 0.6 ? [13, 15, 20] : [13, 20];
            return isRich ? [4, 10, 13, 15, 18, 20] : [...base, ...altExtensions.slice(0, 2)];
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
        // b3, b5, bb7 (9) are essential. Add 9 (14) for richness.
        return isRich ? [3, 6, 9, 14, 18] : [3, 6, 9];
    }
    if (quality === 'halfdim') {
        // b3, 11, b5, b7 + (9 in rich)
        return isRich ? [3, 6, 10, 14, 17] : [3, 6, 10];
    }

    return null; // Fallback to standard triads
}

export function getIntervals(
    state: EnsembleState,
    quality: string,
    is7th: boolean,
    density: string,
    genre = 'Rock',
): number[] {
    const { playback } = state;
    const isRich = density === 'rich';
    const intensity = playback.bandIntensity;

    const isAltered5 =
        quality.includes('alt') ||
        quality.includes('b5') ||
        quality.includes('#5') ||
        quality.includes('aug');
    const isAug = quality.includes('aug') || quality.includes('+');

    // 1. JAZZ & SOUL: ROOTLESS VOICINGS
    const shouldBeRootless = shouldUseRootlessVoicing(state, quality, is7th, genre);
    if (shouldBeRootless) {
        const rootless = getRootlessVoicing(state, quality, is7th, isRich || intensity > 0.6);
        if (rootless) {
            return rootless;
        }
    }

    let intervals: number[] | null = null;

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
        const safeExtensions: Record<string, number[]> = {
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
