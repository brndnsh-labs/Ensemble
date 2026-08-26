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
    //      Audible consequence: minor skanks now voice rootless and pick up a b7
    //      (Am -> Am7, per getRootlessVoicing); plain major skanks are unchanged
    //      because shouldUseRootlessVoicing only fires on minor/dominant/maj7.
    //      Two knock-ons, both already accepted for the six feels above: in
    //      practice mode `shouldPreferGroundedPracticeVoicing` now re-admits the
    //      root on identity-losing qualities (halfdim/dim/alt) for Reggae, and
    //      the soloist's voicing-derived `chordMask` treats the root as a
    //      non-chord-tone on 7th-family chords — see engine/CLAUDE.md #6; bend
    //      and slide targets already derive from `quality`, not the mask.
    'Reggae',
]);
const PRACTICE_GROUNDING_QUALITIES = new Set([
    'halfdim',
    'dim',
    '7alt',
    '7b9',
    '7#9',
    '7b5',
    'aug',
    'augmaj7',
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

export function shouldReserveBassSpace(
    state: EnsembleState,
    bassActive = Boolean(state.bass?.enabled),
): boolean {
    return Boolean(state.playback.practiceMode || bassActive);
}

/**
 * In practice mode we still want pro-style voicings, but some chords lose too much
 * identity if they are forced rootless. Let these chords re-admit the root while
 * still keeping the voicing above the bass lane.
 */
export function shouldPreferGroundedPracticeVoicing(
    state: EnsembleState,
    quality: string | undefined | null,
    feel: string | undefined | null,
): boolean {
    if (!state.playback.practiceMode || !isBassSpaceFeel(feel)) {
        return false;
    }
    return PRACTICE_GROUNDING_QUALITIES.has(quality || '');
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
    if (shouldPreferGroundedPracticeVoicing(state, quality, feel)) {
        return false;
    }

    const isMinor = quality.startsWith('m') && !quality.startsWith('maj');
    const isDominant =
        !isMinor &&
        !['dim', 'halfdim'].includes(quality) &&
        (is7th ||
            ['9', '11', '13', '7alt', '7b9', '7#9', '7#11', '7b13'].includes(quality) ||
            quality.startsWith('7'));
    const isMajor7 = ['maj7', 'maj9', 'maj11', 'maj13', 'maj7#11', 'augmaj7'].includes(quality);

    return isMinor || isDominant || isMajor7;
}

export function getBassSpaceFloor(
    state: EnsembleState,
    bassActive = Boolean(state.bass?.enabled),
): number {
    return shouldReserveBassSpace(state, bassActive) ? 52 : 43;
}

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

    let bestMidis = placeIntervalsNearTarget(
        resolvedRootMidi,
        candidateIntervals[0],
        targetCenter,
        minMidi,
        maxMidi,
    );
    let bestScore = Number.POSITIVE_INFINITY;

    candidateIntervals.forEach((intervals) => {
        const candidateMidis = placeIntervalsNearTarget(
            resolvedRootMidi,
            intervals,
            targetCenter,
            minMidi,
            maxMidi,
        );
        if (candidateMidis.length === 0) {
            return;
        }

        let score =
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
