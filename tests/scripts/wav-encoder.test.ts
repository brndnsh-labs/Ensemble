import { describe, expect, it } from 'vitest';
import { encodeWav } from '../../public/engine/wav-encoder.js';

function readAscii(view: DataView, offset: number, length: number): string {
    let out = '';
    for (let i = 0; i < length; i++) {
        out += String.fromCharCode(view.getUint8(offset + i));
    }
    return out;
}

describe('encodeWav', () => {
    it('writes a valid mono 16-bit PCM header', () => {
        const samples = new Float32Array([0, 0.5, -0.5, 1]);
        const buffer = encodeWav([samples], 48000);
        const view = new DataView(buffer);

        expect(readAscii(view, 0, 4)).toBe('RIFF');
        expect(readAscii(view, 8, 4)).toBe('WAVE');
        expect(readAscii(view, 12, 4)).toBe('fmt ');
        expect(view.getUint16(20, true)).toBe(1); // PCM
        expect(view.getUint16(22, true)).toBe(1); // mono
        expect(view.getUint32(24, true)).toBe(48000);
        expect(view.getUint16(34, true)).toBe(16); // bit depth
        expect(readAscii(view, 36, 4)).toBe('data');
        expect(view.getUint32(40, true)).toBe(samples.length * 2);
        expect(buffer.byteLength).toBe(44 + samples.length * 2);

        // One symmetric 0x8000 scale, matching what every decoder divides by:
        // 0.5 → 16384, -0.5 → -16384. Full scale is the one asymmetric case,
        // clamped from 32768 down to 32767 rather than wrapping to -32768.
        expect(view.getInt16(44 + 2, true)).toBe(16384);
        expect(view.getInt16(44 + 4, true)).toBe(-16384);
        expect(view.getInt16(44 + 6, true)).toBe(32767);
    });

    it('interleaves stereo channels and reports byte rate / block align', () => {
        const left = new Float32Array([0.25, 0]);
        const right = new Float32Array([0, -0.25]);
        const buffer = encodeWav([left, right], 44100);
        const view = new DataView(buffer);

        expect(view.getUint16(22, true)).toBe(2); // channels
        expect(view.getUint16(32, true)).toBe(4); // blockAlign = 2 ch * 2 bytes
        expect(view.getUint32(28, true)).toBe(44100 * 4); // byteRate

        // Interleaving: L0, R0, L1, R1. ±0.25 * 32768 = ±8192 exactly.
        expect(view.getInt16(44 + 0, true)).toBe(8192);
        expect(view.getInt16(44 + 2, true)).toBe(0);
        expect(view.getInt16(44 + 4, true)).toBe(0);
        expect(view.getInt16(44 + 6, true)).toBe(-8192);
    });

    it('clamps out-of-range samples', () => {
        const samples = new Float32Array([1.5, -1.5]);
        const buffer = encodeWav([samples], 22050);
        const view = new DataView(buffer);

        expect(view.getInt16(44, true)).toBe(0x7fff); // clamped to +1
        expect(view.getInt16(46, true)).toBe(-0x8000); // clamped to -1
    });

    it('round-trips every one of the 65 536 int16 values exactly', () => {
        // The contract any re-encoding tool rests on (`scripts/plant-defects.ts`
        // decodes a render, edits one region, and writes the whole file back): if
        // `int16 → float → int16` is not the identity, EVERY sample outside the
        // edited region moves too, and the manifest's claimed range is a fiction.
        //
        // Bracketing the whole domain rather than sampling it, because the two
        // failure modes this replaced were value-dependent and would have survived
        // a spot check: truncation lost an LSB on every positive value, and
        // rounding against an 0x7fff scale still lost one on every |i| > 16384.
        const values = new Float32Array(65536);
        for (let i = -32768; i <= 32767; i++) {
            values[i + 32768] = i / 0x8000;
        }
        const view = new DataView(encodeWav([values], 44100));
        const mismatches: string[] = [];
        for (let i = -32768; i <= 32767; i++) {
            const decoded = view.getInt16(44 + (i + 32768) * 2, true);
            if (decoded !== i) {
                mismatches.push(`${i}→${decoded}`);
            }
        }
        expect(mismatches).toEqual([]);
    });

    it('rejects mismatched channel lengths', () => {
        const left = new Float32Array([0, 0]);
        const right = new Float32Array([0]);
        expect(() => encodeWav([left, right], 48000)).toThrow(/same length/);
    });

    it('rejects empty channel list', () => {
        expect(() => encodeWav([], 48000)).toThrow(/at least one channel/);
    });
});
