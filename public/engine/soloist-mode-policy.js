const SOLOIST_MODE_ALIASES = {
    polyphonic: 'monophonic',
    piano: 'monophonic',
};

const CANONICAL_SOLOIST_MODES = new Set(['monophonic', 'guitar']);

/**
 * Normalize legacy or invalid soloist phrasing mode values.
 * @param {string | null | undefined} mode
 * @returns {'monophonic' | 'guitar'}
 */
export function resolveSoloistMode(mode) {
    if (typeof mode !== 'string') {
        return 'monophonic';
    }

    const canonical =
        SOLOIST_MODE_ALIASES[/** @type {keyof typeof SOLOIST_MODE_ALIASES} */ (mode)] || mode;

    return CANONICAL_SOLOIST_MODES.has(canonical)
        ? /** @type {'monophonic' | 'guitar'} */ (canonical)
        : 'monophonic';
}

/**
 * @param {string | null | undefined} mode
 * @returns {boolean}
 */
export function isSoloistMonophonicMode(mode) {
    return resolveSoloistMode(mode) === 'monophonic';
}

/**
 * @param {string | null | undefined} mode
 * @returns {boolean}
 */
export function isSoloistGuitarMode(mode) {
    return resolveSoloistMode(mode) === 'guitar';
}

/**
 * @param {string | null | undefined} _mode
 * @returns {boolean}
 */
export function isSoloistPianoMode(_mode) {
    return false;
}

/**
 * @param {string | null | undefined} mode
 * @returns {boolean}
 */
export function allowsSoloistPolyphony(mode) {
    return !isSoloistMonophonicMode(mode);
}

/**
 * @param {string | null | undefined} mode
 * @returns {number}
 */
export function getSoloistVoiceLimit(mode) {
    const resolved = resolveSoloistMode(mode);
    if (resolved === 'guitar') {
        return 2;
    }
    return 1;
}
