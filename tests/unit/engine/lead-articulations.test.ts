// @ts-nocheck
/**
 * The lead's pitch moves beyond the bend-in (#2120): a horn's fall-off, a guitarist's
 * bend-and-release and slide-in, rendered on the synth voice (`playSoloNote`, the oscillators'
 * `frequency`) and on the sampled seam (`playSampledNote`, the source's `playbackRate`). Each is
 * pinned at its scheduled automation: the values, the times, and the Web Audio rules — every
 * ramp anchored at its start with a `setValueAtTime`, every exponential ramp between positive
 * values, nothing scheduled backwards, nothing non-finite.
 */
import { describe, expect, it, vi } from 'vitest';
import {
    articulationWindows,
    FALL_TAPER,
    playSampledNote,
} from '../../../core/engine/sample-voice.js';
import { playSoloNote } from '../../../core/engine/synth-soloist.js';

/** A param that records every scheduled event, in call order. */
function recordingParam() {
    const events = [];
    const record = (op) =>
        vi.fn((value, time, constant) => {
            events.push({ op, value, time, constant });
        });
    return {
        value: 0,
        events,
        setValueAtTime: record('set'),
        linearRampToValueAtTime: record('linear'),
        exponentialRampToValueAtTime: record('exp'),
        setTargetAtTime: record('target'),
        cancelScheduledValues: vi.fn((time) => events.push({ op: 'cancel', value: 0, time })),
    };
}

function synthAudio() {
    const gains = [];
    const oscillators = [];
    const node = () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
        type: '',
        gain: recordingParam(),
        frequency: recordingParam(),
        detune: recordingParam(),
        Q: recordingParam(),
        pan: recordingParam(),
    });
    const audio = {
        currentTime: 1,
        sampleRate: 48000,
        createGain: vi.fn(() => {
            const gain = node();
            gains.push(gain);
            return gain;
        }),
        createOscillator: vi.fn(() => {
            const osc = node();
            oscillators.push(osc);
            return osc;
        }),
        createBiquadFilter: vi.fn(node),
        createStereoPanner: vi.fn(node),
        createWaveShaper: vi.fn(node),
    };
    const state = {
        playback: {
            audio,
            audioGraph: { soloist: { gain: { connect: vi.fn() } } },
            bandIntensity: 0.5,
            bpm: 120,
        },
        soloist: {
            voice: 'synth',
            mode: 'monophonic',
            audio: { lastRenderedFreq: null, activeVoices: [] },
        },
        groove: { humanize: 0 },
    };
    return { state, gains, oscillators };
}

/** The synth voice's two sawtooths: the first two oscillators it creates. */
function playSynth(freq, start, duration, bend, articulation, isLegato = false) {
    const { state, gains, oscillators } = synthAudio();
    playSoloNote(state, freq, start, duration, 0.8, bend, isLegato, false, 7, 0, articulation);
    // The voice's output gain is the first gain it creates (the amplitude envelope).
    return { pitch: [oscillators[0].frequency, oscillators[1].frequency], level: gains[0].gain };
}

/** Web Audio's rules for one param's pitch automation. */
function expectWellFormed(param) {
    let last = Number.NEGATIVE_INFINITY;
    let previous = null;
    for (const event of param.events) {
        expect(Number.isFinite(event.value), `${event.op} value ${event.value}`).toBe(true);
        expect(Number.isFinite(event.time), `${event.op} time ${event.time}`).toBe(true);
        expect(event.time).toBeGreaterThanOrEqual(last);
        if (event.op === 'exp') {
            expect(event.value).toBeGreaterThan(0);
            // An exponential ramp runs from the event before it: never from nothing or 0.
            expect(previous).not.toBeNull();
            expect(previous.value).toBeGreaterThan(0);
        }
        last = event.time;
        previous = event;
    }
}

const semis = (s) => 2 ** (s / 12);

describe('the synth lead’s pitch moves (#2120)', () => {
    it('plays a note with no articulation exactly as before: one pitch, no ramps', () => {
        const { pitch } = playSynth(440, 2, 0.5, 0, undefined);
        for (const param of pitch) {
            expect(param.events).toEqual([{ op: 'set', value: 440, time: 2, constant: undefined }]);
        }
    });

    it('falls off: holds the pitch, then drops it over the note’s last stretch, anchored', () => {
        const fall = { semitones: 3, seconds: 0.15 };
        const { pitch, level } = playSynth(440, 2, 0.6, 0, { fall });
        for (const param of pitch) {
            expectWellFormed(param);
            const [, anchor, ramp] = param.events;
            // Anchored at the fall's start, at the written pitch...
            expect(anchor).toMatchObject({ op: 'set', value: 440 });
            expect(anchor.time).toBeCloseTo(2.45, 10);
            // ...then an even glide down three semitones, landing at the note's end.
            expect(ramp.op).toBe('exp');
            expect(ramp.value).toBeCloseTo(440 * semis(-3), 6);
            expect(ramp.time).toBeCloseTo(2.6, 10);
        }
        // The level sinks with it, from where the fall starts, before the release takes over.
        const taper = level.events.find((e) => e.op === 'target' && Math.abs(e.time - 2.45) < 1e-9);
        expect(taper).toBeDefined();
        expect(taper.value).toBeCloseTo(0.8 * 1.2 * 0.82 * FALL_TAPER, 10);
        expect(taper.constant).toBeGreaterThan(0);
        const release = level.events.at(-1);
        expect(release).toMatchObject({ op: 'target', value: 0 });
        expect(release.time).toBeGreaterThan(taper.time);
    });

    it('fits a fall longer than its note inside it, after the attack: no backwards ramp', () => {
        const { pitch } = playSynth(440, 2, 0.04, 0, { fall: { semitones: 5, seconds: 1 } });
        for (const param of pitch) {
            expectWellFormed(param);
            const ramp = param.events.find((e) => e.op === 'exp');
            expect(ramp.time).toBeCloseTo(2.04, 10);
            expect(param.events.every((e) => e.time >= 2)).toBe(true);
        }
    });

    it('bends up, holds, and lets the bend back down onto the note it started from', () => {
        // The host passes a bend-in of 2 as −2 (`bendStartInterval`).
        const release = { at: 0.3, seconds: 0.2 };
        const { pitch } = playSynth(440, 2, 0.8, -2, { release });
        const fretted = 440 * semis(-2);
        for (const param of pitch) {
            expectWellFormed(param);
            const [start, bendUp, hold, letDown] = param.events;
            expect(start).toMatchObject({ op: 'set', time: 2 });
            expect(start.value).toBeCloseTo(fretted, 6);
            expect(bendUp).toMatchObject({ op: 'exp', value: 440 });
            expect(bendUp.time).toBeCloseTo(2.1, 10);
            expect(hold).toMatchObject({ op: 'set', value: 440 });
            expect(hold.time).toBeCloseTo(2.3, 10);
            expect(letDown.op).toBe('exp');
            expect(letDown.value).toBeCloseTo(fretted, 6);
            expect(letDown.time).toBeCloseTo(2.5, 10);
        }
    });

    it('ignores a release on a note that never bent', () => {
        const { pitch } = playSynth(440, 2, 0.8, 0, { release: { at: 0.3, seconds: 0.2 } });
        for (const param of pitch) {
            expect(param.events).toHaveLength(1);
        }
    });

    it('slides in from three frets below over the time it was given', () => {
        const { pitch } = playSynth(440, 2, 0.5, 0, { slide: { semitones: -3, seconds: 0.06 } });
        for (const param of pitch) {
            expectWellFormed(param);
            const [start, arrive] = param.events;
            expect(start).toMatchObject({ op: 'set', time: 2 });
            expect(start.value).toBeCloseTo(440 * semis(-3), 6);
            expect(arrive).toMatchObject({ op: 'exp', value: 440 });
            expect(arrive.time).toBeCloseTo(2.06, 10);
        }
    });

    it('slides down from above too, and never for longer than half the note', () => {
        const { pitch } = playSynth(440, 2, 0.1, 0, { slide: { semitones: 2, seconds: 0.5 } });
        const [start, arrive] = pitch[0].events;
        expect(start.value).toBeCloseTo(440 * semis(2), 6);
        expect(arrive.time).toBeCloseTo(2.05, 10);
    });
});

/** A sampled note on a fake context recording its source's playbackRate and its gain. */
function playSampled(options) {
    const source = {
        playbackRate: recordingParam(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
        buffer: null,
    };
    const gain = { gain: recordingParam(), connect: vi.fn(), disconnect: vi.fn() };
    const ctx = {
        currentTime: 0,
        createBufferSource: vi.fn(() => source),
        createGain: vi.fn(() => gain),
        createBiquadFilter: vi.fn(() => ({
            type: '',
            frequency: { value: 0 },
            gain: { value: 0 },
            connect: vi.fn(),
            disconnect: vi.fn(),
        })),
    };
    const handle = playSampledNote(ctx, { rootMidi: 60, buffer: { duration: 4 } }, {}, 60, 0, {
        velocity: 1,
        ...options,
    });
    return { rate: source.playbackRate, level: gain.gain, handle };
}

describe('the sampled lead’s pitch moves (#2120)', () => {
    it('falls off on playbackRate and tapers its level from the fall’s start', () => {
        const { rate, level } = playSampled({
            duration: 1,
            bend: { fall: { semitones: 4, seconds: 0.25 } },
        });
        expectWellFormed(rate);
        expect(rate.events).toEqual([
            { op: 'set', value: 1, time: 0, constant: undefined },
            { op: 'set', value: 1, time: 0.75, constant: undefined },
            expect.objectContaining({ op: 'exp', time: 1 }),
        ]);
        expect(rate.events[2].value).toBeCloseTo(semis(-4), 10);
        // Attack to the peak, held to the fall, a straight line down to the taper level at the
        // release, then the release from there.
        expect(level.events.map((e) => e.op)).toEqual(['set', 'linear', 'set', 'linear', 'linear']);
        expect(level.events[2]).toMatchObject({ op: 'set', value: 1, time: 0.75 });
        expect(level.events[3]).toMatchObject({ op: 'linear', value: FALL_TAPER, time: 1 });
        expect(level.events[4]).toMatchObject({ op: 'linear', value: 0 });
    });

    it('lets a bend back down, anchored at the release’s start', () => {
        const { rate } = playSampled({
            duration: 1,
            bend: { fromSemitones: -2, release: { at: 0.5, seconds: 0.2 } },
        });
        expectWellFormed(rate);
        const [start, bendUp, hold, letDown] = rate.events;
        expect(start).toMatchObject({ op: 'set', time: 0 });
        expect(start.value).toBeCloseTo(semis(-2), 10);
        expect(bendUp).toMatchObject({ op: 'exp', value: 1 });
        expect(bendUp.time).toBeCloseTo(0.1, 10);
        expect(hold).toMatchObject({ op: 'set', value: 1, time: 0.5 });
        expect(letDown.op).toBe('exp');
        expect(letDown.value).toBeCloseTo(semis(-2), 10);
        expect(letDown.time).toBeCloseTo(0.7, 10);
    });

    it('slides in through the bend-in path with its own glide time', () => {
        const { rate } = playSampled({
            duration: 0.5,
            bend: { fromSemitones: 3, inSeconds: 0.03 },
        });
        expectWellFormed(rate);
        expect(rate.events[0].value).toBeCloseTo(semis(3), 10);
        expect(rate.events[1]).toMatchObject({ op: 'exp', value: 1 });
        expect(rate.events[1].time).toBeCloseTo(0.03, 10);
    });

    it('a stop during the fall holds the tapered level it had reached, then fades', () => {
        const { level, handle } = playSampled({
            duration: 1,
            bend: { fall: { semitones: 4, seconds: 0.25 } },
        });
        handle.release(0.875, 0.05);
        const cancel = level.events.findIndex((e) => e.op === 'cancel');
        expect(level.events[cancel].time).toBe(0.875);
        // Halfway down the taper: the truncated ramp keeps its shape up to the stop.
        const held = level.events[cancel + 1];
        expect(held.op).toBe('linear');
        expect(held.value).toBeCloseTo(1 + (FALL_TAPER - 1) * 0.5, 10);
        expect(held.time).toBe(0.875);
        expect(level.events[cancel + 2]).toMatchObject({ op: 'target', value: 0, time: 0.875 });
    });

    it('a note with no pitch moves schedules exactly what it did before', () => {
        const { rate, level } = playSampled({ duration: 1 });
        expect(rate.events).toEqual([{ op: 'set', value: 1, time: 0, constant: undefined }]);
        expect(level.events.map((e) => [e.op, e.value, e.time])).toEqual([
            ['set', 0, 0],
            ['linear', 1, 0.005],
            ['set', 1, 1],
            ['linear', 0, 1.08],
        ]);
    });
});

describe('articulationWindows — where the later moves sit (#2120)', () => {
    it('starts the release no earlier than the bend has landed, and ends it by the note’s end', () => {
        const w = articulationWindows(0, 0.1, 0.4, { at: 0.05, seconds: 1 }, undefined);
        expect(w.release).toEqual({ start: 0.1, end: 0.4 });
    });

    it('starts the fall after the release has landed', () => {
        const w = articulationWindows(
            0,
            0.1,
            1,
            { at: 0.5, seconds: 0.3 },
            { semitones: 3, seconds: 0.5 },
        );
        expect(w.release.end).toBeCloseTo(0.8, 10);
        expect(w.fall.start).toBeCloseTo(0.8, 10);
        expect(w.fall.end).toBe(1);
    });

    it('leaves out a move with no room, or with numbers that are not finite and positive', () => {
        expect(articulationWindows(0, 1, 1, undefined, { semitones: 3, seconds: 0.2 }).fall).toBe(
            null,
        );
        expect(
            articulationWindows(0, 0, 1, undefined, { semitones: Number.NaN, seconds: 0.2 }).fall,
        ).toBe(null);
        expect(articulationWindows(0, 0, 1, undefined, { semitones: 3, seconds: 0 }).fall).toBe(
            null,
        );
        expect(
            articulationWindows(0, 0, 1, { at: Number.NaN, seconds: 0.2 }, undefined).release,
        ).toBe(null);
    });
});
