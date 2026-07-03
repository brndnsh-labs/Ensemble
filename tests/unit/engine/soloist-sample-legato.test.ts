// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

// #855 — guitar legato slur (hammer-on / pull-off) on the SAMPLED soloist voice.
// The synth soloist already glides (portamento) a legato run; the sampled guitar packs
// re-triggered a fresh pluck on every note, so runs read as horn-like. These lock
// the producer decision — WHEN a legato guitar note glides into pitch from its
// predecessor and softens its attack — without pulling in the real audio graph
// (the sample scheduler is mocked; the "does it sound right" call is by-ear).

const mocks = vi.hoisted(() => ({
    resolveInstrumentSource: vi.fn(),
    getPackZones: vi.fn(),
    pickZone: vi.fn(),
    foldToSampledCeiling: vi.fn((midi: number) => midi),
    playSampledNote: vi.fn(),
    gainForPack: vi.fn(() => 1),
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

import { playSoloNote } from '../../../public/engine/synth-soloist.js';

const zone = { rootMidi: 60, buffer: {} };

function makeState(voice) {
    return {
        playback: {
            audio: { currentTime: 0 },
            audioGraph: { soloist: { gain: { connect: vi.fn() } } },
        },
        soloist: { voice, mode: 'monophonic', audio: { lastRenderedFreq: null } },
        groove: {},
    };
}

// playSoloNote(state, freq, time, duration, vol, bendStartInterval, style,
//              isLegato, vibrato, noteSeed, expression)
const A4 = 440;
const Bb4 = 466.1638; // a semitone above A4 — a stepwise hammer-on target
const A5 = 880; // an octave above — a leap you'd re-pick, not slur

function lastOpts() {
    return mocks.playSampledNote.mock.calls.at(-1)[5];
}

describe('sampled guitar legato slur (#855)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getPackZones.mockReturnValue([zone]);
        mocks.pickZone.mockReturnValue(zone);
        mocks.gainForPack.mockReturnValue(1);
    });

    it('glides a legato guitar step into pitch from the previous note + softens the attack', () => {
        mocks.resolveInstrumentSource.mockReturnValue({
            kind: 'sample',
            packId: 'electric-guitar-clean',
        });
        const state = makeState('pack:electric-guitar-clean');
        state.soloist.audio.lastRenderedFreq = A4; // previous note

        playSoloNote(state, Bb4, 0, 0.5, 0.8, 0, 'scalar', true);

        const { bend, attack } = lastOpts();
        // Start a semitone BELOW the target (came from A4) and glide up = hammer-on.
        expect(bend.fromSemitones).toBeCloseTo(-1, 1);
        expect(bend.inSeconds).toBe(0.04); // a fast slur, not a slow scoop
        expect(attack).toBe(0.028); // softened onset masks the re-pick transient
    });

    it('does NOT slur a non-legato note (plain per-note pluck)', () => {
        mocks.resolveInstrumentSource.mockReturnValue({
            kind: 'sample',
            packId: 'electric-guitar-clean',
        });
        const state = makeState('pack:electric-guitar-clean');
        state.soloist.audio.lastRenderedFreq = A4;

        playSoloNote(state, Bb4, 0, 0.5, 0.8, 0, 'scalar', false);

        const { bend, attack } = lastOpts();
        expect(bend).toBeUndefined();
        expect(attack).toBeUndefined();
    });

    it('does NOT slur a leap larger than a 5th (a guitarist re-picks it)', () => {
        mocks.resolveInstrumentSource.mockReturnValue({
            kind: 'sample',
            packId: 'electric-guitar-clean',
        });
        const state = makeState('pack:electric-guitar-clean');
        state.soloist.audio.lastRenderedFreq = A4;

        playSoloNote(state, A5, 0, 0.5, 0.8, 0, 'scalar', true); // octave leap

        const { bend, attack } = lastOpts();
        expect(bend).toBeUndefined();
        expect(attack).toBeUndefined();
    });

    it('does NOT slur a non-guitar sample voice (sax keeps its own articulation)', () => {
        mocks.resolveInstrumentSource.mockReturnValue({ kind: 'sample', packId: 'sax-alto' });
        const state = makeState('pack:sax-alto');
        state.soloist.audio.lastRenderedFreq = A4;

        playSoloNote(state, Bb4, 0, 0.5, 0.8, 0, 'scalar', true);

        const { bend, attack } = lastOpts();
        expect(bend).toBeUndefined();
        expect(attack).toBeUndefined();
    });

    it('leaves an explicit entry scoop untouched (does not overlay a legato slur)', () => {
        mocks.resolveInstrumentSource.mockReturnValue({
            kind: 'sample',
            packId: 'electric-guitar-clean',
        });
        const state = makeState('pack:electric-guitar-clean');
        state.soloist.audio.lastRenderedFreq = A4;

        // bendStartInterval = -2 (a whole-step scoop up) — legato must not override it.
        playSoloNote(state, Bb4, 0, 0.5, 0.8, -2, 'scalar', true);

        const { bend, attack } = lastOpts();
        expect(bend.fromSemitones).toBe(-2); // the scoop, not the computed legato interval
        expect(bend.inSeconds).toBeUndefined(); // scoop keeps its default glide
        expect(attack).toBeUndefined();
    });

    it('commits lastRenderedFreq only after the sample plays, feeding the next slur', () => {
        mocks.resolveInstrumentSource.mockReturnValue({
            kind: 'sample',
            packId: 'electric-guitar-clean',
        });
        const state = makeState('pack:electric-guitar-clean');

        // First note (no predecessor → no slur), then a contiguous legato step.
        playSoloNote(state, A4, 0, 0.5, 0.8, 0, 'scalar', false);
        expect(state.soloist.audio.lastRenderedFreq).toBe(A4);

        playSoloNote(state, Bb4, 0.5, 0.5, 0.8, 0, 'scalar', true);
        expect(lastOpts().bend.fromSemitones).toBeCloseTo(-1, 1);
        expect(state.soloist.audio.lastRenderedFreq).toBe(Bb4);
    });
});
