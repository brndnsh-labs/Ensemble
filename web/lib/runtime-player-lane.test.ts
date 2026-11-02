/**
 * @vitest-environment happy-dom
 */
/**
 * "What do you play?" (#1992) in the runtime: the musician's own lane is muted on every chart that
 * opens, as a hole the band leaves for them (`BandSettings.you`), and that default is composed at
 * read time — the chart's own `enabled` is never written for it, so opening a chart never makes
 * it an edit. Read through what the band is handed (an export's settings, which are Play's).
 */

import type { BandSettings } from '@band/index';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./band-export', () => ({
    downloadExportResult: vi.fn(),
    renderBandMixToWav: vi.fn(),
    renderBandStemsToWav: vi.fn(),
}));

async function setup() {
    vi.resetModules();
    // One at a time: two imports at once can each reach a mocked module mid-import (#1699).
    const runtime = await import('./runtime');
    const { buildStandardDocument, STANDARDS } = await import('./standards');
    const { BandHost } = await import('./band-host');
    const render = vi.spyOn(BandHost.prototype, 'render');
    const settings = async (): Promise<BandSettings> => {
        render.mockClear();
        await runtime.exportMidi('take');
        return render.mock.calls[0][0];
    };
    return { runtime, settings, songs: STANDARDS.map((entry) => buildStandardDocument(entry)) };
}

describe('your own lane (#1992)', () => {
    it('is muted on open as a hole, and the chart still says it is on', async () => {
        const { runtime, settings, songs } = await setup();
        runtime.setPlayerLane('bass');
        runtime.load(songs[0], true);
        expect(runtime.laneHeard('bass')).toBe(false);
        const band = await settings();
        expect(band.lanes.bass).toBe(true);
        expect(band.you).toBe('bass');
        // Nothing about the chart changed: the default is not an edit.
        expect(runtime.captureDocument(songs[0]).chart.band).toEqual(songs[0].chart.band);
    });

    it('turned on, plays as any lane — without writing a chart that already has it on', async () => {
        const { runtime, settings, songs } = await setup();
        runtime.setPlayerLane('bass');
        runtime.load(songs[0], true);
        runtime.setEnabled('bass', true);
        expect(runtime.laneHeard('bass')).toBe(true);
        const band = await settings();
        expect(band.lanes.bass).toBe(true);
        expect(band.you).toBeNull();
        expect(runtime.captureDocument(songs[0]).chart.band).toEqual(songs[0].chart.band);
        // Muted again: the hole again, still no chart edit.
        runtime.setEnabled('bass', false);
        expect((await settings()).you).toBe('bass');
        expect(runtime.captureDocument(songs[0]).chart.band).toEqual(songs[0].chart.band);
    });

    it('turned on where the chart has it off, is a choice about the song', async () => {
        const { runtime, songs } = await setup();
        const off = structuredClone(songs[0]);
        off.chart.band.bass.enabled = false;
        runtime.setPlayerLane('bass');
        runtime.load(off, true);
        expect(runtime.laneHeard('bass')).toBe(false);
        runtime.setEnabled('bass', true);
        expect(runtime.laneHeard('bass')).toBe(true);
        expect(runtime.captureDocument(off).chart.band.bass.enabled).toBe(true);
        // Off again: the chart goes back to the off it had, not left saying on.
        runtime.setEnabled('bass', false);
        expect(runtime.laneHeard('bass')).toBe(false);
        expect(runtime.captureDocument(off).chart.band.bass.enabled).toBe(false);
    });

    it('opens muted on the next chart opened, and keeps the choice through every other load', async () => {
        const { runtime, songs } = await setup();
        runtime.setPlayerLane('bass');
        runtime.load(songs[0], true);
        runtime.setEnabled('bass', true);
        // An edit, an Undo or a Revert reloads the same chart…
        runtime.load(songs[0]);
        expect(runtime.laneHeard('bass')).toBe(true);
        // …and a Duplicate's or a Keep both's copy reloads it under a new id.
        runtime.load({ ...songs[0], id: 'copy' });
        expect(runtime.laneHeard('bass')).toBe(true);
        runtime.load(songs[1], true);
        expect(runtime.laneHeard('bass')).toBe(false);
    });

    it('leaves another muted lane meaning a band without that player', async () => {
        const { runtime, settings, songs } = await setup();
        runtime.setPlayerLane('bass');
        runtime.load(songs[0], true);
        runtime.setEnabled('groove', false);
        const band = await settings();
        expect(band.lanes.drums).toBe(false);
        expect(band.you).toBe('bass');
    });

    it('is nothing at all with no instrument chosen', async () => {
        const { runtime, settings, songs } = await setup();
        runtime.setPlayerLane(null);
        runtime.load(songs[0], true);
        expect(runtime.laneHeard('bass')).toBe(true);
        const band = await settings();
        expect(band.you).toBeNull();
        expect(band.lanes.bass).toBe(true);
    });

    it('is never traded with: a lead player has no band soloist to trade with', async () => {
        const { runtime, songs } = await setup();
        runtime.setPlayerLane('soloist');
        runtime.load(songs[0], true);
        runtime.setTrade('soloist', 4, 2);
        // Asking to trade with the soloist turns it on, as it does for anyone.
        expect(runtime.laneHeard('soloist')).toBe(true);
        expect(runtime.tradeBlocked()).toBeNull();
        runtime.setEnabled('soloist', false);
        expect(runtime.tradeBlocked()).toBe('soloist-off');
    });
});
