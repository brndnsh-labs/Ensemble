// cspell:ignore iidim

const DEFAULT_SETTINGS = {
    bpm: 120,
    style: 'pop',
};

const PRESETS_RAW = [
    {
        name: 'Pop (Standard)',
        sections: [
            {
                label: 'Main',
                value: 'I | V | vi | IV',
            },
        ],
        category: 'Pop/Rock',
        isMinor: false,
    },
    {
        name: 'Pop (Ballad)',
        sections: [
            {
                label: 'Main',
                value: 'vi | IV | I | V',
            },
        ],
        category: 'Pop/Rock',
        isMinor: false,
        settings: {
            bpm: 85,
            style: 'pad',
        },
    },
    {
        name: 'Country Standard',
        sections: [
            {
                label: 'Main',
                value: 'I | I | IV | IV | I | V | I | I',
            },
        ],
        category: 'Country/Folk',
        isMinor: false,
        settings: {
            bpm: 100,
            style: 'strum-country',
        },
    },
    {
        name: 'Metal Core',
        sections: [
            {
                label: 'Main',
                value: 'im | bVI | bVII | im',
            },
        ],
        category: 'Rock/Metal',
        isMinor: true,
        settings: {
            bpm: 160,
            style: 'power-metal',
        },
    },
    {
        name: '50s Rock',
        sections: [
            {
                label: 'Main',
                value: 'I | vi | IV | V',
            },
        ],
        category: 'Pop/Rock',
        isMinor: false,
        settings: {
            bpm: 140,
            style: 'rock',
            timeSignature: '4/4',
        },
    },
    {
        name: 'Royal Road',
        sections: [
            {
                label: 'Main',
                value: 'IVmaj7 | V7 | iii7 | vi7',
            },
        ],
        category: 'Pop/Rock',
        isMinor: false,
        settings: {
            bpm: 110,
        },
    },
    {
        name: 'Canon',
        sections: [
            {
                label: 'Main',
                value: 'I | V | vi | iii | IV | I | IV | V',
            },
        ],
        category: 'Classical/Trad',
        isMinor: false,
        settings: {
            bpm: 90,
            style: 'arpeggio',
        },
    },
    {
        name: 'Andalusian',
        sections: [
            {
                label: 'Main',
                value: 'i | bVII | bVI | V',
            },
        ],
        category: 'Classical/Trad',
        isMinor: true,
        settings: {
            bpm: 130,
            style: 'skank',
        },
    },
    {
        name: '12-Bar Blues',
        sections: [
            {
                label: 'Main',
                value: 'I7 | I7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7',
            },
        ],
        category: 'Blues',
        isMinor: false,
        settings: {
            bpm: 100,
            style: 'blues',
        },
    },
    {
        name: 'Minor Blues',
        sections: [
            {
                label: 'Main',
                value: 'i7 | i7 | i7 | i7 | iv7 | iv7 | i7 | i7 | bVI7 | V7 | i7 | V7',
            },
        ],
        category: 'Blues',
        isMinor: true,
        settings: {
            bpm: 90,
            style: 'blues',
        },
    },
    {
        name: '8-Bar Blues',
        sections: [
            {
                label: 'Main',
                value: 'I7 | V7 | IV7 | IV7 | I7 | V7 | I7 | V7',
            },
        ],
        category: 'Blues',
        isMinor: false,
        settings: {
            bpm: 110,
            style: 'blues',
        },
    },
    {
        name: 'Jazz Blues',
        sections: [
            {
                label: 'Main',
                value: 'I7 | IV7 | I7 | v7 I7 | IV7 | IV7 | I7 | iii7 VI7 | ii7 | V7 | I7 VI7 | ii7 V7',
            },
        ],
        category: 'Blues',
        isMinor: false,
        settings: {
            bpm: 140,
            style: 'jazz',
        },
    },
    {
        name: 'Giant Steps',
        sections: [
            {
                label: 'Main',
                value: 'Imaj7 bIII7 | bVImaj7 VII7 | IIImaj7 | bviim7 bIII7 | bVImaj7 VII7 | IIImaj7 V7 | Imaj7 | #ivm7 VII7 | IIImaj7 | bviim7 bIII7 | bVImaj7 | iim7 V7 | Imaj7 | #ivm7 VII7 | IIImaj7 | iim7 V7',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: {
            bpm: 220,
            style: 'jazz',
        },
    },
    {
        name: 'Ornithology',
        sections: [
            {
                label: 'A',
                value: 'Imaj7 | Imaj7 | im7 | IV7 | bVIImaj7 | bVIImaj7 | bviim7 | bIII7',
            },
            {
                label: 'A',
                value: 'Imaj7 | Imaj7 | im7 | IV7 | bVIImaj7 | bVIImaj7 | bviim7 | bIII7',
            },
            {
                label: 'B',
                value: 'bVImaj7 | bVImaj7 | iim7b5 | V7b9 | im7 | im7 | iim7 | V7',
            },
            {
                label: 'A',
                value: 'Imaj7 | Imaj7 | im7 | IV7 | bviim7 | bIII7 | bVImaj7 V7 | Imaj7',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: {
            bpm: 160,
            style: 'jazz',
        },
    },
    {
        name: 'Donna Lee',
        sections: [
            {
                label: 'A',
                value: 'Imaj7 | VI7 | II7 | II7 | iim7 | V7 | Imaj7 | iim7 V7',
            },
            {
                label: 'B (G)',
                value: 'Imaj7 | VI7 | II7 | II7 | #im7 #IV7 | VIImaj7 | iim7 | V7',
            },
            {
                label: 'A',
                value: 'Imaj7 | VI7 | II7 | II7 | iim7 | V7 | III7 | vi7',
            },
            {
                label: 'C',
                value: 'IVmaj7 | #IVdim7 | Imaj7/V | VI7 | II7 | V7 | Imaj7 | iim7 V7',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: {
            bpm: 220,
            style: 'jazz',
        },
    },
    {
        name: 'Rhythm Changes',
        sections: [
            {
                label: 'A',
                value: 'I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I',
            },
            {
                label: 'A',
                value: 'I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I',
            },
            {
                label: 'B',
                value: 'III7 | III7 | VI7 | VI7 | II7 | II7 | V7 | V7',
            },
            {
                label: 'A',
                value: 'I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: {
            bpm: 180,
            style: 'jazz',
        },
    },
    {
        name: 'Autumn Leaves',
        sections: [
            {
                label: 'A',
                value: 'ii7 | V7 | Imaj7 | IVmaj7 | viiø7 | III7alt | vi7 | vi7',
            },
            {
                label: 'A',
                value: 'ii7 | V7 | Imaj7 | IVmaj7 | viiø7 | III7alt | vi7 | vi7',
            },
            {
                label: 'B',
                value: 'viiø7 | III7alt | vi7 | vi7 | ii7 | V7 | Imaj7 | IVmaj7',
            },
            {
                label: 'C',
                value: 'viiø7 | III7alt | vi7 | vi7 | viiø7 | III7alt | vi7 | vi7',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: {
            bpm: 140,
            style: 'jazz',
        },
    },
    {
        name: 'Stella by Starlight',
        sections: [
            {
                label: 'A',
                value: '#ivm7b5 | VII7b9 | iim7 | V7b9 | vm7 | I7 | IVmaj7 | bVII7',
            },
            {
                label: 'B',
                value: 'Imaj7 | #ivm7b5 VII7b9 | iiim7 | im7 IV7 | Vmaj7 | #ivm7b5 VII7 | viim7b5 | III7b9',
            },
            {
                label: 'C',
                value: 'VI7+ | VI7+ | iim7 | iim7 | bVII7 | bVII7 | Imaj7 | Imaj7',
            },
            {
                label: 'D',
                value: '#ivm7b5 | VII7b9 | iiim7b5 | VI7b9 | iim7b5 | V7b9 | Imaj7 | Imaj7',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: {
            style: 'jazz',
        },
    },
    {
        name: 'All The Things You Are',
        sections: [
            {
                label: 'A (Ab)',
                value: 'vi7 | ii7 | V7 | Imaj7 | IVmaj7',
            },
            {
                label: 'A (C)',
                value: 'iim7 V7 | Imaj7 | Imaj7',
                keyShift: 4,
                seamless: true,
            },
            {
                label: 'A2 (Eb)',
                value: 'vi7 | ii7 | V7 | Imaj7 | IVmaj7',
                keyShift: 7,
            },
            {
                label: 'A2 (G)',
                value: 'iim7 V7 | Imaj7 | Imaj7',
                keyShift: -1,
                seamless: true,
            },
            {
                label: 'B (G)',
                value: 'iim7 | V7 | Imaj7 | Imaj7',
                keyShift: -1,
            },
            {
                label: 'B (E)',
                value: 'iidim7 | V7 | Imaj7 | bVI7alt',
                keyShift: 8,
                seamless: true,
            },
            {
                label: 'A3 (Ab)',
                value: 'vi7 | ii7 | V7 | Imaj7 | IVmaj7 | ivm7 | iiim7 | bIIIdim7 | iim7 | V7 | Imaj7 | III7alt',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: {
            bpm: 135,
            style: 'jazz',
        },
    },
    {
        name: 'Neo-Soul (Deep)',
        sections: [
            {
                label: 'Verse',
                value: 'IVmaj9 | III7#9 | vi11 | V9sus4',
                repeat: 2,
            },
            {
                label: 'Chorus',
                value: 'ii9 | bIImaj7 | Imaj9 | vi9',
                repeat: 2,
            },
        ],
        category: 'Soul/R&B',
        isMinor: false,
        settings: {
            bpm: 85,
            style: 'neo',
        },
    },
    {
        name: 'Acid Jazz (London)',
        sections: [
            {
                label: 'Loop',
                value: 'im9 | IV13 | bviim9 | bIII13 | bVImaj7 | bIImaj7 | im9 | V7alt',
            },
        ],
        category: 'Soul/R&B',
        isMinor: true,
        settings: {
            bpm: 115,
            style: 'funk',
        },
    },
    {
        name: 'Funk (i-IV)',
        sections: [
            {
                label: 'Main',
                value: 'i7 | IV7 | i7 | IV7',
            },
        ],
        category: 'Soul/R&B',
        isMinor: true,
        settings: {
            bpm: 110,
            style: 'funk',
        },
    },
    {
        name: 'Funk (Grand Groove)',
        sections: [
            {
                label: 'Verse',
                value: 'im11 | im11 | IV9 | IV13',
                repeat: 2,
            },
            {
                label: 'Chorus',
                value: 'bVII13 | bVImaj7 | v11 | I7#9',
                repeat: 2,
            },
        ],
        category: 'Soul/R&B',
        isMinor: true,
        settings: {
            bpm: 108,
            style: 'funk',
        },
    },
    {
        name: 'Circle of 4ths',
        sections: [
            {
                label: 'Main',
                value: 'I7 | IV7 | bVII7 | bIII7 | bVI7 | bII7 | V7 | I7',
            },
        ],
        category: 'Theory',
        isMinor: false,
    },
    {
        name: 'Plagal Flow',
        sections: [
            {
                label: 'Main',
                value: 'I | IV | I | IV',
            },
        ],
        category: 'Theory',
        isMinor: false,
    },
    {
        name: 'Cherokee',
        sections: [
            {
                label: 'A',
                value: 'Imaj7 | Imaj7 | vm7 | I7 | IVmaj7 | IVmaj7 | bVII7 | bVII7 | Imaj7 | Imaj7 | II7 | II7 | iim7 | VI7 | iim7 | V7+',
            },
            {
                label: 'A2',
                value: 'Imaj7 | Imaj7 | vm7 | I7 | IVmaj7 | IVmaj7 | bVII7 | bVII7 | Imaj7 | Imaj7 | II7 | II7 | iim7 | V7 | Imaj7 | Imaj7',
            },
            {
                label: 'B (B)',
                value: 'iim7 | V7 | Imaj7 | Imaj7',
                keyShift: 1,
            },
            {
                label: 'B (A)',
                value: 'iim7 | V7 | Imaj7 | Imaj7',
                keyShift: -1,
                seamless: true,
            },
            {
                label: 'B (G)',
                value: 'iim7 | V7 | Imaj7 | Imaj7',
                keyShift: -3,
                seamless: true,
            },
            {
                label: 'B (Bb)',
                value: 'vim7 | II7 | iim7 | V7+',
                seamless: true,
            },
            {
                label: 'A3',
                value: 'Imaj7 | Imaj7 | vm7 | I7 | IVmaj7 | IVmaj7 | bVII7 | bVII7 | Imaj7 | Imaj7 | II7 | II7 | iim7 | V7 | Imaj7 | Imaj7',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: {
            bpm: 240,
            style: 'jazz',
        },
    },
    {
        name: 'Blue Bossa',
        sections: [
            {
                label: 'Main',
                value: 'im7 | im7 | ivm7 | ivm7 | iim7b5 | V7alt | im7 | im7',
            },
            {
                label: 'Modulation',
                value: 'iim7 | V7 | Imaj7 | Imaj7',
                keyShift: 1,
            },
            {
                label: 'Turnaround',
                value: 'iim7b5 | V7alt | im7 | iim7b5 V7alt',
            },
        ],
        category: 'Jazz',
        isMinor: true,
        settings: {
            bpm: 140,
            style: 'bossa',
        },
    },
    {
        name: 'Night and Day',
        sections: [
            {
                label: 'Verse (A)',
                value: 'iim7 | V7 | Imaj7 | Imaj7',
                repeat: 2,
            },
            {
                label: 'Verse (B)',
                value: '#ivm7 | ivm7 | iiim7 | bIIIdim7 | iim7 | V7 | Imaj7 | Imaj7',
            },
            {
                label: 'Verse (B2)',
                value: '#ivm7 | ivm7 | iiim7 | bIIIdim7 | iim7 | V7 | Imaj7 | bVII7',
            },
            {
                label: 'Bridge',
                value: 'bIIImaj7 | bIIImaj7 | Imaj7 | Imaj7',
                repeat: 2,
            },
            {
                label: 'Outro',
                value: '#ivm7 | ivm7 | iiim7 | bIIIdim7 | iim7 | V7 | Imaj7 | Imaj7',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: {
            bpm: 130,
            style: 'jazz',
        },
    },
    {
        name: 'All Blues',
        sections: [
            {
                label: 'Head',
                value: 'G7 | G7 | G7 | G7 | C7 | C7 | G7 | G7 | D7#9 | Eb7#9 D7alt | G7 | G7',
                timeSignature: '6/8',
            },
            {
                label: 'Vamp',
                value: 'G7 | G7 | G7 | G7',
                timeSignature: '6/8',
                repeat: 2,
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: {
            bpm: 110,
            style: 'jazz',
            timeSignature: '6/8',
        },
    },
    {
        name: 'Alternative Loop',
        sections: [
            {
                label: 'Loop',
                value: 'I | I | III | III | IV | IV | iv | iv',
            },
        ],
        category: 'Pop/Rock',
        settings: {
            style: 'smart',
        },
    },
];

export const CHORD_PRESETS = PRESETS_RAW.map((p) => ({
    ...p,
    settings: p.settings ? { ...DEFAULT_SETTINGS, ...p.settings } : { ...DEFAULT_SETTINGS },
}));
