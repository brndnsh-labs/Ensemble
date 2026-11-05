// @ts-nocheck
/**
 * The built-in lead's vibrato fades in (#1999). Its depth was an exponential ramp from 0, which
 * Web Audio holds AT 0 for the whole ramp and then jumps to its end value: the vibrato snapped
 * on about half a second into a long note. The depth now starts at 0 and climbs a straight line
 * after the attack delay, as the amp and cutoff taps beside it always did.
 */
import { describe, expect, it, vi } from 'vitest';
import { playSoloNote } from '../../../core/engine/synth-soloist.js';

const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
});

function makeAudio() {
    const gains = [];
    const oscillators = [];
    const node = () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
        type: '',
        gain: param(),
        frequency: param(),
        detune: param(),
        Q: param(),
        pan: param(),
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
    return { audio, gains, oscillators };
}

/** The pitch-vibrato depth gain: the one gain wired into the oscillators' frequency. */
function pitchDepth(gains, oscillators) {
    const frequencies = new Set(oscillators.map((osc) => osc.frequency));
    const found = gains.filter((g) =>
        g.connect.mock.calls.some(([target]) => frequencies.has(target)),
    );
    expect(found).toHaveLength(1);
    return found[0].gain;
}

describe('the synth lead’s vibrato depth fades in from 0 (#1999)', () => {
    it.each([
        ['a long note', 1.2, false],
        ['a short note', 0.3, false],
        ['a note asked for vibrato', 0.3, true],
    ])('%s: depth held at 0, then a linear ramp up', (_name, duration, vibrato) => {
        const { audio, gains, oscillators } = makeAudio();
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
        const start = 2;
        playSoloNote(state, 440, start, duration, 0.8, 0, false, vibrato, 3);

        const depth = pitchDepth(gains, oscillators);
        // No exponential ramp: from 0 it would hold 0 and jump at its end.
        expect(depth.exponentialRampToValueAtTime).not.toHaveBeenCalled();
        // 0 at the note's start, still 0 at the end of the attack delay...
        const zeros = depth.setValueAtTime.mock.calls.filter(([value]) => value === 0);
        expect(zeros.map(([, at]) => at)[0]).toBe(start);
        const rampFrom = Math.max(...zeros.map(([, at]) => at));
        expect(rampFrom).toBeGreaterThan(start);
        // ...then one straight line to the full depth, over a stretch the ear hears as a fade.
        expect(depth.linearRampToValueAtTime).toHaveBeenCalledTimes(1);
        const [full, rampEnd] = depth.linearRampToValueAtTime.mock.calls[0];
        expect(full).toBeGreaterThan(0);
        expect(rampEnd - rampFrom).toBeGreaterThanOrEqual(0.15);
    });
});
