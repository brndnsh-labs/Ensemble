import fs from 'node:fs';
import { SMART_GENRES } from '../public/data/smart-genres.js';

// --- 1. Optimize SMART_GENRES ---
const GENRE_DEFAULTS = {
    swing: 0,
    sub: '16th',
    chord: 'smart',
    harmony: 'smart',
};

const optimizedGenres = {};
for (const [name, config] of Object.entries(SMART_GENRES)) {
    const diff = {};
    for (const [k, v] of Object.entries(config)) {
        if (v !== GENRE_DEFAULTS[k]) {
            diff[k] = v;
        }
    }
    optimizedGenres[name] = diff;
}

const genreContent =
    `const GENRE_DEFAULTS = ${JSON.stringify(GENRE_DEFAULTS, null, 4)};\n\n` +
    `const GENRE_OVERRIDES = ${JSON.stringify(optimizedGenres, null, 4)};\n\n` +
    `export const SMART_GENRES = Object.keys(GENRE_OVERRIDES).reduce((acc, key) => {\n` +
    `    acc[key] = { ...GENRE_DEFAULTS, ...GENRE_OVERRIDES[key] };\n` +
    `    return acc;\n` +
    `}, {});\n`;

fs.writeFileSync('public/data/smart-genres.js', genreContent);
console.log('Optimized smart-genres.js');

// --- 2. Optimize DRUM_PRESETS (Partial - just common strings) ---
const drumFile = 'public/data/drum-presets.js';
let drumContent = fs.readFileSync(drumFile, 'utf8');
// Replace the ubiquitous silent Open HH with a constant
const SILENT_HH = '0000000000000000';
drumContent =
    `const S = '${SILENT_HH}';\n` +
    drumContent.replaceAll(`'${SILENT_HH}'`, 'S').replaceAll(`"${SILENT_HH}"`, 'S');
fs.writeFileSync(drumFile, drumContent);
console.log('Optimized drum-presets.js (String compression)');
