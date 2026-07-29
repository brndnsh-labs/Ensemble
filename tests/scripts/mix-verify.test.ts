import { describe, expect, it } from 'vitest';
import { encodeWav } from '../../public/engine/wav-encoder.js';
import { decodeWav, parseMixVerifyArgs } from '../../scripts/mix-verify.js';

describe('mix-verify — CLI parsing', () => {
    it('reads every flag, and defaults the rest', () => {
        const options = parseMixVerifyArgs([
            '--scene=funk-pocket',
            '--stems=bass,drums',
            '--loops=3',
            '--seed=ALPHA',
            '--keep=tmp/ears',
            '--no-build',
        ]);
        expect(options).toEqual({
            scene: 'funk-pocket',
            stems: ['bass', 'drums'],
            loops: 3,
            seed: 'ALPHA',
            keep: 'tmp/ears',
            noBuild: true,
        });

        const defaults = parseMixVerifyArgs([]);
        expect(defaults.scene).toBeNull();
        expect(defaults.stems).toEqual([]);
        expect(defaults.loops).toBe(1);
        expect(defaults.noBuild).toBe(false);
    });

    it('rejects an unknown flag rather than ignoring it', () => {
        // A silently-dropped flag would produce a render nobody asked for, reported
        // as though it were the requested one.
        expect(() => parseMixVerifyArgs(['--wat=1'])).toThrow(/Unknown flag/);
    });

    it('falls back to one loop on a nonsense --loops value', () => {
        expect(parseMixVerifyArgs(['--loops=0']).loops).toBe(1);
        expect(parseMixVerifyArgs(['--loops=abc']).loops).toBe(1);
    });
});

describe('mix-verify — WAV decoding', () => {
    const SAMPLE_RATE = 44100;

    function ramp(length: number, scale: number): Float32Array {
        const out = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            out[i] = Math.sin((2 * Math.PI * i) / 64) * scale;
        }
        return out;
    }

    it('round-trips what encodeWav writes, on both channel counts', () => {
        // The decoder's whole job is reading files this repo's own encoder produced;
        // a shifted read would move every sample and fake a timing defect.
        for (const channelCount of [1, 2]) {
            const channels = Array.from({ length: channelCount }, (_, index) =>
                ramp(2048, 0.8 - index * 0.3),
            );
            const decoded = decodeWav(Buffer.from(encodeWav(channels, SAMPLE_RATE)));

            expect(decoded.sampleRate).toBe(SAMPLE_RATE);
            expect(decoded.channels).toHaveLength(channelCount);
            expect(decoded.channels[0]).toHaveLength(2048);
            for (let c = 0; c < channelCount; c++) {
                for (const i of [0, 17, 1023, 2047]) {
                    // 16-bit quantization: within one LSB of the original float.
                    expect(decoded.channels[c][i]).toBeCloseTo(channels[c][i], 3);
                }
            }
        }
    });

    it('keeps the channels distinct rather than interleaving them wrongly', () => {
        const left = ramp(512, 0.9);
        const right = new Float32Array(512); // silent
        const decoded = decodeWav(Buffer.from(encodeWav([left, right], SAMPLE_RATE)));
        expect(Math.max(...decoded.channels[0])).toBeGreaterThan(0.5);
        expect(Math.max(...decoded.channels[1])).toBeCloseTo(0, 3);
    });

    it('rejects a non-RIFF payload instead of decoding garbage', () => {
        expect(() => decodeWav(Buffer.from('not audio at all, really'))).toThrow(/RIFF/);
    });
});
