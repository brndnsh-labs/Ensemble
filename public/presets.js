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

export const DRUM_PRESETS = {
    Standard: {
        category: 'Basic',
        swing: 0,
        sub: '8th',
        Kick: '2000000010000000',
        Snare: '0000200000002000',
        HiHat: '2010201020102010',
        Open: '0000000000000000',
        '3/4': {
            // Waltz-ish K-S-S
            Kick: '200000000000',
            Snare: '000020002000',
            HiHat: '201020102010',
        },
        '5/4': {
            // 3+2 feel (Take Five ish)
            Kick: '20000000001000000000',
            Snare: '00000000000020000000', // Snare on 4
            HiHat: '20102010201020102010',
        },
        '7/8': {
            // 2+2+3 feel
            Kick: '20000000200000',
            Snare: '00002000000000',
            HiHat: '20102010201010',
        },
        '7/4': {
            // Money-ish feel (4+3)
            // 28 steps.
            // Kick on 1, 3(ish), 5(ish)
            Kick: '2000000020000000200000000000',
            Snare: '0000200000002000000020000000',
            HiHat: '2010201020102010201020102010',
        },
        '12/8': {
            // Slow Blues / Doo-wop feel
            // 24 steps. Kick on 1(0), 3(12). Snare on 2(6), 4(18).
            Kick: '200000000000200000000000',
            Snare: '000000200000000000200000',
            HiHat: '201010201010201010201010',
        },
    },
    'Backbeat Only': {
        category: 'Basic',
        swing: 0,
        sub: '8th',
        Kick: '0000000000000000',
        Snare: '0000200000002000',
        HiHat: '0000000000000000',
        Open: '0000000000000000',
        '3/4': { Snare: '000020002000' },
        '5/4': { Snare: '00000000000020000000' },
        '6/8': { Snare: '000000200000' },
        '7/8': { Snare: '00000000002000' },
        '7/4': { Snare: '0000200000002000000020000000' },
        '12/8': { Snare: '000000200000000000200000' },
    },
    'Basic Rock': {
        category: 'Pop/Rock',
        swing: 0,
        sub: '8th',
        Kick: '2000000020100000',
        Snare: '0000200000002000',
        HiHat: '2020202020202020',
        variations: [
            {
                name: 'Standard',
                Kick: '2000000020100000',
                Snare: '0000200000002000',
                HiHat: '2020202020202020',
            },
            {
                name: 'Sparse',
                Kick: '2000000020000000',
                Snare: '0000200000002000',
                HiHat: '2000200020002000',
            },
            {
                name: 'Driven',
                Kick: '2000100020100000',
                Snare: '0000200000002000',
                HiHat: '2020202020202020',
                Open: '0000000000000000', // Open hats handled by procedural logic but defined here for structure
            },
        ],
        Open: '0000000000000000',
        '3/4': {
            // Rock Waltz K-- S-- K--
            Kick: '200000002000',
            Snare: '000020000000',
            HiHat: '212121212121',
        },
        '5/4': {
            Kick: '20000000200000000000',
            Snare: '00000000000020000000',
            HiHat: '21212121212121212121',
        },
        '6/8': {
            // Rock 6/8
            Kick: '200000200000',
            Snare: '000000200000',
            HiHat: '212121212121',
        },
        '7/8': {
            Kick: '20000000200000',
            Snare: '00002000000000',
            HiHat: '21212121212121',
        },
        '7/4': {
            Kick: '2000000020000000200000000000',
            Snare: '0000200000002000000020000000',
            HiHat: '2121212121212121212121212121',
        },
        '12/8': {
            // Slow Rock 12/8
            Kick: '200000000000200000000000',
            Snare: '000000200000000000200000',
            HiHat: '212121212121212121212121',
        },
    },
    House: {
        category: 'Electronic',
        swing: 0,
        sub: '16th',
        Kick: '2000200020002000',
        Snare: '0000200000002000',
        HiHat: '0020002000200020',
        Open: '0010001000100010',
        '3/4': {
            // 3-on-the-floor
            Kick: '200020002000',
            Snare: '000020000000',
            HiHat: '002000200020',
            Open: '001000100010',
        },
        '5/4': {
            // 5-on-the-floor
            Kick: '20002000200020002000',
            Snare: '00002000000020000000',
            HiHat: '00200020002000200020',
            Open: '00100010001000100010',
        },
        '6/8': {
            // House in 6/8?? "6-step"
            Kick: '200020002000', // K on 1, 3, 5
            Snare: '000000002000', // S on 5
            HiHat: '002000200020',
            Open: '001000100010',
        },
        '7/8': {
            // 7-on-the-floor (intense)
            Kick: '20002000200020',
            Snare: '00000000200000',
            HiHat: '00200020002000',
        },
        '7/4': {
            // 7-on-the-floor
            Kick: '2000200020002000200020002000',
            Snare: '0000200000002000000020000000',
            HiHat: '0020002000200020002000200020',
            Open: '0010001000100010001000100010',
        },
        '12/8': {
            // 4-on-the-floor shuffle
            Kick: '200000200000200000200000',
            Snare: '000000200000000000200000',
            HiHat: '000200000200000200000200',
        },
    },
    'House (2-Bar)': {
        category: 'Electronic',
        swing: 0,
        sub: '16th',
        measures: 2,
        Kick: '20002000200020002000200020002000',
        Snare: '00002000000020000000200000002010',
        HiHat: '20202020202020202020202020202020',
        Open: '00000000000000000000000000000000',
        '3/4': {
            Kick: '200020002000200020002000',
            Snare: '000020000000000020000010',
            HiHat: '202020202020202020202020',
        },
        '7/4': {
            measures: 1,
            Kick: '2000200020002000200020002000',
            Snare: '0000200000002000000020000000',
            HiHat: '2020202020202020202020202020',
            Open: '0000000000000000000000000000',
        },
    },
    'Hip Hop': {
        category: 'Soul/R&B',
        swing: 25,
        sub: '16th',
        Kick: '2000000002100000',
        Snare: '0000200000002000',
        HiHat: '2111211121112111',
        Open: '0000000000000000',
        '3/4': {
            Kick: '200000100000',
            Snare: '000000002000',
            HiHat: '211121112111',
        },
        '5/4': {
            // Dilla-esque
            Kick: '20000000000002100000',
            Snare: '00000000000020000000',
            HiHat: '21112111211121112111',
        },
        '7/4': {
            Kick: '2000000000000000021000000000',
            Snare: '0000000020000000000000002000',
            HiHat: '2111211121112111211121112111',
            Open: '0000000000000000000000000000',
        },
    },
    Funk: {
        category: 'Soul/Funk',
        swing: 15,
        sub: '16th',
        measures: 2,
        variations: [
            {
                name: 'Standard',
                Kick: '20010020010000102001002001001020',
                Snare: '00002000000020000000200001012000',
                HiHat: '21212121212121212121212121212121',
            },
            {
                name: 'Linear',
                Kick: '20000020000000102000002000001020',
                Snare: '00002000010120000000200001012000',
                HiHat: '20202020202020202020202020202020',
            },
            {
                name: 'Heavy',
                Kick: '20010020010010102001002001001020',
                Snare: '00002000000020000000200000002000',
                HiHat: '21212121212121212121212121212121',
            },
        ],
        Kick: '20010020010000102001002001001020',
        Snare: '00002000000020000000200001012000',
        HiHat: '21212121212121212121212121212121',
        Open: '00000000000000000000000000000000',
        '3/4': {
            Kick: '200100200010200100201020',
            Snare: '000020002000000020002000',
            HiHat: '212121212121212121212121',
        },
        '6/8': {
            Kick: '200100200000200100201000',
            Snare: '000000200000000000200000',
            HiHat: '212121212121212121212121',
        },
        '7/4': {
            measures: 1,
            Kick: '2001002001000010200000000000',
            Snare: '0000200000002000000020000000',
            HiHat: '2121212121212121212121212121',
            Open: '0000000000000000000000000000',
        },
    },
    'Neo-Soul': {
        category: 'Soul/R&B',
        swing: 45,
        sub: '16th',
        measures: 2,
        variations: [
            {
                name: 'Standard',
                Kick: '20000001002000002000010000200010',
                Snare: '00002000000020000000200000002000',
                HiHat: '11111111111111111111111111111111',
            },
            {
                name: 'Lazy',
                Kick: '20000000002000002000000000200000',
                Snare: '00002000000020000000200000002000',
                HiHat: '10101010101010101010101010101010',
            },
            {
                name: 'Complex',
                Kick: '20000001002000002000010000200010',
                Snare: '00002000000020000000200000002000',
                HiHat: '11111111111111111111111111111111',
                Open: '00000000000000200000000000000020',
            },
        ],
        Kick: '20000001002000002000010000200010',
        Snare: '00002000000020000000200000002000',
        HiHat: '11111111111111111111111111111111',
        Open: '00000000000000200000000000000020',
        '3/4': {
            Kick: '200000010020200001000010',
            Snare: '000020000000000020000000',
            HiHat: '111111111111111111111111',
        },
        '7/4': {
            measures: 1,
            Kick: '2000000100200000200000000000',
            Snare: '0000200000002000000020000000',
            HiHat: '1111111111111111111111111111',
            Open: '0000000000000020000000000000',
        },
    },
    Trap: {
        category: 'Soul/R&B',
        swing: 0,
        sub: '16th',
        Kick: '2000000000200100',
        Snare: '0000000020000000',
        HiHat: '2112112121121121',
        Open: '0000000000000000',
        '3/4': { Snare: '000000002000' },
        '6/8': { Snare: '000000200000' },
        '7/4': {
            measures: 1,
            Kick: '2000000000200100200000000000',
            Snare: '0000000020000000000020000000',
            HiHat: '2112112121121121211211212112',
        },
    },
    'Blues Shuffle': {
        category: 'Blues',
        swing: 100,
        sub: '8th',
        Kick: '2000000020000010',
        Snare: '0000200000002000',
        HiHat: '2010201020102010',
        Open: '1000000000001000',
        '12/8': {
            // Native home of the shuffle
            measures: 1,
            Kick: '200000000000200000001000',
            Snare: '000000200000000000200000',
            HiHat: '201010201010201010201010',
        },
        '6/8': {
            measures: 1,
            Kick: '200000200000',
            Snare: '000000200000',
            HiHat: '201010201010',
        },
        '7/4': {
            measures: 1,
            Kick: '2000000020000000200000000000',
            Snare: '0000200000002000000020000000',
            HiHat: '2010201020102010201020102010',
        },
    },
    Reggae: {
        category: 'World/Latin',
        swing: 20,
        sub: '16th',
        Kick: '0000000020000000',
        Snare: '0000000020000000',
        HiHat: '2010201020102010',
        Open: '0000002000000020',
        '3/4': {
            measures: 1,
            Kick: '000000002000', // One drop on 3
            Snare: '000000002000',
            HiHat: '201020102010',
        },
        '7/4': {
            measures: 1,
            Kick: '0000000020000000000000002000',
            Snare: '0000000020000000000000002000',
            HiHat: '2010201020102010201020102010',
        },
    },
    Acoustic: {
        category: 'Pop/Rock',
        swing: 15,
        sub: '8th',
        Kick: '2000000010000000',
        Snare: '0000200000002000',
        HiHat: '1010101010101010',
        Open: '0000000000000000',
        '3/4': {
            Kick: '200000000000',
            Snare: '000020002000',
            HiHat: '101010101010',
        },
        '5/4': {
            Kick: '20000000000000000000',
            Snare: '00000000000020000000',
            HiHat: '10101010101010101010',
        },
        '6/8': {
            Kick: '200000000000',
            Snare: '000000200000',
            HiHat: '101010101010',
        },
        '7/4': {
            Kick: '2000000000000000200000000000',
            Snare: '000000200000000000200000',
            HiHat: '1010101010101010101010101010',
        },
        '12/8': {
            Kick: '200000000000200000000000',
            Snare: '000000200000000000200000',
            HiHat: '101010101010101010101010',
        },
    },
    Ska: {
        category: 'Pop/Rock',
        swing: 0,
        sub: '8th',
        Kick: '2000000020000000',
        Snare: '0000200000002000',
        HiHat: '1010101010101010',
        Open: '0000000000000000',
    },
    'Country (Two-Step)': {
        category: 'Country/Folk',
        swing: 55,
        sub: '8th',
        Kick: '2000000020000000',
        Snare: '0000200000002000', // Simple backbeat
        HiHat: '1010101010101010', // Closed 8ths
        Open: '0000000000000000',
        '3/4': {
            // Country Waltz
            Kick: '200000000000',
            Snare: '000020002000',
            HiHat: '101010101010',
        },
        '6/8': {
            Kick: '200000200000',
            Snare: '000000200000',
            HiHat: '101010101010',
        },
    },
    'Metal (Speed)': {
        category: 'Rock/Metal',
        swing: 0,
        sub: '16th',
        Kick: '2222222222222222', // Double bass 16ths
        Snare: '0000200000002000', // Hard backbeat
        HiHat: '1010101010101010',
        Open: '2000200020002000',
        '3/4': {
            Kick: '222222222222',
            Snare: '000020000000',
        },
        '6/8': {
            // Gallop
            Kick: '211211211211',
            Snare: '000000200000',
        },
        '7/4': {
            measures: 1,
            Kick: '2222222222222222222222222222',
            Snare: '0000200000002000000020000000',
        },
    },
    DnB: {
        category: 'Electronic',
        swing: 0,
        sub: '16th',
        Kick: '2000000000200100',
        Snare: '0000200000002000',
        HiHat: '2121212121212121',
        Open: '0000000000000000',
        '3/4': { Snare: '000020000000' },
        '7/4': {
            measures: 1,
            Kick: '2000000000200100200000000000',
            Snare: '0000200000002000000020000000',
            HiHat: '2121212121212121212121212121',
        },
    },
    Disco: {
        category: 'Soul/Funk',
        swing: 0,
        sub: '16th',
        Kick: '2000200020002000',
        Snare: '0000200000002000',
        HiHat: '1010101010101010',
        Open: '0020002000200020',
        '3/4': {
            measures: 1,
            Kick: '200020002000',
            Snare: '000020000000',
            HiHat: '101010101010',
            Open: '002000200020',
        },
        '5/4': {
            measures: 1,
            Kick: '20002000200020002000',
            Snare: '00002000000020000000',
            Open: '00200020002000200020',
        },
        '6/8': {
            // Disco in 6/8 (Compound)
            measures: 1,
            Kick: '200020002000',
            Snare: '000000200000',
            Open: '002000200020',
        },
        '7/8': {
            measures: 1,
            Kick: '20002000200020',
            Snare: '00002000000000',
            Open: '00200020002000',
        },
        '7/4': {
            measures: 1,
            Kick: '2000200020002000200020002000',
            Snare: '0000200000002000000020000000',
            Open: '0020002000200020002000200020',
        },
        '12/8': {
            measures: 1,
            Kick: '200000200000200000200000',
            Snare: '000000200000000000200000',
            Open: '000200000200000200000200',
        },
    },
    Jazz: {
        category: 'Jazz',
        swing: 60,
        sub: '8th',
        measures: 2,
        variations: [
            {
                name: 'Standard',
                Kick: '10001000100010001000100010001000',
                Snare: '00000000000000000000000001001000',
                HiHat: '00002000000020000000200000002000',
                Open: '20001020200010202000102020101020',
            },
            {
                name: 'Minimal',
                Kick: '10001000100010001000100010001000',
                HiHat: '00002000000020000000200000002000',
                Open: '20001020200010202000102020001020',
            },
            {
                name: 'Active',
                Kick: '10001000100010001000100010001000',
                Snare: '00000000000006000000000001001000',
                HiHat: '00002000000020000000200000002000',
                Open: '20001020200010202000102020101020',
            },
        ],
        Kick: '10001000100010001000100010001000',
        Snare: '00000000000000000000000001001000',
        HiHat: '00002000000020000000200000002000',
        Open: '20001020200010202000102020101020',
        '3/4': {
            // Jazz Waltz
            measures: 1,
            Kick: '100000000000',
            Snare: '000000000000',
            HiHat: '000020002000',
            Open: '200010201020',
        },
        '5/4': {
            // Take Five
            measures: 1,
            Kick: '20000000000000000000',
            Snare: '00000000000000000000',
            HiHat: '00002000200020002000',
            Open: '20001020102010201020',
        },
        '6/8': {
            // Jazz Waltz / 6/8 Afro-Cuban feel
            measures: 1,
            Kick: '100000000000',
            Snare: '000000000000',
            HiHat: '000020000020',
            Open: '200010200010',
        },
        '7/8': {
            measures: 1,
            Kick: '10000000000000',
            Snare: '00000000000000',
            Open: '20001020102010',
        },
        '7/4': {
            measures: 1,
            Kick: '1000000000000000000000000000',
            Snare: '0000000000000000000000000000',
            HiHat: '0000200020002000200020002000',
            Open: '2000102010201020102010201020',
        },
        '12/8': {
            // Afro-Blue feel
            measures: 1,
            Kick: '100000000000000000000000',
            Open: '200010201020102000102010',
        },
    },
    'Bossa Nova': {
        category: 'World/Latin',
        swing: 0,
        sub: '16th',
        measures: 2,
        Kick: '20000020200000202000002020000020',
        Snare: '20000020000020000000200000200000',
        HiHat: '11111111111111111111111111111111',
        Conga: '00000000000000000000000100000000',
        '3/4': {
            // Bossa Waltz (adapted)
            Kick: '200000202000200000202000',
            Snare: '200200200020200200200020',
        },
        '5/4': {
            measures: 1,
            Kick: '20000020200000202000',
            Snare: '20020020002002002002',
        },
        '6/8': {
            // Samba 6/8
            measures: 1,
            Kick: '200000200000',
            Snare: '200200200200',
        },
        '7/8': {
            measures: 1,
            Kick: '20000020200000',
            Snare: '20020020002000',
        },
        '7/4': {
            measures: 1,
            Kick: '2000002020000020200000202000',
            Snare: '2002002000200200200200200020',
        },
        '12/8': {
            measures: 1,
            Kick: '200000200000200000200000',
            Snare: '200200200200200200200200',
        },
    },
    Samba: {
        category: 'World/Latin',
        swing: 0,
        sub: '16th',
        measures: 2,
        Kick: '20022020200220202002202020022020',
        Snare: '00002000000020000000200000002000',
        HiHat: '21212121212121212121212121212121',
        Perc: '20202010101020202020201010102020',
        Shaker: '11111111111111111111111111111111',
    },
    'Afro-Cuban 6/8': {
        category: 'World/Latin',
        swing: 0,
        sub: '8th',
        measures: 1,
        Kick: '200000200000',
        Perc: '202010202010',
        Conga: '002002002102',
        Bongo: '100100100100',
    },
    Afrobeat: {
        category: 'World/Latin',
        swing: 10,
        sub: '16th',
        measures: 2,
        Kick: '20000000200000102000000020100100',
        Snare: '00002000002020000000200000202000',
        HiHat: '22022022022022022202202202202212',
        Open: '00000000000000000020000000000000',
        '3/4': {
            Kick: '200000002000200000002000',
            Snare: '000020000020000020000020',
            HiHat: '220220220220220220220220',
        },
        '5/4': {
            measures: 1,
            Kick: '20000000200000002000',
            Snare: '00002000002020000020',
            HiHat: '22022022022022022022',
        },
        '6/8': {
            measures: 1,
            Kick: '200000200000',
            Snare: '000020002020',
            HiHat: '220220220220',
        },
        '7/8': {
            measures: 1,
            Kick: '20000020000000',
            Snare: '00002000202000',
        },
        '7/4': {
            measures: 1,
            Kick: '2000000020000010200000002010',
            Snare: '0000200000202000000020000020',
            HiHat: '2202202202202202220220220220',
        },
        '12/8': {
            measures: 1,
            Kick: '200000200000200000200000',
            Snare: '000020002020000020002020',
        },
    },
    'Latin/Salsa': {
        category: 'World/Latin',
        swing: 0,
        sub: '16th',
        measures: 2,
        Kick: '20000000200000002000000020000000',
        Clave: '20020020000202002002002000020200',
        HiHat: '21212121212121212121212121212121',
        Conga: '00000000000021200000000000002120',
        Perc: '20002000200020002000200020002000',
        Guiro: '00001000000010000000100000001000',
        '3/4': {
            Clave: '200200200002',
        },
        '12/8': {
            measures: 1,
            Kick: '200000000000200000000000',
            Perc: '202010202010',
        },
    },
};

export const SMART_GENRES = {
    Rock: {
        swing: 0,
        sub: '8th',
        drum: 'Basic Rock',
        feel: 'Rock',
        chord: 'smart',
        bass: 'rock',
        soloist: 'shred',
        harmony: 'smart',
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
        sub: '16th',
        drum: 'Funk',
        feel: 'Funk',
        chord: 'funk',
        bass: 'funk',
        soloist: 'funk',
        harmony: 'horns',
    },
    Disco: {
        swing: 0,
        sub: '16th',
        drum: 'Disco',
        feel: 'Disco',
        chord: 'smart',
        bass: 'disco',
        soloist: 'disco',
        harmony: 'smart',
    },
    'Hip Hop': {
        swing: 25,
        sub: '16th',
        drum: 'Hip Hop',
        feel: 'Hip Hop',
        chord: 'smart',
        bass: 'neo',
        soloist: 'neo',
        harmony: 'smart',
    },
    Blues: {
        swing: 100,
        sub: '8th',
        drum: 'Blues Shuffle',
        feel: 'Blues',
        chord: 'jazz',
        bass: 'quarter',
        soloist: 'blues',
        harmony: 'horns',
    },
    'Neo-Soul': {
        swing: 30,
        sub: '16th',
        drum: 'Neo-Soul',
        feel: 'Neo-Soul',
        chord: 'smart',
        bass: 'neo',
        soloist: 'neo',
        harmony: 'strings',
    },
    Reggae: {
        swing: 20,
        sub: '16th',
        drum: 'Reggae',
        feel: 'Reggae',
        chord: 'smart',
        bass: 'dub',
        soloist: 'minimal',
        harmony: 'smart',
    },
    Acoustic: {
        swing: 15,
        sub: '8th',
        drum: 'Acoustic',
        feel: 'Acoustic',
        chord: 'pad',
        bass: 'half',
        soloist: 'minimal',
        harmony: 'strings',
    },
    Bossa: {
        swing: 0,
        sub: '16th',
        drum: 'Bossa Nova',
        feel: 'Bossa Nova',
        chord: 'jazz',
        bass: 'bossa',
        soloist: 'bossa',
        harmony: 'strings',
    },
    Country: {
        swing: 55,
        sub: '16th',
        drum: 'Country (Two-Step)',
        feel: 'Country',
        chord: 'strum-country',
        bass: 'country',
        soloist: 'country',
        harmony: 'smart',
    },
    Metal: {
        swing: 0,
        sub: '16th',
        drum: 'Metal (Speed)',
        feel: 'Metal',
        chord: 'power-metal',
        bass: 'metal',
        soloist: 'metal',
        harmony: 'smart',
    },
    'Ska-Punk': {
        swing: 0,
        sub: '8th',
        drum: 'Ska',
        feel: 'Ska',
        chord: 'ska-upstroke',
        bass: 'walking-ska',
        soloist: 'ska-horns',
        harmony: 'horns',
    },
};

export const CHORD_STYLES = [
    { id: 'smart', name: 'Smart (Rhythmic)', category: 'Modern' },
    { id: 'pad', name: 'Pad (Sustain)', category: 'Modern' },
    { id: 'strum8', name: 'Strum (8th)', category: 'Pop/Rock' },
    { id: 'strum-country', name: 'Country Strum', category: 'Country/Folk' },
    { id: 'power-metal', name: 'Power Metal', category: 'Rock/Metal' },
    { id: 'jazz', name: 'Jazz Comp', category: 'Jazz' },
    { id: 'funk', name: 'Funk Scratch', category: 'Soul/Funk' },
    { id: 'ska-upstroke', name: 'Ska Upstroke', category: 'Pop/Rock' },
];

export const BASS_STYLES = [
    { id: 'smart', name: 'Smart (Auto)', category: 'Experimental' },
    { id: 'whole', name: 'Whole', category: 'Basic' },
    { id: 'half', name: 'Half', category: 'Basic' },
    { id: 'arp', name: 'Arp (1-3-5-3)', category: 'Basic' },
    { id: 'rock', name: 'Rock (8th)', category: 'Pop/Rock' },
    { id: 'country', name: 'Country (1-5)', category: 'Country/Folk' },
    { id: 'metal', name: 'Metal (Gallop)', category: 'Rock/Metal' },
    { id: 'quarter', name: 'Walking', category: 'Jazz' },
    { id: 'funk', name: 'Funk', category: 'Soul/Funk' },
    { id: 'rocco', name: 'Rocco (16ths)', category: 'Soul/Funk' },
    { id: 'disco', name: 'Disco (Octaves)', category: 'Soul/Funk' },
    { id: 'dub', name: 'Dub (Reggae)', category: 'World/Latin' },
    { id: 'neo', name: 'Neo-Soul', category: 'Soul/R&B' },
    { id: 'bossa', name: 'Bossa Nova', category: 'World/Latin' },
    { id: 'walking-ska', name: 'Walking (Ska)', category: 'Pop/Rock' },
];

export const SOLOIST_STYLES = [
    { id: 'lead_sheet', name: 'Lead Sheet', category: 'Special' },
    { id: 'smart', name: 'Smart (Auto)', category: 'Experimental' },
    { id: 'scalar', name: 'Scalar', category: 'Basic' },
    { id: 'country', name: 'Country', category: 'Country/Folk' },
    { id: 'shred', name: 'Shreddy', category: 'Rock/Metal' },
    { id: 'metal', name: 'Metal', category: 'Rock/Metal' },
    { id: 'blues', name: 'Blues', category: 'Blues' },
    { id: 'neo', name: 'Neo-Soul', category: 'Soul/R&B' },
    { id: 'minimal', name: 'Minimal', category: 'Basic' },
    { id: 'bird', name: 'Bird', category: 'Jazz' },
    { id: 'disco', name: 'Disco', category: 'Soul/Funk' },
    { id: 'ska-horns', name: 'Ska Horns', category: 'Modern' },
];

export const HARMONY_STYLES = [
    { id: 'smart', name: 'Smart (Auto)', category: 'Experimental' },
    { id: 'horns', name: 'Horns (Stabs)', category: 'Modern' },
    { id: 'strings', name: 'Strings (Pads)', category: 'Classical/Trad' },
    { id: 'organ', name: 'Organ (B3)', category: 'Soul/Funk' },
    { id: 'plucks', name: 'Modern Synth (Plucks)', category: 'Electronic' },
    { id: 'counter', name: 'Contrapuntal', category: 'Jazz' },
];

export const CHORD_PRESETS = [
    {
        name: 'Pop (Standard)',
        sections: [{ label: 'Main', value: 'I | V | vi | IV' }],
        category: 'Pop/Rock',
        isMinor: false,
        settings: { bpm: 120, style: 'pop' },
    },
    {
        name: 'Pop (Ballad)',
        sections: [{ label: 'Main', value: 'vi | IV | I | V' }],
        category: 'Pop/Rock',
        isMinor: false,
        settings: { bpm: 85, style: 'pad' },
    },
    {
        name: 'Country Standard',
        sections: [{ label: 'Main', value: 'I | I | IV | IV | I | V | I | I' }],
        category: 'Country/Folk',
        isMinor: false,
        settings: { bpm: 100, style: 'strum-country' },
    },
    {
        name: 'Metal Core',
        sections: [{ label: 'Main', value: 'im | bVI | bVII | im' }],
        category: 'Rock/Metal',
        isMinor: true,
        settings: { bpm: 160, style: 'power-metal' },
    },
    {
        name: '50s Rock',
        sections: [{ label: 'Main', value: 'I | vi | IV | V' }],
        category: 'Pop/Rock',
        isMinor: false,
        settings: { bpm: 140, style: 'rock', timeSignature: '4/4' },
    },
    {
        name: 'Royal Road',
        sections: [{ label: 'Main', value: 'IVmaj7 | V7 | iii7 | vi7' }],
        category: 'Pop/Rock',
        isMinor: false,
        settings: { bpm: 110, style: 'pop' },
    },
    {
        name: 'Canon',
        sections: [{ label: 'Main', value: 'I | V | vi | iii | IV | I | IV | V' }],
        category: 'Classical/Trad',
        isMinor: false,
        settings: { bpm: 90, style: 'arpeggio' },
    },
    {
        name: 'Andalusian',
        sections: [{ label: 'Main', value: 'i | bVII | bVI | V' }],
        category: 'Classical/Trad',
        isMinor: true,
        settings: { bpm: 130, style: 'skank' },
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
        settings: { bpm: 100, style: 'blues' },
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
        settings: { bpm: 90, style: 'blues' },
    },
    {
        name: '8-Bar Blues',
        sections: [{ label: 'Main', value: 'I7 | V7 | IV7 | IV7 | I7 | V7 | I7 | V7' }],
        category: 'Blues',
        isMinor: false,
        settings: { bpm: 110, style: 'blues' },
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
        settings: { bpm: 140, style: 'jazz' },
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
        settings: { bpm: 220, style: 'jazz' },
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
            { label: 'B', value: 'bVImaj7 | bVImaj7 | iim7b5 | V7b9 | im7 | im7 | iim7 | V7' },
            {
                label: 'A',
                value: 'Imaj7 | Imaj7 | im7 | IV7 | bviim7 | bIII7 | bVImaj7 V7 | Imaj7',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: { bpm: 160, style: 'jazz' },
    },
    {
        name: 'Donna Lee',
        sections: [
            { label: 'A', value: 'Imaj7 | VI7 | II7 | II7 | iim7 | V7 | Imaj7 | iim7 V7' },
            { label: 'B (G)', value: 'Imaj7 | VI7 | II7 | II7 | #im7 #IV7 | VIImaj7 | iim7 | V7' },
            { label: 'A', value: 'Imaj7 | VI7 | II7 | II7 | iim7 | V7 | III7 | vi7' },
            { label: 'C', value: 'IVmaj7 | #IVdim7 | Imaj7/V | VI7 | II7 | V7 | Imaj7 | iim7 V7' },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: { bpm: 220, style: 'jazz' },
    },
    {
        name: 'Rhythm Changes',
        sections: [
            { label: 'A', value: 'I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I' },
            { label: 'A', value: 'I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I' },
            { label: 'B', value: 'III7 | III7 | VI7 | VI7 | II7 | II7 | V7 | V7' },
            { label: 'A', value: 'I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I' },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: { bpm: 180, style: 'jazz' },
    },
    {
        name: 'Autumn Leaves',
        sections: [
            { label: 'A', value: 'ii7 | V7 | Imaj7 | IVmaj7 | viiø7 | III7+ | vi7 | vi7' },
            { label: 'A', value: 'ii7 | V7 | Imaj7 | IVmaj7 | viiø7 | III7+ | vi7 | vi7' },
            { label: 'B', value: 'viiø7 | III7+ | vi7 | vi7 | ii7 | V7 | Imaj7 | IVmaj7' },
            { label: 'C', value: 'viiø7 | III7+ | vi7 | vi7 | viiø7 | III7+ | vi7 | vi7' },
        ],
        category: 'Jazz',
        isMinor: false, // Often treated as relative minor of Bb, but starts major-ish. Let's keep false or set true? Relative minor G minor. But usually called Bb Major.
        settings: { bpm: 140, style: 'jazz' },
    },
    {
        name: 'Stella by Starlight',
        sections: [
            { label: 'A', value: '#ivm7b5 | VII7alt | iim7 | V7 | vm7 | I7 | IVmaj7 | bVII7' },
            {
                label: 'B',
                value: 'Imaj7 | #ivm7b5 VII7 | iiim7b5 | VI7alt | iim7b5 | V7alt | Imaj7 | vm7 I7',
            },
            {
                label: 'C',
                value: 'IVmaj7 | bVII7#11 | Imaj7 | #ivm7b5 VII7alt | iiim7b5 | VI7alt | iim7b5 | V7alt',
            },
            {
                label: 'D',
                value: 'Imaj7 | #ivm7b5 VII7alt | iiim7b5 | VI7alt | iim7b5 | V7alt | Imaj7 | iim7 V7',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: { bpm: 120, style: 'jazz' },
    },
    {
        name: 'All The Things You Are',
        sections: [
            { label: 'A (Tonic)', value: 'vi7 | ii7 | V7 | Imaj7 | IVmaj7' },
            { label: 'A (III)', value: '#ivm7 | VII7 | IIImaj7', seamless: true },
            { label: 'A2 (V)', value: 'iiim7 | vi7 | II7 | Vmaj7 | Imaj7' },
            { label: 'A2 (VII)', value: 'biim7 | #IV7 | VIImaj7', seamless: true },
            { label: 'B (VII)', value: 'biim7 | #IV7 | VIImaj7 | VIImaj7' },
            { label: 'B (#IV)', value: 'vm7b5 | I7 | IVmaj7 | II7+', seamless: true },
            {
                label: 'A3 (Tonic)',
                value: 'vi7 | ii7 | V7 | Imaj7 | IVmaj7 | ivm7 | iiim7 | bIIIdim7 | iim7 | V7+ | Imaj7 | Imaj7',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: { bpm: 135, style: 'jazz' },
    },
    {
        name: 'Neo-Soul (Deep)',
        sections: [
            { label: 'Verse', value: 'IVmaj9 | III7#9 | vi11 | V9sus4', repeat: 2 },
            { label: 'Chorus', value: 'ii9 | bIImaj7 | Imaj9 | vi9', repeat: 2 },
        ],
        category: 'Soul/R&B',
        isMinor: false,
        settings: { bpm: 85, style: 'neo' },
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
        settings: { bpm: 115, style: 'funk' },
    },
    {
        name: 'Funk (i-IV)',
        sections: [{ label: 'Main', value: 'i7 | IV7 | i7 | IV7' }],
        category: 'Soul/R&B',
        isMinor: true,
        settings: { bpm: 110, style: 'funk' },
    },
    {
        name: 'Funk (Grand Groove)',
        sections: [
            { label: 'Verse', value: 'im11 | im11 | IV9 | IV13', repeat: 2 },
            { label: 'Chorus', value: 'bVII13 | bVImaj7 | v11 | I7#9', repeat: 2 },
        ],
        category: 'Soul/R&B',
        isMinor: true,
        settings: { bpm: 108, style: 'funk' },
    },
    {
        name: 'Circle of 4ths',
        sections: [{ label: 'Main', value: 'I7 | IV7 | bVII7 | bIII7 | bVI7 | bII7 | V7 | I7' }],
        category: 'Theory',
        isMinor: false,
    },
    {
        name: 'Plagal Flow',
        sections: [{ label: 'Main', value: 'I | IV | I | IV' }],
        category: 'Theory',
        isMinor: false,
    },
    {
        name: 'Cherokee',
        sections: [
            {
                label: 'A',
                value: 'Imaj7 | vm7 I7 | IVmaj7 | ivm7 bVII7 | Imaj7 II7 | iim7 V7 | Imaj7 | iim7 V7',
            },
            {
                label: 'A',
                value: 'Imaj7 | vm7 I7 | IVmaj7 | ivm7 bVII7 | Imaj7 II7 | iim7 V7 | Imaj7 | Imaj7',
            },
            { label: 'B (bII)', value: 'biim7 | bVI7 | bIImaj7 | bIImaj7' },
            { label: 'B (VII)', value: 'viim7 | III7 | VIImaj7 | VIImaj7', seamless: true },
            { label: 'B (bVI)', value: 'bviim7 | bIII7 | bVImaj7 | bVImaj7', seamless: true },
            { label: 'B (I)', value: 'vim7 II7 | iim7 V7', seamless: true },
            {
                label: 'A',
                value: 'Imaj7 | vm7 I7 | IVmaj7 | ivm7 bVII7 | Imaj7 II7 | iim7 V7 | Imaj7 | Imaj7',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: { bpm: 240, style: 'jazz' },
    },
    {
        name: 'Blue Bossa',
        sections: [
            { label: 'Main', value: 'im7 | im7 | ivm7 | ivm7 | iim7b5 | V7alt | im7 | im7' },
            { label: 'Modulation', value: 'biim7 | bVI7 | bIImaj7 | bIImaj7' },
            { label: 'Turnaround', value: 'iim7b5 | V7alt | im7 | iim7b5 V7alt' },
        ],
        category: 'Jazz',
        isMinor: true,
        settings: { bpm: 140, style: 'bossa' },
    },
    {
        name: 'Night and Day',
        sections: [
            { label: 'Verse (A)', value: 'iim7 | V7 | Imaj7 | Imaj7', repeat: 2 },
            {
                label: 'Verse (B)',
                value: '#ivm7 | ivm7 | iiim7 | bIIIdim7 | iim7 | V7 | Imaj7 | Imaj7',
            },
            {
                label: 'Verse (B2)',
                value: '#ivm7 | ivm7 | iiim7 | bIIIdim7 | iim7 | V7 | Imaj7 | bVII7',
            },
            { label: 'Bridge', value: 'bIIImaj7 | bIIImaj7 | Imaj7 | Imaj7', repeat: 2 },
            {
                label: 'Outro',
                value: '#ivm7 | ivm7 | iiim7 | bIIIdim7 | iim7 | V7 | Imaj7 | Imaj7',
            },
        ],
        category: 'Jazz',
        isMinor: false,
        settings: { bpm: 130, style: 'jazz' },
    },
    {
        name: 'Alternative Loop',
        sections: [{ label: 'Loop', value: 'I | I | III | III | IV | IV | iv | iv' }],
        category: 'Pop/Rock',
        settings: { bpm: 120, style: 'smart' },
    },
]; // Post-process DRUM_PRESETS to expand string patterns into arrays
for (const p of Object.values(DRUM_PRESETS)) {
    const expand = (obj) => {
        for (const [key, val] of Object.entries(obj)) {
            if (typeof val === 'string' && /^[0-2]+$/.test(val)) {
                obj[key] = Array.from(val, Number);
            } else if (key === 'variations' && Array.isArray(val)) {
                val.forEach((v) => expand(v));
            } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                expand(val);
            }
        }
    };
    expand(p);
}
