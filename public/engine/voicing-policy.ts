import type { EnsembleState } from '../types.js';
import { getMidi } from '../utils.js';

// Keyed by the runtime `groove.genreFeel` (smart-genres.ts `feel`), never a UI
// genre name — pinned by tests/standards/genre-feel-canon-guard.test.ts (#1208).
// #1208: 'Swing' removed — never a canonical feel (Jazz carries the swing
// idiom), so the key could never match and was dead weight, not behavior.
export const BASS_SPACE_FEELS = new Set([
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
    //      Two knock-ons, both already accepted for the six feels above:
    //      `shouldPreferGroundedVoicing` re-admits the
    //      root on identity-losing qualities (halfdim/dim/alt) for Reggae, and
    //      the soloist's voicing-derived `chordMask` treats the root as a
    //      non-chord-tone on 7th-family chords — see engine/CLAUDE.md #6; bend
    //      and slide targets already derive from `quality`, not the mask.
    'Reggae',
]);
const GROUNDING_QUALITIES = new Set([
    'halfdim',
    'dim',
    '7alt',
    '7b9',
    '7#9',
    '7b5',
    'aug',
    'augmaj7',
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

const TENSION_CHORD_QUALITIES = new Set([
    'halfdim',
    'm7b5',
    'half-diminished',
    'dim',
    'diminished',
    '7alt',
    '7b9',
    '7#9',
    '7b5',
    'aug',
    'augmented',
    'augmaj7',
]);

function isBassSpaceFeel(feel: string | undefined | null): boolean {
    return BASS_SPACE_FEELS.has(feel || '');
}

/**
 * True when a bass line is actually sounding under the comp. This is the ONLY
 * input to "leave room for the bass" (#1313): muting the bass means the player
 * is practicing that part, so the remaining lanes must state the harmony
 * themselves — the register floor drops and rootless voicings switch off. It
 * used to also be forced true by `playback.practiceMode` (default on), which
 * made `bassActive` dead and left a muted-bass band with no root anywhere.
 */
export function shouldReserveBassSpace(
    state: EnsembleState,
    bassActive = Boolean(state.bass?.enabled),
): boolean {
    return bassActive;
}

/**
 * Some chords lose too much identity without a root under them (the root is what
 * disambiguates a dim/ø/altered/augmented shape). Over a sounding bass the bass
 * supplies it and the comp plays the idiomatic rootless shell; with the bass
 * MUTED — the player covering that part, which is what `practiceMode` used to
 * stand in for (#1313) — the smart-comp, Neo-Soul, Funk and pad reducers keep
 * these chords grounded (root retained, fuller voice count) instead of thinning
 * them to bare shells. Jazz's resolving altered-dominant voicing is the one
 * exception: it stays a 3-b7 tritone shell either way, which still states the
 * dominant function on its own.
 */
export function shouldPreferGroundedVoicing(
    quality: string | undefined | null,
    feel: string | undefined | null,
    bassActive: boolean,
): boolean {
    return !bassActive && isBassSpaceFeel(feel) && GROUNDING_QUALITIES.has(quality || '');
}

export function isTensionChordQuality(quality: string | undefined | null): boolean {
    return TENSION_CHORD_QUALITIES.has(quality || '');
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

export function averageMidi(midis: number[]): number {
    return midis.length === 0 ? 0 : midis.reduce((sum, midi) => sum + midi, 0) / midis.length;
}

/**
 * Neo-Soul favors compact upper-structure clusters, but we still want the line to move
 * from the previous comp naturally instead of re-jumping from the root every hit.
 */
export function selectCompactCluster(
    midis: number[],
    previousMidis: number[] = [],
    maxVoices = 3,
    minMidi = 0,
): number[] {
    const sorted = [...new Set(midis.filter((midi) => Number.isFinite(midi)))].sort(
        (a, b) => a - b,
    );
    if (sorted.length <= maxVoices) {
        return sorted;
    }

    const targetCenter =
        previousMidis.length > 0 ? averageMidi(previousMidis) : averageMidi(sorted);
    let bestCluster = sorted.slice(sorted.length - maxVoices);
    let bestScore = Number.POSITIVE_INFINITY;

    for (let start = 0; start <= sorted.length - maxVoices; start++) {
        const cluster = sorted.slice(start, start + maxVoices);
        const center = averageMidi(cluster);
        const span = cluster[cluster.length - 1] - cluster[0];
        const floorPenalty = minMidi > 0 && cluster[0] < minMidi ? (minMidi - cluster[0]) * 2 : 0;
        const score = Math.abs(center - targetCenter) + span * 0.15 + floorPenalty;

        if (score < bestScore) {
            bestScore = score;
            bestCluster = cluster;
        }
    }

    return bestCluster;
}

/**
 * Keeps a voicing in the same register pocket as the previous hit when possible.
 */
export function recenterVoicing(
    midis: number[],
    previousMidis: number[] = [],
    minMidi = 0,
    maxMidi = 127,
): number[] {
    const sorted = [...new Set(midis.filter((midi) => Number.isFinite(midi)))].sort(
        (a, b) => a - b,
    );
    if (sorted.length === 0) {
        return [];
    }

    const targetCenter =
        previousMidis.length > 0 ? averageMidi(previousMidis) : averageMidi(sorted);
    let best = sorted;
    let bestScore = Number.POSITIVE_INFINITY;
    const octaveShifts = [-24, -12, 0, 12, 24];

    for (const shift of octaveShifts) {
        const shifted = sorted.map((midi) => midi + shift);
        const shiftedMin = Math.min(...shifted);
        const shiftedMax = Math.max(...shifted);
        if (shiftedMin < minMidi || shiftedMax > maxMidi) {
            continue;
        }

        const center = averageMidi(shifted);
        const span = shiftedMax - shiftedMin;
        const score = Math.abs(center - targetCenter) + span * 0.1;
        if (score < bestScore) {
            bestScore = score;
            best = shifted;
        }
    }

    if (bestScore < Number.POSITIVE_INFINITY) {
        return best;
    }

    return sorted.map((midi) => {
        let shifted = midi;
        while (shifted < minMidi) {
            shifted += 12;
        }
        while (shifted > maxMidi) {
            shifted -= 12;
        }
        return shifted;
    });
}

function getChordIntervalClass(midi: number, chord: { rootMidi?: number } | null): number | null {
    const rootMidi = chord?.rootMidi;
    if (!Number.isFinite(midi) || !Number.isFinite(rootMidi)) {
        return null;
    }
    const resolvedRootMidi = rootMidi as number;
    return (((Math.round(midi) - resolvedRootMidi) % 12) + 12) % 12;
}

/**
 * Keep guide tones first when slimming practice/rootless comping voicings.
 * This preserves harmonic identity in bass-reserved contexts instead of
 * dropping the lowest note blindly.
 */
export function selectSupportiveVoicing(
    midis: number[],
    chord: { rootMidi?: number } | null,
    targetCount = 3,
): number[] {
    const unique = [...new Set(midis.filter((midi) => Number.isFinite(midi)))].sort(
        (a, b) => a - b,
    );
    if (unique.length <= targetCount || !chord) {
        return unique;
    }

    const guides: number[] = [];
    const colors: number[] = [];
    const roots: number[] = [];
    const fifths: number[] = [];
    const others: number[] = [];

    unique.forEach((midi) => {
        const intervalClass = getChordIntervalClass(midi, chord);
        if (intervalClass === null) {
            others.push(midi);
            return;
        }
        if ([3, 4, 10, 11].includes(intervalClass)) {
            guides.push(midi);
            return;
        }
        if ([1, 2, 5, 6, 8, 9].includes(intervalClass)) {
            colors.push(midi);
            return;
        }
        if (intervalClass === 0) {
            roots.push(midi);
            return;
        }
        if (intervalClass === 7) {
            fifths.push(midi);
            return;
        }
        others.push(midi);
    });

    const ordered = [...guides, ...colors, ...roots, ...fifths, ...others];
    const selected: number[] = [];

    for (const midi of ordered) {
        if (!selected.includes(midi)) {
            selected.push(midi);
        }
        if (selected.length >= targetCount) {
            break;
        }
    }

    return selected.sort((a, b) => a - b);
}

/**
 * Guarantee the chord root is sounding, for a comp with NO bass under it (#1313).
 * The compact-cluster lanes pick a contiguous window of the voicing, which can
 * window the root out (Am9 -> C-E-G, a C major triad once nothing supplies the A).
 * Adds the root in the octave nearest below the lowest voice, inside the comp
 * register, or nearest above it when there is no room underneath. No-op when the
 * root already sounds.
 */
export function ensureRootVoice(midis: number[], rootMidi: number, min = 52, max = 84): number[] {
    const rootPc = ((rootMidi % 12) + 12) % 12;
    if (midis.length === 0 || midis.some((midi) => ((midi % 12) + 12) % 12 === rootPc)) {
        return midis;
    }
    const lowest = Math.min(...midis);
    const candidates: number[] = [];
    for (let midi = rootPc; midi <= max; midi += 12) {
        if (midi >= min) {
            candidates.push(midi);
        }
    }
    const below = candidates.filter((midi) => midi < lowest);
    const root = below.length > 0 ? below[below.length - 1] : candidates[0];
    return root === undefined ? midis : [...midis, root].sort((a, b) => a - b);
}

/**
 * The two-voice thinning for a comp with NO bass under it (#1313). The blind
 * "bottom two voices" reduction is only safe while a bass line states the root: an
 * inverted Am (C-E-A) thins to C-E, which alone is a C major third. With the bass
 * muted the dyad has to carry the identity itself — root + 3rd (or the sus
 * 2nd/4th standing in for a 3rd). Returns null when the voicing has no root or no
 * 3rd to pick, so the caller keeps its existing reduction.
 */
export function selectRootedDyad(
    midis: number[],
    chord: { rootMidi?: number } | null,
): number[] | null {
    const pick = (classes: number[]) =>
        midis.find((midi) => classes.includes(getChordIntervalClass(midi, chord) ?? -1));
    const root = pick([0]);
    const third = pick([3, 4]) ?? pick([2, 5]);
    if (root === undefined || third === undefined) {
        return null;
    }
    return [root, third].sort((a, b) => a - b);
}

/**
 * Move a single voice to the nearest NEIGHBORING chord tone (a small melodic step
 * to a different pitch-class still in the chord), to give the top of an "answer"
 * voicing a little inner-voice motion so consecutive answers aren't identical.
 *
 * Destination rules keep the move from DEGRADING the lean shell:
 * - guide tones (3rd / 7th) are preferred over other chord tones;
 * - the ROOT is never a destination — moving onto it collapses a 3-and-7 shell
 *   into a rooty triad fragment that no longer states the seventh (review #2);
 * - any pitch-class already sounding in the rest of the answer is forbidden, so
 *   the move can't octave-double an existing voice into a bare unison (review #1).
 *
 * Returns the input unchanged when no eligible destination sits within a step or
 * two (in which case the caller simply leaves the answer un-moved).
 */
export function nearestOtherChordTone(
    midi: number,
    chord: { rootMidi: number; intervals?: number[] },
    forbidPCs: Set<number> = new Set(),
): number {
    const intervals = chord.intervals;
    if (!intervals || intervals.length === 0) {
        return midi;
    }
    const fromPC = ((midi % 12) + 12) % 12;
    const guidePCs = new Set<number>();
    const otherPCs = new Set<number>();
    for (const i of intervals) {
        const ic = ((i % 12) + 12) % 12;
        const pc = (((chord.rootMidi + i) % 12) + 12) % 12;
        if (ic === 0 || pc === fromPC || forbidPCs.has(pc)) {
            continue; // skip the root, the current tone, and PCs already sounding
        }
        // ic 3/4 = third; 9/10/11 = (bb7/b7/maj7) seventh — the guide tones.
        if (ic === 3 || ic === 4 || ic === 9 || ic === 10 || ic === 11) {
            guidePCs.add(pc);
        } else {
            otherPCs.add(pc);
        }
    }
    const targets = guidePCs.size > 0 ? guidePCs : otherPCs;
    if (targets.size === 0) {
        return midi;
    }
    let best = midi;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let d = -5; d <= 5; d++) {
        if (d === 0) {
            continue;
        }
        const cand = midi + d;
        const pc = ((cand % 12) + 12) % 12;
        if (!targets.has(pc)) {
            continue;
        }
        if (Math.abs(d) < bestDist) {
            bestDist = Math.abs(d);
            best = cand;
        }
    }
    return best;
}

export function getMidiVoicing(voicing: number[]): number[] {
    const midis: number[] = [];
    voicing.forEach((freq: number) => {
        const midi = getMidi(freq);
        if (Number.isFinite(midi)) {
            midis.push(midi as number);
        }
    });
    return midis;
}

function placeIntervalsNearTarget(
    rootMidi: number,
    intervals: number[],
    targetCenter: number,
    minMidi = 0,
    maxMidi = 127,
): number[] {
    const placed: number[] = [];

    intervals.forEach((interval) => {
        let bestMidi = rootMidi + interval;
        let bestScore = Number.POSITIVE_INFINITY;

        [-24, -12, 0, 12, 24].forEach((shift) => {
            const candidate = rootMidi + interval + shift;
            if (candidate < minMidi || candidate > maxMidi) {
                return;
            }
            const score = Math.abs(candidate - targetCenter);
            if (score < bestScore) {
                bestScore = score;
                bestMidi = candidate;
            }
        });

        placed.push(bestMidi);
    });

    return [...new Set(placed)].sort((a, b) => a - b);
}

function countSharedPitchClasses(
    midis: number[],
    chord: { rootMidi?: number; freqs?: number[] } | null,
): number {
    const chordMidis = getMidiVoicing(chord?.freqs || []);
    if (midis.length === 0 || chordMidis.length === 0) {
        return 0;
    }

    const chordPitchClasses = new Set(chordMidis.map((midi) => midi % 12));
    return midis.reduce((sum, midi) => sum + (chordPitchClasses.has(midi % 12) ? 1 : 0), 0);
}

/**
 * Altered dominants should still resolve like a voice-led dominant, not just a bag of sharp notes.
 * Favor guide tones plus one or two strong colors, and avoid exposing the 3rd/#9 semitone clash
 * unless the intensity/complexity is high enough to justify that heat.
 */
// why: per-quality candidate sets for buildResolvingAlteredVoicing. Each chart
// symbol names a specific alteration; the candidate set must honor it so a
// G7#11 doesn't come out sounding like G7b9. Interval keys: 4=3, 10=b7, 13=b9,
// 15=#9, 18=#11, 20=b13. Sources: chords.md P1 #7, S4 review P0.
// - '7alt': full altered license. Keeps the legacy candidate set (b9/b13 mix)
//   that prior tests certified; #11 deliberately omitted from the default set
//   to avoid a silent behavior shift on plain '7alt' chords.
// - '7b9' / '7b13': the charted alteration is mandatory; the other b-tone is
//   an optional color (musically compatible).
// - '7#9': #9 mandatory. The Hendrix-style 3+#9 semitone clash is the sound
//   here, not an accident — that's handled by a penalty bypass below.
// - '7#11': #11 mandatory. b13 deliberately forbidden — they share the same
//   step (b5/#11 vs b13) and stack into a muddy whole-tone cluster that is not
//   idiomatic Lydian-dominant. b9 stays allowed as an ambiguous color.
function getAlteredVoicingCandidates(
    quality: string | undefined,
    intensity: number,
    complexity: number,
): number[][] {
    const heat = intensity > 0.72 || complexity > 0.7;
    switch (quality) {
        case '7b9':
            return heat
                ? [
                      [4, 10, 13],
                      [4, 10, 13, 20],
                      [4, 10, 13, 15, 20],
                  ]
                : [
                      [4, 10, 13],
                      [4, 10, 13, 20],
                  ];
        case '7#9':
            return [
                [4, 10, 15],
                [4, 10, 15, 20],
            ];
        case '7b13':
            return heat
                ? [
                      [4, 10, 20],
                      [4, 10, 13, 20],
                      [4, 10, 13, 15, 20],
                  ]
                : [
                      [4, 10, 20],
                      [4, 10, 13, 20],
                  ];
        case '7#11':
            return [
                [4, 10, 18],
                [4, 10, 13, 18],
            ];
        default: {
            // '7alt' and any fallback path. Preserve legacy candidate set.
            const base = [
                [4, 10, 20],
                [4, 10, 13],
                [4, 10, 13, 20],
            ];
            if (heat) {
                base.push([4, 10, 13, 15, 20]);
            }
            return base;
        }
    }
}

/**
 * The "Hendrix" 7#9 spacing (#1318): major 3rd below, #9 on top, a major 7th or more
 * apart (G7#9 = B-F-A#). That width is what makes the #9 read as a blue note; folded
 * to a semitone UNDER the 3rd (Bb3-B3-F4) it reads as a chromatic smear instead, and
 * the 3+#9 clash-penalty exemption below is exactly what let that placement win.
 * `placeIntervalsNearTarget` seats each voice independently at its own nearest octave
 * to the register center, so the #9 (15 semitones up) routinely lands below the 3rd.
 */
const SHARP_NINE_MIN_SPACING = 11;

/**
 * Lift the #9 (root-relative degree 3) by whole octaves until it sits at least
 * `SHARP_NINE_MIN_SPACING` above the major 3rd (degree 4). Returns the input
 * unchanged when the candidate doesn't carry both voices, and `null` when the lift
 * can't stay inside the comp register — so the caller can prefer a sibling candidate
 * that fits rather than emitting the smear.
 */
function spaceSharpNineAboveThird(
    midis: number[],
    rootMidi: number,
    maxMidi: number,
): number[] | null {
    const degreeOf = (midi: number) => (((Math.round(midi) - rootMidi) % 12) + 12) % 12;
    const thirdIndex = midis.findIndex((midi) => degreeOf(midi) === 4);
    const ninthIndex = midis.findIndex((midi) => degreeOf(midi) === 3);
    if (thirdIndex === -1 || ninthIndex === -1) {
        return midis;
    }

    let ninth = midis[ninthIndex];
    const lowestAllowed = midis[thirdIndex] + SHARP_NINE_MIN_SPACING;
    while (ninth < lowestAllowed) {
        ninth += 12;
    }
    if (ninth > maxMidi) {
        return null;
    }

    const spaced = [...midis];
    spaced[ninthIndex] = ninth;
    return [...new Set(spaced)].sort((a, b) => a - b);
}

export function buildResolvingAlteredVoicing(
    chord: { rootMidi?: number; freqs?: number[]; quality?: string } | null,
    previousMidis: number[] = [],
    nextChord: { rootMidi?: number; freqs?: number[]; quality?: string } | null = null,
    minMidi = 0,
    maxMidi = 127,
    intensity = 0.5,
    complexity = 0.5,
): number[] {
    const rootMidi = chord?.rootMidi;
    if (!Number.isFinite(rootMidi)) {
        return [];
    }

    const resolvedRootMidi = rootMidi as number;
    const nextMidis = getMidiVoicing(nextChord?.freqs || []);
    const targetCenter =
        previousMidis.length > 0
            ? averageMidi(previousMidis)
            : nextMidis.length > 0
              ? averageMidi(nextMidis)
              : resolvedRootMidi + 14;

    const candidateIntervals = getAlteredVoicingCandidates(chord?.quality, intensity, complexity);

    // why (#1318): 7#9 is the one quality whose charted alteration sits a semitone
    // from a voice the shell must also carry, so its placement needs an ORDERING
    // constraint the generic scorer has no term for. Repair each candidate before
    // scoring — a penalty alone can't help, since every candidate for this quality is
    // placed by the same center-seeking rule and they'd all be penalised equally.
    const needsSharpNineSpacing = chord?.quality === '7#9';
    const placeCandidate = (intervals: number[]): { midis: number[]; penalty: number } => {
        const placed = placeIntervalsNearTarget(
            resolvedRootMidi,
            intervals,
            targetCenter,
            minMidi,
            maxMidi,
        );
        if (!needsSharpNineSpacing) {
            return { midis: placed, penalty: 0 };
        }
        const spaced = spaceSharpNineAboveThird(placed, resolvedRootMidi, maxMidi);
        // why: a placement whose #9 cannot clear the 3rd inside the comp register is
        // the smear this repair exists to remove, but it stays a LAST-RESORT
        // candidate rather than being dropped — a chord jammed against the 84
        // ceiling still has to voice something. +40 dwarfs every other term here
        // (voice-leading + spread + clash together stay well under it), so any
        // sibling candidate that CAN be spaced wins outright.
        return spaced ? { midis: spaced, penalty: 0 } : { midis: placed, penalty: 40 };
    };

    let bestMidis = placeCandidate(candidateIntervals[0]).midis;
    let bestScore = Number.POSITIVE_INFINITY;

    candidateIntervals.forEach((intervals) => {
        const { midis: candidateMidis, penalty: spacingPenalty } = placeCandidate(intervals);
        if (candidateMidis.length === 0) {
            return;
        }

        let score =
            spacingPenalty +
            Math.abs(averageMidi(candidateMidis) - targetCenter) * 0.5 +
            getNearestVoiceLeadingCost(candidateMidis, previousMidis) * 0.8 +
            getNearestVoiceLeadingCost(candidateMidis, nextMidis) * 0.6 +
            (candidateMidis[candidateMidis.length - 1] - candidateMidis[0]) * 0.12;

        // why: skip the 3+b3 clash penalty for 7#9 — the Hendrix-style 3+#9
        // semitone collision IS the charted sound, not an accident to avoid.
        if (complexity < 0.68 && intensity < 0.78 && chord?.quality !== '7#9') {
            const intervalClasses = candidateMidis
                .map((midi) => getChordIntervalClass(midi, chord))
                .filter((intervalClass) => intervalClass !== null);
            if (intervalClasses.includes(3) && intervalClasses.includes(4)) {
                score += 8;
            }
        }

        const sharedWithNext = countSharedPitchClasses(candidateMidis, nextChord);
        score -= sharedWithNext * 0.9;

        if (score < bestScore) {
            bestScore = score;
            bestMidis = candidateMidis;
        }
    });

    return bestMidis;
}
