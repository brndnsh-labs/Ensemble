/**
 * @vitest-environment happy-dom
 */
/**
 * The master's per-style make-up gain (#2002) follows the chart that opens. `load` sets the
 * chart's genre with the runtime's dispatch subscriber off, so no genre effect runs; the rebuild
 * that ends every load restores the make-up (`restoreGains` → `syncMasterMakeup`). Without that,
 * a Jazz chart opened after a Rock one played 5.2 dB under its calibrated loudness.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./band-export', () => ({
    downloadExportResult: vi.fn(),
    renderBandMixToWav: vi.fn(),
    renderBandStemsToWav: vi.fn(),
}));

/** An AudioParam stand-in that records every automation call. */
function param() {
    return {
        value: 1,
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
    };
}

function bus() {
    return {
        gain: { gain: param(), connect: vi.fn(), disconnect: vi.fn() },
        reverb: { gain: param(), connect: vi.fn(), disconnect: vi.fn() },
        eq: { connect: vi.fn() },
        panner: null,
        sidechain: null,
    };
}

async function setup() {
    vi.resetModules();
    const runtime = await import('./runtime');
    const { buildStandardDocument, STANDARDS } = await import('./standards');
    const { getState } = await import('@core/state');
    const { MASTER_MAKEUP_DB } = await import('@core/config');
    const makeup = param();
    const playback = getState().playback as unknown as Record<string, unknown>;
    // A live graph as `initAudio` leaves it, reduced to what a rebuild touches.
    playback.audio = { currentTime: 0, state: 'running', resume: vi.fn(async () => {}) };
    playback.audioGraph = {
        master: { makeup: { gain: makeup }, volume: { gain: param() }, gain: { gain: param() } },
        chords: bus(),
        bass: bus(),
        soloist: bus(),
        drums: bus(),
    };
    const song = (genre: string) => {
        const document = structuredClone(buildStandardDocument(STANDARDS[0]));
        document.chart.band.groove.genre = genre;
        return document;
    };
    const lastMakeup = () => makeup.setTargetAtTime.mock.calls.at(-1)?.[0];
    return { runtime, song, lastMakeup, db: MASTER_MAKEUP_DB };
}

describe("the master make-up gain follows the open chart's style (#2002)", () => {
    it('a Jazz chart opened after a Rock one plays at the Jazz make-up', async () => {
        const { runtime, song, lastMakeup, db } = await setup();
        runtime.load(song('Rock'), true);
        expect(lastMakeup()).toBeCloseTo(10 ** (db.Rock / 20), 6);
        runtime.load(song('Jazz'), true);
        expect(lastMakeup()).toBeCloseTo(10 ** (db.Jazz / 20), 6);
        // The two differ, so the assertion above is not satisfied by the Rock value.
        expect(Math.abs(db.Jazz - db.Rock)).toBeGreaterThan(1);
    });
});
