import { describe, expect, it } from 'vitest';
import { validateEditorText } from './editor';

const accepts = (text: string) => expect(() => validateEditorText('A', text)).not.toThrow();
const rejects = (text: string) =>
    expect(() => validateEditorText('A', text)).toThrow(/unsupported chord spelling/);

describe('validateEditorText', () => {
    it('accepts a plain triad over a bass note', () => {
        for (const chord of ['C/E', 'D/F#', 'G/B', 'Bb/D', 'F#/A#']) {
            accepts(chord);
        }
        accepts('| C/E | G | Am/C | G7/B |');
    });

    it('still accepts a quality over a bass, and a slash inside the quality', () => {
        for (const chord of ['Am/C', 'G7/B', 'Cmaj7/E', 'C6/9', 'Cm6/9']) {
            accepts(chord);
        }
    });

    it('rejects unfinished and over-long slash text', () => {
        for (const chord of ['C/9', 'C/', 'Cmaj7/', 'C/E/G', 'C/Egarbage']) {
            rejects(chord);
        }
    });

    it('rejects a spelling the parser only partly understands', () => {
        rejects('Cm7#11');
        rejects('Cm7add11');
    });
});
