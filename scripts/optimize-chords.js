import fs from 'node:fs';
import { CHORD_PRESETS } from '../public/data/chord-presets.js';

const DEFAULT_SETTINGS = { bpm: 120, style: 'pop' };

const optimized = CHORD_PRESETS.map((p) => {
    const newP = { ...p };
    if (newP.settings) {
        const diff = {};
        let hasDiff = false;
        for (const [k, v] of Object.entries(newP.settings)) {
            if (v !== DEFAULT_SETTINGS[k]) {
                diff[k] = v;
                hasDiff = true;
            }
        }
        if (!hasDiff) {
            delete newP.settings;
        } else {
            newP.settings = diff;
        }
    }
    return newP;
});

const content =
    `const DEFAULT_SETTINGS = ${JSON.stringify(DEFAULT_SETTINGS, null, 4)};\n\n` +
    `const PRESETS_RAW = ${JSON.stringify(optimized, null, 4)};\n\n` +
    `export const CHORD_PRESETS = PRESETS_RAW.map(p => ({\n` +
    `    ...p,\n` +
    `    settings: p.settings ? { ...DEFAULT_SETTINGS, ...p.settings } : { ...DEFAULT_SETTINGS }\n` +
    `}));\n`;

fs.writeFileSync('public/data/chord-presets.js', content);
console.log('Optimized chord-presets.js');
