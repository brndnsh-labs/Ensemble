/**
 * @vitest-environment happy-dom
 */
/**
 * A known standard's head is its guide-tone line (#2027): the band is asked for it
 * (`BandSettings.head`) on a chart off the jazz standards shelf, and on nothing else — not the
 * blues forms or grooves, not the musician's saved copy, which has its own id.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('./band-export', () => ({
    downloadExportResult: vi.fn(),
    renderBandMixToWav: vi.fn(),
    renderBandStemsToWav: vi.fn(),
}));

async function headFor(id: string, savedCopy = false): Promise<unknown> {
    vi.resetModules();
    // One at a time: two imports at once can each reach a mocked module mid-import and get
    // the real one (a Vitest race, #1699).
    const runtime = await import('./runtime');
    const { buildStandardDocument, standardFor } = await import('./standards');
    const { BandHost } = await import('./band-host');
    const render = vi.spyOn(BandHost.prototype, 'render');
    const document = buildStandardDocument(standardFor(id)!);
    runtime.load(savedCopy ? { ...document, id: 'song-mine' } : document);
    await runtime.exportMidi('take');
    expect(render).toHaveBeenCalledTimes(1);
    return render.mock.calls[0][0].head;
}

describe('the head a chart asks the band for', () => {
    it('is the guide-tone line on a jazz standard', async () => {
        expect(await headFor('standard-autumn-leaves')).toBe('guide-tones');
    });

    it('is the lead’s own on a blues form, a groove, or a saved copy of a standard', async () => {
        expect(await headFor('standard-12-bar-blues')).toBeNull();
        expect(await headFor('standard-pop-standard')).toBeNull();
        expect(await headFor('standard-autumn-leaves', true)).toBeNull();
    });
});
