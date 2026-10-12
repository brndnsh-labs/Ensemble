/**
 * Algorithmic reverb — Schroeder/Moorer (Freeverb-style) topology.
 *
 * Replaces the static white-noise `ConvolverNode`. An earlier revision of this
 * file used a feedback-delay network (FDN) with a unitary mixing matrix. That
 * topology cross-couples every delay line into every other, and Chromium's Web
 * Audio renderer is unstable with cross-coupled `DelayNode` feedback cycles —
 * it self-oscillates regardless of the (provably sub-unity) loop gain. Verified
 * with an offline-render bisection: independent self-looping delays decay
 * cleanly, but the moment they are matrix-mixed the network runs away.
 *
 * The Freeverb topology sidesteps this entirely:
 *   - a bank of PARALLEL comb filters, each a single self-contained feedback
 *     delay (the topology Web Audio handles correctly), then
 *   - a SERIES of allpass diffusers to smear the comb output dense.
 * No delay ever feeds another delay's loop.
 *
 * Drop-in: exposes `input`/`output` `AudioNode`s, same contract as the old
 * convolver, so the per-instrument reverb-send wiring in `engine.ts` is
 * untouched. Zero bundle cost — pure Web Audio nodes, built once and held for
 * the `AudioContext` lifetime (torn down by `audio.close()` on watchdog
 * recovery; nothing is allocated per note).
 */

import type { AlgorithmicReverb, ReverbPreset } from '../types.js';

/**
 * Comb-filter delay lengths, in samples at the 44.1 kHz design rate. The
 * canonical Freeverb tuning — mutually prime-ish so the combs do not reinforce
 * into an audible flutter. Converted to seconds (rate-independent) at build.
 *
 * The L bank uses the original tuning. The R bank offsets each delay by
 * `STEREO_SPREAD` samples (canonical Freeverb spread = 23 samples) so the L
 * and R comb resonances land on slightly different frequencies. With two
 * mono-equivalent inputs feeding two independently-tuned banks the resulting
 * L and R outputs are genuinely uncorrelated — the wet picks up real
 * side-energy without a Haas-style time-shift trick (which still cross-
 * correlates ~1 with the source and only marginally moves the side ratio).
 */
const STEREO_SPREAD = 23;
const COMB_TUNING_44K_L: readonly number[] = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const COMB_TUNING_44K_R: readonly number[] = COMB_TUNING_44K_L.map((n) => n + STEREO_SPREAD);

/** Allpass diffuser delay lengths (44.1 kHz design rate), offset per channel. */
const ALLPASS_TUNING_44K_L: readonly number[] = [556, 441, 341, 225];
const ALLPASS_TUNING_44K_R: readonly number[] = ALLPASS_TUNING_44K_L.map((n) => n + STEREO_SPREAD);

/** The sample rate the tuning constants above were chosen for. */
const DESIGN_RATE = 44100;

/** Allpass diffuser feedback — fixed, as in the original Freeverb. */
const ALLPASS_FEEDBACK = 0.5;

/**
 * Damping lowpass `Q`. Web Audio interprets `Q` for `lowpass`/`highpass` in
 * DECIBELS (the coefficient math uses `10^(Q/20)`), so a "small" positive Q
 * still resonates: Q=0 dB is already linear-Q 1.0, a +1.25 dB peak. Inside a
 * feedback loop any peak above unity self-oscillates. -6 dB is linear-Q ≈ 0.5,
 * solidly damped with no peak.
 */
const DAMPING_Q_DB = -6;

/** Input scale into the comb bank — keeps the summed wet return at a sane level. */
const INPUT_SCALE = 0.025;

/**
 * Built-in presets. `size` scales the comb delay lengths (room dimension),
 * `rt60` is the -60 dB decay time in seconds, `damping` is the comb lowpass
 * cutoff in Hz (a darker tail uses a lower cutoff).
 */
export const REVERB_PRESETS = {
    /** Lush — ballads and jazz. */
    hall: { size: 1.2, rt60: 2.2, damping: 3000 },
} as const satisfies Record<string, ReverbPreset>;

/**
 * Comb feedback gain for a delay of `delaySec` to reach a given RT60. A comb
 * recirculates `rt60 / delaySec` times before -60 dB, and `g^(rt60/delaySec) =
 * 10^-3` gives `g = 10^(-3·delaySec/rt60)`. Shorter combs get a higher gain so
 * every comb decays over the same RT60.
 */
function combFeedbackFor(delaySec: number, rt60: number): number {
    const safeRt60 = Math.max(0.05, rt60);
    const g = 10 ** ((-3 * delaySec) / safeRt60);
    // Strictly below 1 — a comb with g ≥ 1 self-oscillates.
    return Math.min(0.97, Math.max(0, g));
}

/**
 * Builds the algorithmic reverb on `ctx`. The returned object's `input`/`output`
 * nodes are wired into the master graph by the caller.
 */
export function createAlgorithmicReverb(
    ctx: BaseAudioContext,
    preset: ReverbPreset = REVERB_PRESETS.hall,
): AlgorithmicReverb {
    const input = ctx.createGain();
    input.gain.value = INPUT_SCALE;
    const output = ctx.createGain();

    // Snap a delay (seconds) to an exact integer sample count. The original
    // Freeverb uses integer-length sample buffers; matching that also keeps the
    // feedback perfectly periodic.
    const snap = (sec: number) => Math.round(sec * ctx.sampleRate) / ctx.sampleRate;

    const size = preset.size;
    const rt60 = preset.rt60;

    // --- Parallel comb banks (L and R, independently tuned) -------------
    // Every comb is fed from `input` and taps into the channel's combSum.
    // Its feedback loop touches only itself — never another comb, never the
    // other channel — which is what keeps the graph stable under Web Audio
    // (cross-coupled delay cycles self-oscillate even with provably sub-unity
    // gain on Chromium; see the top docstring).
    const buildCombBank = (tunings: readonly number[], combSum: GainNode): void => {
        for (const tuning of tunings) {
            const baseDelay = tuning / DESIGN_RATE;

            const delay = ctx.createDelay(0.2);
            delay.delayTime.value = snap(baseDelay * size);

            const damp = ctx.createBiquadFilter();
            damp.type = 'lowpass';
            damp.frequency.value = preset.damping;
            damp.Q.value = DAMPING_Q_DB;

            const feedback = ctx.createGain();
            feedback.gain.value = combFeedbackFor(baseDelay * size, rt60);

            input.connect(delay);
            delay.connect(combSum); // wet tap
            delay.connect(damp);
            damp.connect(feedback);
            feedback.connect(delay); // self-loop
        }
    };

    const combSumL = ctx.createGain();
    const combSumR = ctx.createGain();
    buildCombBank(COMB_TUNING_44K_L, combSumL);
    buildCombBank(COMB_TUNING_44K_R, combSumR);

    // --- Series allpass diffusers (per channel) -------------------------
    // Freeverb's allpass: `out = delayed - in`, `delayIn = in + fb·delayed`.
    // Each is a single self-looping delay; they run in series after the combs.
    // L and R chains are fully independent — no cross-channel coupling.
    const buildAllpassChain = (tunings: readonly number[], start: AudioNode): AudioNode => {
        let chain: AudioNode = start;
        for (const tuning of tunings) {
            const apIn = ctx.createGain();
            const sum = ctx.createGain();
            const delay = ctx.createDelay(0.1);
            delay.delayTime.value = snap(tuning / DESIGN_RATE);
            const fb = ctx.createGain();
            fb.gain.value = ALLPASS_FEEDBACK;
            const invIn = ctx.createGain();
            invIn.gain.value = -1;
            const apOut = ctx.createGain();

            chain.connect(apIn);
            apIn.connect(sum);
            sum.connect(delay);
            delay.connect(fb);
            fb.connect(sum); // self-loop
            delay.connect(apOut); // delayed term
            apIn.connect(invIn);
            invIn.connect(apOut); // minus the input term

            chain = apOut;
        }
        return chain;
    };

    const chainL = buildAllpassChain(ALLPASS_TUNING_44K_L, combSumL);
    const chainR = buildAllpassChain(ALLPASS_TUNING_44K_R, combSumR);

    // Merge the two mono chains into a 2-channel stereo `output`. The merger
    // takes one mono input per channel; the L bank becomes the left output
    // sample and the R bank becomes the right — so the wet is natively
    // stereo with uncorrelated content, not a Haas-style delayed copy.
    const stereoMerger = ctx.createChannelMerger(2);
    chainL.connect(stereoMerger, 0, 0);
    chainR.connect(stereoMerger, 0, 1);
    stereoMerger.connect(output);

    return { input, output };
}
