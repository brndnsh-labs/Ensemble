import { describe, expect, it, vi } from 'vitest';
import {
    buildToneTilt,
    foldToSampledCeiling,
    pickZone,
    pitchRatio,
    playSampledNote,
    playSampledStrike,
    releaseSampledVoices,
    type SampleZone,
} from '../../../core/engine/sample-voice.js';

// A param that records its scheduled (value, time) points.
function fakeParam() {
    const calls: Array<{ op: string; value: number; time: number }> = [];
    return {
        calls,
        setValueAtTime: vi.fn((value: number, time: number) => {
            calls.push({ op: 'set', value, time });
        }),
        linearRampToValueAtTime: vi.fn((value: number, time: number) => {
            calls.push({ op: 'ramp', value, time });
        }),
        exponentialRampToValueAtTime: vi.fn((value: number, time: number) => {
            calls.push({ op: 'exp', value, time });
        }),
        setTargetAtTime: vi.fn((value: number, time: number) => {
            calls.push({ op: 'target', value, time });
        }),
        cancelScheduledValues: vi.fn((time: number) => {
            calls.push({ op: 'cancel', value: 0, time });
        }),
    };
}

function fakeBuffer(duration = 1): AudioBuffer {
    return { duration } as AudioBuffer;
}

// Minimal AudioContext recording the nodes it creates + their connections.
function makeCtx() {
    const source: any = {
        playbackRate: fakeParam(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
        buffer: null,
    };
    const gain: any = {
        gain: fakeParam(),
        connect: vi.fn(),
        disconnect: vi.fn(),
    };
    const biquads: any[] = [];
    const ctx = {
        currentTime: 5,
        createBufferSource: vi.fn(() => source),
        createGain: vi.fn(() => gain),
        createBiquadFilter: vi.fn(() => {
            const node: any = {
                type: '',
                frequency: { value: 0 },
                gain: { value: 0 },
                connect: vi.fn(),
                disconnect: vi.fn(),
            };
            biquads.push(node);
            return node;
        }),
    } as unknown as AudioContext;
    return { ctx, source, gain, biquads };
}

const zone = (rootMidi: number): SampleZone => ({ rootMidi, buffer: fakeBuffer() });

describe('sample-voice — pitchRatio', () => {
    it('is unity at the root (in tune where recorded)', () => {
        expect(pitchRatio(60, 60)).toBe(1);
    });

    it('doubles an octave up, halves an octave down', () => {
        expect(pitchRatio(60, 72)).toBeCloseTo(2, 10);
        expect(pitchRatio(60, 48)).toBeCloseTo(0.5, 10);
    });

    it('is exactly in tune for an arbitrary semitone offset', () => {
        // +7 semitones (a fifth) → 2^(7/12)
        expect(pitchRatio(60, 67)).toBeCloseTo(2 ** (7 / 12), 12);
    });
});

describe('sample-voice — pickZone', () => {
    const zones = [zone(48), zone(60), zone(72)];

    it('picks the nearest root to minimize shift distance', () => {
        expect(pickZone(zones, 65)?.rootMidi).toBe(60); // dist 5 < 7
        expect(pickZone(zones, 70)?.rootMidi).toBe(72); // dist 2 < 10
        expect(pickZone(zones, 48)?.rootMidi).toBe(48); // exact
    });

    it('prefers the lower root on a tie', () => {
        expect(pickZone(zones, 66)?.rootMidi).toBe(60); // 6 vs 6 → lower
    });

    it('returns null for an empty zone set', () => {
        expect(pickZone([], 60)).toBeNull();
    });

    it('keeps every target within half the zone spacing — in tune across range', () => {
        // 12-semitone zone spacing → worst-case shift is 6 semitones.
        for (let target = 48; target <= 72; target++) {
            const picked = pickZone(zones, target);
            expect(Math.abs(picked!.rootMidi - target)).toBeLessThanOrEqual(6);
        }
    });
});

describe('sample-voice — playSampledNote', () => {
    it('shifts the chosen zone to the target pitch via playbackRate', () => {
        const { ctx, source } = makeCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 67, 1.0);
        expect(source.buffer).not.toBeNull();
        const rate = source.playbackRate.calls.find((c: any) => c.op === 'set');
        expect(rate.value).toBeCloseTo(2 ** (7 / 12), 12);
        expect(rate.time).toBe(1.0);
    });

    it('routes source → envelope gain → the instrument bus (inherits the chain)', () => {
        const { ctx, source, gain } = makeCtx();
        const bus = { tag: 'chordsGain' } as unknown as AudioNode;
        playSampledNote(ctx, zone(60), bus, 60, 0);
        expect(source.connect).toHaveBeenCalledWith(gain);
        expect(gain.connect).toHaveBeenCalledWith(bus);
    });

    it('applies a click-free attack→hold→release envelope from 0', () => {
        const { ctx, gain, source } = makeCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 2.0, {
            attack: 0.01,
            velocity: 0.8,
            duration: 0.5,
        });
        const c = gain.gain.calls;
        expect(c[0]).toEqual({ op: 'set', value: 0, time: 2.0 }); // start silent
        expect(c[1]).toEqual({ op: 'ramp', value: 0.8, time: 2.01 }); // attack to peak
        expect(c[2]).toEqual({ op: 'set', value: 0.8, time: 2.5 }); // hold-plateau anchor
        expect(c[3]).toEqual({ op: 'ramp', value: 0, time: 2.0 + 0.5 + 0.08 }); // release to 0
        expect(source.stop).toHaveBeenCalledWith(2.0 + 0.5 + 0.08 + 0.01);
    });

    it('keeps a monotonic envelope when duration < attack (no ramp inversion)', () => {
        const { ctx, source, gain } = makeCtx();
        // duration 0 < attack 0.01 → releaseStart floors to the attack endpoint.
        playSampledNote(ctx, zone(60), {} as AudioNode, 0, 0, {
            attack: 0.01,
            duration: 0,
        });
        const times = gain.gain.calls.map((x: any) => x.time);
        // releaseStart = max(0+0.01, 0+0) = 0.01, so: 0, 0.01, 0.01, 0.09
        expect(times).toEqual([0, 0.01, 0.01, 0.09]);
        for (let i = 1; i < times.length; i++) {
            expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]); // never goes backwards
        }
        expect(source.stop).toHaveBeenCalledWith(0.01 + 0.08 + 0.01);
    });

    it('disconnects its node chain on end (no per-note leak)', () => {
        const { ctx, source, gain } = makeCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 0);
        // The note schedules a self-cleanup handler rather than leaking nodes.
        expect(typeof source.onended).toBe('function');
        source.onended(); // simulate playback finishing
        expect(source.disconnect).toHaveBeenCalled();
        expect(gain.disconnect).toHaveBeenCalled();
    });

    it('allows over-unity velocity up to the sanity ceiling, defaults non-finite to full', () => {
        // Loudness-calibrated packs (the #660 string pad) fold a >1 gain into
        // velocity, so the envelope peak may exceed unity — passed through rather
        // than clamped at 1. A finite velocity within the ceiling is preserved.
        const { ctx, gain } = makeCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 0, { velocity: 5 });
        expect(gain.gain.calls.find((x: any) => x.op === 'ramp' && x.value > 0).value).toBe(5);

        // Above the ceiling is clamped (a config typo can't blast the bus).
        const over = makeCtx();
        playSampledNote(over.ctx, zone(60), {} as AudioNode, 60, 0, { velocity: 999 });
        expect(over.gain.gain.calls.find((x: any) => x.op === 'ramp' && x.value > 0).value).toBe(8);

        const second = makeCtx();
        // Math.min(…, NaN) is NaN — the explicit finite guard must catch it so no
        // NaN reaches the gain AudioParam.
        playSampledNote(second.ctx, zone(60), {} as AudioNode, 60, 0, {
            velocity: Number.NaN,
        });
        const ramped = second.gain.gain.calls.find((x: any) => x.op === 'ramp' && x.value > 0);
        expect(ramped.value).toBe(1);
        expect(second.gain.gain.calls.every((x: any) => Number.isFinite(x.value))).toBe(true);
    });

    it('falls back to ctx.currentTime when scheduled at a non-finite time', () => {
        const { ctx, gain, source } = makeCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, Number.NaN);
        // Every scheduled time must be finite, anchored at currentTime (5).
        expect(gain.gain.calls.every((x: any) => Number.isFinite(x.time))).toBe(true);
        expect(gain.gain.calls[0]).toEqual({ op: 'set', value: 0, time: 5 });
        expect(source.start).toHaveBeenCalledWith(5);
    });

    it('bails with no voice on a missing buffer/destination (graceful fallback)', () => {
        const { ctx } = makeCtx();
        const handle = playSampledNote(
            ctx,
            { rootMidi: 60, buffer: null as unknown as AudioBuffer },
            {} as AudioNode,
            60,
            0,
        );
        expect(handle).toBeNull();
        expect(ctx.createBufferSource).not.toHaveBeenCalled();
    });

    it('returns a release handle that cuts the voice early (chord-change #691)', () => {
        const { ctx, gain, source } = makeCtx();
        // Hold for 2s from t=10 (so naturalEnd ≈ 12.09); a long sustained note.
        const handle = playSampledNote(ctx, zone(60), {} as AudioNode, 60, 10, { duration: 2 });
        expect(handle).not.toBeNull();
        source.stop.mockClear();
        gain.gain.calls.length = 0;

        // Release at t=11 (mid-hold) over a 50ms fade.
        handle?.release(11, 0.05);
        // Smooth ramp toward 0 anchored at the release time (not a hard cut).
        const target = gain.gain.calls.find((c: any) => c.op === 'target');
        expect(target).toBeDefined();
        expect(target.value).toBe(0);
        expect(target.time).toBe(11);
        // Source stop is rescheduled earlier than the natural end (frees promptly).
        expect(source.stop).toHaveBeenCalled();
        const stopAt = source.stop.mock.calls.at(-1)[0];
        expect(stopAt).toBeGreaterThan(11);
        expect(stopAt).toBeLessThan(12.1);
    });

    it('release is no-op-safe after the voice ended (stale handle)', () => {
        const { ctx, source } = makeCtx();
        const handle = playSampledNote(ctx, zone(60), {} as AudioNode, 60, 0, { duration: 0.5 });
        source.stop.mockImplementation(() => {
            throw new Error('already stopped');
        });
        expect(() => handle?.release(0.6, 0.05)).not.toThrow();
    });
});

// A context that records every gain + oscillator it creates, so a vibrato test
// can inspect the LFO chain separately from the envelope gain.
function makeVibratoCtx() {
    const source: any = {
        playbackRate: fakeParam(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
        buffer: null,
    };
    const gains: any[] = [];
    const oscs: any[] = [];
    const ctx = {
        currentTime: 0,
        createBufferSource: vi.fn(() => source),
        createGain: vi.fn(() => {
            const g: any = { gain: fakeParam(), connect: vi.fn(), disconnect: vi.fn() };
            gains.push(g);
            return g;
        }),
        createOscillator: vi.fn(() => {
            const o: any = {
                type: 'sine',
                frequency: fakeParam(),
                connect: vi.fn(),
                disconnect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
            };
            oscs.push(o);
            return o;
        }),
    } as unknown as AudioContext;
    return { ctx, source, gains, oscs };
}

describe('sample-voice — playSampledNote vibrato (#744 Slice 1)', () => {
    it('never creates an LFO when no vibrato option is passed (shared seams unaffected)', () => {
        const { ctx } = makeVibratoCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 0, { duration: 1 });
        expect(ctx.createOscillator).not.toHaveBeenCalled();
    });

    it('attaches an LFO summed onto playbackRate at the requested rate', () => {
        const { ctx, source, oscs } = makeVibratoCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 0, {
            duration: 1,
            vibrato: { depthCents: 18, rateHz: 5.5, delay: 0.1, ramp: 0.3 },
        });
        expect(oscs).toHaveLength(1);
        const lfo = oscs[0];
        // LFO runs at the requested rate...
        expect(lfo.frequency.calls.find((c: any) => c.op === 'set')?.value).toBeCloseTo(5.5, 10);
        // ...and its depth-gain output is wired into the source's playbackRate param
        // (summing on top of the base ratio, so the note stays in tune around it).
        expect(lfo.connect).toHaveBeenCalled();
        const lfoGain = lfo.connect.mock.calls[0][0];
        expect(lfoGain.connect).toHaveBeenCalledWith(source.playbackRate);
        expect(lfo.start).toHaveBeenCalled();
        expect(lfo.stop).toHaveBeenCalled();
    });

    it('converts ±cents to the correct multiplicative playbackRate swing', () => {
        // At the zone root the base rate is 1.0, so the peak deviation is
        // exactly 2^(cents/1200) − 1. A shifted note scales by its base ratio.
        const root = makeVibratoCtx();
        playSampledNote(root.ctx, zone(60), {} as AudioNode, 60, 0, {
            duration: 1,
            vibrato: { depthCents: 18, rateHz: 5.5 },
        });
        // Isolate the LFO depth-gain by index (the last gain created, after the
        // envelope gain) rather than by value — so the assertion can't silently
        // latch onto the envelope's velocity ramp if a default changes.
        const rootLfoGain = root.gains[root.gains.length - 1];
        const rootDepth = rootLfoGain.gain.calls.find((c: any) => c.op === 'ramp')?.value;
        expect(rootDepth).toBeCloseTo(2 ** (18 / 1200) - 1, 6);

        // A fifth up: base ratio 2^(7/12), depth scales with it.
        const up = makeVibratoCtx();
        playSampledNote(up.ctx, zone(60), {} as AudioNode, 67, 0, {
            duration: 1,
            vibrato: { depthCents: 18, rateHz: 5.5 },
        });
        const upLfoGain = up.gains[up.gains.length - 1];
        const upDepth = upLfoGain.gain.calls.find((c: any) => c.op === 'ramp')?.value;
        expect(upDepth).toBeCloseTo(2 ** (7 / 12) * (2 ** (18 / 1200) - 1), 6);
    });

    it('holds depth at 0 through the attack delay, then ramps in (clean onset)', () => {
        const { ctx, gains } = makeVibratoCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 2, {
            duration: 1,
            vibrato: { depthCents: 18, rateHz: 5.5, delay: 0.12, ramp: 0.3 },
        });
        // The LFO depth-gain is the last gain created (after the envelope gain).
        const lfoGain = gains[gains.length - 1];
        const c = lfoGain.gain.calls;
        expect(c[0]).toMatchObject({ op: 'set', value: 0, time: 2 });
        expect(c[1]).toMatchObject({ op: 'set', value: 0, time: 2.12 });
        expect(c[2]).toMatchObject({ op: 'ramp', time: 2.12 + 0.3 });
        expect(c[2].value).toBeGreaterThan(0);
    });

    it('compresses the fade-in to fit a short note (vibrato still blooms within its life)', () => {
        // A 0.05 s note: naturalEnd ≈ 0.14 s, shorter than the default 0.1+0.3 s
        // fade. The LFO still attaches, but delay+ramp is compressed so the depth
        // ramp completes by the note's end rather than never reaching depth.
        const { ctx, source, gains } = makeVibratoCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 0, {
            duration: 0.05,
            vibrato: { depthCents: 18, rateHz: 5.5, delay: 0.1, ramp: 0.3 },
        });
        expect(ctx.createOscillator).toHaveBeenCalled(); // not skipped
        const lfoGain = gains[gains.length - 1];
        const ramp = lfoGain.gain.calls.find((c: any) => c.op === 'ramp');
        const stopAt = source.stop.mock.calls.at(-1)[0];
        // The fade-in lands at or before the source stops — no ramp left dangling
        // past the note, and the depth is actually reached.
        expect(ramp.time).toBeLessThanOrEqual(stopAt + 1e-9);
        expect(ramp.value).toBeCloseTo(2 ** (18 / 1200) - 1, 6);
    });

    it('disconnects the LFO nodes with the voice on end (no leak)', () => {
        const { ctx, source, oscs, gains } = makeVibratoCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 0, {
            duration: 1,
            vibrato: { depthCents: 18, rateHz: 5.5 },
        });
        source.onended();
        expect(oscs[0].disconnect).toHaveBeenCalled();
        expect(gains[gains.length - 1].disconnect).toHaveBeenCalled();
    });

    it('is a no-op for a non-positive depth or rate (graceful, no LFO)', () => {
        const a = makeVibratoCtx();
        playSampledNote(a.ctx, zone(60), {} as AudioNode, 60, 0, {
            duration: 1,
            vibrato: { depthCents: 0, rateHz: 5.5 },
        });
        expect(a.ctx.createOscillator).not.toHaveBeenCalled();

        const b = makeVibratoCtx();
        playSampledNote(b.ctx, zone(60), {} as AudioNode, 60, 0, {
            duration: 1,
            vibrato: { depthCents: 18, rateHz: 0 },
        });
        expect(b.ctx.createOscillator).not.toHaveBeenCalled();
    });
});

describe('sample-voice — playSampledNote bend (#744 Slice 2)', () => {
    it('holds fixed pitch when no bend option is passed (shared seams unaffected)', () => {
        const { ctx, source } = makeCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 0, { duration: 1 });
        // Just the single base setValueAtTime, no ramps.
        expect(source.playbackRate.calls).toEqual([{ op: 'set', value: 1, time: 0 }]);
    });

    it('renders a bend-IN: starts off-pitch and ramps to the target ratio', () => {
        const { ctx, source } = makeCtx();
        // fromSemitones -2 → start a whole step flat, ramp up to in-tune.
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 0, {
            duration: 1,
            bend: { fromSemitones: -2 },
        });
        const c = source.playbackRate.calls;
        expect(c[0]).toMatchObject({ op: 'set', value: 2 ** (-2 / 12) }); // start flat
        const arrive = c.find((x: any) => x.op === 'exp');
        expect(arrive.value).toBeCloseTo(1, 10); // ramps to the base rate (in tune)
    });

    it('anchors at the base rate with no ramp for a zero bend-in', () => {
        const { ctx, source } = makeCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 0, {
            duration: 2,
            bend: { fromSemitones: 0 },
        });
        // Only the base anchor — no ramps at all.
        expect(source.playbackRate.calls.filter((x: any) => x.op === 'exp')).toHaveLength(0);
    });
});

describe('sample-voice — playSampledStrike (sampled drums #662)', () => {
    it('plays the buffer at native rate (no pitch-shift — a real drum plays as recorded)', () => {
        const { ctx, source } = makeCtx();
        playSampledStrike(ctx, fakeBuffer(), {} as AudioNode, 1.0);
        expect(source.buffer).not.toBeNull();
        // Unlike playSampledNote, the strike never touches playbackRate.
        expect(source.playbackRate.setValueAtTime).not.toHaveBeenCalled();
    });

    it('routes source → envelope gain → the drum bus (inherits EQ/reverb/limiting)', () => {
        const { ctx, source, gain } = makeCtx();
        const bus = { tag: 'drumsPanner' } as unknown as AudioNode;
        playSampledStrike(ctx, fakeBuffer(), bus, 0);
        expect(source.connect).toHaveBeenCalledWith(gain);
        expect(gain.connect).toHaveBeenCalledWith(bus);
    });

    it('holds the whole recording by default (rings out the natural tail)', () => {
        const { ctx, gain, source } = makeCtx();
        // 2 s buffer, struck at t=3 with a 0.002 attack / 0.01 release.
        playSampledStrike(ctx, fakeBuffer(2), {} as AudioNode, 3, { velocity: 0.7 });
        const c = gain.gain.calls;
        expect(c[0]).toEqual({ op: 'set', value: 0, time: 3 }); // silent
        expect(c[1]).toEqual({ op: 'ramp', value: 0.7, time: 3.002 }); // attack to peak
        expect(c[2]).toEqual({ op: 'set', value: 0.7, time: 5 }); // hold across full 2 s buffer
        expect(c[3]).toEqual({ op: 'ramp', value: 0, time: 5.01 }); // release after the tail
        expect(source.stop).toHaveBeenCalledWith(5.01 + 0.01);
    });

    it('allows over-unity velocity (calibrated gain) up to the sanity ceiling', () => {
        const { ctx, gain } = makeCtx();
        playSampledStrike(ctx, fakeBuffer(), {} as AudioNode, 0, { velocity: 5 });
        expect(gain.gain.calls.find((x: any) => x.op === 'ramp' && x.value > 0).value).toBe(5);

        const over = makeCtx();
        playSampledStrike(over.ctx, fakeBuffer(), {} as AudioNode, 0, { velocity: 999 });
        expect(over.gain.gain.calls.find((x: any) => x.op === 'ramp' && x.value > 0).value).toBe(8);
    });

    it('disconnects its chain on end, then fires onEnded (no per-hit leak)', () => {
        const { ctx, source, gain } = makeCtx();
        const onEnded = vi.fn();
        playSampledStrike(ctx, fakeBuffer(), {} as AudioNode, 0, { onEnded });
        expect(typeof source.onended).toBe('function');
        source.onended();
        expect(source.disconnect).toHaveBeenCalled();
        expect(gain.disconnect).toHaveBeenCalled();
        expect(onEnded).toHaveBeenCalledTimes(1);
    });

    it('bails and fires onEnded on a missing buffer/destination (graceful synth fallback)', () => {
        const { ctx } = makeCtx();
        const onEnded = vi.fn();
        const handle = playSampledStrike(ctx, null, {} as AudioNode, 0, { onEnded });
        expect(onEnded).toHaveBeenCalledTimes(1);
        expect(ctx.createBufferSource).not.toHaveBeenCalled();
        expect(handle).toBeNull(); // no voice to choke
    });

    it('returns a choke handle that cuts the voice early (hi-hat choke #679)', () => {
        const { ctx, gain, source } = makeCtx();
        // A 2 s open hat struck at t=3 — rings until ~5 s on its own.
        const handle = playSampledStrike(ctx, fakeBuffer(2), {} as AudioNode, 3, { velocity: 1 });
        expect(handle).not.toBeNull();
        source.stop.mockClear();

        // Choke it at t=3.5 (a downbeat closed hat lands).
        handle?.choke(3.5);
        // Cancels the pending envelope, eases to 0 from the live value (no click),
        // and re-stops the source early — well before the natural ~5.01 s stop.
        const ops = gain.gain.calls.slice(-2);
        expect(ops[0]).toMatchObject({ op: 'cancel', time: 3.5 });
        expect(ops[1]).toMatchObject({ op: 'target', value: 0, time: 3.5 });
        expect(source.stop).toHaveBeenCalledTimes(1);
        expect(source.stop.mock.calls[0][0]).toBeGreaterThan(3.5);
        expect(source.stop.mock.calls[0][0]).toBeLessThan(5); // earlier than natural end
    });

    it('clamps a choke time into the live window (never before the voice starts)', () => {
        const { ctx, gain } = makeCtx();
        const handle = playSampledStrike(ctx, fakeBuffer(2), {} as AudioNode, 3, {});
        handle?.choke(1.0); // before startTime 3 → clamps to 3
        const target = gain.gain.calls.find((c: any) => c.op === 'target');
        expect(target.time).toBe(3);
    });

    it('a choke after the source already stopped is swallowed (no throw)', () => {
        const { ctx, source } = makeCtx();
        const handle = playSampledStrike(ctx, fakeBuffer(1), {} as AudioNode, 0, {});
        source.stop.mockImplementation(() => {
            throw new Error('InvalidStateError'); // simulate already-stopped source
        });
        expect(() => handle?.choke(0.5)).not.toThrow();
    });
});

describe('sample-voice — foldToSampledCeiling (#755 anti-aliasing fold)', () => {
    // Nylon-like zones: every 2 semitones, topping at 84 (the reported case).
    const nylon = [48, 60, 72, 80, 82, 84].map((rootMidi) => ({ rootMidi, buffer: fakeBuffer() }));

    it('leaves an in-range note unchanged', () => {
        expect(foldToSampledCeiling(72, nylon)).toBe(72);
        expect(foldToSampledCeiling(84, nylon)).toBe(84);
    });

    it('keeps a note within the default upshift tolerance (top + 2) unchanged', () => {
        expect(foldToSampledCeiling(85, nylon)).toBe(85); // +1 over top — like any in-range shift
        expect(foldToSampledCeiling(86, nylon)).toBe(86); // +2 over top — at the tolerance
    });

    it('folds a note beyond the tolerance down a whole octave (preserves pitch class)', () => {
        expect(foldToSampledCeiling(87, nylon)).toBe(75); // 87 → 75, same pitch class
        expect(foldToSampledCeiling(90, nylon)).toBe(78); // the soloist ceiling → 78
        // Folded results land back within the sampled range.
        expect(foldToSampledCeiling(90, nylon)).toBeLessThanOrEqual(84 + 2);
    });

    it('folds repeatedly when a note is multiple octaves too high', () => {
        // sax-like top of 79: a note way up folds by octaves until within tolerance.
        const sax = [49, 67, 79].map((rootMidi) => ({ rootMidi, buffer: fakeBuffer() }));
        expect(foldToSampledCeiling(100, sax)).toBe(76); // 100 → 88 → 76 (≤ 81)
    });

    it('respects a custom maxUpshift', () => {
        expect(foldToSampledCeiling(85, nylon, 0)).toBe(73); // no tolerance → fold 85 → 73
    });

    it('returns the note unchanged for an empty zone set', () => {
        expect(foldToSampledCeiling(90, [])).toBe(90);
    });
});

describe('sample-voice — buildToneTilt (#755 per-pack tone correction)', () => {
    it('returns null for a missing / zero / non-finite tilt (un-filtered path)', () => {
        const { ctx } = makeCtx();
        expect(buildToneTilt(ctx, undefined)).toBeNull();
        expect(buildToneTilt(ctx, 0)).toBeNull();
        expect(buildToneTilt(ctx, Number.NaN)).toBeNull();
    });

    it('builds a level-preserving paired shelf: low-shelf −tilt/2, high-shelf +tilt/2 at one pivot', () => {
        const { ctx, biquads } = makeCtx();
        const tilt = buildToneTilt(ctx, 3);
        expect(tilt).not.toBeNull();
        expect(biquads).toHaveLength(2);
        const [low, high] = biquads;
        expect(low.type).toBe('lowshelf');
        expect(high.type).toBe('highshelf');
        // Symmetric ±tilt/2 keeps it roughly level-preserving.
        expect(low.gain.value).toBe(-1.5);
        expect(high.gain.value).toBe(1.5);
        // Both shelves hinge at the same pivot frequency.
        expect(low.frequency.value).toBe(high.frequency.value);
        // The chain runs input(low) → output(high); the caller wires it inline.
        expect(low.connect).toHaveBeenCalledWith(high);
        expect(tilt?.input).toBe(low);
        expect(tilt?.output).toBe(high);
        expect(tilt?.nodes).toEqual([low, high]);
    });

    it('a negative tilt darkens (low-shelf boost, high-shelf cut)', () => {
        const { ctx, biquads } = makeCtx();
        buildToneTilt(ctx, -2);
        const [low, high] = biquads;
        expect(low.gain.value).toBe(1);
        expect(high.gain.value).toBe(-1);
    });
});

describe('sample-voice — playSampledNote tone insertion (#755)', () => {
    it('splices the tilt between the note gain and the bus when tone is set', () => {
        const { ctx, gain, biquads } = makeCtx();
        const dest = {} as AudioNode;
        playSampledNote(ctx, zone(60), dest, 60, 5, { tone: 2, duration: 0.5 });
        expect(biquads).toHaveLength(2);
        const [low, high] = biquads;
        // gain → low-shelf (not straight to the bus), high-shelf → bus.
        expect(gain.connect).toHaveBeenCalledWith(low);
        expect(gain.connect).not.toHaveBeenCalledWith(dest);
        expect(high.connect).toHaveBeenCalledWith(dest);
    });

    it('connects the note gain straight to the bus when no tone is set (byte-identical path)', () => {
        const { ctx, gain, biquads } = makeCtx();
        const dest = {} as AudioNode;
        playSampledNote(ctx, zone(60), dest, 60, 5, { duration: 0.5 });
        expect(biquads).toHaveLength(0);
        expect(gain.connect).toHaveBeenCalledWith(dest);
    });
});

describe('sample-voice — a stop silences its lane (#1530)', () => {
    it("releases a sounding note of the lane, and no other lane's", () => {
        const { ctx, source, gain } = makeCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 5, { duration: 8, lane: 'chords' });
        source.stop.mockClear();

        releaseSampledVoices(ctx, 'bass', 6);
        expect(gain.gain.setTargetAtTime).not.toHaveBeenCalled();

        releaseSampledVoices(ctx, 'chords', 6);
        expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 6, expect.any(Number));
        // Stopped within tens of milliseconds, not at the end of its eight-second hold.
        expect(source.stop).toHaveBeenCalledTimes(1);
        expect(source.stop.mock.calls[0][0]).toBeLessThan(6.1);
    });

    it('a note scheduled ahead never sounds', () => {
        const { ctx, source, gain } = makeCtx();
        // The host sends notes up to 150 ms ahead: this one starts after the stop.
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 5.1, { duration: 2, lane: 'chords' });
        source.stop.mockClear();
        releaseSampledVoices(ctx, 'chords', 5);
        // Held at its level on its start (silence, before the attack) and faded from there.
        expect(gain.gain.calls.slice(-2)).toEqual([
            { op: 'ramp', value: 0, time: 5.1 },
            { op: 'target', value: 0, time: 5.1 },
        ]);
        expect(source.stop.mock.calls[0][0]).toBeLessThan(5.2);
    });

    it('forgets a note once it has ended', () => {
        const { ctx, source, gain } = makeCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 5, { duration: 1, lane: 'chords' });
        source.onended();
        releaseSampledVoices(ctx, 'chords', 6);
        expect(gain.gain.setTargetAtTime).not.toHaveBeenCalled();
    });

    it('a note with no lane is left alone', () => {
        const { ctx, gain } = makeCtx();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 5, { duration: 8 });
        for (const lane of ['chords', 'bass', 'soloist', 'drums'] as const) {
            releaseSampledVoices(ctx, lane, 6);
        }
        expect(gain.gain.setTargetAtTime).not.toHaveBeenCalled();
    });

    it('chokes a ringing drum sample', () => {
        const { ctx, source, gain } = makeCtx();
        playSampledStrike(ctx, fakeBuffer(3), {} as AudioNode, 5, { lane: 'drums' });
        source.stop.mockClear();
        releaseSampledVoices(ctx, 'drums', 5.5);
        expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 5.5, expect.any(Number));
        expect(source.stop.mock.calls[0][0]).toBeLessThan(5.7);
    });
});

describe('sample-voice — a sustaining note outlasts its recording (#1532)', () => {
    // A context that hands out a new source and gain each time, and keeps them.
    function makeLoopCtx() {
        const sources: any[] = [];
        const gains: any[] = [];
        const ctx = {
            currentTime: 0,
            createBufferSource: vi.fn(() => {
                const source = {
                    playbackRate: fakeParam(),
                    connect: vi.fn(),
                    disconnect: vi.fn(),
                    start: vi.fn(),
                    stop: vi.fn(),
                    onended: null as null | (() => void),
                    buffer: null,
                };
                sources.push(source);
                return source;
            }),
            createGain: vi.fn(() => {
                const gain = {
                    gain: { ...fakeParam(), setValueCurveAtTime: vi.fn() },
                    connect: vi.fn(),
                    disconnect: vi.fn(),
                };
                gains.push(gain);
                return gain;
            }),
        } as unknown as AudioContext;
        return { ctx, sources, gains };
    }
    const organ: SampleZone = { rootMidi: 60, buffer: fakeBuffer(4) };
    const lastStop = (source: any) => source.stop.mock.calls.at(-1)[0];

    it('plays the recording again from past its attack, each pass overlapping the last', () => {
        const { ctx, sources } = makeLoopCtx();
        playSampledNote(ctx, organ, {} as AudioNode, 60, 1, { duration: 12, sustain: true });
        // One pass is the recording less its fade (3.65 s); a later one also skips the first
        // half second, and each starts a quarter second before the one before it ends.
        const starts = sources.map((source) => source.start.mock.calls[0]);
        expect(starts[0]).toEqual([1]);
        expect(starts.slice(1)).toEqual([4.4, 7.3, 10.2].map((at) => [expect.closeTo(at, 6), 0.5]));
        // The last pass stops with the note (hold + release), the others at their own ends.
        expect(lastStop(sources[0])).toBeCloseTo(4.66, 6);
        expect(lastStop(sources[3])).toBeCloseTo(13.09, 6);
    });

    it('leaves a note its recording covers as one source', () => {
        const { ctx, sources, gains } = makeLoopCtx();
        playSampledNote(ctx, organ, {} as AudioNode, 60, 1, { duration: 2, sustain: true });
        expect(sources).toHaveLength(1);
        expect(gains).toHaveLength(1);
    });

    it('does not loop a pack that does not sustain', () => {
        const { ctx, sources } = makeLoopCtx();
        playSampledNote(ctx, organ, {} as AudioNode, 60, 1, { duration: 12 });
        expect(sources).toHaveLength(1);
    });

    it('a release stops every pass, and the voice ends when the last one has', () => {
        const { ctx, sources } = makeLoopCtx();
        const voice = playSampledNote(ctx, organ, {} as AudioNode, 60, 1, {
            duration: 12,
            sustain: true,
        });
        voice?.release(6, 0.01);
        for (const source of sources) {
            expect(lastStop(source)).toBeLessThan(6.1);
        }
        sources.slice(0, -1).forEach((source) => {
            source.onended();
        });
        expect(sources[0].disconnect).not.toHaveBeenCalled();
        sources.at(-1).onended();
        expect(sources[0].disconnect).toHaveBeenCalled();
    });
});
