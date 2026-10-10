/**
 * The pure checks `live-capture.ts` runs over a recording of the live transport (#1562). Each
 * returns numbers and the threshold it read them against; none says how it sounds.
 */
import { CLICK_DISCONTINUITY, detectOnsets, measureDiscontinuity } from './audio-verify.js';

const db = (value: number) => (value > 0 ? 20 * Math.log10(value) : -120);

function rmsBetween(samples: Float32Array, from: number, to: number): number {
    const start = Math.max(0, Math.floor(from));
    const end = Math.min(samples.length, Math.floor(to));
    if (end <= start) {
        return 0;
    }
    let sum = 0;
    for (let i = start; i < end; i++) {
        sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / (end - start));
}

export interface StopSilence {
    /** False when the capture cannot answer: nothing sounded before Stop, or it ends too soon. */
    verifiable: boolean;
    reason: string | null;
    /** RMS over the window starting `settleMs` after Stop — past the releases and the reverb. */
    afterDb: number;
    /** RMS 0.4–0.8 s after Stop: the release and reverb tail, for scale, not judged. */
    tailDb: number;
    /** RMS over the second before Stop, for scale. */
    beforeDb: number;
    /** Time from Stop until a 50 ms window first falls under `floorDb`; null if it never does. */
    decayMs: number | null;
    floorDb: number;
    silent: boolean;
}

/**
 * Did Stop silence the band? (#1530: a held chord rang for its whole written length.) The
 * judged window starts 1.2 s after Stop: the voices' releases are under 100 ms and the reverb's
 * tail is gone by then, so what remains is a note that was never released. The 0.4–0.8 s tail
 * is reported for scale — a reverb at −35 dBFS there is the room, not a stuck voice.
 */
export function stopSilence(
    samples: Float32Array,
    sampleRate: number,
    stopSample: number,
    { settleMs = 1200, windowMs = 400, floorDb = -60 } = {},
): StopSilence {
    const settle = (settleMs / 1000) * sampleRate;
    const afterDb = db(
        rmsBetween(
            samples,
            stopSample + settle,
            stopSample + settle + (windowMs / 1000) * sampleRate,
        ),
    );
    const beforeDb = db(rmsBetween(samples, stopSample - sampleRate, stopSample));
    const probe = Math.round(0.05 * sampleRate);
    let decayMs: number | null = null;
    for (let at = stopSample; at + probe <= samples.length; at += Math.round(probe / 5)) {
        if (db(rmsBetween(samples, at, at + probe)) < floorDb) {
            decayMs = ((at - stopSample) / sampleRate) * 1000;
            break;
        }
    }
    const tailDb = db(
        rmsBetween(samples, stopSample + 0.4 * sampleRate, stopSample + 0.8 * sampleRate),
    );
    const needed = stopSample + settle + (windowMs / 1000) * sampleRate;
    let reason: string | null = null;
    if (samples.length < needed) {
        reason = `the capture ends ${((needed - samples.length) / sampleRate).toFixed(2)} s before the judged window does`;
    } else if (beforeDb < floorDb + 20) {
        reason = `nothing was sounding before Stop (${beforeDb.toFixed(1)} dBFS) — the band never played`;
    }
    return {
        verifiable: reason === null,
        reason,
        afterDb,
        tailDb,
        beforeDb,
        decayMs,
        floorDb,
        silent: reason === null && afterDb < floorDb,
    };
}

export interface StopClick {
    verifiable: boolean;
    /** The largest discontinuity ratio in the window around Stop. */
    maxDiscontinuity: number;
    atMs: number;
    threshold: number;
    click: boolean;
}

/** A click at Stop: a sample-to-sample jump out of proportion to the signal just before it. */
export function stopClick(
    samples: Float32Array,
    sampleRate: number,
    stopSample: number,
    { spanMs = 400 } = {},
): StopClick {
    const span = Math.round((spanMs / 1000) * sampleRate);
    const step = Math.max(1, Math.round(sampleRate / 1000)); // one probe per millisecond
    let max = 0;
    let atMs = 0;
    for (let at = stopSample; at <= stopSample + span && at < samples.length; at += step) {
        const ratio = measureDiscontinuity(samples, sampleRate, at / sampleRate);
        if (ratio > max) {
            max = ratio;
            atMs = ((at - stopSample) / sampleRate) * 1000;
        }
    }
    const verifiable = stopSample + span <= samples.length;
    return {
        verifiable,
        maxDiscontinuity: max,
        atMs,
        threshold: CLICK_DISCONTINUITY,
        click: verifiable && max >= CLICK_DISCONTINUITY,
    };
}

export interface TempoFit {
    onsets: number;
    /** Median absolute distance of an onset from the nearest sixteenth, ms. A swung or humanised
     * band puts its own feel here; read it against the style's feel, not as error. */
    medianDeviationMs: number;
    /** Drift of the onsets against the nominal grid, ms per bar (positive = the band runs late). */
    driftMsPerBar: number;
    /** The tempo the onsets actually describe. */
    bpmEstimate: number;
    bpmNominal: number;
}

/**
 * The metronome check: onsets against a sixteenth grid at the nominal tempo, phase anchored on
 * the first onset after `fromSample`. A linear fit of residual against time is the drift.
 */
export function tempoFit(
    samples: Float32Array,
    sampleRate: number,
    bpm: number,
    { fromSample = 0, toSample = samples.length, beatsPerBar = 4 } = {},
): TempoFit | null {
    const onsets = detectOnsets(samples, sampleRate)
        .map((onset) => onset.time)
        .filter((time) => time * sampleRate >= fromSample && time * sampleRate < toSample);
    if (onsets.length < 8) {
        return null;
    }
    const sixteenth = 60 / bpm / 4;
    // The grid's phase is the circular mean of the onsets' positions within a sixteenth, not the
    // first onset: a swung or humanised offbeat as the anchor would read every on-grid hit as
    // 40 ms off and push the stragglers past the half-sixteenth wrap into the wrong step.
    let sin = 0;
    let cos = 0;
    for (const time of onsets) {
        const angle = ((time % sixteenth) / sixteenth) * 2 * Math.PI;
        sin += Math.sin(angle);
        cos += Math.cos(angle);
    }
    const phase = ((Math.atan2(sin, cos) / (2 * Math.PI) + 1) % 1) * sixteenth;
    const anchor = onsets[0];
    const points: Array<{ time: number; residualMs: number }> = [];
    for (const time of onsets) {
        const steps = Math.round((time - phase) / sixteenth);
        const residual = time - (phase + steps * sixteenth);
        points.push({ time: time - anchor, residualMs: residual * 1000 });
    }
    const deviations = points.map((p) => Math.abs(p.residualMs)).sort((a, b) => a - b);
    const medianDeviationMs = deviations[Math.floor(deviations.length / 2)];
    // Least squares: residual = a + b·time; b is ms of lateness gained per second.
    const n = points.length;
    const sumT = points.reduce((s, p) => s + p.time, 0);
    const sumR = points.reduce((s, p) => s + p.residualMs, 0);
    const sumTT = points.reduce((s, p) => s + p.time * p.time, 0);
    const sumTR = points.reduce((s, p) => s + p.time * p.residualMs, 0);
    const denominator = n * sumTT - sumT * sumT;
    const slopeMsPerSecond = denominator === 0 ? 0 : (n * sumTR - sumT * sumR) / denominator;
    const barSeconds = (60 / bpm) * beatsPerBar;
    const driftMsPerBar = slopeMsPerSecond * barSeconds;
    // Running late by k ms per second means the band's second lasts 1 + k/1000 nominal seconds.
    const bpmEstimate = bpm / (1 + slopeMsPerSecond / 1000);
    return {
        onsets: onsets.length,
        medianDeviationMs,
        driftMsPerBar,
        bpmEstimate,
        bpmNominal: bpm,
    };
}

export const BAND_CENTERS = {
    sub: 60,
    low: 140,
    lowMid: 380,
    mid: 1000,
    presence: 2800,
    air5k: 5000,
    air: 7200,
} as const;
export type BandName = keyof typeof BAND_CENTERS;

function goertzel(
    samples: Float32Array,
    frequency: number,
    sampleRate: number,
    start: number,
    length: number,
): number {
    const omega = (2 * Math.PI * frequency) / sampleRate;
    const coefficient = 2 * Math.cos(omega);
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    for (let i = start; i < start + length; i++) {
        s0 = samples[i] + coefficient * s1 - s2;
        s2 = s1;
        s1 = s0;
    }
    return Math.sqrt(s1 * s1 + s2 * s2 - coefficient * s1 * s2);
}

/** Band shares over EVERY 4096-sample window of the region, not four of them (#1556). */
export function denseBandShares(
    samples: Float32Array,
    sampleRate: number,
    from = 0,
    to = samples.length,
): Record<BandName, number> {
    const totals = Object.fromEntries(Object.keys(BAND_CENTERS).map((k) => [k, 0])) as Record<
        BandName,
        number
    >;
    for (let at = from; at + 4096 <= to; at += 4096) {
        for (const [band, frequency] of Object.entries(BAND_CENTERS) as Array<[BandName, number]>) {
            totals[band] += goertzel(samples, frequency, sampleRate, at, 4096);
        }
    }
    const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
    for (const band of Object.keys(totals) as BandName[]) {
        totals[band] /= sum;
    }
    return totals;
}

export interface LevelComparison {
    liveDb: number;
    offlineDb: number;
    deltaDb: number;
    /** Per band: live share minus offline share, in points of 100. */
    bandDeltaPoints: Record<BandName, number>;
    thresholdDb: number;
    withinThreshold: boolean;
}

/** Live against offline on level and spectrum — the #1531 class (export 2.5 dB under live). */
export function compareLevels(
    live: { samples: Float32Array; sampleRate: number; from: number; to: number },
    offline: { samples: Float32Array; sampleRate: number; from: number; to: number },
    thresholdDb = 1.5,
): LevelComparison {
    const liveDb = db(rmsBetween(live.samples, live.from, live.to));
    const offlineDb = db(rmsBetween(offline.samples, offline.from, offline.to));
    const liveBands = denseBandShares(live.samples, live.sampleRate, live.from, live.to);
    const offlineBands = denseBandShares(
        offline.samples,
        offline.sampleRate,
        offline.from,
        offline.to,
    );
    const bandDeltaPoints = Object.fromEntries(
        (Object.keys(BAND_CENTERS) as BandName[]).map((band) => [
            band,
            (liveBands[band] - offlineBands[band]) * 100,
        ]),
    ) as Record<BandName, number>;
    const deltaDb = liveDb - offlineDb;
    return {
        liveDb,
        offlineDb,
        deltaDb,
        bandDeltaPoints,
        thresholdDb,
        withinThreshold: Math.abs(deltaDb) <= thresholdDb,
    };
}

/** Decode the capture's base64 float32 channels. */
export function decodeCaptureChannel(base64: string): Float32Array {
    const bytes = Buffer.from(base64, 'base64');
    // A small Buffer comes from node's pool at an arbitrary offset; a Float32Array view needs a
    // 4-byte-aligned one, so copy into a fresh, aligned buffer first.
    const aligned = new Uint8Array(bytes.byteLength);
    aligned.set(bytes);
    return new Float32Array(aligned.buffer, 0, Math.floor(aligned.byteLength / 4));
}
