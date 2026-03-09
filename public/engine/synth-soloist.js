import { STYLE_CONFIG } from '../soloist-config.js';
import { getState } from '../state.js';
import { clampFreq, safeDisconnect } from '../utils.js';

export function killSoloistNote() {
    const { playback, soloist } = getState();
    if (soloist.activeVoices && soloist.activeVoices.length > 0) {
        const now = playback.audio.currentTime;
        soloist.activeVoices.forEach((v) => {
            try {
                v.gain.gain.cancelScheduledValues(now);
                v.gain.gain.setTargetAtTime(0, now, 0.01);
                v.nodes.forEach((node) => {
                    try {
                        if (node.stop) {
                            node.stop(now + 0.05);
                        }
                    } catch {
                        /* ignore cleanup errors */
                    }
                });
            } catch {
                /* ignore cleanup errors */
            }
        });
        soloist.activeVoices = [];
    }
}

/**
 * Main entry point for playing a soloist note.
 * Orchestrates voice management, preset selection, and common DSP.
 */
export function playSoloNote(
    freq,
    time,
    duration,
    vol,
    bendStartInterval = 0,
    style = 'scalar',
    isLegato = false,
    vibrato = false,
) {
    const { playback, soloist } = getState();
    if (!Number.isFinite(freq)) {
        return;
    }

    const preset = soloist.preset || 'trumpet';
    const ctx = playback.audio;
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

    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (ctx.createStereoPanner) {
        pan.pan.setValueAtTime((Math.random() * 2 - 1) * 0.05, playTime);
    }

    // Common output chain
    gain.connect(pan);
    pan.connect(playback.soloistGain);

    const voiceObj = { gain, time: playTime, duration, nodes: [], cleanup: [gain, pan] };

    // Retrieve last frequency for portamento
    // Use an explicit 0 check to ensure we don't glide from sub-audio frequencies
    const prevFreq = soloist.lastRenderedFreq || freq;
    soloist.lastRenderedFreq = freq; // @direct-mutation

    const args = [
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
    ];

    switch (preset) {
        case 'neo':
            playNeoJuno(...args);
            break;
        case 'vowel':
            playVowel(...args);
            break;
        case 'trumpet':
            playTrumpet(...args);
            break;
        case 'saxophone':
            playSaxophone(...args);
            break;
        case 'shred':
            playShred(...args);
            break;
        case 'classic':
            playClassic(...args);
            break;
        default:
            playNeoJuno(...args);
            break;
    }

    soloist.activeVoices.push(voiceObj); // @direct-mutation
}

function manageVoices(playTime, soloist) {
    if (!soloist.activeVoices) {
        soloist.activeVoices = [];
    }

    // Clean up finished voices
    soloist.activeVoices = soloist.activeVoices.filter((v) => v.time + v.duration + 1.0 > playTime);

    const VOICE_LIMIT = soloist.mode === 'piano' ? 4 : soloist.mode === 'guitar' ? 2 : 1;

    // Check if the current note is part of the same "simultaneous" attack (polyphonic cluster)
    // We allow multiple voices for the exact same start time (within a tiny jitter margin)
    const isPolyphonicCluster =
        soloist.activeVoices.length > 0 &&
        Math.abs(playTime - soloist.activeVoices[soloist.activeVoices.length - 1].time) < 0.002;

    if (!isPolyphonicCluster && soloist.activeVoices.length >= VOICE_LIMIT) {
        // Only kill enough voices to stay under the limit for the NEW gesture
        const voicesToKill = soloist.activeVoices.length - VOICE_LIMIT + 1;
        for (let i = 0; i < voicesToKill; i++) {
            const oldest = soloist.activeVoices.shift();
            if (oldest) {
                try {
                    oldest.gain.gain.cancelScheduledValues(playTime);
                    oldest.gain.gain.setTargetAtTime(0, playTime, 0.01);
                    if (oldest.nodes) {
                        oldest.nodes.forEach((node) => {
                            try {
                                if (node.stop) {
                                    node.stop(playTime + 0.05);
                                }
                            } catch {
                                /* ignore cleanup errors */
                            }
                        });
                    }
                } catch {
                    /* ignore cleanup errors */
                }
            }
        }
    }
}

// --- PRESET IMPLEMENTATIONS ---

function playTrumpet(
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
    const { soloist } = getState();

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';

    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.detune.value = 5; // Slight detune for thickness

    voiceObj.nodes.push(osc1, osc2);

    applyPitchEnvelope(
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
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        vibrato.connect(vibGain);
        vibGain.connect(osc1.frequency);
        vibGain.connect(osc2.frequency);
        voiceObj.nodes.push(vibrato);
        voiceObj.cleanup.push(vibGain);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    // Brass swell - slower, warmer bloom
    filter.frequency.setValueAtTime(clampFreq(freq * 1.2), playTime);
    filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 4.0), playTime + 0.08);
    filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 2.5), playTime + 0.15);

    filter.Q.value = 0.8; // Lower resonance to avoid synth-brass tone

    voiceObj.cleanup.push(filter);

    // Formant/Bell filter
    const bellFilter = ctx.createBiquadFilter();
    bellFilter.type = 'peaking';
    bellFilter.frequency.value = 1200; // Typical trumpet bell resonance
    bellFilter.Q.value = 1.5;
    bellFilter.gain.value = 4; // Slight boost for presence

    voiceObj.cleanup.push(bellFilter);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(bellFilter);
    bellFilter.connect(outputGain);

    const attack = isLegato ? 0.005 : 0.02;

    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 1.2, playTime, attack); // slightly boosted to cut through
    outputGain.gain.setTargetAtTime(vol * 0.9, playTime + 0.1, 0.05); // decay to sustain
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.85, 0.1); // release

    osc1.start(playTime);
    osc2.start(playTime);

    const stopTime = playTime + duration + 0.2;
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    osc1.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
}

function playSaxophone(
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
    const { soloist } = getState();

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.detune.value = -7; // Beating effect for reedy character

    voiceObj.nodes.push(osc1, osc2);

    applyPitchEnvelope(
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
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        vibrato.connect(vibGain);
        vibGain.connect(osc1.frequency);
        vibGain.connect(osc2.frequency);
        voiceObj.nodes.push(vibrato);
        voiceObj.cleanup.push(vibGain);
    }

    // Parallel Formant Filters (Alto Sax Core)
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 900; // Alto core
    f1.Q.value = 3.0;

    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 2400; // Reedy bite
    f2.Q.value = 4.0;

    voiceObj.cleanup.push(f1, f2);

    // Breath Liveness (Subtle Gain LFO)
    const breathLfo = ctx.createOscillator();
    breathLfo.frequency.value = 3.5; // Natural breath fluctuation
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.05; // Subtle amplitude modulation

    // We need a base gain to modulate
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1.0;

    breathLfo.connect(breathGain);
    breathGain.connect(masterGain.gain);

    voiceObj.nodes.push(breathLfo);
    voiceObj.cleanup.push(breathGain, masterGain);

    osc1.connect(f1);
    osc2.connect(f1);
    osc1.connect(f2);
    osc2.connect(f2);

    f1.connect(masterGain);
    f2.connect(masterGain);
    masterGain.connect(outputGain);

    const attack = isLegato ? 0.008 : 0.04;

    outputGain.gain.setValueAtTime(0, playTime);
    // Parallel bandpass + higher Q needs more boost to match other presets
    outputGain.gain.setTargetAtTime(vol * 2.9, playTime, attack);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.85, 0.1); // release

    osc1.start(playTime);
    osc2.start(playTime);
    breathLfo.start(playTime);

    const stopTime = playTime + duration + 0.2;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    breathLfo.stop(stopTime);

    osc1.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
}

function playClassic(
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
    const { playback, soloist } = getState();
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
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        vibrato.connect(vibGain);
        vibGain.connect(osc1.frequency);
        vibGain.connect(osc2.frequency);
        voiceObj.nodes.push(vibrato);
        voiceObj.cleanup.push(vibGain);
    }

    // Filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const brightnessBase = 1.0 + intensity * 1.5 + vol * 1.5;
    const cutoffBase =
        style === 'bird' ? freq * 3.5 * brightnessBase : Math.min(freq * 4 * brightnessBase, 12000);

    // Guitar Palm Mute Layer (Low velocity = Muted/Snappy)
    const muteThreshold = intensity < 0.4 ? 0.7 : 0.55;
    const isMuted = soloist.mode === 'guitar' && vol < muteThreshold;
    const isPiano = soloist.mode === 'piano';

    filter.frequency.setValueAtTime(clampFreq(cutoffBase), playTime);
    if (isMuted) {
        // Snappy filter decay for palm mutes
        filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 1.5), playTime + 0.08);
        filter.Q.value = 4; // More 'pop'
    } else {
        filter.frequency.exponentialRampToValueAtTime(
            clampFreq(cutoffBase * (style === 'bird' ? 0.7 : 0.6)),
            playTime + duration,
        );
        filter.Q.value = isPiano ? 0.7 : style === 'bird' ? 1.5 : duration > 0.4 ? 2 : 1;
    }

    voiceObj.cleanup.push(filter);

    // Envelope
    const baseAttack = style === 'shred' ? 0.005 : 0.015;
    const attack = isLegato ? 0.005 : Math.min(baseAttack, duration * 0.25);
    let releaseTime = duration * (style === 'minimal' ? 1.5 : 1.1);

    if (isMuted) {
        outputGain.gain.setValueAtTime(0, playTime);
        outputGain.gain.setTargetAtTime(randomizedVol, playTime, 0.005); // Faster snap
        outputGain.gain.setTargetAtTime(0, playTime + 0.05, 0.02); // Short decay
        releaseTime = 0.12;
    } else if (isPiano && (vol < 0.5 || duration > 0.6)) {
        // Piano Sustain Pedal Emulation (Longer release for soft notes or long notes)
        outputGain.gain.setValueAtTime(0, playTime);
        outputGain.gain.setTargetAtTime(randomizedVol, playTime, attack);
        const sustainDecay = Math.max(0.1, randomizedVol * 0.2);
        outputGain.gain.setTargetAtTime(sustainDecay, playTime + 0.1, 0.1); // Natural string decay
        outputGain.gain.setTargetAtTime(0, playTime + duration * 0.95, 0.3); // Slower release
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

    osc1.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
}

function playNeoJuno(
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
    const { soloist } = getState();
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

    applyPitchEnvelope(
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
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        vibrato.connect(vibGain);
        vibGain.connect(osc1.frequency);
        vibGain.connect(osc2.frequency);
        voiceObj.nodes.push(vibrato);
        voiceObj.cleanup.push(vibGain);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(clampFreq(freq * 3), playTime);
    filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 1.5), playTime + duration);
    filter.Q.value = 1.0;

    voiceObj.cleanup.push(filter);

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

    osc1.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
}

function playVowel(
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
    const { soloist } = getState();
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.detune.value = 4;

    voiceObj.nodes.push(osc1, osc2);

    applyPitchEnvelope(
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
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        vibrato.connect(vibGain);
        vibGain.connect(osc1.frequency);
        vibGain.connect(osc2.frequency);
        voiceObj.nodes.push(vibrato);
        voiceObj.cleanup.push(vibGain);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, playTime);
    filter.frequency.exponentialRampToValueAtTime(1200, playTime + 0.1);
    filter.frequency.exponentialRampToValueAtTime(800, playTime + duration);
    filter.Q.value = 5.0;

    voiceObj.cleanup.push(filter);

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

    osc1.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
}

function playShred(
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
    const { soloist } = getState();
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.detune.value = 12;

    voiceObj.nodes.push(osc1, osc2);

    applyPitchEnvelope(
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
            ctx,
            freq,
            playTime,
            duration,
            style,
            vibratoFlag,
        );
        vibrato.connect(vibGain);
        vibGain.connect(osc1.frequency);
        vibGain.connect(osc2.frequency);
        voiceObj.nodes.push(vibrato);
        voiceObj.cleanup.push(vibGain);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(clampFreq(freq * 6), playTime);
    filter.Q.value = 2.0;

    voiceObj.cleanup.push(filter);

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

    osc1.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
}

function applyPitchEnvelope(
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
    const { soloist } = getState();
    if (isPiano) {
        osc1.frequency.setValueAtTime(freq, playTime);
        osc2.frequency.setValueAtTime(freq, playTime);
        return;
    }

    const startFreq = bendStartInterval !== 0 ? freq * 2 ** (bendStartInterval / 12) : freq;

    if (isLegato && Math.abs(freq - prevFreq) < freq * 0.5) {
        // Portamento for legato
        const glideTime = soloist.mode === 'guitar' ? 0.03 : 0.06;
        osc1.frequency.setValueAtTime(prevFreq, playTime);
        osc2.frequency.setValueAtTime(prevFreq, playTime);
        osc1.frequency.exponentialRampToValueAtTime(freq, playTime + glideTime);
        osc2.frequency.exponentialRampToValueAtTime(freq, playTime + glideTime);
    } else if (bendStartInterval !== 0) {
        // Pitch Scoop/Bend
        osc1.frequency.setValueAtTime(startFreq, playTime);
        osc2.frequency.setValueAtTime(startFreq, playTime);
        const rampTime = Math.min(0.1, duration * 0.5);
        osc1.frequency.exponentialRampToValueAtTime(freq, playTime + rampTime);
        osc2.frequency.exponentialRampToValueAtTime(freq, playTime + rampTime);
    } else {
        // Standard attack
        osc1.frequency.setValueAtTime(freq, playTime);
        osc2.frequency.setValueAtTime(freq, playTime);
    }
}

function createVibrato(ctx, freq, time, duration, style, forceVibrato = false) {
    const { soloist, playback } = getState();
    const config = STYLE_CONFIG[style] || STYLE_CONFIG.scalar;
    const intensity = playback.bandIntensity || 0.5;
    const vibrato = ctx.createOscillator();

    const bps = (playback.bpm || 120) / 60;
    // Find best rhythmic subdivision (2, 3, or 4 cycles per beat) to stay in natural range
    let vibSpeed = bps * 3;
    if (vibSpeed > 7.5) {
        vibSpeed = bps * 2;
    } else if (vibSpeed < 4.5) {
        vibSpeed = bps * 4;
    }

    // --- Humanization & Intensity Scaling ---
    // 1. Add slight "jitter" so it isn't perfectly on the grid (+/- 3%)
    const jitter = 1.0 + (Math.random() * 0.06 - 0.03);
    vibSpeed *= jitter;

    // 2. Speed pushes slightly with intensity (+10% max)
    vibSpeed *= 1.0 + intensity * 0.1;

    // Style-based adjustments (relative nudge)
    if (style === 'blues') {
        vibSpeed -= 0.5;
    } else if (style === 'neo') {
        vibSpeed -= 0.8;
    } else if (style === 'shred') {
        vibSpeed += 1.2;
    }

    let depthFactor = 0.008; // Base for Rock/Scalar (Increased from 0.005)
    // Base depth offsets
    if (style === 'blues') {
        depthFactor = 0.012;
    } else if (style === 'neo') {
        depthFactor = 0.015;
    } else if (style === 'shred') {
        depthFactor = 0.004;
    }

    // Profile-specific rock boosts
    const profile = soloist.phraseContext?.profile;
    if (profile === 'gilmour') {
        depthFactor *= 1.3; // Lyrical singing leads
    } else if (profile === 'slash') {
        depthFactor *= 1.4; // Aggressive wide vibrato
    }

    // Apply multiplier from config if present
    if (config.vibratoIntensity !== undefined) {
        depthFactor *= config.vibratoIntensity;
    }

    // Explicitly boost depth for strategic holds
    if (forceVibrato) {
        depthFactor *= 1.5;
    }

    // Mode-specific differentiation (Lead Synth/Horn/Guitar feel)
    if (soloist.mode === 'monophonic') {
        vibSpeed -= 0.5; // Slightly slower, more deliberate
        depthFactor *= 1.2; // Slightly deeper
    } else if (soloist.mode === 'guitar') {
        vibSpeed += 0.4; // Finger vibrato is often a bit faster
        depthFactor *= 1.5; // And very expressive
    }

    vibrato.frequency.setValueAtTime(vibSpeed, time);

    const vibGain = ctx.createGain();
    const isLongNote = duration > 0.4 || forceVibrato;

    // Faster "Bloom" (Entry timing)
    const vibDelay = forceVibrato ? 0.08 : 0.12 + Math.random() * 0.08;
    const finalVibDepth = freq * (isLongNote ? depthFactor : depthFactor * 0.45);

    vibGain.gain.setValueAtTime(0, time);
    vibGain.gain.setValueAtTime(0, time + vibDelay);
    // Smoothly ramp in the vibrato - faster ramp duration
    vibGain.gain.exponentialRampToValueAtTime(
        Math.max(0.001, finalVibDepth),
        time + vibDelay + (isLongNote ? 0.35 : 0.18),
    );

    // CENTRALIZED LIFECYCLE: Auto-start LFO if within musical bounds
    if ((duration > 0.15 || forceVibrato) && soloist.mode !== 'piano') {
        vibrato.start(time);
        vibrato.stop(time + duration + 0.2);
    }

    return { vibrato, vibGain };
}
