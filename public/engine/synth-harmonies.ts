import type { EnsembleState, Mutable } from '../types.js';
import { clampFreq, safeDisconnect } from '../utils.js';
import { createSimplePanner, killActiveVoices } from './synth-utils.js';

/**
 * Polyphonic Synthesizer for the Harmony Module (harmony).
 * Optimized for Horns (stabs) and Strings (pads).
 */

const HARMONY_VOICE_LIMIT_FADE = 0.02;

/**
 * The organ saturator's soft-clip curve is a pure function of a fixed drive
 * constant (k = 2) — it does not vary per note. Building the 44100-sample
 * Float32Array on every organ note (the old inline IIFE) was wasted work in
 * the audio hot path; cache it once on first use. Mirrors `cachedShaperCurve`
 * in synth-chords.ts — but unlike that one, no drive-keyed invalidation is
 * needed: `k` is a compile-time constant, so the curve never changes.
 * Sound-preserving — the curve values are byte-identical to the old IIFE.
 */
let cachedOrganCurve: Float32Array<ArrayBuffer> | null = null;

function getOrganSaturationCurve(): Float32Array<ArrayBuffer> {
    if (cachedOrganCurve) {
        return cachedOrganCurve;
    }
    const n = 44100;
    const curve = new Float32Array(n);
    const k = 2; // soft-clip drive for the organ saturator
    for (let i = 0; i < n; ++i) {
        const x = (i * 2) / n - 1;
        curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    cachedOrganCurve = curve;
    return curve;
}

/**
 * Same-pitch retriggers are common in funk and horn writing. Crossfade them instead of
 * hard-choking the old voice so repeated hits can re-articulate without zipper-like clicks.
 */
function getHarmonyRetriggerProfile(style: string): {
    fadeTime: number;
    attackFloor: number;
    suppressClick: boolean;
} {
    if (style === 'organ') {
        return { fadeTime: 0.02, attackFloor: 0.012, suppressClick: true };
    }
    if (style === 'plucks' || style === 'disco' || style === 'stabs') {
        return { fadeTime: 0.02, attackFloor: 0.012, suppressClick: false };
    }
    return { fadeTime: 0.03, attackFloor: 0.02, suppressClick: false };
}

/**
 * Legato continuation for the rebuilt harmony voice (synth-audit Epic 1 S1).
 *
 * Extends an already-sounding voice at the same MIDI in place rather than
 * choking + re-attacking — what makes pads actually sustain across chord
 * changes on common tones. Returns `true` when an existing voice was found
 * and extended (the caller returns early, spawning no oscillators), `false`
 * when there was nothing to extend (the caller falls through and spawns a
 * fresh voice). Extracted as a New-only helper so the rebuilt voice body
 * does not duplicate the Current voice's inline block.
 */
function extendLegatoHarmonyVoice(
    state: EnsembleState,
    midi: number,
    vol: number,
    style: string,
    playTime: number,
    duration: number,
): boolean {
    const { playback, harmony } = state;
    const existing = harmony.activeVoices.find((v: { midi: number | null }) => v.midi === midi);
    if (!existing?.gain || !playback.audio) {
        return false;
    }
    const releaseTail = style === 'stabs' ? 0.1 : style === 'plucks' ? 0.02 : 0.5;
    try {
        existing.gain.gain.cancelScheduledValues(playTime);
    } catch {
        /* some test mocks don't implement cancelScheduledValues */
    }
    // Restore gain to the freshly-attacked level so the survivor rides the new
    // chord at full volume instead of continuing a half-finished release decay.
    const polyphonyDucking = harmony.activeVoices.length > 1 ? 0.85 : 1.0;
    const restoreVol = vol * polyphonyDucking;
    try {
        existing.gain.gain.linearRampToValueAtTime(restoreVol, playTime + 0.005);
    } catch {
        existing.gain.gain.setValueAtTime?.(restoreVol, playTime);
    }
    const newEnd = playTime + duration;
    existing.gain.gain.setTargetAtTime(
        0,
        Math.max(playTime + 0.005, newEnd - releaseTail),
        releaseTail,
    );
    // `duration` is the most-recent attack window; `lastExtendedAt` is when
    // that attack fired. Stale-voice GC keys on `lastExtendedAt + duration`.
    existing.lastExtendedAt = playTime;
    existing.duration = duration;
    const stopAt = newEnd + 0.5;
    if (existing.nodes) {
        for (const node of existing.nodes as Array<AudioNode & { stop?: (t: number) => void }>) {
            try {
                node.stop?.(stopAt);
            } catch {
                /* ignore: node may already be stopped */
            }
        }
    }
    return true;
}

/**
 * Click-free voice kill for the rebuilt harmony voice (synth-audit Epic 1 S3
 * rapid-stab fix).
 *
 * The shared `killActiveVoices` fades a stolen voice's gain with
 * `setTargetAtTime` — an exponential that never actually reaches 0 — then
 * hard-stops the voice's oscillators ~3.5 time-constants later, when the gain
 * is still at ~3% of its level. For a loud, breathy horn stab stolen
 * mid-sustain that residual is an audible click (worst on the breath noise
 * layer, which has no benign zero-crossings). This kill uses
 * `linearRampToValueAtTime`, which reaches *exactly* 0 at `time + fadeTime`,
 * and stops the nodes only after that — so every node hard-stops into genuine
 * silence. Local to the rebuilt voice; the shared helper is left untouched so
 * the other instruments are unaffected.
 */
function killHarmonyVoice(
    voice: { gain?: GainNode; nodes?: AudioNode[] },
    time: number,
    fadeTime: number,
): void {
    const g = voice.gain?.gain;
    if (g) {
        try {
            g.cancelScheduledValues(time);
            // Anchor at the current value so the ramp is a true `fadeTime`
            // fade, not a slow ramp down from some stale earlier event.
            g.setValueAtTime(g.value, time);
            g.linearRampToValueAtTime(0, time + fadeTime);
        } catch {
            /* some test mocks don't implement the full AudioParam API */
        }
    }
    if (voice.nodes) {
        for (const node of voice.nodes as Array<AudioNode & { stop?: (t: number) => void }>) {
            try {
                // Stop only after the linear fade has reached 0.
                node.stop?.(time + fadeTime + 0.02);
            } catch {
                /* ignore: node may already be stopped */
            }
        }
    }
}

/**
 * Pitch-aware voice stealing for the rebuilt harmony voice (synth-audit
 * Epic 1 S1). A non-legato hit at a MIDI that is already sounding crossfades
 * the prior voice out (per the style's retrigger profile) instead of hard-
 * choking it. Returns the retrigger profile — the caller uses its
 * `attackFloor` / `suppressClick` fields — or `null` when nothing was stolen.
 */
function stealHarmonyPitchVoice(
    state: EnsembleState,
    midi: number,
    playTime: number,
    style: string,
): ReturnType<typeof getHarmonyRetriggerProfile> | null {
    const { harmony } = state;
    const existing = harmony.activeVoices.find((v: { midi: number | null }) => v.midi === midi);
    if (!existing) {
        return null;
    }
    const profile = getHarmonyRetriggerProfile(style);
    killHarmonyVoice(existing, playTime, profile.fadeTime);
    const idx = harmony.activeVoices.indexOf(existing);
    if (idx !== -1) {
        harmony.activeVoices.splice(idx, 1); // @worker-mutation
    }
    return profile;
}

type HarmonyTimbre = {
    osc1: OscillatorType;
    osc2: OscillatorType;
    osc2Detune: number;
    sub: OscillatorType;
};

/**
 * Resolve the non-organ harmony timbre (synth-audit Epic 1 S1) — the core
 * `style`-vs-`genreFeel` decoupling.
 *
 * The Current voice tests `genreFeel` (Rock/Metal, Neo-Soul/Acoustic) in an
 * if/else chain placed *before* the `style` switch, so a chosen style's
 * oscillator branch was unreachable under those feels — the timbre was
 * hijacked by a global flag ("bolted on", made literal). The rebuilt voice
 * fixes the precedence: `style` always picks the base waveforms; `genreFeel`
 * is only a *bias* layered on top (a brighter/wider lean for Rock, a softer/
 * tighter lean for Neo-Soul). The feel can nudge the timbre but never erase
 * the style's identity — and every `style` branch is now reachable under
 * every feel.
 */
function resolveHarmonyTimbre(style: string, feel: string): HarmonyTimbre {
    // Base timbre per style — carried from the Current voice's style branches.
    let timbre: HarmonyTimbre;
    switch (style) {
        case 'plucks':
            timbre = { osc1: 'sawtooth', osc2: 'square', osc2Detune: 5, sub: 'sine' };
            break;
        case 'disco':
            timbre = { osc1: 'triangle', osc2: 'sawtooth', osc2Detune: 4, sub: 'sine' };
            break;
        case 'counter':
            timbre = { osc1: 'sawtooth', osc2: 'triangle', osc2Detune: 4, sub: 'sine' };
            break;
        case 'stabs':
            // Sawtooth core (synth-audit Epic 1 S3 "Horn Section"): a saw pair
            // gives the rich harmonic spectrum the brass formants carve.
            timbre = { osc1: 'sawtooth', osc2: 'sawtooth', osc2Detune: 12, sub: 'triangle' };
            break;
        default:
            timbre = { osc1: 'triangle', osc2: 'sawtooth', osc2Detune: 8, sub: 'sine' };
    }
    // genreFeel bias — a lean, not a replacement. Rock/Metal want brightness
    // and width (a saw pair, wider detune); Neo-Soul/Acoustic want a softer,
    // tighter blend (a triangle pair, narrower detune). The style's detune
    // *character* is preserved by widening/narrowing rather than overwriting:
    // a 'stabs' style stays the widest style under any feel.
    if (feel === 'Rock' || feel === 'Metal') {
        timbre.osc1 = 'sawtooth';
        timbre.osc2 = 'sawtooth';
        timbre.osc2Detune = Math.max(timbre.osc2Detune, 15);
    } else if (feel === 'Neo-Soul' || feel === 'Acoustic') {
        timbre.osc1 = 'triangle';
        timbre.osc2 = 'triangle';
        timbre.osc2Detune = Math.min(timbre.osc2Detune, 2);
    }
    return timbre;
}

export function killHarmonyNote(state: EnsembleState, fadeTime = 0.05) {
    const { playback, harmony } = state;
    if (!playback.audio) {
        return;
    }
    killActiveVoices(harmony.activeVoices, playback.audio.currentTime, fadeTime);
}

// synth-audit Epic 0 S1 — A/B voice seam. The exported entry dispatches on the
// instrument's `voice` setting; `*New` is a placeholder until Epic 1 fills it in.
export function playHarmonyNote(...args: Parameters<typeof playHarmonyNoteCurrent>): void {
    (args[0].harmony.voice === 'new' ? playHarmonyNoteNew : playHarmonyNoteCurrent)(...args);
}

/**
 * Rebuilt harmony voice (synth-audit Epic 1 S1).
 *
 * This is where `playHarmonyNoteNew` stops delegating to `*Current` and
 * becomes a real voice. S1 makes it *structurally correct* — the named
 * formant presets (S3 horn section, S4 string pad) and the real ADSR
 * envelope (S2) build onto this skeleton. Two things change versus Current:
 *
 *  1. `style` is decoupled from `genreFeel`. Organ is checked as its own
 *     top-level branch, and the non-organ timbre comes from
 *     `resolveHarmonyTimbre`, where feel only biases the style's base
 *     waveforms. Every `style` branch is reachable under every feel.
 *  2. Non-positive `freq` is rejected at the door (harmony.md §5 follow-up)
 *     — the Bloom filter ramps below would otherwise hit a zero target via
 *     `clampFreq` (which floors at 0) and throw.
 *
 * The organ branch's *sound* is carried over unchanged — it is the one
 * genuinely well-built voice here.
 */
function playHarmonyNoteNew(
    state: EnsembleState,
    freq: number,
    time: number,
    duration: number,
    vol = 0.4,
    style = 'stabs',
    midi: number | null = null,
    slideInterval = 0,
    slideDuration = 0,
    vibrato = { rate: 0, depth: 0 },
    isLegato = false,
    isBloom = false,
    isLatched = false,
) {
    const { playback, harmony, groove } = state;
    // Reject non-finite AND non-positive freq — see the doc comment above.
    if (!Number.isFinite(freq) || freq <= 0 || !playback.audio) {
        return;
    }

    const now = playback.audio.currentTime;
    const playTime = Math.max(time, now);
    const feel = groove.genreFeel;
    const isOrgan = style === 'organ';

    if (!harmony.activeVoices) {
        (harmony as Mutable<typeof harmony>).activeVoices = []; // @direct-mutation
    }

    // Stale-voice GC. `lastExtendedAt` (set on every legato extension) keeps a
    // recently-extended voice alive; it falls back to `voice.time` otherwise.
    for (let i = harmony.activeVoices.length - 1; i >= 0; i--) {
        const voice = harmony.activeVoices[i];
        const lastAttackTime = voice.lastExtendedAt ?? voice.time;
        if (lastAttackTime + voice.duration + 1.0 <= playTime) {
            harmony.activeVoices.splice(i, 1); // @worker-mutation
        }
    }

    // Legato continuation — extend a sounding same-MIDI voice in place.
    if (isLegato && midi !== null) {
        if (extendLegatoHarmonyVoice(state, midi, vol, style, playTime, duration)) {
            return;
        }
        // No voice to extend (already GC'd / killed) — spawn one normally.
    }

    // Pitch-aware stealing — crossfade a same-MIDI voice for non-legato hits.
    const retriggerProfile =
        !isLegato && midi !== null ? stealHarmonyPitchVoice(state, midi, playTime, style) : null;

    // Polyphonic limit (max 3 voices).
    if (harmony.activeVoices.length >= 3) {
        const oldest = harmony.activeVoices.shift();
        if (oldest) {
            killHarmonyVoice(oldest, playTime, HARMONY_VOICE_LIMIT_FADE);
        }
    }

    const polyphonyDucking = harmony.activeVoices.length > 1 ? 0.85 : 1.0;
    const finalVol = vol * polyphonyDucking;

    const gain = playback.audio.createGain();
    gain.gain.value = 0;

    const filter = playback.audio.createBiquadFilter();
    filter.type = 'lowpass';

    const panRange = 0.1 + playback.bandIntensity * 0.7;
    const panValue = (Math.random() * 2 - 1) * panRange;
    const panner = createSimplePanner(playback.audio, panValue, playTime);

    const osc1 = playback.audio.createOscillator();
    const osc2 = playback.audio.createOscillator();
    const useSub = freq > 250;
    const sub = useSub ? playback.audio.createOscillator() : null;

    const voiceNodes: AudioNode[] = [gain, filter, panner, osc1, osc2];
    if (sub) {
        voiceNodes.push(sub);
    }

    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    let tremoloLfo: OscillatorNode | null = null;
    let fifthOsc: OscillatorNode | null = null;

    // --- Organ voice: carried over from the Current voice unchanged ---
    if (isOrgan) {
        const intensityForLeslie = playback.bandIntensity || 0.5;
        const leslieSpeed =
            intensityForLeslie < 0.4
                ? 0.7
                : intensityForLeslie > 0.6
                  ? 6.2
                  : 0.7 + ((intensityForLeslie - 0.4) / 0.2) * 5.5;
        const saturator = playback.audio.createWaveShaper();
        saturator.curve = getOrganSaturationCurve();
        voiceNodes.push(saturator);

        lfo = playback.audio.createOscillator();
        lfoGain = playback.audio.createGain();
        lfo.frequency.setValueAtTime(leslieSpeed, playTime);
        lfoGain.gain.setValueAtTime(5, playTime);
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);
        if (sub) {
            lfoGain.connect(sub.frequency);
        }
        lfo.start(playTime);
        voiceNodes.push(lfo, lfoGain);

        tremoloLfo = playback.audio.createOscillator();
        tremoloLfo.type = 'sine';
        tremoloLfo.frequency.setValueAtTime(leslieSpeed, playTime);
        // The Leslie tremolo is an additive a-rate modulation on gain.gain.
        const tremAmp = playback.audio.createGain();
        tremAmp.gain.setValueAtTime(0.2, playTime);
        tremoloLfo.connect(tremAmp);
        tremAmp.connect(gain.gain);
        tremoloLfo.start(playTime);
        voiceNodes.push(tremoloLfo, tremAmp);

        // Drawbar oscillators: fundamental, octave, and 5th harmonic, all
        // sine. osc2's frequency is left to the universal frequency block
        // below (it lands on `freq` — matching the Current voice, where the
        // organ's `freq * 2` was clobbered by that same block).
        osc1.type = 'sine';
        osc2.type = 'sine';
        fifthOsc = playback.audio.createOscillator();
        fifthOsc.type = 'sine';
        fifthOsc.frequency.setValueAtTime(freq * 1.5, playTime);
        voiceNodes.push(fifthOsc);
        if (lfoGain) {
            lfoGain.connect(fifthOsc.frequency);
        }

        let subGain: GainNode | null = null;
        if (sub) {
            sub.type = 'sine';
            subGain = playback.audio.createGain();
            subGain.gain.setValueAtTime(0.5, playTime);
            sub.connect(subGain);
            subGain.connect(saturator);
            voiceNodes.push(subGain);
        }

        // Square key-click transient. Skipped when finalVol is 0 — the click
        // ramp is exponential and would throw from a zero anchor.
        if (!retriggerProfile?.suppressClick && finalVol > 0) {
            const click = playback.audio.createOscillator();
            const clickGain = playback.audio.createGain();
            click.type = 'square';
            click.frequency.setValueAtTime(freq * 4, playTime);
            clickGain.gain.setValueAtTime(finalVol * 0.6, playTime);
            clickGain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.04);
            click.connect(clickGain);
            clickGain.connect(gain);
            click.start(playTime);
            click.stop(playTime + 0.1);
            voiceNodes.push(click, clickGain);
        }

        const hp = playback.audio.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(120, playTime);
        osc1.connect(saturator);
        osc2.connect(saturator);
        fifthOsc.connect(saturator);
        saturator.connect(filter);
        filter.connect(hp);
        hp.connect(gain);
        voiceNodes.push(hp);

        fifthOsc.start(playTime);
        fifthOsc.stop(playTime + duration + 0.5);
    } else {
        // --- Non-organ voice: style picks the timbre, feel only biases it ---
        const timbre = resolveHarmonyTimbre(style, feel);
        osc1.type = timbre.osc1;
        osc2.type = timbre.osc2;
        osc2.detune.setValueAtTime(timbre.osc2Detune, playTime);
        if (sub) {
            sub.type = timbre.sub;
        }

        // Optional per-style vibrato (organ uses the Leslie LFO instead).
        if (vibrato && (vibrato.rate || 0) > 0 && (vibrato.depth || 0) > 0) {
            lfo = playback.audio.createOscillator();
            lfoGain = playback.audio.createGain();
            lfo.frequency.setValueAtTime(vibrato.rate || 0, playTime);
            lfoGain.gain.setValueAtTime(vibrato.depth || 0, playTime);
            lfo.connect(lfoGain);
            lfoGain.connect(osc1.frequency);
            lfoGain.connect(osc2.frequency);
            if (sub) {
                lfoGain.connect(sub.frequency);
            }
            lfo.start(playTime);
            voiceNodes.push(lfo, lfoGain);
        }

        // Non-organ routing: osc → filter → gain.
        osc1.connect(filter);
        osc2.connect(filter);
        if (sub) {
            sub.connect(filter);
        }

        if (style === 'stabs') {
            // --- "Horn Section" voice (synth-audit Epic 1 S3) ---
            // A real brass-section character layered onto the sawtooth core +
            // stabs bloom. Three parts, all summed at the voice `gain`:
            //   1. Body path  — filter → bell → gain.
            //   2. Formants   — raw osc → two bandpass filters → gain (brass
            //      "honk"). Fed pre-filter so the lowpass bloom can't gut the
            //      resonances during the sustain.
            //   3. Breath     — a shared noise layer for the air of real
            //      players (the sax technique, reused).
            // Distinct from the soloist's single trumpet — that is one bell at
            // 1.2 kHz in a serial chain; this is a wider, formant-stacked
            // *section*.

            // Brass bell — a broad projection peak on the body path. Placed
            // above the trumpet's 1.2 kHz bell, and register-aware (less boost
            // up high) so high voicings don't turn nasal.
            const bellGain = freq > 500 ? Math.max(3, 6 - (freq - 500) * 0.008) : 6;
            const bell = playback.audio.createBiquadFilter();
            bell.type = 'peaking';
            bell.frequency.setValueAtTime(1900, playTime);
            bell.Q.setValueAtTime(0.8, playTime);
            bell.gain.setValueAtTime(bellGain, playTime);
            filter.connect(bell);
            bell.connect(gain);
            voiceNodes.push(bell);

            // Two bandpass formants — the resonant brass honk. Fixed
            // frequencies (a formant is a body resonance, not pitch-tracked);
            // Q slightly broader than the soloist sax so it reads as a section
            // rather than one reedy instrument. Mixed in below the body level.
            const formantGain = playback.audio.createGain();
            formantGain.gain.setValueAtTime(0.4, playTime);
            const f1 = playback.audio.createBiquadFilter();
            f1.type = 'bandpass';
            f1.frequency.setValueAtTime(1200, playTime);
            f1.Q.setValueAtTime(2.5, playTime);
            const f2 = playback.audio.createBiquadFilter();
            f2.type = 'bandpass';
            f2.frequency.setValueAtTime(2500, playTime);
            f2.Q.setValueAtTime(3.0, playTime);
            osc1.connect(f1);
            osc2.connect(f1);
            osc1.connect(f2);
            osc2.connect(f2);
            f1.connect(formantGain);
            f2.connect(formantGain);
            formantGain.connect(gain);
            voiceNodes.push(formantGain, f1, f2);

            // Noise-breath layer — the air of real players. Reuses the shared
            // noise buffer (the sax technique at synth-soloist.ts). Skipped
            // when the buffer is absent or the note is silent.
            const noiseBuffer = groove.audioBuffers?.noise;
            if (noiseBuffer && finalVol > 0) {
                const breath = playback.audio.createBufferSource();
                breath.buffer = noiseBuffer;
                breath.loop = true;
                const breathHP = playback.audio.createBiquadFilter();
                breathHP.type = 'highpass';
                breathHP.frequency.setValueAtTime(2000, playTime);
                const breathGain = playback.audio.createGain();
                // Breath as a front-loaded attack "chiff" (S3 rapid-stab fix):
                // a real horn section's breathiness lives at the stab attack,
                // not as a sustained airy bed. A short swell-in + fast decay,
                // decoupled from note duration, keeps each chiff time-localized
                // to its attack — so rapid/chord stabs become a row of crisp
                // articulations instead of overlapping into a fluctuating
                // noise wash. The level is scaled by 1/sqrt(voices): broadband
                // noise sums by power, so 1/sqrt keeps the total section air
                // roughly flat no matter how many notes stack in a chord stab.
                // (The constant base is not ×finalVol — the breath is enveloped
                // a second time by the voice `gain`.)
                const breathLevel = 0.07 / Math.sqrt(1 + harmony.activeVoices.length);
                breathGain.gain.setValueAtTime(0, playTime);
                breathGain.gain.setTargetAtTime(breathLevel, playTime, 0.008);
                breathGain.gain.setTargetAtTime(0, playTime + 0.04, 0.05);
                breath.connect(breathHP);
                breathHP.connect(breathGain);
                breathGain.connect(gain);
                breath.start(playTime);
                breath.stop(playTime + duration + 0.5);
                voiceNodes.push(breath, breathHP, breathGain);
            }
        } else {
            filter.connect(gain);
        }
    }

    // --- Universal frequency block (slides apply to osc1/osc2/sub) ---
    // why: the slide ramps oscillator frequency with exponential ramps, which
    // throw on a non-positive endpoint. `freq > 0` is guaranteed by the entry
    // guard, so both endpoints are safe.
    if (slideInterval !== 0 && slideDuration > 0) {
        const startFreq = freq * 2 ** (slideInterval / 12);
        osc1.frequency.setValueAtTime(startFreq, playTime);
        osc2.frequency.setValueAtTime(startFreq, playTime);
        osc1.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
        osc2.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
        if (sub) {
            sub.frequency.setValueAtTime(startFreq * 0.5, playTime);
            sub.frequency.exponentialRampToValueAtTime(freq * 0.5, playTime + slideDuration);
        }
    } else {
        osc1.frequency.setValueAtTime(freq, playTime);
        osc2.frequency.setValueAtTime(freq, playTime);
        if (sub) {
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }

    // --- Bloom: a per-style filter-cutoff envelope ---
    const intensity = playback.bandIntensity;
    const brightnessMult = 1.0 + intensity * 2.0;

    if (style === 'stabs') {
        const qVal = feel === 'Rock' || feel === 'Metal' ? 5 + intensity * 5 : 3 + intensity * 2;
        const startFreq = Math.min(freq * 8 * brightnessMult, 12000);
        filter.frequency.setValueAtTime(clampFreq(startFreq), playTime);
        filter.frequency.exponentialRampToValueAtTime(
            clampFreq(freq * 2 * brightnessMult),
            playTime + 0.1,
        );
        filter.Q.setValueAtTime(qVal, playTime);
    } else if (style === 'plucks') {
        filter.frequency.setValueAtTime(clampFreq(freq * 8), playTime);
        filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 1.5), playTime + 0.1);
        filter.Q.setValueAtTime(5 + intensity * 5, playTime);
    } else if (style === 'disco') {
        filter.frequency.setValueAtTime(clampFreq(freq * 6), playTime);
        filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 2), playTime + 0.12);
        filter.Q.setValueAtTime(2 + intensity * 3, playTime);
    } else if (style === 'counter') {
        filter.frequency.setValueAtTime(clampFreq(freq * 1.5), playTime);
        filter.frequency.linearRampToValueAtTime(
            clampFreq(freq * 3.0 * brightnessMult),
            playTime + duration * 0.6,
        );
        filter.Q.setValueAtTime(1.0, playTime);
    } else {
        // Default branch — also the organ bloom (organ is not stabs/plucks/
        // disco/counter). A gentle swell-and-settle around the cutoff.
        const cutoff =
            feel === 'Neo-Soul' ? freq * 1.5 * brightnessMult : freq * 3 * brightnessMult;
        filter.frequency.setValueAtTime(clampFreq(cutoff), playTime);
        filter.frequency.exponentialRampToValueAtTime(
            clampFreq(cutoff * 1.2),
            playTime + duration * 0.5,
        );
        filter.frequency.exponentialRampToValueAtTime(clampFreq(cutoff), playTime + duration);
        filter.Q.setValueAtTime(1 + intensity, playTime);
    }

    // --- Envelope (ADSR — synth-audit Epic 1 S2) ---
    // The S1 voice carried the inherited AR shape — attack straight into the
    // release, no decay or sustain stage — so every held note was a flat
    // plateau. A real decay-to-sustain stage gives pad/string styles a swell
    // (the slow attack rising) that then settles (decay down to a slightly
    // lower sustain) instead of sitting frozen. Fast styles (stabs/plucks/
    // organ) get decay 0 / sustain at the peak, so their envelope collapses
    // back to plain AR — their character is unchanged.
    const isFastAttack = style === 'stabs' || style === 'plucks' || isOrgan;
    const baseAttack = isFastAttack ? 0.01 : 0.2;
    const attackFloor = retriggerProfile?.attackFloor || 0.005;
    let attack = Math.max(attackFloor, baseAttack - finalVol * 0.15);
    let release = style === 'stabs' ? 0.1 : style === 'plucks' ? 0.02 : 0.5;
    // Pad styles settle ~20% below the attack peak over a 0.35 s decay. The
    // 'stabs' horn section (S3) gets a fast 60 ms decay to ~92% — a gentle
    // "tiny swell": the stab pops to the peak then settles slightly,
    // brass-like, rather than sitting flat. The settle is kept shallow so
    // stabs in rapid succession stay even in level. Plucks/organ hold at the
    // peak (decay 0 — AR).
    const decay = style === 'stabs' ? 0.06 : isFastAttack ? 0 : 0.35;
    const sustainLevel = finalVol * (style === 'stabs' ? 0.92 : isFastAttack ? 1.0 : 0.8);

    // isBloom — a harmonic-bloom hit on a soloist anchor. A swell-in attack
    // completes the gesture. MAX of a 20% bump and a +5 ms additive bump so
    // the swell is audible on both pad styles and floor-pinned fast styles.
    if (isBloom) {
        attack = Math.max(attack * 1.2, attack + 0.005);
    }
    // isLatched — a held seed-anchor reinforcement that should linger across
    // the next beat. Slow the decay (60% longer), capped inside the
    // oscillator lifetime, floored so a latched note never decays faster
    // than a plain one.
    if (isLatched) {
        release = Math.max(release, Math.min(release * 1.6, duration + 0.4));
    }

    const detuneMult = 1.0 + finalVol * 0.5;
    // isBloom widens the chorus by ±3 cents of extra random detune.
    const bloomDetune = isBloom ? 3 : 0;
    osc1.detune.setValueAtTime(
        (Math.random() - 0.5) * 4 + (Math.random() - 0.5) * 2 * bloomDetune,
        playTime,
    );
    osc2.detune.setValueAtTime(
        (style === 'stabs' ? 12 : 8) * detuneMult +
            (Math.random() - 0.5) * 4 +
            (Math.random() - 0.5) * 2 * bloomDetune,
        playTime,
    );

    const attackEnd = playTime + attack;
    const decayEnd = attackEnd + decay;
    // why: anchor the release start to the END of the decay, not just
    // `playTime + duration - release`. For a short pad note the latter lands
    // before the attack/decay finish — the §5 distortion where the note never
    // reaches its peak. The max() guarantees attack→decay always complete; a
    // long note still sustains at `sustainLevel` in the gap between `decayEnd`
    // and the release.
    const releaseStart = Math.max(decayEnd, playTime + duration - release);
    gain.gain.setValueAtTime(0, playTime);
    gain.gain.linearRampToValueAtTime(finalVol, attackEnd);
    if (decay > 0) {
        gain.gain.linearRampToValueAtTime(sustainLevel, decayEnd);
    }
    gain.gain.setTargetAtTime(0, releaseStart, release);

    gain.connect(panner);
    if (playback.audioGraph) {
        panner.connect(playback.audioGraph.harmonies.gain);
    }

    // Register the active voice.
    const voiceRefs = { gain, time: playTime, duration, midi, nodes: voiceNodes };
    harmony.activeVoices.push(voiceRefs);

    osc1.start(playTime);
    osc2.start(playTime);
    if (sub) {
        sub.start(playTime);
    }

    // why: a pad's release tail is a `setTargetAtTime` exponential — it needs
    // room to decay below audibility before the oscillators hard-stop, or the
    // `osc.stop()` clips it into a click. Give pads 4 release time constants
    // past the release start (~1.8% of peak remaining). Fast styles keep the
    // original tail — their releases are already short.
    const stopTime = isFastAttack
        ? playTime + duration + 0.5
        : Math.max(playTime + duration + 0.5, releaseStart + release * 4);
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    if (sub) {
        sub.stop(stopTime);
    }
    if (lfo) {
        lfo.stop(stopTime);
    }
    if (tremoloLfo) {
        tremoloLfo.stop(stopTime);
    }

    osc1.onended = () => safeDisconnect(voiceNodes);
}

function playHarmonyNoteCurrent(
    state: EnsembleState,
    freq: number,
    time: number,
    duration: number,
    vol = 0.4,
    style = 'stabs',
    midi: number | null = null,
    slideInterval = 0,
    slideDuration = 0,
    vibrato = { rate: 0, depth: 0 },
    isLegato = false,
    // epic-harmony-polish S4 — gesture flags. The engine already shapes voicing
    // and velocity for blooms / latched anchors; the synth side completes the
    // gesture by shaping attack, detune, and release so the note is audibly
    // distinct from a plain stab. See engine-side comments in harmonies.ts.
    isBloom = false,
    isLatched = false,
) {
    const { playback, harmony, groove } = state;
    if (!Number.isFinite(freq) || !playback.audio) {
        return;
    }

    const now = playback.audio.currentTime;
    const playTime = Math.max(time, now);
    const feel = groove.genreFeel;
    let retriggerProfile: ReturnType<typeof getHarmonyRetriggerProfile> | null = null;

    if (!harmony.activeVoices) {
        (harmony as Mutable<typeof harmony>).activeVoices = []; // @direct-mutation
    }

    for (let i = harmony.activeVoices.length - 1; i >= 0; i--) {
        const voice = harmony.activeVoices[i];
        // why: `lastExtendedAt` is set on every legato extension below; without
        // it, voice.time stays anchored at the original first-attack, which
        // would make a legato chain look stale immediately even while a
        // recently-extended voice is still ringing. Falls back to voice.time
        // for voices that were never extended (the common case).
        const lastAttackTime = voice.lastExtendedAt ?? voice.time;
        if (lastAttackTime + voice.duration + 1.0 <= playTime) {
            harmony.activeVoices.splice(i, 1); // @worker-mutation
        }
    }

    // Legato continuation (epic-harmony-polish S1):
    // why: when the harmony engine flags a note as a held continuation of a
    // voice that's already sounding at this exact MIDI (pad-mode common-tone
    // carryover), extend the existing voice in place instead of choking + re-
    // attacking. This is what makes "The Sea" / strings actually sustain across
    // chord changes — without it, every common tone hears a stab-stab-stab
    // re-articulation.
    //
    // Implementation:
    //   1. Find the existing voice at the same midi.
    //   2. Cancel its scheduled release ramp.
    //   3. Extend its `duration` so the new fade-out happens at
    //      playTime + duration instead of the original (earlier) end time.
    //   4. Re-schedule the gain release using a short release tail (matches
    //      the original setTargetAtTime release for pad-style voices).
    //   5. Return early — do NOT spawn new oscillators. This keeps the
    //      audio graph leak-free (no orphan nodes; the existing voice's
    //      onended/stop chain still cleans up at the new stopTime).
    if (isLegato && midi !== null) {
        const existing = harmony.activeVoices.find((v: { midi: number | null }) => v.midi === midi);
        if (existing?.gain && playback.audio) {
            const releaseTail = style === 'stabs' ? 0.1 : style === 'plucks' ? 0.02 : 0.5;
            try {
                existing.gain.gain.cancelScheduledValues(playTime);
            } catch {
                /* some test mocks don't implement cancelScheduledValues */
            }
            // Restore gain to the freshly-attacked level so the survivor voice
            // rides the new chord at full volume rather than continuing to
            // decay from wherever the previous release ramp had reached.
            // why: cancelScheduledValues only blocks future events — if the
            // previous release had already started ramping toward 0, the
            // AudioParam value is mid-decay and would otherwise continue
            // dropping. Without this restore, a survivor voice would sit
            // audibly behind the freshly-attacked sibling voices in the same
            // emission; this is especially audible on short-release styles
            // (stabs/plucks). 5 ms ramp avoids a zipper click.
            const polyphonyDucking = harmony.activeVoices.length > 1 ? 0.85 : 1.0;
            const restoreVol = vol * polyphonyDucking;
            try {
                existing.gain.gain.linearRampToValueAtTime(restoreVol, playTime + 0.005);
            } catch {
                existing.gain.gain.setValueAtTime?.(restoreVol, playTime);
            }
            // Schedule the new release window relative to the extended end time.
            const newEnd = playTime + duration;
            existing.gain.gain.setTargetAtTime(
                0,
                Math.max(playTime + 0.005, newEnd - releaseTail),
                releaseTail,
            );
            // Update the voice record so subsequent legato extensions chain
            // correctly and the stale-voice GC sees the new end time.
            // why: track `lastExtendedAt` separately rather than accumulating
            // into `duration`. Previously `duration = newEnd - existing.time`
            // grew monotonically across N consecutive chord-change extensions
            // (~N × bar_length after N extensions), which is bookkeeping
            // garbage even though it didn't affect playback (activeVoices is
            // hard-capped at 3). New invariant: `duration` is the duration of
            // the most recent attack window; `lastExtendedAt` is when that
            // attack fired. GC keys on `lastExtendedAt + duration + 1.0`.
            existing.lastExtendedAt = playTime;
            existing.duration = duration;
            // Push oscillator stop times out to the new end (best-effort —
            // not every voice's nodes implement .stop; that's fine, the gain
            // ramp to 0 is the audible truth and stale-voice GC will clean up).
            const stopAt = newEnd + 0.5;
            if (existing.nodes) {
                for (const node of existing.nodes as Array<
                    AudioNode & { stop?: (t: number) => void }
                >) {
                    try {
                        node.stop?.(stopAt);
                    } catch {
                        /* ignore: node may already be stopped */
                    }
                }
            }
            return;
        }
        // No existing voice to extend — fall through and create one normally.
        // This handles the edge case where the engine flagged legato but the
        // synth had already cleaned up the voice (voice timed out, killed by
        // an earlier non-legato chord change, etc.).
    }

    // Pitch-aware Stealing — gated on !isLegato so same-midi legato voices
    // are NOT choked here (they're handled by the legato block above).
    if (!isLegato && midi !== null) {
        const existing = harmony.activeVoices.find((v: { midi: number | null }) => v.midi === midi);
        if (existing) {
            retriggerProfile = getHarmonyRetriggerProfile(style);
            killActiveVoices([existing], playTime, retriggerProfile.fadeTime);
            const existingIndex = harmony.activeVoices.indexOf(existing);
            if (existingIndex !== -1) {
                harmony.activeVoices.splice(existingIndex, 1); // @worker-mutation
            }
        }
    }

    // Polyphonic Limit (Max 3 voices)
    if (harmony.activeVoices.length >= 3) {
        const oldest = harmony.activeVoices.shift();
        if (oldest) {
            killActiveVoices([oldest], playTime, HARMONY_VOICE_LIMIT_FADE);
        }
    }

    const polyphonyDucking = harmony.activeVoices.length > 1 ? 0.85 : 1.0;
    const finalVol = vol * polyphonyDucking;

    const gain = playback.audio.createGain();
    gain.gain.value = 0;

    const filter = playback.audio.createBiquadFilter();
    filter.type = 'lowpass';

    const panRange = 0.1 + playback.bandIntensity * 0.7;
    const panValue = (Math.random() * 2 - 1) * panRange;
    const panner = createSimplePanner(playback.audio, panValue, playTime);

    const osc1 = playback.audio.createOscillator();
    const osc2 = playback.audio.createOscillator();

    const useSub = freq > 250;
    const sub = useSub ? playback.audio.createOscillator() : null;

    const voiceNodes: AudioNode[] = [gain, filter, panner, osc1, osc2];
    if (sub) {
        voiceNodes.push(sub);
    }

    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    let tremoloLfo: OscillatorNode | null = null;
    let fifthOsc: OscillatorNode | null = null;
    let click: OscillatorNode | null = null;
    let clickGain: GainNode | null = null;
    let saturator: WaveShaperNode | null = null;
    let subGain: GainNode | null = null;
    let hp: BiquadFilterNode | null = null;

    if (style === 'organ') {
        const intensityForLeslie = playback.bandIntensity || 0.5;
        const leslieSpeed =
            intensityForLeslie < 0.4
                ? 0.7
                : intensityForLeslie > 0.6
                  ? 6.2
                  : 0.7 + ((intensityForLeslie - 0.4) / 0.2) * 5.5;
        saturator = playback.audio.createWaveShaper();
        saturator.curve = getOrganSaturationCurve();
        voiceNodes.push(saturator);

        lfo = playback.audio.createOscillator();
        lfoGain = playback.audio.createGain();
        lfo.frequency.setValueAtTime(leslieSpeed, playTime);
        lfoGain.gain.setValueAtTime(5, playTime);
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);
        if (sub) {
            lfoGain.connect(sub.frequency);
        }
        lfo.start(playTime);
        voiceNodes.push(lfo, lfoGain);

        tremoloLfo = playback.audio.createOscillator();
        tremoloLfo.type = 'sine';
        tremoloLfo.frequency.setValueAtTime(leslieSpeed, playTime);
        // The Leslie tremolo is applied as an additive a-rate modulation on
        // gain.gain via `tremAmp` (the gain envelope is the DC term, ±tremDepth
        // is the swing). The old `tremoloGain` node held a `1 - tremDepth`
        // offset but was never connected into the graph — pure dead allocation,
        // removed. Sound is unchanged.
        const tremDepth = 0.2;
        const tremAmp = playback.audio.createGain();
        tremAmp.gain.setValueAtTime(tremDepth, playTime);
        tremoloLfo.connect(tremAmp);
        tremAmp.connect(gain.gain);
        tremoloLfo.start(playTime);
        voiceNodes.push(tremoloLfo, tremAmp);
    } else if (vibrato && (vibrato.rate || 0) > 0 && (vibrato.depth || 0) > 0) {
        lfo = playback.audio.createOscillator();
        lfoGain = playback.audio.createGain();
        lfo.frequency.setValueAtTime(vibrato.rate || 0, playTime);
        lfoGain.gain.setValueAtTime(vibrato.depth || 0, playTime);
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);
        if (sub) {
            lfoGain.connect(sub.frequency);
        }
        lfo.start(playTime);
        voiceNodes.push(lfo, lfoGain);
    }

    if (feel === 'Rock' || feel === 'Metal') {
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(15, playTime);
        if (sub) {
            sub.type = 'sawtooth';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else if (feel === 'Neo-Soul' || feel === 'Acoustic') {
        osc1.type = 'triangle';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(2, playTime);
        if (sub) {
            sub.type = 'triangle';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else if (style === 'organ') {
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 2, playTime);
        fifthOsc = playback.audio.createOscillator();
        fifthOsc.type = 'sine';
        fifthOsc.frequency.setValueAtTime(freq * 1.5, playTime);
        voiceNodes.push(fifthOsc);

        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
            subGain = playback.audio.createGain();
            subGain.gain.setValueAtTime(0.5, playTime);
            sub.connect(subGain);
            if (saturator) {
                subGain.connect(saturator);
            }
            voiceNodes.push(subGain);
        }

        // why: the click ramp is `exponentialRampToValueAtTime`, which throws if
        // it ramps *from* a zero anchor. The anchor here is `finalVol * 0.6`, so
        // skip the click entirely when `finalVol` is 0 (a silent note has no
        // audible key-click to render anyway).
        if (!retriggerProfile?.suppressClick && finalVol > 0) {
            click = playback.audio.createOscillator();
            clickGain = playback.audio.createGain();
            click.type = 'square';
            click.frequency.setValueAtTime(freq * 4, playTime);
            clickGain.gain.setValueAtTime(finalVol * 0.6, playTime);
            clickGain.gain.exponentialRampToValueAtTime(0.001, playTime + 0.04);
            click.connect(clickGain);
            clickGain.connect(gain);
            click.start(playTime);
            click.stop(playTime + 0.1);
            voiceNodes.push(click, clickGain);
        }

        if (saturator) {
            osc1.connect(saturator);
            osc2.connect(saturator);
            fifthOsc.connect(saturator);
            hp = playback.audio.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.setValueAtTime(120, playTime);
            saturator.connect(filter);
            filter.connect(hp);
            hp.connect(gain);
            voiceNodes.push(hp);
        } else {
            osc1.connect(filter);
            osc2.connect(filter);
            fifthOsc.connect(filter);
            filter.connect(gain);
        }

        fifthOsc.start(playTime);
        fifthOsc.stop(playTime + duration + 0.5);
        if (lfoGain) {
            lfoGain.connect(fifthOsc.frequency);
        }
    } else if (style === 'plucks') {
        osc1.type = 'sawtooth';
        osc2.type = 'square';
        osc2.detune.setValueAtTime(5, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else if (style === 'disco') {
        osc1.type = 'triangle';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(4, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else if (style === 'counter') {
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(4, playTime);
    } else if (style === 'stabs') {
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(12, playTime);
        if (sub) {
            sub.type = 'triangle';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else {
        osc1.type = 'triangle';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(8, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }

    // Slides
    // why: the slide ramps oscillator frequency with `exponentialRampToValueAtTime`,
    // which throws on a zero/non-finite target or anchor. `freq` is finite-checked
    // at entry but could still be 0; require `freq > 0` so both endpoints
    // (`startFreq` and `freq`) are strictly positive. A non-positive freq falls
    // through to the plain `setValueAtTime` path below (no exponential ramp).
    if (slideInterval !== 0 && slideDuration > 0 && freq > 0) {
        const startFreq = freq * 2 ** (slideInterval / 12);
        osc1.frequency.setValueAtTime(startFreq, playTime);
        osc2.frequency.setValueAtTime(startFreq, playTime);
        if (sub) {
            sub.frequency.setValueAtTime(startFreq * 0.5, playTime);
        }
        osc1.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
        osc2.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
        if (sub) {
            sub.frequency.exponentialRampToValueAtTime(freq * 0.5, playTime + slideDuration);
        }
    } else {
        osc1.frequency.setValueAtTime(freq, playTime);
        osc2.frequency.setValueAtTime(freq, playTime);
        if (sub) {
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }

    // Bloom
    const intensity = playback.bandIntensity;
    const brightnessMult = 1.0 + intensity * 2.0;

    if (style === 'stabs') {
        const qVal = feel === 'Rock' || feel === 'Metal' ? 5 + intensity * 5 : 3 + intensity * 2;
        const startFreq = Math.min(freq * 8 * brightnessMult, 12000);
        filter.frequency.setValueAtTime(clampFreq(startFreq), playTime);
        filter.frequency.exponentialRampToValueAtTime(
            clampFreq(freq * 2 * brightnessMult),
            playTime + 0.1,
        );
        filter.Q.setValueAtTime(qVal, playTime);
    } else if (style === 'plucks') {
        filter.frequency.setValueAtTime(clampFreq(freq * 8), playTime);
        filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 1.5), playTime + 0.1);
        filter.Q.setValueAtTime(5 + intensity * 5, playTime);
    } else if (style === 'disco') {
        filter.frequency.setValueAtTime(clampFreq(freq * 6), playTime);
        filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 2), playTime + 0.12);
        filter.Q.setValueAtTime(2 + intensity * 3, playTime);
    } else if (style === 'counter') {
        const start = freq * 1.5;
        const peak = freq * 3.0 * brightnessMult;
        filter.frequency.setValueAtTime(clampFreq(start), playTime);
        filter.frequency.linearRampToValueAtTime(clampFreq(peak), playTime + duration * 0.6);
        filter.Q.setValueAtTime(1.0, playTime);
    } else {
        const cutoff =
            feel === 'Neo-Soul' ? freq * 1.5 * brightnessMult : freq * 3 * brightnessMult;
        filter.frequency.setValueAtTime(clampFreq(cutoff), playTime);
        filter.frequency.exponentialRampToValueAtTime(
            clampFreq(cutoff * 1.2),
            playTime + duration * 0.5,
        );
        filter.frequency.exponentialRampToValueAtTime(clampFreq(cutoff), playTime + duration);
        filter.Q.setValueAtTime(1 + intensity, playTime);
    }

    // Envelope
    const isFastAttack = style === 'stabs' || style === 'plucks' || style === 'organ';
    const baseAttack = isFastAttack ? 0.01 : 0.2;
    const attackFloor = retriggerProfile?.attackFloor || 0.005;
    let attack = Math.max(attackFloor, baseAttack - finalVol * 0.15);
    let release = 0.5;
    if (style === 'stabs') {
        release = 0.1;
    }
    if (style === 'plucks') {
        release = 0.02;
    }

    // why: epic-harmony-polish S4 — `isBloom` marks a harmonic-bloom hit on a
    // soloist anchor (playShadowMode tag 2 with seedNote.isAnchor). The engine
    // already thickens the voicing and boosts velocity (×1.8 in harmonies.ts);
    // a swell-in attack completes the gesture so the bloom hears as a lush
    // rise rather than a louder stab. We take the MAX of a 20% bump and a
    // fixed +5 ms additive bump: on pad-style voices (baseAttack 0.2) the
    // multiplicative form wins (≈+40 ms swell, the gesture's main territory);
    // on fast-attack styles (stabs/plucks/organ) the velocity boost from
    // ×1.8 pins `attack` at the floor (0.005), so a multiplicative bump alone
    // is inaudible (≈1 ms) — the additive +5 ms doubles it to 10 ms, just
    // above the human onset-discrimination threshold.
    if (isBloom) {
        attack = Math.max(attack * 1.2, attack + 0.005);
    }
    // why: epic-harmony-polish S4 — `isLatched` marks a held seed-anchor
    // reinforcement (playShadowMode tags 2/3, ska-punk hook latch tag B).
    // The musical intent is "this voice should linger across the next beat
    // boundary" — slow the decay (60% longer time constant) so the latched
    // anchor actually rings out. setTargetAtTime's start-time is
    // `playTime + duration - release`, which can land before `playTime` for
    // styles whose plain release already exceeds the note's duration (pads
    // with release 0.5 emitted at duration 0.125 = 125 ms). That's allowed
    // by Web Audio (the decay just runs from the past) and is the existing
    // behavior for plain pads; we leave the start-time alone and only bump
    // the time constant. Cap at `duration + 0.4` so we stay inside the
    // oscillator's lifetime (`stopTime = playTime + duration + 0.5`); floor
    // at the plain release so a latched note never decays *faster* than a
    // plain one — that would invert the gesture (latched pads at 125 ms
    // duration with the old `min(0.16, duration*0.5)` cap decayed 8× faster
    // than plain, opposite of "linger").
    if (isLatched) {
        const plainRelease = release;
        release = Math.max(plainRelease, Math.min(plainRelease * 1.6, duration + 0.4));
    }

    const detuneMult = 1.0 + finalVol * 0.5;
    // why: epic-harmony-polish S4 — `isBloom` adds an extra 3-cent random
    // detune to each oscillator, widening the chorus on bloom hits. This
    // gives the bloom a lusher, slightly-out-of-tune attack that's
    // timbrally distinct from a clean stab. 3 cents is small enough that
    // the voicing's pitch identity is preserved, but audible as added body.
    const bloomDetune = isBloom ? 3 : 0;
    osc1.detune.setValueAtTime(
        (Math.random() - 0.5) * 4 + (Math.random() - 0.5) * 2 * bloomDetune,
        playTime,
    );
    osc2.detune.setValueAtTime(
        (style === 'stabs' ? 12 : 8) * detuneMult +
            (Math.random() - 0.5) * 4 +
            (Math.random() - 0.5) * 2 * bloomDetune,
        playTime,
    );

    gain.gain.setValueAtTime(0, playTime);
    gain.gain.linearRampToValueAtTime(finalVol, playTime + attack);
    gain.gain.setTargetAtTime(0, playTime + duration - release, release);

    // Routing
    if (style !== 'organ') {
        osc1.connect(filter);
        osc2.connect(filter);
        if (sub) {
            sub.connect(filter);
        }
        filter.connect(gain);
    }

    gain.connect(panner);
    if (playback.audioGraph) {
        panner.connect(playback.audioGraph.harmonies.gain);
    }

    // Register active voice
    const voiceRefs = { gain, time: playTime, duration, midi, nodes: voiceNodes };
    harmony.activeVoices.push(voiceRefs);

    osc1.start(playTime);
    osc2.start(playTime);
    if (sub) {
        sub.start(playTime);
    }

    const stopTime = playTime + duration + 0.5;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    if (sub) {
        sub.stop(stopTime);
    }
    if (lfo) {
        lfo.stop(stopTime);
    }
    if (tremoloLfo) {
        tremoloLfo.stop(stopTime);
    }

    osc1.onended = () => safeDisconnect(voiceNodes);
}
