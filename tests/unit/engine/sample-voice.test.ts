import { describe, expect, it, vi } from 'vitest';
import {
    pickZone,
    pitchRatio,
    playSampledNote,
    type SampleZone,
} from '../../../public/engine/sample-voice.js';

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
    };
}

function fakeBuffer(): AudioBuffer {
    return {} as AudioBuffer;
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
    const ctx = {
        currentTime: 5,
        createBufferSource: vi.fn(() => source),
        createGain: vi.fn(() => gain),
    } as unknown as AudioContext;
    return { ctx, source, gain };
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
            release: 0.1,
            velocity: 0.8,
            duration: 0.5,
        });
        const c = gain.gain.calls;
        expect(c[0]).toEqual({ op: 'set', value: 0, time: 2.0 }); // start silent
        expect(c[1]).toEqual({ op: 'ramp', value: 0.8, time: 2.01 }); // attack to peak
        expect(c[2]).toEqual({ op: 'set', value: 0.8, time: 2.5 }); // hold-plateau anchor
        expect(c[3]).toEqual({ op: 'ramp', value: 0, time: 2.0 + 0.5 + 0.1 }); // release to 0
        expect(source.stop).toHaveBeenCalledWith(2.0 + 0.5 + 0.1 + 0.01);
    });

    it('keeps a monotonic envelope when duration < attack (no ramp inversion)', () => {
        const { ctx, source, gain } = makeCtx();
        // duration 0 < attack 0.01 → releaseStart floors to the attack endpoint.
        playSampledNote(ctx, zone(60), {} as AudioNode, 0, 0, {
            attack: 0.01,
            release: 0.1,
            duration: 0,
        });
        const times = gain.gain.calls.map((x: any) => x.time);
        // releaseStart = max(0+0.01, 0+0) = 0.01, so: 0, 0.01, 0.01, 0.11
        expect(times).toEqual([0, 0.01, 0.01, 0.11]);
        for (let i = 1; i < times.length; i++) {
            expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]); // never goes backwards
        }
        expect(source.stop).toHaveBeenCalledWith(0.01 + 0.1 + 0.01);
    });

    it('disconnects its node chain on end, then fires onEnded (no per-note leak)', () => {
        const { ctx, source, gain } = makeCtx();
        const onEnded = vi.fn();
        playSampledNote(ctx, zone(60), {} as AudioNode, 60, 0, { onEnded });
        // The note schedules a self-cleanup handler rather than leaking nodes.
        expect(typeof source.onended).toBe('function');
        source.onended(); // simulate playback finishing
        expect(source.disconnect).toHaveBeenCalled();
        expect(gain.disconnect).toHaveBeenCalled();
        expect(onEnded).toHaveBeenCalledTimes(1);
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

    it('bails and fires onEnded on a missing buffer/destination (graceful fallback)', () => {
        const { ctx } = makeCtx();
        const onEnded = vi.fn();
        playSampledNote(
            ctx,
            { rootMidi: 60, buffer: null as unknown as AudioBuffer },
            {} as AudioNode,
            60,
            0,
            {
                onEnded,
            },
        );
        expect(onEnded).toHaveBeenCalledTimes(1);
        expect(ctx.createBufferSource).not.toHaveBeenCalled();
    });
});
