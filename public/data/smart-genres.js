const GENRE_DEFAULTS = {
    swing: 0,
    sub: '16th',
    chord: 'smart',
    harmony: 'smart',
};

const GENRE_OVERRIDES = {
    Rock: {
        sub: '8th',
        drum: 'Basic Rock',
        feel: 'Rock',
        bass: 'rock',
        soloist: 'shred',
    },
    Jazz: {
        swing: 60,
        sub: '8th',
        drum: 'Jazz',
        feel: 'Jazz',
        chord: 'jazz',
        bass: 'quarter',
        soloist: 'bird',
        harmony: 'horns',
    },
    Funk: {
        swing: 15,
        drum: 'Funk',
        feel: 'Funk',
        chord: 'funk',
        bass: 'funk',
        soloist: 'funk',
        harmony: 'horns',
    },
    Disco: {
        drum: 'Disco',
        feel: 'Disco',
        bass: 'disco',
        soloist: 'disco',
    },
    'Hip Hop': {
        swing: 25,
        drum: 'Hip Hop',
        feel: 'Hip Hop',
        bass: 'hiphop',
        soloist: 'neo',
    },
    Blues: {
        swing: 90,
        sub: '8th',
        drum: 'Blues Shuffle',
        feel: 'Blues',
        chord: 'jazz',
        bass: 'blues',
        soloist: 'blues',
        harmony: 'horns',
    },
    'Neo-Soul': {
        swing: 30,
        drum: 'Neo-Soul',
        feel: 'Neo-Soul',
        bass: 'neo',
        soloist: 'neo',
        harmony: 'strings',
    },
    Reggae: {
        swing: 20,
        drum: 'Reggae',
        feel: 'Reggae',
        bass: 'dub',
        soloist: 'minimal',
    },
    Acoustic: {
        swing: 15,
        sub: '8th',
        drum: 'Acoustic',
        feel: 'Acoustic',
        chord: 'pad',
        bass: 'acoustic',
        soloist: 'minimal',
        harmony: 'strings',
    },
    Bossa: {
        drum: 'Bossa Nova',
        feel: 'Bossa Nova',
        chord: 'jazz',
        bass: 'bossa',
        soloist: 'bossa',
        harmony: 'strings',
    },
    Country: {
        swing: 60,
        drum: 'Country (Two-Step)',
        feel: 'Country',
        chord: 'strum-country',
        bass: 'country',
        soloist: 'country',
    },
    Metal: {
        drum: 'Metal (Speed)',
        feel: 'Metal',
        chord: 'power-metal',
        bass: 'metal',
        soloist: 'metal',
    },
    'Ska-Punk': {
        sub: '8th',
        drum: 'Ska',
        feel: 'Ska',
        chord: 'ska-upstroke',
        bass: 'walking-ska',
        soloist: 'ska-horns',
        harmony: 'horns',
    },
};

export const SMART_GENRES = Object.keys(GENRE_OVERRIDES).reduce((acc, key) => {
    /** @type {any} */ (acc)[key] = {
        ...GENRE_DEFAULTS,
        .../** @type {any} */ (GENRE_OVERRIDES)[key],
    };
    return acc;
}, {});

export const GENRE_NAMES = Object.keys(GENRE_OVERRIDES);
export const GENRE_FEELS = Object.values(GENRE_OVERRIDES).map((g) => g.feel);
