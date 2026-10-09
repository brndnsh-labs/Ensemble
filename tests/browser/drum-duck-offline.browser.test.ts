import { expect, test } from 'vitest';
import { playDrumSound } from '../../public/engine/synth-drums.js';
import type { EnsembleState } from '../../public/types.js';

/**
 * The drum density duck in an offline render (#1531).
 *
 * An export schedules every hit before its `OfflineAudioContext`'s clock moves. Counted on that
 * clock the duck never recovered: the kit played bar 1 at full level, sank over the next three
 * and stayed 2.5 dB down, and the count it left behind opened the next render at the floor.
 * This renders the real synth kit offline and holds the kick's level steady across the render,
 * and across two renders.
 */
const SAMPLE_RATE = 48000;
const BARS = 8;
const BEAT = 0.5; // 120 bpm
const BAR = 4 * BEAT;

/** A rock bar's worth of density: kick, snare and eighth-note hats, 12 hits a bar. */
async function kickLevels(): Promise<number[]> {
    const audio = new OfflineAudioContext(1, SAMPLE_RATE * (BARS * BAR + 1), SAMPLE_RATE);
    const drums = audio.createGain();
    drums.connect(audio.destination);
    const noise = audio.createBuffer(1, SAMPLE_RATE, SAMPLE_RATE);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.random() * 2 - 1;
    }
    const state = {
        playback: { audio, audioGraph: { drums: { gain: drums }, bass: {} }, drumsGain: drums },
        groove: {
            humanize: 0,
            voice: 'synth',
            audioBuffers: { noise },
            lastHatGain: null,
            lastRideGain: null,
            lastCrashGain: null,
        },
    } as unknown as EnsembleState;

    const start = 0.1;
    for (let bar = 0; bar < BARS; bar++) {
        const at = start + bar * BAR;
        // Beat 1 is the kick alone, so its window measures nothing else.
        playDrumSound(state, 'Kick', at, 1);
        for (let eighth = 1; eighth < 8; eighth++) {
            playDrumSound(state, 'HiHat', at + eighth * (BEAT / 2), 0.7);
        }
        playDrumSound(state, 'Snare', at + BEAT, 1);
        playDrumSound(state, 'Kick', at + 2 * BEAT, 1);
        playDrumSound(state, 'Snare', at + 3 * BEAT, 1);
        playDrumSound(state, 'Kick', at + 3.5 * BEAT, 0.9);
    }

    const data = (await audio.startRendering()).getChannelData(0);
    // RMS of the 150 ms after each bar's first kick.
    return Array.from({ length: BARS }, (_, bar) => {
        const from = Math.floor((start + bar * BAR) * SAMPLE_RATE);
        const length = Math.floor(0.15 * SAMPLE_RATE);
        let sum = 0;
        for (let i = from; i < from + length; i++) {
            sum += data[i] * data[i];
        }
        return Math.sqrt(sum / length);
    });
}

const dB = (ratio: number) => 20 * Math.log10(ratio);

// The first render this file makes, shared: the second test needs one made before any other.
let firstRender: Promise<number[]> | undefined;
const first = () => {
    firstRender ??= kickLevels();
    return firstRender;
};

test('an offline render plays its last bar as loud as its first', async () => {
    const levels = await first();
    expect(levels[0]).toBeGreaterThan(0.01);
    // The kick's beater and click are noise, so two strokes differ a little; the bug was 2.5 dB.
    for (const level of levels) {
        expect(Math.abs(dB(level / levels[0]))).toBeLessThan(0.75);
    }
});

test('a later render starts as loud as the first did', async () => {
    const [before] = await first();
    const [after] = await kickLevels();
    expect(Math.abs(dB(after / before))).toBeLessThan(0.75);
});
