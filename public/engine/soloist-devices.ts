const JAZZ_GUITAR_STYLES = new Set(['jazz', 'bird', 'bossa']);
const GROOVE_GUITAR_STYLES = new Set(['funk', 'reggae', 'ska']);
const HIGH_ENERGY_GUITAR_STYLES = new Set(['metal', 'scalar']);

/**
 * Soloist Melodic Devices Module. `consonantDoubleStopInterval` and
 * `guitarDoubleStopVoice` are the live phrase-first double-stop helpers;
 * `getChordMask` / `getGuitarIntervalPalette` / `selectGuitarSupportMidi`
 * are their private support functions.
 */

// DEVICE_SPAN_STEPS (per-device worst-case step spans) removed in epic #10/#866 —
// it gated device firings against the rhythm plan inside the retired legacy picker
// (selectPitchAndDevices). The generateMelodicDevice/generateExtraNotes device
// generators it once gated were themselves confirmed dead (test-only importer)
// and removed in #939.

/**
 * Computes a bitmask of intervals present in the current chord.
 */
function getChordMask(currentChord: any): number {
    let mask = 0;
    if (currentChord?.intervals) {
        for (let i = 0; i < currentChord.intervals.length; i++) {
            const intv = ((currentChord.intervals[i] % 12) + 12) % 12;
            mask |= 1 << intv;
        }
    }
    return mask;
}

/**
 * Pick a double-stop interval whose harmonized voice stays consonant with the
 * chord, instead of a coin-flip between major/minor interval qualities. `base`
 * is the lead pitch; `candidates` are signed semitone offsets in preference
 * order, major-quality first by convention (e.g. `[9, 8]` = major-then-minor
 * 6th above, `[4, 3]` = major-then-minor 3rd above). Returns the first
 * candidate that lands the harmony voice on a chord tone — so the chosen
 * quality VARIES naturally with the melody note (a 3rd above the chord root is
 * major, a 3rd above the chord 3rd is minor), which is exactly the diatonic
 * country-harmony idiom. If neither candidate is a chord tone, falls back to the
 * interval matching the chord's own third quality (minor chord → the last/minor
 * candidate) so the stack still colors with the harmony. Why: a randomly-chosen
 * maj/min 3rd or 6th over a chord of the opposite quality reads as a wrong-note
 * clash — the country chickenPick (3rds) and 6th double-stops. #855.
 */
export function consonantDoubleStopInterval(
    base: number,
    candidates: number[],
    chord: any,
): number {
    const mask = getChordMask(chord);
    const root = (((chord?.rootMidi ?? 0) % 12) + 12) % 12;
    for (const iv of candidates) {
        const interval = ((((base + iv) % 12) + 12) % 12) - root;
        const pc = (interval + 12) % 12;
        if ((mask >> pc) & 1) {
            return iv;
        }
    }
    const quality = chord?.quality || 'major';
    const isMinor = quality.startsWith('m') && !quality.startsWith('maj');
    return isMinor ? candidates[candidates.length - 1] : candidates[0];
}

interface GuitarIntervalPaletteOptions {
    activeStyle: string;
    supportHint?: any;
}

function getGuitarIntervalPalette(options: GuitarIntervalPaletteOptions): number[] {
    const { activeStyle, supportHint } = options;
    const palette = supportHint?.intervalPalette;

    if (palette === 'blues' || activeStyle === 'blues') {
        return [3, 4, 5, 7, 6];
    }
    if (palette === 'open' || activeStyle === 'country') {
        return [7, 5, 9, 4, 3];
    }
    if (JAZZ_GUITAR_STYLES.has(activeStyle)) {
        return [3, 4, 7, 5];
    }
    if (GROOVE_GUITAR_STYLES.has(activeStyle)) {
        return [4, 5, 3, 7];
    }
    if (activeStyle === 'neo') {
        return [5, 7, 4, 3, 9];
    }
    if (activeStyle === 'rock') {
        return [4, 5, 3, 7, 8];
    }
    if (HIGH_ENERGY_GUITAR_STYLES.has(activeStyle)) {
        return [5, 7, 4, 3];
    }
    return [3, 4, 5, 7, 8, 9];
}

interface GuitarSupportMidiOptions {
    currentChord: any;
    activeStyle: string;
    selectedMidi: number;
    supportHint?: any;
}

/**
 * Choose a supportive lower voice that sounds like a guitarist reinforcing the melody,
 * not like a generic chord-stack algorithm filling space.
 */
function selectGuitarSupportMidi(options: GuitarSupportMidiOptions): number {
    const { currentChord, activeStyle, selectedMidi, supportHint } = options;
    const currentRoot = currentChord.rootMidi;
    const chordMask = getChordMask(currentChord);
    const intervalPalette = getGuitarIntervalPalette({ activeStyle, supportHint });
    const supportRole = supportHint?.role || 'line';
    const isJazzStyle = JAZZ_GUITAR_STYLES.has(activeStyle);
    const isGrooveStyle = GROOVE_GUITAR_STYLES.has(activeStyle);
    const isHighEnergyStyle = HIGH_ENERGY_GUITAR_STYLES.has(activeStyle);
    const supportFloor = Math.max(
        isJazzStyle ? 57 : isGrooveStyle ? 55 : 52,
        selectedMidi - (isJazzStyle ? 10 : 12),
    );

    let bestMidi = Number.NaN;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < intervalPalette.length; i++) {
        const dsInt = intervalPalette[i];
        const candidateMidi = selectedMidi - dsInt;
        if (candidateMidi < supportFloor || candidateMidi >= selectedMidi) {
            continue;
        }

        const pc = ((candidateMidi % 12) + 12) % 12;
        const interval = (pc - (currentRoot % 12) + 12) % 12;
        const isChordTone = Boolean((chordMask >> interval) & 1);

        let score = isChordTone ? 6 : -2.5;

        if (dsInt === 3 || dsInt === 4) {
            score += activeStyle === 'blues' ? 4 : 3;
        } else if (dsInt === 5) {
            score += 2.5;
        } else if (dsInt === 7) {
            score += supportHint?.intervalPalette === 'open' ? 3.5 : 1.5;
        } else if (dsInt >= 8) {
            score += supportHint?.intervalPalette === 'open' ? 2 : -1;
        }

        if (activeStyle === 'neo' && (dsInt === 5 || dsInt === 7)) {
            score += 1.5;
        }
        if (activeStyle === 'rock' && (dsInt === 4 || dsInt === 5 || dsInt === 7)) {
            score += 1.2;
        }
        if (isJazzStyle) {
            if (dsInt === 3 || dsInt === 4) {
                score += 3.2;
            } else if (dsInt === 7) {
                score += 1.8;
            } else if (dsInt >= 8) {
                score -= 2.4;
            }
        }
        if (isGrooveStyle) {
            if (dsInt === 4 || dsInt === 5) {
                score += 2.4;
            }
            if (dsInt >= 7) {
                score -= 1.8;
            }
        }
        if (isHighEnergyStyle) {
            if (dsInt === 5 || dsInt === 7) {
                score += 2.1;
            } else if (dsInt >= 8) {
                score -= 2.2;
            }
        }
        if (supportRole === 'cadence' && isChordTone) {
            score += 2;
        }
        if ((supportHint?.sustainBias || 0) >= 0.85 && (dsInt === 5 || dsInt === 7)) {
            score += 1.4;
        }
        if (supportRole === 'anchor' || supportRole === 'cadence') {
            if (dsInt === 4 || dsInt === 5) {
                score += 1.5;
            }
            if (dsInt >= 8) {
                score -= 0.75;
            }
        }
        if (supportRole === 'accent') {
            if (dsInt === 3 || dsInt === 4) {
                score += 0.8;
            }
            if (dsInt === 7) {
                score += 0.5;
            }
        }
        if (supportRole === 'line') {
            if (dsInt >= 7) {
                score -= 1.5;
            }
            if (dsInt === 3 || dsInt === 4 || dsInt === 5) {
                score += 0.8;
            }
            if (isGrooveStyle || isHighEnergyStyle) {
                score -= 0.8;
            }
            if (isJazzStyle && dsInt >= 7) {
                score -= 1.1;
            }
        }
        if (candidateMidi < 57) {
            score -= 1;
        }
        if (candidateMidi < 60 && supportRole === 'line') {
            score -= 1.25;
        }
        if (selectedMidi - candidateMidi > 9 && supportRole !== 'cadence') {
            score -= 1;
        }

        if (score > bestScore) {
            bestScore = score;
            bestMidi = candidateMidi;
        }
    }

    if (!Number.isFinite(bestMidi)) {
        return selectedMidi - (activeStyle === 'blues' ? 5 : 4);
    }

    return bestMidi;
}

/**
 * #856 — a single chord-aware harmony voice a 3rd/6th BELOW `leadMidi` for a
 * guitar-mode double-stop, scored by the same `selectGuitarSupportMidi` selector
 * the legacy polyphony path uses (chord-tone preference + genre interval
 * palette). Returns null if it can't place a voice strictly below the lead.
 * Used by the phrase-first engine to add sparse double-stop punctuation —
 * phrase-first builds single notes, so this is its only double-stop source.
 */
export function guitarDoubleStopVoice(
    currentChord: any,
    leadMidi: number,
    activeStyle: string,
    supportRole = 'accent',
): number | null {
    const midi = selectGuitarSupportMidi({
        currentChord,
        activeStyle,
        selectedMidi: leadMidi,
        supportHint: { role: supportRole, sustainBias: 0.7 },
    });
    return Number.isFinite(midi) && midi < leadMidi ? midi : null;
}
