import {
    INTERVAL_TO_NNS,
    INTERVAL_TO_ROMAN,
    KEY_ORDER,
    NNS_OFFSETS,
    ROMAN_VALS,
    TIME_SIGNATURES,
} from '../config.js';
import type { Chord, ChordNamePart, FormattedChordNames, Mutable } from '../types.js';
import { ACTIONS } from '../types.js';
import { getFrequency, normalizeKey } from '../utils.js';
import { transposeChordText } from './transpose.js';
import { getBassSpaceFloor, getNearestVoiceLeadingCost } from './voicing-policy.js';

export type { Chord, ChordNamePart, FormattedChordNames };

const ROMAN_REGEX = /^([#b])?(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)/;
const NNS_REGEX = /^([#b])?([1-7])/;
const NOTE_REGEX = /^([A-G][#b]?)/i;
const SHARP_NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SHARP_FRIENDLY_KEYS = new Set(['G', 'D', 'A', 'E', 'B', 'F#', 'C#']);

export interface ChordDetails {
    quality: string;
    is7th: boolean;
    suffix: string;
}

export interface ResolvedChordRoot {
    rootMidi: number;
    rootPart: string;
    romanMatch: RegExpMatchArray | null;
    nnsMatch: RegExpMatchArray | null;
    noteMatch: RegExpMatchArray | null;
    rootRomanBase: string;
}

/**
 * Formats an absolute note name using explicit accidentals first, then the local key context.
 * This avoids flat-biased spellings like Gb inside sharp-oriented keys such as E major.
 */
function getAbsoluteDisplayNoteName(
    pitchClass: number,
    keyContext: string,
    accidentalHint: string = '',
    explicitNote: string = '',
): string {
    if (accidentalHint === '#' || explicitNote.includes('#')) {
        return SHARP_NOTE_ORDER[pitchClass];
    }
    if (accidentalHint === 'b' || explicitNote.includes('b')) {
        return (KEY_ORDER as any)[pitchClass];
    }

    const tonic = (keyContext || '').replace(/m$/, '');
    return SHARP_FRIENDLY_KEYS.has(tonic)
        ? SHARP_NOTE_ORDER[pitchClass]
        : (KEY_ORDER as any)[pitchClass];
}

function ensurePitchClassAboveFloor(
    midis: number[],
    pitchClass: number,
    minMidi: number,
    maxMidi: number = 84,
): number[] {
    if (midis.some((midi) => midi % 12 === pitchClass)) {
        return midis;
    }

    const targetCenter =
        midis.length > 0 ? midis.reduce((sum, midi) => sum + midi, 0) / midis.length : minMidi + 12;
    let bestMidi: number | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let octave = -1; octave <= 8; octave++) {
        const candidate = pitchClass + octave * 12;
        if (candidate < minMidi || candidate > maxMidi) {
            continue;
        }
        const score = Math.abs(candidate - targetCenter);
        if (score < bestScore) {
            bestScore = score;
            bestMidi = candidate;
        }
    }

    if (!Number.isFinite(bestMidi)) {
        return midis;
    }

    return [...midis, bestMidi as number].sort((a, b) => a - b);
}

/**
 * Extracts quality and 7th status from a chord symbol string.
 */
export function getChordDetails(symbol: string): ChordDetails {
    let quality = 'major',
        is7th =
            symbol.includes('7') ||
            symbol.includes('9') ||
            symbol.includes('11') ||
            symbol.includes('13') ||
            symbol.includes('alt');
    const suffixMatch = symbol.match(
        // why: △/^/ma/ma7 are common jazz shorthand for major-7; they must appear BEFORE the bare
        // 'm' and '7' alternatives so leftmost-match picks the correct maj7-family suffix.
        // Extended ma9/ma11/ma13 and △9 follow the same pattern for consistency.
        /(maj7#11|maj7#5|maj7\+|maj7|maj9|maj11|maj13|maj|ma13|ma11|ma9|ma7|ma|M7#5|M7\+|M7|△9|△7|△|\^7|\^|m13|m11|m9|m7b5|m7|m6|min|m|dim7|dim|o7|o|°7|°|7#5|7\+|7aug|aug7|aug|\+7|\+|-|ø7|ø|h7|7b5|sus4|sus2|add9|7alt|7b13|7#11|7b9|7#9|7|alt|13|11|9|6|5)/,
    );
    const suffix = suffixMatch ? suffixMatch[1] : '';

    if (suffix === 'maj13' || suffix === 'ma13') {
        quality = 'maj13';
    } else if (suffix === 'maj11' || suffix === 'ma11') {
        quality = 'maj11';
    } else if (suffix === 'maj9' || suffix === 'ma9' || suffix === '△9') {
        quality = 'maj9';
    } else if (suffix === 'maj7#11') {
        quality = 'maj7#11';
    } else if (suffix === 'maj7#5' || suffix === 'maj7+' || suffix === 'M7#5' || suffix === 'M7+') {
        quality = 'augmaj7';
        is7th = true;
    } else if (
        suffix.includes('maj') ||
        suffix === 'M7' ||
        suffix === 'ma7' ||
        suffix === '△7' ||
        suffix === '^7'
    ) {
        // why: △7 (triangle-7) and ^7 are jazz shorthand for major-7; ma/ma7 are also common
        quality = 'maj7';
    } else if (suffix === 'ma' || suffix === '△' || suffix === '^') {
        // why: bare △/^/ma without a numeric extension are often written for plain major or
        // major-7 context; treat as maj7 to match common usage (Cmaj = major, C△ = maj7)
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
 * Resolves chord root midi to an absolute note, searching octaves.
 */
interface InversionOptions {
    isPivot?: boolean;
    anchor?: number | null;
    min?: number;
    max?: number;
    style?: string;
    /**
     * Opt-in jazz-style voice-leading second pass (common-tone holds + guide-tone
     * resolution). Off by default — pocket genres want voicing stability. Production
     * comping callers gate this on `style ∈ {Jazz, Bossa Nova, Blues}`.
     */
    enableVoiceLeading?: boolean;
    /**
     * Chord quality (e.g. 'maj7', '7b9'). Lets the m2-cluster guard (#708) exempt
     * tension qualities whose voicing legitimately carries a half-step. When
     * omitted, the guard treats the voicing as non-tension and de-clusters it.
     */
    quality?: string;
}

/** True if any two voices in the set sit a minor 2nd (1 semitone) apart. */
function hasMinorSecondCluster(midis: number[]): boolean {
    const sorted = [...midis].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - sorted[i - 1] === 1) {
            return true;
        }
    }
    return false;
}

// B6 (#708) — qualities whose voicing legitimately carries an internal minor 2nd
// as color (altered-dominant tensions: the b9 rubs the root, the #9 the major 3rd;
// dim/halfdim carry none but are listed defensively), so the de-cluster guard
// below leaves them alone. Everything else (maj7's root↔maj7, plain triads/7ths)
// must NOT voice an m2 adjacent — that's an octave-fold artifact, not the chord.
// Canonical quality strings only (`getChordDetails` emits 'dim'/'halfdim', never
// 'dim7'/'m7b5'). maj7#11/augmaj7 are deliberately NOT exempt: their root↔maj7
// fold must break, and spreading it also separates the #11/5 (a benign side
// effect — the Lydian #11 color survives, just an octave from the 5).
const M2_TOLERANT_QUALITIES = new Set(['7alt', '7b9', '7#9', '7b13', '7#11', 'dim', 'halfdim']);

/**
 * B6 (#708) — break any internal minor-2nd cluster created by independent
 * per-interval octave placement (e.g. Cmaj7 folding the maj7 down next to the
 * root → B+C). Move the LOWER note of the lowest m2 pair up an octave (keeps the
 * top voice / melody); fall back to dropping the UPPER note down if up would
 * leave the register. Bounded iterations — a 3–4 note voicing resolves in ≤3.
 */
function spreadMinorSeconds(midis: number[], min: number, max: number): number[] {
    const v = [...midis].sort((a, b) => a - b);
    for (let iter = 0; iter < 4; iter++) {
        let idx = -1;
        for (let i = 1; i < v.length; i++) {
            if (v[i] - v[i - 1] === 1) {
                idx = i;
                break;
            }
        }
        if (idx === -1) {
            break;
        }
        const lower = v[idx - 1];
        const upper = v[idx];
        if (lower + 12 <= max) {
            v[idx - 1] = lower + 12;
        } else if (upper - 12 >= min) {
            v[idx] = upper - 12;
        } else {
            break; // can't separate within the register slot
        }
        v.sort((a, b) => a - b);
    }
    return v;
}

/**
 * B7 (#708) — drop exact duplicate MIDIs before emit. The intensity≥0.8
 * `intervals.push(12)` can fold pc0 onto the root's MIDI, which would otherwise
 * schedule two oscillator banks on the same pitch (+6 dB, audible beating).
 */
function dedupeMidis(midis: number[]): number[] {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const m of midis) {
        const n = Math.round(m);
        if (seen.has(n)) {
            continue;
        }
        seen.add(n);
        out.push(n);
    }
    return out;
}

export function getBestInversion(
    state: any,
    rootMidi: number,
    intervals: number[],
    previousMidis: number[],
    options: InversionOptions = {},
): number[] {
    const {
        isPivot = false,
        anchor = null,
        min = 52,
        max = 84,
        style = 'stabs',
        enableVoiceLeading = false,
        quality,
    } = options;
    const { chords } = state;
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

    let result: number[];
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
        result = intervals.map((i: any) => rootMidi + i + bestShift).sort((a, b) => a - b);
    } else {
        result = [];
        intervals.forEach((inter, i) => {
            const note = rootMidi + inter;
            const pc = note % 12;
            const octaves = [-24, -12, 0, 12, 24];
            const candidates = octaves.map((o) => Math.floor(targetCenter / 12) * 12 + o + pc);
            candidates.sort((a, b) => Math.abs(a - targetCenter) - Math.abs(b - targetCenter));

            let best = candidates[0];
            if (i > 0 && best < RANGE_MIN) {
                while (best - result[i - 1] < 7) {
                    best += 12;
                }
            }
            result.push(best);
        });
    }

    // B6 (#708) — de-cluster the BASELINE here, before the voice-leading pass, so
    // VL re-smooths the cleaned voicing rather than having a later guard undo its
    // top-voice work. The per-interval octave placement above can fold a chord's
    // m2 pitch-class pair adjacent (e.g. Cmaj7 root↔maj7 → B+C); spread it unless
    // the quality legitimately carries the half-step. VL's own introduces-cluster
    // gate then keeps the refinement clean.
    if (!quality || !M2_TOLERANT_QUALITIES.has(quality)) {
        result = spreadMinorSeconds(result, RANGE_MIN, RANGE_MAX);
    }

    // Voice-leading second pass: refine the per-interval register-centroid baseline
    // by snapping each new voice toward its nearest pitch-class neighbor in
    // `previousMidis`. why: chords.md P1 #6 — the first pass places each interval
    // at "nearest octave to targetCenter" independently, so common tones and
    // guide-tone partners (b7→3, 3→7) don't carry across chord changes. This pass
    // snaps each voice to the octave of its nearest-PC prev voice; common tones
    // (PC dist 0) collapse to the prior MIDI exactly, half-step resolutions fall
    // out naturally. Cost-gated against the baseline so we only commit when total
    // voice-leading motion strictly decreases.
    //
    // Opt-in via `enableVoiceLeading`: this is jazz-style voice leading and is
    // appropriate for chord comping over functional progressions (ii–V–I). Pocket
    // genres (Neo-Soul, Funk, Reggae) and harmony-line callers that own their own
    // register intent (harmonies.ts spectral-gap branch) want stability, not
    // common-tone octave snaps, so the pass stays off by default. Production
    // callers can opt in per-genre in a follow-up; the test fixture exercises the
    // behavior directly.
    let voiceLedResult = result;
    if (enableVoiceLeading && previousMidis && previousMidis.length > 0) {
        const refined = result.map((current) => {
            const pc = ((current % 12) + 12) % 12;

            // Find the previous midi nearest in pitch-class space. Pitch-class
            // distance (mod 12, folded to [0,6]) means common tones get distance 0,
            // 7→3 and 3→7 get distance 1, etc. — natural priority order.
            let bestPrev = previousMidis[0];
            let bestPcDist = Number.POSITIVE_INFINITY;
            for (let p = 0; p < previousMidis.length; p++) {
                const prevPc = ((previousMidis[p] % 12) + 12) % 12;
                const raw = Math.abs(pc - prevPc);
                const pcDist = Math.min(raw, 12 - raw);
                if (pcDist < bestPcDist) {
                    bestPcDist = pcDist;
                    bestPrev = previousMidis[p];
                }
            }

            // Snap `current` to whichever octave of its pitch class sits closest to
            // bestPrev. For common tones this collapses to bestPrev itself; for
            // step-wise neighbors it picks the same octave as the prior partner.
            // Try candidates in distance order so that if the closest octave
            // falls outside the register slot we fall back to the next-closest.
            const prevOctaveBase = Math.floor(bestPrev / 12) * 12;
            const candidates = [
                prevOctaveBase - 12 + pc,
                prevOctaveBase + pc,
                prevOctaveBase + 12 + pc,
            ];
            candidates.sort((a, b) => Math.abs(a - bestPrev) - Math.abs(b - bestPrev));

            for (let c = 0; c < candidates.length; c++) {
                if (candidates[c] >= RANGE_MIN && candidates[c] <= RANGE_MAX) {
                    return candidates[c];
                }
            }
            return current;
        });

        const baselineCost = getNearestVoiceLeadingCost(result, previousMidis);
        const refinedCost = getNearestVoiceLeadingCost(refined, previousMidis);
        // Pocket-preservation gate: getNearestVoiceLeadingCost doesn't enforce a
        // one-to-one match between new and prev voices, so it can reward "all new
        // voices crowd around a single prev voice" — which
        // is how a greedy nearest-PC snap can ratchet a comping pattern down
        // toward the bass floor across a long progression. Require the refined
        // centroid to stay within a perfect fourth (5 semitones) of homeAnchor
        // so common-tone holds and step-wise resolutions can still commit but
        // a register slide can't. ANCHOR-relative (not baseline-relative) because
        // the goal is to keep voicings IN the comping pocket the caller asked for,
        // not just close to whatever the first pass happened to produce.
        const MAX_REFINED_CENTROID_DRIFT = 5;
        let refinedSum = 0;
        for (let i = 0; i < refined.length; i++) {
            refinedSum += refined[i];
        }
        const refinedCentroid = refinedSum / refined.length;
        const refinedAnchorDrift = Math.abs(refinedCentroid - homeAnchor);
        // why: #702 — the nearest-PC snap can pull an upper extension down a full
        // octave onto a common-tone position a half-step from a chord tone that
        // stayed put (the F7 13th D snapping to D4, a minor 2nd from the b7 Eb),
        // manufacturing an internal m2 cluster in the comp at a chord change — the
        // "wrong note from the organ on the IV7" report. The clean baseline spread
        // keeps the 13 an octave up, so reject any refinement that INTRODUCES a
        // minor 2nd the baseline didn't have and keep the baseline.
        //
        // Presence-based (not count-based): assumes the baseline spread is itself
        // cluster-free, which holds for every VL-genre quality (the register-
        // centroid spread always separates a chord's m2 pitch-class pairs by an
        // octave). If the baseline ever carried a cluster, a refinement adding a
        // *second, different* one could slip through — not reachable in practice.
        const introducesCluster = hasMinorSecondCluster(refined) && !hasMinorSecondCluster(result);
        if (
            refinedCost < baselineCost &&
            refinedAnchorDrift <= MAX_REFINED_CENTROID_DRIFT &&
            !introducesCluster
        ) {
            voiceLedResult = refined;
        }
    }

    let finalResult = voiceLedResult;
    const minNote = Math.min(...finalResult);
    if (minNote < RANGE_MIN) {
        finalResult = finalResult.map((n) => n + 12);
    }
    const maxNote = Math.max(...finalResult);
    if (maxNote > RANGE_MAX) {
        finalResult = finalResult.map((n) => n - 12);
    }

    // B7 (#708) — drop exact duplicate MIDIs after all register placement. The
    // VL snap or the intensity≥0.8 octave-double can collapse two voices onto one
    // pitch; emitting both schedules two oscillator banks on it (+6 dB beating).
    finalResult = dedupeMidis(finalResult);

    return finalResult.sort((a, b) => a - b);
}

/**
 * Mutates an existing progression string by subtly changing one or more chords.
 */
export function mutateProgression(progressionStr: string): {
    value: string;
    mutatedIndex: number;
} {
    if (!progressionStr?.trim()) {
        return { value: progressionStr, mutatedIndex: -1 };
    }
    const parts = progressionStr.split('|').map((p) => p.trim());

    // Pick 1 random index to mutate
    const mutatedParts: string[] = [...parts];
    const idx = Math.floor(Math.random() * parts.length);
    const original = parts[idx];

    // Simple substitutions based on common harmonic functions
    const substitutions: Record<string, string[]> = {
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
 */
export function transformRelativeProgression(input: string, semitoneShift: number): string {
    // Relative major/minor switch: rewrite Roman/NNS tokens against the new key while note-name
    // roots move by +shift. Shares the single tokenizer in transpose.ts with `transposeKey`.
    return transposeChordText(input, semitoneShift, { rewriteRelative: true });
}

/**
 * Resolves the root midi and base representations from a chord string.
 */
function resolveChordRoot(
    part: string,
    keyRootMidi: number,
    baseOctave: number,
): ResolvedChordRoot {
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
        let rootOffset = (ROMAN_VALS as any)[numeral.toUpperCase()];
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

import { getIntervals } from './chords-styles.js';

export { getIntervals };

/**
 * Formats chord names with appropriate suffixes based on quality and extensions.
 */
export function getFormattedChordNames(
    rootName: string,
    rootNNS: string,
    rootRomanBase: string,
    quality: string,
    is7th: boolean,
): FormattedChordNames {
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
            // why: add9 contains '9' so is7th=true, but the quality resolves to 'add9' not a
            // dominant/extended chord — excluding it prevents a stray '7' being appended (→ "add97")
            'add9',
        ].includes(quality)
    ) {
        absSuffix += '7';
        nnsSuffix += '7';
        romSuffix += '7';
    }

    let romanName: string;
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
 */
function parseProgressionPart(
    state: any,
    input: string,
    key: string,
    timeSignature: string,
    initialMidis: number[],
): { chords: Chord[]; finalMidis: number[] } {
    const { chords, groove } = state;
    const parsed: Chord[] = [];
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

                const { rootMidi, rootPart, romanMatch, nnsMatch, noteMatch } = resolveChordRoot(
                    chordPart,
                    keyRootMidi,
                    baseOctave,
                );

                // Handle slash bass if present
                let bassMidi: number | null = null;
                let bassNameAbs: string | null = null,
                    bassNameNNS: string | null = null,
                    bassNameRom: string | null = null;
                if (bassPart) {
                    const resolvedBass = resolveChordRoot(bassPart, keyRootMidi, baseOctave);
                    bassMidi = resolvedBass.rootMidi;

                    const bassInterval = (bassMidi - keyRootMidi + 24) % 12;
                    const bassAccidentalHint =
                        resolvedBass.romanMatch?.[1] ||
                        resolvedBass.nnsMatch?.[1] ||
                        (resolvedBass.noteMatch?.[1]?.includes('#')
                            ? '#'
                            : resolvedBass.noteMatch?.[1]?.includes('b')
                              ? 'b'
                              : '');
                    bassNameAbs = getAbsoluteDisplayNoteName(
                        bassMidi % 12,
                        key,
                        bassAccidentalHint,
                        resolvedBass.noteMatch?.[1] || '',
                    );
                    bassNameNNS = (INTERVAL_TO_NNS as any)[bassInterval];
                    bassNameRom = (INTERVAL_TO_ROMAN as any)[bassInterval];
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
                        isLowercase &&
                        numeral.toLowerCase() === 'vii' &&
                        !accidental &&
                        (suffixPart === '' || suffixPart === '7')
                    ) {
                        quality = 'halfdim';
                        is7th = true;
                    }
                }

                const intervals = getIntervals(
                    state,
                    quality,
                    is7th,
                    chords.density,
                    groove.genreFeel,
                );
                // Reduce mud: keep the comping pocket above the bass lane when that lane is active.
                const pianoMin = getBassSpaceFloor(state);
                const isPivot = parsed.length === 0;
                // why: chords.md P1 #6 / Epic 11 S6(a) — functional comping genres
                // (Jazz, Bossa, Blues) are built on guide-tone lines and common-tone
                // holds across ii–V–I motion, so the voice-leading second pass is
                // idiomatic there. Pocket genres (Funk/Neo-Soul/Reggae/Rock) want
                // voicing stability and keep the pass off. genreFeel is the canonical
                // genre key ('Bossa Nova', not 'Bossa').
                const vlGenre = groove.genreFeel;
                const enableVoiceLeading =
                    vlGenre === 'Jazz' || vlGenre === 'Bossa Nova' || vlGenre === 'Blues';
                let currentMidis = getBestInversion(state, rootMidi, intervals, lastMidis, {
                    isPivot,
                    anchor: chords.octave,
                    min: pianoMin,
                    max: 84,
                    enableVoiceLeading,
                    quality,
                });
                if (bassMidi !== null) {
                    currentMidis = ensurePitchClassAboveFloor(
                        currentMidis,
                        rootMidi % 12,
                        pianoMin,
                        84,
                    );
                    while (bassMidi >= currentMidis[0]) {
                        bassMidi -= 12;
                    }
                    const bassPC = bassMidi % 12;
                    const filtered = currentMidis.filter((m: any) => m % 12 !== bassPC);
                    if (filtered.length > 0) {
                        currentMidis = filtered;
                    }
                    currentMidis.unshift(bassMidi);
                    currentMidis.sort((a, b) => a - b);
                }
                lastMidis = currentMidis;

                const interval = (rootMidi - keyRootMidi + 24) % 12;
                const rootNNS = (INTERVAL_TO_NNS as any)[interval];
                const displayRomanBase = romanMatch
                    ? `${romanMatch[1] || ''}${romanMatch[2].toUpperCase()}`
                    : (INTERVAL_TO_ROMAN as any)[interval];
                const rootAccidentalHint =
                    romanMatch?.[1] ||
                    nnsMatch?.[1] ||
                    (noteMatch?.[1]?.includes('#')
                        ? '#'
                        : noteMatch?.[1]?.includes('b')
                          ? 'b'
                          : '');
                const rootName = getAbsoluteDisplayNoteName(
                    rootMidi % 12,
                    key,
                    rootAccidentalHint,
                    noteMatch?.[1] || '',
                );

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
                    (formatted.name as any).bass = bassNameAbs;
                    (formatted.nns as any).bass = bassNameNNS;
                    (formatted.roman as any).bass = bassNameRom;
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
 */
export function validateProgression(
    state: any,
    dispatch?: (...args: any[]) => any,
    renderCallback?: () => any,
): void {
    const { arranger } = state;
    let allChords: Chord[] = [];
    let lastMidis: number[] = [];

    arranger.sections.forEach((section: any) => {
        try {
            const repeats = section.repeat || 1;
            const sectionKey = section.key || arranger.key;
            const sectionTS = section.timeSignature || arranger.timeSignature;

            for (let r = 0; r < repeats; r++) {
                const { chords, finalMidis } = parseProgressionPart(
                    state,
                    section.value,
                    sectionKey,
                    sectionTS,
                    lastMidis,
                );
                const taggedChords = chords.map((c, idx) => ({
                    ...c,
                    sectionId: section.id,
                    sectionLabel: section.label,
                    keyIsMinor:
                        typeof section.isMinor === 'boolean' ? section.isMinor : arranger.isMinor,
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

    (arranger as Mutable<typeof arranger>).progression = allChords; // @direct-mutation
    updateProgressionCache(state);
    if (dispatch) {
        dispatch(ACTIONS.PROG_VALIDATED); // Notify Preact
    }
    if (renderCallback) {
        renderCallback();
    }
}

/**
 * Caches progression metadata to avoid redundant calculations in the scheduler.
 */
function updateProgressionCache(state: any): void {
    const { arranger } = state;
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
    const newStepMap = arranger.progression.map((chord: any) => {
        const tsName = chord.timeSignature || arranger.timeSignature;
        const ts = TIME_SIGNATURES[tsName] || TIME_SIGNATURES['4/4'];
        const steps = Math.round(chord.beats * ts.stepsPerBeat);
        const entry = { start: current, end: current + steps, chord };
        current += steps;
        return entry;
    });

    const newSectionMap: any[] = [];
    const newMeasureMap: any[] = [];

    let mapIndex = 0;
    let sectionAcc = 0;

    arranger.sections.forEach((section: any) => {
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
