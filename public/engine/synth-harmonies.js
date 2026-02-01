import { getState } from '../state.js';
import { safeDisconnect, clampFreq } from '../utils.js';

/**
 * Polyphonic Synthesizer for the Harmony Module (harmony).
 * Optimized for Horns (stabs) and Strings (pads).
 */

export function killHarmonyNote(fadeTime = 0.05) {
    const { playback, harmony } = getState();
    if (harmony.activeVoices && harmony.activeVoices.length > 0) {
        harmony.activeVoices.forEach(voice => {
            try {
                const g = voice.gain.gain;
                g.cancelScheduledValues(playback.audio.currentTime);
                g.setTargetAtTime(0, playback.audio.currentTime, fadeTime);
            } catch { /* ignore error */ }
        });
        harmony.activeVoices = [];
    }
}

/**
 * Plays a harmony note with genre-specific synthesis and articulations.
 */
export function playHarmonyNote(freq, time, duration, vol = 0.4, style = 'stabs', midi = null, slideInterval = 0, slideDuration = 0, vibrato = { rate: 0, depth: 0 }) {
    const { playback, harmony, groove } = getState();
    if (!Number.isFinite(freq) || !playback.audio) return;
    
    const now = playback.audio.currentTime;
    const playTime = Math.max(time, now);
    const feel = groove.genreFeel;

    if (!harmony.activeVoices) harmony.activeVoices = [];
    
    // 1. Strict Voice Management & Stealing
    // Remove expired voices
    harmony.activeVoices = harmony.activeVoices.filter(v => (v.time + v.duration + 0.1) > playTime);
    
    // Pitch-aware Stealing: If this exact MIDI note is already playing, kill it immediately
    if (midi !== null) {
        const existing = harmony.activeVoices.find(v => v.midi === midi);
        if (existing) {
            existing.gain.gain.cancelScheduledValues(playTime);
            existing.gain.gain.setTargetAtTime(0, playTime, 0.005);
            harmony.activeVoices = harmony.activeVoices.filter(v => v !== existing);
        }
    }

    // Polyphonic Limit (Max 3 voices for clarity and ensemble focus)
    if (harmony.activeVoices.length >= 3) {
        const oldest = harmony.activeVoices.shift();
        if (oldest) {
            oldest.gain.gain.cancelScheduledValues(playTime);
            oldest.gain.gain.setTargetAtTime(0, playTime, 0.01);
        }
    }

    // Module-Level Polyphony Scaling
    const polyphonyDucking = harmony.activeVoices.length > 1 ? 0.85 : 1.0;
    const finalVol = vol * polyphonyDucking;

    const gain = playback.audio.createGain();
    gain.gain.value = 0;

    const filter = playback.audio.createBiquadFilter();
    filter.type = 'lowpass';

    // --- Articulation: Stereo Stage Bloom ---
    // Widens the ensemble as intensity builds. 
    // Low intensity = centered/focused. High intensity = wide/orchestral.
    const panner = playback.audio.createStereoPanner ? playback.audio.createStereoPanner() : null;
    if (panner) {
        // Random slight pan per voice, depth scales with intensity
        const panRange = 0.1 + (playback.bandIntensity * 0.7); 
        const panValue = (Math.random() * 2 - 1) * panRange;
        panner.pan.setValueAtTime(panValue, playTime);
    }

    // Synthesis: Multi-oscillator setup for "Ensemble" feel
    const osc1 = playback.audio.createOscillator();
    const osc2 = playback.audio.createOscillator();

    // --- Lane Protection: Sub-Oscillator ---
    // Only use the sub-oscillator if the main frequency is high enough 
    // to keep the sub-octave out of the primary bass territory.
    const useSub = freq > 250; // Raised from 200 to clear the bass
    const sub = useSub ? playback.audio.createOscillator() : null;
    
    // --- Articulation: Vibrato (LFO) ---
    let lfo = null;
    let lfoGain = null;
    let tremoloLfo = null;
    let tremoloGain = null;
    
    // Organ-specific nodes (lifted for cleanup)
    let fifthOsc = null;
    let click = null;
    let clickGain = null;
    let saturator = null;
    let subGain = null;
    let hp = null;
    
    // Organ Leslie Effect: Combined Pitch and Amplitude Modulation
    if (style === 'organ') {
        const leslieSpeed = 6.2; // Fast Leslie setting

        // Saturation (Tube Grit) - Initialize early to avoid connection errors
        saturator = playback.audio.createWaveShaper();
        saturator.curve = (function() {
            const n = 44100;
            const curve = new Float32Array(n);
            const k = 2; // Subtle drive
            for (let i = 0; i < n; ++i) {
                const x = (i * 2) / n - 1;
                curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
            }
            return curve;
        })();
        
        // 1. Pitch Modulation (Doppler)
        lfo = playback.audio.createOscillator();
        lfoGain = playback.audio.createGain();
        lfo.frequency.setValueAtTime(leslieSpeed, playTime);
        lfoGain.gain.setValueAtTime(5, playTime); // Reduced from 10 to stop "warbling"
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);
        if (sub) lfoGain.connect(sub.frequency);
        lfo.start(playTime);

        // 2. Amplitude Modulation (Tremolo)
        tremoloLfo = playback.audio.createOscillator();
        tremoloGain = playback.audio.createGain();
        tremoloLfo.type = 'sine';
        tremoloLfo.frequency.setValueAtTime(leslieSpeed, playTime);
        
        // Tremolo depth (0.1 to 0.3 is natural)
        const tremDepth = 0.2;
        tremoloGain.gain.setValueAtTime(1.0 - tremDepth, playTime);
        const tremAmp = playback.audio.createGain();
        tremAmp.gain.setValueAtTime(tremDepth, playTime);
        tremoloLfo.connect(tremAmp);
        tremAmp.connect(gain.gain); // Modulate the main gain
        
        tremoloLfo.start(playTime);
    } else if (vibrato && vibrato.rate > 0 && vibrato.depth > 0) {
        lfo = playback.audio.createOscillator();
        lfoGain = playback.audio.createGain();
        lfo.frequency.setValueAtTime(vibrato.rate, playTime);
        lfoGain.gain.setValueAtTime(vibrato.depth, playTime);
        
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);
        if (sub) lfoGain.connect(sub.frequency);
        lfo.start(playTime);
    }

    if (feel === 'Rock' || feel === 'Metal') {
        // Aggressive Brass/Synth: Bright Sawtooths
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(15, playTime); 
        if (sub) {
            sub.type = 'sawtooth';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } 
    else if (feel === 'Neo-Soul' || feel === 'Acoustic') {
        // Warm/Soulful: Multi-Triangle for clarity
        osc1.type = 'triangle';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(2, playTime); 
        if (sub) {
            sub.type = 'triangle';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }
    else if (style === 'organ') {
        // B3 Drawbar Simulation (888 Setting): Root + Fifth + Octave + Sub
        osc1.type = 'sine'; // 8' (Fundamental)
        
        osc2.type = 'sine'; // 4' (Octave up)
        osc2.frequency.setValueAtTime(freq * 2, playTime);
        
        // 3rd Drawbar: 5 1/3' (Fifth above fundamental)
        fifthOsc = playback.audio.createOscillator();
        fifthOsc.type = 'sine';
        fifthOsc.frequency.setValueAtTime(freq * 1.5, playTime);
        
        if (sub) {
            sub.type = 'sine'; // 16' (Sub-fundamental)
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
            
            subGain = playback.audio.createGain();
            subGain.gain.setValueAtTime(0.5, playTime); // Sub is 50% volume of fundamental
            sub.connect(subGain);
            if (saturator) subGain.connect(saturator);
        }

        // Key Click (Percussion) - made slightly louder
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

        if (saturator) {
            osc1.connect(saturator);
            osc2.connect(saturator);
            fifthOsc.connect(saturator);
            
            hp = playback.audio.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.setValueAtTime(120, playTime); // Strict roll-off below 120Hz
            
            saturator.connect(filter);
            filter.connect(hp);
            hp.connect(gain);
        } else {
            // Fallback if saturator failed
            osc1.connect(filter);
            osc2.connect(filter);
            fifthOsc.connect(filter);
            filter.connect(gain);
        }
        
        fifthOsc.start(playTime);
        fifthOsc.stop(playTime + duration + 0.5);
        if (lfoGain) lfoGain.connect(fifthOsc.frequency);
    }
    else if (style === 'plucks') {
        // Modern EDM Pluck: Short, resonant, punchy
        osc1.type = 'sawtooth';
        osc2.type = 'square';
        osc2.detune.setValueAtTime(5, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }
    else if (style === 'counter') {
        // Cello/Trombone hybrid: Sawtooth with heavy filtering
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(4, playTime);
    }
    else if (style === 'stabs') {
        // Horn-like: Bright Sawtooth with body
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(12, playTime); 
        if (sub) {
            sub.type = 'triangle';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else {
        // Lush Strings: Mixed waveforms
        osc1.type = 'triangle';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(8, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }
    
    // --- Articulation: Slides ---
    if (slideInterval !== 0 && slideDuration > 0) {
        const startFreq = freq * Math.pow(2, slideInterval / 12);
        osc1.frequency.setValueAtTime(startFreq, playTime);
        osc2.frequency.setValueAtTime(startFreq, playTime);
        if (sub) sub.frequency.setValueAtTime(startFreq * 0.5, playTime);

        osc1.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
        osc2.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
        if (sub) sub.frequency.exponentialRampToValueAtTime(freq * 0.5, playTime + slideDuration);
    } else {
        osc1.frequency.setValueAtTime(freq, playTime);
        osc2.frequency.setValueAtTime(freq, playTime);
        if (sub) sub.frequency.setValueAtTime(freq * 0.5, playTime);
    }

    // --- Articulation: Timbral Bloom ---
    // Brightness scales with intensity. 
    const intensity = playback.bandIntensity;
    const brightnessMult = 1.0 + (intensity * 2.0); // Up to 3x brightness increase

    if (style === 'stabs') {
        const qVal = (feel === 'Rock' || feel === 'Metal') ? (5 + intensity * 5) : (3 + intensity * 2);
        const startFreq = Math.min(freq * 8 * brightnessMult, 12000);
        filter.frequency.setValueAtTime(clampFreq(startFreq), playTime);
        filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 2 * brightnessMult), playTime + 0.1);
        filter.Q.setValueAtTime(qVal, playTime);
    } else if (style === 'plucks') {
        // "Bubble" envelope
        filter.frequency.setValueAtTime(clampFreq(freq * 8), playTime);
        filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 1.5), playTime + 0.1); // Fast snap (Reduced from 0.15)
        filter.Q.setValueAtTime(5 + (intensity * 5), playTime); // High resonance
    } else if (style === 'counter') {
        // Expressive swell
        const start = freq * 1.5;
        const peak = freq * 3.0 * brightnessMult;
        filter.frequency.setValueAtTime(clampFreq(start), playTime);
        filter.frequency.linearRampToValueAtTime(clampFreq(peak), playTime + duration * 0.6); // Swell
        filter.Q.setValueAtTime(1.0, playTime);
    } else {
        // Swell for pads
        const cutoff = (feel === 'Neo-Soul') ? freq * 1.5 * brightnessMult : freq * 3 * brightnessMult;
        filter.frequency.setValueAtTime(clampFreq(cutoff), playTime);
        filter.frequency.exponentialRampToValueAtTime(clampFreq(cutoff * 1.2), playTime + duration * 0.5);
        filter.frequency.exponentialRampToValueAtTime(clampFreq(cutoff), playTime + duration);
        filter.Q.setValueAtTime(1 + intensity, playTime);
    }

    // Amplitude Envelope
    const isFastAttack = style === 'stabs' || style === 'plucks' || style === 'organ';
    const baseAttack = isFastAttack ? 0.01 : 0.2;
    const attack = Math.max(0.005, baseAttack - (finalVol * 0.15));
    // Refined release: Plucks need to be super tight (0.02), Stabs (0.1), Pads (0.5)
    let release = 0.5;
    if (style === 'stabs') release = 0.1;
    if (style === 'plucks') release = 0.02;
    
    const detuneMult = 1.0 + (finalVol * 0.5);
    osc2.detune.setValueAtTime((style === 'stabs' ? 12 : 8) * detuneMult, playTime);

    gain.gain.setValueAtTime(0, playTime);
    gain.gain.linearRampToValueAtTime(finalVol, playTime + attack);
    gain.gain.setTargetAtTime(0, playTime + duration - release, release);

    // Routing
    if (style !== 'organ') {
        osc1.connect(filter);
        osc2.connect(filter);
        if (sub) sub.connect(filter);
        filter.connect(gain);
    }
    // Organ handles its own routing (via saturator -> filter -> hp) to gain
    
    if (panner) {
        gain.connect(panner);
        if (playback.harmoniesGain) panner.connect(playback.harmoniesGain);
    } else {
        if (playback.harmoniesGain) gain.connect(playback.harmoniesGain);
    }

    // Register active voice
    const voiceRefs = { gain, time: playTime, duration, midi };
    harmony.activeVoices.push(voiceRefs);

    osc1.start(playTime);
    osc2.start(playTime);
    if (sub) sub.start(playTime);
    
    const stopTime = playTime + duration + 0.5;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    if (sub) sub.stop(stopTime);
    if (lfo) lfo.stop(stopTime);

    // Enhanced Cleanup for complex styles
    osc1.onended = () => {
        safeDisconnect([gain, filter, osc1, osc2, sub, lfo, lfoGain, panner, hp, subGain]);
        // Clean up Organ/Tremolo specific nodes if they exist (they are closure-scoped)
        if (tremoloLfo) safeDisconnect([tremoloLfo, tremoloGain]); 
        if (fifthOsc) safeDisconnect([fifthOsc]);
        if (click) safeDisconnect([click, clickGain]);
        if (saturator) safeDisconnect([saturator]);
    };
}
