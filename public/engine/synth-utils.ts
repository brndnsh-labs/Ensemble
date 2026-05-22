import { safeDisconnect } from '../utils.js';
import { scrambleHash, stringHash31 } from './hash-utils.js';

/**
 * Standardized WebAudio utilities for instrument synthesis.
 */

export function rampGain(
    param: AudioParam,
    target: number,
    time: number,
    duration = 0.01,
    isExponential = false,
): void {
    try {
        param.cancelScheduledValues(time);
        if (isExponential && target > 0.0001) {
            // We skip setValueAtTime(value, time) to match existing test expectations
            // and avoid the "automation curve overlap" warning in some browsers
            // when not strictly necessary for these simple fades.
            param.exponentialRampToValueAtTime(target, time + duration);
        } else {
            param.setTargetAtTime(target, time, duration);
        }
    } catch {
        /* ignore audio graph errors */
    }
}

export function killActiveVoices(voices: any[], time: number, fadeTime = 0.01): void {
    if (!voices || voices.length === 0) {
        return;
    }
    voices.forEach((v) => {
        if (v.gain) {
            // Support both { gain: GainNode } and { gain: AudioParam }
            const g = v.gain.gain || v.gain;
            rampGain(g, 0, time, fadeTime);
        }
        if (v.nodes) {
            v.nodes.forEach((node: AudioNode & { stop?: (t: number) => void }) => {
                try {
                    if (node.stop) {
                        node.stop(time + fadeTime + 0.05);
                    }
                } catch {
                    /* ignore stop errors */
                }
            });
        }
    });
    voices.length = 0; // Clear the array in-place
}

interface MixState {
    recentHits: number;
    lastTick: number;
    densityDuck: number;
}

export function updateDensityDucking(
    mixState: MixState,
    now: number,
    threshold = 4,
    factor = 0.02,
): number {
    if (now - mixState.lastTick > 0.5) {
        mixState.recentHits *= 0.5;
        mixState.lastTick = now;
    }
    mixState.recentHits++;

    mixState.densityDuck = Math.max(
        0.75,
        1.0 - Math.max(0, mixState.recentHits - threshold) * factor,
    );
    return mixState.densityDuck;
}

export function createSimplePanner(
    ctx: AudioContext,
    panValue: number,
    time: number,
): StereoPannerNode | GainNode {
    const panner =
        typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : ctx.createGain();
    if (typeof ctx.createStereoPanner === 'function' && 'pan' in panner) {
        (panner as StereoPannerNode).pan.setValueAtTime(panValue, time);
    }
    return panner;
}

export function duckGain(
    param: AudioParam,
    target: number,
    time: number,
    attack = 0.01,
    release = 0.1,
): void {
    try {
        param.cancelScheduledValues(time);
        param.setTargetAtTime(target, time, attack);
        param.setTargetAtTime(1.0, time + attack, release);
    } catch {
        /* ignore audio graph errors */
    }
}

interface PercussiveStrikeOptions {
    volume?: number;
    filterType?: BiquadFilterType;
    freq?: number;
    Q?: number;
    attack?: number;
    decay?: number;
    duration?: number;
}

export function playPercussiveStrike(
    audio: AudioContext,
    buffer: AudioBuffer | null,
    destination: AudioNode,
    time: number,
    {
        volume = 0.1,
        filterType = 'bandpass',
        freq = 1200,
        Q = 1.5,
        attack = 0.001,
        decay = 0.01,
        duration = 0.1,
    }: PercussiveStrikeOptions = {},
): void {
    if (!audio || !buffer || !destination) {
        return;
    }

    try {
        const source = audio.createBufferSource();
        source.buffer = buffer;
        const filter = audio.createBiquadFilter();
        const gain = audio.createGain();

        filter.type = filterType;
        filter.frequency.setValueAtTime(freq, time);
        filter.Q.setValueAtTime(Q, time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.setTargetAtTime(volume, time, attack);
        gain.gain.setTargetAtTime(0, time + attack, decay);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(destination);

        source.start(time);
        source.stop(time + duration);

        source.onended = () => safeDisconnect([source, filter, gain]);
    } catch {
        /* ignore audio errors */
    }
}

interface ResonantToneOptions {
    type?: OscillatorType;
    freqStart?: number;
    freqEnd?: number;
    rampDuration?: number;
    volume?: number;
    attack?: number;
    decay?: number;
    duration?: number;
    detune?: number;
}

export function playResonantTone(
    audio: AudioContext,
    destination: AudioNode,
    time: number,
    {
        type = 'sine',
        freqStart = 100,
        freqEnd = 100,
        rampDuration = 0.02,
        volume = 0.1,
        attack = 0.001,
        decay = 0.05,
        duration = 0.5,
        detune = 0,
    }: ResonantToneOptions = {},
): void {
    if (!audio || !destination) {
        return;
    }

    try {
        const osc = audio.createOscillator();
        const gain = audio.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, time);
        if (freqStart !== freqEnd) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), time + rampDuration);
        }
        if (detune !== 0) {
            osc.detune.setValueAtTime(detune, time);
        }

        gain.gain.setValueAtTime(0, time);
        gain.gain.setTargetAtTime(volume, time, attack);
        gain.gain.setTargetAtTime(0, time + attack, decay);

        osc.connect(gain);
        gain.connect(destination);

        osc.start(time);
        osc.stop(time + duration);

        osc.onended = () => safeDisconnect([osc, gain]);
    } catch {
        /* ignore audio errors */
    }
}

// --- Shared seeded humanization (synth-audit Epic 0 S6) ---------------------
//
// Real players never repeat a note byte-identically: micro-timing, velocity
// and pitch all wander a little. Before S6 the only humanization was a single
// shared `Math.random()` timing jitter computed once per scheduler tick in
// `scheduler-core.ts` and reused by the whole rhythm section — so every
// instrument shifted in lockstep and repeated notes within a voice were
// uniform. `humanizeNote` replaces that with independent, *seeded* per-note
// draws so each instrument breathes on its own and looped playback / critique
// tests still reproduce exactly.

/**
 * Per-instrument humanization character. Each spread is the ± maximum at full
 * strength (the `groove.humanize` knob = 100); the caller passes
 * `groove.humanize / 100` as the `scale` argument to `humanizeNote`.
 */
export interface HumanizeProfile {
    /** ± timing deviation, in seconds. */
    readonly timeSpread: number;
    /** ± velocity deviation, as a fraction (0.08 = ±8%). */
    readonly velSpread: number;
    /** ± pitch detune, in cents. */
    readonly detuneSpread: number;
}

/** One note's humanization offsets — three independent seeded draws. */
export interface HumanizedNote {
    /** Seconds to add to the scheduled start time. */
    readonly timeOffset: number;
    /** Factor to multiply the note velocity by (centered on 1.0). */
    readonly velocityMult: number;
    /** Cents to add to the note's detune. */
    readonly detuneCents: number;
}

/**
 * Per-instrument feel profiles. A drummer plays tighter than a soloist, so the
 * spreads widen across `drums → bass → chords → harmonies → soloist`. Drums
 * carry no detune (the kit voices have no meaningful pitch in this sense).
 *
 * S6 wires `drums` as the first consumer; the soloist and bass profiles are
 * applied by Epics 3 and 5, chords/harmonies by Epics 2 and 1.
 */
export const HUMANIZE_PROFILES: Record<string, HumanizeProfile> = {
    drums: { timeSpread: 0.01, velSpread: 0.08, detuneSpread: 0 },
    bass: { timeSpread: 0.014, velSpread: 0.1, detuneSpread: 3 },
    chords: { timeSpread: 0.016, velSpread: 0.1, detuneSpread: 4 },
    harmonies: { timeSpread: 0.018, velSpread: 0.1, detuneSpread: 5 },
    soloist: { timeSpread: 0.022, velSpread: 0.12, detuneSpread: 7 },
};

/**
 * Compose a deterministic integer seed from a note's identity. Distinct
 * `(step, instrument, voiceIndex)` triples map to well-separated seeds, so
 * each instrument — and each voice within it — draws an independent stream.
 * `voiceIndex` is any integer discriminator (a chord-tone index, or a hashed
 * drum-piece name).
 */
export const humanizeSeed = (step: number, instrument: string, voiceIndex: number): number =>
    (Math.imul(step + 1, 0x9e3779b1) ^
        stringHash31(instrument) ^
        Math.imul(voiceIndex + 1, 0x85ebca77)) |
    0;

/**
 * Seeded per-note humanization. Returns three *independent* offsets — timing,
 * velocity, detune — drawn from `seed` via `scrambleHash`.
 *
 * `scale` (default 1) is the `groove.humanize / 100` knob: at 0 the result is
 * a no-op (`timeOffset` 0, `velocityMult` 1, `detuneCents` 0). Deterministic —
 * the same seed always yields the same offsets, so looped playback and
 * critique tests reproduce exactly.
 */
export function humanizeNote(seed: number, profile: HumanizeProfile, scale = 1): HumanizedNote {
    // Three independent draws off one seed: XOR with distinct constants so
    // timing, velocity and detune don't move in lockstep.
    const rTime = scrambleHash(seed);
    const rVel = scrambleHash(seed ^ 0x9e3779b9);
    const rDetune = scrambleHash(seed ^ 0x85ebca6b);
    return {
        timeOffset: (rTime - 0.5) * 2 * profile.timeSpread * scale,
        velocityMult: 1 + (rVel - 0.5) * 2 * profile.velSpread * scale,
        detuneCents: (rDetune - 0.5) * 2 * profile.detuneSpread * scale,
    };
}

// --- Shared velocity → timbre mapping (synth-audit Epic 0 S7) ---------------
//
// The #1 cross-cutting "toy" tell: velocity drives loudness but never
// brightness. A real instrument hit harder gets *brighter* — more open, more
// harmonics — not just louder. `velocityTimbre` is the shared mapping every
// voice uses to turn a note's velocity into timbre controls: a filter-cutoff
// multiplier and a saturation-drive amount, shaped by a tunable curve.
//
// S7 lands the helper + one worked example (the `new` bass voice). Epics 2–5
// apply it per voice.

/** Tuning for `velocityTimbre`. All fields optional — the defaults are sane. */
export interface VelocityTimbreOptions {
    /**
     * Exponent applied to the 0..1 velocity before mapping. `1` is linear;
     * `<1` is concave (soft notes already open up — a quick, forgiving feel);
     * `>1` is convex (soft notes stay dark, the timbre only blooms on hard
     * hits — how most acoustic instruments behave). Default `1.5`.
     */
    readonly curve?: number;
    /**
     * `[atSoft, atHard]` filter-cutoff multiplier — the factor to apply to a
     * voice's base cutoff at velocity 0 vs velocity 1. Default `[0.5, 1.5]`.
     */
    readonly cutoffRange?: readonly [number, number];
    /**
     * `[atSoft, atHard]` saturation drive, 0..1 — how hard to push a voice's
     * waveshaper / pre-gain. Default `[0, 1]`.
     */
    readonly driveRange?: readonly [number, number];
}

/** The timbre controls derived from one note's velocity. */
export interface VelocityTimbre {
    /** The curve-shaped velocity, 0..1 — a general-purpose brightness scalar. */
    readonly brightness: number;
    /** Multiply a lowpass/voice cutoff by this — harder hit, brighter. */
    readonly cutoffMult: number;
    /** Saturation drive, 0..1 — harder hit, more harmonics. */
    readonly drive: number;
}

/**
 * Map a note's velocity to timbre controls. `velocity` is clamped to 0..1,
 * shaped through `options.curve`, then mapped linearly into the cutoff and
 * drive ranges. Pure and deterministic — no allocation beyond the small
 * returned object, safe to call per note.
 */
export function velocityTimbre(
    velocity: number,
    options: VelocityTimbreOptions = {},
): VelocityTimbre {
    // Defensive coercion: this is a shared helper Epics 2–5 all call, so a
    // non-finite velocity/curve must not propagate NaN into a filter cutoff.
    const rawCurve = options.curve ?? 1.5;
    const curve = Number.isFinite(rawCurve) && rawCurve > 0 ? rawCurve : 1.5;
    const [cutLo, cutHi] = options.cutoffRange ?? [0.5, 1.5];
    const [driveLo, driveHi] = options.driveRange ?? [0, 1];
    const v = Number.isFinite(velocity) ? Math.min(1, Math.max(0, velocity)) : 0;
    const brightness = curve === 1 ? v : v ** curve;
    return {
        brightness,
        cutoffMult: cutLo + brightness * (cutHi - cutLo),
        drive: driveLo + brightness * (driveHi - driveLo),
    };
}
