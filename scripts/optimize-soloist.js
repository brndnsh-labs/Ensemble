import fs from 'node:fs';
import { STYLE_CONFIG } from '../public/engine/soloist-config.js';

const base = STYLE_CONFIG.scalar;
const compressed = { scalar: {} };
for (const [key, value] of Object.entries(STYLE_CONFIG)) {
    if (key === 'scalar') {
        continue;
    }
    const diff = {};
    for (const [k, v] of Object.entries(value)) {
        if (JSON.stringify(v) !== JSON.stringify(base[k])) {
            diff[k] = v;
        }
    }
    compressed[key] = diff;
}

const content = fs.readFileSync('public/engine/soloist-config.js', 'utf8');
const match = content.match(/export const STYLE_CONFIG = \{[\s\S]*?^};\n/m);

if (match) {
    let newCode = `const DEFAULT_STYLE_CONFIG = ${JSON.stringify(base, null, 4)};\n\n`;
    newCode += `const STYLE_OVERRIDES = ${JSON.stringify(compressed, null, 4)};\n\n`;
    newCode += `export const STYLE_CONFIG = /** @type {any} */ (\n    Object.keys(STYLE_OVERRIDES).reduce((acc, key) => {\n        acc[key] = { ...DEFAULT_STYLE_CONFIG, ...STYLE_OVERRIDES[key] };\n        return acc;\n    }, {})\n);\n`;
    const newContent = content.replace(match[0], newCode);
    fs.writeFileSync('public/engine/soloist-config.js', newContent);
    console.log('Optimized soloist-config.js successfully!');
} else {
    console.log('Regex failed to match STYLE_CONFIG block.');
}
