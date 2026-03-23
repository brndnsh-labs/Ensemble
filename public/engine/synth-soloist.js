import { clampFreq, safeDisconnect } from '../utils.js';
import { STYLE_CONFIG } from './soloist-config.js';
import { createSimplePanner, killActiveVoices } from './synth-utils.js';

/**
 * @typedef {Object} SoloistVoice
 * @property {GainNode} gain
 * @property {number} time
 * @property {number} duration
 * @property {AudioNode[]} nodes
 * @property {GainNode} [mixSaw]
 * @property {GainNode} [mixSquare]
 * @property {BiquadFilterNode} [filter]
 * @property {number} [baseFreq]
 */

/**
 * Stop any currently playing soloist notes.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 */
export function killSoloistNote(state) {
    const { playback, soloist } = state;
    if (playback.audio) {
        killActiveVoices(soloist.activeVoices, playback.audio.currentTime, 0.01);
    }
}

/**
 * Main entry point for playing a soloist note.
 * Orchestrates voice management, preset selection, and common DSP.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {number} freq - Frequency in Hz.
 * @param {number} time - Start time in seconds.
 * @param {number} duration - Note duration in seconds.
 * @param {number} vol - Output volume.
 * @param {number} [bendStartInterval=0] - Interval in semitones to bend from.
 * @param {string} [style='scalar'] - Synthesis style preset.
 * @param {boolean} [isLegato=false] - Whether to use legato articulation.
 * @param {boolean} [vibratoFlag=false] - Whether to apply vibrato.
 */
export function playSoloNote(
    state,
    freq,
    time,
    duration,
    vol,
    bendStartInterval = 0,
    style = 'scalar',
    isLegato = false,
    vibratoFlag = false,
) {
    const { playback, soloist } = state;
    if (!Number.isFinite(freq)) {
        return;
    }

    const ctx = playback.audio;
    if (!ctx) {
        return;
    }
    const now = ctx.currentTime;
    const playTime = Math.max(time, now);

    if (playback.debugSoloist) {
        console.log(
            `[Soloist Debug] playSoloNote: freq=${freq.toFixed(2)}, vol=${vol.toFixed(2)}, duration=${duration.toFixed(2)}s, vibrato=${vibratoFlag}`,
        );
    }

    manageVoices(playTime, soloist);

    const isPiano = soloist.mode === 'piano';
    let localIsLegato = isLegato;
    if (isPiano) {
        localIsLegato = false;
    }

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const panValue = (Math.random() * 2 - 1) * 0.05;
    const pan = createSimplePanner(ctx, panValue, playTime);

    gain.connect(pan);
    pan.connect(/** @type {any} */ (playback).soloistGain);

    /** @type {SoloistVoice} */
    const voiceObj = { gain, time: playTime, duration, nodes: [gain, pan] };

    const prevFreq = soloist.lastRenderedFreq || freq;
    soloist.lastRenderedFreq = freq;

    // Use specific any casts for safely indexing properties that will be added to the state later
    const timbreX = Math.max(0, Math.min(1, /** @type {any} */ (soloist).timbreX || 0));
    const timbreY = Math.max(0, Math.min(1, /** @type {any} */ (soloist).timbreY || 0));

    const oscSaw = ctx.createOscillator();
    oscSaw.type = 'sawtooth';
    const oscSquare = ctx.createOscillator();
    oscSquare.type = 'square';
    oscSquare.detune.value = 7;

    const mixSaw = ctx.createGain();
    const mixSquare = ctx.createGain();
    mixSaw.gain.value = 1.0 - timbreX;
    mixSquare.gain.value = timbreX;

    voiceObj.nodes.push(oscSaw, oscSquare, mixSaw, mixSquare);
    voiceObj.mixSaw = mixSaw;
    voiceObj.mixSquare = mixSquare;

    applyPitchEnvelope(
        state,
        oscSaw,
        oscSquare,
        freq,
        playTime,
        duration,
        bendStartInterval,
        style,
        localIsLegato,
        prevFreq,
        isPiano,
    );

    if (!isPiano) {
        const vibratoNodes = createVibrato(
            state,
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        const vibratoOsc = vibratoNodes.vibrato;
        const vibGain = vibratoNodes.vibGain;
        vibratoOsc.connect(vibGain);
        vibGain.connect(/** @type {any} */ (oscSaw.frequency));
        vibGain.connect(/** @type {any} */ (oscSquare.frequency));
        voiceObj.nodes.push(vibratoOsc, vibGain);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    const baseCutoff = clampFreq(freq * (2 + timbreY * 6));
    filter.frequency.setValueAtTime(baseCutoff, playTime);

    const filterRampTime = 0.05 + timbreY * 0.5;
    const endCutoff = clampFreq(freq * (1.5 + timbreY * 2));
    filter.frequency.exponentialRampToValueAtTime(endCutoff, playTime + filterRampTime);

    filter.Q.value = 1.0 + timbreX * 3.0 + timbreY * 2.0;

    voiceObj.nodes.push(filter);
    voiceObj.filter = filter;
    voiceObj.baseFreq = freq;

    oscSaw.connect(mixSaw);
    oscSquare.connect(mixSquare);
    mixSaw.connect(filter);
    mixSquare.connect(filter);
    filter.connect(gain);

    const attack = localIsLegato ? 0.005 : 0.01 + timbreY * 0.04;
    let release = 0.1 + timbreY * 0.2;
    if (isPiano) {
        release = 0.3;
    } else if (soloist.mode === 'guitar' && vol < 0.6) {
        release = 0.02;
        filter.frequency.cancelScheduledValues(playTime);
        filter.frequency.setValueAtTime(clampFreq(freq * 3), playTime);
        filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 1.5), playTime + 0.08);
        filter.Q.value = 4.0;
    }

    gain.gain.setValueAtTime(0, playTime);
    gain.gain.setTargetAtTime(vol * 1.5, playTime, attack);
    gain.gain.setTargetAtTime(0, playTime + duration * (0.8 + timbreY * 0.1), release);

    oscSaw.start(playTime);
    oscSquare.start(playTime);

    const stopTime = playTime + duration + 0.5;
    oscSaw.stop(stopTime);
    oscSquare.stop(stopTime);

    oscSaw.onended = () => safeDisconnect(voiceObj.nodes);

    soloist.activeVoices.push(voiceObj);
}

/**
 * Updates the active voices in real-time as timbre parameters change.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 */
export function updateActiveSoloistTimbre(state) {
    const { playback, soloist } = state;
    const ctx = playback.audio;
    if (!ctx) {
        return;
    }

    const timbreX = Math.max(0, Math.min(1, /** @type {any} */ (soloist).timbreX || 0));
    const timbreY = Math.max(0, Math.min(1, /** @type {any} */ (soloist).timbreY || 0));
    const now = ctx.currentTime;

    for (const voice of soloist.activeVoices || []) {
        if (!voice.mixSaw || !voice.mixSquare || !voice.filter || !voice.baseFreq) {
            continue;
        }

        // Fast morph (0.05s) to avoid clicks but feel instantaneous
        voice.mixSaw.gain.setTargetAtTime(1.0 - timbreX, now, 0.05);
        voice.mixSquare.gain.setTargetAtTime(timbreX, now, 0.05);

        // Adjust cutoff based on the new Y (recalculating from baseFreq)
        const newCutoff = clampFreq(voice.baseFreq * (2 + timbreY * 6));
        voice.filter.frequency.setTargetAtTime(newCutoff, now, 0.05);
        voice.filter.Q.setTargetAtTime(1.0 + timbreX * 3.0 + timbreY * 2.0, now, 0.05);
    }
}

/**
 * Manages active voices for the soloist synthesizer.
 * @param {number} playTime - The current play time.
 * @param {import('../types.js').EnsembleState['soloist']} soloist - The soloist state object.
 */
function manageVoices(playTime, soloist) {
    if (!soloist.activeVoices) {
        soloist.activeVoices = []; // @direct-mutation
    }

    // Clean up finished voices (in-place mutation to satisfy state checks)
    for (let i = soloist.activeVoices.length - 1; i >= 0; i--) {
        const v = soloist.activeVoices[i];
        if (v.time + v.duration + 1.0 <= playTime) {
            soloist.activeVoices.splice(i, 1);
        }
    }

    const VOICE_LIMIT = soloist.mode === 'piano' ? 4 : soloist.mode === 'guitar' ? 2 : 1;

    // Check if the current note is part of the same "simultaneous" attack (polyphonic cluster)
    const isPolyphonicCluster =
        soloist.activeVoices.length > 0 &&
        Math.abs(playTime - soloist.activeVoices[soloist.activeVoices.length - 1].time) < 0.002;

    if (!isPolyphonicCluster && soloist.activeVoices.length >= VOICE_LIMIT) {
        // Only kill enough voices to stay under the limit for the NEW gesture
        const voicesToKill = soloist.activeVoices.length - VOICE_LIMIT + 1;
        const killed = [];
        for (let i = 0; i < voicesToKill; i++) {
            const oldest = soloist.activeVoices.shift();
            if (oldest) {
                killed.push(oldest);
            }
        }
        killActiveVoices(killed, playTime, 0.01);
    }
}

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {OscillatorNode} osc1
 * @param {OscillatorNode} osc2
 * @param {number} freq
 * @param {number} playTime
 * @param {number} duration
 * @param {number} bendStartInterval
 * @param {string} _style
 * @param {boolean} isLegato
 * @param {number} prevFreq
 * @param {boolean} [isPiano=false]
 */
function applyPitchEnvelope(
    state,
    osc1,
    osc2,
    freq,
    playTime,
    duration,
    bendStartInterval,
    _style,
    isLegato,
    prevFreq,
    isPiano = false,
) {
    const { soloist } = state;
    if (isPiano) {
        osc1.frequency.setValueAtTime(freq, playTime);
        osc2.frequency.setValueAtTime(freq, playTime);
        return;
    }

    const startFreq = bendStartInterval !== 0 ? freq * 2 ** (bendStartInterval / 12) : freq;

    if (isLegato && Math.abs(freq - prevFreq) < freq * 0.5) {
        const glideTime = soloist.mode === 'guitar' ? 0.03 : 0.06;
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

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {AudioContext} ctx
 * @param {number} freq
 * @param {number} time
 * @param {number} duration
 * @param {string} style
 * @param {boolean} [forceVibrato=false]
 * @returns {{vibrato: OscillatorNode, vibGain: GainNode}}
 */
function createVibrato(state, ctx, freq, time, duration, style, forceVibrato = false) {
    const { soloist, playback } = state;
    const config = /** @type {any} */ (STYLE_CONFIG)[style] || STYLE_CONFIG.scalar;
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

    const profile = soloist.phraseContext?.profile;
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

    if (soloist.mode === 'monophonic') {
        vibSpeed -= 0.5;
        depthFactor *= 1.2;
    } else if (soloist.mode === 'guitar') {
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

    if ((duration > 0.15 || forceVibrato) && soloist.mode !== 'piano') {
        vibrato.start(time);
        vibrato.stop(time + duration + 0.2);
    }

    return { vibrato, vibGain };
}
