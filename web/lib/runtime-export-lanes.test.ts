/**
 * @vitest-environment happy-dom
 */
/**
 * What each export renders when the musician's own lane is muted (#2072, DECISION 2026-11-04):
 * the .mid and the mix are the band as played, your part left out; the stems keep every lane. And
 * the packs fetched for Play skip that lane, since nobody hears it.
 */

import type { BandSettings } from '@band/index';
import { describe, expect, it, vi } from 'vitest';

const mix = vi.hoisted(() => vi.fn());
const stems = vi.hoisted(() => vi.fn());

vi.mock('./band-export', () => ({
    downloadExportResult: vi.fn(),
    renderBandMixToWav: mix,
    renderBandStemsToWav: stems,
    STEM_INSTRUMENTS: ['drums', 'bass', 'chords', 'soloist'],
}));

async function setup() {
    localStorage.clear();
    mix.mockReset();
    stems.mockReset();
    mix.mockResolvedValue({ blob: new Blob(), durationSeconds: 0, sampleRate: 0, filename: 'x' });
    stems.mockResolvedValue([]);
    vi.resetModules();
    const runtime = await import('./runtime');
    const { buildStandardDocument, STANDARDS } = await import('./standards');
    const { BandHost } = await import('./band-host');
    const render = vi.spyOn(BandHost.prototype, 'render');
    return { runtime, render, document: buildStandardDocument(STANDARDS[0]) };
}

const rendered = (render: { mock: { calls: unknown[][] } }): BandSettings =>
    render.mock.calls.at(-1)?.[0] as BandSettings;

describe('the lanes an export renders with your lane muted (#2072)', () => {
    it('leaves your part out of the .mid and the mix, and keeps it in every stem', async () => {
        const { runtime, render, document } = await setup();
        runtime.setPlayerLane('bass');
        runtime.load(document, true);

        await runtime.exportMidi('take');
        expect(rendered(render).you).toBe('bass');

        await runtime.exportAudio('mix', 'take', () => {});
        expect(rendered(render).you).toBe('bass');
        // The cymbal trim is told too: your lane is not a layer the mix has.
        expect(mix.mock.calls[0][3]).toMatchObject({ you: 'bass' });

        await runtime.exportAudio('stems', 'take', () => {});
        const stemPass = rendered(render);
        expect(stemPass.you).toBeNull();
        expect(stemPass.lanes).toEqual({ drums: true, bass: true, comp: true, lead: true });
        expect(stems.mock.calls[0][4]?.you ?? null).toBeNull();
    });

    it('is the whole band for a musician with no instrument chosen', async () => {
        const { runtime, render, document } = await setup();
        runtime.setPlayerLane(null);
        runtime.load(document, true);
        await runtime.exportAudio('mix', 'take', () => {});
        expect(rendered(render).you).toBeNull();
        expect(mix.mock.calls[0][3]).toMatchObject({ you: null });
    });
});

describe('the sounds fetched for Play skip your muted lane (#2072)', () => {
    it('warms and prepares nothing for a lane nobody hears, and does once it is on', async () => {
        const { runtime, document } = await setup();
        const sounds = await import('./sounds');
        const warm = vi.spyOn(sounds, 'warmSounds').mockImplementation(() => {});
        const prepare = vi.spyOn(sounds, 'prepareSounds').mockResolvedValue(undefined);
        runtime.setPlayerLane('bass');
        runtime.load(document, true);
        expect(document.chart.band.bass.enabled).toBe(true);
        expect(warm.mock.calls.at(-1)?.[0].band.bass.enabled).toBe(false);
        expect(warm.mock.calls.at(-1)?.[0].band.groove.enabled).toBe(true);
        // Turned on, it is heard, so its sounds are prepared like any lane's.
        runtime.setEnabled('bass', true);
        expect(prepare.mock.calls.at(-1)?.[0].band.bass.enabled).toBe(true);
        // …and the chart itself was never touched for it.
        expect(runtime.captureDocument(document).chart.band).toEqual(document.chart.band);
    });
});
