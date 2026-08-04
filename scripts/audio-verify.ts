// Pure verification primitives that reconcile a *symbolic* note schedule against
// the *rendered* audio for the same seed. Sibling to `audio-analysis.ts`: no Web
// Audio, no DOM, no filesystem — Float32Array in, plain data out, so the whole
// module is unit-testable against synthetic signals (`tests/scripts/audio-verify.test.ts`).
//
// What this answers that `tests/standards/` structurally cannot: a critique test
// asserts the engine *decided* to play a note. This asserts the note is actually
// **present in the render** — audible, on time, at the right pitch, at a level that
// tracks its velocity. The gap between those two is every defect that lives below
// the note buffer: a synth voice that never sounds, a scheduler that drops a hit,
// an envelope that swallows an accent, a graph that emits a click.
//
// SCOPE LIMIT (state it, it is not a flaw): the events and the audio come from the
// same code path, so this cannot catch a bad *musical decision* — only a decision
// that failed to become sound. Musical-decision claims stay gated by critique tests.

import { toDb } from './audio-analysis.js';

/** One scheduled note, as captured from the renderer's visualizer event queue. */
export interface ScheduledEvent {
    track: string;
    /** Absolute seconds into the render (post-humanization — the real play time). */
    time: number;
    midi: number;
    duration?: number;
    /** Absent on lanes whose visualizer payload omits it (drums/chords carry it today). */
    velocity?: number;
    /**
     * The exact final scalar the voice received — post-conductor, post-humanization
     * (#1351). Preferred over `velocity` when present: it is the level the render
     * was actually asked to produce.
     */
    renderVelocity?: number;
    /** Post-articulation linear attenuation (palm-mute gain etc.), default 1 (#1351). */
    levelScale?: number;
}

/**
 * The level the render was asked to produce for one event: the most-final velocity
 * available, times any articulation attenuation. Null when the lane's payload
 * carries no velocity at all — the caller must report the gap, not invent a value.
 */
export function effectiveLevel(event: ScheduledEvent): number | null {
    const base = typeof event.renderVelocity === 'number' ? event.renderVelocity : event.velocity;
    if (typeof base !== 'number') {
        return null;
    }
    return base * (typeof event.levelScale === 'number' ? event.levelScale : 1);
}

/**
 * `levelScale` at or below this marks a *deliberately* attenuated articulation. An
 * attack this quiet that shows no energy rise is reported as intended-quiet, not as
 * a dropped note — the #1342-review false-negative trap this constant exists to
 * close. Deliberately tight: the full palm-mute floor is 0.15 (`MUTE_ATTENUATION`
 * in `mute-contract.ts`), and 0.2 covers it with margin while a half-muted note
 * (`levelScale 0.5`) — normally clearly audible — still reads MISSED when dropped.
 * Widening this widens the class of genuinely dropped notes that can hide.
 */
export const ATTENUATED_LEVEL_SCALE = 0.2;

/** Render geometry, needed to map seconds back to musical step indices. */
export interface RenderMeta {
    sampleRate: number;
    leadInSeconds: number;
    stepSeconds: number;
    stepsPerLoop: number;
    loopCount: number;
    bpm: number;
}

export interface DetectedOnset {
    time: number;
    /** Novelty at the picked peak, in dB of frame-energy rise. */
    strengthDb: number;
    /**
     * Largest sample-to-sample step near the onset, as a fraction of the local peak.
     * A band-limited signal cannot exceed `2π·f/fs` (≈0.71 even at 5 kHz), so a
     * ratio above ~1 is a genuine waveform discontinuity — a click, not an attack.
     */
    discontinuity: number;
}

/** Expected events that sound as a single attack (a chord = one attack, not N). */
export interface AttackGroup {
    time: number;
    step: number;
    midis: number[];
    /** Max velocity across the group's events, or null if no event carried one. */
    velocity: number | null;
    /**
     * Max *effective* level across the group ({@link effectiveLevel}), or null when
     * no event carried any velocity. Equals `velocity` on lanes without the #1351
     * audit fields, so pre-existing dumps read unchanged.
     */
    level: number | null;
    /**
     * True when every leveled event in the group is deliberately attenuated
     * (`levelScale ≤ ATTENUATED_LEVEL_SCALE`) — an intended-quiet attack.
     */
    attenuated: boolean;
    eventCount: number;
}

/** One row of per-attack rendered evidence — the JSON a story asserts against (#1351). */
export interface AttackRow {
    step: number;
    time: number;
    midis: number[];
    level: number | null;
    attenuated: boolean;
    present: boolean;
    riseDb: number;
    peak: number;
}

export interface StemVerification {
    stemId: string;
    tracks: string[];
    /** Carried, not inferred: a fully dropped lane has no pitch rate to infer from. */
    pitched: boolean;
    expectedAttacks: number;
    matchedAttacks: number;
    /** null when nothing was scheduled — distinct from 0, which means all dropped. */
    matchRate: number | null;
    missed: AttackGroup[];
    /**
     * Attacks with no measurable rise whose events are all deliberately attenuated
     * (`levelScale ≤ ATTENUATED_LEVEL_SCALE`) — intended-quiet, excluded from
     * `matchRate`'s denominator and reported separately so a palm-muted chuck is
     * never miscounted as a dropped note (#1351).
     */
    quietAttenuated: AttackGroup[];
    /** Per-attack rendered evidence, one row per scheduled attack group (#1351). */
    attacks: AttackRow[];
    unscheduled: DetectedOnset[];
    /** Constant graph latency removed before per-note timing is reported. */
    outputLatencyMs: number | null;
    /** Per-note timing spread AFTER latency removal — the musical number. */
    medianOffsetMs: number | null;
    velocityPeakR: number | null;
    /** Why a null metric is null — printed verbatim so a gap never reads as a pass. */
    notVerifiable: Record<string, string>;
    pitchConfirmedRate: number | null;
}

// ── The four thresholds that decide a verdict ──────────────────────────────────
// Everything else in this file is a window size. These are the numbers to reach
// for when a report disagrees with your ears, and each is bracketed by a test in
// `tests/scripts/audio-verify.test.ts` so a change to one moves a result.

/**
 * Discontinuity ratio at or above which an onset is flagged as a possible click.
 * From the band-limit bound (see `measureDiscontinuity`): a sine below ~7 kHz
 * cannot exceed it. NOTE it is *not* safe as a standalone click detector —
 * noise-based percussion legitimately reaches ~1.36 against a real click's ~1.96,
 * which is why the whole-signal scan was tried and rejected.
 */
export const CLICK_DISCONTINUITY = 1.0;

/**
 * Harmonic-to-reference ratio above which a pitch counts as present. 1.0 would mean
 * "no more energy at this note's harmonics than beside them"; the margin over that
 * keeps room ring and neighboring content from reading as the note itself.
 */
export const PITCH_CONFIRM_RATIO = 1.5;

function median(values: number[]): number | null {
    if (values.length === 0) {
        return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function midiToFreq(midi: number): number {
    return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Goertzel magnitude over an explicit sample window. `audio-analysis.ts` keeps a
 * whole-signal variant private; this one is windowed because presence-at-a-time is
 * the entire question here.
 */
export function goertzelWindow(
    samples: Float32Array,
    sampleRate: number,
    freq: number,
    startIndex: number,
    length: number,
): number {
    const end = Math.min(samples.length, startIndex + length);
    const start = Math.max(0, startIndex);
    if (end - start < 8) {
        return 0;
    }
    const omega = (2 * Math.PI * freq) / sampleRate;
    const coeff = 2 * Math.cos(omega);
    let s1 = 0;
    let s2 = 0;
    for (let i = start; i < end; i++) {
        const s0 = samples[i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }
    const magSquared = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    return magSquared > 0 ? Math.sqrt(magSquared) / (end - start) : 0;
}

/**
 * Frame-energy novelty curve. Half-wave-rectified rise in log frame energy — the
 * classic percussive-onset novelty function, chosen over spectral flux because it
 * needs no FFT and this material's attacks are broadband.
 */
export function computeNoveltyCurve(
    samples: Float32Array,
    sampleRate: number,
    frameSize = 1024,
    hopSize = 128,
): { times: number[]; novelty: number[] } {
    const times: number[] = [];
    const novelty: number[] = [];
    if (samples.length < frameSize) {
        return { times, novelty };
    }

    let previousDb: number | null = null;
    for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
        let sumSquares = 0;
        for (let i = start; i < start + frameSize; i++) {
            sumSquares += samples[i] * samples[i];
        }
        const db = toDb(Math.sqrt(sumSquares / frameSize));
        times.push((start + frameSize / 2) / sampleRate);
        novelty.push(previousDb === null ? 0 : Math.max(0, db - previousDb));
        previousDb = db;
    }
    return { times, novelty };
}

/** Sliding-window RMS, timestamped at each window's END (energy "as of" that point). */
const ENVELOPE_WINDOW = 512;
const ENVELOPE_HOP = 16;

/**
 * Peak-to-baseline ratio a window must show before `refineOnsetTime` will believe
 * an attack is in it (2× ≈ 6 dB — well under any real attack, well over tonal
 * ripple).
 */
const MIN_REFINE_RISE = 2;

function buildEnvelope(
    samples: Float32Array,
    fromIndex: number,
    toIndex: number,
): { values: number[]; indices: number[] } {
    const values: number[] = [];
    const indices: number[] = [];
    const start = Math.max(0, fromIndex);
    const end = Math.min(samples.length, toIndex);
    for (let windowEnd = start + ENVELOPE_WINDOW; windowEnd <= end; windowEnd += ENVELOPE_HOP) {
        let sumSquares = 0;
        for (let i = windowEnd - ENVELOPE_WINDOW; i < windowEnd; i++) {
            sumSquares += samples[i] * samples[i];
        }
        values.push(Math.sqrt(sumSquares / ENVELOPE_WINDOW));
        indices.push(windowEnd);
    }
    return { values, indices };
}

/**
 * Snap a frame-resolution onset candidate to the attack it came from.
 *
 * Load-bearing for any timing claim: `computeNoveltyCurve` reports a frame's
 * CENTER, and a 1024-sample frame lags the transient that raised its energy by up
 * to ~12 ms. Reporting frame centers would bake that bias into every "median onset
 * offset" reading — a fabricated late-feel that looks exactly like real swing.
 *
 * The walk-back runs on an RMS envelope, never on raw samples: a tonal waveform
 * crosses zero every half-cycle, so a raw-sample threshold would "find" the attack
 * at whichever zero-crossing preceded the peak — an error of a quarter period,
 * which at bass pitches is tens of milliseconds.
 */
export function refineOnsetTime(
    samples: Float32Array,
    sampleRate: number,
    approxTime: number,
    backMs = 30,
    forwardMs = 15,
): number {
    const centerIndex = Math.floor(approxTime * sampleRate);
    const from = centerIndex - Math.floor((backMs / 1000) * sampleRate);
    const to = centerIndex + Math.floor((forwardMs / 1000) * sampleRate);
    const { values, indices } = buildEnvelope(samples, from, to);
    if (values.length === 0) {
        return approxTime;
    }

    let peak = 0;
    let peakIndex = 0;
    for (let i = 0; i < values.length; i++) {
        if (values[i] > peak) {
            peak = values[i];
            peakIndex = i;
        }
    }
    if (peak <= 0) {
        return approxTime;
    }

    // The attack is the LAST point before the peak at which the envelope was still
    // down at its pre-onset baseline. Two rejected alternatives, both of which this
    // formulation exists to avoid:
    //   • a fixed fraction of the peak — only correct when the note rises out of
    //     silence. Riding the decaying tail of the previous note, the tail never
    //     drops under the floor and the search runs to the window edge, reporting
    //     the onset tens of milliseconds early.
    //   • walking back to the first local trough — RMS over a window shorter than a
    //     couple of periods ripples at the tone's own frequency, so a bass note's
    //     attack is full of local troughs and the walk stops inside the attack.
    // Taking the last sub-threshold point is immune to both: ripple after the
    // crossing is irrelevant, and the baseline absorbs whatever preceded it.
    let baseline = peak;
    for (let i = 0; i <= peakIndex; i++) {
        if (values[i] < baseline) {
            baseline = values[i];
        }
    }

    // Refuse to refine a window that has no attack in it. A steady tone's RMS still
    // ripples at its own frequency, so a trough always exists to "find" — and
    // snapping to one reports a confident timing offset (measured: -14 ms) for a
    // note whose attack is not in the window at all. Requiring a real rise first is
    // what separates "I located the attack" from "I located some ripple".
    if (peak < baseline * MIN_REFINE_RISE) {
        return approxTime;
    }

    const threshold = baseline + (peak - baseline) * 0.1;
    for (let i = peakIndex; i >= 0; i--) {
        if (values[i] < threshold) {
            return indices[i] / sampleRate;
        }
    }
    // No sub-threshold point means the envelope was already up when the search
    // began. Returning the window's first index instead would report a fixed offset
    // of roughly `-backMs` — a fabricated EARLY reading, sign-inverted so a late
    // note reads early, contaminating the median deviation.
    return approxTime;
}

/**
 * Largest sample-to-sample step near `time`, normalized by the local peak.
 *
 * This is the click discriminator. A band-limited signal's per-sample delta is
 * bounded by `2π·f/fs` — about 0.71 even for a 5 kHz sine at 44.1 kHz — so a ratio
 * near or above 1 cannot be an ordinary attack, however fast. Preferred over a
 * rise-time measure because rise time is confounded by pitch: a high note's attack
 * is legitimately sub-millisecond, and would false-positive as a click.
 */
export function measureDiscontinuity(
    samples: Float32Array,
    sampleRate: number,
    time: number,
    backMs = 1,
    forwardMs = 8,
): number {
    const centerIndex = Math.floor(time * sampleRate);
    // Asymmetric: a detected onset marks where the attack BEGINS, so the edge
    // being judged lies just after it, never a millisecond before.
    const start = Math.max(1, centerIndex - Math.floor((backMs / 1000) * sampleRate));
    const end = Math.min(samples.length, centerIndex + Math.floor((forwardMs / 1000) * sampleRate));
    if (end - start < 2) {
        return 0;
    }
    let maxDelta = 0;
    let peak = 0;
    for (let i = start; i < end; i++) {
        const delta = Math.abs(samples[i] - samples[i - 1]);
        if (delta > maxDelta) {
            maxDelta = delta;
        }
        const value = Math.abs(samples[i]);
        if (value > peak) {
            peak = value;
        }
    }
    return peak > 1e-9 ? maxDelta / peak : 0;
}

export interface OnsetOptions {
    /** Novelty must exceed the local median by this many dB. The main sensitivity knob. */
    thresholdDb?: number;
    /** Minimum spacing between reported onsets. */
    minGapMs?: number;
}

/**
 * Blind onset detection — deliberately independent of the schedule, so it can
 * surface attacks nothing scheduled (the click / double-trigger class).
 */
export function detectOnsets(
    samples: Float32Array,
    sampleRate: number,
    options: OnsetOptions = {},
): DetectedOnset[] {
    const thresholdDb = options.thresholdDb ?? 3;
    const minGapMs = options.minGapMs ?? 25;
    const { times, novelty } = computeNoveltyCurve(samples, sampleRate);
    if (novelty.length === 0) {
        return [];
    }

    // Local-median baseline keeps a busy passage from raising the bar for a quiet
    // one (and vice versa) the way a single global threshold would.
    const windowFrames = Math.max(8, Math.floor((0.25 * sampleRate) / 128));
    const onsets: DetectedOnset[] = [];
    let lastTime = Number.NEGATIVE_INFINITY;

    for (let i = 1; i < novelty.length - 1; i++) {
        const value = novelty[i];
        if (value <= 0 || value < novelty[i - 1] || value < novelty[i + 1]) {
            continue;
        }
        const from = Math.max(0, i - windowFrames);
        const to = Math.min(novelty.length, i + windowFrames);
        const localMedian = median(novelty.slice(from, to)) ?? 0;
        if (value < localMedian + thresholdDb) {
            continue;
        }
        // Frame center → waveform attack, before the min-gap test: two adjacent
        // candidate frames often refine onto the same physical attack, and
        // de-duplicating on refined times is what collapses them into one onset.
        const time = refineOnsetTime(samples, sampleRate, times[i]);
        if ((time - lastTime) * 1000 < minGapMs) {
            continue;
        }
        lastTime = time;
        onsets.push({
            time,
            strengthDb: value,
            discontinuity: measureDiscontinuity(samples, sampleRate, time),
        });
    }
    return onsets;
}

/**
 * Cluster simultaneous events into single attacks. Load-bearing: a five-note chord
 * produces ONE audio onset, so matching event-per-onset would report four phantom
 * misses on every chord.
 */
export function groupSimultaneous(
    events: ScheduledEvent[],
    meta: RenderMeta,
    epsilonMs = 15,
): AttackGroup[] {
    const sorted = [...events].sort((a, b) => a.time - b.time);
    const groups: AttackGroup[] = [];
    for (const event of sorted) {
        const level = effectiveLevel(event);
        const attenuated =
            level !== null &&
            typeof event.levelScale === 'number' &&
            event.levelScale <= ATTENUATED_LEVEL_SCALE;
        const last = groups[groups.length - 1];
        if (last && (event.time - last.time) * 1000 <= epsilonMs) {
            last.midis.push(event.midi);
            last.eventCount++;
            if (typeof event.velocity === 'number') {
                last.velocity = Math.max(last.velocity ?? 0, event.velocity);
            }
            if (level !== null) {
                last.level = Math.max(last.level ?? 0, level);
                // A cluster is intended-quiet only if EVERY leveled member is —
                // one open note beside a chuck means the attack should be heard.
                last.attenuated = last.attenuated && attenuated;
            }
            continue;
        }
        groups.push({
            time: event.time,
            step: Math.round((event.time - meta.leadInSeconds) / meta.stepSeconds),
            midis: [event.midi],
            velocity: typeof event.velocity === 'number' ? event.velocity : null,
            level,
            attenuated,
            eventCount: 1,
        });
    }
    return groups;
}

export interface BandSplit {
    low: Float32Array;
    high: Float32Array;
}

/**
 * One-pole split into a low and a high band. Crude by DSP standards and entirely
 * sufficient: the only job is to stop bass energy from masking treble events.
 *
 * Its bound is leakage — a one-pole leaves roughly `f/cutoff` of a low tone in the
 * high band (a 60 Hz tone leaks ~7.5%), so a treble event quieter than that cannot
 * be separated from it and will read as absent. Real kit material sits far above it
 * (127/128 hits found); reach for a steeper split only if that stops holding.
 */
export function splitBands(samples: Float32Array, sampleRate: number, cutoffHz = 800): BandSplit {
    const low = new Float32Array(samples.length);
    const high = new Float32Array(samples.length);
    const alpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
    let state = 0;
    for (let i = 0; i < samples.length; i++) {
        state += alpha * (samples[i] - state);
        low[i] = state;
        high[i] = samples[i] - state;
    }
    return { low, high };
}

/** RMS over an explicit time span, in seconds. */
function rmsOverSpan(
    samples: Float32Array,
    sampleRate: number,
    fromSec: number,
    toSec: number,
): number {
    const start = Math.max(0, Math.floor(fromSec * sampleRate));
    const end = Math.min(samples.length, Math.floor(toSec * sampleRate));
    if (end <= start) {
        return 0;
    }
    let sumSquares = 0;
    for (let i = start; i < end; i++) {
        sumSquares += samples[i] * samples[i];
    }
    return Math.sqrt(sumSquares / (end - start));
}

export interface AttackEvidence {
    /** The strongest rise across bands — the presence verdict's input. */
    riseDb: number;
    lowRiseDb: number;
    highRiseDb: number;
}

/**
 * Energy rise across an expected attack time, measured **per band** — the
 * schedule-anchored presence check, and the reason this works on a full kit.
 *
 * Why not blind detection: it has to out-compete its neighbors. In a steady stream
 * of sixteenth hats the local novelty median rises to meet every peak and real
 * hits stop clearing the bar (measured: 61 of 128 on a funk kit). Asking "did
 * energy rise HERE, at a time the schedule already gave us" has no such contest.
 *
 * Why per band, which is the part that actually mattered: a broadband measure is
 * dominated by whatever is loudest, and in a kit mix that is always the kick. A
 * vel-0.4 hat landing on a ringing kick measured **+0.4 dB broadband** — invisible
 * — while the same hit is **+15.1 dB above 800 Hz**, which is roughly how a
 * listener separates them too. Splitting the bands took the kit from 84/128 hits
 * found to 127/128. Any future "the tool says a hit is missing" report should
 * check the per-band numbers before trusting the verdict.
 */
export function measureAttackEvidence(
    bands: BandSplit,
    sampleRate: number,
    time: number,
    beforeMs = 20,
    afterMs = 28,
): AttackEvidence {
    const floor = 1e-7;
    const riseFor = (signal: Float32Array): number => {
        const before = rmsOverSpan(signal, sampleRate, time - beforeMs / 1000, time - 0.002);
        const after = rmsOverSpan(signal, sampleRate, time + 0.002, time + afterMs / 1000);
        return 20 * Math.log10(Math.max(after, floor) / Math.max(before, floor));
    };
    const lowRiseDb = riseFor(bands.low);
    const highRiseDb = riseFor(bands.high);
    return { riseDb: Math.max(lowRiseDb, highRiseDb), lowRiseDb, highRiseDb };
}

/**
 * The render's constant output latency, in milliseconds.
 *
 * Measured, not assumed: the shared master chain (bus EQ, limiter) delays audio
 * relative to the time a note was scheduled for — on a funk kit the first kick is
 * digital silence until +16 ms, then an abrupt attack. That is a property of the
 * audio graph, not of the performance, so it must be estimated once and removed
 * before any per-note timing claim. Fold it into the per-note numbers instead and
 * every lane reads ~20 ms behind the beat, which would look exactly like a
 * deliberate laid-back pocket.
 *
 * Estimated from the blindly-detected onsets, which are sparse but unbiased; the
 * median is unaffected by the ones dense passages hide.
 */
export function estimateOutputLatencyMs(
    groups: AttackGroup[],
    onsets: DetectedOnset[],
    searchMs = 60,
): number | null {
    const offsets: number[] = [];
    for (const group of groups) {
        let best: number | null = null;
        for (const onset of onsets) {
            const deltaMs = (onset.time - group.time) * 1000;
            if (
                Math.abs(deltaMs) <= searchMs &&
                (best === null || Math.abs(deltaMs) < Math.abs(best))
            ) {
                best = deltaMs;
            }
        }
        if (best !== null) {
            offsets.push(best);
        }
    }
    return offsets.length >= 8 ? median(offsets) : null;
}

/**
 * Can a window of `windowMs` tell this pitch from its semitone neighbors?
 *
 * A Goertzel over W seconds resolves about 1/W Hz, while a semitone spans only
 * `0.0595·f0`. Low notes therefore need long windows: at MIDI 45 (110 Hz) a
 * semitone is 6.5 Hz against an 80 ms window's ~12.5 Hz, so neighboring pitches
 * are indistinguishable. Measured on a signal containing ONLY MIDI 45, probing
 * without this gate confirmed 8 of 10 WRONG pitches — including one 25 semitones
 * away. Any pitch claim below the resolvable floor is worthless, so it is not made.
 */
export function isPitchResolvable(midi: number, windowMs = 80): boolean {
    const f0 = midiToFreq(midi);
    const semitoneHz = f0 * (2 ** (1 / 12) - 1);
    const resolutionHz = 1000 / windowMs;
    return semitoneHz >= 2 * resolutionHz;
}

/**
 * Harmonic presence at an expected pitch: energy at f0/2f0/3f0 against the same
 * harmonics of the pitches a **semitone either side**. A ratio near 1 means "no
 * more energy at this note than at its neighbors" — so the note is absent, masked,
 * or the wrong pitch is sounding.
 *
 * The reference used to be a tritone away, which was nearly free to pass: a tritone
 * is far from any confusable pitch, so the ratio only measured "is there tonal
 * energy roughly here", not "is it THIS note". Semitone neighbors are the actual
 * confusion this metric exists to rule out. Caller must gate on
 * `isPitchResolvable` — below that floor the neighbors are not separable at all.
 */
export function probeHarmonicPresence(
    samples: Float32Array,
    sampleRate: number,
    time: number,
    midi: number,
    windowMs = 80,
): number {
    const startIndex = Math.floor(time * sampleRate);
    const length = Math.floor((windowMs / 1000) * sampleRate);
    const f0 = midiToFreq(midi);
    const semitone = 2 ** (1 / 12);
    if (f0 <= 0 || f0 * 3 * semitone >= sampleRate / 2) {
        return 0;
    }
    let harmonic = 0;
    let reference = 0;
    for (const multiple of [1, 2, 3]) {
        harmonic += goertzelWindow(samples, sampleRate, f0 * multiple, startIndex, length);
        reference +=
            (goertzelWindow(samples, sampleRate, f0 * multiple * semitone, startIndex, length) +
                goertzelWindow(
                    samples,
                    sampleRate,
                    (f0 * multiple) / semitone,
                    startIndex,
                    length,
                )) /
            2;
    }
    if (harmonic <= 0) {
        return 0;
    }
    return reference > 0 ? harmonic / reference : Number.POSITIVE_INFINITY;
}

/** Peak absolute amplitude in a short window after an attack. */
export function measureAttackPeak(
    samples: Float32Array,
    sampleRate: number,
    time: number,
    windowMs = 40,
): number {
    const startIndex = Math.max(0, Math.floor(time * sampleRate));
    const endIndex = Math.min(
        samples.length,
        startIndex + Math.floor((windowMs / 1000) * sampleRate),
    );
    let peak = 0;
    for (let i = startIndex; i < endIndex; i++) {
        const value = Math.abs(samples[i]);
        if (value > peak) {
            peak = value;
        }
    }
    return peak;
}

export function pearson(xs: number[], ys: number[]): number | null {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) {
        return null;
    }
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
        sumX += xs[i];
        sumY += ys[i];
    }
    const meanX = sumX / n;
    const meanY = sumY / n;
    let covariance = 0;
    let varianceX = 0;
    let varianceY = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - meanX;
        const dy = ys[i] - meanY;
        covariance += dx * dy;
        varianceX += dx * dx;
        varianceY += dy * dy;
    }
    if (varianceX <= 1e-12 || varianceY <= 1e-12) {
        return null;
    }
    return covariance / Math.sqrt(varianceX * varianceY);
}

export interface VerifyStemInput {
    stemId: string;
    tracks: string[];
    samples: Float32Array;
    events: ScheduledEvent[];
    meta: RenderMeta;
    /** Unpitched lanes skip the harmonic probe; mixed stems skip velocity correlation. */
    pitched?: boolean;
    singleLane?: boolean;
    onsetOptions?: OnsetOptions;
    toleranceMs?: number;
    /** Override the measured graph latency (mostly for tests). */
    outputLatencyMs?: number | null;
}

/**
 * Energy rise (dB) across an expected attack at which the note counts as sounded.
 * Calibrated on a real funk render: genuine hits clear this comfortably, while a
 * note that never sounds shows no rise at all.
 */
export const PRESENCE_RISE_DB = 2;

export function verifyStem(input: VerifyStemInput): StemVerification {
    const { stemId, tracks, samples, events, meta } = input;
    const toleranceMs = input.toleranceMs ?? 25;
    const notVerifiable: Record<string, string> = {};

    const groups = groupSimultaneous(events, meta);
    const bands = splitBands(samples, meta.sampleRate);
    const onsets = detectOnsets(samples, meta.sampleRate, input.onsetOptions);

    // Remove the graph's constant latency before asking anything about timing, or
    // every lane reads ~20 ms late and the whole stem looks laid-back.
    // `=== undefined`, not `??`: an explicit `null` means "do not compensate", and
    // `??` would silently re-enable estimation on the caller who asked for that.
    const outputLatencyMs =
        input.outputLatencyMs === undefined
            ? estimateOutputLatencyMs(groups, onsets)
            : input.outputLatencyMs;
    const latencySec = (outputLatencyMs ?? 0) / 1000;

    // Presence is decided at the expected time, not by winning a blind-detection
    // contest against neighboring hits (see `measureAttackEvidence`).
    const present: AttackGroup[] = [];
    const missed: AttackGroup[] = [];
    const quietAttenuated: AttackGroup[] = [];
    const attacks: AttackRow[] = [];
    const deviations: number[] = [];
    for (const group of groups) {
        const expected = group.time + latencySec;
        const evidence = measureAttackEvidence(bands, meta.sampleRate, expected);
        const sounded = evidence.riseDb >= PRESENCE_RISE_DB;
        attacks.push({
            step: group.step,
            time: group.time,
            midis: group.midis,
            level: group.level,
            attenuated: group.attenuated,
            present: sounded,
            riseDb: evidence.riseDb,
            peak: measureAttackPeak(samples, meta.sampleRate, expected),
        });
        if (sounded) {
            present.push(group);
            const actual = refineOnsetTime(
                samples,
                meta.sampleRate,
                expected,
                toleranceMs,
                toleranceMs,
            );
            deviations.push((actual - expected) * 1000);
        } else if (group.attenuated) {
            // No rise, but every event was deliberately attenuated (palm-mute
            // class) — an intended-quiet attack, not a dropped note. Reported in
            // its own bucket so the presence claim stays honest both ways.
            quietAttenuated.push(group);
        } else {
            missed.push(group);
        }
    }

    // An onset is "unscheduled" only if no expected attack sits near it.
    const unscheduled = onsets.filter((onset) =>
        groups.every(
            (group) => Math.abs((onset.time - group.time - latencySec) * 1000) > toleranceMs,
        ),
    );

    let velocityPeakR: number | null = null;
    if (!input.singleLane) {
        notVerifiable.velocityPeakR =
            'multi-lane stem — a peak cannot be attributed to one lane; render the solo stem';
    } else {
        // This correlates each attack's LOUDEST scheduled hit against the broadband
        // peak it produced — both sides aggregate the same way, so the number is
        // sound, but it is narrower than "are accents expressing". On a kit both
        // sides collapse onto the kick, so a ghost hat's accent under a louder hit
        // (the #1273 class) is invisible here: measuring that needs a per-piece,
        // per-band probe. Restricting to single-event attacks was tried and is
        // worse — a funk kit stacks hits on nearly every step, so it deletes the
        // metric entirely rather than narrowing it.
        const withLevel = present.filter((group) => group.level !== null);
        if (withLevel.length < 3) {
            notVerifiable.velocityPeakR =
                "fewer than 3 sounded attacks carry a level (this lane's payload has neither velocity nor renderVelocity)";
        } else {
            velocityPeakR = pearson(
                withLevel.map((group) => group.level as number),
                withLevel.map((group) =>
                    measureAttackPeak(samples, meta.sampleRate, group.time + latencySec),
                ),
            );
            if (velocityPeakR === null) {
                notVerifiable.velocityPeakR = 'velocity or peak had zero variance across attacks';
            }
        }
    }

    let pitchConfirmedRate: number | null = null;
    if (!input.pitched) {
        notVerifiable.pitchConfirmedRate =
            'unpitched or mixed stem — harmonic probe not meaningful';
    } else if (present.length === 0) {
        notVerifiable.pitchConfirmedRate = 'no sounded attacks to probe';
    } else {
        // Two gates, both of which the probe silently fails without:
        //   • MONOPHONIC — the probe assumes nothing else is sounding, but inside a
        //     chord a neighbor's own partials land on this note's probe or reference
        //     bins. `chords` and `harmony` are both single-lane and polyphonic, and
        //     are the stems a reader most wants to read as "the voicing sounded".
        //   • RESOLVABLE — see `isPitchResolvable`. Below the floor the probe
        //     confirmed 8 of 10 wrong pitches in testing.
        let confirmed = 0;
        let probed = 0;
        let skippedUnresolvable = 0;
        for (const group of present) {
            if (new Set(group.midis).size !== 1) {
                continue;
            }
            if (!isPitchResolvable(group.midis[0])) {
                skippedUnresolvable++;
                continue;
            }
            probed++;
            const ratio = probeHarmonicPresence(
                samples,
                meta.sampleRate,
                group.time + latencySec,
                group.midis[0],
            );
            if (ratio > PITCH_CONFIRM_RATIO) {
                confirmed++;
            }
        }
        if (probed === 0) {
            notVerifiable.pitchConfirmedRate =
                skippedUnresolvable > 0
                    ? `every sounded attack is below the pitch-resolvable floor (~MIDI 69); an 80 ms window cannot tell those notes from their semitone neighbors`
                    : 'every sounded attack is polyphonic — the harmonic probe cannot separate simultaneous partials';
        } else {
            pitchConfirmedRate = confirmed / probed;
        }
    }

    if (outputLatencyMs === null) {
        notVerifiable.outputLatencyMs =
            'no onset landed within the ±60 ms search of a scheduled attack (too sparse to fit, or the lane is silent); timing figures below are UNCOMPENSATED';
    }

    // Presence in a mixed stem is not attributable to a lane. `groupSimultaneous`
    // clusters across lanes and the evidence check is a band-energy rise, so a kick
    // landing with a bass note satisfies the bass note's evidence — verified by
    // muting the bass lane entirely on a `full` render and still measuring 100%.
    // The mixed rows lead every report, so an unqualified "100.0%" there is the
    // most over-trusted number the tool could print.
    if (!input.singleLane) {
        notVerifiable.matchRate =
            "multi-lane stem — a co-located hit in another lane satisfies this one's evidence; render the solo stem for a presence claim";
    }

    return {
        stemId,
        tracks,
        pitched: Boolean(input.pitched),
        expectedAttacks: groups.length,
        matchedAttacks: present.length,
        // null, not 0, when nothing was scheduled: "0.0%" for an empty lane is
        // visually identical to "every note was dropped", which is the opposite
        // conclusion. Also null for mixed stems, where it is not attributable.
        // Intended-quiet attacks leave the denominator: an inaudible palm-mute
        // chuck is not a presence failure, and counting it as one is exactly the
        // false negative #1351 exists to remove.
        matchRate:
            groups.length - quietAttenuated.length > 0 && input.singleLane
                ? present.length / (groups.length - quietAttenuated.length)
                : null,
        missed,
        quietAttenuated,
        attacks,
        unscheduled,
        outputLatencyMs,
        medianOffsetMs: median(deviations),
        velocityPeakR,
        notVerifiable,
        pitchConfirmedRate,
    };
}

const DRUM_LABELS: Record<number, string> = {
    36: 'kick',
    37: 'rimshot',
    38: 'snare',
    39: 'clap',
    42: 'hat',
    44: 'pedal-hat',
    45: 'tom-low',
    46: 'open-hat',
    47: 'tom-mid',
    49: 'crash',
    50: 'tom-hi',
    51: 'ride',
    70: 'shaker',
};

function describeGroup(group: AttackGroup, pitched: boolean): string {
    const first = group.midis[0];
    const name = pitched ? `midi ${first}` : (DRUM_LABELS[first] ?? `midi ${first}`);
    const extra = group.eventCount > 1 ? ` +${group.eventCount - 1}` : '';
    const velocity = group.velocity === null ? '' : `,v${group.velocity.toFixed(2)}`;
    const level =
        group.level === null || group.level === group.velocity
            ? ''
            : `,lvl${group.level.toFixed(2)}`;
    return `step ${group.step} (${name}${extra}${velocity}${level})`;
}

/**
 * The reconciliation table. Facts only — there is deliberately no aggregate
 * verdict line anywhere in this output. A clean table means "nothing measured here
 * is broken", never "this sounds good"; the difference is the whole contract with
 * the listening gate, so `NOT VERIFIABLE` is always printed rather than omitted.
 */
export function formatVerificationTable(
    results: StemVerification[],
    meta: RenderMeta,
    missedLimit = 6,
    options: { header?: boolean } = {},
): string {
    const lines: string[] = [];
    if (options.header !== false) {
        lines.push(
            `render: ${meta.bpm} bpm · ${meta.stepsPerLoop} steps/loop × ${meta.loopCount} loop(s) · ` +
                `${meta.sampleRate} Hz · lead-in ${meta.leadInSeconds.toFixed(3)}s`,
        );
        lines.push('');
    }

    for (const result of results) {
        // Read off the input, never inferred from `pitchConfirmedRate`: that rate is
        // null for a fully dropped lane, so inferring would label every missed bass
        // note with a drum name (bass range 23–57 overlaps DRUM_LABELS at 36–51) —
        // on precisely the report that matters most, a lane that vanished.
        const pitched = result.pitched;
        const rate =
            result.matchRate !== null
                ? `${(result.matchRate * 100).toFixed(1)}%`
                : result.expectedAttacks === 0
                  ? 'nothing scheduled'
                  : 'presence NOT VERIFIABLE';
        lines.push(
            `${result.stemId.padEnd(14)} expected ${String(result.expectedAttacks).padStart(4)}  ` +
                `matched ${String(result.matchedAttacks).padStart(4)}  (${rate})`,
        );

        if (result.missed.length > 0) {
            const shown = result.missed
                .slice(0, missedLimit)
                .map((group) => describeGroup(group, pitched))
                .join(', ');
            const more =
                result.missed.length > missedLimit
                    ? `, +${result.missed.length - missedLimit} more`
                    : '';
            lines.push(`${' '.repeat(11)}MISSED ${shown}${more}`);
        }

        if (result.quietAttenuated.length > 0) {
            const shown = result.quietAttenuated
                .slice(0, missedLimit)
                .map((group) => describeGroup(group, pitched))
                .join(', ');
            const more =
                result.quietAttenuated.length > missedLimit
                    ? `, +${result.quietAttenuated.length - missedLimit} more`
                    : '';
            // Not counted in the match rate either way: intended-quiet, no rise
            // measurable — printed so the exclusion is visible, never silent.
            lines.push(`${' '.repeat(11)}QUIET (intended, unverifiable) ${shown}${more}`);
        }

        if (result.unscheduled.length > 0) {
            const shown = result.unscheduled
                .slice(0, missedLimit)
                .map(
                    (onset) =>
                        `${onset.time.toFixed(3)}s (discontinuity ${onset.discontinuity.toFixed(2)}` +
                        `${onset.discontinuity >= CLICK_DISCONTINUITY ? ' → click?' : ''})`,
                )
                .join(', ');
            const more =
                result.unscheduled.length > missedLimit
                    ? `, +${result.unscheduled.length - missedLimit} more`
                    : '';
            lines.push(
                `${' '.repeat(11)}UNSCHEDULED onsets: ${result.unscheduled.length} — ${shown}${more}`,
            );
        }

        const stats: string[] = [];
        if (result.outputLatencyMs !== null) {
            stats.push(`graph latency ${result.outputLatencyMs.toFixed(1)}ms`);
        }
        if (result.medianOffsetMs === null) {
            stats.push('median deviation n/a');
        } else {
            // When latency could not be fitted, the constant is still IN this number.
            // Printing a bare "+20.7ms" under VERIFIED would read as a laid-back
            // pocket — the exact fabrication latency removal exists to prevent — so
            // the uncompensated case says so inline, not only in a footer line.
            const sign = result.medianOffsetMs >= 0 ? '+' : '';
            const qualifier = result.outputLatencyMs === null ? ' (UNCOMPENSATED)' : '';
            stats.push(`median deviation${qualifier} ${sign}${result.medianOffsetMs.toFixed(1)}ms`);
        }
        if (result.velocityPeakR !== null) {
            stats.push(`vel→peak r=${result.velocityPeakR.toFixed(2)}`);
        }
        if (result.pitchConfirmedRate !== null) {
            stats.push(`pitch confirmed ${(result.pitchConfirmedRate * 100).toFixed(0)}%`);
        }
        lines.push(`${' '.repeat(11)}VERIFIED: ${stats.join('  |  ')}`);

        for (const [metric, reason] of Object.entries(result.notVerifiable)) {
            lines.push(`${' '.repeat(11)}NOT VERIFIABLE: ${metric} — ${reason}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}
