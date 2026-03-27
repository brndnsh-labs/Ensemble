// Note: Keep APP_VERSION in sync with CACHE_NAME in sw.js
export const APP_VERSION = '2.44';
export const KEY_ORDER = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const ENHARMONIC_MAP = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
export const ROMAN_VALS = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
export const NNS_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
export const INTERVAL_TO_NNS = {
    0: '1',
    1: 'b2',
    2: '2',
    3: 'b3',
    4: '3',
    5: '4',
    6: 'b5',
    7: '5',
    8: 'b6',
    9: '6',
    10: 'b7',
    11: '7',
};
export const INTERVAL_TO_ROMAN = {
    0: 'I',
    1: 'bII',
    2: 'II',
    3: 'bIII',
    4: 'III',
    5: 'IV',
    6: '#IV',
    7: 'V',
    8: 'bVI',
    9: 'VI',
    10: 'bVII',
    11: 'VII',
};

export const TIME_SIGNATURES = {
    '2/4': {
        beats: 2,
        stepsPerBeat: 4,
        subdivision: '16th',
        pulse: [0, 4],
        grouping: [2],
        backbeat: [1],
    },
    '3/4': {
        beats: 3,
        stepsPerBeat: 4,
        subdivision: '16th',
        pulse: [0, 4, 8],
        grouping: [3],
        backbeat: [2],
    },
    '4/4': {
        beats: 4,
        stepsPerBeat: 4,
        subdivision: '16th',
        pulse: [0, 4, 8, 12],
        grouping: [2, 2],
        backbeat: [1, 3],
    },
    '5/4': {
        beats: 5,
        stepsPerBeat: 4,
        subdivision: '16th',
        pulse: [0, 4, 8, 12, 16],
        grouping: [3, 2],
        backbeat: [1, 3],
    },
    '6/8': {
        beats: 6,
        stepsPerBeat: 2,
        subdivision: '8th',
        pulse: [0, 6],
        grouping: [3, 3],
        isCompound: true,
        backbeat: [1],
    },
    '7/8': {
        beats: 7,
        stepsPerBeat: 2,
        subdivision: '8th',
        pulse: [0, 4, 8],
        grouping: [2, 2, 3],
        backbeat: [1, 2],
    },
    '7/4': {
        beats: 7,
        stepsPerBeat: 4,
        subdivision: '16th',
        pulse: [0, 4, 8, 12, 16, 20, 24],
        grouping: [4, 3],
        backbeat: [1, 3, 5],
    },
    '12/8': {
        beats: 12,
        stepsPerBeat: 2,
        subdivision: '8th',
        pulse: [0, 6, 12, 18],
        grouping: [3, 3, 3, 3],
        isCompound: true,
        backbeat: [1, 3],
    },
};

export const MIXER_GAIN_MULTIPLIERS = {
    master: 0.85,
    chords: 0.25, // Tighter harmonic space
    bass: 0.35, // More solid foundation
    soloist: 0.32, // Tamed melodic focus
    harmonies: 0.28, // More supportive presence
    drums: 0.52, // Balanced rhythm with a clearer beat anchor
};

export const SMART_BASS_STYLE_MAP = {
    Rock: 'rock',
    Jazz: 'quarter',
    Funk: 'funk',
    Disco: 'disco',
    Reggae: 'dub',
    'Neo-Soul': 'neo',
    'Bossa Nova': 'bossa',
    Afrobeat: 'funk',
    Blues: 'blues',
    Acoustic: 'acoustic',
    'Hip Hop': 'hiphop',
    Country: 'country',
    Metal: 'metal',
    'Ska-Punk': 'walking-ska',
    Ska: 'walking-ska',
};

export const SMART_SCALE_STYLE_MAP = {
    Rock: 'rock',
    Jazz: 'jazz',
    Funk: 'funk',
    Blues: 'blues',
    'Neo-Soul': 'neo',
    Disco: 'disco',
    Bossa: 'bossa',
    'Bossa Nova': 'bossa',
    Afrobeat: 'funk',
    Acoustic: 'minimal',
    Reggae: 'minimal',
    Country: 'country',
    Metal: 'metal',
    'Rock/Metal': 'metal',
    'Ska-Punk': 'rock',
    Ska: 'rock',
};

/**
 * Resolves a mapped style from one or two genre keys.
 * @param {Record<string, string>} mapping
 * @param {string | undefined} primaryKey
 * @param {string | undefined} [secondaryKey]
 * @param {string} [fallback='rock']
 * @returns {string}
 */
export function resolveMappedStyle(mapping, primaryKey, secondaryKey, fallback = 'rock') {
    if (primaryKey && Object.hasOwn(mapping, primaryKey)) {
        return mapping[primaryKey];
    }

    if (secondaryKey && Object.hasOwn(mapping, secondaryKey)) {
        return mapping[secondaryKey];
    }

    return fallback;
}

export const REGGAE_RIDDIMS = {
    Stalag: [
        [0, 0, 1.1, 2],
        [2, 0, 0.9, 2],
        [4, 7, 1.0, 2],
        [6, 0, 1.1, 2],
        [10, 0, 0.9, 2],
        [12, 7, 1.0, 2],
    ],
    '54-46': [
        [0, 0, 1.1, 2],
        [2, 0, 0.9, 2],
        [6, 0, 1.0, 2],
        [8, 0, 1.1, 2],
        [10, 0, 0.9, 2],
        [14, 0, 1.0, 2],
    ],
    'Real Rock': [
        [0, 0, 1.1, 3],
        [3, 0, 0.8, 1],
        [4, 7, 1.0, 3],
        [7, 7, 0.8, 1],
        [8, 10, 1.1, 3],
        [11, 10, 0.8, 1],
        [12, 7, 1.0, 4],
    ],
    Steppers: [
        [0, 0, 1.1, 2],
        [4, 0, 1.0, 2],
        [8, 0, 1.1, 2],
        [12, 0, 1.0, 2],
    ],
    'One Drop': [[8, 0, 1.2, 4]],
};
