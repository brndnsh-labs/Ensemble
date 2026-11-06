// Pure audio-analysis primitives shared by mix-report (in-page) and mix-analyze
// (Node-side). Operate on Float32Array sample data, no Web Audio / DOM deps.
//
// TODO: scripts/mix-report.ts still duplicates these inside its page.evaluate()
// closure (see ~line 600 onwards). Consolidate by injecting this module's source
// into the page via addInitScript when a focused refactor of mix-report.ts is
// scheduled. The signatures here match the in-page versions on purpose.

export interface StereoMetrics {
    correlation: number | null;
    sideRatio: number | null;
}

export interface SpectralProbes {
    sub: number;
    low: number;
    lowMid: number;
    mid: number;
    presence: number;
    // Epic 7 S3a: dual air probes. `air5k` was added 2026-05-25 alongside
    // the legacy 7.2 kHz probe after the 8-reference calibration pass
    // showed Daft Punk "Get Lucky" — an audibly hat-and-shaker-aggressive
    // track — registering only 0.5% at the 7.2 kHz probe (lower than our
    // engine at 1.3%). The hypothesis was that the probe was sitting above
    // where modern hi-hat / shaker energy actually lives. See
    // `tmp/overnight-s3a-probe.md` for the re-measurement.
    air5k: number;
    air: number;
    centroid: number;
}

export interface TransientMetrics {
    maxDelta: number;
    spikeCount: number;
    spikeRate: number;
    threshold: number;
}

export type ArcLabel = 'flat' | 'front-loaded' | 'building' | 'arc' | 'dip' | 'irregular';

export function toMonoFromChannels(channels: Float32Array[]): Float32Array {
    const channelCount = channels.length;
    if (channelCount === 0) {
        return new Float32Array(0);
    }
    const length = channels[0].length;
    const mono = new Float32Array(length);
    for (let c = 0; c < channelCount; c++) {
        const data = channels[c];
        for (let i = 0; i < length; i++) {
            mono[i] += data[i] / channelCount;
        }
    }
    return mono;
}

export function computeStereoMetrics(channels: Float32Array[]): StereoMetrics {
    if (channels.length < 2) {
        return { correlation: null, sideRatio: null };
    }
    const left = channels[0];
    const right = channels[1];
    const length = Math.min(left.length, right.length);

    let sumLR = 0;
    let sumLL = 0;
    let sumRR = 0;
    let midEnergy = 0;
    let sideEnergy = 0;
    for (let i = 0; i < length; i++) {
        const l = left[i];
        const r = right[i];
        sumLR += l * r;
        sumLL += l * l;
        sumRR += r * r;
        const mid = (l + r) * 0.5;
        const side = (l - r) * 0.5;
        midEnergy += mid * mid;
        sideEnergy += side * side;
    }

    const denom = Math.sqrt(sumLL * sumRR);
    const correlation = denom > 1e-12 ? sumLR / denom : 1;
    const totalEnergy = midEnergy + sideEnergy;
    const sideRatio = totalEnergy > 1e-12 ? sideEnergy / totalEnergy : 0;
    return { correlation, sideRatio };
}

export function computePeak(samples: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const value = Math.abs(samples[i]);
        if (value > peak) {
            peak = value;
        }
    }
    return peak;
}

export function computeRms(samples: Float32Array): number {
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
        sumSquares += samples[i] * samples[i];
    }
    return Math.sqrt(sumSquares / Math.max(1, samples.length));
}

export function toDb(value: number): number {
    if (!value || value <= 0) {
        return -120;
    }
    return 20 * Math.log10(value);
}

export function activeBounds(
    samples: Float32Array,
    threshold = 1e-4,
): { start: number; end: number } {
    let start = 0;
    let end = samples.length - 1;
    while (start < samples.length && Math.abs(samples[start]) < threshold) {
        start++;
    }
    while (end > start && Math.abs(samples[end]) < threshold) {
        end--;
    }
    return { start, end: Math.max(start + 1, end) };
}

export function computePerLoopRmsDb(
    monoSamples: Float32Array,
    sampleRate: number,
    leadInSeconds: number,
    loopSeconds: number,
    loopCount: number,
): number[] | null {
    if (loopCount <= 1 || loopSeconds <= 0) {
        return null;
    }
    const out: number[] = [];
    const samplesPerLoop = Math.floor(loopSeconds * sampleRate);
    const startOffset = Math.floor(leadInSeconds * sampleRate);
    for (let i = 0; i < loopCount; i++) {
        const start = startOffset + i * samplesPerLoop;
        const end = Math.min(monoSamples.length, start + samplesPerLoop);
        if (end <= start) {
            out.push(-Infinity);
            continue;
        }
        let sumSquares = 0;
        for (let j = start; j < end; j++) {
            sumSquares += monoSamples[j] * monoSamples[j];
        }
        const rms = Math.sqrt(sumSquares / (end - start));
        out.push(rms > 0 ? 20 * Math.log10(rms) : -Infinity);
    }
    return out;
}

export function classifyArc(loopRmsDb: number[] | null): ArcLabel | null {
    if (!loopRmsDb || loopRmsDb.length < 2) {
        return null;
    }
    const finite = loopRmsDb.filter((v) => Number.isFinite(v));
    if (finite.length < 2) {
        return null;
    }
    const max = Math.max(...finite);
    const min = Math.min(...finite);
    if (max - min < 1.5) {
        return 'flat';
    }
    const peakIndex = loopRmsDb.indexOf(max);
    const troughIndex = loopRmsDb.indexOf(min);
    const last = loopRmsDb.length - 1;
    if (peakIndex === 0 && loopRmsDb[last] <= loopRmsDb[0] - 1.5) {
        return 'front-loaded';
    }
    if (peakIndex === last && loopRmsDb[0] <= loopRmsDb[last] - 1.5) {
        return 'building';
    }
    if (peakIndex > 0 && peakIndex < last) {
        return 'arc';
    }
    if (troughIndex > 0 && troughIndex < last) {
        return 'dip';
    }
    return 'irregular';
}

function goertzelMagnitude(samples: Float32Array, sampleRate: number, freq: number): number {
    const omega = (2 * Math.PI * freq) / sampleRate;
    const coeff = 2 * Math.cos(omega);
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < samples.length; i++) {
        s0 = samples[i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }
    return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2);
}

const SPECTRAL_BAND_CENTERS = {
    sub: 60,
    low: 140,
    lowMid: 380,
    mid: 1000,
    presence: 2800,
    // Epic 7 S3a: dual air probes. 5 kHz was added to test the hypothesis
    // that modern hi-hat / shaker content lives below the 7.2 kHz original.
    air5k: 5000,
    air: 7200,
} as const;

/**
 * Where the spectral probes start and stop listening: the first and last sample above −60 dBFS.
 * The general `activeBounds` floor (−80 dBFS) sits inside a render's master-chain settling, a
 * few LSB before the first note that differ by engine and build, so it cannot anchor a
 * measurement meant to compare renders (#1556).
 */
export const SPECTRAL_ACTIVITY_THRESHOLD = 1e-3;
const SPECTRAL_WINDOW = 4096;

/**
 * Each band's share of the summed probe magnitudes, averaged over every consecutive
 * 4096-sample window of the active region. Every window, not a sample of them: a handful of
 * windows lands on whichever notes sit under them, so the shares moved with the region's first
 * sample (bass sub/low read 33/50 or 57/24 for the same music, #1556).
 */
export function computeSpectralProbes(samples: Float32Array, sampleRate: number): SpectralProbes {
    const bounds = activeBounds(samples, SPECTRAL_ACTIVITY_THRESHOLD);
    const active = samples.subarray(bounds.start, bounds.end);
    const windowSize = Math.min(SPECTRAL_WINDOW, active.length);
    if (windowSize < 256) {
        return {
            sub: 0,
            low: 0,
            lowMid: 0,
            mid: 0,
            presence: 0,
            air5k: 0,
            air: 0,
            centroid: 0,
        };
    }

    const windows: Float32Array[] = [];
    for (let start = 0; start + windowSize <= active.length; start += windowSize) {
        windows.push(active.subarray(start, start + windowSize));
    }

    const totals: Record<string, number> = {
        sub: 0,
        low: 0,
        lowMid: 0,
        mid: 0,
        presence: 0,
        air5k: 0,
        air: 0,
    };

    for (const windowSamples of windows) {
        for (const [band, freq] of Object.entries(SPECTRAL_BAND_CENTERS)) {
            totals[band] += goertzelMagnitude(windowSamples, sampleRate, freq);
        }
    }

    const totalEnergy = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
    let centroidNumerator = 0;
    const result: Record<string, number> = {};
    for (const [band, freq] of Object.entries(SPECTRAL_BAND_CENTERS)) {
        result[band] = totals[band] / totalEnergy;
        centroidNumerator += result[band] * freq;
    }
    result.centroid = centroidNumerator;
    return result as unknown as SpectralProbes;
}

export function computeTransientMetrics(
    samples: Float32Array,
    sampleRate: number,
): TransientMetrics {
    const bounds = activeBounds(samples);
    const active = samples.slice(bounds.start, bounds.end);
    if (active.length < 4) {
        return { maxDelta: 0, spikeCount: 0, spikeRate: 0, threshold: 0 };
    }

    const rms = computeRms(active);
    const peak = computePeak(active);
    const threshold = Math.max(0.02, peak * 0.18, rms * 5);
    let maxDelta = 0;
    let spikeCount = 0;
    let lastSpikeIndex = -64;

    for (let i = 1; i < active.length; i++) {
        const delta = Math.abs(active[i] - active[i - 1]);
        if (delta > maxDelta) {
            maxDelta = delta;
        }
        if (delta >= threshold && i - lastSpikeIndex > 64) {
            spikeCount++;
            lastSpikeIndex = i;
        }
    }

    return {
        maxDelta,
        spikeCount,
        spikeRate: spikeCount / Math.max(0.001, active.length / sampleRate),
        threshold,
    };
}

// --- Loudness (ITU-R BS.1770-4 / EBU R128) -------------------------------------------------
//
// The master limiter (#2002) is held to these: integrated loudness in LUFS and true peak in
// dBTP. `npm run mix:report` prints both per stem; an independent check is ffmpeg's
// `ebur128=peak=true` filter on a written WAV, which agrees with these to 0.1 LU / 0.1 dB.

/** Biquad coefficients, normalised so a0 = 1. */
interface Biquad {
    b0: number;
    b1: number;
    b2: number;
    a1: number;
    a2: number;
}

/**
 * The K-weighting pre-filter's two stages at any sample rate: the head shelf and the RLB
 * high-pass, derived from their analog prototypes the way libebur128 does, so 44.1 kHz renders
 * are weighted as exactly as the standard's 48 kHz table.
 */
function kWeighting(sampleRate: number): [Biquad, Biquad] {
    let f0 = 1681.974450955533;
    const gainDb = 3.999843853973347;
    let q = 0.7071752369554196;
    let k = Math.tan((Math.PI * f0) / sampleRate);
    const vh = 10 ** (gainDb / 20);
    const vb = vh ** 0.4996667741545416;
    let a0 = 1 + k / q + k * k;
    const shelf: Biquad = {
        b0: (vh + (vb * k) / q + k * k) / a0,
        b1: (2 * (k * k - vh)) / a0,
        b2: (vh - (vb * k) / q + k * k) / a0,
        a1: (2 * (k * k - 1)) / a0,
        a2: (1 - k / q + k * k) / a0,
    };
    f0 = 38.13547087602444;
    q = 0.5003270373238773;
    k = Math.tan((Math.PI * f0) / sampleRate);
    a0 = 1 + k / q + k * k;
    const highpass: Biquad = {
        b0: 1,
        b1: -2,
        b2: 1,
        a1: (2 * (k * k - 1)) / a0,
        a2: (1 - k / q + k * k) / a0,
    };
    return [shelf, highpass];
}

function biquad(samples: Float32Array | Float64Array, f: Biquad): Float64Array {
    const out = new Float64Array(samples.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < samples.length; i++) {
        const x = samples[i];
        const y = f.b0 * x + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        out[i] = y;
    }
    return out;
}

/**
 * Integrated loudness in LUFS (BS.1770-4): K-weighted mean square over 400 ms blocks at 75%
 * overlap, gated absolutely at −70 LUFS and then relatively at 10 LU under the mean of what
 * passed. Every channel weighs 1 (left and right; no surround). `null` when nothing passes the
 * gates (silence).
 */
export function computeIntegratedLoudness(
    channels: Float32Array[],
    sampleRate: number,
): number | null {
    if (channels.length === 0 || channels[0].length === 0) {
        return null;
    }
    const [shelf, highpass] = kWeighting(sampleRate);
    const weighted = channels.map((data) => biquad(biquad(data, shelf), highpass));
    const block = Math.round(0.4 * sampleRate);
    const hop = Math.round(0.1 * sampleRate);
    const length = channels[0].length;
    const powers: number[] = [];
    for (let start = 0; start + block <= length; start += hop) {
        let power = 0;
        for (const data of weighted) {
            let sum = 0;
            for (let i = start; i < start + block; i++) {
                sum += data[i] * data[i];
            }
            power += sum / block;
        }
        powers.push(power);
    }
    const loudness = (power: number) => -0.691 + 10 * Math.log10(power);
    const absolute = powers.filter((power) => power > 0 && loudness(power) > -70);
    if (absolute.length === 0) {
        return null;
    }
    const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
    const relativeGate = loudness(mean(absolute)) - 10;
    const relative = absolute.filter((power) => loudness(power) > relativeGate);
    return relative.length > 0 ? loudness(mean(relative)) : null;
}

/** BS.1770-4 Annex 2's 4× interpolation filter (48 taps as four 12-tap phases). */
const TRUE_PEAK_PHASES = [
    [
        0.001708984375, 0.010986328125, -0.0196533203125, 0.033203125, -0.0594482421875,
        0.1373291015625, 0.97216796875, -0.102294921875, 0.047607421875, -0.026611328125,
        0.014892578125, -0.00830078125,
    ],
    [
        -0.0291748046875, 0.029296875, -0.0517578125, 0.089111328125, -0.16650390625,
        0.465087890625, 0.77978515625, -0.2003173828125, 0.1015625, -0.0582275390625,
        0.0330810546875, -0.0189208984375,
    ],
    [
        -0.0189208984375, 0.0330810546875, -0.0582275390625, 0.1015625, -0.2003173828125,
        0.77978515625, 0.465087890625, -0.16650390625, 0.089111328125, -0.0517578125, 0.029296875,
        -0.0291748046875,
    ],
    [
        -0.00830078125, 0.014892578125, -0.026611328125, 0.047607421875, -0.102294921875,
        0.97216796875, 0.1373291015625, -0.0594482421875, 0.033203125, -0.0196533203125,
        0.010986328125, 0.001708984375,
    ],
];

/** True peak in dBTP (BS.1770-4 Annex 2): the loudest of every sample and its 4× interpolation,
 * across channels. −120 for silence. */
export function computeTruePeakDb(channels: Float32Array[]): number {
    let peak = 0;
    for (const data of channels) {
        for (let n = 0; n < data.length; n++) {
            const sample = Math.abs(data[n]);
            if (sample > peak) {
                peak = sample;
            }
            for (const phase of TRUE_PEAK_PHASES) {
                let y = 0;
                for (let k = 0; k < phase.length; k++) {
                    const index = n - k;
                    if (index >= 0) {
                        y += phase[k] * data[index];
                    }
                }
                const value = Math.abs(y);
                if (value > peak) {
                    peak = value;
                }
            }
        }
    }
    return toDb(peak);
}
