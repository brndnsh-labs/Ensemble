import { gainForPack, toneTiltForPack } from '../data/sound-packs.js';
import type { EnsembleState, Mutable, SoloistExpression, SoloistVoice } from '../types.js';
import { scrambleHash } from './hash-utils.js';
import { resolveInstrumentSource } from './instrument-registry.js';
import { clampFrac, playSampledNote, type SampleBend, type SampleVibrato } from './sample-voice.js';
import { STYLE_CONFIG, type StyleConfig } from './soloist-config.js';
import {
    getSoloistVoiceLimit,
    isSoloistGuitarMode,
    isSoloistMonophonicMode,
} from './soloist-mode-policy.js';
import {
    clampFreq,
    createSimplePanner,
    killActiveVoices,
    resolveSampledZone,
    safeDisconnect,
    velocityTimbre,
} from './synth-utils.js';

export type { SoloistVoice } from '../types.js';

type SoloistState = EnsembleState['soloist'];

interface VibratoNodes {
    vibrato: OscillatorNode;
    vibGain: GainNode;
    depthModNodes: AudioNode[];
}

/**
 * Stop any currently playing soloist notes.
 */
export function killSoloistNote(state: EnsembleState): void {
    const { playback, soloist } = state;
    if (playback.audio) {
        killActiveVoices(soloist.audio.activeVoices, playback.audio.currentTime, 0.01);
    }
}

/**
 * Main entry point for playing a soloist note.
 * Orchestrates voice management, preset selection, and common DSP.
 */
// The synth soloist voice (the trumpet). `playSoloNoteCurrent` is the reworked
// synth-audit voice — the only one since #649 retired the Current/New A/B (the
// soloist's `new` was always a no-op wrapper; the reworked behavior lived in
// the voice body and is now unconditional).
function dispatchSoloSynth(...args: Parameters<typeof playSoloNoteCurrent>): void {
    playSoloNoteCurrent(...args);
}

// Epic 7 #658 — play one soloist note from a sample pack (mirrors the chords'
// `playSampledChord`). Converts the scheduled frequency to a MIDI target, picks
// the nearest loaded zone, and plays it through the soloist gain bus (inheriting
// EQ/reverb/limiting). Returns false — so the caller falls back to the synth
// voice — when zones aren't loaded yet or the note is otherwise unplayable.
// The soloist is monophonic, but `playSampledNote` is duration-bounded (it stops
// each note past its release tail), so successive lead notes don't pile up; a
// hard previous-note cutoff can follow if auditioning shows overlap.
/**
 * Default lead vibrato for the sampled soloist (#744 Slice 1). ~5.5 Hz / ±18c
 * mirrors the synth voice's pitch-vibrato depth (`createVibrato`) — a horn/
 * steel-string-leaning default.
 */
const DEFAULT_LEAD_VIBRATO = { depthCents: 18, rateHz: 5.5 } as const;

/**
 * Per-pack lead-vibrato idiom (#744 Slice 3 / #745). The classical nylon
 * guitar's left-hand vibrato is a gentle, slow oscillation — distinctly
 * narrower and slower than a horn or steel-string lead — so on the soft
 * fingerstyle tone the default ±18c/5.5Hz reads as seasick rather than
 * expressive. Nylon gets a subtler profile; every other pack keeps the
 * default. Keyed by the bare pack id (`source.packId`, prefix already
 * stripped), mirroring `gainForPack` / `toneTiltForPack`.
 */
const LEAD_VIBRATO_BY_PACK: Record<string, { depthCents: number; rateHz: number }> = {
    // Narrower (~⅔ the depth) and slower — a classical-guitar finger vibrato,
    // not a blues bend-wobble. Heard on the bossa/acoustic nylon lead.
    'nylon-guitar': { depthCents: 11, rateHz: 4.6 },
};

/**
 * Build the sampled-soloist vibrato spec for a pack (#744). The rate jitter is
 * **deterministic** (seeded `scrambleHash`, per the project's deterministic-
 * phrasing rule) rather than the synth side's `Math.random` — so looped
 * playback and tests reproduce, and repeated held notes still don't phase-lock
 * into a machine tremolo. The depth fades in after the attack so the note's
 * onset stays clean.
 */
export function leadVibrato(noteSeed: number, packId?: string): SampleVibrato {
    const profile = (packId && LEAD_VIBRATO_BY_PACK[packId]) || DEFAULT_LEAD_VIBRATO;
    // ±6% rate jitter, kept independent of any other per-note draw via the XOR.
    const jitter = 1 + (scrambleHash(noteSeed ^ 0x5f356495) - 0.5) * 0.12;
    return {
        depthCents: profile.depthCents,
        rateHz: profile.rateHz * jitter,
        delay: 0.12,
        ramp: 0.3,
    };
}

/**
 * Map the soloist note's two pitch-bend representations onto the sampled seam's
 * `SampleBend` (#744 Slice 2): the one-way `bendStartInterval` scalar becomes
 * `fromSemitones` (a bend-IN, now finally rendered on sampled packs — it was
 * synth-only before), and `expression.bend` becomes the bend-and-release. Either
 * may be present; returns `undefined` when neither is, so the note stays
 * fixed-pitch and no automation is scheduled.
 */
function toSampleBend(
    bendStartInterval: number,
    expression: SoloistExpression | undefined,
): SampleBend | undefined {
    const gesture = expression?.bend;
    const hasIn = Number.isFinite(bendStartInterval) && bendStartInterval !== 0;
    const hasGesture = !!gesture && gesture.peakSemitones > 0;
    if (!hasIn && !hasGesture) {
        return undefined;
    }
    return {
        fromSemitones: hasIn ? bendStartInterval : 0,
        peakSemitones: hasGesture ? gesture.peakSemitones : 0,
        onsetFrac: gesture?.onsetFrac,
        peakFrac: gesture?.peakFrac,
        releaseFrac: gesture?.releaseFrac,
    };
}

function playSampledSolo(
    state: EnsembleState,
    packId: string,
    freq: number,
    time: number,
    duration: number,
    vol: number,
    vibrato: boolean,
    noteSeed: number,
    bendStartInterval: number,
    expression: SoloistExpression | undefined,
    isLegato: boolean,
    prevFreq: number,
): boolean {
    // Fold notes above the pack's sampled range down an octave (#755): the
    // soloist runs to MIDI 90 but the packs top out lower (nylon 84, sax 79,
    // guitars 85), so the top zone would otherwise pitch-shift up into a thin
    // metallic ring. In-range notes are unchanged.
    const resolved = resolveSampledZone(state, 'soloist', packId, freq);
    if (!resolved) {
        return false;
    }
    const { audio, dest, zone, targetMidi } = resolved;
    const velocity = Math.min(1, (Number.isFinite(vol) ? vol : 0.5) * gainForPack(packId));

    // Guitar legato slur — the hammer-on / pull-off (#855). A horn re-articulates
    // every note; a guitarist slurs a connected run: pick the first note, then
    // hammer/pull the rest without re-picking. The sampled voice re-triggers a
    // fresh pluck (with its recorded pick transient) on every note, so a run reads
    // as horn-like. When the scheduler flags a note legato (rhythmically contiguous
    // with its predecessor, no bend of its own), and the voice is a guitar pack,
    // and the move is a step-to-a-5th (a real slur, not a leap you'd re-pick), we
    // glide *into* the pitch from the previous note over a short 40ms slur and
    // soften the onset so the recorded pick transient is masked — a fretted-hand
    // articulation, not a picked one. Larger leaps and non-guitar sample voices
    // (sax/strings) keep the plain per-note attack. Never overrides an explicit
    // scoop/cry (they're mutually exclusive with legato upstream).
    let bend = toSampleBend(bendStartInterval, expression);
    let attack: number | undefined;
    if (!bend && isLegato && packId.includes('guitar') && prevFreq > 0 && freq > 0) {
        const semis = 12 * Math.log2(prevFreq / freq);
        // ≤ a perfect 5th (mirrors the synth voice's portamento window); above
        // that a guitarist re-picks rather than slurring.
        if (Math.abs(semis) > 0.1 && Math.abs(semis) <= 7) {
            bend = { fromSemitones: semis, inSeconds: 0.04 };
            attack = 0.028; // soften the re-pick transient into a slur
        }
    }

    playSampledNote(audio, zone, dest, targetMidi, Math.max(time, audio.currentTime), {
        velocity,
        duration,
        ...(attack !== undefined ? { attack } : {}),
        // The engine flags vibrato on sustained notes (durationSteps >= a beat);
        // the synth voice already renders it, the sampled seam now does too (#744).
        vibrato: vibrato ? leadVibrato(noteSeed, packId) : undefined,
        // Bend-in (bendStartInterval) and/or bend-and-release (expression.bend),
        // now rendered on the sampled seam too — full pitch-gesture parity (#744);
        // or the guitar legato slur synthesized just above (#855).
        bend,
        tone: toneTiltForPack(packId),
    });
    return true;
}

// synth-audit Epic 6 S1 — instrument-source seam. A `pack:<id>` voice resolves
// to a sample source once its buffers load (S3); #658 routes that case to
// `playSampledSolo` (sax/nylon etc. on the soloist lane). Until then, and
// whenever a pack buffer is unavailable, we fall back to the synth voice —
// bit-identical with no packs installed.
export function playSoloNote(...args: Parameters<typeof playSoloNoteCurrent>): void {
    const state = args[0];
    const source = resolveInstrumentSource(state.soloist.voice);
    if (source.kind === 'sample') {
        const [
            ,
            freq,
            time,
            duration,
            vol,
            bendStartInterval = 0,
            ,
            isLegato = false,
            vibrato = false,
            noteSeed = 0,
            expression,
        ] = args;
        // Mirror the synth path's previous-pitch tracking so the sample voice can
        // slur a legato run into pitch (#855). Read the predecessor BEFORE the
        // call; only commit `lastRenderedFreq` once the sample actually plays, so
        // a fallback to the synth voice below still sees the correct predecessor.
        const audioState = state.soloist.audio as Mutable<typeof state.soloist.audio>;
        const prevFreq = audioState.lastRenderedFreq || freq;
        if (
            playSampledSolo(
                state,
                source.packId,
                freq,
                time,
                duration,
                vol,
                vibrato,
                noteSeed,
                bendStartInterval,
                expression,
                isLegato,
                prevFreq,
            )
        ) {
            audioState.lastRenderedFreq = freq; // @direct-mutation
            return;
        }
    }
    dispatchSoloSynth(...args);
}

function playSoloNoteCurrent(
    state: EnsembleState,
    freq: number,
    time: number,
    duration: number,
    vol: number,
    bendStartInterval: number = 0,
    style: string = 'scalar',
    isLegato: boolean = false,
    vibrato: boolean = false,
    noteSeed: number = 0,
    expression: SoloistExpression | undefined = undefined,
): void {
    const { playback, soloist } = state;
    // Guard every value that feeds an AudioParam: freq → oscillators, vol →
    // the envelope peak, duration → the release/decay timing. A non-finite
    // here would throw inside setTargetAtTime (epic-3-soloist S7).
    if (!Number.isFinite(freq) || !Number.isFinite(vol) || !Number.isFinite(duration)) {
        return;
    }

    // Mix-pass consolidation (2026-05-23) — soloist is trumpet-only; the
    // preset field is preserved on state for compat but no longer dispatches.
    const ctx = playback.audio;
    if (!ctx) {
        return;
    }
    const now = ctx.currentTime;
    const playTime = Math.max(time, now);

    if (playback.debugSoloist) {
        // biome-ignore lint/suspicious/noConsole: deliberate diagnostic, gated behind playback.debugSoloist
        console.log(
            `[Soloist Debug] playSoloNote: freq=${freq.toFixed(2)}, vol=${vol.toFixed(2)}, duration=${duration.toFixed(2)}s, vibrato=${vibrato}, legato=${isLegato}`,
        );
    }

    // Voice Management
    manageVoices(playTime, soloist.audio, soloist.mode);

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const panValue = (Math.random() * 2 - 1) * 0.05;
    const pan = createSimplePanner(ctx, panValue, playTime);

    // Common output chain
    gain.connect(pan);
    if (playback.audioGraph) {
        pan.connect(playback.audioGraph.soloist.gain);
    }

    // We store nodes in a single array for the utility to handle stopping/cleanup
    const voiceObj: SoloistVoice = { gain, time: playTime, duration, nodes: [gain, pan] };

    // Retrieve last frequency for portamento
    const prevFreq = soloist.audio.lastRenderedFreq || freq;
    (soloist.audio as Mutable<typeof soloist.audio>).lastRenderedFreq = freq; // @direct-mutation

    // Per-note timbral humanization (epic-3-soloist S5).
    const timbre = soloistTimbreJitter(noteSeed, (state.groove?.humanize ?? 0) / 100);

    playTrumpet(
        state,
        ctx,
        freq,
        playTime,
        duration,
        vol,
        bendStartInterval,
        style,
        gain,
        voiceObj,
        isLegato,
        prevFreq,
        vibrato,
        timbre,
        expression,
    );

    (soloist.audio as Mutable<typeof soloist.audio>).activeVoices.push(voiceObj); // @direct-mutation
}

/**
 * Manages active voices for the soloist synthesizer.
 */
function manageVoices(playTime: number, audio: SoloistState['audio'], mode: string): void {
    const mAudio = audio as Mutable<typeof audio>;
    if (!audio.activeVoices) {
        mAudio.activeVoices = []; // @direct-mutation
    }

    // Clean up finished voices (in-place mutation to satisfy state checks)
    for (let i = audio.activeVoices.length - 1; i >= 0; i--) {
        const v = audio.activeVoices[i];
        if (v.time + v.duration + 1.0 <= playTime) {
            audio.activeVoices.splice(i, 1);
        }
    }

    const VOICE_LIMIT = getSoloistVoiceLimit(mode);

    // Check if the current note is part of the same "simultaneous" attack (polyphonic cluster)
    const isPolyphonicCluster =
        audio.activeVoices.length > 0 &&
        Math.abs(playTime - audio.activeVoices[audio.activeVoices.length - 1].time) < 0.002;

    if (!isPolyphonicCluster && audio.activeVoices.length >= VOICE_LIMIT) {
        // Only kill enough voices to stay under the limit for the NEW gesture
        const voicesToKill = audio.activeVoices.length - VOICE_LIMIT + 1;
        const killed: SoloistVoice[] = [];
        for (let i = 0; i < voicesToKill; i++) {
            const oldest = audio.activeVoices.shift();
            if (oldest) {
                killed.push(oldest);
            }
        }
        killActiveVoices(killed, playTime, 0.01);
    }
}

// --- PRESET IMPLEMENTATIONS ---

// Wire the shared LFO vibrato into a voice's two oscillators. Byte-identical
// across every preset voice (playTrumpet, playSaxophone, playNeoJuno,
// playVowel, playShred), so it lives here instead of being copy-pasted five
// times.
function attachVibrato(
    state: EnsembleState,
    ctx: AudioContext,
    freq: number,
    playTime: number,
    duration: number,
    style: string,
    vibratoFlag: boolean,
    voiceObj: SoloistVoice,
    osc1: OscillatorNode,
    osc2: OscillatorNode,
    outputGain: GainNode,
    vol: number,
    filterFreq: AudioParam | null,
): void {
    const { vibrato, vibGain, depthModNodes } = createVibrato(
        state,
        ctx,
        freq,
        playTime,
        duration,
        style,
        outputGain,
        vol,
        filterFreq,
        vibratoFlag,
    );
    vibrato.connect(vibGain);
    vibGain.connect(osc1.frequency as any);
    vibGain.connect(osc2.frequency as any);
    voiceObj.nodes.push(vibrato, vibGain, ...depthModNodes);
}

/**
 * Combined brightness drive for the New soloist voice (epic-3-soloist S2):
 * blends per-note accent velocity (curved via `velocityTimbre`) with the
 * whole-band intensity, so the soloist gets brighter both when an individual
 * note is hit harder and when the band as a whole lifts. Returns 0..1.
 */
function soloistBrightnessDrive(state: EnsembleState, vol: number): number {
    const { brightness } = velocityTimbre(vol, { curve: 1.6 });
    const intensity = Number.isFinite(state.playback.bandIntensity)
        ? state.playback.bandIntensity
        : 0.5;
    // Intensity is weighted slightly heavier so the band-energy knob is
    // audible on its own; per-note velocity then modulates within that floor.
    return Math.min(1, brightness * 0.5 + intensity * 0.6);
}

/** Per-note timbral humanization offsets (epic-3-soloist S5). */
interface TimbreJitter {
    /** Filter-cutoff multiplier, centered on 1.0. */
    readonly cutoffJit: number;
    /** Detune offset in cents, centered on 0. */
    readonly detuneCents: number;
    /** Attack-time multiplier, centered on 1.0. */
    readonly attackJit: number;
    /** Bell/formant frequency multiplier, centered on 1.0. */
    readonly bellJit: number;
}

/** Neutral jitter — the Current voice and humanize=0 both use this no-op. */
const NO_TIMBRE_JITTER: TimbreJitter = {
    cutoffJit: 1,
    detuneCents: 0,
    attackJit: 1,
    bellJit: 1,
};

/**
 * Seeded per-note timbral humanization (epic-3-soloist S5) — so successive
 * same-pitch notes are not byte-identical and the "machine playing the same
 * note" tell is gone. Four independent `scrambleHash` draws off one seed
 * (XORed with distinct constants so the dimensions don't move in lockstep)
 * jitter cutoff ±8%, detune ±3c, attack ±20%, and bell/formant freq ±5%.
 * `scale` is the `groove.humanize / 100` knob; at 0 the result is neutral.
 * Deterministic — the same seed always yields the same offsets, so looped
 * playback and critique tests reproduce exactly.
 */
function soloistTimbreJitter(seed: number, scale: number): TimbreJitter {
    if (!(scale > 0)) {
        return NO_TIMBRE_JITTER;
    }
    const s = Math.min(1, scale);
    // scrambleHash returns 0..1; (h - 0.5) centers each draw on 0.
    const jCut = scrambleHash(seed ^ 0x2545f491) - 0.5;
    const jDet = scrambleHash(seed ^ 0x7f4a7c15) - 0.5;
    const jAtk = scrambleHash(seed ^ 0xb55a4f09) - 0.5;
    const jBell = scrambleHash(seed ^ 0x1b873593) - 0.5;
    return {
        cutoffJit: 1 + jCut * 2 * 0.08 * s,
        detuneCents: jDet * 2 * 3 * s,
        attackJit: 1 + jAtk * 2 * 0.2 * s,
        bellJit: 1 + jBell * 2 * 0.05 * s,
    };
}

/** A note's release timing — when the release stage starts and its shape. */
interface SoloistRelease {
    /** Absolute time the release `setTargetAtTime` is scheduled. */
    readonly start: number;
    /** `setTargetAtTime` time-constant — smaller is a crisper cutoff. */
    readonly constant: number;
}

/**
 * Articulation-aware release timing (epic-3-soloist S7). The old envelope
 * always released at a fixed `duration * 0.8–0.9` with a fixed constant,
 * regardless of how the note was played. This ties the release to
 * articulation:
 *  - legato → late start + gentle constant, so the note sustains into the next;
 *  - staccato (short, non-legato) → early start + quick constant: a crisp cutoff;
 *  - otherwise → scales with duration so a longer note gets a fuller tail.
 */
function soloistRelease(playTime: number, duration: number, isLegato: boolean): SoloistRelease {
    if (isLegato) {
        return { start: playTime + duration * 0.92, constant: 0.12 };
    }
    if (duration < 0.22) {
        return { start: playTime + duration * 0.55, constant: 0.035 };
    }
    // Longer notes get a slightly longer tail, capped so it never drags.
    const tail = Math.min(0.18, 0.07 + duration * 0.05);
    return { start: playTime + duration * 0.85, constant: tail };
}

/**
 * The New soloist voice's amplitude envelope (epic-3-soloist S7) — a real
 * ADSR: attack to `peak`, a decay stage down to a sustain level, then the
 * articulation-aware release from `soloistRelease`. The Current voice keeps
 * its own per-preset envelope (no decay, fixed release) untouched.
 */
function applySoloistEnvelope(
    outputGain: GainNode,
    peak: number,
    playTime: number,
    duration: number,
    attack: number,
    isLegato: boolean,
): void {
    const gain = outputGain.gain;
    const rel = soloistRelease(playTime, duration, isLegato);
    // The decay must land before the release re-aims the param — an
    // out-of-order setTargetAtTime would swell the note back up. Clamp it
    // between playTime and just before the release.
    const decayStart = Math.max(playTime, Math.min(playTime + attack * 4, rel.start - 0.01));
    gain.setValueAtTime(0, playTime);
    gain.setTargetAtTime(peak, playTime, attack);
    gain.setTargetAtTime(peak * 0.82, decayStart, 0.06);
    gain.setTargetAtTime(0, rel.start, rel.constant);
}

/**
 * Attack-time unison settle (epic-3-soloist S6). osc2 starts ~20c wider than
 * `targetCents` and ramps inward over ~50 ms, so the two-oscillator unison
 * "locks in" on the attack instead of sitting statically chorused. `targetCents`
 * also lets a preset tighten its detune (e.g. a wide +12, a sour near-quarter-
 * tone, ramped inward to a tighter target). The ramp is scheduled automation on
 * `osc2.detune`; any LFO connected to that param (neo) simply sums on top.
 */
function applyDetuneSettle(osc2: OscillatorNode, targetCents: number, playTime: number): void {
    const wide = targetCents + (targetCents >= 0 ? 20 : -20);
    osc2.detune.setValueAtTime(wide, playTime);
    osc2.detune.linearRampToValueAtTime(targetCents, playTime + 0.05);
}

/**
 * Slow filter-cutoff LFO so a sustained note breathes instead of sitting
 * spectrally frozen (epic-3-soloist S3). The modulation depth ramps in after
 * a short delay — mirroring the vibrato delay — so the attack stays clean and
 * only the held tail moves. The caller gates on note length and the New voice.
 */
function attachCutoffLfo(
    ctx: AudioContext,
    filterFreq: AudioParam,
    depthHz: number,
    playTime: number,
    duration: number,
    voiceObj: SoloistVoice,
): void {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    // 0.15–0.4 Hz — slow enough to read as "breathing", not tremolo. Slight
    // per-note spread so stacked/repeated notes don't phase-lock.
    lfo.frequency.value = 0.15 + Math.random() * 0.25;

    // The LFO sums additively onto the filter's scheduled cutoff automation
    // (Web Audio param summing). Depth held at 0 through the attack, then
    // ramped in over ~0.5 s so only the sustained tail breathes.
    const lfoGain = ctx.createGain();
    const delay = 0.3;
    lfoGain.gain.setValueAtTime(0, playTime);
    lfoGain.gain.setValueAtTime(0, playTime + delay);
    lfoGain.gain.linearRampToValueAtTime(depthHz, playTime + delay + 0.5);

    lfo.connect(lfoGain);
    lfoGain.connect(filterFreq);
    voiceObj.nodes.push(lfo, lfoGain);

    // duration + 0.2 matches every preset's osc1 stop time, so the LFO is
    // never disconnected (via osc1.onended → safeDisconnect) while still
    // running — a mid-output disconnect would step the cutoff and click.
    lfo.start(playTime);
    lfo.stop(playTime + duration + 0.2);
}

function playTrumpet(
    state: EnsembleState,
    ctx: AudioContext,
    freq: number,
    playTime: number,
    duration: number,
    vol: number,
    bendStartInterval: number,
    style: string,
    outputGain: GainNode,
    voiceObj: SoloistVoice,
    isLegato: boolean,
    prevFreq: number,
    vibratoFlag: boolean,
    timbre: TimbreJitter,
    expression: SoloistExpression | undefined,
): void {
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.detune.value = timbre.detuneCents;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    applyDetuneSettle(osc2, 5, playTime);

    voiceObj.nodes.push(osc1, osc2);

    applyPitchEnvelope(
        state,
        osc1,
        osc2,
        freq,
        playTime,
        duration,
        bendStartInterval,
        style,
        isLegato,
        prevFreq,
        expression,
    );

    // Velocity + intensity → brightness (epic-3-soloist S2): a harder note opens
    // the lowpass and lifts the bell formant, and the whole-band intensity sets
    // the brightness floor.
    const drive = soloistBrightnessDrive(state, vol);
    // × timbre.cutoffJit folds in the S5 per-note ±8% cutoff humanization.
    const cutoffMult = (0.75 + drive * 0.6) * timbre.cutoffJit;
    const bellMult = 0.85 + drive * 0.35;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    // Non-linear cutoff ceiling: Cap the filter to prevent "ice-pick" high frequencies
    const baseCutoff = clampFreq(freq * 1.2 * cutoffMult);
    const maxCutoff = Math.min(clampFreq(freq * 4.0 * cutoffMult), 5500 + freq * 1.5);
    const sustainCutoff = Math.min(clampFreq(freq * 2.5 * cutoffMult), 4500 + freq * 1.2);

    filter.frequency.setValueAtTime(baseCutoff, playTime);
    filter.frequency.exponentialRampToValueAtTime(maxCutoff, playTime + 0.08);
    filter.frequency.exponentialRampToValueAtTime(sustainCutoff, playTime + 0.15);
    filter.Q.value = 0.8;

    const bellFilter = ctx.createBiquadFilter();
    bellFilter.type = 'peaking';
    bellFilter.frequency.value = 1200 * timbre.bellJit;
    bellFilter.Q.value = 1.5;

    // Register-aware bell gain: Reduce boost in high register to prevent nasality
    const bellBoost = freq > 800 ? Math.max(1.5, 4 - (freq - 800) * 0.005) : 4;
    bellFilter.gain.value = bellBoost * bellMult;

    // High-shelf smoothing: Roll off extreme high-end "fizz"
    const smoother = ctx.createBiquadFilter();
    smoother.type = 'highshelf';
    smoother.frequency.value = 6000;
    smoother.gain.setValueAtTime(freq > 1000 ? -4 : -2, playTime);

    voiceObj.nodes.push(filter, bellFilter, smoother);

    // Sustained-note breathing (epic-3-soloist S3) — long notes only.
    if (duration > 0.5) {
        attachCutoffLfo(ctx, filter.frequency, sustainCutoff * 0.13, playTime, duration, voiceObj);
    }

    // Coupled vibrato (epic-3-soloist S4) — attached after the filter exists
    // so the LFO can also wobble the cutoff.
    attachVibrato(
        state,
        ctx,
        freq,
        playTime,
        duration,
        style,
        vibratoFlag,
        voiceObj,
        osc1,
        osc2,
        outputGain,
        vol,
        filter.frequency,
    );

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(bellFilter);
    bellFilter.connect(smoother);
    smoother.connect(outputGain);

    // Legato attack swells in gently (epic-3-soloist S1) so a connected note
    // blends under the previous note's release tail instead of re-articulating
    // with a hard 5 ms transient; separated notes keep the crisp 0.02 onset.
    const attack = (isLegato ? 0.032 : 0.02) * timbre.attackJit;

    // ADSR with articulation-aware release (epic-3-soloist S7).
    applySoloistEnvelope(outputGain, vol * 1.2, playTime, duration, attack, isLegato);

    osc1.start(playTime);
    osc2.start(playTime);

    const stopTime = playTime + duration + 0.2;
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    osc1.onended = () => safeDisconnect(voiceObj.nodes);
}

function applyPitchEnvelope(
    state: EnsembleState,
    osc1: OscillatorNode,
    osc2: OscillatorNode,
    freq: number,
    playTime: number,
    duration: number,
    bendStartInterval: number,
    _style: string,
    isLegato: boolean,
    prevFreq: number,
    expression: SoloistExpression | undefined,
): void {
    const { soloist } = state;
    const startFreq = bendStartInterval !== 0 ? freq * 2 ** (bendStartInterval / 12) : freq;

    if (isLegato && Math.abs(freq - prevFreq) < freq * 0.5) {
        // Portamento glide — long enough to read as a slur, not a fast bend
        // (epic-3-soloist S1). Guitar mode stays quicker (hammer-on feel).
        const glideTime = isSoloistGuitarMode(soloist.mode) ? 0.04 : 0.085;
        osc1.frequency.setValueAtTime(prevFreq, playTime);
        osc2.frequency.setValueAtTime(prevFreq, playTime);
        osc1.frequency.exponentialRampToValueAtTime(freq, playTime + glideTime);
        osc2.frequency.exponentialRampToValueAtTime(freq, playTime + glideTime);
    } else if (bendStartInterval !== 0) {
        osc1.frequency.setValueAtTime(startFreq, playTime);
        osc2.frequency.setValueAtTime(startFreq, playTime);
        const rampTime = Math.min(0.1, duration * 0.5);
        osc1.frequency.exponentialRampToValueAtTime(freq, playTime + rampTime);
        osc2.frequency.exponentialRampToValueAtTime(freq, playTime + rampTime);
    } else {
        osc1.frequency.setValueAtTime(freq, playTime);
        osc2.frequency.setValueAtTime(freq, playTime);
    }

    // Bend-and-release (#744 Slice 2) — layered AFTER arrival: hold the written
    // pitch to `onset`, bend UP to `peak`, optionally release back. Exponential
    // ramps in frequency are linear in pitch (an even glide). Times stay strictly
    // increasing so the ramps never invert; any vibrato LFO sums on top. When a
    // bend-in also ran (rampTime ≤ 0.1s above), the onset is pushed past it so the
    // re-anchor never truncates the in-progress glide — mirrors `scheduleSampleBend`.
    const bend = expression?.bend;
    if (bend && bend.peakSemitones > 0 && duration > 0) {
        const f = (semis: number) => freq * 2 ** (semis / 12);
        const bendInEnd = playTime + Math.min(0.1, duration * 0.5);
        const rawOnset = playTime + clampFrac(bend.onsetFrac, 0.2) * duration;
        const onsetT = bendStartInterval !== 0 ? Math.max(rawOnset, bendInEnd + 0.01) : rawOnset;
        const peakT = Math.max(onsetT + 0.01, playTime + clampFrac(bend.peakFrac, 0.5) * duration);
        for (const osc of [osc1, osc2]) {
            osc.frequency.setValueAtTime(freq, onsetT);
            osc.frequency.exponentialRampToValueAtTime(f(bend.peakSemitones), peakT);
            if (Number.isFinite(bend.releaseFrac)) {
                const relT = Math.max(
                    peakT + 0.01,
                    playTime + clampFrac(bend.releaseFrac, 0.85) * duration,
                );
                osc.frequency.exponentialRampToValueAtTime(freq, relT);
            }
        }
    }
}

function createVibrato(
    state: EnsembleState,
    ctx: AudioContext,
    freq: number,
    time: number,
    duration: number,
    style: string,
    outputGain: GainNode,
    vol: number,
    filterFreq: AudioParam | null,
    forceVibrato: boolean = false,
): VibratoNodes {
    const { soloist, playback } = state;
    const config: StyleConfig =
        (STYLE_CONFIG as Record<string, StyleConfig>)[style] || STYLE_CONFIG.scalar;
    const intensity = Number.isFinite(playback.bandIntensity) ? playback.bandIntensity : 0.5;
    const vibrato = ctx.createOscillator();

    const bps = (playback.bpm || 120) / 60;
    let vibSpeed = bps * 3;
    if (vibSpeed > 7.5) {
        vibSpeed = bps * 2;
    } else if (vibSpeed < 4.5) {
        vibSpeed = bps * 4;
    }

    const jitter = 1.0 + (Math.random() * 0.06 - 0.03);
    vibSpeed *= jitter;
    vibSpeed *= 1.0 + intensity * 0.1;

    if (style === 'blues') {
        vibSpeed -= 0.5;
    } else if (style === 'neo') {
        vibSpeed -= 0.8;
    }

    let depthFactor = 0.008;
    if (style === 'blues') {
        depthFactor = 0.012;
    } else if (style === 'neo') {
        depthFactor = 0.015;
    }

    const profile = soloist.session.currentPhrase.context?.profile;
    if (profile === 'gilmour') {
        depthFactor *= 1.3;
    } else if (profile === 'slash') {
        depthFactor *= 1.4;
    }

    if (config.vibratoIntensity !== undefined) {
        depthFactor *= config.vibratoIntensity;
    }

    if (forceVibrato) {
        depthFactor *= 1.5;
    }

    if (isSoloistMonophonicMode(soloist.mode)) {
        vibSpeed -= 0.5;
        depthFactor *= 1.2;
    } else if (isSoloistGuitarMode(soloist.mode)) {
        vibSpeed += 0.4;
        depthFactor *= 1.5;
    }

    // epic-3-soloist S4 — widen the timid ~±14c pitch depth toward ±18c so the
    // vibrato has presence; the coupled amp/cutoff taps below give it body.
    depthFactor *= 1.3;

    vibrato.frequency.setValueAtTime(vibSpeed, time);

    const vibGain = ctx.createGain();
    const isLongNote = duration > 0.4 || forceVibrato;
    const vibDelay = forceVibrato ? 0.08 : 0.12 + Math.random() * 0.08;
    const finalVibDepth = freq * (isLongNote ? depthFactor : depthFactor * 0.45);

    vibGain.gain.setValueAtTime(0, time);
    vibGain.gain.setValueAtTime(0, time + vibDelay);
    vibGain.gain.exponentialRampToValueAtTime(
        Math.max(0.001, finalVibDepth),
        time + vibDelay + (isLongNote ? 0.35 : 0.18),
    );

    const depthMod = ctx.createOscillator();
    depthMod.type = 'sine';
    depthMod.frequency.setValueAtTime(0.12, time);
    const depthModGain = ctx.createGain();
    depthModGain.gain.setValueAtTime(finalVibDepth * 0.2, time);
    depthMod.connect(depthModGain);
    depthModGain.connect(vibGain.gain as any);

    const vibRuns = duration > 0.15 || forceVibrato;
    if (vibRuns) {
        vibrato.start(time);
        vibrato.stop(time + duration + 0.2);
        depthMod.start(time + vibDelay);
        depthMod.stop(time + duration + 0.2);
    }

    // epic-3-soloist S4 — coupled vibrato: tap the same LFO into amplitude and
    // filter cutoff so the wobble moves pitch, loudness, and timbre together
    // (real vibrato is a 3-way correlated wobble, not a thin pitch waver).
    // Both depths ramp in on the same delay/shape as the pitch depth, and both
    // gains land in depthModNodes so the existing voiceObj cleanup covers them.
    const couplingNodes: AudioNode[] = [];
    if (vibRuns) {
        const rampEnd = time + vibDelay + (isLongNote ? 0.35 : 0.18);

        // Amplitude tremolo — small, correlated with the pitch rise.
        const ampDepthGain = ctx.createGain();
        ampDepthGain.gain.setValueAtTime(0, time);
        ampDepthGain.gain.setValueAtTime(0, time + vibDelay);
        ampDepthGain.gain.linearRampToValueAtTime(Math.max(0.0001, vol * 0.04), rampEnd);
        vibrato.connect(ampDepthGain);
        ampDepthGain.connect(outputGain.gain as any);
        couplingNodes.push(ampDepthGain);

        // Timbral wobble — correlated cutoff movement on the voice's filter.
        if (filterFreq) {
            const cutoffDepthGain = ctx.createGain();
            cutoffDepthGain.gain.setValueAtTime(0, time);
            cutoffDepthGain.gain.setValueAtTime(0, time + vibDelay);
            cutoffDepthGain.gain.linearRampToValueAtTime(Math.max(1, freq * 0.05), rampEnd);
            vibrato.connect(cutoffDepthGain);
            cutoffDepthGain.connect(filterFreq);
            couplingNodes.push(cutoffDepthGain);
        }
    }

    return {
        vibrato,
        vibGain,
        depthModNodes: [depthMod, depthModGain, ...couplingNodes],
    };
}
