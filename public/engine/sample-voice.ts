/**
 * synth-audit Epic 6 (Packs) S5 — pitched sample playback.
 *
 * Sampled *drums* reuse `playPercussiveStrike` (it already takes an
 * `AudioBuffer`). Pitched instruments — chords/piano, harmony/strings,
 * soloist/brass — need this: play a decoded sample buffer at an arbitrary
 * target pitch by `playbackRate`-shifting from the nearest multi-sampled zone,
 * through a click-free envelope, into the instrument's existing `[name]Gain`
 * bus so it inherits that bus's EQ, reverb send, and limiting — the identical
 * downstream signal path the synth voice uses.
 *
 * S5 ships the primitive + zone selection; S6 supplies a real pack's zone
 * metadata and flips the S1 entry-point seams from synth-fallback to calling
 * `playSampledNote`.
 */

import { safeDisconnect } from '../utils.js';
import { scrambleHash } from './hash-utils.js';

/**
 * Sanity ceiling on the envelope peak (see `playSampledNote`). Lets a loudness-
 * calibrated pad play above unity while bounding a config-typo blast; the real
 * catalog gains (grand ~0.5×, sax ≤1×, strings ~4–5×) sit below it.
 */
const MAX_SAMPLE_PEAK = 8;

/** A pitched sample zone: a decoded buffer recorded at a known root pitch. */
export interface SampleZone {
    /**
     * The buffer's *measured* fundamental, in MIDI units — playbackRate 1.0 plays
     * in tune here. This is intentionally **fractional** (e.g. `45.18`), not the
     * nearest integer note: a real recording's true pitch sits a few to tens of
     * cents off its nominal note, and since `pitchRatio` shifts by exact ratios,
     * rounding the root to an integer bakes that offset in as constant detuning on
     * every note routed through the zone (the upright-bass #697 "occasionally out
     * of tune" bug). Store the measured value; let the ratio cancel the offset.
     */
    readonly rootMidi: number;
    readonly buffer: AudioBuffer;
}

/**
 * A handle to a playing percussion voice ({@link playSampledStrike}), letting a
 * later hit cut it short — a hi-hat choke (#679): the same physical hi-hat can't
 * ring open while it plays closed, so a closed/pedal hit silences the open ring.
 */
export interface SampleVoiceHandle {
    /**
     * Cut the voice to silence starting at `when` (the choking hit's onset).
     * Cancels the remaining envelope and smoothly ramps the gain to ~0, then
     * stops the source — the natural `onended` cleanup still fires exactly once.
     */
    choke(when: number): void;
}

/**
 * Handle returned by {@link playSampledNote} so a caller can release the voice
 * early — used by the chords seam (#691) to clear the previous voicing when the
 * harmony changes, so a sustained pack (e.g. the Drawbar Organ, which holds flat
 * at full level for its whole duration) doesn't ring into the next chord.
 */
export interface SampledNoteHandle {
    /**
     * Begin releasing the voice to silence at `when`, over ~`fade` seconds.
     * Cancels the remaining envelope; the natural `onended` cleanup still fires
     * once. No-op-safe if the voice has already ended.
     */
    release(when: number, fade: number): void;
}

/** Time constant for the choke ramp — ~3·tc ≈ 12 ms to inaudible, click-free. */
const CHOKE_TC = 0.004;

/**
 * Continuous pitch vibrato for a sampled note (#744 Slice 1) — the lead-voice
 * "sing/cry" the fixed-`playbackRate` seam couldn't express. Rendered as an LFO
 * summed onto `BufferSource.playbackRate`, so it works in any context (live or
 * offline export) and inherits the instrument bus like the rest of the voice.
 */
export interface SampleVibrato {
    /** Peak pitch deviation, in cents (±). ~18c reads as expressive, not seasick. */
    readonly depthCents: number;
    /** LFO rate, in Hz. Instrumental vibrato sits ~5–7 Hz regardless of tempo. */
    readonly rateHz: number;
    /** Seconds before the depth fades in — keeps the attack transient clean. */
    readonly delay?: number;
    /** Seconds over which depth ramps from 0 to full after the delay. */
    readonly ramp?: number;
}

export interface SampledNoteOptions {
    /** Linear attack ramp (s). */
    readonly attack?: number;
    /** Linear release ramp (s) after the held duration. */
    readonly release?: number;
    /** 0..1 → envelope peak gain. */
    readonly velocity?: number;
    /** Seconds the note is held at peak before the release ramp. */
    readonly duration?: number;
    /** Opt-in continuous pitch vibrato (#744). Omitted → fixed pitch, as before. */
    readonly vibrato?: SampleVibrato;
    /** Opt-in pitch bend — bend-in and/or bend-and-release (#744 Slice 2). */
    readonly bend?: SampleBend;
    /**
     * Opt-in per-pack tone-correction tilt in dB (#755) — positive brightens,
     * negative darkens. Omitted/`0`/non-finite leaves the path un-filtered.
     */
    readonly tone?: number;
    readonly onEnded?: () => void;
}

/**
 * Tilt pivot (Hz) — the hinge between the low-shelf cut and high-shelf lift.
 * ~800 Hz sits near the median centroid of the pro-mix reference corpus, so a
 * tilt re-weights brightness around the musical mid without skewing the low
 * fundamentals or the air band.
 */
const TONE_TILT_PIVOT_HZ = 800;

/**
 * Build a per-pack tone-correction tilt (#755): a paired low-shelf/high-shelf
 * that re-weights a sampled voice's brightness so it sits right through the bus
 * EQ authored around the synth voice. One dB number — positive = brighter
 * (high-shelf +tilt/2, low-shelf −tilt/2), negative = darker. The symmetric
 * ±tilt/2 around the pivot keeps it roughly level-preserving, so it shapes tone
 * without re-opening the pack's `gain` calibration. Returns the chain's
 * `{ input, output, nodes }`, or `null` for a missing/zero/non-finite tilt so
 * the caller keeps the un-filtered path byte-identical.
 */
export function buildToneTilt(
    audio: AudioContext,
    tiltDb: number | undefined,
): { input: AudioNode; output: AudioNode; nodes: AudioNode[] } | null {
    if (!audio || !Number.isFinite(tiltDb) || !tiltDb) {
        return null;
    }
    const half = (tiltDb as number) / 2;
    const lowShelf = audio.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = TONE_TILT_PIVOT_HZ;
    lowShelf.gain.value = -half;
    const highShelf = audio.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = TONE_TILT_PIVOT_HZ;
    highShelf.gain.value = half;
    lowShelf.connect(highShelf);
    return { input: lowShelf, output: highShelf, nodes: [lowShelf, highShelf] };
}

/**
 * The `playbackRate` ratio that shifts a buffer recorded at `rootMidi` to sound
 * at `targetMidi`: `2^(semitones/12)`. Unity at the root, 2× an octave up,
 * 0.5× an octave down — equal-tempered, so it is exactly in tune at any target.
 */
export function pitchRatio(rootMidi: number, targetMidi: number): number {
    return 2 ** ((targetMidi - rootMidi) / 12);
}

/**
 * Pick the zone whose root is nearest the target pitch — minimizes the
 * playback-rate shift distance (and thus the timbral/formant error of
 * stretching a sample far from where it was recorded). On a tie, prefers the
 * lower root (shifting up reads slightly brighter — the conventional
 * multisample choice). Returns `null` for an empty zone set.
 */
export function pickZone(zones: readonly SampleZone[], targetMidi: number): SampleZone | null {
    let best: SampleZone | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const zone of zones) {
        const dist = Math.abs(zone.rootMidi - targetMidi);
        if (dist < bestDist) {
            best = zone;
            bestDist = dist;
        }
    }
    return best;
}

/**
 * Fold a target note down by whole octaves so it never sits more than
 * `maxUpshift` semitones above the pack's highest sampled zone (#755). An
 * instrument's register can exceed its pack's sampled range — the soloist runs
 * to MIDI 90 but nylon tops out at 84, sax at 79; harmony runs to 84 but the
 * strings top at 74 — so without this the top zone gets pitch-shifted *up*
 * several semitones, and upward-resampling a plucked/blown sample rings thin and
 * metallic (aliasing + a shifted formant), which a brightening tone tilt then
 * drags into earshot. Folding by octaves keeps the pitch class (musically
 * coherent — the same note, an octave down) while landing on a zone the sampler
 * plays near unity. `maxUpshift` (default 2 ≈ the inter-zone spacing) lets a note
 * a tone above the top sample still shift up like any in-range note rather than
 * jumping an octave. In-range notes return unchanged, so the fold only ever
 * touches notes that would otherwise alias upward.
 */
export function foldToSampledCeiling(
    targetMidi: number,
    zones: readonly SampleZone[],
    maxUpshift = 2,
): number {
    if (zones.length === 0) {
        return targetMidi;
    }
    let topRoot = Number.NEGATIVE_INFINITY;
    for (const zone of zones) {
        if (zone.rootMidi > topRoot) {
            topRoot = zone.rootMidi;
        }
    }
    const ceiling = topRoot + maxUpshift;
    let midi = targetMidi;
    while (midi > ceiling) {
        midi -= 12;
    }
    return midi;
}

/**
 * Deterministic round-robin pick over a zone's alternate takes (#657). Given a
 * seed composed from the playing position (e.g. `barIndex`/`step`, per the
 * deterministic-phrasing rule — never `Math.random`), returns the take to play.
 *
 * Uses `scrambleHash` rather than a bare `seed % length`: a raw modulo locks the
 * choice to a fixed grid pattern (take 0 on every downbeat, say), which is its
 * own kind of machine-gun; scrambling decorrelates the take from the beat while
 * staying fully reproducible — the same seed always yields the same take, so
 * looped playback and the unit test are byte-stable. Returns `null` only for an
 * empty set; a single-take zone always returns that take.
 */
export function pickRoundRobin<T>(takes: readonly T[], seed: number): T | null {
    if (takes.length === 0) {
        return null;
    }
    const idx = Math.floor(scrambleHash(seed) * takes.length);
    // scrambleHash is [0,1); floor keeps idx in [0, length-1]. Guard the 1.0
    // edge (unreachable in practice) so we never index past the end.
    return takes[Math.min(idx, takes.length - 1)];
}

/**
 * Play a finished percussion recording through the drum bus — the sampled-drum
 * primitive (#662). Unlike {@link playSampledNote} it does *not* pitch-shift
 * (a kick/snare/cymbal plays at its recorded pitch) and unlike
 * `playPercussiveStrike` it does *not* bandpass-filter or noise-shape the
 * source — that helper sculpts synth white-noise into a drum; here the buffer
 * is already a real drum hit, so we let it through uncolored, the whole
 * recording, behind only a click-suppressing attack/release ramp. Connects to
 * `destination` (the per-hit drum panner → `drums.gain` bus) so it inherits the
 * bus's EQ, reverb send, ducking, and limiting — the identical downstream path
 * the synth drum voice uses.
 *
 * `duration` defaults to the buffer's full length so the natural decay tail
 * rings out; callers fold the pack's calibrated `gainForPack` into `velocity`.
 * Returns a {@link SampleVoiceHandle} so a later hit can choke this one (hi-hat
 * choke, #679), or `null` when it bails (firing `onEnded`) on a missing
 * context/buffer/destination — the same graceful-fallback contract as
 * `playSampledNote`.
 */
/**
 * Click-free attack/hold/release gain envelope shared by `playSampledStrike`
 * and `playSampledNote`: linear ramp to `peak`, hold, linear ramp to silence.
 * Anchoring `releaseStart` at >= the attack end keeps a very short note from
 * inverting the ramp order. Returns `releaseStart` so callers can derive their
 * own natural-end/stop time.
 */
function scheduleEnvelope(
    gain: GainNode,
    startTime: number,
    peak: number,
    attack: number,
    hold: number,
    release: number,
): number {
    const releaseStart = Math.max(startTime + attack, startTime + hold);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + attack);
    gain.gain.setValueAtTime(peak, releaseStart);
    gain.gain.linearRampToValueAtTime(0, releaseStart + release);
    return releaseStart;
}

export function playSampledStrike(
    audio: AudioContext,
    buffer: AudioBuffer | null,
    destination: AudioNode,
    time: number,
    {
        attack = 0.002,
        release = 0.01,
        velocity = 1,
        duration,
        onEnded,
    }: Omit<SampledNoteOptions, 'duration'> & { duration?: number } = {},
): SampleVoiceHandle | null {
    if (!audio || !buffer || !destination) {
        onEnded?.();
        return null;
    }

    try {
        const startTime = Number.isFinite(time) ? time : audio.currentTime;
        // Hold the whole recording by default — a real cymbal/snare carries its
        // own decay, so cutting it short (the way the synth strike's envelope
        // does) would amputate the tail. A caller can pass a shorter `duration`
        // to choke a hit (e.g. a closed hat).
        const hold =
            Number.isFinite(duration) && (duration as number) > 0
                ? (duration as number)
                : buffer.duration;
        // Same over-unity ceiling as playSampledNote: a loudness-calibrated kit
        // folds gainForPack into velocity and may sit above 1.0; the bus limiter
        // catches stacked peaks, MAX_SAMPLE_PEAK bounds a config typo.
        const peak = Number.isFinite(velocity)
            ? Math.max(0, Math.min(MAX_SAMPLE_PEAK, velocity))
            : 1;

        const source = audio.createBufferSource();
        source.buffer = buffer;

        const gain = audio.createGain();
        const releaseStart = scheduleEnvelope(gain, startTime, peak, attack, hold, release);

        source.connect(gain);
        gain.connect(destination);

        source.onended = () => {
            safeDisconnect([source, gain]);
            onEnded?.();
        };

        const naturalEnd = releaseStart + release + 0.01;
        source.start(startTime);
        source.stop(naturalEnd);

        return {
            choke(when: number) {
                try {
                    // Clamp into the voice's live window: never before it starts,
                    // and a no-op once it's already past its natural stop.
                    const at = Number.isFinite(when)
                        ? Math.max(startTime, Math.min(when, naturalEnd))
                        : audio.currentTime;
                    // Cancel the pending envelope and ease the gain to silence from
                    // wherever it currently sits (setTargetAtTime starts at the live
                    // value → no click), then stop the source just past silence so it
                    // self-frees via `onended`. stop() may have already fired on a
                    // natural end — the try/catch swallows the InvalidState throw.
                    gain.gain.cancelScheduledValues(at);
                    gain.gain.setTargetAtTime(0, at, CHOKE_TC);
                    // Never push the stop later than the natural end — a choke
                    // arriving in the final tail should only ever shorten it.
                    source.stop(Math.min(naturalEnd, at + CHOKE_TC * 8));
                } catch {
                    /* already stopped / closed context — nothing to choke */
                }
            },
        };
    } catch {
        /* ignore audio errors (e.g. a closed context) */
        onEnded?.();
        return null;
    }
}

/**
 * Attach a pitch-vibrato LFO to a playing buffer source (#744 Slice 1). The LFO
 * sums onto `playbackRate` (Web Audio param summing): the base ratio holds the
 * note in tune, the LFO wobbles around it. `playbackRate` is a *ratio* and the
 * LFO sums (linearly) onto it, so the depth gain is `baseRate · (2^(cents/1200)
 * − 1)`: the sharp peak lands at exactly +`depthCents`, the flat trough a
 * fraction of a cent deeper (additive-on-ratio asymmetry, far below the ~5c
 * JND). Depth is held at 0 through the attack, then ramps in (mirroring the
 * synth voice's vibrato delay) so only the sustained tail moves. Returns the
 * created nodes so the caller folds them into its `onended` cleanup. No-op
 * (returns `[]`) for a non-positive depth/rate, or a note too short to fade in.
 */
function attachSampleVibrato(
    audio: AudioContext,
    rate: AudioParam,
    baseRate: number,
    spec: SampleVibrato,
    startTime: number,
    endTime: number,
): AudioNode[] {
    if (!(spec.depthCents > 0) || !(spec.rateHz > 0) || !Number.isFinite(baseRate)) {
        return [];
    }
    const depthRatio = baseRate * (2 ** (spec.depthCents / 1200) - 1);
    if (!(depthRatio > 0)) {
        return [];
    }
    // Fit the fade-in inside the note. A note shorter than delay+ramp would stop
    // before the depth ever ramps up, so the LFO would cost a node for zero
    // audible vibrato. We compress delay/ramp into the available window (so a
    // short sustained note still blooms within its life) and bail outright when
    // there's no window at all. Today's only caller gates on sustained notes, so
    // no compression happens in practice — this keeps the primitive honest for
    // the wider callers Slices 2–3 will add.
    const noteWindow = endTime - startTime;
    if (!(noteWindow > 0)) {
        return [];
    }
    const wantDelay = Math.max(0, Number.isFinite(spec.delay) ? (spec.delay as number) : 0.1);
    const wantRamp = Math.max(0.01, Number.isFinite(spec.ramp) ? (spec.ramp as number) : 0.3);
    const delay = Math.min(wantDelay, noteWindow * 0.5);
    const ramp = Math.min(wantRamp, Math.max(0.001, noteWindow - delay));

    const lfo = audio.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(spec.rateHz, startTime);

    const lfoGain = audio.createGain();
    lfoGain.gain.setValueAtTime(0, startTime);
    lfoGain.gain.setValueAtTime(0, startTime + delay);
    lfoGain.gain.linearRampToValueAtTime(depthRatio, startTime + delay + ramp);

    lfo.connect(lfoGain);
    lfoGain.connect(rate);
    lfo.start(startTime);
    lfo.stop(endTime);
    return [lfo, lfoGain];
}

/**
 * A pitch-bend gesture for a sampled note (#744 Slice 2). Covers both shapes the
 * soloist needs, rendered as automation on `BufferSource.playbackRate`:
 *  - **bend-in** (`fromSemitones`): start the note off-pitch and ramp *to* it —
 *    the existing `bendStartInterval` scalar, finally rendered on the sampled
 *    seam (it was synth-only before this slice).
 *  - **bend-and-release** (`peakSemitones` + fractions): hold the written pitch, bend
 *    *up* to a peak, and (with `releaseFrac`) come back — the blues "cry".
 * The two compose; a vibrato LFO (if any) sums on top of whatever the bend is
 * doing, so a held bend can still shimmer.
 */
export interface SampleBend {
    /** Start offset from the target, in semitones (bend-IN). 0/omit = start in tune. */
    fromSemitones?: number;
    /** Peak offset *above* the target for a bend-and-release. 0/omit = no up-bend. */
    peakSemitones?: number;
    /** When the up-bend leaves the note (0..1 of hold). */
    onsetFrac?: number;
    /** When it reaches the peak (0..1 of hold). */
    peakFrac?: number;
    /** When it returns to the target (0..1 of hold). Omit = hold the peak. */
    releaseFrac?: number;
    /**
     * Bend-IN glide duration in seconds. Omit → the default short scoop glide
     * (`min(0.1, hold·0.5)`). A guitar legato slur (hammer-on/pull-off) passes a
     * short value (~0.04s) so the pitch snaps into place like a fretted slur, not
     * a slow scoop. Only affects the `fromSemitones` glide, never the cry's
     * up-bend timing (which stays fraction-of-hold based). #855.
     */
    inSeconds?: number;
}

/** Clamp to [0,1], mapping a non-finite input to the given fallback. */
export function clampFrac(v: number | undefined, fallback: number): number {
    const n = Number.isFinite(v) ? (v as number) : fallback;
    return Math.max(0, Math.min(1, n));
}

/**
 * Schedule a pitch bend onto `rate` (a `BufferSource.playbackRate`). `playbackRate`
 * is a ratio, so a semitone offset `s` is `baseRate · 2^(s/12)`; we ramp
 * *exponentially* between ratios because exponential-in-ratio is linear-in-pitch
 * (a musically even glide). All ratios are positive, so the exponential ramp is
 * always legal. Establishes the param's base value itself, so the caller skips
 * its own `setValueAtTime(baseRate)` when a bend is present. Returns nothing —
 * it only writes automation; the LFO vibrato sums on top.
 */
function scheduleSampleBend(
    rate: AudioParam,
    baseRate: number,
    bend: SampleBend,
    startTime: number,
    hold: number,
): void {
    const ratioAt = (semis: number) => baseRate * 2 ** (semis / 12);
    const dur = hold > 0 ? hold : 0;

    // Bend-IN: start off-target and ramp to the written pitch over a short, fixed
    // glide (matches the synth voice's `min(0.1, dur*0.5)`); else anchor at base.
    const from = Number.isFinite(bend.fromSemitones) ? (bend.fromSemitones as number) : 0;
    // A legato slur passes an explicit short glide (`inSeconds`); otherwise the
    // scoop's default tempo-relative glide, capped at 0.1s. Floored at 5ms so the
    // exponential ramp always spans a real interval.
    const glide = Number.isFinite(bend.inSeconds)
        ? Math.max(0.005, bend.inSeconds as number)
        : Math.min(0.1, dur * 0.5 || 0.1);
    const bendInEnd = startTime + glide;
    if (from !== 0) {
        rate.setValueAtTime(ratioAt(from), startTime);
        rate.exponentialRampToValueAtTime(baseRate, bendInEnd);
    } else {
        rate.setValueAtTime(baseRate, startTime);
    }

    // Bend-and-release: hold the written pitch to `onset`, bend up to `peak`, and
    // (if a release is given) ramp back. Times are kept strictly increasing so
    // the ramps never invert. No-op for a zero/negative peak or a zero-length note.
    // When a bend-IN is also present, the onset anchor is pushed past the glide's
    // end so the re-anchor never truncates the in-progress bend-in — the two
    // genuinely compose (the producer keeps them exclusive today, but the
    // primitive stays honest for the wider callers Slice 3 adds).
    const peak = Number.isFinite(bend.peakSemitones) ? (bend.peakSemitones as number) : 0;
    if (peak > 0 && dur > 0) {
        const rawOnset = startTime + clampFrac(bend.onsetFrac, 0.2) * dur;
        const onsetT = from !== 0 ? Math.max(rawOnset, bendInEnd + 0.01) : rawOnset;
        const peakT = Math.max(onsetT + 0.01, startTime + clampFrac(bend.peakFrac, 0.5) * dur);
        rate.setValueAtTime(baseRate, onsetT);
        rate.exponentialRampToValueAtTime(ratioAt(peak), peakT);
        if (Number.isFinite(bend.releaseFrac)) {
            const relT = Math.max(
                peakT + 0.01,
                startTime + clampFrac(bend.releaseFrac, 0.85) * dur,
            );
            rate.exponentialRampToValueAtTime(baseRate, relT);
        }
    }
}

/**
 * Play a pitched sample through an instrument bus. Pitch-shifts the given zone
 * to `targetMidi` via `playbackRate`, applies a click-free attack/hold/release
 * gain envelope, and connects to `destination` (the instrument's `[name]Gain`
 * node) so it inherits that bus's EQ, reverb send, and limiting.
 *
 * Bails (firing `onEnded`) on a missing context, buffer, or destination — the
 * graceful-fallback contract the registry relies on.
 */
export function playSampledNote(
    audio: AudioContext,
    zone: SampleZone,
    destination: AudioNode,
    targetMidi: number,
    time: number,
    {
        attack = 0.005,
        release = 0.08,
        velocity = 1,
        duration = 0.5,
        vibrato,
        bend,
        tone,
        onEnded,
    }: SampledNoteOptions = {},
): SampledNoteHandle | null {
    if (!audio || !zone?.buffer || !destination) {
        onEnded?.();
        return null;
    }

    try {
        // Sanitize the scheduling inputs so a stray non-finite value (e.g. an
        // undefined upstream state field) can't push NaN into an AudioParam.
        // `Math.min(…, NaN)` is NaN, so velocity needs an explicit finite check.
        const startTime = Number.isFinite(time) ? time : audio.currentTime;
        const hold = Number.isFinite(duration) && duration > 0 ? duration : 0;
        // The envelope peak may exceed unity: callers fold a pack's loudness gain
        // (`gainForPack`) into `velocity`, and a quietly-recorded pad (the #660
        // string ensemble) must play *above* 1.0 to sit at the synth voice's seat.
        // Over-unity envelope gain is normal for a loudness-calibrated sampler; the
        // instrument bus limiter catches peaks. `MAX_SAMPLE_PEAK` is a sanity
        // ceiling (a config typo can't blast) well above any real catalog gain —
        // the grand (~0.5×) and sax (≤1×) sit far below it, so they're unaffected.
        const peak = Number.isFinite(velocity)
            ? Math.max(0, Math.min(MAX_SAMPLE_PEAK, velocity))
            : 1;

        const source = audio.createBufferSource();
        source.buffer = zone.buffer;
        const baseRate = pitchRatio(zone.rootMidi, targetMidi);
        // A bend writes the full playbackRate timeline itself (incl. the base
        // anchor); without one we just hold the base. A vibrato LFO, if present,
        // sums on top of whichever the bend leaves on the param.
        if (bend) {
            scheduleSampleBend(source.playbackRate, baseRate, bend, startTime, hold);
        } else {
            source.playbackRate.setValueAtTime(baseRate, startTime);
        }

        const gain = audio.createGain();
        const releaseStart = scheduleEnvelope(gain, startTime, peak, attack, hold, release);

        source.connect(gain);
        // Opt-in per-pack tone correction (#755): splice a tilt between the note
        // gain and the bus so only this pack is reshaped — the synth voice shares
        // `destination` and must stay untouched. No tilt → the un-filtered path.
        const toneTilt = buildToneTilt(audio, tone);
        if (toneTilt) {
            gain.connect(toneTilt.input);
            toneTilt.output.connect(destination);
        } else {
            gain.connect(destination);
        }

        // Stop just past the release tail so the source frees itself; never cut
        // the envelope short.
        const naturalEnd = releaseStart + release + 0.01;

        // Opt-in pitch vibrato (#744): an LFO summed onto playbackRate, stopped
        // with the source so it never runs past cleanup. Folded into the node
        // chain below so onended disconnects it too.
        const vibratoNodes = vibrato
            ? attachSampleVibrato(
                  audio,
                  source.playbackRate,
                  baseRate,
                  vibrato,
                  startTime,
                  naturalEnd,
              )
            : [];

        // Disconnect the node chain once the note finishes, then fire onEnded —
        // the same self-cleanup contract as `playPercussiveStrike`, so sampled
        // notes don't leak a source+gain per played note.
        source.onended = () => {
            safeDisconnect([source, gain, ...(toneTilt?.nodes ?? []), ...vibratoNodes]);
            onEnded?.();
        };

        source.start(startTime);
        source.stop(naturalEnd);

        return {
            release(when: number, fade: number): void {
                try {
                    const at = Number.isFinite(when)
                        ? Math.max(startTime, Math.min(when, naturalEnd))
                        : audio.currentTime;
                    // setTargetAtTime decays from wherever the envelope currently
                    // sits (no anchor read needed); tc ≈ fade/4 → ~inaudible by
                    // `at + fade`. Reschedule the source stop earlier so the voice
                    // frees promptly; never push it past its natural end.
                    const tc = Math.max(0.004, (Number.isFinite(fade) ? fade : 0.05) / 4);
                    gain.gain.cancelScheduledValues(at);
                    gain.gain.setTargetAtTime(0, at, tc);
                    source.stop(Math.min(naturalEnd, at + tc * 8));
                } catch {
                    /* already stopped / closed context — release is a no-op */
                }
            },
        };
    } catch {
        /* ignore audio errors (e.g. a closed context) */
        onEnded?.();
        return null;
    }
}
