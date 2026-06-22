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
    /** MIDI note the buffer was sampled at (playbackRate 1.0 plays in tune here). */
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

export interface SampledNoteOptions {
    /** Linear attack ramp (s). */
    readonly attack?: number;
    /** Linear release ramp (s) after the held duration. */
    readonly release?: number;
    /** 0..1 → envelope peak gain. */
    readonly velocity?: number;
    /** Seconds the note is held at peak before the release ramp. */
    readonly duration?: number;
    readonly onEnded?: () => void;
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
        // Click-free: quick linear attack to peak, hold across the recording,
        // short release so the source can free itself without a tail click.
        const releaseStart = Math.max(startTime + attack, startTime + hold);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(peak, startTime + attack);
        gain.gain.setValueAtTime(peak, releaseStart);
        gain.gain.linearRampToValueAtTime(0, releaseStart + release);

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
        source.playbackRate.setValueAtTime(pitchRatio(zone.rootMidi, targetMidi), startTime);

        const gain = audio.createGain();
        // Click-free envelope: linear attack to peak, hold for `duration`, linear
        // release to silence. Anchoring `releaseStart` at >= the attack end keeps a
        // very short note from inverting the ramp order.
        const releaseStart = Math.max(startTime + attack, startTime + hold);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(peak, startTime + attack);
        gain.gain.setValueAtTime(peak, releaseStart);
        gain.gain.linearRampToValueAtTime(0, releaseStart + release);

        source.connect(gain);
        gain.connect(destination);

        // Disconnect the node chain once the note finishes, then fire onEnded —
        // the same self-cleanup contract as `playPercussiveStrike`, so sampled
        // notes don't leak a source+gain per played note.
        source.onended = () => {
            safeDisconnect([source, gain]);
            onEnded?.();
        };

        source.start(startTime);
        // Stop just past the release tail so the source frees itself; never cut
        // the envelope short.
        const naturalEnd = releaseStart + release + 0.01;
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
