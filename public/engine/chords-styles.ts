import type { EnsembleState } from '../types.js';
import { NEVER_ROOTLESS_DOMINANT_QUALITIES, shouldUseRootlessVoicing } from './voicing-policy.js';

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

    // #1313 — a 6th chord has no 7th to build a shell from. Falling through to the
    // minor-7 shell below swapped the 6th for an unwritten b7 (Dm6 -> F-A-C, an F
    // major triad). `shouldUseRootlessVoicing` no longer routes m6 here; this keeps
    // the function honest for any direct caller: null = use the rooted [0,3,7,9].
    if (quality === 'm6') {
        return null;
    }

    // #1336 — same class as the m6 refusal above, one alteration over: `m#5` is a TRIAD, so
    // it has no 3rd-plus-7th shell to state. It is in the minor family (`startsWith('m')`
    // and not 'maj'), so without this it fell through to the minor-7 shell and came back
    // [3, 7, 10] — a natural 5 over a chord written with a sharp one, plus an unwritten b7.
    // `shouldUseRootlessVoicing` already says no (its minor bucket requires `is7th`); this
    // keeps the function honest for any direct caller. null = use the rooted [0, 3, 8].
    if (quality === 'm#5') {
        return null;
    }

    // #1316 — same class as the m6 refusal above: a suspension, an added tone or a
    // 6th has no 3rd-plus-b7 shell to state, so the `is7th` string heuristic routing
    // one here produced a different chord (G7sus4 -> B-D-F, a plain G7; Cadd9 ->
    // Bb-E-G, a C9). null = use the rooted `getIntervals` stack. Kept in lockstep
    // with the same guard in `shouldUseRootlessVoicing` so a direct caller of this
    // function can't reach the shell either.
    if (NEVER_ROOTLESS_DOMINANT_QUALITIES.has(quality)) {
        return null;
    }

    // Basic types
    const isMinor = quality.startsWith('m') && !quality.startsWith('maj');
    const isDominant =
        !isMinor &&
        !['dim', 'halfdim'].includes(quality) &&
        (is7th ||
            ['9', '11', '13', '7alt', '7b9', '7#9', '7#11', '7b13'].includes(quality) ||
            quality.startsWith('7'));
    // 'augmaj7' belongs here (its shell is the first branch below). It was missing,
    // which stayed invisible while the old default grounded the quality; reachable
    // over a sounding bass (#1313) it fell through to the DOMINANT shell — Cmaj7#5
    // voiced as E-G-Bb, a C7.
    const isMajor7 = [
        'maj7',
        'maj9',
        'maj11',
        'maj13',
        'maj7#11',
        // #1329 — without this the dominant branch answered [4, 7, 10]: a C7 shell, natural
        // 5th and b7, for a chord written with a FLAT 5 and a major 7th.
        'maj7b5',
        'augmaj7',
    ].includes(quality);

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
        if (quality === 'maj7b5') {
            return isRich ? [4, 6, 11, 14] : [4, 6, 11]; // 3, b5, 7, (9) — never the 5th
        }
        if (quality === 'maj9') {
            return isRich ? [4, 11, 14, 21] : [4, 11, 14];
        }

        // Standard Maj7: Use 3-5-7 for clarity, 3-7-9 for richness
        return isRich ? [4, 11, 14] : [4, 7, 11];
    }

    if (isMinor) {
        // #1321 — the minor-major 7th is in the minor family (b3), so without its own
        // branch it fell through to the minor-7 shell below and swapped its defining
        // maj7 for a b7 — a plain m7. Shell mirrors the maj7 family's (3-5-7 for
        // clarity, 3-7-9 for richness) with the minor 3rd, which is the idiomatic
        // rootless minor-major voicing.
        if (quality === 'mMaj7') {
            return isRich ? [3, 11, 14] : [3, 7, 11]; // b3, (5 | 7, 9)
        }
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
            // Must have: 3, b7 AND at least one altered extension. The lean shell takes the
            // b9 plus ONE more: the #9 when the band is loud enough to carry that heat,
            // otherwise the b13.
            // why: the old form listed three extensions at high intensity and then
            // `.slice(0, 2)` them, so the third (b13) was unreachable and the line read as
            // "b9 + #9 + b13" when it played "b9 + #9". Behaviour-identical at every
            // intensity and density — the slice's only effect was dropping that dead entry.
            const altExtensions = intensity > 0.6 ? [13, 15] : [13, 20];
            return isRich ? [4, 10, 13, 15, 18, 20] : [4, 10, ...altExtensions];
        }
        if (quality === '7b9') {
            // 3, b7, b9 + the 5th, or the b13 in its place when rich. (The old top
            // voice was 16 = the 3rd again an octave up, not the "5 or b13" its
            // comment claimed — a doubled 3rd a half-step over the b9.)
            return isRich ? [4, 10, 13, 20] : [4, 10, 13, 19];
        }
        if (quality === '7#9') {
            // 3, b7, #9 — the "Hendrix" shell, 3rd below and #9 on top a major 7th
            // apart; rich adds the b13. The old 16 doubled the major 3rd directly
            // above the #9, cancelling the blue note into a half-step smear.
            return isRich ? [4, 10, 15, 20] : [4, 10, 15];
        }
        if (quality === '7b13') {
            return isRich ? [4, 10, 14, 20, 26] : [4, 10, 14, 20]; // 3, b7, 9, b13
        }
        if (quality === '7#11') {
            return isRich ? [4, 10, 14, 18, 21] : [4, 10, 14, 18]; // 3, b7, 9, #11
        }
        if (quality === '7b5') {
            return isRich ? [4, 6, 10, 14] : [4, 6, 10]; // 3, b5, b7, (9)
        }

        // #1326 — a dominant 11th's shell must be evaluated BEFORE the `isRich` shortcut
        // below. Underneath it, a written C11 at rich density (or intensity > 0.6, which
        // sets isRich for this call) came back as the 13 shell: it stated the major 3rd the
        // chord conventionally omits and lost the 4th/11th it exists to feature — E against
        // F, the textbook avoid-note rub. 4-b7-9 is the shell; rich adds the 13 on top.
        // `m11` is unaffected and stays in the minor branch above (b3 + 11 is consonant).
        if (quality === '11') {
            return isRich ? [5, 10, 14, 21] : [5, 10, 14]; // 4, b7, 9, (13)
        }

        // Characteristic dominant extensions
        if (quality === '13' || isRich) {
            return [4, 10, 14, 21]; // 3, b7, 9, 13
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

// why: a strummed instrument (guitar) rolls its strings low→high; a keyboard
// STRIKES a block chord, all voices essentially together. The comp's strum
// stagger should therefore follow the VOICE, not the genre — so it stays off for
// every keyboard voice (piano/Rhodes/organ/clav/grand) and only engages when a
// guitar voice is selected for the chords lane (e.g. the electric-guitar chords
// pack, #698). Keyed off the `chords.voice` string (`pack:<id>` or a synth name)
// so no audio-layer import is needed; today no chord voice is a guitar, so this
// is universally false and chords strike a block. Single source of truth for the
// strum decision, shared by the comp emitter and the scheduler's strum-rank.
export function isStrummedChordVoice(voice: string | undefined | null): boolean {
    return typeof voice === 'string' && voice.toLowerCase().includes('guitar');
}

/**
 * Qualities whose NAME says the colour tone stands in for the seventh, so the
 * intensity-driven extension tier must never backfill one (#1322). `6`/`m6` were already
 * hard-coded here; `add9`/`add2`/`6/9`/`madd9` only became reachable once `is7th` stopped
 * being sniffed out of the raw symbol — before that their `is7th: true` accidentally
 * skipped the same block. A written `Cadd9` gaining a b7 at intensity 0.6 is the same
 * defect by a different route.
 */
const NO_SEVENTH_QUALITIES = new Set(['6', 'm6', '6/9', 'add9', 'add2', 'madd9']);

export function getIntervals(
    state: EnsembleState,
    quality: string,
    is7th: boolean,
    density: string,
    genre = 'Rock',
    bassActive = Boolean(state.bass?.enabled),
): number[] {
    const { playback } = state;
    const isRich = density === 'rich';
    const intensity = playback.bandIntensity;

    // why (#1315): a diminished chord's 5th IS altered — 'dim' and 'halfdim' are the
    // canonical names for it (`getChordDetails` never emits 'dim7'/'m7b5'), so the
    // name-shape tests below could never match them. That let the intensity >= 0.8
    // "Wall of Sound" backfill stack a PERFECT 5th a semitone above the chord's own
    // b5 (Bm7b5 -> B3 F4 F#4 A4 D5) in every genre whenever the band got loud, and
    // let the >= 0.6 extension block slam a b7 onto a plain diminished triad (a
    // written B dim came out B D F A, a Bm7b5). Both now read the flat 5 as the
    // alteration it is.
    const isAltered5 =
        quality === 'dim' ||
        quality === 'halfdim' ||
        quality.includes('alt') ||
        quality.includes('b5') ||
        quality.includes('#5') ||
        quality.includes('aug');
    const isAug = quality.includes('aug') || quality.includes('+');
    // why (#1324): the same shape as isAltered5 one interval up. A chart that writes an
    // ALTERED 9th has said "not the natural 9", so the colour/extension tiers below must
    // not backfill a natural 9 a semitone from it — G7b9 came out with both the b9 (13)
    // and a natural 9 (14) at intensity >= 0.6 outside Rock/Jazz/Funk, the exact
    // b5-next-to-natural-5 defect #1315 fixed for the diminished family. '7alt' is
    // covered by its own name; the 13b9/13#9 spellings now map to 7b9/7#9 upstream.
    const isAltered9 = quality.includes('alt') || quality.includes('b9') || quality.includes('#9');

    // 1. JAZZ & SOUL: ROOTLESS VOICINGS
    const shouldBeRootless = shouldUseRootlessVoicing(state, quality, is7th, genre, bassActive);
    if (shouldBeRootless) {
        const rootless = getRootlessVoicing(state, quality, is7th, isRich || intensity > 0.6);
        if (rootless) {
            return rootless;
        }
    }

    let intervals: number[] | null = null;

    // 2. POP & ROCK: SPREAD 10ths
    if (genre === 'Rock' || (genre === 'Bossa Nova' && !shouldBeRootless)) {
        if (quality === 'major') {
            intervals = [0, 7, 16, 19]; // 1, 5, 10, 12
        } else if (quality === 'minor') {
            intervals = [0, 7, 15, 19]; // 1, 5, b10, 12
        }
    }

    if (!intervals) {
        // Standard Triad Fallback for others
        // #1313 — match the plain minor triad by NAME. A `startsWith('m')` family
        // test here sat above the explicit m6/m9/m11/m13 branches below and
        // shadowed all four, so a written Am6 sounded as a bare Am (no 6th).
        if (quality === 'halfdim') {
            intervals = [0, 3, 6, 10];
        } else if (quality === 'minor') {
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
        } else if (quality === '7sus4') {
            intervals = [0, 5, 7, 10]; // 1 4 5 b7 — suspended dominant
        } else if (quality === 'sus2') {
            intervals = [0, 2, 7];
        } else if (quality === 'add9') {
            intervals = [0, 4, 7, 14];
        } else if (quality === 'add2') {
            intervals = [0, 2, 4, 7]; // 1 2 3 5 — added 2nd in the same octave (vs add9)
        } else if (quality === '6/9') {
            intervals = [0, 4, 7, 9, 14]; // 1 3 5 6 9 — the lush 6/9 color
        } else if (quality === '6') {
            intervals = [0, 4, 7, 9];
        } else if (quality === 'm6') {
            intervals = [0, 3, 7, 9];
        } else if (quality === 'm#5') {
            // 1 b3 #5 (#1336). No natural 5 — the sharpened fifth IS the spelling, and
            // `isAltered5` (which matches '#5') keeps the >= 0.8 "Wall of Sound" backfill and
            // the rich-density tier from adding one back. No `is7th` arm: no row in
            // `SUFFIX_QUALITIES` encodes this quality with a seventh, so it never arrives with
            // one (unlike `aug`, whose `aug7`/`+7`/`7#5` rows do).
            intervals = [0, 3, 8];
        } else if (quality === 'mMaj7') {
            intervals = [0, 3, 7, 11]; // 1 b3 5 maj7 — the melodic-minor tonic (#1321)
        } else if (quality === 'madd9') {
            intervals = [0, 3, 7, 14]; // 1 b3 5 9 — a minor triad plus the added 9th (#1322)
        } else if (quality === '9sus4') {
            intervals = [0, 5, 7, 10, 14]; // 1 4 5 b7 9 — suspended dominant + 9th (#1323)
        } else if (quality === '13sus4') {
            intervals = [0, 5, 7, 10, 14, 21]; // 1 4 5 b7 9 13 (#1323)
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
        } else if (quality === 'maj7b5') {
            // 1 3 b5 maj7 (#1329). No natural 5 — that is the whole point of the spelling,
            // and `isAltered5` (which matches 'b5') keeps every later tier from adding one.
            intervals = [0, 4, 6, 11];
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

    // 3a. MODERATE-INTENSITY COLOR (chords.md P1 #11 / Epic 11 S6(c))
    // why: a plain major triad at intensity 0.5 in Acoustic/Neo-Soul reads as
    // bare — those genres' whole sound lives in the color tones (add9, 6/9,
    // sus2), and a comper reaches for color without needing the part to be loud.
    // Extend the 9th's reach down to intensity >= 0.35 (a comfortably-mid
    // dynamic, above the soft-pad floor) for color-friendly genres on a plain
    // major triad only — not 7ths (a b7 at moderate dynamics implies dominant
    // function the chart didn't ask for) and not Rock/Jazz/Funk (Rock wants
    // power-triad clarity, Jazz/Funk own dedicated voicing lanes). The full 0.6
    // block below still adds the 7th and re-adds the 9 above high intensity;
    // this is purely a downward reach of the add9 color. Genre keys are the
    // canonical `groove.genreFeel` values (groove-engine.ts strategies map).
    const COLOR_FRIENDLY_GENRES = ['Acoustic', 'Neo-Soul', 'Country'];
    if (
        intensity >= 0.35 &&
        intensity < 0.6 &&
        quality === 'major' &&
        !is7th &&
        COLOR_FRIENDLY_GENRES.includes(genre) &&
        !intervals.includes(14)
    ) {
        intervals.push(14); // add9 color
    }

    // 3a-disco. DISCO LUSH 6/9 + m9 COLOR (#552, genre-audit Wave 1 — Disco/Piano)
    // why: disco comping (Chic, MFSB) lives on lush 6/9 and m9 stabs, not bare
    // triads. Disco is excluded from the add9 block above and only reached a
    // 7th/9th at the >=0.6 block below, so its mid-dynamic offbeat stabs comped as
    // BARE TRIADS — missing the color central to the idiom. Give it a color lane
    // from the same mid floor (loudness-independent): a plain major triad -> 6/9
    // (add the 6th and 9th), a plain minor triad -> m9 (add the b7 and 9th). The
    // >=0.6 block already colors disco at high intensity; rhythm (offbeat stabs,
    // staccato) is unchanged.
    if (intensity >= 0.35 && intensity < 0.6 && genre === 'Disco' && !is7th && !isAltered5) {
        if (quality === 'major') {
            if (!intervals.includes(9)) {
                intervals.push(9); // 6th -> 6/9
            }
            if (!intervals.includes(14)) {
                intervals.push(14); // 9th
            }
        } else if (quality === 'minor') {
            if (!intervals.includes(10)) {
                intervals.push(10); // b7 -> m9
            }
            if (!intervals.includes(14)) {
                intervals.push(14); // 9th
            }
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
        if (!is7th && !NO_SEVENTH_QUALITIES.has(quality)) {
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
        if (!isAltered9 && !intervals.includes(14)) {
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
        // For Rock at high intensity, add a b7 for "grit" — but ONLY to chords
        // that already carry dominant/7th function. Slamming a b7 onto a plain
        // major (or minor) triad manufactures a dom7 the chart never asked for and
        // kills power-triad clarity: AC/DC/Stones rhythm parts stay triadic/power
        // at full energy; the b7 belongs to dominant/blues charts (spelled
        // explicitly). Mirrors the :284 guard. Any quality whose voicing already
        // carries the natural 7 (pc 11) is excluded — the maj7 family AND augmaj7
        // ([0,4,8,11]) — because slamming a b7 (10) onto a chord that already has
        // the maj7 manufactures a 10+11 semitone rub the chart never asked for.
        // Testing the interval set (not a hardcoded name list) catches both and
        // can't false-exclude a genuine dominant chart (a dom7 carries 10, not 11).
        const isDominantSeventh = is7th && !intervals.includes(11);
        if (genre === 'Rock' && isDominantSeventh && !intervals.includes(10)) {
            intervals.push(10);
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
            // why (#1336): without its own row `m#5` fell to the `isAltered5 ? [14, 18]`
            // default below, and 18 is the #11 — a FLAT fifth stacked onto a chord written
            // with a sharp one, two different fifths in one voicing. The minor family's own
            // colours (9, 11) are the honest rich extension here, so this mirrors `minor`.
            'm#5': [14, 17], // 9, 11
            aug: [14, 22], // 9, #11
            augmaj7: [14, 18], // 9, #11
            '7alt': [13, 15, 20], // b9, #9, b13
            9: [21], // 13
            13: [18], // #11
        };

        const potential = isAltered9
            ? [18] // #11 only: a natural 9 would rub the written b9/#9 (see isAltered9)
            : safeExtensions[quality] || (isAltered5 ? [14, 18] : [14]);
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
            'maj7b5',
            'aug',
            'augmaj7',
            'halfdim',
            '7b9',
            '7#9',
            '7alt',
            '9',
            'dim',
            // why (#1321): the minor-major 7th's seventh IS the maj7 (11) it already
            // carries. Without this the backfill added a b7 next to it — a b7 + maj7
            // semitone rub, and the m7 the chord exists to NOT be.
            'mMaj7',
            // why (#1316): `add9` is the one quality whose NAME says "9th but no
            // 7th" — that distinction from `C9` is the reason the symbol exists —
            // yet its "9" makes `getChordDetails` report `is7th`, so this backfill
            // handed every rooted Cadd9 an unwritten b7 (C-E-G-D-Bb, a C9). Same
            // exclusion, same reason, as the one in `getFormattedChordNames`, which
            // is why "Cadd9" displayed correctly while sounding as a C9.
            'add9',
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
