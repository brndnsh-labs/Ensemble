export const SONG_TEMPLATES = [
    {
        name: 'Standard Pop',
        sections: [
            { label: 'Intro', value: 'I | IV | V | I' },
            { label: 'Verse', value: 'I | vi | IV | V' },
            { label: 'Chorus', value: 'IV | V | I | vi' },
            { label: 'Verse', value: 'I | vi | IV | V' },
            { label: 'Chorus', value: 'IV | V | I | vi' },
            { label: 'Outro', value: 'I | IV | I | I' },
        ],
    },
    {
        // Full-length pop single (intro/verse/chorus/verse/chorus/bridge/chorus/outro).
        // 88 bars → ~2:59 at 118 BPM (a classic pop-radio tempo; set it in the topbar).
        // Built as a by-ear TEST vehicle: the repeated Verse triggers arrangement-by-
        // subtraction on its 2nd pass (#1008), the distinct Bridge floats on pads, the
        // three Choruses build to a doubled tutti final chorus, and the 8-bar Intro gives
        // the layered stair-step (drums→+bass→+comp→+harmony, INTRO_MUTES) room to breathe.
        // Axis progression (I–V–vi–IV) for the bright hooks; relative-minor start (vi–IV–I–V)
        // for the moodier verses; the "royal road" IV–V–iii–vi bridge for harmonic contrast;
        // a plagal IV–I "amen" outro to wind down.
        name: 'Pop Single (Full Form)',
        sections: [
            { label: 'Intro', value: 'I | V | vi | IV', repeat: 2 }, // 8 bars
            { label: 'Verse', value: 'vi | IV | I | V', repeat: 4 }, // 16 bars
            { label: 'Chorus', value: 'I | V | vi | IV', repeat: 2 }, // 8 bars
            { label: 'Verse', value: 'vi | IV | I | V', repeat: 4 }, // 16 bars (repeat → subtraction fires)
            { label: 'Chorus', value: 'I | V | vi | IV', repeat: 2 }, // 8 bars
            { label: 'Bridge', value: 'IV | V | iii | vi', repeat: 2 }, // 8 bars
            { label: 'Chorus', value: 'I | V | vi | IV', repeat: 4 }, // 16 bars (final, doubled → tutti)
            { label: 'Outro', value: 'IV | I | IV | I', repeat: 2 }, // 8 bars
        ],
        isMinor: false,
    },
    {
        name: 'Jazz AABA',
        sections: [
            { label: 'A', value: 'iim7 | V7 | Imaj7 | VI7' },
            { label: 'A', value: 'iim7 | V7 | Imaj7 | VI7' },
            { label: 'B', value: 'IVmaj7 | IVm7 | iiim7 | VI7' },
            { label: 'A', value: 'iim7 | V7 | Imaj7 | Imaj7' },
        ],
    },
    {
        name: 'Blues (12 Bar)',
        sections: [
            {
                label: 'Blues',
                value: 'I7 | IV7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7',
            },
        ],
    },
    {
        name: 'EDM / Loop',
        sections: [
            { label: 'Build', value: 'vi | V | IV | III7' },
            { label: 'Drop', value: 'vi | IV | I | V' },
        ],
        isMinor: false,
    },
    {
        name: 'Alternative Loop',
        sections: [{ label: 'Loop', value: 'I | I | III | III | IV | IV | iv | iv' }],
        isMinor: false,
    },
    {
        name: 'Neo-Soul (Deep)',
        sections: [
            { label: 'Verse', value: 'IVmaj9 | III7#9 | vi11 | V9sus4', repeat: 2 },
            { label: 'Chorus', value: 'ii9 | bIImaj7 | Imaj9 | vi9', repeat: 2 },
        ],
        isMinor: false,
    },
    {
        name: 'Funk (Grand Groove)',
        sections: [
            { label: 'Verse', value: 'im11 | im11 | IV9 | IV13', repeat: 2 },
            { label: 'Chorus', value: 'bVII13 | bVImaj7 | v11 | I7#9', repeat: 2 },
        ],
        isMinor: true,
    },
];
