// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';

// #855 — guitar legato slur (hammer-on / pull-off) on the SAMPLED soloist voice.
// The synth soloist already glides (portamento) a legato run; the sampled guitar packs
// re-triggered a fresh pluck on every note, so runs read as horn-like. These lock
// the producer decision — WHEN a legato guitar note glides into pitch from its
// predecessor and softens its attack — without pulling in the real audio graph
// (the sample voice is mocked; the "does it sound right" call is by-ear).

const mocks = vi.hoisted(() => ({
    resolveInstrumentSource: vi.fn(),
    getPackZones: vi.fn(),
    pickZone: vi.fn(),
    foldToSampledCeiling: vi.fn((midi: number) => midi),
    playSampledNote: vi.fn(),
    gainForPack: vi.fn(() => 1),
    toneTiltForPack: vi.fn(() => 0),
}));

vi.mock('../../../core/engine/instrument-registry.js', () => ({
    resolveInstrumentSource: mocks.resolveInstrumentSource,
}));
vi.mock('../../../core/engine/pack-runtime.js', () => ({
    getPackZones: mocks.getPackZones,
}));
vi.mock('../../../core/engine/sample-voice.js', () => ({
    pickZone: mocks.pickZone,
    foldToSampledCeiling: mocks.foldToSampledCeiling,
    playSampledNote: mocks.playSampledNote,
}));
vi.mock('../../../core/data/sound-packs.js', () => ({
    gainForPack: mocks.gainForPack,
    toneTiltForPack: mocks.toneTiltForPack,
}));

import { playSoloNote } from '../../../core/engine/synth-soloist.js';

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

// playSoloNote(state, freq, time, duration, vol, bendStartInterval,
//              isLegato, vibrato, noteSeed)
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

        playSoloNote(state, Bb4, 0, 0.5, 0.8, 0, true);

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

        playSoloNote(state, Bb4, 0, 0.5, 0.8, 0, false);

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

        playSoloNote(state, A5, 0, 0.5, 0.8, 0, true); // octave leap

        const { bend, attack } = lastOpts();
        expect(bend).toBeUndefined();
        expect(attack).toBeUndefined();
    });

    it('does NOT slur a non-guitar sample voice (sax keeps its own articulation)', () => {
        mocks.resolveInstrumentSource.mockReturnValue({ kind: 'sample', packId: 'sax-alto' });
        const state = makeState('pack:sax-alto');
        state.soloist.audio.lastRenderedFreq = A4;

        playSoloNote(state, Bb4, 0, 0.5, 0.8, 0, true);

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
        playSoloNote(state, Bb4, 0, 0.5, 0.8, -2, true);

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
        playSoloNote(state, A4, 0, 0.5, 0.8, 0, false);
        expect(state.soloist.audio.lastRenderedFreq).toBe(A4);

        playSoloNote(state, Bb4, 0.5, 0.5, 0.8, 0, true);
        expect(lastOpts().bend.fromSemitones).toBeCloseTo(-1, 1);
        expect(state.soloist.audio.lastRenderedFreq).toBe(Bb4);
    });
});

// #2120 — the lead's pitch moves on the SAMPLED seam: what `playSoloNote` hands
// `playSampledNote` as its `bend`. The automation itself is pinned in
// lead-articulations.test.ts; this is the mapping.
describe('sampled lead pitch moves (#2120)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getPackZones.mockReturnValue([zone]);
        mocks.pickZone.mockReturnValue(zone);
        mocks.gainForPack.mockReturnValue(1);
        mocks.resolveInstrumentSource.mockReturnValue({
            kind: 'sample',
            packId: 'electric-guitar-clean',
        });
    });

    const play = (state, bendStart, legato, articulation) =>
        playSoloNote(state, A4, 0, 0.5, 0.8, bendStart, legato, false, 0, 0, articulation);

    it('renders a slide-in as a bend-in from its distance, over its own time', () => {
        play(makeState('pack:electric-guitar-clean'), 0, false, {
            slide: { semitones: -3, seconds: 0.06 },
        });
        const { bend, attack } = lastOpts();
        expect(bend).toEqual({ fromSemitones: -3, inSeconds: 0.06 });
        expect(attack).toBeUndefined(); // picked at the starting fret: the plain attack
    });

    it('lets the band’s bend down, and only that bend', () => {
        const release = { at: 0.25, seconds: 0.15 };
        play(makeState('pack:electric-guitar-clean'), -1, false, { release });
        expect(lastOpts().bend).toEqual({ fromSemitones: -1, release });
        // No bend-in: nothing to let down (a slide is not a bend).
        play(makeState('pack:electric-guitar-clean'), 0, false, {
            release,
            slide: { semitones: -2, seconds: 0.03 },
        });
        expect(lastOpts().bend).toEqual({ fromSemitones: -2, inSeconds: 0.03 });
    });

    it('carries a fall on a plain note, and alongside a legato slur', () => {
        const fall = { semitones: 3, seconds: 0.1 };
        play(makeState('pack:electric-guitar-clean'), 0, false, { fall });
        expect(lastOpts().bend).toEqual({ fall });
        const state = makeState('pack:electric-guitar-clean');
        state.soloist.audio.lastRenderedFreq = Bb4;
        play(state, 0, true, { fall });
        const { bend } = lastOpts();
        expect(bend.fromSemitones).toBeCloseTo(1, 1);
        expect(bend.inSeconds).toBe(0.04);
        expect(bend.fall).toEqual(fall);
    });

    it('hands no bend to a note with no pitch moves', () => {
        play(makeState('pack:electric-guitar-clean'), 0, false, undefined);
        expect(lastOpts().bend).toBeUndefined();
    });
});
