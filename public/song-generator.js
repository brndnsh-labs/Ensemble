import { KEY_ORDER } from './config.js';
import { generateId } from './utils.js';

const STRUCTURES = {
    pop: ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'Outro'],
    ballad: ['Intro', 'Verse', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'Outro'],
    blues: ['Intro', 'Verse', 'Verse', 'Solo', 'Verse', 'Outro'],
    jazz: ['A1', 'A2', 'B', 'A3'], // AABA
    simple: ['Verse', 'Chorus', 'Verse', 'Chorus'],
    loop: ['Main'],
};

// Weighted pools for different sections
const PROGRESSIONS = {
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
    },
    ballad: {
        Intro: [
            ['I', 'maj7', 'I', 'maj7'],
            ['vi', 'IV', 'I', 'V'],
        ],
        Verse: [
            ['I', 'iii', 'IV', 'V'],
            ['I', 'vi', 'ii', 'V'],
        ],
        Chorus: [
            ['IV', 'V', 'I', 'vi'],
            ['I', 'V/VII', 'vi', 'IV'],
        ],
        Bridge: [
            ['vi', 'V', 'IV', 'V'],
            ['iii', 'vi', 'ii', 'V'],
        ],
        Outro: [['I', 'IV', 'I', 'IV']],
    },
    blues: {
        Intro: [['I7', 'IV7', 'I7', 'V7']],
        Verse: [['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7']],
        Chorus: [['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7']],
        Solo: [['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7']],
        Outro: [['I7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7#9']],
    },
    jazz: {
        A1: [
            ['Imaj7', 'vi7', 'ii7', 'V7'],
            ['Imaj7', 'IV7', 'ii7', 'V7'],
            ['Imaj7', 'bIIIdim7', 'ii7', 'V7'],
        ],
        A2: [
            ['Imaj7', 'vi7', 'ii7', 'V7'],
            ['Imaj7', 'IV7', 'ii7', 'V7'],
        ],
        B: [
            ['iii7', 'VI7', 'ii7', 'V7'],
            ['IVmaj7', 'IVm7', 'Imaj7', 'I7'],
            ['II7', 'II7', 'ii7', 'V7'],
        ],
        A3: [
            ['Imaj7', 'vi7', 'ii7', 'V7'],
            ['Imaj7', 'IV7', 'ii7', 'V7'],
        ],
    },
};

/**
 * @template T
 * @param {Array<T>} arr
 * @returns {T}
 */
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Adds extensions to basic Roman Numeral chords based on complexity.
 * @param {string} chord
 * @param {number} complexity
 * @returns {string}
 */
function applyComplexity(chord, complexity) {
    if (complexity < 0.2) {
        return chord;
    }

    const newChord = chord;

    // Simple heuristic-based mapping
    if (complexity > 0.7) {
        if (chord === 'I') {
            return 'Imaj9';
        }
        if (chord === 'V') {
            return 'V13';
        }
        if (chord === 'ii') {
            return 'ii9';
        }
        if (chord === 'i') {
            return 'i9';
        }
        if (chord === 'IV') {
            return 'IVmaj9';
        }
    } else if (complexity > 0.4) {
        if (chord === 'I') {
            return 'Imaj7';
        }
        if (chord === 'V') {
            return 'V7';
        }
        if (chord === 'ii') {
            return 'ii7';
        }
        if (chord === 'vi') {
            return 'vi7';
        }
        if (chord === 'i') {
            return 'im7';
        }
        if (chord === 'IV') {
            return 'IVmaj7';
        }
    }

    return newChord;
}

/**
 * Formats a progression by looping/truncating chord array to desired bar length
 * and optionally adding complexity extensions.
 * @param {Array<string>} chordArray
 * @param {number} bars
 * @param {number} [complexity=0.3]
 * @returns {string}
 */
function formatProgression(chordArray, bars, complexity = 0.3) {
    if (chordArray.length === 12) {
        return chordArray.join(' | ');
    }

    const result = [];
    const sourceLen = chordArray.length;

    for (let i = 0; i < bars; i++) {
        let chord = chordArray[i % sourceLen];
        chord = applyComplexity(chord, complexity);
        result.push(chord);
    }

    return result.join(' | ');
}

/**
 * Generates a song structure and progressions based on options.
 * @param {any} [options={}]
 * @returns {Array<{id: string, label: string, value: string, key: string, timeSignature: string, repeat: number}>}
 */
export function generateSong(options = {}) {
    const key = options.key === 'Random' ? rand(KEY_ORDER) : options.key || 'C';
    const isMinor = !!options.isMinor;
    const complexity = options.complexity !== undefined ? options.complexity : 0.3;

    // Weighted time signature
    let timeSig = options.timeSignature;
    if (!timeSig || timeSig === 'Random') {
        const roll = Math.random();
        if (roll < 0.7) {
            timeSig = '4/4';
        } else if (roll < 0.9) {
            timeSig = '3/4';
        } else {
            timeSig = '6/8';
        }
    }

    let style = options.structure;
    if (!style || style === 'random') {
        style = rand(['pop', 'pop', 'ballad', 'simple']);
    }

    let poolKey = style;
    if (isMinor && /** @type {any} */ (PROGRESSIONS)[`${style}_minor`]) {
        poolKey = `${style}_minor`;
    }

    /** @type {Array<string>} */
    const structureTemplate = /** @type {any} */ (STRUCTURES)[style] || STRUCTURES.pop;
    /** @type {any} */
    const pool = /** @type {any} */ (PROGRESSIONS)[poolKey] || PROGRESSIONS.pop;

    /** @type {Array<{id: string, label: string, value: string, key: string, timeSignature: string, repeat: number}>} */
    const sections = [];
    /** @type {Record<string, string>} */
    const memory = {}; // Remember what "Verse" (or "A") sounds like

    // If a seed is provided, pre-populate memory for that section type
    if (options.seed?.type && options.seed.value) {
        memory[options.seed.type] = options.seed.value;
    }

    structureTemplate.forEach((label) => {
        // Determine bars
        let bars = 8; // Default
        if (label === 'Intro' || label === 'Outro') {
            bars = 4;
        }
        if (style === 'blues') {
            bars = 12;
        }
        if (style === 'jazz') {
            bars = 8;
        }
        if (style === 'loop') {
            bars = 4;
        }

        let progressionStr;

        // Simplified memory for Jazz AABA
        const memKey = label.startsWith('A') ? 'A' : label;

        if (memory[memKey]) {
            progressionStr = memory[memKey];
        } else {
            // Generate new
            const candidates = pool[label] || pool.Verse || pool.A1 || Object.values(pool)[0];
            const pattern = rand(candidates);
            progressionStr = formatProgression(pattern, bars, complexity);
            memory[memKey] = progressionStr;
        }

        sections.push({
            id: generateId(),
            label: label,
            value: progressionStr,
            key: key,
            timeSignature: timeSig,
            repeat: 1,
        });
    });

    return sections;
}
