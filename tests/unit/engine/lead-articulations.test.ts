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
    scheduleDepth,
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
function playSynth(
    freq,
    start,
    duration,
    bend,
    articulation,
    { isLegato = false, prevFreq = null, vibrato = false } = {},
) {
    const { state, gains, oscillators } = synthAudio();
    state.soloist.audio.lastRenderedFreq = prevFreq;
    playSoloNote(state, freq, start, duration, 0.8, bend, isLegato, vibrato, 7, 0, articulation);
    // The voice's output gain is the first gain it creates (the amplitude envelope).
    return {
        pitch: [oscillators[0].frequency, oscillators[1].frequency],
        level: gains[0].gain,
        gains,
        oscillators,
    };
}

/** The nodes an AudioNode was connected to. */
const targets = (node) => node.connect.mock.calls.map(([target]) => target);

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
        // The level sinks with it, from where the fall starts, and the release comes only where
        // the fall lands — the note's end — quickly, inside the 0.2 s the oscillators run on.
        const taper = level.events.find((e) => e.op === 'target' && Math.abs(e.time - 2.45) < 1e-9);
        expect(taper).toBeDefined();
        expect(taper.value).toBeCloseTo(0.8 * 1.2 * 0.82 * FALL_TAPER, 10);
        expect(taper.constant).toBeCloseTo(0.05, 10);
        const release = level.events.at(-1);
        expect(release).toMatchObject({ op: 'target', value: 0 });
        expect(release.time).toBeCloseTo(2.6, 10);
        expect(release.constant).toBeCloseTo(0.05, 10);
    });

    it('fits a fall longer than its note inside it, from the note’s start: no backwards ramp', () => {
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

    it('a released bend that also falls: the fall starts where the release lands, from there', () => {
        const fretted = 440 * semis(-2);
        // The fall asks for the last 0.4 s (from 2.4), but the release lands at 2.5.
        const { pitch } = playSynth(440, 2, 0.8, -2, {
            release: { at: 0.3, seconds: 0.2 },
            fall: { semitones: 3, seconds: 0.4 },
        });
        for (const param of pitch) {
            expectWellFormed(param);
            const [, , , letDown, anchor, drop] = param.events;
            expect(letDown.time).toBeCloseTo(2.5, 10);
            expect(anchor).toMatchObject({ op: 'set' });
            expect(anchor.value).toBeCloseTo(fretted, 6);
            expect(anchor.time).toBeCloseTo(2.5, 10);
            expect(drop.op).toBe('exp');
            expect(drop.value).toBeCloseTo(fretted * semis(-3), 6);
            expect(drop.time).toBeCloseTo(2.8, 10);
        }
    });

    it('a slide that also falls: slides in, holds, then falls off the tail', () => {
        const { pitch } = playSynth(440, 2, 0.6, 0, {
            slide: { semitones: -3, seconds: 0.06 },
            fall: { semitones: 3, seconds: 0.15 },
        });
        for (const param of pitch) {
            expectWellFormed(param);
            const [, arrive, anchor, drop] = param.events;
            expect(arrive.time).toBeCloseTo(2.06, 10);
            expect(anchor).toMatchObject({ op: 'set', value: 440 });
            expect(anchor.time).toBeCloseTo(2.45, 10);
            expect(drop.time).toBeCloseTo(2.6, 10);
        }
    });

    it('a slurred note that falls starts its fall only once the slur has landed', () => {
        // Monophonic portamento glides 85 ms; the fall asks for more than the whole note.
        const { pitch } = playSynth(
            440,
            2,
            0.3,
            0,
            { fall: { semitones: 3, seconds: 1 } },
            { isLegato: true, prevFreq: 440 * semis(-1) },
        );
        for (const param of pitch) {
            expectWellFormed(param);
            const [from, glide, anchor, drop] = param.events;
            expect(from.value).toBeCloseTo(440 * semis(-1), 6);
            expect(glide).toMatchObject({ op: 'exp', value: 440 });
            expect(glide.time).toBeCloseTo(2.085, 10);
            expect(anchor.time).toBeCloseTo(2.085, 10);
            expect(drop.time).toBeCloseTo(2.3, 10);
        }
    });

    it('skips the taper when the fall starts before the decay is aimed, still releasing at the end', () => {
        // The decay is aimed 80 ms in (four attack constants); the fall takes the whole note.
        const { level } = playSynth(440, 2, 0.3, 0, { fall: { semitones: 3, seconds: 1 } });
        const taper = level.events.filter(
            (e) => e.op === 'target' && Math.abs(e.value - 0.8 * 1.2 * 0.82 * FALL_TAPER) < 1e-9,
        );
        expect(taper).toHaveLength(0);
        const release = level.events.at(-1);
        expect(release).toMatchObject({ op: 'target', value: 0 });
        expect(release.time).toBeCloseTo(2.3, 10);
    });

    it('a long fall into the rest (a note the host lengthened): released after the fall, sounding through it', () => {
        // A half note at 120 (1 s) and a quarter's fall into the rest: the voice gets 1.5 s.
        const { pitch, level, oscillators } = playSynth(440, 2, 1.5, 0, {
            fall: { semitones: 6, seconds: 0.5 },
        });
        for (const param of pitch) {
            expectWellFormed(param);
            const [, anchor, drop] = param.events;
            expect(anchor.time).toBeCloseTo(3, 10);
            expect(drop.value).toBeCloseTo(440 * semis(-6), 6);
            expect(drop.time).toBeCloseTo(3.5, 10);
        }
        expect(level.events.at(-1)).toMatchObject({ op: 'target', value: 0, time: 3.5 });
        // The oscillators run past the fall's end, so it is heard to the bottom and released.
        expect(oscillators[0].stop).toHaveBeenCalledWith(3.7);
        expect(oscillators[1].stop).toHaveBeenCalledWith(3.7);
    });

    it('fades the vibrato out across a fall: pitch, depth wobble, amplitude and cutoff taps', () => {
        const { level, gains, oscillators } = playSynth(
            440,
            2,
            1,
            0,
            { fall: { semitones: 3, seconds: 0.3 } },
            { vibrato: true },
        );
        const frequencies = new Set([oscillators[0].frequency, oscillators[1].frequency]);
        const vib = gains.find((g) => targets(g).some((t) => frequencies.has(t)));
        const wobble = gains.find((g) => targets(g).includes(vib.gain));
        const amp = gains.find((g) => targets(g).includes(level));
        const lfo = oscillators.find((o) => targets(o).includes(vib));
        const cutoff = targets(lfo).find((t) => t !== vib && t !== amp);
        for (const depth of [vib, wobble, amp, cutoff]) {
            expect(depth).toBeDefined();
            const events = depth.gain.events;
            // Held at full from the fall's start, then a straight line to 0 at its end.
            const [hold, out] = events.slice(-2);
            expect(hold).toMatchObject({ op: 'set' });
            expect(hold.value).toBeGreaterThan(0);
            expect(hold.time).toBeCloseTo(2.7, 10);
            expect(out).toMatchObject({ op: 'linear', value: 0 });
            expect(out.time).toBeCloseTo(3, 10);
            expect(events.some((e) => e.op === 'exp' || e.op === 'cancel')).toBe(false);
        }
    });

    it('leaves the vibrato as it was on a note that doesn’t fall', () => {
        const { gains, oscillators } = playSynth(440, 2, 1, 0, undefined, { vibrato: true });
        const frequencies = new Set([oscillators[0].frequency, oscillators[1].frequency]);
        const vib = gains.find((g) => targets(g).some((t) => frequencies.has(t)));
        expect(vib.gain.events.map((e) => e.op)).toEqual(['set', 'set', 'linear']);
        expect(vib.gain.events[2].value).toBeGreaterThan(0);
    });
});

describe('scheduleDepth — a vibrato depth that fades out across a fall (#2120)', () => {
    const run = (fade) => {
        const param = recordingParam();
        scheduleDepth(param, 0, 0.1, 0.4, 2, fade);
        return param.events.map((e) => [e.op, e.value, e.time]);
    };

    it('is the plain fade-in with no fall', () => {
        expect(run(null)).toEqual([
            ['set', 0, 0],
            ['set', 0, 0.1],
            ['linear', 2, 0.4],
        ]);
    });

    it('stops the fade-in where the fall starts, at the level it had reached, then fades to 0', () => {
        const events = run({ start: 0.25, end: 0.5 });
        expect(events.slice(0, 2)).toEqual([
            ['set', 0, 0],
            ['set', 0, 0.1],
        ]);
        expect(events[2][0]).toBe('linear');
        expect(events[2][1]).toBeCloseTo(1, 10);
        expect(events[2][2]).toBe(0.25);
        expect(events[3]).toEqual(['linear', 0, 0.5]);
    });

    it('holds the full depth to the fall when the fade-in is done before it', () => {
        expect(run({ start: 0.6, end: 0.9 })).toEqual([
            ['set', 0, 0],
            ['set', 0, 0.1],
            ['linear', 2, 0.4],
            ['set', 2, 0.6],
            ['linear', 0, 0.9],
        ]);
    });

    it('never brings the vibrato in when the fall starts before it would', () => {
        expect(run({ start: 0.05, end: 0.3 })).toEqual([
            ['set', 0, 0],
            ['set', 0, 0.1],
        ]);
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
    // Every gain the note makes, in order: the envelope first, then a vibrato LFO's depth.
    const gains = [];
    const ctx = {
        currentTime: 0,
        createBufferSource: vi.fn(() => source),
        createGain: vi.fn(() => {
            const made = { gain: recordingParam(), connect: vi.fn(), disconnect: vi.fn() };
            gains.push(made);
            return made;
        }),
        createOscillator: vi.fn(() => ({
            type: '',
            frequency: recordingParam(),
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
        })),
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
    return { rate: source.playbackRate, level: gains[0].gain, gains, source, handle };
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

    it('skips the taper when the fall starts before the attack has peaked', () => {
        // A 0.3 s attack and a fall that asks for the last 0.8 s of a 1 s note (from 0.2).
        const { rate, level } = playSampled({
            duration: 1,
            attack: 0.3,
            bend: { fall: { semitones: 3, seconds: 0.8 } },
        });
        expect(rate.events.some((e) => e.op === 'exp')).toBe(true);
        expect(level.events.map((e) => [e.op, e.value, e.time])).toEqual([
            ['set', 0, 0],
            ['linear', 1, 0.3],
            ['set', 1, 1],
            ['linear', 0, 1.08],
        ]);
    });

    it('a long fall into the rest (a note the host lengthened): sounds to the fall’s end, then releases', () => {
        // A half note at 120 (1 s) and a quarter's fall into the rest: the voice gets 1.5 s.
        const { rate, level, source } = playSampled({
            duration: 1.5,
            bend: { fall: { semitones: 6, seconds: 0.5 } },
        });
        expectWellFormed(rate);
        expect(rate.events[1]).toMatchObject({ op: 'set', value: 1, time: 1 });
        expect(rate.events[2].value).toBeCloseTo(semis(-6), 10);
        expect(rate.events[2].time).toBe(1.5);
        // Held at peak to the fall, sinking with it, and released only after it.
        expect(level.events.slice(2).map((e) => [e.op, e.value, e.time])).toEqual([
            ['set', 1, 1],
            ['linear', FALL_TAPER, 1.5],
            ['linear', 0, 1.58],
        ]);
        // The source stops after the release, never before the fall has landed.
        expect(source.stop.mock.calls.at(-1)[0]).toBeCloseTo(1.59, 10);
    });

    it('fades the vibrato LFO’s depth out across the fall', () => {
        const { gains } = playSampled({
            duration: 1,
            vibrato: { depthCents: 18, rateHz: 5.5, delay: 0.1, ramp: 0.3 },
            bend: { fall: { semitones: 3, seconds: 0.25 } },
        });
        // The envelope is the first gain; the LFO depth the one after it.
        const depth = gains[1].gain.events;
        const [hold, out] = depth.slice(-2);
        expect(hold).toMatchObject({ op: 'set', time: 0.75 });
        expect(hold.value).toBeGreaterThan(0);
        expect(out).toMatchObject({ op: 'linear', value: 0, time: 1 });
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
