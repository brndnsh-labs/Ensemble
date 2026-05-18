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
    chords: 0.13, // Keeps chords slightly more forward while preserving the shared headroom budget
    bass: 0.1575, // Preserves the previous 45% default bass balance at unity UI volume
    soloist: 0.15, // Keeps melodic lead presence slightly under the prior default mix
    harmonies: 0.1, // Holds harmony behind the chord bed while leaving drums a bit more room
    drums: 0.26, // Keeps the rhythmic anchor near the earlier default loudness
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
    // why: bass.md P0 #1 — these three canonical genre keys (matching
    // groove-engine.ts strategies map) previously fell through to fallback
    // 'rock' and played rock bass under all of them. Routes pick idiomatic
    // floors:
    //   Shred ≈ Metal (CLAUDE.md alias family).
    //   Minimal = 'whole' (drone-floor): one sustained root per chord. This is
    //     the La Monte Young end of minimalism; Reich/Glass/Riley
    //     broken-chord pattern minimalism is deferred to a future story.
    //   Latin = 'walking-ska' (ship-now floor): bouncy 8ths, closer than rock
    //     but NOT idiomatic Latin — tumbao (anticipated 2&, R-5 lower-neighbor
    //     against clave) is the canonical Latin bass idiom and is deferred to a
    //     future story per S4 partial-ship note.
    Latin: 'walking-ska',
    Minimal: 'whole',
    Shred: 'metal',
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

export function resolveMappedStyle(
    mapping: Record<string, string>,
    primaryKey: string | undefined,
    secondaryKey?: string | undefined,
    fallback = 'rock',
): string {
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
