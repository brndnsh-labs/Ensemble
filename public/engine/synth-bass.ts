import type { EnsembleState, Mutable } from '../types.js';
import { createSoftClipCurve, safeDisconnect } from '../utils.js';
import { resolveInstrumentSource } from './instrument-registry.js';
import { playPercussiveStrike, rampGain, velocityTimbre } from './synth-utils.js';

export function killBassNote(state: EnsembleState): void {
    const { playback, bass } = state;
    if (!playback.audio) {
        return;
    }
    if (bass.lastBassGain) {
        rampGain(bass.lastBassGain.gain, 0, playback.audio.currentTime, 0.005);
        (bass as Mutable<typeof bass>).lastBassGain = null; // @direct-mutation
    }
}

// Bass styles whose genre identity calls for sub-bass content (a sine an
// octave below the played note). Everything else gets a bass-guitar-register
// voice — a P-Bass / J-Bass lives at 41–200 Hz and adding an octave-down sine
// drops the perceived foundation below where a real bass guitar even goes
// (S5 listening gate, 2026-05-22). The two members here are the styles whose
// UI labels literally promise sub character — `'Hip Hop (808/Sub)'` and
// `'Dub (Reggae)'` (see `public/data/instrument-styles.ts`).
const SUB_BASS_STYLES = new Set<string>(['hiphop', 'dub']);

/**
 * P-Bass Synthesis: Layered physical model
 */
// The synth bass voice. `playBassNoteNew` is the reworked synth-audit voice —
// the only one since #649 retired the Current/New A/B.
function dispatchBassSynth(...args: Parameters<typeof playBassNoteNew>): void {
    playBassNoteNew(...args);
}

/**
 * P-Bass Synthesis: Layered physical model
 */
// synth-audit Epic 6 S1 — instrument-source seam. A `pack:<id>` voice resolves
// to a sample source once its buffers load (S3); S5 routes that case to
// `playSampledNote`. Until then, and whenever a pack buffer is unavailable, we
// fall back to the synth voice — bit-identical with no packs installed. (Per
// `bass.md` §4 the bass has no planned pack — continuous bends/mute morph would
// regress — but it routes through the registry uniformly with every voice.)
export function playBassNote(...args: Parameters<typeof playBassNoteNew>): void {
    if (resolveInstrumentSource(args[0].bass.voice).kind === 'sample') {
        dispatchBassSynth(...args); // S5: → playSampledNote(packId, …)
        return;
    }
    dispatchBassSynth(...args);
}

// synth-audit Epic 0 S7 — worked example for the shared `velocityTimbre`
// helper. A compact two-layer bass (clean sine sub + sawtooth harmonic layer)
// whose *tone*, not just its loudness, tracks how hard the note is played:
// `velocityTimbre` opens the lowpass and pushes the saturator on hard notes
// and closes both down on soft ones, so a soft vs. hard note differs in tone,
// not just loudness. Epic 5 ("Bass Finishing") built this voice out further
// (sub layer, growl animation, etc.).
function playBassNoteNew(
    state: EnsembleState,
    freq: number,
    time: number,
    duration: number,
    velocity = 1.0,
    muteAmount = 0,
    bendStartInterval = 0,
): void {
    const { playback, bass, groove } = state;
    if (!playback.audio || !playback.audioGraph) {
        return;
    }
    // Every input is caller-supplied — guard them all. A non-finite
    // `bendStartInterval` would otherwise poison `startFreq` and the pitch
    // ramp anchor, silently dropping the voice.
    if (
        !Number.isFinite(freq) ||
        !Number.isFinite(time) ||
        !Number.isFinite(duration) ||
        !Number.isFinite(velocity) ||
        !Number.isFinite(muteAmount) ||
        !Number.isFinite(bendStartInterval)
    ) {
        return;
    }
    if (freq < 10 || freq > 24000) {
        return;
    }
    try {
        const audio = playback.audio;
        const now = audio.currentTime;
        const startTime = Math.max(time, now);
        // Clamp the bend to a sane musical range so the pitch ramp can't start
        // from a near-zero frequency (invalid exponential-ramp anchor).
        const bend = Math.max(-24, Math.min(24, bendStartInterval));

        // The whole point of the New voice: velocity → timbre, not just level.
        // Convex curve (1.6) keeps soft notes round and dark; hard notes bloom.
        // `timbre.brightness` (curve-shaped velocity, 0..1) drives the lowpass
        // cutoff, the saturation pre-gain, and the impact transient below.
        const timbre = velocityTimbre(velocity, {
            curve: 1.6,
            cutoffRange: [0.4, 1.5],
        });

        const vol = Math.sqrt(Math.max(0, Math.min(1, velocity))) * (1 - muteAmount * 0.85);
        if (vol < 0.005) {
            return;
        }

        const startFreq = bend !== 0 ? freq * 2 ** (bend / 12) : freq;
        const bendRamp = Math.min(0.1, duration * 0.5);

        // --- Layer 1: clean sine sub (the weight) ---
        const sub = audio.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(startFreq, startTime);

        // --- Layer 2: sawtooth harmonics through the velocity-brightened LP ---
        const saw = audio.createOscillator();
        saw.type = 'sawtooth';
        saw.frequency.setValueAtTime(startFreq, startTime);

        if (bend !== 0) {
            sub.frequency.exponentialRampToValueAtTime(freq, startTime + bendRamp);
            saw.frequency.exponentialRampToValueAtTime(freq, startTime + bendRamp);
        }

        // Base (fully-open) cutoff tracks pitch; `cutoffMult` scales it down on
        // soft notes, a palm-mute (`muteAmount`) rolls it down further.
        const midi = 12 * Math.log2(freq / 440) + 69;
        const baseCutoff = (450 + midi * 18) * (1 - muteAmount * 0.5);
        // Pluck-settle motion: a real plucked string is brightest at the
        // attack and mellows as the pluck energy decays. The saw lowpass opens
        // ~1.3–1.7× above its velocity-scaled target (a harder pluck swings
        // wider) and then sweeps down to the target over ~100 ms. Without this
        // the filter is frozen for the note's whole life — the "static timbre"
        // S3 fixes. `lpTarget` is the settled cutoff; the start is clamped well
        // below the audible ceiling for safety.
        const lpTarget = Math.max(80, baseCutoff * timbre.cutoffMult);
        const lpStart = Math.min(18000, lpTarget * (1.3 + timbre.brightness * 0.4));
        const lp = audio.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(lpStart, startTime);
        lp.frequency.setTargetAtTime(lpTarget, startTime, 0.035);
        lp.Q.setValueAtTime(1.1, startTime);

        // The sawtooth is the *grit* layer — and it deliberately bypasses the
        // saturator below. Soft-clipping a sawtooth is what made the New voice
        // buzzy/synthy ("sounds like a saw synth bass even at low intensity" —
        // S2 listening gate); kept un-clipped and just low-passed it reads as
        // string grit, not a synth lead. Its level is convex in velocity, so a
        // soft pluck is almost pure sine body and only a hard note brings the
        // grit forward.
        const sawGain = audio.createGain();
        sawGain.gain.setValueAtTime(0.15 + timbre.brightness * 0.3, startTime);
        saw.connect(lp);
        lp.connect(sawGain);

        // `bodyMix` sums only the sine layers (fundamental + sub-octave below)
        // — the round body that the saturator colors. The saw joins downstream,
        // post-saturator.
        const bodyMix = audio.createGain();
        sub.connect(bodyMix);

        // --- Layer 0: sub-octave sine (the weight, sub-bass genres only) ---
        // A dedicated octave-down sine, low-passed to ~140 Hz so it stays pure
        // sub and never muds the midrange. Floored above 10 Hz so a very low
        // note can't drop the sub below the oscillator's useful range.
        //
        // **Gated by `bass.style`**: only sub-bass genres (hip-hop, dub — see
        // `SUB_BASS_STYLES`) get this layer. For bass-guitar-register styles
        // (rock/funk/jazz/etc.) adding an octave-down sine shifts the perceived
        // foundation *below* where a real bass guitar lives (open low E is
        // 41 Hz; sub-oct of typical bass notes is 20–55 Hz, well into sub-bass
        // synth territory). S1 originally always-on; S5 listening gate flagged
        // that as "way too low for most genres" — confirmed by owner.
        //
        // **Level is also freq-dependent within sub-bass styles**: the
        // sub-oct only sounds *like* a sub-bass when its frequency lands below
        // the kick's body band (~48–65 Hz, per `getKickVoiceConfig`'s
        // `shellFreq` / `knockEndFreq`). Full strength on low notes (≤85 Hz,
        // sub-oct ≤42 Hz, true sub-bass); fade linearly to silent across
        // 85–160 Hz; muted above (where the octave-down would compete with
        // the kick's body or just be in-band bass-doubling).
        const subOct = audio.createOscillator();
        subOct.type = 'sine';
        subOct.frequency.setValueAtTime(Math.max(10, startFreq / 2), startTime);
        if (bend !== 0) {
            subOct.frequency.exponentialRampToValueAtTime(
                Math.max(10, freq / 2),
                startTime + bendRamp,
            );
        }
        const subLp = audio.createBiquadFilter();
        subLp.type = 'lowpass';
        subLp.frequency.setValueAtTime(140, startTime);
        subLp.Q.setValueAtTime(0.7, startTime);
        const wantsSubBass = SUB_BASS_STYLES.has(bass.style);
        const subBlend = !wantsSubBass ? 0 : freq <= 85 ? 1 : freq >= 160 ? 0 : (160 - freq) / 75;
        const subGain = audio.createGain();
        subGain.gain.setValueAtTime(0.34 * subBlend, startTime);
        subOct.connect(subLp);
        subLp.connect(subGain);
        subGain.connect(bodyMix);

        // --- Velocity-driven saturation (sine body only) --------------------
        // A hotter pre-gain into the fixed soft-clip means a harder note picks
        // up more harmonics — warm, even-order coloration of the round sine
        // body (the saw grit bypasses this entirely, see above). The drive is
        // *extra*-convex (brightness², on top
        // of the curve-1.6 brightness) so soft and medium plucks sit near unity
        // pre-gain — clean and round, like the `current` voice — and only a
        // genuine hard dig-in (≳0.8 velocity) blooms toward the ~2.6× ceiling.
        // Tuned down from a near-linear `1 + drive*2.5` after the S1 listening
        // gate flagged the New voice as too aggressive on soft/medium notes.
        const driveAmount = timbre.brightness * timbre.brightness;
        const driveGain = audio.createGain();
        driveGain.gain.setValueAtTime(1 + driveAmount * 1.6, startTime);
        const shaper = audio.createWaveShaper();
        shaper.curve = createSoftClipCurve();
        shaper.oversample = '4x';
        bodyMix.connect(driveGain);
        driveGain.connect(shaper);

        // --- Amp envelope: fast attack, a short decay to a sustain, release ---
        // `releaseTime` is floored above the 0.04 decay anchor so the three
        // envelope events always stay in schedule order (a short or fully
        // muted note would otherwise schedule the release before the decay).
        const amp = audio.createGain();
        amp.gain.setValueAtTime(0, startTime);
        amp.gain.setTargetAtTime(vol, startTime, 0.006);
        const releaseTime = Math.max(0.06, duration * (1 - muteAmount) + 0.02 * muteAmount);
        amp.gain.setTargetAtTime(vol * 0.45, startTime + 0.04, 0.12);
        amp.gain.setTargetAtTime(0, startTime + releaseTime, 0.08);
        shaper.connect(amp);
        // The grit layer joins the amp post-saturator — enveloped with the
        // body but never soft-clipped.
        sawGain.connect(amp);
        amp.connect(playback.audioGraph.bass.gain);

        // --- Velocity-brightened finger-thud transient ----------------------
        // A pluck transient the `current` voice has but the New voice lacked
        // entirely. Both the bandpass center and its Q track velocity via the
        // same curve-shaped `timbre.brightness`: a soft note gets a dull, low
        // thud; a hard dig-in gets a sharp, present click. Volume is convex in
        // velocity too, so soft notes stay understated. Routed straight to the
        // bass bus (not through `amp`) to keep the click crisp and un-enveloped;
        // `playPercussiveStrike` self-manages its own short-lived sub-graph.
        const impactFreq = Math.max(
            200,
            Math.min(1600, freq * 1.6 * (0.7 + timbre.brightness * 0.9)),
        );
        const impactQ = 1.2 + timbre.brightness * 2.2;
        playPercussiveStrike(
            audio,
            groove.audioBuffers.noise,
            playback.audioGraph.bass.gain,
            startTime,
            {
                volume: vol * (0.12 + timbre.brightness * 0.3),
                filterType: 'bandpass',
                freq: impactFreq,
                Q: impactQ,
                attack: 0.001,
                decay: 0.018,
                duration: 0.1,
            },
        );

        // Monophonic note-off — kill the previous note's amp.
        if (bass.lastBassGain && bass.lastBassGain !== amp) {
            rampGain(bass.lastBassGain.gain, 0, startTime, 0.005);
        }
        (bass as Mutable<typeof bass>).lastBassGain = amp; // @direct-mutation

        sub.start(startTime);
        saw.start(startTime);
        subOct.start(startTime);
        const stopTime = startTime + releaseTime + 1.0;
        sub.stop(stopTime);
        saw.stop(stopTime);
        subOct.stop(stopTime);
        sub.onended = () =>
            safeDisconnect([
                sub,
                saw,
                subOct,
                lp,
                subLp,
                sawGain,
                subGain,
                bodyMix,
                driveGain,
                shaper,
                amp,
            ]);
    } catch (e) {
        console.error('playBassNoteNew error:', e, { freq, time, duration });
    }
}
