// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

// #697 — the bass lane's first sample seam. `playBassNote` routes a loaded
// `pack:` voice to the sampled upright (nearest zone → playSampledNote on the
// bass bus) and otherwise falls back to the synth voice. These lock the routing
// + the per-note transforms (freq→MIDI, pack gain, mute attenuation) without
// pulling in the whole synth voice — the sample side is mocked.

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

import { playBassNote } from '../../../public/engine/synth-bass.js';

const busGain = { connect: vi.fn() };

function makeState(voice) {
    return {
        playback: {
            audio: { currentTime: 0 },
            audioGraph: { bass: { gain: busGain } },
        },
        bass: { voice },
        groove: {},
    };
}

// A2 = MIDI 45 (110 Hz); the pack has a zone at exactly 45.
const A2 = 110;
const zone45 = { rootMidi: 45, buffer: {} };

describe('bass sample seam (#697)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.gainForPack.mockReturnValue(2);
    });

    it('routes a loaded pack voice to playSampledNote on the bass bus', () => {
        mocks.resolveInstrumentSource.mockReturnValue({ kind: 'sample', packId: 'upright-bass' });
        mocks.getPackZones.mockReturnValue([zone45]);
        mocks.pickZone.mockReturnValue(zone45);

        playBassNote(makeState('pack:upright-bass'), A2, 0, 0.5, 0.8, 0, 0);

        expect(mocks.playSampledNote).toHaveBeenCalledTimes(1);
        const [, zone, dest, targetMidi, , opts] = mocks.playSampledNote.mock.calls[0];
        expect(zone).toBe(zone45);
        expect(dest).toBe(busGain); // the bass gain bus, inheriting EQ/duck/reverb
        expect(targetMidi).toBe(45); // 110 Hz → A2 → MIDI 45
        // velocity = 0.8 (no mute) * gainForPack(2) = 1.6 — passed STRAIGHT, no min(1).
        expect(opts.velocity).toBeCloseTo(1.6, 5);
        expect(opts.duration).toBe(0.5);
    });

    it('attenuates a muted note like the synth voice (× (1 - mute*0.85))', () => {
        mocks.resolveInstrumentSource.mockReturnValue({ kind: 'sample', packId: 'upright-bass' });
        mocks.getPackZones.mockReturnValue([zone45]);
        mocks.pickZone.mockReturnValue(zone45);

        playBassNote(makeState('pack:upright-bass'), A2, 0, 0.5, 0.8, 1, 0);

        // 0.8 * (1 - 1*0.85) = 0.12, * gain 2 = 0.24
        expect(mocks.playSampledNote.mock.calls[0][5].velocity).toBeCloseTo(0.24, 5);
    });

    // #1288: this seam read the mute amount with a bare `Number.isFinite` test while
    // the synth voice 90 lines away normalized it. The two therefore disagreed on
    // every non-numeric input — a sample pack played a chuck at FULL volume where the
    // synth played it at 0.15. Both now route through `mute-contract.ts`.
    it('attenuates a BOOLEAN mute instead of playing it wide open', () => {
        mocks.resolveInstrumentSource.mockReturnValue({ kind: 'sample', packId: 'upright-bass' });
        mocks.getPackZones.mockReturnValue([zone45]);
        mocks.pickZone.mockReturnValue(zone45);

        playBassNote(makeState('pack:upright-bass'), A2, 0, 0.5, 0.8, true as never, 0);

        // Same 0.24 the numeric `1` produces — not 1.6, which is what
        // `Number.isFinite(true) === false → mute = 0` used to yield.
        expect(mocks.playSampledNote.mock.calls[0][5].velocity).toBeCloseTo(0.24, 5);
    });

    it('clamps an over-range mute rather than driving the velocity negative', () => {
        mocks.resolveInstrumentSource.mockReturnValue({ kind: 'sample', packId: 'upright-bass' });
        mocks.getPackZones.mockReturnValue([zone45]);
        mocks.pickZone.mockReturnValue(zone45);

        playBassNote(makeState('pack:upright-bass'), A2, 0, 0.5, 0.8, 2, 0);

        // Previously `1 - 2*0.85 = -0.7` → a NEGATIVE velocity into playSampledNote.
        const { velocity } = mocks.playSampledNote.mock.calls[0][5];
        expect(velocity).toBeGreaterThan(0);
        expect(velocity).toBeCloseTo(0.24, 5);
    });

    it('falls back to synth (no sample) when the pack has no loaded zones', () => {
        mocks.resolveInstrumentSource.mockReturnValue({ kind: 'sample', packId: 'upright-bass' });
        mocks.getPackZones.mockReturnValue(null); // not loaded yet

        playBassNote(makeState('pack:upright-bass'), A2, 0, 0.5, 0.8, 0, 0);

        expect(mocks.playSampledNote).not.toHaveBeenCalled();
    });

    it('does not touch the sample path for a synth voice', () => {
        mocks.resolveInstrumentSource.mockReturnValue({ kind: 'synth' });

        playBassNote(makeState('synth'), A2, 0, 0.5, 0.8, 0, 0);

        expect(mocks.getPackZones).not.toHaveBeenCalled();
        expect(mocks.playSampledNote).not.toHaveBeenCalled();
    });
});
