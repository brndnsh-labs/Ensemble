import { describe, expect, it } from 'vitest';
import {
    generateBassStylesMD,
    generateChordStylesMD,
    generateGenreTable,
    generateHarmonyStylesMD,
    generateShortcutTable,
    generateSoloistStylesMD,
    injectManualMetadata,
} from '../../../public/data/manual-metadata.js';

describe('Manual Metadata Utilities', () => {
    it('generateGenreTable should return a valid HTML table', () => {
        const table = generateGenreTable();
        expect(table).toContain('<table class="notation-table">');
        expect(table).toContain('<thead><tr><th>Genre</th>');
        expect(table).toContain('Jazz');
    });

    it('generateBassStylesMD should return a Markdown list', () => {
        const md = generateBassStylesMD();
        expect(md).toContain('- **');
        expect(md).toContain('Walking');
    });

    it('generateChordStylesMD should return a Markdown list', () => {
        const md = generateChordStylesMD();
        expect(md).toContain('- **');
        expect(md).toContain('Jazz Comp');
    });

    it('generateSoloistStylesMD should return a Markdown list', () => {
        const md = generateSoloistStylesMD();
        expect(md).toContain('- **');
        expect(md).toContain('Bird');
    });

    it('generateHarmonyStylesMD should return a Markdown list', () => {
        const md = generateHarmonyStylesMD();
        expect(md).toContain('- **');
        expect(md).toContain('Pads');
    });

    it('generateShortcutTable should return a valid HTML table', () => {
        const table = generateShortcutTable();
        expect(table).toContain('<table class="notation-table">');
        expect(table).toContain('<thead><tr><th>Key</th>');
    });

    it('injectManualMetadata should replace all placeholders', () => {
        const template =
            '{{GENRE_TABLE}} {{BASS_STYLES}} {{CHORD_STYLES}} {{SOLOIST_STYLES}} {{HARMONY_STYLES}} {{SHORTCUT_TABLE}}';
        const result = injectManualMetadata(template);

        expect(result).not.toContain('{{GENRE_TABLE}}');
        expect(result).not.toContain('{{BASS_STYLES}}');
        expect(result).not.toContain('{{CHORD_STYLES}}');
        expect(result).not.toContain('{{SOLOIST_STYLES}}');
        expect(result).not.toContain('{{HARMONY_STYLES}}');
        expect(result).not.toContain('{{SHORTCUT_TABLE}}');

        expect(result).toContain('<table class="notation-table">');
        expect(result).toContain('- **');
    });
});
