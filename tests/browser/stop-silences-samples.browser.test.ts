import { expect, test } from 'vitest';
import { playSampledNote, releaseSampledVoices } from '../../public/engine/sample-voice.js';

/**
 * Stop, heard (#1530): a real `OfflineAudioContext` renders a held sampled note, the render is
 * paused a second in — where Stop is pressed — and the lane is released. The note must be
 * silent a few hundredths of a second later, and a note the host had already scheduled ahead
 * must never sound.
 */
const SAMPLE_RATE = 48000;

function rms(data: Float32Array, from: number, to: number): number {
    let sum = 0;
    const start = Math.floor(from * SAMPLE_RATE);
    const end = Math.floor(to * SAMPLE_RATE);
    for (let i = start; i < end; i++) {
        sum += data[i] * data[i];
    }
    return Math.sqrt(sum / (end - start));
}

async function render(stopAt: number | null): Promise<Float32Array> {
    const audio = new OfflineAudioContext(1, SAMPLE_RATE * 3, SAMPLE_RATE);
    // An organ-like sample: four seconds of a steady 220 Hz tone.
    const buffer = audio.createBuffer(1, SAMPLE_RATE * 4, SAMPLE_RATE);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);
    }
    const zone = { rootMidi: 57, buffer };
    const play = (time: number) =>
        playSampledNote(audio as unknown as AudioContext, zone, audio.destination, 57, time, {
            velocity: 0.5,
            duration: 2.5,
            lane: 'chords',
        });
    play(0.1);
    // Sent to the voices by the host's lookahead before the Stop, due just after it.
    play(1.1);
    if (stopAt !== null) {
        void audio.suspend(stopAt).then(() => {
            releaseSampledVoices(audio, 'chords', audio.currentTime);
            void audio.resume();
        });
    }
    return (await audio.startRendering()).getChannelData(0);
}

test('a held sampled note is silent just after Stop, and one scheduled ahead never sounds', async () => {
    const stopped = await render(1);
    expect(rms(stopped, 0.5, 0.95)).toBeGreaterThan(0.1);
    expect(rms(stopped, 1.08, 3)).toBeLessThan(0.001);

    // Left alone, both notes are heard: the silence above is the Stop's doing.
    const ringing = await render(null);
    expect(rms(ringing, 1.2, 2.5)).toBeGreaterThan(0.1);
});
