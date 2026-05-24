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

export function activeBounds(samples: Float32Array): { start: number; end: number } {
    let start = 0;
    let end = samples.length - 1;
    const threshold = 1e-4;
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
    air: 7200,
} as const;

export function computeSpectralProbes(samples: Float32Array, sampleRate: number): SpectralProbes {
    const bounds = activeBounds(samples);
    const active = samples.slice(bounds.start, bounds.end);
    const windowSize = Math.min(4096, active.length);
    if (windowSize < 256) {
        return { sub: 0, low: 0, lowMid: 0, mid: 0, presence: 0, air: 0, centroid: 0 };
    }

    const windows: Float32Array[] = [];
    const hop = Math.max(1, Math.floor((active.length - windowSize) / 3));
    for (let i = 0; i < 4; i++) {
        const start = Math.min(active.length - windowSize, hop * i);
        windows.push(active.slice(start, start + windowSize));
    }

    const totals: Record<string, number> = {
        sub: 0,
        low: 0,
        lowMid: 0,
        mid: 0,
        presence: 0,
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
