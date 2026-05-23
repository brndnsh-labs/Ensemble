import type { EnsembleState } from '../types.js';

const BASS_SPACE_FEELS = new Set([
    'Swing',
    'Jazz',
    'Neo-Soul',
    'Funk',
    'Blues',
    'Bossa',
    'Bossa Nova',
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

export function shouldReserveBassSpace(state: EnsembleState): boolean {
    return Boolean(state.playback.practiceMode || state.bass?.enabled);
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
): boolean {
    if (!shouldReserveBassSpace(state) || !isBassSpaceFeel(feel)) {
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

export function getBassSpaceFloor(state: EnsembleState): number {
    return shouldReserveBassSpace(state) ? 52 : 43;
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
