import {
    BASS_STYLES,
    CHORD_STYLES,
    HARMONY_STYLES,
    SOLOIST_STYLES,
    type StyleEntry,
} from '../data/instrument-styles.js';
import { SHORTCUT_CONFIG } from '../data/shortcut-config.js';
import { SMART_GENRES } from '../data/smart-genres.js';

export function generateGenreTable(): string {
    let html = '<div class="table-container"><table class="notation-table">\n';
    html +=
        '<thead><tr><th>Genre</th><th>Drum Beat</th><th>Bass Style</th><th>Soloist Style</th><th>Harmony</th></tr></thead>\n';
    html += '<tbody>\n';

    for (const [name, config] of Object.entries(SMART_GENRES) as [string, any][]) {
        html += `<tr><td><strong>${name}</strong></td><td>${config.drum}</td><td>${config.bass}</td><td>${config.soloist}</td><td>${config.harmony}</td></tr>\n`;
    }

    html += '</tbody></table></div>\n';
    return html;
}

function generateStyleMD(stylesArray: StyleEntry[]): string {
    const grouped = stylesArray.reduce<Record<string, string[]>>((acc, style) => {
        if (!acc[style.category]) {
            acc[style.category] = [];
        }
        acc[style.category].push(style.name);
        return acc;
    }, {});

    let md = '';
    for (const [cat, styles] of Object.entries(grouped)) {
        md += `- **${cat}:** ${styles.join(', ')}\n`;
    }
    return md;
}

export function generateBassStylesMD(): string {
    return generateStyleMD(BASS_STYLES);
}
export function generateChordStylesMD(): string {
    return generateStyleMD(CHORD_STYLES);
}
export function generateSoloistStylesMD(): string {
    return generateStyleMD(SOLOIST_STYLES);
}
export function generateHarmonyStylesMD(): string {
    return generateStyleMD(HARMONY_STYLES);
}

export function generateShortcutTable(): string {
    let html = '<div class="table-container"><table class="notation-table">\n';
    html += '<thead><tr><th>Key</th><th>Action</th><th>Description</th></tr></thead>\n';
    html += '<tbody>\n';

    for (const s of SHORTCUT_CONFIG) {
        html += `<tr><td><code>${s.key}</code></td><td><strong>${s.action}</strong></td><td>${s.description}</td></tr>\n`;
    }

    html += '</tbody></table></div>\n';
    return html;
}

export function injectManualMetadata(template: string): string {
    return template
        .replace('{{GENRE_TABLE}}', generateGenreTable())
        .replace('{{BASS_STYLES}}', generateBassStylesMD())
        .replace('{{CHORD_STYLES}}', generateChordStylesMD())
        .replace('{{SOLOIST_STYLES}}', generateSoloistStylesMD())
        .replace('{{HARMONY_STYLES}}', generateHarmonyStylesMD())
        .replace('{{SHORTCUT_TABLE}}', generateShortcutTable());
}
