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

/**
 * @param {string | undefined | null} feel
 * @returns {boolean}
 */
export function isBassSpaceFeel(feel) {
    return BASS_SPACE_FEELS.has(feel || '');
}

/**
 * @param {import('../types.js').EnsembleState} state
 * @returns {boolean}
 */
export function shouldReserveBassSpace(state) {
    return Boolean(state.playback.practiceMode || state.bass?.enabled);
}

/**
 * In practice mode we still want pro-style voicings, but some chords lose too much
 * identity if they are forced rootless. Let these chords re-admit the root while
 * still keeping the voicing above the bass lane.
 * @param {import('../types.js').EnsembleState} state
 * @param {string | undefined | null} quality
 * @param {string | undefined | null} feel
 * @returns {boolean}
 */
export function shouldPreferGroundedPracticeVoicing(state, quality, feel) {
    if (!state.playback.practiceMode || !isBassSpaceFeel(feel)) {
        return false;
    }
    return PRACTICE_GROUNDING_QUALITIES.has(quality || '');
}

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {string} quality
 * @param {boolean} is7th
 * @param {string | undefined | null} feel
 * @returns {boolean}
 */
export function shouldUseRootlessVoicing(state, quality, is7th, feel) {
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

/**
 * @param {import('../types.js').EnsembleState} state
 * @returns {number}
 */
export function getBassSpaceFloor(state) {
    return shouldReserveBassSpace(state) ? 52 : 43;
}
