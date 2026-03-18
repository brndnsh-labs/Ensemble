import {
    BASS_STYLES,
    CHORD_STYLES,
    HARMONY_STYLES,
    SOLOIST_STYLES,
} from '../data/instrument-styles.js';
import { SHORTCUT_CONFIG } from '../data/shortcut-config.js';
import { SMART_GENRES } from '../data/smart-genres.js';

/**
 * Generates an HTML table of all available Smart Genres.
 * @returns {string} HTML table
 */
export function generateGenreTable() {
    let html = '<div class="table-container"><table class="notation-table">\n';
    html +=
        '<thead><tr><th>Genre</th><th>Drum Beat</th><th>Bass Style</th><th>Soloist Style</th><th>Harmony</th></tr></thead>\n';
    html += '<tbody>\n';

    for (const [name, config] of Object.entries(SMART_GENRES)) {
        html += `<tr><td><strong>${name}</strong></td><td>${config.drum}</td><td>${config.bass}</td><td>${config.soloist}</td><td>${config.harmony}</td></tr>\n`;
    }

    html += '</tbody></table></div>\n';
    return html;
}

/**
 * Generates a Markdown list of instrument styles by category.
 * @param {Array<any>} stylesArray - e.g. BASS_STYLES
 * @returns {string} Markdown list
 */
function generateStyleMD(stylesArray) {
    // Group by category
    const grouped = stylesArray.reduce((acc, style) => {
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

export function generateBassStylesMD() {
    return generateStyleMD(BASS_STYLES);
}
export function generateChordStylesMD() {
    return generateStyleMD(CHORD_STYLES);
}
export function generateSoloistStylesMD() {
    return generateStyleMD(SOLOIST_STYLES);
}
export function generateHarmonyStylesMD() {
    return generateStyleMD(HARMONY_STYLES);
}

/**
 * Generates an HTML table for shortcuts.
 * @returns {string} HTML table
 */
export function generateShortcutTable() {
    let html = '<div class="table-container"><table class="notation-table">\n';
    html += '<thead><tr><th>Key</th><th>Action</th><th>Description</th></tr></thead>\n';
    html += '<tbody>\n';

    for (const s of SHORTCUT_CONFIG) {
        html += `<tr><td><code>${s.key}</code></td><td><strong>${s.action}</strong></td><td>${s.description}</td></tr>\n`;
    }

    html += '</tbody></table></div>\n';
    return html;
}

/**
 * Master injection function that replaces placeholders in a template string.
 * @param {string} template
 * @returns {string} Processed Markdown
 */
export function injectManualMetadata(template) {
    return template
        .replace('{{GENRE_TABLE}}', generateGenreTable())
        .replace('{{BASS_STYLES}}', generateBassStylesMD())
        .replace('{{CHORD_STYLES}}', generateChordStylesMD())
        .replace('{{SOLOIST_STYLES}}', generateSoloistStylesMD())
        .replace('{{HARMONY_STYLES}}', generateHarmonyStylesMD())
        .replace('{{SHORTCUT_TABLE}}', generateShortcutTable());
}
