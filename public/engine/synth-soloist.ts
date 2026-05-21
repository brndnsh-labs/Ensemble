import type { EnsembleState, Mutable, SoloistVoice } from '../types.js';
import { clampFreq, safeDisconnect } from '../utils.js';
import { STYLE_CONFIG, type StyleConfig } from './soloist-config.js';
import {
    getSoloistVoiceLimit,
    isSoloistGuitarMode,
    isSoloistMonophonicMode,
    isSoloistPianoMode,
} from './soloist-mode-policy.js';
import { createSimplePanner, killActiveVoices } from './synth-utils.js';

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
export function playSoloNote(
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
            `[Soloist Debug] playSoloNote: freq=${freq.toFixed(2)}, vol=${vol.toFixed(2)}, duration=${duration.toFixed(2)}s, preset=${preset}, vibrato=${vibrato}`,
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
    pan.connect((playback as any).soloistGain);

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
        vibratoFlag,
    );
    vibrato.connect(vibGain);
    vibGain.connect(osc1.frequency as any);
    vibGain.connect(osc2.frequency as any);
    voiceObj.nodes.push(vibrato, vibGain, ...depthModNodes);
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

    attachVibrato(state, ctx, freq, playTime, duration, style, vibratoFlag, voiceObj, osc1, osc2);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    // Non-linear cutoff ceiling: Cap the filter to prevent "ice-pick" high frequencies
    const baseCutoff = clampFreq(freq * 1.2);
    const maxCutoff = Math.min(clampFreq(freq * 4.0), 5500 + freq * 1.5);
    const sustainCutoff = Math.min(clampFreq(freq * 2.5), 4500 + freq * 1.2);

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
    bellFilter.gain.value = bellBoost;

    // High-shelf smoothing: Roll off extreme high-end "fizz"
    const smoother = ctx.createBiquadFilter();
    smoother.type = 'highshelf';
    smoother.frequency.value = 6000;
    smoother.gain.setValueAtTime(freq > 1000 ? -4 : -2, playTime);

    voiceObj.nodes.push(filter, bellFilter, smoother);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(bellFilter);
    bellFilter.connect(smoother);
    smoother.connect(outputGain);

    const attack = isLegato ? 0.005 : 0.02;

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

    attachVibrato(state, ctx, freq, playTime, duration, style, vibratoFlag, voiceObj, osc1, osc2);

    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 900;
    f1.Q.value = 3.0;

    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 2400;
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

    osc1.connect(f1);
    osc2.connect(f1);
    osc1.connect(f2);
    osc2.connect(f2);

    f1.connect(masterGainNode);
    f2.connect(masterGainNode);
    masterGainNode.connect(outputGain);

    const attack = isLegato ? 0.008 : 0.04;

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

    attachVibrato(state, ctx, freq, playTime, duration, style, vibratoFlag, voiceObj, osc1, osc2);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(clampFreq(freq * 3), playTime);
    filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 1.5), playTime + duration);
    filter.Q.value = 1.0;

    voiceObj.nodes.push(filter);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(outputGain);

    const attack = isLegato ? 0.005 : 0.02;

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

    attachVibrato(state, ctx, freq, playTime, duration, style, vibratoFlag, voiceObj, osc1, osc2);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, playTime);
    filter.frequency.exponentialRampToValueAtTime(1200, playTime + 0.1);
    filter.frequency.exponentialRampToValueAtTime(800, playTime + duration);
    filter.Q.value = 5.0;

    voiceObj.nodes.push(filter);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(outputGain);

    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 2.5, playTime, 0.02);
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

    attachVibrato(state, ctx, freq, playTime, duration, style, vibratoFlag, voiceObj, osc1, osc2);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(clampFreq(freq * 6), playTime);
    filter.Q.value = 2.0;

    voiceObj.nodes.push(filter);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(outputGain);

    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 1.3, playTime, 0.005);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.9, 0.05);

    osc1.start(playTime);
    osc2.start(playTime);

    const stopTime = playTime + duration + 0.1;
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
        const glideTime = isSoloistGuitarMode(soloist.mode) ? 0.03 : 0.06;
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
    forceVibrato: boolean = false,
): VibratoNodes {
    const { soloist, playback } = state;
    const config: StyleConfig =
        (STYLE_CONFIG as Record<string, StyleConfig>)[style] || STYLE_CONFIG.scalar;
    const intensity = playback.bandIntensity || 0.5;
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

    if ((duration > 0.15 || forceVibrato) && !isSoloistPianoMode(soloist.mode)) {
        vibrato.start(time);
        vibrato.stop(time + duration + 0.2);
        depthMod.start(time + vibDelay);
        depthMod.stop(time + duration + 0.2);
    }

    return { vibrato, vibGain, depthModNodes: [depthMod, depthModGain] };
}
