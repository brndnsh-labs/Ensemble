/**
 * @vitest-environment happy-dom
 */
/**
 * A key written on a section or a bar keeps its spelling when the song transposes (#2068): an
 * `F#` section moves to `G#`, never to a flat twin.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('./band-export', () => ({
    downloadExportResult: vi.fn(),
    renderBandMixToWav: vi.fn(),
    renderBandStemsToWav: vi.fn(),
}));

describe('transposing a section or bar key (#2068)', () => {
    it('keeps sharp keys in sharps and flat keys in flats', async () => {
        vi.resetModules();
        const runtime = await import('./runtime');
        const { buildStandardDocument, STANDARDS } = await import('./standards');
        const document = buildStandardDocument(STANDARDS[0]);
        const score = document.chart.score;
        score.sections[0].key = 'F#';
        score.sections[0].measures[0].key = 'Bb';
        runtime.load(document, true);
        runtime.transpose(2);
        const moved = runtime.captureDocument(document).chart.score;
        expect(moved.sections[0].key).toBe('G#');
        expect(moved.sections[0].measures[0].key).toBe('C');
    });
});
