import type { EnsembleState } from '../types.js';

// Keyed by the runtime `groove.genreFeel` (smart-genres.ts `feel`), never a UI
// genre name (#1208).
// #1208: 'Swing' removed — never a canonical feel (Jazz carries the swing
// idiom), so the key could never match and was dead weight, not behavior.
const BASS_SPACE_FEELS = new Set([
    'Jazz',
    'Neo-Soul',
    'Funk',
    'Blues',
    'Bossa Nova',
    // why: #554 — Hip Hop comping is sampled-soul Rhodes stabs (rootless, jazzy
    //      extensions), so it should leave the bottom of the chord to the bass
    //      and synth-bass line rather than doubling roots. Joins the other
    //      rootless-voicing idioms.
    'Hip Hop',
    // why: #1216 — the riddim is bass-led: the bass line is reggae's melodic
    //      subject, not its floor, and both comping lanes sit deliberately above
    //      it (the backbeat skank on the chords channel, the organ bubble on the
    //      harmony channel). Doubling roots down there is the mud this set
    //      exists to prevent. Same class as the entries above; it was an
    //      omission rather than a decision — the set had never been pinned.
    //      Audible consequence: WRITTEN minor-7th skanks voice rootless; plain
    //      triads (major or minor) keep their root. (#1216 originally also sent
    //      plain minor triads rootless with an invented b7, Am -> "Am7" = C-E-G;
    //      #1313 reversed that for every feel here — see shouldUseRootlessVoicing.)
    //      Two knock-ons, both already accepted for the six feels above: the old
    //      engine's grounded-voicing rule re-admitted the
    //      root on identity-losing qualities (halfdim/dim/alt) for Reggae, and
    //      the soloist's voicing-derived `chordMask` treats the root as a
    //      non-chord-tone on 7th-family chords — see engine/CLAUDE.md #6; bend
    //      and slide targets already derive from `quality`, not the mask.
    'Reggae',
]);

/**
 * Qualities that must never take the rootless DOMINANT shell (#1316). The dominant
 * bucket in `shouldUseRootlessVoicing`/`getRootlessVoicing` is keyed on `is7th`,
 * which `getChordDetails` derives from a string heuristic (`symbol.includes('7' |
 * '9' | '11' | '13')`) — so a suspension, an added tone or a 6th lands in it and
 * gets voiced [3, 5, b7]: the whole point of `G7sus4` is that the 4th REPLACES the
 * 3rd (it came out B-D-F, a plain G7), and `Cadd9` is written precisely to say
 * "9th, no 7th" (it came out Bb-E-G, a C9 shell). They keep their rooted
 * `getIntervals` stack instead, above `COMP_REGISTER_FLOOR`.
 *
 * Every entry is reachable, not defensive: the ones `getChordDetails` pins to
 * `is7th = false` on their own ('sus4', 'sus2', 'add2', '6', '6/9') still arrive
 * with `is7th = true` from a compound symbol whose leftmost suffix match is the
 * suspension/6th — a written `G` + `sus4add9`, `C` + `sus2add9` or `C` + `6add9`
 * all trip the heuristic.
 * A rootless 7sus4 shell (4, b7, 9) is a separate by-ear call, deliberately not
 * taken here.
 */
export const NEVER_ROOTLESS_DOMINANT_QUALITIES = new Set([
    'sus4',
    'sus2',
    '7sus4',
    // #1323 — the extended suspended dominants are the same case as '7sus4': the rootless
    // dominant shell states a major 3rd, which is the one tone a suspension replaces.
    '9sus4',
    '13sus4',
    'add9',
    'add2',
    '6',
    '6/9',
]);

function isBassSpaceFeel(feel: string | undefined | null): boolean {
    return BASS_SPACE_FEELS.has(feel || '');
}

/**
 * True when a bass line is actually sounding under the comp. This is the ONLY
 * input to "leave room for the bass" (#1313): muting the bass means the player
 * is practicing that part, so the remaining lanes must state the harmony
 * themselves — the register floor drops and rootless voicings switch off. It
 * used to also be forced true by a default-on "practice mode" preference, which
 * made `bassActive` dead and left a muted-bass band with no root anywhere. That
 * preference had no other reader left and was retired in #1314.
 */
function shouldReserveBassSpace(
    state: EnsembleState,
    bassActive = Boolean(state.bass?.enabled),
): boolean {
    return bassActive;
}

export function shouldUseRootlessVoicing(
    state: EnsembleState,
    quality: string,
    is7th: boolean,
    feel: string | undefined | null,
    bassActive = Boolean(state.bass?.enabled),
): boolean {
    if (!shouldReserveBassSpace(state, bassActive) || !isBassSpaceFeel(feel)) {
        return false;
    }
    // why (#1313): rootless is an idiom for chords the chart WRITES as 7ths or
    // extensions — the shell (3rd + 7th) carries the identity and the bass owns
    // the root. A plain minor triad has no 7th to build a shell from: voicing it
    // rootless meant inventing a b7 and dropping the root, which is literally
    // the relative major triad (Am -> C-E-G). An m6 likewise lost its 6th to an
    // unwritten b7 (Dm6 -> F-A-C). Plain major triads never went rootless at
    // this (parse) layer, so this also removes a major/minor asymmetry there.
    // m9/m11/m13 always carry `is7th`, so the single `is7th` test covers every
    // written minor extension; `getChordDetails` pins m6 to `is7th = false`.
    const isMinorFamily = quality.startsWith('m') && !quality.startsWith('maj');
    const isMinor = isMinorFamily && is7th;
    const isDominant =
        !isMinorFamily &&
        !['dim', 'halfdim'].includes(quality) &&
        // #1316 — a suspension / added tone / 6th is not a 3-b7 dominant shell.
        !NEVER_ROOTLESS_DOMINANT_QUALITIES.has(quality) &&
        (is7th ||
            ['9', '11', '13', '7alt', '7b9', '7#9', '7#11', '7b13'].includes(quality) ||
            quality.startsWith('7'));
    // Kept in step with the same list in `getRootlessVoicing` (#1329 added 'maj7b5'); here
    // it only decides WHETHER to voice rootless, which `isDominant` would also say yes to.
    const isMajor7 = ['maj7', 'maj9', 'maj11', 'maj13', 'maj7#11', 'maj7b5', 'augmaj7'].includes(
        quality,
    );

    return isMinor || isDominant || isMajor7;
}

/**
 * Lowest MIDI the comp voices to. Deliberately NOT bass-aware (#1313): tick-logic's
 * `enforceRegisterSlotting` clamps every chords/harmony note to 52-84 one note at
 * a time, so a lower parse floor (the old bass-off 43) only ever produced voicings
 * whose bottom notes were then folded up INDIVIDUALLY — re-inverting the chord
 * (Dm9 from D3 became F-A-C-D-E, an F6/9) and clustering it. "The comp states the
 * root when the bass is muted" is delivered by pitch-class presence, not register.
 */
export const COMP_REGISTER_FLOOR = 52;

/**
 * Sum of per-voice nearest-neighbor semitone distances from `fromMidis` to `toMidis`.
 * Used as a coarse voice-leading cost so callers can prefer adjustments that reduce
 * total motion (common-tone holds + step-wise resolutions) over the per-interval
 * register-centroid baseline. Each `fromMidi` is matched to its nearest `toMidi`
 * independently (no bipartite matching) — cheap, monotonic, good enough for a
 * second-pass refinement.
 */
export function getNearestVoiceLeadingCost(fromMidis: number[], toMidis: number[]): number {
    if (fromMidis.length === 0 || toMidis.length === 0) {
        return 0;
    }

    let total = 0;
    for (let i = 0; i < fromMidis.length; i++) {
        const midi = fromMidis[i];
        let best = Number.POSITIVE_INFINITY;
        for (let j = 0; j < toMidis.length; j++) {
            const dist = Math.abs(toMidis[j] - midi);
            if (dist < best) {
                best = dist;
            }
        }
        total += best;
    }
    return total;
}
