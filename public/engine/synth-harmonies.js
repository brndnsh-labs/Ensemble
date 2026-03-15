import { clampFreq, safeDisconnect } from '../utils.js';
import { createSimplePanner, killActiveVoices, rampGain } from './synth-utils.js';

/**
 * Polyphonic Synthesizer for the Harmony Module (harmony).
 * Optimized for Horns (stabs) and Strings (pads).
 */

/**
 * Stop any currently playing harmony notes.
 * @param {Object} state - Global ensemble state.
 * @param {number} fadeTime - Fade out time in seconds.
 */
export function killHarmonyNote(state, fadeTime = 0.05) {
    const { playback, harmony } = state;
    killActiveVoices(harmony.activeVoices, playback.audio.currentTime, fadeTime);
}

/**
 * Plays a harmony note with genre-specific synthesis and articulations.
 * @param {Object} state - Global ensemble state.
 */
export function playHarmonyNote(
    state,
    freq,
    time,
    duration,
    vol = 0.4,
    style = 'stabs',
    midi = null,
    slideInterval = 0,
    slideDuration = 0,
    vibrato = { rate: 0, depth: 0 },
) {
    const { playback, harmony, groove } = state;
    if (!Number.isFinite(freq) || !playback.audio) {
        return;
    }

    const now = playback.audio.currentTime;
    const playTime = Math.max(time, now);
    const feel = groove.genreFeel;

    if (!harmony.activeVoices) {
        harmony.activeVoices = []; // @direct-mutation
    }

    // 1. Strict Voice Management & Stealing
    // Remove expired voices
    harmony.activeVoices = harmony.activeVoices.filter((v) => v.time + v.duration + 0.1 > playTime); // @direct-mutation

    // Pitch-aware Stealing
    if (midi !== null) {
        const existing = harmony.activeVoices.find((v) => v.midi === midi);
        if (existing) {
            killActiveVoices([existing], playTime, 0.005);
            harmony.activeVoices = harmony.activeVoices.filter((v) => v !== existing); // @direct-mutation
        }
    }

    // Polyphonic Limit (Max 3 voices)
    if (harmony.activeVoices.length >= 3) {
        const oldest = harmony.activeVoices.shift();
        if (oldest) {
            killActiveVoices([oldest], playTime, 0.01);
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

    const voiceNodes = [gain, filter, panner, osc1, osc2];
    if (sub) {
        voiceNodes.push(sub);
    }

    let lfo = null;
    let lfoGain = null;
    let tremoloLfo = null;
    let tremoloGain = null;
    let fifthOsc = null;
    let click = null;
    let clickGain = null;
    let saturator = null;
    let subGain = null;
    let hp = null;

    if (style === 'organ') {
        const leslieSpeed = 6.2;
        saturator = playback.audio.createWaveShaper();
        saturator.curve = (() => {
            const n = 44100;
            const curve = new Float32Array(n);
            const k = 2;
            for (let i = 0; i < n; ++i) {
                const x = (i * 2) / n - 1;
                curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
            }
            return curve;
        })();
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
        tremoloGain = playback.audio.createGain();
        tremoloLfo.type = 'sine';
        tremoloLfo.frequency.setValueAtTime(leslieSpeed, playTime);
        const tremDepth = 0.2;
        tremoloGain.gain.setValueAtTime(1.0 - tremDepth, playTime);
        const tremAmp = playback.audio.createGain();
        tremAmp.gain.setValueAtTime(tremDepth, playTime);
        tremoloLfo.connect(tremAmp);
        tremAmp.connect(gain.gain);
        tremoloLfo.start(playTime);
        voiceNodes.push(tremoloLfo, tremoloGain, tremAmp);
    } else if (vibrato && vibrato.rate > 0 && vibrato.depth > 0) {
        lfo = playback.audio.createOscillator();
        lfoGain = playback.audio.createGain();
        lfo.frequency.setValueAtTime(vibrato.rate, playTime);
        lfoGain.gain.setValueAtTime(vibrato.depth, playTime);
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);
        if (sub) {
            lfoGain.connect(sub.frequency);
        }
        lfo.start(playTime);
        voiceNodes.push(lfo, lfoGain);
    }

    if (feel === 'Rock' || feel === 'Metal') {
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(15, playTime);
        if (sub) {
            sub.type = 'sawtooth';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else if (feel === 'Neo-Soul' || feel === 'Acoustic') {
        osc1.type = 'triangle';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(2, playTime);
        if (sub) {
            sub.type = 'triangle';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else if (style === 'organ') {
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 2, playTime);
        fifthOsc = playback.audio.createOscillator();
        fifthOsc.type = 'sine';
        fifthOsc.frequency.setValueAtTime(freq * 1.5, playTime);
        voiceNodes.push(fifthOsc);

        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
            subGain = playback.audio.createGain();
            subGain.gain.setValueAtTime(0.5, playTime);
            sub.connect(subGain);
            if (saturator) {
                subGain.connect(saturator);
            }
            voiceNodes.push(subGain);
        }

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
        voiceNodes.push(click, clickGain);

        if (saturator) {
            osc1.connect(saturator);
            osc2.connect(saturator);
            fifthOsc.connect(saturator);
            hp = playback.audio.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.setValueAtTime(120, playTime);
            saturator.connect(filter);
            filter.connect(hp);
            hp.connect(gain);
            voiceNodes.push(hp);
        } else {
            osc1.connect(filter);
            osc2.connect(filter);
            fifthOsc.connect(filter);
            filter.connect(gain);
        }

        fifthOsc.start(playTime);
        fifthOsc.stop(playTime + duration + 0.5);
        if (lfoGain) {
            lfoGain.connect(fifthOsc.frequency);
        }
    } else if (style === 'plucks') {
        osc1.type = 'sawtooth';
        osc2.type = 'square';
        osc2.detune.setValueAtTime(5, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else if (style === 'disco') {
        osc1.type = 'triangle';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(4, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else if (style === 'counter') {
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(4, playTime);
    } else if (style === 'stabs') {
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc2.detune.setValueAtTime(12, playTime);
        if (sub) {
            sub.type = 'triangle';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    } else {
        osc1.type = 'triangle';
        osc2.type = 'sawtooth';
        osc2.detune.setValueAtTime(8, playTime);
        if (sub) {
            sub.type = 'sine';
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }

    // Slides
    if (slideInterval !== 0 && slideDuration > 0) {
        const startFreq = freq * 2 ** (slideInterval / 12);
        osc1.frequency.setValueAtTime(startFreq, playTime);
        osc2.frequency.setValueAtTime(startFreq, playTime);
        if (sub) {
            sub.frequency.setValueAtTime(startFreq * 0.5, playTime);
        }
        osc1.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
        osc2.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
        if (sub) {
            sub.frequency.exponentialRampToValueAtTime(freq * 0.5, playTime + slideDuration);
        }
    } else {
        osc1.frequency.setValueAtTime(freq, playTime);
        osc2.frequency.setValueAtTime(freq, playTime);
        if (sub) {
            sub.frequency.setValueAtTime(freq * 0.5, playTime);
        }
    }

    // Bloom
    const intensity = playback.bandIntensity;
    const brightnessMult = 1.0 + intensity * 2.0;

    if (style === 'stabs') {
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
    } else if (style === 'disco') {
        filter.frequency.setValueAtTime(clampFreq(freq * 6), playTime);
        filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 2), playTime + 0.12);
        filter.Q.setValueAtTime(2 + intensity * 3, playTime);
    } else if (style === 'counter') {
        const start = freq * 1.5;
        const peak = freq * 3.0 * brightnessMult;
        filter.frequency.setValueAtTime(clampFreq(start), playTime);
        filter.frequency.linearRampToValueAtTime(clampFreq(peak), playTime + duration * 0.6);
        filter.Q.setValueAtTime(1.0, playTime);
    } else {
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

    // Envelope
    const isFastAttack = style === 'stabs' || style === 'plucks' || style === 'organ';
    const baseAttack = isFastAttack ? 0.01 : 0.2;
    const attack = Math.max(0.005, baseAttack - finalVol * 0.15);
    let release = 0.5;
    if (style === 'stabs') {
        release = 0.1;
    }
    if (style === 'plucks') {
        release = 0.02;
    }

    const detuneMult = 1.0 + finalVol * 0.5;
    osc2.detune.setValueAtTime((style === 'stabs' ? 12 : 8) * detuneMult, playTime);

    gain.gain.setValueAtTime(0, playTime);
    gain.gain.linearRampToValueAtTime(finalVol, playTime + attack);
    gain.gain.setTargetAtTime(0, playTime + duration - release, release);

    // Routing
    if (style !== 'organ') {
        osc1.connect(filter);
        osc2.connect(filter);
        if (sub) {
            sub.connect(filter);
        }
        filter.connect(gain);
    }

    gain.connect(panner);
    if (playback.harmoniesGain) {
        panner.connect(playback.harmoniesGain);
    }

    // Register active voice
    const voiceRefs = { gain, time: playTime, duration, midi, nodes: voiceNodes };
    harmony.activeVoices.push(voiceRefs);

    osc1.start(playTime);
    osc2.start(playTime);
    if (sub) {
        sub.start(playTime);
    }

    const stopTime = playTime + duration + 0.5;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    if (sub) {
        sub.stop(stopTime);
    }
    if (lfo) {
        lfo.stop(stopTime);
    }

    osc1.onended = () => safeDisconnect(voiceNodes);
}
