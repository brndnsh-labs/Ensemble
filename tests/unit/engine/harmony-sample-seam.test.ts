// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

// #785 — the sampled harmony voice's release tail must scale with the note's
// own duration, not sit at a fixed 0.3 s. The tail is appended AFTER the hold,
// so a constant 0.3 s is ~60-70% of a 1-beat note at 120-140 bpm and the
// strings smear into the next chord (Acoustic mud). These lock the scaling
// (mirroring the synth pad path) with the real sample side mocked.

const mocks = vi.hoisted(() => ({
    resolveInstrumentSource: vi.fn(),
    getPackZones: vi.fn(),
    pickZone: vi.fn(),
    foldToSampledCeiling: vi.fn((midi: number) => midi),
    playSampledNote: vi.fn(),
    gainForPack: vi.fn(() => 2),
    toneTiltForPack: vi.fn(() => 0),
}));

vi.mock('../../../public/engine/instrument-registry.js', () => ({
    resolveInstrumentSource: mocks.resolveInstrumentSource,
}));
vi.mock('../../../public/engine/pack-runtime.js', () => ({
    getPackZones: mocks.getPackZones,
}));
vi.mock('../../../public/engine/sample-voice.js', () => ({
    pickZone: mocks.pickZone,
    foldToSampledCeiling: mocks.foldToSampledCeiling,
    playSampledNote: mocks.playSampledNote,
}));
vi.mock('../../../public/data/sound-packs.js', () => ({
    gainForPack: mocks.gainForPack,
    toneTiltForPack: mocks.toneTiltForPack,
}));

import { playHarmonyNote } from '../../../public/engine/synth-harmonies.js';

const busGain = { connect: vi.fn() };

function makeState(voice) {
    return {
        playback: {
            audio: { currentTime: 0 },
            audioGraph: { harmonies: { gain: busGain } },
        },
        harmony: { voice, activeVoices: [] },
        groove: {},
    };
}

// A4 = 440 Hz → MIDI 69; the strings pack has a zone there.
const A4 = 440;
const zone69 = { rootMidi: 69, buffer: {} };

function releaseFor(duration) {
    mocks.playSampledNote.mockClear();
    playHarmonyNote(makeState('pack:strings-ensemble'), A4, 0, duration, 0.4, 'strings');
    expect(mocks.playSampledNote).toHaveBeenCalledTimes(1);
    return mocks.playSampledNote.mock.calls[0][5].release;
}

describe('harmony sample release scaling (#785)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resolveInstrumentSource.mockReturnValue({
            kind: 'sample',
            packId: 'strings-ensemble',
        });
        mocks.getPackZones.mockReturnValue([zone69]);
        mocks.pickZone.mockReturnValue(zone69);
    });

    it('shortens the release tail for a fast-tempo (short) note', () => {
        // 140 bpm 1-beat ≈ 0.43 s → 0.43 * 0.4 ≈ 0.17 s, well under the old 0.3.
        const r = releaseFor(0.43);
        expect(r).toBeCloseTo(0.172, 3);
        expect(r).toBeLessThan(0.3);
    });

    it('keeps the full 0.3 s tail for a long held chord (slow tempo unchanged)', () => {
        // A 1.5 s pad → 0.6 capped at the old 0.3 s — lush bowed tail preserved.
        expect(releaseFor(1.5)).toBeCloseTo(0.3, 5);
    });

    it('floors the release so a very short note still decays click-free', () => {
        // 0.05 s * 0.4 = 0.02 → floored to 0.08.
        expect(releaseFor(0.05)).toBeCloseTo(0.08, 5);
    });

    it('scales monotonically between the floor and the cap', () => {
        expect(releaseFor(0.43)).toBeLessThan(releaseFor(0.6));
    });

    it('falls back to a safe default release when duration is non-finite', () => {
        // duration 0.5 fallback → 0.2, not NaN into the AudioParam.
        const r = releaseFor(Number.NaN);
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeCloseTo(0.2, 5);
    });
});
