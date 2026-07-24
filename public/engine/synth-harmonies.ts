import { gainForPack, toneTiltForPack } from '../data/sound-packs.js';
import type { EnsembleState, Mutable } from '../types.js';
import { clampFreq, safeDisconnect } from './audio-graph-utils.js';
import { resolveInstrumentSource } from './instrument-registry.js';
import { playSampledNote } from './sample-voice.js';
import { createSimplePanner, resolveSampledZone } from './synth-utils.js';

/**
 * Polyphonic Synthesizer for the Harmony Module (harmony).
 * Optimized for Horns (stabs) and Strings (pads).
 */

const HARMONY_VOICE_LIMIT_FADE = 0.02;

/**
 * The release contract the synth harmony voice hands back (#934 — mirrors the
 * chord voice's `ChordVoiceHandle`, #707). The scheduler releases a sounding
 * voicing at the next chord's onset via `release(when, fade)`; `midi` lets the
 * release keep same-pitch legato survivors. Structurally satisfied by the
 * `voiceRefs` object the voice registers in `harmony.activeVoices`, so the
 * registry entry *is* the handle — one owner, no parallel handle list.
 */
export type HarmonyVoiceHandle = {
    midi: number | null;
    release(when: number, fade: number): void;
};

// Reused across every release path (chord change + panic): the shared empty
// keep-set means "release all voices" without allocating a Set per call.
const RELEASE_ALL: ReadonlySet<number> = new Set();

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
 * and extended (the caller returns its handle early, spawning no oscillators),
 * `null` when there was nothing to extend (the caller falls through and spawns
 * a fresh voice). Returns the extended voice itself so the caller can hand its
 * release handle back (#934). Extracted as a New-only helper so the rebuilt
 * voice body does not duplicate the Current voice's inline block.
 */
function extendLegatoHarmonyVoice(
    state: EnsembleState,
    midi: number,
    vol: number,
    style: string,
    playTime: number,
    duration: number,
): HarmonyVoiceHandle | null {
    const { playback, harmony } = state;
    const existing = harmony.activeVoices.find((v: { midi: number | null }) => v.midi === midi);
    if (!existing?.gain || !playback.audio) {
        return null;
    }
    const releaseTail = style === 'horns' ? 0.1 : style === 'plucks' ? 0.02 : 0.5;
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
    return existing as HarmonyVoiceHandle;
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
 * silence. Shared by *both* harmony voices' cull/steal retirement (#601 — the
 * Current voice's `killActiveVoices`-based cull/steal was the residual click
 * the #561 fingerpick exposed). The synth-utils helper is left untouched so
 * the other instruments are unaffected.
 */
function killHarmonyVoice(
    voice: { gain?: GainNode; nodes?: AudioNode[] },
    time: number,
    fadeTime: number,
): void {
    // Clamp to finite values before anything reaches an AudioParam (#934 review).
    // This is now the *sole* harmony release path and a public API surface
    // (`releaseHarmonyVoicing`), so it guards its own inputs the way the chords
    // `ChordVoiceHandle.release` does rather than trust callers: a non-finite
    // `time` would make every write below throw into the `catch`, pruning the
    // voice from `activeVoices` while leaving it sounding with no handle left to
    // stop it. A garbage `time` falls back to 0 — a past time the audio clock
    // applies immediately, i.e. "release now".
    const at = Number.isFinite(time) ? time : 0;
    const fade = Math.max(0.005, Number.isFinite(fadeTime) ? fadeTime : 0.05);
    const g = voice.gain?.gain;
    if (g) {
        try {
            g.cancelScheduledValues(at);
            // Anchor at the current value so the ramp is a true `fade`, not a
            // slow ramp down from some stale earlier event.
            g.setValueAtTime(g.value, at);
            g.linearRampToValueAtTime(0, at + fade);
        } catch {
            /* some test mocks don't implement the full AudioParam API */
        }
    }
    if (voice.nodes) {
        for (const node of voice.nodes as Array<AudioNode & { stop?: (t: number) => void }>) {
            try {
                // Stop only after the linear fade has reached 0.
                node.stop?.(at + fade + 0.02);
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
    // Key bridge: the shared `getHarmonyRetriggerProfile` predates the
    // engine's `HARMONY_STYLES` rename — its fast-retrigger list is keyed on
    // the legacy `'stabs'`. Map the real `'horns'` style onto it here so the
    // horn section gets the intended snappy retrigger (20 ms fade, 0.012
    // attack floor). The shared helper is left untouched (other callers depend
    // on its legacy keying).
    const profile = getHarmonyRetriggerProfile(style === 'horns' ? 'stabs' : style);
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
    // Base timbre per style. The keys here are the engine's real harmony-style
    // vocabulary (`HARMONY_STYLES`): horns, strings, organ, plucks, counter.
    // (Organ is handled in its own branch upstream and never reaches here.)
    let timbre: HarmonyTimbre;
    switch (style) {
        case 'plucks':
            timbre = { osc1: 'sawtooth', osc2: 'square', osc2Detune: 5, sub: 'sine' };
            break;
        case 'counter':
            timbre = { osc1: 'sawtooth', osc2: 'triangle', osc2Detune: 4, sub: 'sine' };
            break;
        case 'horns':
            // Sawtooth core (synth-audit Epic 1 S3 "Horn Section"): a saw pair
            // gives the rich harmonic spectrum the brass formants carve.
            timbre = { osc1: 'sawtooth', osc2: 'sawtooth', osc2Detune: 12, sub: 'triangle' };
            break;
        case 'strings':
            // String ensemble (synth-audit Epic 1 S4): an all-sawtooth core —
            // every layer the same waveform so the detuned ensemble blends as
            // one section. The extra layers are added in the routing branch.
            timbre = { osc1: 'sawtooth', osc2: 'sawtooth', osc2Detune: 8, sub: 'sawtooth' };
            break;
        default:
            // Any future style — a soft saw/triangle pad blend.
            timbre = { osc1: 'triangle', osc2: 'sawtooth', osc2Detune: 8, sub: 'sine' };
    }
    // genreFeel bias — a lean, not a replacement. Rock/Metal want brightness
    // and width (a saw pair, wider detune); Neo-Soul/Acoustic want a softer,
    // tighter blend (a triangle pair, narrower detune). The style's detune
    // *character* is preserved by widening/narrowing rather than overwriting:
    // the 'horns' style stays the widest style under any feel.
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

/**
 * Release a harmony voicing, click-free, and prune the retired voices from the
 * registry (#934 — the single voice-lifecycle owner). Voices whose MIDI is in
 * `keepMidis` survive (same-pitch legato held across the chord change); every
 * other voice is released via its own `release` handle — a `linearRamp` that
 * reaches *exactly* 0 (the #601 click-free retirement), never the shared
 * `killActiveVoices` `setTargetAtTime` that hard-stops at ~3% and clicks.
 *
 * `when` schedules the fade at a future audio time (B11/#710) — the scheduler
 * passes the new chord's onset for a true crossfade rather than cutting the
 * prior pad ~200-400ms early at `currentTime`. This is the ONE place that
 * mutates `harmony.activeVoices` on release, so the scheduler never reaches
 * into the array itself.
 */
export function releaseHarmonyVoicing(
    state: EnsembleState,
    keepMidis: ReadonlySet<number>,
    when: number,
    fade: number,
): void {
    const { harmony } = state;
    const voices = harmony.activeVoices;
    if (!voices || voices.length === 0) {
        return;
    }
    const survivors: typeof voices = [];
    for (const v of voices) {
        if (v.midi !== null && v.midi !== undefined && keepMidis.has(v.midi)) {
            survivors.push(v);
        } else if (typeof v.release === 'function') {
            v.release(when, fade); // the voice's own click-free handle (#934)
        } else {
            // Hand-built voices (some unit-test mocks) have no handle — fall
            // back to the shared click-free retirement directly.
            killHarmonyVoice(v, when, fade);
        }
    }
    // Rebuild in-place so the worker keeps the same array reference.
    voices.length = 0; // @worker-mutation
    for (const v of survivors) {
        voices.push(v); // @worker-mutation
    }
}

/**
 * Blanket release of every harmony voice — the panic/stop/voice-switch entry
 * point (called by the instrument controller and the engine stop path). Kept as
 * the public API it always was, but its internals now delegate to the click-free
 * `releaseHarmonyVoicing` (#934) instead of the shared `killActiveVoices`, so a
 * stop no longer risks the residual-gain click on a loud held pad. `when`
 * defaults to `currentTime` for immediate callers.
 */
export function killHarmonyNote(state: EnsembleState, fadeTime = 0.05, when?: number) {
    const { playback } = state;
    if (!playback.audio) {
        return;
    }
    const now = playback.audio.currentTime;
    const killTime = Number.isFinite(when) ? Math.max(when as number, now) : now;
    releaseHarmonyVoicing(state, RELEASE_ALL, killTime, fadeTime);
}

// The synth harmony voice. `playHarmonyNoteNew` is the reworked synth-audit
// voice — the only one since #649 retired the Current/New A/B.
function dispatchHarmonySynth(
    ...args: Parameters<typeof playHarmonyNoteNew>
): HarmonyVoiceHandle | null {
    return playHarmonyNoteNew(...args);
}

// synth-audit Epic 6 — play one harmony voice from a sample pack (#660, the
// String Ensemble pad). Converts the scheduled frequency to a MIDI target,
// picks the nearest loaded zone, and plays it through the harmonies gain bus
// (inheriting the bus EQ/reverb/limiting). Returns false — so the caller falls
// back to the synth voice — when the pack's zones aren't loaded yet or the note
// is otherwise unplayable. Sustained-pad samples suit the harmony lane's ≤3
// held voices; the per-note envelope (attack + release) shapes each held note.
function playSampledHarmony(
    state: EnsembleState,
    packId: string,
    freq: number,
    time: number,
    duration: number,
    vol: number,
): boolean {
    // Fold notes above the pack's sampled range down an octave (#755): harmony
    // runs to MIDI 84 but the strings top at 74 and horns at 72, so the top zone
    // would otherwise pitch-shift up into a thin metallic ring. In-range unchanged.
    const resolved = resolveSampledZone(state, 'harmonies', packId, freq);
    if (!resolved) {
        return false;
    }
    const { audio, dest, zone, targetMidi } = resolved;
    // Lift the loudness-normalized sample to the synth harmony seat via the
    // pack's catalog-owned gain (`gainForPack`, #656 — calibrated against the
    // synth baseline by `mix-report --calibrate-pack`). NOT clamped to ≤1 here:
    // a quiet pad must play above unity to reach the synth pad's level, so the
    // over-unity value passes through to `playSampledNote`, which bounds it at
    // MAX_SAMPLE_PEAK and the master limiter catches peaks when 3 voices stack.
    // A slower attack/release than the default reads as a bowed pad, not a pluck.
    const velocity = (Number.isFinite(vol) ? vol : 0.4) * gainForPack(packId);
    // Scale the release tail with the note's own duration (#785). The sampled
    // pad's tail is appended AFTER the hold, so a fixed 0.3 s tail is ~60-70% of
    // a 1-beat note at 120-140 bpm — short notes smear into the next chord and
    // Acoustic strings turn to mud. The synth pad path already scales its release
    // with duration; mirror that here. ~40% of the note rings out, capped at the
    // old 0.3 s so genuinely long held chords keep the lush bowed tail, floored
    // at 0.08 s so a fast fingerpick note still decays click-free.
    const heldDur = Number.isFinite(duration) && duration > 0 ? duration : 0.5;
    const release = Math.max(0.08, Math.min(0.3, heldDur * 0.4));
    playSampledNote(audio, zone, dest, targetMidi, Math.max(time, audio.currentTime), {
        velocity,
        duration,
        attack: 0.06,
        release,
        tone: toneTiltForPack(packId),
    });
    return true;
}

// synth-audit Epic 6 S1 — instrument-source seam. A `pack:<id>` voice plays
// from the sample pack once its zones are loaded; until then (or if a note is
// out of range) it falls back to the synth voice — bit-identical with no packs.
export function playHarmonyNote(
    ...args: Parameters<typeof playHarmonyNoteNew>
): HarmonyVoiceHandle | null {
    const source = resolveInstrumentSource(args[0].harmony.voice);
    if (source.kind === 'sample') {
        const [state, freq, time, duration, vol = 0.4] = args;
        // The sampled pad self-releases on its own duration envelope and isn't
        // registered in `activeVoices`; it exposes no chord-change handle (the
        // #934 handle plumbing is scoped to the synth voice), so return null.
        if (playSampledHarmony(state, source.packId, freq, time, duration, vol)) {
            return null;
        }
    }
    return dispatchHarmonySynth(...args);
}

/**
 * The synth harmony voice (rebuilt in synth-audit Epic 1). Structurally:
 *
 *  1. `style` is decoupled from `genreFeel`. Organ is checked as its own
 *     top-level branch, and the non-organ timbre comes from
 *     `resolveHarmonyTimbre`, where feel only biases the style's base
 *     waveforms. Every `style` branch is reachable under every feel.
 *  2. Non-positive `freq` is rejected at the door (harmony.md §5 follow-up)
 *     — the Bloom filter ramps below would otherwise hit a zero target via
 *     `clampFreq` (which floors at 0) and throw.
 *
 * Named formant presets (S3 horn section, S4 string pad) and the real ADSR
 * envelope (S2) build onto this skeleton.
 */
function playHarmonyNoteNew(
    state: EnsembleState,
    freq: number,
    time: number,
    duration: number,
    vol = 0.4,
    style = 'horns',
    midi: number | null = null,
    slideInterval = 0,
    slideDuration = 0,
    vibrato = { rate: 0, depth: 0 },
    isLegato = false,
    isBloom = false,
    isLatched = false,
): HarmonyVoiceHandle | null {
    const { playback, harmony, groove } = state;
    // Reject non-finite AND non-positive freq — see the doc comment above.
    if (!Number.isFinite(freq) || freq <= 0 || !playback.audio) {
        return null;
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
        const extended = extendLegatoHarmonyVoice(state, midi, vol, style, playTime, duration);
        if (extended) {
            return extended; // hand back the still-live voice's release handle
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
    // String-ensemble nodes (S4) — populated by the 'strings' routing branch,
    // stopped centrally in the universal stop block below.
    let chorusLfo: OscillatorNode | null = null;
    const stringLayers: OscillatorNode[] = [];

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

        if (style === 'horns') {
            // --- "Horn Section" voice (synth-audit Epic 1 S3) ---
            // A real brass-section character layered onto the sawtooth core +
            // horns bloom. Three parts, all summed at the voice `gain`:
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
        } else if (style === 'strings') {
            // --- "String Pad" ensemble voice (synth-audit Epic 1 S4) ---
            // The canonical pure-synth "expensive pad": a detuned sawtooth
            // ensemble with width and slow movement, not a static two-osc duo.
            //   - osc1/osc2 (the saw core) plus 3 extra saw layers = 5 voices,
            //     spread across ~38 cents of static detune for ensemble width.
            //   - Each extra layer starts a few ms late so the ensemble blooms
            //     in rather than hitting as one block (per-layer attack offset).
            //   - One slow chorus LFO sweeps every layer's detune a few cents
            //     for the continuous movement that separates a real ensemble
            //     from a frozen chord.
            //   - A body-resonance peak adds string-body warmth.

            // Slow ensemble chorus LFO — created first so the extra layers can
            // tap it as they are built.
            chorusLfo = playback.audio.createOscillator();
            chorusLfo.type = 'sine';
            chorusLfo.frequency.setValueAtTime(0.22, playTime);
            const chorusGain = playback.audio.createGain();
            chorusGain.gain.setValueAtTime(6, playTime); // ±6 cents of sweep
            chorusLfo.connect(chorusGain);
            chorusLfo.start(playTime);
            voiceNodes.push(chorusLfo, chorusGain);

            // 3 extra sawtooth layers. Static detune spread (cents) + a small
            // seeded-free random jitter so no two notes are an identical stack.
            // Combined with osc1 (~0) and osc2 (~+8) this lands 5 layers across
            // roughly [-18 .. +20] cents.
            const layerDetune = [-18, -9, 19];
            const layerStart = [0.013, 0.027, 0.043]; // per-layer attack offset
            for (let i = 0; i < 3; i++) {
                const layer = playback.audio.createOscillator();
                layer.type = 'sawtooth';
                layer.frequency.setValueAtTime(freq, playTime);
                layer.detune.setValueAtTime(layerDetune[i] + (Math.random() - 0.5) * 6, playTime);
                chorusGain.connect(layer.detune);
                layer.connect(filter);
                layer.start(playTime + layerStart[i]);
                stringLayers.push(layer);
                voiceNodes.push(layer);
            }
            // Sweep the core layers too.
            chorusGain.connect(osc1.detune);
            chorusGain.connect(osc2.detune);
            if (sub) {
                chorusGain.connect(sub.detune);
            }

            // Body-resonance peak — a low warm formant for string body.
            const bodyPeak = playback.audio.createBiquadFilter();
            bodyPeak.type = 'peaking';
            bodyPeak.frequency.setValueAtTime(250, playTime);
            bodyPeak.Q.setValueAtTime(1.2, playTime);
            bodyPeak.gain.setValueAtTime(3.5, playTime);
            filter.connect(bodyPeak);
            bodyPeak.connect(gain);
            voiceNodes.push(bodyPeak);
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

    if (style === 'horns') {
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
    } else if (style === 'counter') {
        filter.frequency.setValueAtTime(clampFreq(freq * 1.5), playTime);
        filter.frequency.linearRampToValueAtTime(
            clampFreq(freq * 3.0 * brightnessMult),
            playTime + duration * 0.6,
        );
        filter.Q.setValueAtTime(1.0, playTime);
    } else if (style === 'strings') {
        // String pad (S4): a slow, gentle lowpass that drifts *open* across
        // the note — the pad brightens almost imperceptibly as it sustains,
        // string-like, rather than a snappy attack bloom. Low Q so it stays
        // a soft tone shaper, not a resonant sweep.
        filter.frequency.setValueAtTime(clampFreq(freq * 2.0), playTime);
        filter.frequency.linearRampToValueAtTime(
            clampFreq(freq * 4.5 * (0.6 + intensity * 0.4)),
            playTime + duration * 0.85,
        );
        filter.Q.setValueAtTime(0.7, playTime);
    } else {
        // Default branch — any remaining style and the organ bloom. A gentle
        // swell-and-settle around the cutoff.
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
    // lower sustain) instead of sitting frozen. Fast styles (horns/plucks/
    // organ) get decay 0 / sustain at the peak, so their envelope collapses
    // back to plain AR — their character is unchanged.
    const isFastAttack = style === 'horns' || style === 'plucks' || isOrgan;
    const baseAttack = isFastAttack ? 0.01 : 0.2;
    const attackFloor = retriggerProfile?.attackFloor || 0.005;
    let attack = Math.max(attackFloor, baseAttack - finalVol * 0.15);
    let release = style === 'horns' ? 0.1 : style === 'plucks' ? 0.02 : 0.5;
    // Pad styles settle ~20% below the attack peak over a 0.35 s decay. The
    // 'horns' section (S3) gets a fast 60 ms decay to ~92% — a gentle "tiny
    // swell": the stab pops to the peak then settles slightly, brass-like,
    // rather than sitting flat. The settle is kept shallow so stabs in rapid
    // succession stay even in level. Plucks/organ hold at the peak (decay
    // 0 — AR).
    const decay = style === 'horns' ? 0.06 : isFastAttack ? 0 : 0.35;
    const sustainLevel = finalVol * (style === 'horns' ? 0.92 : isFastAttack ? 1.0 : 0.8);

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
        (style === 'horns' ? 12 : 8) * detuneMult +
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

    // Register the active voice. The registry entry doubles as the voice's
    // release handle (#934): `release(when, fade)` retires THIS voice click-free
    // (the #601 `killHarmonyVoice` linear-ramp-to-0), so the scheduler releases
    // a voicing on a chord change without a shared blanket kill.
    const voiceRefs = {
        gain,
        time: playTime,
        duration,
        midi,
        nodes: voiceNodes,
        release(when: number, fade: number): void {
            killHarmonyVoice({ gain, nodes: voiceNodes }, when, fade);
        },
    };
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
    // String-ensemble extra layers + chorus LFO (S4).
    for (const layer of stringLayers) {
        layer.stop(stopTime);
    }
    if (chorusLfo) {
        chorusLfo.stop(stopTime);
    }

    osc1.onended = () => safeDisconnect(voiceNodes);

    return voiceRefs;
}
