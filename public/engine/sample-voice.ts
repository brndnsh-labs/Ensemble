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

/** A pitched sample zone: a decoded buffer recorded at a known root pitch. */
export interface SampleZone {
    /** MIDI note the buffer was sampled at (playbackRate 1.0 plays in tune here). */
    readonly rootMidi: number;
    readonly buffer: AudioBuffer;
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
): void {
    if (!audio || !zone?.buffer || !destination) {
        onEnded?.();
        return;
    }

    try {
        // Sanitize the scheduling inputs so a stray non-finite value (e.g. an
        // undefined upstream state field) can't push NaN into an AudioParam.
        // `Math.min(1, NaN)` is NaN, so velocity needs an explicit finite check.
        const startTime = Number.isFinite(time) ? time : audio.currentTime;
        const hold = Number.isFinite(duration) && duration > 0 ? duration : 0;
        const peak = Number.isFinite(velocity) ? Math.max(0, Math.min(1, velocity)) : 1;

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
        source.stop(releaseStart + release + 0.01);
    } catch {
        /* ignore audio errors (e.g. a closed context) */
        onEnded?.();
    }
}
