import { getState } from '../state.js';
import { safeDisconnect, clampFreq } from '../utils.js';

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
export function playSoloNote(freq, time, duration, vol = 0.4, bendStartInterval = 0, style = 'scalar', isLegato = false) {
    const { playback, soloist } = getState();
    if (!Number.isFinite(freq)) return;

    const preset = soloist.preset || 'neo';
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
    
    // Retrieve last frequency for portamento
    const prevFreq = soloist.lastRenderedFreq || freq;
    soloist.lastRenderedFreq = freq;

    switch (preset) {
        case 'neo':
            playNeoJuno(ctx, freq, playTime, duration, vol, bendStartInterval, style, gain, voiceObj, isLegato, prevFreq);
            break;
        case 'vowel':
            playVowel(ctx, freq, playTime, duration, vol, bendStartInterval, style, gain, voiceObj, isLegato, prevFreq);
            break;
        case 'classic':
        default:
            playClassic(ctx, freq, playTime, duration, vol, bendStartInterval, style, gain, voiceObj, isLegato, prevFreq);
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
                            try { if (node.stop) node.stop(playTime + 0.05); } catch { /* ignore cleanup errors */ }
                        });
                    }
                } catch { /* ignore cleanup errors */ }
            }
        }
    }
}

// --- PRESET IMPLEMENTATIONS ---

function playClassic(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj, isLegato, prevFreq) {
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
    applyPitchEnvelope(osc1, osc2, freq, playTime, duration, bendStartInterval, style, isLegato, prevFreq);

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
    const attack = isLegato ? 0.005 : Math.min(baseAttack, duration * 0.25);
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

function playNeoJuno(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj, isLegato, prevFreq) {
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

    applyPitchEnvelope(osc1, osc2, freq, playTime, duration, bendStartInterval, style, isLegato, prevFreq);

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

    const attack = isLegato ? 0.005 : 0.02;

    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 0.8, playTime, attack);
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

function playVowel(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj, isLegato, prevFreq) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth'; // Rich harmonics for filtering

    applyPitchEnvelope(osc, null, freq, playTime, duration, bendStartInterval, style, isLegato, prevFreq);
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

    // Movement LFO for "alive" vowels
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.5; // Slow breathing rate
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 50; // Subtle shift in Hz

    lfo.connect(lfoGain);
    lfoGain.connect(f1.frequency);
    lfoGain.connect(f2.frequency);

    voiceObj.nodes.push(lfo);
    voiceObj.cleanup.push(lfoGain);
    lfo.start(playTime);
    lfo.stop(playTime + duration + 0.5);

    // Parallel connection
    osc.connect(f1);
    osc.connect(f2);
    osc.connect(f3);

    f1.connect(outputGain);
    f2.connect(outputGain);
    f3.connect(outputGain);

    voiceObj.cleanup.push(f1, f2, f3);

    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 1.8, playTime, 0.03); // Needs boost due to bandpass
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.9, 0.1);

    osc.start(playTime);
    const stopTime = playTime + duration + 0.3;
    osc.stop(stopTime);

    osc.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
}

// --- HELPERS ---

function applyPitchEnvelope(osc1, osc2, freq, time, duration, bendInterval, style, isLegato, prevFreq) {
    if (isLegato && prevFreq) {
        // Portamento Glide
        const glideTime = 0.04; // 40ms
        if (osc1) {
            osc1.frequency.setValueAtTime(prevFreq, time);
            osc1.frequency.exponentialRampToValueAtTime(freq, time + glideTime);
        }
        if (osc2) {
            osc2.frequency.setValueAtTime(prevFreq, time);
            osc2.frequency.exponentialRampToValueAtTime(freq, time + glideTime);
        }
    } else if (bendInterval !== 0) {
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
