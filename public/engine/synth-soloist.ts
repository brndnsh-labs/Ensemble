import type { EnsembleState, Mutable, SoloistVoice } from '../types.js';
import { clampFreq, safeDisconnect } from '../utils.js';
import { STYLE_CONFIG, type StyleConfig } from './soloist-config.js';
import {
    getSoloistVoiceLimit,
    isSoloistGuitarMode,
    isSoloistMonophonicMode,
    isSoloistPianoMode,
} from './soloist-mode-policy.js';
import { createSimplePanner, killActiveVoices, velocityTimbre } from './synth-utils.js';

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
// synth-audit Epic 0 S1 — A/B voice seam. The exported entry dispatches on the
// instrument's `voice` setting; `*New` is a placeholder until Epic 3 fills it in.
export function playSoloNote(...args: Parameters<typeof playSoloNoteCurrent>): void {
    (args[0].soloist.voice === 'new' ? playSoloNoteNew : playSoloNoteCurrent)(...args);
}

function playSoloNoteNew(...args: Parameters<typeof playSoloNoteCurrent>): void {
    playSoloNoteCurrent(...args);
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
): void {
    const { playback, soloist } = state;
    if (!Number.isFinite(freq)) {
        return;
    }

    const preset = soloist.preset || 'trumpet';
    const ctx = playback.audio;
    if (!ctx) {
        return;
    }
    const now = ctx.currentTime;
    const playTime = Math.max(time, now);

    if (playback.debugSoloist) {
        console.log(
            `[Soloist Debug] playSoloNote: freq=${freq.toFixed(2)}, vol=${vol.toFixed(2)}, duration=${duration.toFixed(2)}s, preset=${preset}, vibrato=${vibrato}, legato=${isLegato}`,
        );
    }

    // Voice Management
    manageVoices(playTime, soloist.audio, soloist.mode);

    const isPiano = isSoloistPianoMode(soloist.mode);
    if (isPiano) {
        isLegato = false;
    }

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

    switch (preset) {
        case 'neo':
            playNeoJuno(
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
            );
            break;
        case 'vowel':
            playVowel(
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
            );
            break;
        case 'trumpet':
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
            );
            break;
        case 'saxophone':
            playSaxophone(
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
            );
            break;
        case 'shred':
            playShred(
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
            );
            break;
        default:
            playNeoJuno(
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
            );
            break;
    }

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
// times. Piano mode has no vibrato — bail before building the LFO graph.
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
    if (isSoloistPianoMode(state.soloist.mode)) {
        return;
    }
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
): void {
    const { soloist } = state;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';

    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.detune.value = 5;

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
        isSoloistPianoMode(soloist.mode),
    );

    // Velocity + intensity → brightness (epic-3-soloist S2): on the New voice
    // a harder note opens the lowpass and lifts the bell formant, and the
    // whole-band intensity sets the brightness floor. Current voice keeps the
    // freq-only cutoffs.
    const isNewVoice = soloist.voice === 'new';
    const drive = soloistBrightnessDrive(state, vol);
    const cutoffMult = isNewVoice ? 0.75 + drive * 0.6 : 1;
    const bellMult = isNewVoice ? 0.85 + drive * 0.35 : 1;

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
    bellFilter.frequency.value = 1200;
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

    // Sustained-note breathing (epic-3-soloist S3) — New voice, long notes only.
    if (isNewVoice && duration > 0.5) {
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
    const attack = isLegato ? 0.032 : 0.02;

    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 1.2, playTime, attack);
    outputGain.gain.setTargetAtTime(vol * 0.9, playTime + 0.1, 0.05);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.85, 0.1);

    osc1.start(playTime);
    osc2.start(playTime);

    const stopTime = playTime + duration + 0.2;
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    osc1.onended = () => safeDisconnect(voiceObj.nodes);
}

function playSaxophone(
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
): void {
    const { soloist } = state;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.detune.value = -7;

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
        isSoloistPianoMode(soloist.mode),
    );

    // Velocity + intensity → brightness (epic-3-soloist S2): on the New voice,
    // digging in (per-note accent or whole-band intensity) pushes the sax
    // formants upward — a real embouchure/intensity behavior, reedier not just
    // louder. Current voice keeps fixed formants. Tighter range than the
    // lowpass presets: too much shift would change the vowel, not brightness.
    const isNewVoice = soloist.voice === 'new';
    const drive = soloistBrightnessDrive(state, vol);
    const formantMult = isNewVoice ? 0.92 + drive * 0.28 : 1;

    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 900 * formantMult;
    f1.Q.value = 3.0;

    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 2400 * formantMult;
    f2.Q.value = 4.0;

    const breathLfo = ctx.createOscillator();
    breathLfo.frequency.value = 3.5;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.05;

    const masterGainNode = ctx.createGain();
    masterGainNode.gain.value = 1.0;

    breathLfo.connect(breathGain);
    breathGain.connect(masterGainNode.gain);

    voiceObj.nodes.push(f1, f2, breathLfo, breathGain, masterGainNode);

    // Sustained-note breathing (epic-3-soloist S3) — modulate the brighter
    // formant only, so the tail shimmers without the vowel drifting.
    if (isNewVoice && duration > 0.5) {
        attachCutoffLfo(ctx, f2.frequency, 200, playTime, duration, voiceObj);
    }

    // Coupled vibrato (epic-3-soloist S4) — cutoff tap drives the bright formant.
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
        f2.frequency,
    );

    osc1.connect(f1);
    osc2.connect(f1);
    osc1.connect(f2);
    osc2.connect(f2);

    f1.connect(masterGainNode);
    f2.connect(masterGainNode);
    masterGainNode.connect(outputGain);

    // Legato attack swells in gently (epic-3-soloist S1) — see playTrumpet.
    const attack = isLegato ? 0.055 : 0.04;

    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 2.9, playTime, attack);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.85, 0.1);

    const noiseBuffer = state.groove?.audioBuffers?.noise;
    if (noiseBuffer) {
        const breathNoise = ctx.createBufferSource();
        breathNoise.buffer = noiseBuffer;
        breathNoise.loop = true;
        const breathHP = ctx.createBiquadFilter();
        breathHP.type = 'highpass';
        breathHP.frequency.value = 1500;
        const breathNoiseGain = ctx.createGain();
        breathNoiseGain.gain.setValueAtTime(0, playTime);
        breathNoiseGain.gain.setTargetAtTime(vol * 2.9 * 0.04, playTime, attack);
        breathNoiseGain.gain.setTargetAtTime(0, playTime + duration * 0.85, 0.1);
        breathNoise.connect(breathHP);
        breathHP.connect(breathNoiseGain);
        breathNoiseGain.connect(masterGainNode);
        voiceObj.nodes.push(breathNoise, breathHP, breathNoiseGain);
        breathNoise.start(playTime);
        breathNoise.stop(playTime + duration + 0.2);
    }

    osc1.start(playTime);
    osc2.start(playTime);
    breathLfo.start(playTime);

    const stopTime = playTime + duration + 0.2;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    breathLfo.stop(stopTime);

    osc1.onended = () => safeDisconnect(voiceObj.nodes);
}

function playNeoJuno(
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
): void {
    const { soloist } = state;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';

    const lfo1 = ctx.createOscillator();
    lfo1.frequency.value = 0.3;
    const lfo1Gain = ctx.createGain();
    lfo1Gain.gain.value = 8;

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.5;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = -7;

    lfo1.connect(lfo1Gain);
    lfo1Gain.connect(osc1.detune as any);
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(osc2.detune as any);

    voiceObj.nodes.push(osc1, osc2, lfo1, lfo1Gain, lfo2, lfo2Gain);

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
        isSoloistPianoMode(soloist.mode),
    );

    // Velocity + intensity → brightness (epic-3-soloist S2): on the New voice
    // a harder note (or higher band intensity) opens the lowpass; Current
    // voice keeps freq-only cutoffs.
    const isNewVoice = soloist.voice === 'new';
    const drive = soloistBrightnessDrive(state, vol);
    const cutoffMult = isNewVoice ? 0.75 + drive * 0.6 : 1;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(clampFreq(freq * 3 * cutoffMult), playTime);
    filter.frequency.exponentialRampToValueAtTime(
        clampFreq(freq * 1.5 * cutoffMult),
        playTime + duration,
    );
    filter.Q.value = 1.0;

    voiceObj.nodes.push(filter);

    // Sustained-note breathing (epic-3-soloist S3) — New voice, long notes only.
    if (isNewVoice && duration > 0.5) {
        attachCutoffLfo(ctx, filter.frequency, freq * 0.3, playTime, duration, voiceObj);
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
    filter.connect(outputGain);

    // Legato attack swells in gently (epic-3-soloist S1) so a connected note
    // blends under the previous note's release tail instead of re-articulating
    // with a hard 5 ms transient; separated notes keep the crisp 0.02 onset.
    const attack = isLegato ? 0.032 : 0.02;

    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 1.1, playTime, attack);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.8, 0.1);

    osc1.start(playTime);
    osc2.start(playTime);
    lfo1.start(playTime);
    lfo2.start(playTime);

    const stopTime = playTime + duration + 0.2;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    lfo1.stop(stopTime);
    lfo2.stop(stopTime);

    osc1.onended = () => safeDisconnect(voiceObj.nodes);
}

function playVowel(
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
): void {
    const { soloist } = state;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.detune.value = 4;

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
        isSoloistPianoMode(soloist.mode),
    );

    // Velocity + intensity → brightness (epic-3-soloist S2): on the New voice,
    // digging in (per-note accent or whole-band intensity) pushes the vowel
    // formant upward so hard notes open up. Current voice keeps the fixed
    // sweep. Tight range — a large shift changes the vowel.
    const isNewVoice = soloist.voice === 'new';
    const drive = soloistBrightnessDrive(state, vol);
    const formantMult = isNewVoice ? 0.92 + drive * 0.28 : 1;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800 * formantMult, playTime);
    filter.frequency.exponentialRampToValueAtTime(1200 * formantMult, playTime + 0.1);
    filter.frequency.exponentialRampToValueAtTime(800 * formantMult, playTime + duration);
    filter.Q.value = 5.0;

    voiceObj.nodes.push(filter);

    // Sustained-note breathing (epic-3-soloist S3) — slow vowel-formant drift.
    if (isNewVoice && duration > 0.5) {
        attachCutoffLfo(ctx, filter.frequency, 130, playTime, duration, voiceObj);
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
    filter.connect(outputGain);

    // Legato attack swells in gently (epic-3-soloist S1) — see playTrumpet.
    const attack = isLegato ? 0.035 : 0.02;
    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 2.5, playTime, attack);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.8, 0.1);

    osc1.start(playTime);
    osc2.start(playTime);

    const stopTime = playTime + duration + 0.2;
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    osc1.onended = () => safeDisconnect(voiceObj.nodes);
}

function playShred(
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
): void {
    const { soloist } = state;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.detune.value = 12;

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
        isSoloistPianoMode(soloist.mode),
    );

    // Velocity + intensity → brightness (epic-3-soloist S2): on the New voice
    // a harder pick attack (or higher band intensity) opens the lowpass;
    // Current voice keeps the freq-only cutoff.
    const isNewVoice = soloist.voice === 'new';
    const drive = soloistBrightnessDrive(state, vol);
    const cutoffMult = isNewVoice ? 0.75 + drive * 0.6 : 1;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(clampFreq(freq * 6 * cutoffMult), playTime);
    filter.Q.value = 2.0;

    voiceObj.nodes.push(filter);

    // Sustained-note breathing (epic-3-soloist S3) — New voice, long notes only.
    if (isNewVoice && duration > 0.5) {
        attachCutoffLfo(ctx, filter.frequency, freq * 0.6, playTime, duration, voiceObj);
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
    filter.connect(outputGain);

    // Legato attack stays tight but loses the hard 5 ms transient
    // (epic-3-soloist S1) — shred is aggressive, so the swell is subtler.
    const attack = isLegato ? 0.016 : 0.005;
    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 1.3, playTime, attack);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.9, 0.05);

    osc1.start(playTime);
    osc2.start(playTime);

    // duration + 0.2 (was + 0.1): matches the other four presets and the
    // attachCutoffLfo stop time, so the cutoff LFO is never disconnected while
    // still running (epic-3-soloist S3). The gain envelope has fully released
    // well before this, so the later hard-stop is inaudible.
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
    isPiano: boolean = false,
): void {
    const { soloist } = state;
    if (isPiano) {
        osc1.frequency.setValueAtTime(freq, playTime);
        osc2.frequency.setValueAtTime(freq, playTime);
        return;
    }

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
    } else if (style === 'shred') {
        vibSpeed += 1.2;
    }

    let depthFactor = 0.008;
    if (style === 'blues') {
        depthFactor = 0.012;
    } else if (style === 'neo') {
        depthFactor = 0.015;
    } else if (style === 'shred') {
        depthFactor = 0.004;
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

    const vibRuns = (duration > 0.15 || forceVibrato) && !isSoloistPianoMode(soloist.mode);
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
