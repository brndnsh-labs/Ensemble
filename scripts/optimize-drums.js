import fs from 'node:fs';
import { DRUM_PRESETS } from '../public/data/drum-presets.js';

const S16 = '0000000000000000';
const S12 = '000000000000';
const S20 = '00000000000000000000';
const S14 = '00000000000000';
const S28 = '0000000000000000000000000000';
const S24 = '000000000000000000000000';

const BASE_PRESET = {
    swing: 0,
    sub: '8th',
    Kick: S16,
    Snare: S16,
    HiHat: S16,
    Open: S16,
    '3/4': { Kick: S12, Snare: S12, HiHat: S12, Open: S12 },
    '5/4': { Kick: S20, Snare: S20, HiHat: S20, Open: S20 },
    '6/8': { Kick: S12, Snare: S12, HiHat: S12, Open: S12 },
    '7/8': { Kick: S14, Snare: S14, HiHat: S14, Open: S14 },
    '7/4': { Kick: S28, Snare: S28, HiHat: S28, Open: S28 },
    '12/8': { Kick: S24, Snare: S24, HiHat: S24, Open: S24 },
};

function getDiff(obj, base) {
    const diff = {};
    let _hasDiff = false;
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'object' && !Array.isArray(v) && v !== null && base[k]) {
            const nestedDiff = getDiff(v, base[k]);
            if (Object.keys(nestedDiff).length > 0) {
                diff[k] = nestedDiff;
                _hasDiff = true;
            }
        } else if (JSON.stringify(v) !== JSON.stringify(base[k])) {
            diff[k] = v;
            _hasDiff = true;
        }
    }
    return diff;
}

const optimized = {};
for (const [name, preset] of Object.entries(DRUM_PRESETS)) {
    optimized[name] = getDiff(preset, BASE_PRESET);
}

const content = `const S16 = '0000000000000000';
const S12 = '000000000000';
const S20 = '00000000000000000000';
const S14 = '00000000000000';
const S28 = '0000000000000000000000000000';
const S24 = '000000000000000000000000';

const BASE_PRESET = {
    swing: 0,
    sub: '8th',
    Kick: S16, Snare: S16, HiHat: S16, Open: S16,
    '3/4': { Kick: S12, Snare: S12, HiHat: S12, Open: S12 },
    '5/4': { Kick: S20, Snare: S20, HiHat: S20, Open: S20 },
    '6/8': { Kick: S12, Snare: S12, HiHat: S12, Open: S12 },
    '7/8': { Kick: S14, Snare: S14, HiHat: S14, Open: S14 },
    '7/4': { Kick: S28, Snare: S28, HiHat: S28, Open: S28 },
    '12/8': { Kick: S24, Snare: S24, HiHat: S24, Open: S24 },
};

const PRESET_OVERRIDES = ${JSON.stringify(optimized, null, 4)};

function deepMerge(target, source) {
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

export const DRUM_PRESETS = Object.keys(PRESET_OVERRIDES).reduce((acc, key) => {
    // We must clone BASE_PRESET to avoid mutation
    const base = JSON.parse(JSON.stringify(BASE_PRESET));
    acc[key] = deepMerge(base, PRESET_OVERRIDES[key]);
    return acc;
}, {});
`;

fs.writeFileSync('public/data/drum-presets.js', content);
console.log('Optimized drum-presets.js successfully!');
