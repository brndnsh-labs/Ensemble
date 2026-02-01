import { getState } from '../state.js';
import { safeDisconnect, clampFreq } from '../utils.js';

export function killSoloistNote() {
    const { playback, soloist } = getState();
    if (soloist.activeVoices && soloist.activeVoices.length > 0) {
        soloist.activeVoices.forEach(voice => {
            try {
                // Cancel gain AND frequency ramps to prevent pitch artifacts
                voice.gain.gain.cancelScheduledValues(playback.audio.currentTime);
                voice.gain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.01);
                
                if (voice.oscs) {
                    voice.oscs.forEach(osc => {
                        try {
                            osc.frequency.cancelScheduledValues(playback.audio.currentTime);
                        } catch { /* ignore */ }
                    });
                }
            } catch { /* ignore error */ }
        });
        soloist.activeVoices = [];
    }
}

export function playSoloNote(freq, time, duration, vol = 0.4, bendStartInterval = 0, style = 'scalar') {
    const { playback, soloist } = getState();
    if (!Number.isFinite(freq)) return;
    
    const now = playback.audio.currentTime;
    const playTime = Math.max(time, now);

    // --- Voice Management (Duophonic Limit) ---
    // We allow at most 2 notes to ring simultaneously.
    // If a double stop (2 notes) starts, any previous notes are killed.
    // If a single note starts and 2 are ringing, the oldest is killed.
    
    if (!soloist.activeVoices) soloist.activeVoices = [];
    
    // clean up voices that have finished their release (roughly duration + 0.5s)
    soloist.activeVoices = soloist.activeVoices.filter(v => (v.time + v.duration + 0.5) > playTime);

    // Intensity-driven Volume Scaling:
    // At high intensity, the soloist gets a significant gain boost to stay on top of the busy mix.
    const intensity = playback.bandIntensity;
    const intensityGain = 0.5 + (intensity * 0.9); // 0.5x to 1.4x scaling (Expanded from 0.85-1.15)

    const randomizedVol = vol * intensityGain * (0.95 + Math.random() * 0.1);
    const gain = playback.audio.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, playTime);

    // Dynamic Voice Limit: 1 for Pure Monophonic, 2 for Double Stops
    const VOICE_LIMIT = soloist.doubleStops ? 2 : 1;

    // If we are starting a note at a NEW time, and we already have voices,
    // we might need to steal one to keep the limit correct.
    const isNewGesture = soloist.activeVoices.length > 0 && Math.abs(playTime - soloist.activeVoices[soloist.activeVoices.length-1].time) > 0.001;
    
    if (isNewGesture || soloist.activeVoices.length >= VOICE_LIMIT) {
        const voicesToKill = isNewGesture ? soloist.activeVoices.length : (soloist.activeVoices.length - VOICE_LIMIT + 1);
        for (let i = 0; i < voicesToKill; i++) {
            const oldest = soloist.activeVoices.shift();
            if (oldest) {
                try {
                    oldest.gain.gain.cancelScheduledValues(playTime);
                    oldest.gain.gain.setTargetAtTime(0, playTime, 0.01);
                    if (oldest.oscs) {
                        oldest.oscs.forEach(osc => {
                            try {
                                osc.frequency.cancelScheduledValues(playTime);
                            } catch { /* ignore */ }
                        });
                    }
                } catch { /* ignore error */ }
            }
        }
    }

    const pan = playback.audio.createStereoPanner ? playback.audio.createStereoPanner() : playback.audio.createGain();
    if (playback.audio.createStereoPanner) pan.pan.setValueAtTime((Math.random() * 2 - 1) * 0.05, playTime);

    // Primary Osc: Mixed Saw/Tri for a richer tone
    const osc1 = playback.audio.createOscillator();
    osc1.type = 'sawtooth'; 
    
    const osc2 = playback.audio.createOscillator();
    osc2.type = 'triangle';
    osc2.detune.setValueAtTime(style === 'shred' ? 12 : 6, playTime);

    soloist.activeVoices.push({ gain, time: playTime, duration, oscs: [osc1, osc2] });

    // Pitch Envelope
    if (bendStartInterval !== 0) {
        const startFreq = freq * Math.pow(2, -bendStartInterval / 12);
        // Deliberate bends: longer for blues, shorter for bebop
        let bendDuration = 0.1;
        if (style === 'blues') bendDuration = 0.15;
        else if (style === 'bird') bendDuration = 0.05;
        else if (style === 'minimal') bendDuration = 0.25;
        
        bendDuration = Math.min(duration * 0.6, bendDuration);
        
        osc1.frequency.setValueAtTime(startFreq, playTime);
        osc1.frequency.exponentialRampToValueAtTime(freq, playTime + bendDuration);
        osc2.frequency.setValueAtTime(startFreq, playTime);
        osc2.frequency.exponentialRampToValueAtTime(freq, playTime + bendDuration);
    } else {
        const scoop = style === 'shred' ? 0.998 : 0.995;
        osc1.frequency.setValueAtTime(freq * scoop, playTime);
        // Firefox fix: use target for smoother onset
        osc1.frequency.setTargetAtTime(freq, playTime, 0.01);
        osc2.frequency.setValueAtTime(freq * scoop, playTime);
        osc2.frequency.setTargetAtTime(freq, playTime, 0.01);
    }

    // Style-specific Vibrato
    const vibrato = playback.audio.createOscillator();
    let vibSpeed = 5.5;
    let depthFactor = 0.005;
    
    if (style === 'blues') {
        vibSpeed = 4.8 + Math.random() * 0.5; // Slower, wider
        depthFactor = 0.012;
    } else if (style === 'neo') {
        vibSpeed = 4.2 + Math.random() * 0.4; // Slower, soulful
        depthFactor = 0.015; // Deeper for expressive sustain
    } else if (style === 'bossa') {
        vibSpeed = 5.2; // Smooth, lyrical
        depthFactor = 0.008; // Moderate depth
    } else if (style === 'shred') {
        vibSpeed = 6.5 + Math.random() * 1.0; // Faster, tighter
        depthFactor = 0.004;
    } else if (style === 'bird') {
        vibSpeed = 5.8; // Medium-fast, characteristic of sax
        depthFactor = 0.006;
    } else if (style === 'minimal') {
        vibSpeed = 4.2; // Slightly faster but still slow and deliberate
        depthFactor = 0.012; // Deeper for more emotion
    }
    
    vibrato.frequency.setValueAtTime(vibSpeed, playTime); 
    const vibGain = playback.audio.createGain();
    
    const isLongNote = duration > 0.4;
    const vibDelay = (style === 'minimal' ? 0.4 : (style === 'shred' ? 0.05 : 0.15)) + (Math.random() * 0.1);
    const vibRamp = style === 'minimal' ? 0.5 : 0.3;
    
    const finalVibDepth = freq * (isLongNote ? depthFactor : depthFactor * 0.3);
    
    vibGain.gain.setValueAtTime(0, playTime);
    vibGain.gain.setValueAtTime(0, playTime + vibDelay);
    vibGain.gain.linearRampToValueAtTime(finalVibDepth, playTime + vibDelay + vibRamp); 
    
    vibrato.connect(vibGain);
    vibGain.connect(osc1.frequency);
    vibGain.connect(osc2.frequency);

    // Resonant Filter
    const filter = playback.audio.createBiquadFilter();
    filter.type = 'lowpass';
    
    // Timbre-Intensity Mapping: Brighter at high intensity/velocity
    const brightnessBase = 1.0 + (intensity * 1.5) + (vol * 1.5); // 1x to 4x base
    const cutoffBase = style === 'bird' ? freq * 3.5 * brightnessBase : Math.min(freq * 4 * brightnessBase, 12000);
    
    filter.frequency.value = clampFreq(cutoffBase);
    filter.frequency.setValueAtTime(clampFreq(cutoffBase), playTime);
    filter.frequency.exponentialRampToValueAtTime(clampFreq(cutoffBase * (style === 'bird' ? 0.7 : 0.6)), playTime + duration);
    const qVal = style === 'bird' ? 1.5 : (isLongNote ? 2 : 1);
    filter.Q.value = qVal;
    filter.Q.setValueAtTime(qVal, playTime); 

    // Amplitude Envelope
    // Dynamic attack based on duration to prevent "mushy" fast notes
    const baseAttack = style === 'shred' ? 0.005 : 0.015;
    const attack = Math.min(baseAttack, duration * 0.25);
    
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, playTime);
    gain.gain.setTargetAtTime(randomizedVol, playTime, attack); 
    
    const releaseTime = duration * (style === 'minimal' ? 1.5 : 1.1);
    // Start release later (80% into the note) for better sustain
    gain.gain.setTargetAtTime(0, playTime + duration * 0.8, 0.1);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(playback.soloistGain);

    // Smart Vibrato Logic
    // Only apply vibrato if note is long enough to warrant it
    if (duration > 0.15) {
        vibrato.start(playTime);
        vibrato.stop(playTime + releaseTime + 0.1);
    }

    osc1.start(playTime);
    osc2.start(playTime);
    
    const stopTime = playTime + releaseTime + 0.1;
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    osc1.onended = () => safeDisconnect([pan, gain, filter, osc1, osc2, vibrato, vibGain]);
}
