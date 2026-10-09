import { expect, test } from 'vitest';
import { playSampledNote } from '../../public/engine/sample-voice.js';

/**
 * A sustaining pack's note outlasts its recording (#1532).
 *
 * The band holds an organ chord for bars; the organ's recordings are four seconds, and a note
 * played one buffer once, so the rest of the hold was silence. A sustaining note now plays the
 * recording on, crossfaded into itself. This renders a ten-second note from a four-second
 * recording in a real `OfflineAudioContext` and holds it to a steady level with no click at a
 * join. The recording is synthetic but organ-like where it matters: steady, with partials that
 * are not locked to the fundamental (so no stretch of it lines up with another), a key click,
 * and a fade at its end.
 */
const SAMPLE_RATE = 48000;

function organRecording(audio: BaseAudioContext): AudioBuffer {
    const seconds = 4;
    const buffer = audio.createBuffer(1, SAMPLE_RATE * seconds, SAMPLE_RATE);
    const data = buffer.getChannelData(0);
    // Tonewheel-like: near the harmonics of 220 Hz, each a few cents off its own way.
    const partials = [220, 440.9, 659.1, 881.3, 1321.7, 1759.2];
    for (let i = 0; i < data.length; i++) {
        const t = i / SAMPLE_RATE;
        let sample = 0;
        partials.forEach((hz, n) => {
            sample += Math.sin(2 * Math.PI * hz * t + n) / (n + 2);
        });
        const click = t < 0.01 ? 1 + 2 * (1 - t / 0.01) : 1;
        const fade = t > seconds - 0.3 ? (seconds - t) / 0.3 : 1;
        data[i] = 0.3 * sample * click * fade;
    }
    return buffer;
}

async function render(duration: number, sustain: boolean): Promise<Float32Array> {
    const audio = new OfflineAudioContext(1, SAMPLE_RATE * 11, SAMPLE_RATE);
    const zone = { rootMidi: 57, buffer: organRecording(audio) };
    playSampledNote(audio as unknown as AudioContext, zone, audio.destination, 57, 0.1, {
        velocity: 1,
        duration,
        sustain,
    });
    return (await audio.startRendering()).getChannelData(0);
}

/** RMS in 100 ms windows from `from` to `to` seconds. */
function levels(data: Float32Array, from: number, to: number): number[] {
    const size = SAMPLE_RATE / 10;
    const out: number[] = [];
    for (let at = from * SAMPLE_RATE; at + size <= to * SAMPLE_RATE; at += size) {
        let sum = 0;
        for (let i = at; i < at + size; i++) {
            sum += data[i] * data[i];
        }
        out.push(Math.sqrt(sum / size));
    }
    return out;
}

/** The largest step between neighbouring samples from `from` to `to` seconds. */
function steepest(data: Float32Array, from: number, to: number): number {
    let max = 0;
    for (let i = Math.floor(from * SAMPLE_RATE) + 1; i < to * SAMPLE_RATE; i++) {
        max = Math.max(max, Math.abs(data[i] - data[i - 1]));
    }
    return max;
}

const dB = (ratio: number) => 20 * Math.log10(ratio);

test('a ten-second organ note sounds for ten seconds, at a steady level', async () => {
    const held = await render(10, true);
    const steady = levels(held, 0.5, 3)[0];
    for (const level of levels(held, 0.5, 10)) {
        // Two uncorrelated passes at equal power: the join can beat a little, never drop out.
        expect(Math.abs(dB(level / steady))).toBeLessThan(2);
    }
    // No click at a join: nothing after the first pass is steeper than the tone itself.
    expect(steepest(held, 3, 10)).toBeLessThanOrEqual(steepest(held, 0.5, 3) * 1.1);
});

test('without it the note dies with its recording', async () => {
    const struck = await render(10, false);
    expect(Math.max(...levels(struck, 4.5, 10))).toBeLessThan(0.001);
});

test('a note its recording covers is the same with or without it', async () => {
    const [sustained, plain] = [await render(2, true), await render(2, false)];
    expect(Array.from(sustained.subarray(0, SAMPLE_RATE * 3))).toEqual(
        Array.from(plain.subarray(0, SAMPLE_RATE * 3)),
    );
});
