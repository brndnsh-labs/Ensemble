import { getState } from '../state.js';
import { safeDisconnect, clampFreq } from '../utils.js';

let granularBuffer = null;

/**
 * Generates a rich harmonic pad texture for the granular synth.
 * @param {AudioContext} ctx
 */
function getGranularBuffer(ctx) {
    if (granularBuffer) return granularBuffer;

    const duration = 4.0;
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Additive synthesis: stack of harmonics
    const harmonics = [1, 2, 3, 4, 5, 6, 8];
    const baseFreq = 110; // A2

    for (let i = 0; i < length; i++) {
        let sum = 0;
        const t = i / sampleRate;
        harmonics.forEach((h, idx) => {
            const amp = 1 / (idx + 1); // Sawtooth-ish amplitude
            sum += Math.sin(t * baseFreq * h * 2 * Math.PI) * amp;
            // Add some detuned unison
            sum += Math.sin(t * (baseFreq * h + 1.5) * 2 * Math.PI) * amp * 0.5;
        });
        // Apply a slow envelope
        const env = Math.min(1, t * 2) * Math.min(1, (duration - t) * 2);
        data[i] = sum * 0.15 * env;
    }

    granularBuffer = buffer;
    return buffer;
}

export function killSoloistNote() {
    const { playback, soloist } = getState();
    if (soloist.activeVoices && soloist.activeVoices.length > 0) {
        soloist.activeVoices.forEach(voice => {
            try {
                // Cancel gain AND frequency ramps to prevent pitch artifacts
                if (voice.gain && voice.gain.gain) {
                    voice.gain.gain.cancelScheduledValues(playback.audio.currentTime);
                    voice.gain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.01);
                }
                
                if (voice.nodes) {
                    voice.nodes.forEach(node => {
                        try {
                            if (node.frequency) node.frequency.cancelScheduledValues(playback.audio.currentTime);
                            if (node.detune) node.detune.cancelScheduledValues(playback.audio.currentTime);
                            // Stop if it's a source node
                            if (node.stop) node.stop(playback.audio.currentTime + 0.02);
                        } catch { /* ignore */ }
                    });
                }
            } catch { /* ignore error */ }
        });
        soloist.activeVoices = [];
    }
}

/**
 * Main entry point for playing a soloist note.
 */
export function playSoloNote(freq, time, duration, vol = 0.4, bendStartInterval = 0, style = 'scalar') {
    const { playback, soloist } = getState();
    if (!Number.isFinite(freq)) return;

    const preset = soloist.preset || 'classic';
    const ctx = playback.audio;
    const now = ctx.currentTime;
    const playTime = Math.max(time, now);
    
    // Voice Management
    manageVoices(playTime, soloist);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (ctx.createStereoPanner) pan.pan.setValueAtTime((Math.random() * 2 - 1) * 0.05, playTime);

    // Common output chain
    gain.connect(pan);
    pan.connect(playback.soloistGain);

    let voiceObj = { gain, time: playTime, duration, nodes: [], cleanup: [gain, pan] };

    switch (preset) {
        case 'acoustic':
            playAcousticHybrid(ctx, freq, playTime, duration, vol, bendStartInterval, style, gain, voiceObj);
            break;
        case 'granular':
            playGranular(ctx, freq, playTime, duration, vol, bendStartInterval, style, gain, voiceObj);
            break;
        case 'neo':
            playNeoJuno(ctx, freq, playTime, duration, vol, bendStartInterval, style, gain, voiceObj);
            break;
        case 'vowel':
            playVowel(ctx, freq, playTime, duration, vol, bendStartInterval, style, gain, voiceObj);
            break;
        case 'classic':
        default:
            playClassic(ctx, freq, playTime, duration, vol, bendStartInterval, style, gain, voiceObj);
            break;
    }

    soloist.activeVoices.push(voiceObj);
}

function manageVoices(playTime, soloist) {
    if (!soloist.activeVoices) soloist.activeVoices = [];

    // Clean up finished voices
    soloist.activeVoices = soloist.activeVoices.filter(v => (v.time + v.duration + 1.0) > playTime);

    const VOICE_LIMIT = soloist.doubleStops ? 2 : 1;
    const isNewGesture = soloist.activeVoices.length > 0 && Math.abs(playTime - soloist.activeVoices[soloist.activeVoices.length-1].time) > 0.001;
    
    if (isNewGesture || soloist.activeVoices.length >= VOICE_LIMIT) {
        const voicesToKill = isNewGesture ? soloist.activeVoices.length : (soloist.activeVoices.length - VOICE_LIMIT + 1);
        for (let i = 0; i < voicesToKill; i++) {
            const oldest = soloist.activeVoices.shift();
            if (oldest) {
                try {
                    oldest.gain.gain.cancelScheduledValues(playTime);
                    oldest.gain.gain.setTargetAtTime(0, playTime, 0.01);
                    if (oldest.nodes) {
                        oldest.nodes.forEach(node => {
                            try { if (node.stop) node.stop(playTime + 0.05); } catch { }
                        });
                    }
                } catch { }
            }
        }
    }
}

// --- PRESET IMPLEMENTATIONS ---

function playClassic(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj) {
    const { playback } = getState();
    const intensity = playback.bandIntensity || 0.5;
    const intensityGain = 0.5 + (intensity * 0.9);
    const randomizedVol = vol * intensityGain * (0.95 + Math.random() * 0.1);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth'; 
    
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.detune.setValueAtTime(style === 'shred' ? 12 : 6, playTime);

    voiceObj.nodes.push(osc1, osc2);

    // Pitch Envelope
    applyPitchEnvelope(osc1, osc2, freq, playTime, duration, bendStartInterval, style);

    // Vibrato
    const { vibrato, vibGain } = createVibrato(ctx, freq, playTime, duration, style);
    vibrato.connect(vibGain);
    vibGain.connect(osc1.frequency);
    vibGain.connect(osc2.frequency);
    voiceObj.nodes.push(vibrato);
    voiceObj.cleanup.push(vibGain);

    // Filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const brightnessBase = 1.0 + (intensity * 1.5) + (vol * 1.5);
    const cutoffBase = style === 'bird' ? freq * 3.5 * brightnessBase : Math.min(freq * 4 * brightnessBase, 12000);
    
    filter.frequency.setValueAtTime(clampFreq(cutoffBase), playTime);
    filter.frequency.exponentialRampToValueAtTime(clampFreq(cutoffBase * (style === 'bird' ? 0.7 : 0.6)), playTime + duration);
    filter.Q.value = style === 'bird' ? 1.5 : (duration > 0.4 ? 2 : 1);

    voiceObj.cleanup.push(filter);

    // Envelope
    const baseAttack = style === 'shred' ? 0.005 : 0.015;
    const attack = Math.min(baseAttack, duration * 0.25);
    const releaseTime = duration * (style === 'minimal' ? 1.5 : 1.1);

    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(randomizedVol, playTime, attack);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.8, 0.1);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(outputGain);

    osc1.start(playTime);
    osc2.start(playTime);

    const stopTime = playTime + releaseTime + 0.1;
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    // Only apply vibrato if note is long enough
    if (duration > 0.15) {
        vibrato.start(playTime);
        vibrato.stop(stopTime);
    }

    osc1.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
}

function playAcousticHybrid(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj) {
    // Karplus-Strong (Noise -> Delay) + Sine Body
    const noise = ctx.createBufferSource();
    const bufferSize = ctx.sampleRate * 0.1; // 100ms noise burst
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 2000;

    // Delay line for Karplus-Strong
    const delayNode = ctx.createDelay();
    const delayTime = 1 / freq;
    delayNode.delayTime.setValueAtTime(delayTime, playTime);

    const feedback = ctx.createGain();
    feedback.gain.value = 0.96; // High feedback for string sustain

    // Sine Body
    const sine = ctx.createOscillator();
    sine.type = 'sine';
    applyPitchEnvelope(sine, null, freq, playTime, duration, bendStartInterval, style);

    voiceObj.nodes.push(noise, sine);
    voiceObj.cleanup.push(noiseFilter, delayNode, feedback);

    // Connections
    noise.connect(noiseFilter);
    noiseFilter.connect(delayNode);
    delayNode.connect(outputGain);
    delayNode.connect(feedback);
    feedback.connect(delayNode);

    sine.connect(outputGain);

    // Envelopes
    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 0.8, playTime, 0.005);
    outputGain.gain.setTargetAtTime(0, playTime + duration, 0.1);

    noise.start(playTime);
    noise.stop(playTime + 0.02); // Short burst
    sine.start(playTime);
    sine.stop(playTime + duration + 0.5);

    sine.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
}

function playGranular(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj) {
    const srcBuffer = getGranularBuffer(ctx);
    const baseRate = freq / 110.0; // Buffer base is A2 (110Hz)

    // Granular Params
    const grainSize = 0.06; // 60ms
    const grainOverlap = 0.04; // New grain every 40ms
    const releaseTail = 0.2;
    const totalDuration = duration + releaseTail;

    // Master envelope
    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol, playTime, 0.05);
    outputGain.gain.setTargetAtTime(0, playTime + duration, 0.15);

    let currentTime = playTime;
    const endTime = playTime + totalDuration;

    while (currentTime < endTime) {
        const src = ctx.createBufferSource();
        src.buffer = srcBuffer;

        // Randomize
        const offset = Math.random() * (srcBuffer.duration - grainSize);
        const randomRate = baseRate * (1 + (Math.random() - 0.5) * 0.04);
        const randomPan = (Math.random() - 0.5) * 0.3;

        src.playbackRate.value = randomRate;

        // Grain Envelope / Panner
        const env = ctx.createGain();
        const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
        if (ctx.createStereoPanner) panner.pan.value = randomPan;

        // Shape: Triangle/Parabolic
        env.gain.value = 0;
        env.gain.setValueAtTime(0, currentTime);
        env.gain.linearRampToValueAtTime(0.7, currentTime + (grainSize * 0.5));
        env.gain.linearRampToValueAtTime(0, currentTime + grainSize);

        src.connect(env);
        env.connect(panner);
        panner.connect(outputGain);

        src.start(currentTime, offset, grainSize);
        src.stop(currentTime + grainSize + 0.02);

        voiceObj.nodes.push(src);
        voiceObj.cleanup.push(env, panner);

        currentTime += grainOverlap;
    }

    setTimeout(() => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes)), (totalDuration + 1.0) * 1000);
}

function playNeoJuno(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj) {
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';

    // LFOs for independent drift
    const lfo1 = ctx.createOscillator();
    lfo1.frequency.value = 0.3;
    const lfo1Gain = ctx.createGain();
    lfo1Gain.gain.value = 8; // Cents detune

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.5;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = -7;

    lfo1.connect(lfo1Gain);
    lfo1Gain.connect(osc1.detune);
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(osc2.detune);

    voiceObj.nodes.push(osc1, osc2, lfo1, lfo2);
    voiceObj.cleanup.push(lfo1Gain, lfo2Gain);

    applyPitchEnvelope(osc1, osc2, freq, playTime, duration, bendStartInterval, style);

    // Filter - Warm Lowpass
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 6, 8000), playTime);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 3, 4000), playTime + duration);
    filter.Q.value = 2;

    voiceObj.cleanup.push(filter);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(outputGain);

    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol, playTime, 0.02);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.9, 0.15);

    osc1.start(playTime);
    osc2.start(playTime);
    lfo1.start(playTime);
    lfo2.start(playTime);
    
    const stopTime = playTime + duration + 0.5;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    lfo1.stop(stopTime);
    lfo2.stop(stopTime);

    osc1.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
}

function playVowel(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth'; // Rich harmonics for filtering

    applyPitchEnvelope(osc, null, freq, playTime, duration, bendStartInterval, style);
    voiceObj.nodes.push(osc);

    // Formant Filters (Ah/Oh sound)
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 600;
    f1.Q.value = 4;

    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1000;
    f2.Q.value = 4;

    const f3 = ctx.createBiquadFilter();
    f3.type = 'bandpass';
    f3.frequency.value = 2500;
    f3.Q.value = 5;

    // Parallel connection
    osc.connect(f1);
    osc.connect(f2);
    osc.connect(f3);

    f1.connect(outputGain);
    f2.connect(outputGain);
    f3.connect(outputGain);

    voiceObj.cleanup.push(f1, f2, f3);

    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 1.5, playTime, 0.03); // Needs boost due to bandpass
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.9, 0.1);

    osc.start(playTime);
    const stopTime = playTime + duration + 0.3;
    osc.stop(stopTime);

    osc.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
}

// --- HELPERS ---

function applyPitchEnvelope(osc1, osc2, freq, time, duration, bendInterval, style) {
    if (bendInterval !== 0) {
        const startFreq = freq * Math.pow(2, -bendInterval / 12);
        let bendDuration = 0.1;
        if (style === 'blues') bendDuration = 0.15;
        else if (style === 'bird') bendDuration = 0.05;
        else if (style === 'minimal') bendDuration = 0.25;

        bendDuration = Math.min(duration * 0.6, bendDuration);

        if (osc1) {
            osc1.frequency.setValueAtTime(startFreq, time);
            osc1.frequency.exponentialRampToValueAtTime(freq, time + bendDuration);
        }
        if (osc2) {
            osc2.frequency.setValueAtTime(startFreq, time);
            osc2.frequency.exponentialRampToValueAtTime(freq, time + bendDuration);
        }
    } else {
        const scoop = style === 'shred' ? 0.998 : 0.995;
        if (osc1) {
            osc1.frequency.setValueAtTime(freq * scoop, time);
            osc1.frequency.setTargetAtTime(freq, time, 0.01);
        }
        if (osc2) {
            osc2.frequency.setValueAtTime(freq * scoop, time);
            osc2.frequency.setTargetAtTime(freq, time, 0.01);
        }
    }
}

function createVibrato(ctx, freq, time, duration, style) {
    const vibrato = ctx.createOscillator();
    let vibSpeed = 5.5;
    let depthFactor = 0.005;

    // Style adjustments
    if (style === 'blues') { vibSpeed = 4.8; depthFactor = 0.012; }
    else if (style === 'neo') { vibSpeed = 4.2; depthFactor = 0.015; }
    else if (style === 'shred') { vibSpeed = 6.5; depthFactor = 0.004; }

    vibrato.frequency.setValueAtTime(vibSpeed, time);

    const vibGain = ctx.createGain();
    const isLongNote = duration > 0.4;
    const vibDelay = 0.15 + (Math.random() * 0.1);
    const finalVibDepth = freq * (isLongNote ? depthFactor : depthFactor * 0.3);

    vibGain.gain.setValueAtTime(0, time);
    vibGain.gain.setValueAtTime(0, time + vibDelay);
    vibGain.gain.linearRampToValueAtTime(finalVibDepth, time + vibDelay + 0.3);

    return { vibrato, vibGain };
}
