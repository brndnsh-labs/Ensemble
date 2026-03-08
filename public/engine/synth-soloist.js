import { STYLE_CONFIG } from '../soloist-config.js';
import { getState } from '../state.js';
import { clampFreq, safeDisconnect } from '../utils.js';

export function killSoloistNote() {
    const { playback, soloist } = getState();
    if (soloist.activeVoices && soloist.activeVoices.length > 0) {
        soloist.activeVoices.forEach((voice) => {
            try {
                // Cancel gain AND frequency ramps to prevent pitch artifacts
                if (voice.gain?.gain) {
                    voice.gain.gain.cancelScheduledValues(playback.audio.currentTime);
                    voice.gain.gain.setTargetAtTime(0, playback.audio.currentTime, 0.01);
                }

                if (voice.nodes) {
                    voice.nodes.forEach((node) => {
                        try {
                            if (node.frequency) {
                                node.frequency.cancelScheduledValues(playback.audio.currentTime);
                            }
                            if (node.detune) {
                                node.detune.cancelScheduledValues(playback.audio.currentTime);
                            }
                            // Stop if it's a source node
                            if (node.stop) {
                                node.stop(playback.audio.currentTime + 0.02);
                            }
                        } catch {
                            /* ignore */
                        }
                    });
                }
            } catch {
                /* ignore error */
            }
        });
        soloist.activeVoices = []; // @direct-mutation
    }
}

/**
 * Main entry point for playing a soloist note.
 */
export function playSoloNote(
    freq,
    time,
    duration,
    vol = 0.4,
    bendStartInterval = 0,
    style = 'scalar',
    isLegato = false,
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
            `[Soloist Debug] playSoloNote: freq=${freq.toFixed(2)}, vol=${vol.toFixed(2)}, duration=${duration.toFixed(2)}s, preset=${preset}`,
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

    switch (preset) {
        case 'neo':
            playNeoJuno(
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
            );
            break;
        case 'vowel':
            playVowel(
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
            );
            break;
        case 'trumpet':
            playTrumpet(
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
            );
            break;
        case 'saxophone':
            playSaxophone(
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
            );
            break;
        default:
            playClassic(
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
            );
            break;
    }

    soloist.activeVoices.push(voiceObj);
}

function manageVoices(playTime, soloist) {
    if (!soloist.activeVoices) {
        soloist.activeVoices = [];
    }

    // Clean up finished voices
    soloist.activeVoices = soloist.activeVoices.filter((v) => v.time + v.duration + 1.0 > playTime);

    const VOICE_LIMIT = soloist.mode !== 'monophonic' ? 2 : 1;
    const isNewGesture =
        soloist.activeVoices.length > 0 &&
        Math.abs(playTime - soloist.activeVoices[soloist.activeVoices.length - 1].time) > 0.001;

    if (isNewGesture || soloist.activeVoices.length >= VOICE_LIMIT) {
        const voicesToKill = isNewGesture
            ? soloist.activeVoices.length
            : soloist.activeVoices.length - VOICE_LIMIT + 1;
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
        const { vibrato, vibGain } = createVibrato(ctx, freq, playTime, duration, style);
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

    // Only apply vibrato if note is long enough
    if (duration > 0.15 && soloist.mode !== 'piano') {
        const vibrato = voiceObj.nodes.find((n) => n.frequency && n.frequency.value < 20); // Find LFO
        if (vibrato) {
            vibrato.start(playTime);
            vibrato.stop(stopTime);
        }
    }

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
        const { vibrato, vibGain } = createVibrato(ctx, freq, playTime, duration, style);
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

    // Only apply vibrato if note is long enough
    if (duration > 0.15 && soloist.mode !== 'piano') {
        const vibrato = voiceObj.nodes.find((n) => n.frequency && n.frequency.value < 20); // Find LFO
        if (vibrato) {
            vibrato.start(playTime);
            vibrato.stop(stopTime);
        }
    }

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
        const { vibrato, vibGain } = createVibrato(ctx, freq, playTime, duration, style);
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

    // Only apply vibrato if note is long enough
    if (duration > 0.15 && soloist.mode !== 'piano') {
        const vibrato = voiceObj.nodes.find((n) => n.frequency && n.frequency.value < 20); // Find LFO
        if (vibrato) {
            vibrato.start(playTime);
            vibrato.stop(stopTime);
        }
    }

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
) {
    const { soloist } = getState();
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth'; // Rich harmonics for filtering

    applyPitchEnvelope(
        osc,
        null,
        freq,
        playTime,
        duration,
        bendStartInterval,
        style,
        isLegato,
        prevFreq,
        soloist.mode === 'piano',
    );
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

function applyPitchEnvelope(
    osc1,
    osc2,
    freq,
    time,
    duration,
    bendInterval,
    style,
    isLegato,
    prevFreq,
    isPiano = false,
) {
    if (isPiano) {
        // Strict pitch for piano
        if (osc1) {
            osc1.frequency.setValueAtTime(freq, time);
        }
        if (osc2) {
            osc2.frequency.setValueAtTime(freq, time);
        }
        return;
    }

    if (isLegato && prevFreq) {
        // Portamento Glide - Smoother for monophonic lead mode
        const { soloist } = getState();
        // Guitar hammer-ons/pull-offs are faster (0.03s), synths slightly slower
        const glideTime =
            soloist.mode === 'monophonic' ? 0.06 : soloist.mode === 'guitar' ? 0.03 : 0.04;

        if (osc1) {
            osc1.frequency.setValueAtTime(prevFreq, time);
            osc1.frequency.exponentialRampToValueAtTime(freq, time + glideTime);
        }
        if (osc2) {
            osc2.frequency.setValueAtTime(prevFreq, time);
            osc2.frequency.exponentialRampToValueAtTime(freq, time + glideTime);
        }
    } else if (bendInterval !== 0) {
        const startFreq = freq * 2 ** (-bendInterval / 12);
        let bendDuration = 0.1;
        if (style === 'blues') {
            bendDuration = 0.15;
        } else if (style === 'bird') {
            bendDuration = 0.05;
        } else if (style === 'minimal') {
            bendDuration = 0.25;
        }

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
    const { soloist, playback } = getState();
    const config = STYLE_CONFIG[style] || STYLE_CONFIG.scalar;
    const vibrato = ctx.createOscillator();

    const bps = (playback.bpm || 120) / 60;
    // Find best rhythmic subdivision (2, 3, or 4 cycles per beat) to stay in natural range
    let vibSpeed = bps * 3;
    if (vibSpeed > 7.5) {
        vibSpeed = bps * 2;
    } else if (vibSpeed < 4.5) {
        vibSpeed = bps * 4;
    }

    // Style-based adjustments (relative nudge)
    if (style === 'blues') {
        vibSpeed -= 0.5;
    } else if (style === 'neo') {
        vibSpeed -= 0.8;
    } else if (style === 'shred') {
        vibSpeed += 1.2;
    }

    let depthFactor = 0.005;
    // Base depth offsets
    if (style === 'blues') {
        depthFactor = 0.012;
    } else if (style === 'neo') {
        depthFactor = 0.015;
    } else if (style === 'shred') {
        depthFactor = 0.004;
    }

    // Apply multiplier from config if present
    if (config.vibratoIntensity !== undefined) {
        depthFactor *= config.vibratoIntensity;
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
    const isLongNote = duration > 0.4;
    const vibDelay = 0.15 + Math.random() * 0.1;
    const finalVibDepth = freq * (isLongNote ? depthFactor : depthFactor * 0.3);

    vibGain.gain.setValueAtTime(0, time);
    vibGain.gain.setValueAtTime(0, time + vibDelay);
    // Smoothly ramp in the vibrato
    vibGain.gain.exponentialRampToValueAtTime(
        Math.max(0.001, finalVibDepth),
        time + vibDelay + (isLongNote ? 0.5 : 0.2),
    );

    return { vibrato, vibGain };
}
