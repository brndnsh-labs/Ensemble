import type { AudioGraph, EnsembleState } from '../types.js';
import { getMidi } from '../utils.js';
import { safeDisconnect } from './audio-graph-utils.js';
import { scrambleHash, stringHash31 } from './hash-utils.js';
import { getPackZones } from './pack-runtime.js';
import { foldToSampledCeiling, pickZone, type SampleZone } from './sample-voice.js';

/**
 * Standardized WebAudio utilities for instrument synthesis.
 *
 * `safeDisconnect` / `createSoftClipCurve` / `clampFreq` live in the leaf module
 * `audio-graph-utils.ts`, NOT here — this module imports from `sample-voice.ts`,
 * which needs `safeDisconnect`, and keeping them here formed a genuine import
 * cycle. Import them from the leaf; don't re-export them through this file, or
 * the cycle comes straight back. (#1192)
 */

export interface ResolvedSampledZone {
    audio: AudioContext;
    dest: GainNode;
    zone: SampleZone;
    targetMidi: number;
}

/**
 * Shared zone-resolution prologue for sampled-pack voices (#996): converts a
 * scheduled frequency to a MIDI target, folds it to the pack's sampled
 * ceiling, and picks the nearest loaded zone. Returns `null` when the audio
 * graph/zones aren't ready or the note is unplayable — callers fall back to
 * their synth voice in that case, same as before this was shared.
 */
export function resolveSampledZone(
    state: EnsembleState,
    graphKey: Extract<keyof AudioGraph, 'bass' | 'soloist' | 'harmonies'>,
    packId: string,
    freq: number,
): ResolvedSampledZone | null {
    const { playback } = state;
    const audio = playback.audio;
    const dest = playback.audioGraph?.[graphKey]?.gain;
    const zones = getPackZones(packId);
    if (!audio || !dest || !zones || zones.length === 0 || !Number.isFinite(freq) || freq <= 0) {
        return null;
    }
    // `getMidi`'s null path is unreachable here: the guard above already
    // rejects non-finite and non-positive `freq`.
    const targetMidi = foldToSampledCeiling(getMidi(freq) as number, zones);
    const zone = pickZone(zones, targetMidi);
    if (!zone) {
        return null;
    }
    return { audio, dest, zone, targetMidi };
}

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

/**
 * Optional two-stage decay (synth-audit Epic 4 S8). With only `decay`, a voice
 * does one flat exponential to silence. Supply BOTH `holdTime` and `bodyDecay`
 * and the envelope hands off: the fast `decay` shapes the initial transient,
 * then `holdTime` seconds after the attack a second `setTargetAtTime` with the
 * slower `bodyDecay` time-constant takes over the tail — a transient + body,
 * like a real struck drum, instead of a single curve. Both targets are 0, so
 * the stage-1→stage-2 handoff is continuous (no click); it only changes slope.
 * A voice that passes neither is bit-identical to the pre-S8 single-stage
 * envelope.
 *
 * `setTargetAtTime` is an exponential approach — it never reaches 0 — so a
 * caller that opts in MUST set `duration` long enough that the `bodyDecay` tail
 * has decayed below the click floor before the node's hard `stop()`; ~5
 * time-constants past `holdTime` is the rule of thumb. Otherwise the stop cuts
 * an audible residual and ticks.
 */
interface TwoStageDecayOptions {
    holdTime?: number;
    bodyDecay?: number;
}

interface PercussiveStrikeOptions extends TwoStageDecayOptions {
    volume?: number;
    filterType?: BiquadFilterType;
    freq?: number;
    Q?: number;
    attack?: number;
    decay?: number;
    duration?: number;
    /**
     * Optional cleanup callback fired once the strike has fully finished — after the
     * helper disconnects its own `[source, filter, gain]` chain. Lets a caller free a
     * node it owns (e.g. a per-hit `StereoPannerNode`) without the helper needing to
     * know about it. Fires even when the helper bails early (null buffer) or throws,
     * so the caller's cleanup is guaranteed to run exactly once.
     */
    onEnded?: () => void;
    /**
     * Optional read position (seconds) into `buffer`. When > 0 the source plays from
     * that offset with `loop` enabled, so a caller can draw a different slice of a
     * long colored-noise buffer per hit (synth-audit Epic 4 S7) and kill the "every
     * hit is the identical noise slice" tell. Default `0` — identical to the
     * pre-S7 `source.start(time)` behavior, so the frozen `current` voices that
     * never pass it are bit-unchanged.
     */
    bufferOffset?: number;
}

/**
 * Schedule the optional S8 body tail on an already-running decay envelope.
 * `decayStart` is the moment the first-stage decay began (`time + attack`).
 * A no-op unless BOTH `holdTime` and `bodyDecay` are finite and positive — so
 * a single-stage caller is bit-unchanged. The second `setTargetAtTime` also
 * targets 0, picking up from whatever value the transient decay has reached at
 * `decayStart + holdTime`, so the handoff only changes slope (no discontinuity).
 */
function applyBodyTail(
    param: AudioParam,
    decayStart: number,
    holdTime?: number,
    bodyDecay?: number,
): void {
    if (
        holdTime === undefined ||
        bodyDecay === undefined ||
        !Number.isFinite(holdTime) ||
        !Number.isFinite(bodyDecay) ||
        holdTime <= 0 ||
        bodyDecay <= 0
    ) {
        return;
    }
    param.setTargetAtTime(0, decayStart + holdTime, bodyDecay);
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
        onEnded,
        bufferOffset = 0,
        holdTime,
        bodyDecay,
    }: PercussiveStrikeOptions = {},
): void {
    if (!audio || !buffer || !destination) {
        onEnded?.();
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
        applyBodyTail(gain.gain, time + attack, holdTime, bodyDecay);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(destination);

        // A finite, positive offset reads a per-hit slice of a long colored-noise
        // buffer (S7); `loop` lets the short strike wrap rather than run dry near
        // the buffer end. Offset 0 (every `current` caller) → plain `start(time)`.
        const offset = Number.isFinite(bufferOffset) && bufferOffset > 0 ? bufferOffset : 0;
        if (offset > 0) {
            source.loop = true;
        }
        source.start(time, offset);
        source.stop(time + duration);

        source.onended = () => {
            safeDisconnect([source, filter, gain]);
            onEnded?.();
        };
    } catch {
        /* ignore audio errors */
        onEnded?.();
    }
}

interface ResonantToneOptions extends TwoStageDecayOptions {
    type?: OscillatorType;
    freqStart?: number;
    freqEnd?: number;
    rampDuration?: number;
    volume?: number;
    attack?: number;
    decay?: number;
    duration?: number;
    detune?: number;
    /**
     * Optional cleanup callback fired once the tone has fully finished — after the
     * helper disconnects its own `[osc, gain]` chain. See `PercussiveStrikeOptions.onEnded`.
     * Fires even when the helper bails early or throws, so it runs exactly once.
     */
    onEnded?: () => void;
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
        onEnded,
        holdTime,
        bodyDecay,
    }: ResonantToneOptions = {},
): void {
    if (!audio || !destination) {
        onEnded?.();
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
        applyBodyTail(gain.gain, time + attack, holdTime, bodyDecay);

        osc.connect(gain);
        gain.connect(destination);

        osc.start(time);
        osc.stop(time + duration);

        osc.onended = () => {
            safeDisconnect([osc, gain]);
            onEnded?.();
        };
    } catch {
        /* ignore audio errors */
        onEnded?.();
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
