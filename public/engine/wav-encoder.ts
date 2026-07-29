/**
 * Minimal 16-bit PCM WAV encoder. Pure: returns an ArrayBuffer the caller
 * writes to disk (or ships across a network, posts to an API, etc.). Works
 * in Node and in the browser.
 *
 * Accepts one or more channels of Float32 samples in [-1, 1]; out-of-range
 * values are clamped. Output is interleaved (standard WAV layout).
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
    if (channels.length === 0) {
        throw new Error('encodeWav: at least one channel is required');
    }
    const numChannels = channels.length;
    const numSamples = channels[0].length;
    for (const channel of channels) {
        if (channel.length !== numSamples) {
            throw new Error('encodeWav: all channels must have the same length');
        }
    }

    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(view, 8, 'WAVE');

    // fmt sub-chunk (PCM)
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    writeAscii(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Float → int16 with a ROUND and a symmetric 0x8000 scale, clamped at the top.
    //
    // Both halves of that are load-bearing, and the obvious-looking alternatives are
    // each lossy in a way that is invisible until something re-reads the file.
    // `DataView.setInt16` truncates toward zero, so the original `clamped * 0x7fff`
    // wrote int16 1000 back as 999 — every strictly-positive sample losing one LSB
    // per round trip through a decoder that divides by 0x8000. Rounding alone does
    // not fix it either: `i/0x8000 * 0x7fff` is `i - i/0x8000`, which still rounds
    // down for every |i| > 16384, so 16 383 of the 65 536 values stay wrong. Scaling
    // by 0x8000 to match the decoder makes `int16 → float → int16` the exact
    // identity across the whole range (`tests/scripts/wav-encoder.test.ts` asserts
    // all 65 536 of them), which is what lets a tool re-encode a decoded file and
    // claim it changed only what it says it changed (`scripts/plant-defects.ts`).
    // The clamp is then what keeps float 1.0 from wrapping to -32768.
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const raw = channels[ch][i];
            const clamped = raw < -1 ? -1 : raw > 1 ? 1 : raw;
            const quantized = Math.round(clamped * 0x8000);
            view.setInt16(offset, quantized > 0x7fff ? 0x7fff : quantized, true);
            offset += 2;
        }
    }

    return buffer;
}

function writeAscii(view: DataView, offset: number, value: string): void {
    for (let i = 0; i < value.length; i++) {
        view.setUint8(offset + i, value.charCodeAt(i));
    }
}
