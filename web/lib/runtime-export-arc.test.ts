/**
 * @vitest-environment happy-dom
 */
/**
 * An export renders what Play plays (#1784), and in song mode Play plays a jam (#1785): the
 * counted performance's energy breathes across its choruses (`BandSettings.arc`). So an export
 * taken with song mode on is rendered with the arc, whether the band is playing or stopped, and
 * one taken with song mode off is not.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('./band-export', () => ({
    downloadExportResult: vi.fn(),
    renderBandMixToWav: vi.fn(),
    renderBandStemsToWav: vi.fn(),
}));

async function arcExported(minutes: 3 | null): Promise<unknown> {
    vi.resetModules();
    // One at a time: two imports at once can each reach a mocked module mid-import and get
    // the real one (a Vitest race, #1699).
    const runtime = await import('./runtime');
    const { buildStandardDocument, STANDARDS } = await import('./standards');
    const { BandHost } = await import('./band-host');
    const render = vi.spyOn(BandHost.prototype, 'render');
    runtime.setSongMode(minutes);
    runtime.load(buildStandardDocument(STANDARDS[0]));
    await runtime.exportMidi('take');
    expect(render).toHaveBeenCalledTimes(1);
    return render.mock.calls[0][0].arc;
}

describe('the energy arc an export renders', () => {
    it('is the jam in song mode, stopped', async () => {
        expect(await arcExported(3)).toBe('jam');
    });

    it('is absent with song mode off', async () => {
        expect(await arcExported(null)).toBeNull();
    });
});
