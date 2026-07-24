import { KEY_ORDER, TIME_SIGNATURES } from '../config.js';
import { GENRE_NAMES } from '../data/smart-genres.js';
import { generateId } from '../state/share-codec.js';

// Canonical chord pools by base style. The wizard's Feel selector maps each
// genre to one of these pools and then layers a quality tilt on top.
const PROGRESSIONS: Record<string, Record<string, string[][]>> = {
    pop: {
        Intro: [
            ['I', 'IV', 'I', 'IV'],
            ['vi', 'IV', 'I', 'V'],
            ['I', 'V', 'vi', 'IV'],
            ['I', 'vi', 'IV', 'V'],
        ],
        Verse: [
            ['I', 'V', 'vi', 'IV'],
            ['vi', 'IV', 'I', 'V'],
            ['I', 'vi', 'IV', 'V'],
            ['I', 'IV', 'I', 'V'],
            ['ii', 'V', 'I', 'vi'],
            ['vi', 'iii', 'IV', 'I'],
        ],
        Pre: [
            ['IV', 'V', 'IV', 'V'],
            ['ii', 'V', 'ii', 'V'],
            ['vi', 'V', 'IV', 'V'],
        ],
        Chorus: [
            ['I', 'V', 'vi', 'IV'],
            ['IV', 'I', 'V', 'vi'],
            ['I', 'IV', 'ii', 'V'],
            ['I', 'bVII', 'IV', 'I'],
            ['vi', 'IV', 'I', 'V'],
        ],
        Bridge: [
            ['vi', 'IV', 'I', 'V'],
            ['vi', 'iii', 'IV', 'V'],
            ['ii', 'V', 'iii', 'vi'],
            ['IV', 'V', 'vi', 'iii'],
            ['bVI', 'bVII', 'I', 'I'],
        ],
        Outro: [
            ['I', 'IV', 'I', 'IV'],
            ['vi', 'IV', 'I', 'I'],
            ['ii', 'V', 'I', 'I'],
        ],
        Main: [
            ['I', 'V', 'vi', 'IV'],
            ['vi', 'IV', 'I', 'V'],
        ],
    },
    pop_minor: {
        Intro: [
            ['i', 'iv', 'i', 'iv'],
            ['i', 'bVI', 'bIII', 'bVII'],
        ],
        Verse: [
            ['i', 'bVII', 'bVI', 'bVII'],
            ['i', 'iv', 'v', 'i'],
            ['i', 'bVI', 'bIII', 'bVII'],
            ['i', 'iv', 'bVI', 'V'],
        ],
        Pre: [
            ['iv', 'V', 'iv', 'V'],
            ['bVI', 'bVII', 'bVI', 'bVII'],
        ],
        Chorus: [
            ['i', 'bVI', 'bIII', 'bVII'],
            ['bVI', 'bVII', 'i', 'i'],
            ['iv', 'bVII', 'bIII', 'bVI'],
            ['i', 'iv', 'v', 'iv'],
        ],
        Bridge: [
            ['iv', 'v', 'i', 'i'],
            ['bVI', 'bVII', 'bIII', 'bIII'],
            ['iv', 'i', 'iv', 'V'],
        ],
        Outro: [
            ['i', 'iv', 'i', 'i'],
            ['i', 'bVI', 'i', 'i'],
        ],
        Main: [
            ['i', 'bVII', 'bVI', 'bVII'],
            ['i', 'iv', 'v', 'i'],
        ],
    },
    ballad: {
        Intro: [
            ['I', 'iii', 'IV', 'V'],
            ['vi', 'IV', 'I', 'V'],
        ],
        Verse: [
            ['I', 'iii', 'IV', 'V'],
            ['I', 'vi', 'ii', 'V'],
            ['I', 'V', 'vi', 'iii'],
        ],
        Pre: [
            ['ii', 'V', 'iii', 'vi'],
            ['IV', 'V', 'iii', 'vi'],
        ],
        Chorus: [
            ['IV', 'V', 'I', 'vi'],
            ['I', 'vi', 'IV', 'V'],
            ['vi', 'IV', 'I', 'V'],
        ],
        Bridge: [
            ['vi', 'V', 'IV', 'V'],
            ['iii', 'vi', 'ii', 'V'],
        ],
        Outro: [['I', 'IV', 'I', 'IV']],
        Main: [['I', 'iii', 'IV', 'V']],
    },
    blues: {
        Intro: [['I', 'IV', 'I', 'V']],
        Verse: [['I', 'IV', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V']],
        Solo: [['I', 'IV', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V']],
        Outro: [['I', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V']],
        Main: [['I', 'IV', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V']],
    },
    // Minor-key 12-bar: i / iv / V (dominant for the cadence) with a bVI-V
    // turnaround. The V stays uppercase so the BLUES_TILT promotes it to V7.
    blues_minor: {
        Intro: [['i', 'iv', 'i', 'V']],
        Verse: [['i', 'iv', 'i', 'i', 'iv', 'iv', 'i', 'i', 'bVI', 'V', 'i', 'V']],
        Solo: [['i', 'iv', 'i', 'i', 'iv', 'iv', 'i', 'i', 'bVI', 'V', 'i', 'V']],
        Outro: [['i', 'iv', 'i', 'i', 'V', 'iv', 'i', 'V']],
        Main: [['i', 'iv', 'i', 'i', 'iv', 'iv', 'i', 'i', 'bVI', 'V', 'i', 'V']],
    },
    jazz: {
        A1: [
            ['I', 'vi', 'ii', 'V'],
            ['I', 'IV', 'ii', 'V'],
            ['I', 'bIIIdim', 'ii', 'V'],
        ],
        A2: [
            ['I', 'vi', 'ii', 'V'],
            ['I', 'IV', 'ii', 'V'],
        ],
        B: [
            ['iii', 'VI', 'ii', 'V'],
            ['IV', 'iv', 'I', 'I'],
            ['II', 'II', 'ii', 'V'],
        ],
        A3: [
            ['I', 'vi', 'ii', 'V'],
            ['I', 'IV', 'ii', 'V'],
        ],
        A4: [
            ['I', 'vi', 'ii', 'V'],
            ['I', 'IV', 'ii', 'V'],
        ],
        Intro: [['I', 'vi', 'ii', 'V']],
        Outro: [['ii', 'V', 'I', 'I']],
        Main: [['I', 'vi', 'ii', 'V']],
    },
    // Minor-key jazz: i / iv with the back-cycle ii-V landing on i. Note the
    // dominant V (major third) is preserved so the cadence lands; bridges
    // borrow from parallel major.
    jazz_minor: {
        A1: [
            ['i', 'iv', 'V', 'i'],
            ['i', 'ii', 'V', 'i'],
            ['i', 'bVI', 'ii', 'V'],
        ],
        A2: [
            ['i', 'iv', 'V', 'i'],
            ['i', 'ii', 'V', 'i'],
        ],
        B: [
            ['iv', 'bVII', 'bIII', 'bVI'],
            ['ii', 'V', 'i', 'i'],
            ['bVI', 'V', 'i', 'V'],
        ],
        A3: [
            ['i', 'iv', 'V', 'i'],
            ['i', 'ii', 'V', 'i'],
        ],
        A4: [
            ['i', 'iv', 'V', 'i'],
            ['i', 'ii', 'V', 'i'],
        ],
        Intro: [['i', 'ii', 'V', 'i']],
        Outro: [['ii', 'V', 'i', 'i']],
        Main: [['i', 'iv', 'V', 'i']],
    },
};

// Map each canonical Feel (from GENRE_NAMES in smart-genres.ts) to its base
// PROGRESSIONS pool. Genres without a mapping fall through to 'pop'.
const FEEL_BASE_POOL: Record<string, string> = {
    Rock: 'pop',
    Jazz: 'jazz',
    Funk: 'pop',
    Disco: 'pop',
    'Hip Hop': 'pop',
    Blues: 'blues',
    'Neo-Soul': 'jazz',
    Reggae: 'pop',
    Acoustic: 'ballad',
    Bossa: 'jazz',
    Country: 'pop',
    Metal: 'pop',
    'Ska-Punk': 'pop',
};

// Only transform bare Roman numerals; pre-qualified chords (Imaj7, V7#9, etc.)
// are left alone so authored pool entries pass through unchanged.
const BARE_ROMAN = /^([#b])?(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)$/;

// Quality-overlay tables per feel family. Bare Roman numerals not listed here
// pass through unchanged. Each row is the idiomatic 7th-or-9th-flavor that
// genre tends to use on that scale degree.
//
// Lowercase 'v' is intentionally absent: minor-key cadences need a *dominant*
// V7 (major third / leading tone) to resolve to i, not a minor v7. Authors
// who want a minor v should write `v` and let it pass through; upper-case `V`
// produces the dominant overlay.
const JAZZ_TILT: Record<string, string> = {
    I: 'Imaj7',
    IV: 'IVmaj7',
    V: 'V7',
    ii: 'ii7',
    vi: 'vi7',
    iii: 'iii7',
    i: 'im7',
    iv: 'iv7',
};
const FUNK_TILT: Record<string, string> = {
    I: 'I7',
    IV: 'IV7',
    V: 'V7',
    ii: 'ii7',
    vi: 'vi7',
    iii: 'iii7',
};
const BLUES_TILT: Record<string, string> = {
    I: 'I7',
    IV: 'IV7',
    V: 'V7',
};

function tiltForFeel(feel: string): Record<string, string> | null {
    if (feel === 'Jazz' || feel === 'Neo-Soul' || feel === 'Bossa') {
        return JAZZ_TILT;
    }
    if (feel === 'Funk' || feel === 'Disco' || feel === 'Hip Hop') {
        return FUNK_TILT;
    }
    if (feel === 'Blues') {
        return BLUES_TILT;
    }
    // Rock, Pop, Country, Acoustic, Reggae, Metal, Ska-Punk: keep triads.
    return null;
}

function applyFeelTilt(chord: string, feel: string): string {
    if (!BARE_ROMAN.test(chord)) {
        return chord;
    }
    const tilt = tiltForFeel(feel);
    if (!tilt) {
        return chord;
    }
    return tilt[chord] ?? chord;
}

function rand<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function formatProgression(chordArray: string[], bars: number, feel: string): string {
    const sourceLen = chordArray.length;
    if (sourceLen >= bars) {
        return chordArray
            .slice(0, bars)
            .map((c) => applyFeelTilt(c, feel))
            .join(' | ');
    }
    const result: string[] = [];
    for (let i = 0; i < bars; i++) {
        result.push(applyFeelTilt(chordArray[i % sourceLen], feel));
    }
    return result.join(' | ');
}

// How many bars a single section spans in this feel. Blues honours the 12-bar
// form; jazz uses 8-bar A-sections; everything else defaults to 8 (4 for
// Intro/Outro).
function sectionBars(feel: string, label: string): number {
    if (feel === 'Blues') {
        if (label === 'Intro' || label === 'Outro') {
            return 4;
        }
        return 12;
    }
    if (feel === 'Jazz' || feel === 'Bossa' || feel === 'Neo-Soul') {
        return 8;
    }
    if (label === 'Intro' || label === 'Outro') {
        return 4;
    }
    return 8;
}

// Form templates by feel family. The wizard picks the one whose total bar
// count is closest to the target derived from BPM × duration.
const VERSE_CHORUS_FORMS: string[][] = [
    ['Verse', 'Chorus'],
    ['Verse', 'Chorus', 'Verse', 'Chorus'],
    ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Outro'],
    ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus'],
    ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'Outro'],
    ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'Chorus', 'Outro'],
    [
        'Intro',
        'Verse',
        'Pre',
        'Chorus',
        'Verse',
        'Pre',
        'Chorus',
        'Bridge',
        'Chorus',
        'Chorus',
        'Outro',
    ],
];

const AABA_FORMS: string[][] = [
    ['A1', 'A2', 'B', 'A3'],
    ['Intro', 'A1', 'A2', 'B', 'A3', 'Outro'],
    ['A1', 'A2', 'B', 'A3', 'A4', 'B', 'A3'],
    ['Intro', 'A1', 'A2', 'B', 'A3', 'A4', 'B', 'A3', 'Outro'],
];

const BLUES_FORMS: string[][] = [
    ['Verse'],
    ['Verse', 'Verse'],
    ['Verse', 'Verse', 'Solo', 'Verse'],
    ['Intro', 'Verse', 'Verse', 'Solo', 'Verse', 'Verse', 'Outro'],
];

function formCandidates(form: 'verse-chorus' | 'loop', feel: string): string[][] {
    if (form === 'loop') {
        return [['Main']];
    }
    if (feel === 'Jazz' || feel === 'Bossa' || feel === 'Neo-Soul') {
        return AABA_FORMS;
    }
    if (feel === 'Blues') {
        return BLUES_FORMS;
    }
    return VERSE_CHORUS_FORMS;
}

function pickStructure(form: 'verse-chorus' | 'loop', feel: string, targetBars: number): string[] {
    const candidates = formCandidates(form, feel);
    let bestIdx = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < candidates.length; i++) {
        const total = candidates[i].reduce((sum, label) => sum + sectionBars(feel, label), 0);
        const delta = Math.abs(total - targetBars);
        if (delta < bestDelta) {
            bestDelta = delta;
            bestIdx = i;
        }
    }
    return candidates[bestIdx];
}

export type GenerateSongRole = 'verse' | 'chorus' | 'bridge' | 'pre' | 'unknown';

export interface GenerateSongSeed {
    chords: string[];
    role?: GenerateSongRole;
}

export interface GenerateSongOptions {
    key?: string;
    isMinor?: boolean;
    timeSignature?: string;
    bpm?: number;
    seed?: GenerateSongSeed;
    feel?: string;
    form?: 'verse-chorus' | 'loop';
    targetMinutes?: number;
}

export interface GeneratedSection {
    id: string;
    label: string;
    value: string;
    key: string;
    timeSignature: string;
    repeat: number;
}

function roleToLabel(role: GenerateSongRole, structure: string[]): string {
    if (role === 'chorus') {
        return 'Chorus';
    }
    if (role === 'bridge') {
        return 'Bridge';
    }
    if (role === 'pre') {
        return 'Pre';
    }
    if (role === 'verse') {
        return 'Verse';
    }
    // 'unknown' — slot the seed into whatever the most prominent section is.
    if (structure.includes('Verse')) {
        return 'Verse';
    }
    if (structure.includes('A1')) {
        return 'A1';
    }
    return structure[0] ?? 'Verse';
}

function memoryKey(label: string): string {
    if (label.startsWith('A')) {
        return 'A';
    }
    return label;
}

function computeTargetBars(targetMinutes: number, bpm: number, timeSig: string): number {
    const ts = TIME_SIGNATURES[timeSig as keyof typeof TIME_SIGNATURES];
    const beatsPerBar = ts ? ts.beats : 4;
    return Math.max(2, Math.round((targetMinutes * bpm) / beatsPerBar));
}

/**
 * Predicts the structure that generateSong() would pick for a given target
 * duration, BPM, time signature, form, and feel. Used by the wizard to
 * preview "Form: V-C-V-C-B-C" live as the length slider moves.
 */
export function predictStructure(
    targetMinutes: number,
    bpm: number,
    timeSig: string,
    form: 'verse-chorus' | 'loop',
    feel: string,
): string[] {
    const bars = computeTargetBars(targetMinutes, bpm, timeSig);
    return pickStructure(form, feel, bars);
}

/**
 * Generates a song structure and chord progressions from wizard options.
 *
 * Resolution order:
 *  1. Resolve key + time signature (random → weighted pick).
 *  2. Resolve feel (random → uniform pick from GENRE_NAMES).
 *  3. Compute target bars from BPM × targetMinutes ÷ beatsPerBar.
 *  4. Pick a structure template whose total bars is closest to target.
 *  5. Pre-populate memory with the seed (if any) under its role label.
 *  6. Fill remaining sections from the feel's pool, applying quality tilts.
 */
export function generateSong(options: GenerateSongOptions = {}): GeneratedSection[] {
    const key =
        !options.key || options.key === 'Random'
            ? rand(KEY_ORDER as unknown as string[])
            : options.key;
    const isMinor = !!options.isMinor;

    let timeSig = options.timeSignature;
    if (!timeSig || timeSig === 'Random') {
        const roll = Math.random();
        timeSig = roll < 0.7 ? '4/4' : roll < 0.9 ? '3/4' : '6/8';
    }

    const bpm = options.bpm && options.bpm > 0 ? options.bpm : 100;
    const targetMinutes =
        options.targetMinutes && options.targetMinutes > 0 ? options.targetMinutes : 3;
    const targetBars = computeTargetBars(targetMinutes, bpm, timeSig);

    let feel = options.feel;
    if (!feel || feel === 'random' || !FEEL_BASE_POOL[feel]) {
        feel = rand(GENRE_NAMES);
    }

    const form: 'verse-chorus' | 'loop' = options.form === 'loop' ? 'loop' : 'verse-chorus';

    let poolKey = FEEL_BASE_POOL[feel] ?? 'pop';
    if (isMinor && PROGRESSIONS[`${poolKey}_minor`]) {
        poolKey = `${poolKey}_minor`;
    }
    const pool = PROGRESSIONS[poolKey] ?? PROGRESSIONS.pop;

    const structureTemplate = pickStructure(form, feel, targetBars);

    const memory: Record<string, string> = {};
    if (options.seed?.chords && options.seed.chords.length > 0) {
        const seedLabel = roleToLabel(options.seed.role ?? 'unknown', structureTemplate);
        const seedBars = sectionBars(feel, seedLabel);
        memory[memoryKey(seedLabel)] = formatProgression(options.seed.chords, seedBars, feel);
    }

    const sections: GeneratedSection[] = [];
    structureTemplate.forEach((label) => {
        const bars = sectionBars(feel, label);
        const mKey = memoryKey(label);

        let progressionStr: string;
        if (memory[mKey]) {
            progressionStr = memory[mKey];
        } else {
            const candidates =
                pool[label] ?? pool.Verse ?? pool.A1 ?? pool.Main ?? Object.values(pool)[0];
            const pattern = rand(candidates);
            progressionStr = formatProgression(pattern, bars, feel);
            memory[mKey] = progressionStr;
        }

        sections.push({
            id: generateId(),
            label,
            value: progressionStr,
            key,
            timeSignature: timeSig as string,
            repeat: 1,
        });
    });

    return sections;
}
