import { KEY_ORDER } from './config.js';
import { generateId } from './utils.js';

const STRUCTURES = {
    pop: ['Intro', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'Outro'],
    ballad: ['Intro', 'Verse', 'Verse', 'Chorus', 'Verse', 'Chorus', 'Bridge', 'Chorus', 'Outro'],
    blues: ['Intro', 'Verse', 'Verse', 'Solo', 'Verse', 'Outro'],
    simple: ['Verse', 'Chorus', 'Verse', 'Chorus'],
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
            ['I', 'vi', 'IV', 'V'], // Doo-wop
            ['I', 'IV', 'I', 'V'],
            ['ii', 'V', 'I', 'vi'],
            ['vi', 'iii', 'IV', 'I'],
        ],
        Chorus: [
            ['I', 'V', 'vi', 'IV'], // Axis of Awesome
            ['IV', 'I', 'V', 'vi'],
            ['I', 'IV', 'ii', 'V'],
            ['I', 'bVII', 'IV', 'I'], // Mixolydian / Rock
            ['vi', 'IV', 'I', 'V'],
        ],
        Bridge: [
            ['vi', 'IV', 'I', 'V'],
            ['vi', 'iii', 'IV', 'V'],
            ['ii', 'V', 'iii', 'vi'],
            ['IV', 'V', 'vi', 'iii'],
            ['bVI', 'bVII', 'I', 'I'], // Mario Cadence ish
        ],
        Outro: [
            ['I', 'IV', 'I', 'IV'],
            ['vi', 'IV', 'I', 'I'],
            ['ii', 'V', 'I', 'I'],
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
        Verse: [['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7']], // 12-bar
        Chorus: [['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7']],
        Solo: [['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7']],
        Outro: [['I7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7#9']],
    },
};

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

function formatProgression(chordArray, bars) {
    // If the pattern is shorter than the desired bars, loop it
    // If it's longer, trim it (though we design them to fit generally)

    // Most pools are 4-chord loops (1 chord per bar implies 4 bars).
    // If we want 8 bars, we repeat.

    // Check if the source is 12-bar blues (length 12)
    if (chordArray.length === 12) {
        return chordArray.join(' | ');
    }

    const result = [];
    const sourceLen = chordArray.length;

    for (let i = 0; i < bars; i++) {
        result.push(chordArray[i % sourceLen]);
    }

    return result.join(' | ');
}

export function generateSong(options = {}) {
    const key = options.key === 'Random' ? rand(KEY_ORDER) : options.key || 'C';

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
        style = rand(['pop', 'pop', 'pop', 'ballad', 'simple']); // Bias towards pop
    }

    // Override style if blues is requested explicitly or if we feel like it
    if (options.structure === 'blues') {
        style = 'blues';
    }

    const structureTemplate = STRUCTURES[style] || STRUCTURES.pop;
    const pool = PROGRESSIONS[style] || PROGRESSIONS.pop;

    const sections = [];
    const memory = {}; // Remember what "Verse" sounds like

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

        let progressionStr;

        if (memory[label]) {
            progressionStr = memory[label];
        } else {
            // Generate new
            const candidates = pool[label] || pool.Verse; // Fallback
            const pattern = rand(candidates);
            progressionStr = formatProgression(pattern, bars);
            memory[label] = progressionStr;
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
