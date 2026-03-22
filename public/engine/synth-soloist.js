import { clampFreq, safeDisconnect } from '../utils.js';
import { STYLE_CONFIG } from './soloist-config.js';
import { createSimplePanner, killActiveVoices, rampGain } from './synth-utils.js';

/**
 * @typedef {Object} SoloistVoice
 * @property {GainNode} gain
 * @property {number} time
 * @property {number} duration
 * @property {AudioNode[]} nodes
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
 * @param {boolean} [vibrato=false] - Whether to apply vibrato.
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
    vibrato = false,
) {
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
    manageVoices(playTime, soloist);

    const isPiano = soloist.mode === 'piano';
    if (isPiano) {
        isLegato = false;
    }

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const panValue = (Math.random() * 2 - 1) * 0.05;
    const pan = createSimplePanner(ctx, panValue, playTime);

    // Common output chain
    gain.connect(pan);
    pan.connect(/** @type {any} */ (playback).soloistGain);

    // We store nodes in a single array for the utility to handle stopping/cleanup
    /** @type {SoloistVoice} */
    const voiceObj = { gain, time: playTime, duration, nodes: [gain, pan] };

    // Retrieve last frequency for portamento
    const prevFreq = soloist.lastRenderedFreq || freq;
    soloist.lastRenderedFreq = freq; // @direct-mutation

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
        case 'classic':
            playClassic(
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

    soloist.activeVoices.push(voiceObj); // @direct-mutation
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

// --- PRESET IMPLEMENTATIONS ---

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {AudioContext} ctx
 * @param {number} freq
 * @param {number} playTime
 * @param {number} duration
 * @param {number} vol
 * @param {number} bendStartInterval
 * @param {string} style
 * @param {GainNode} outputGain
 * @param {SoloistVoice} voiceObj
 * @param {boolean} isLegato
 * @param {number} prevFreq
 * @param {boolean} vibratoFlag
 */
function playTrumpet(
    state,
    ctx,
    freq,
    playTime,
    duration,
    vol,
    bendStartInterval,
    style,
    outputGain,
    voiceObj,
    isLegato,
    prevFreq,
    vibratoFlag,
) {
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
        soloist.mode === 'piano',
    );

    if (soloist.mode !== 'piano') {
        const { vibrato, vibGain } = createVibrato(
            state,
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        vibrato.connect(vibGain);
        vibGain.connect(/** @type {any} */ (osc1.frequency));
        vibGain.connect(/** @type {any} */ (osc2.frequency));
        voiceObj.nodes.push(vibrato, vibGain);
    }

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

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {AudioContext} ctx
 * @param {number} freq
 * @param {number} playTime
 * @param {number} duration
 * @param {number} vol
 * @param {number} bendStartInterval
 * @param {string} style
 * @param {GainNode} outputGain
 * @param {SoloistVoice} voiceObj
 * @param {boolean} isLegato
 * @param {number} prevFreq
 * @param {boolean} vibratoFlag
 */
function playSaxophone(
    state,
    ctx,
    freq,
    playTime,
    duration,
    vol,
    bendStartInterval,
    style,
    outputGain,
    voiceObj,
    isLegato,
    prevFreq,
    vibratoFlag,
) {
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
        soloist.mode === 'piano',
    );

    if (soloist.mode !== 'piano') {
        const { vibrato, vibGain } = createVibrato(
            state,
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        vibrato.connect(vibGain);
        vibGain.connect(/** @type {any} */ (osc1.frequency));
        vibGain.connect(/** @type {any} */ (osc2.frequency));
        voiceObj.nodes.push(vibrato, vibGain);
    }

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

    osc1.start(playTime);
    osc2.start(playTime);
    breathLfo.start(playTime);

    const stopTime = playTime + duration + 0.2;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    breathLfo.stop(stopTime);

    osc1.onended = () => safeDisconnect(voiceObj.nodes);
}

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {AudioContext} ctx
 * @param {number} freq
 * @param {number} playTime
 * @param {number} duration
 * @param {number} vol
 * @param {number} bendStartInterval
 * @param {string} style
 * @param {GainNode} outputGain
 * @param {SoloistVoice} voiceObj
 * @param {boolean} isLegato
 * @param {number} prevFreq
 * @param {boolean} vibratoFlag
 */
function playClassic(
    state,
    ctx,
    freq,
    playTime,
    duration,
    vol,
    bendStartInterval,
    style,
    outputGain,
    voiceObj,
    isLegato,
    prevFreq,
    vibratoFlag,
) {
    const { playback, soloist } = state;
    const intensity = playback.bandIntensity || 0.5;
    const intensityGain = 0.5 + intensity * 0.9;
    const randomizedVol = vol * intensityGain * (0.95 + Math.random() * 0.1);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.detune.setValueAtTime(style === 'shred' ? 12 : 6, playTime);

    voiceObj.nodes.push(osc1, osc2);

    // Pitch Envelope
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
        soloist.mode === 'piano',
    );

    // Vibrato
    if (soloist.mode !== 'piano') {
        const { vibrato, vibGain } = createVibrato(
            state,
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        vibrato.connect(vibGain);
        vibGain.connect(/** @type {any} */ (osc1.frequency));
        vibGain.connect(/** @type {any} */ (osc2.frequency));
        voiceObj.nodes.push(vibrato, vibGain);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const brightnessBase = 1.0 + intensity * 1.5 + vol * 1.5;
    const cutoffBase =
        style === 'bird' ? freq * 3.5 * brightnessBase : Math.min(freq * 4 * brightnessBase, 12000);

    const muteThreshold = intensity < 0.4 ? 0.7 : 0.55;
    const isMuted = soloist.mode === 'guitar' && vol < muteThreshold;
    const isPiano = soloist.mode === 'piano';

    filter.frequency.setValueAtTime(clampFreq(cutoffBase), playTime);
    if (isMuted) {
        filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 1.5), playTime + 0.08);
        filter.Q.value = 4;
    } else {
        filter.frequency.exponentialRampToValueAtTime(
            clampFreq(cutoffBase * (style === 'bird' ? 0.7 : 0.6)),
            playTime + duration,
        );
        filter.Q.value = isPiano ? 0.7 : style === 'bird' ? 1.5 : duration > 0.4 ? 2 : 1;
    }

    voiceObj.nodes.push(filter);

    const baseAttack = style === 'shred' ? 0.005 : 0.015;
    const attack = isLegato ? 0.005 : Math.min(baseAttack, duration * 0.25);
    let releaseTime = duration * (style === 'minimal' ? 1.5 : 1.1);

    if (isMuted) {
        outputGain.gain.setValueAtTime(0, playTime);
        outputGain.gain.setTargetAtTime(randomizedVol, playTime, 0.005);
        outputGain.gain.setTargetAtTime(0, playTime + 0.05, 0.02);
        releaseTime = 0.12;
    } else if (isPiano && (vol < 0.5 || duration > 0.6)) {
        outputGain.gain.setValueAtTime(0, playTime);
        outputGain.gain.setTargetAtTime(randomizedVol, playTime, attack);
        const sustainDecay = Math.max(0.1, randomizedVol * 0.2);
        outputGain.gain.setTargetAtTime(sustainDecay, playTime + 0.1, 0.1);
        outputGain.gain.setTargetAtTime(0, playTime + duration * 0.95, 0.3);
        releaseTime = Math.max(0.5, duration * 1.2);
    } else {
        outputGain.gain.setValueAtTime(0, playTime);
        outputGain.gain.setTargetAtTime(randomizedVol, playTime, attack);
        outputGain.gain.setTargetAtTime(0, playTime + duration * 0.8, 0.1);
    }

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(outputGain);

    osc1.start(playTime);
    osc2.start(playTime);

    const stopTime = playTime + releaseTime + 0.1;
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    osc1.onended = () => safeDisconnect(voiceObj.nodes);
}

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {AudioContext} ctx
 * @param {number} freq
 * @param {number} playTime
 * @param {number} duration
 * @param {number} vol
 * @param {number} bendStartInterval
 * @param {string} style
 * @param {GainNode} outputGain
 * @param {SoloistVoice} voiceObj
 * @param {boolean} isLegato
 * @param {number} prevFreq
 * @param {boolean} vibratoFlag
 */
function playNeoJuno(
    state,
    ctx,
    freq,
    playTime,
    duration,
    vol,
    bendStartInterval,
    style,
    outputGain,
    voiceObj,
    isLegato,
    prevFreq,
    vibratoFlag,
) {
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
    lfo1Gain.connect(/** @type {any} */ (osc1.detune));
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(/** @type {any} */ (osc2.detune));

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
        soloist.mode === 'piano',
    );

    if (soloist.mode !== 'piano') {
        const { vibrato, vibGain } = createVibrato(
            state,
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        vibrato.connect(vibGain);
        vibGain.connect(/** @type {any} */ (osc1.frequency));
        vibGain.connect(/** @type {any} */ (osc2.frequency));
        voiceObj.nodes.push(vibrato, vibGain);
    }

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

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {AudioContext} ctx
 * @param {number} freq
 * @param {number} playTime
 * @param {number} duration
 * @param {number} vol
 * @param {number} bendStartInterval
 * @param {string} style
 * @param {GainNode} outputGain
 * @param {SoloistVoice} voiceObj
 * @param {boolean} isLegato
 * @param {number} prevFreq
 * @param {boolean} vibratoFlag
 */
function playVowel(
    state,
    ctx,
    freq,
    playTime,
    duration,
    vol,
    bendStartInterval,
    style,
    outputGain,
    voiceObj,
    isLegato,
    prevFreq,
    vibratoFlag,
) {
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
        soloist.mode === 'piano',
    );

    if (soloist.mode !== 'piano') {
        const { vibrato, vibGain } = createVibrato(
            state,
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        vibrato.connect(vibGain);
        vibGain.connect(/** @type {any} */ (osc1.frequency));
        vibGain.connect(/** @type {any} */ (osc2.frequency));
        voiceObj.nodes.push(vibrato, vibGain);
    }

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

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {AudioContext} ctx
 * @param {number} freq
 * @param {number} playTime
 * @param {number} duration
 * @param {number} vol
 * @param {number} bendStartInterval
 * @param {string} style
 * @param {GainNode} outputGain
 * @param {SoloistVoice} voiceObj
 * @param {boolean} isLegato
 * @param {number} prevFreq
 * @param {boolean} vibratoFlag
 */
function playShred(
    state,
    ctx,
    freq,
    playTime,
    duration,
    vol,
    bendStartInterval,
    style,
    outputGain,
    voiceObj,
    isLegato,
    prevFreq,
    vibratoFlag,
) {
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
        soloist.mode === 'piano',
    );

    if (soloist.mode !== 'piano') {
        const { vibrato, vibGain } = createVibrato(
            state,
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        vibrato.connect(vibGain);
        vibGain.connect(/** @type {any} */ (osc1.frequency));
        vibGain.connect(/** @type {any} */ (osc2.frequency));
        voiceObj.nodes.push(vibrato, vibGain);
    }

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
