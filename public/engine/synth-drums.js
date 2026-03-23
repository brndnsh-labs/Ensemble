import { safeDisconnect } from '../utils.js';
import {
    createSimplePanner,
    duckGain,
    playPercussiveStrike,
    playResonantTone,
    rampGain,
    updateDensityDucking,
} from './synth-utils.js';

const RIGHT_PANNED_INSTRUMENTS = new Set([
    'HiHat',
    'Open',
    'Crash',
    'Shaker',
    'Agogo',
    'Perc',
    'Guiro',
    'Clave',
]);

/**
 * Stop any currently decaying drum sounds (specifically hat/ride).
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 */
export function killDrumNote(state) {
    const { playback, groove } = state;
    if (!playback.audio) {
        return;
    }
    if (groove.lastHatGain) {
        rampGain(groove.lastHatGain.gain, 0, playback.audio.currentTime, 0.005);
        groove.lastHatGain = null; // @direct-mutation
    }
    if (groove.lastRideGain) {
        rampGain(groove.lastRideGain.gain, 0, playback.audio.currentTime, 0.05);
        groove.lastRideGain = null; // @direct-mutation
    }
}

// Internal mix state for density-aware normalization
const mixState = {
    recentHits: 0,
    densityDuck: 1.0,
    lastTick: 0,
};

/**
 * Drum synthesis engine.
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {string} name - Drum instrument name.
 * @param {number} time - Start time in seconds.
 * @param {number} [velocity=1.0] - Note velocity (0.0 - 1.0).
 */
export function playDrumSound(state, name, time, velocity = 1.0) {
    const { playback, groove } = state;
    if (!name || !playback.audio) {
        return;
    }
    const now = playback.audio.currentTime;

    // --- Density Normalization Logic ---
    const densityDuck = updateDensityDucking(mixState, now, 18, 0.015);

    // Add a tiny 2ms buffer to ensure scheduling always happens slightly in the future
    const playTime = Math.max(time, now + 0.002);
    const humanizeFactor = (groove.humanize || 0) / 100;
    const velJitter = 1.0 + (Math.random() - 0.5) * (humanizeFactor * 0.4);

    // Apply the density ducking factor to the master drum volume
    const masterVol = velocity * 1.3 * velJitter * densityDuck;

    // --- Mix Separation: Stereo Panning ---
    let panValue = 0;
    if (RIGHT_PANNED_INSTRUMENTS.has(name)) {
        panValue = 0.35;
    } else if (name === 'Snare' || name === 'Sidestick') {
        panValue = -0.1;
    } else if (name.includes('Tom') || name.includes('Conga') || name.includes('Bongo')) {
        panValue = (Math.random() * 2 - 1) * 0.25;
    }
    const panner = createSimplePanner(playback.audio, panValue, playTime);
    if (playback.drumsGain) {
        panner.connect(playback.drumsGain);
    }

    // Round-robin variation (±1.5%)
    const rr = (amt = 0.03) => 1 + (Math.random() - 0.5) * amt;

    if (name === 'Kick') {
        const vol = masterVol * rr();

        // --- Sidechain Trigger ---
        if (playback.bassSidechain) {
            duckGain(playback.bassSidechain.gain, 0.45, playTime, 0.005, 0.12);
        }

        // 1. Beater Snap: Higher velocity = Sharper snap
        const beater = playback.audio.createOscillator();
        const beaterGain = playback.audio.createGain();
        beaterGain.gain.setValueAtTime(0, playTime);
        beater.type = 'sine';
        const snapFreq = (3000 + velocity * 1500) * rr();
        beater.frequency.setValueAtTime(snapFreq, playTime);
        beater.frequency.exponentialRampToValueAtTime(600, playTime + 0.005);
        beaterGain.gain.setTargetAtTime(vol * 0.4, playTime, 0.001);
        beaterGain.gain.setTargetAtTime(0, playTime + 0.005, 0.003);

        // 2. Head "Skin": Higher velocity = More high-frequency noise
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * 0.2,
            filterType: 'bandpass',
            freq: 1000 + velocity * 500,
            Q: 1.0,
            attack: 0.002,
            decay: 0.01,
            duration: 0.1,
        });

        // 3. The "Knock": Fundamental impact
        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: 180 * rr(),
            freqEnd: 60,
            rampDuration: 0.02,
            volume: vol * 1.3,
            attack: 0.001,
            decay: 0.03,
            duration: 0.2,
        });

        // 4. The "Shell": Deep resonance
        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: 52 * rr(),
            freqEnd: 52 * rr(),
            volume: vol * 1.0,
            attack: 0.005,
            decay: 0.07,
            duration: 0.5,
        });

        // Connections
        beater.connect(beaterGain);
        beaterGain.connect(panner);

        beater.start(playTime);
        beater.stop(playTime + 0.1);

        beater.onended = () => safeDisconnect([beater, beaterGain, panner]);
    } else if (name === 'Snare' || name === 'Sidestick') {
        const isSidestick = name === 'Sidestick';
        const vol = masterVol * rr() * (isSidestick ? 0.8 : 1.0);

        if (isSidestick) {
            playResonantTone(playback.audio, panner, playTime, {
                type: 'sine',
                freqStart: 6500 * rr(),
                volume: vol * 0.4,
                attack: 0.001,
                decay: 0.005,
                duration: 0.1,
            });

            playResonantTone(playback.audio, panner, playTime, {
                type: 'triangle',
                freqStart: 330 * rr(),
                freqEnd: 330 * rr() * 0.9,
                rampDuration: 0.1,
                volume: vol * 0.8,
                attack: 0.002,
                decay: 0.04,
                duration: 0.5,
            });

            playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
                volume: vol * 0.35,
                filterType: 'highpass',
                freq: 3500,
                attack: 0.002,
                decay: 0.02,
                duration: 0.5,
            });

            return;
        }

        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: 180 * rr(),
            volume: vol * 0.25,
            attack: 0.001,
            decay: 0.05,
            duration: 0.5,
        });

        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: 330 * rr(),
            volume: vol * 0.25,
            attack: 0.001,
            decay: 0.05,
            duration: 0.5,
        });

        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * (1.0 + velocity * 0.5),
            filterType: 'bandpass',
            freq: (1200 + velocity * 1500) * rr(),
            Q: 1.2,
            attack: 0.001,
            decay: 0.08,
            duration: 0.5,
        });
    } else if (name === 'HiHat' || name === 'Open' || name === 'Ride') {
        const isOpen = name === 'Open';
        const isRide = name === 'Ride';

        // Rebalanced multipliers for better kit presence
        // Old: Closed (0.7), Open (0.5)
        // New: Closed (0.85), Open (0.75), Ride (0.8)
        const vol = masterVol * (isOpen ? 0.75 : isRide ? 0.8 : 0.85) * rr();

        if (isRide) {
            if (groove.lastRideGain) {
                rampGain(groove.lastRideGain.gain, 0, playTime, 0.05);
            }
        } else if (groove.lastHatGain) {
            rampGain(groove.lastHatGain.gain, 0, playTime, 0.005);
        }

        if (!groove.audioBuffers.hihatMetal) {
            groove.audioBuffers.hihatMetal = createMetallicBuffer(playback.audio);
        }

        const source = playback.audio.createBufferSource();
        source.buffer = groove.audioBuffers.hihatMetal;
        source.playbackRate.value = isRide ? 0.6 * rr(0.05) : rr(0.05); // Ride is lower pitched

        const bpFilter = playback.audio.createBiquadFilter();
        bpFilter.type = 'bandpass';
        // Cap frequencies to prevent brittle/splashy high-end
        const bpFreq = Math.min(9200, (isRide ? 6000 : 8000) + velocity * 1500);
        bpFilter.frequency.setValueAtTime(bpFreq, playTime);
        bpFilter.Q.value = isRide ? 0.5 : 1.0;

        const hpFilter = playback.audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        const hpFreq = Math.min(5500, (isRide ? 3000 : 4500) + velocity * 500);
        hpFilter.frequency.setValueAtTime(hpFreq, playTime);

        const gain = playback.audio.createGain();
        gain.gain.setValueAtTime(0, playTime);

        if (isOpen) {
            gain.gain.setTargetAtTime(vol, playTime, 0.015);
            gain.gain.setTargetAtTime(0, playTime + 0.02, (0.35 + velocity * 0.1) * rr());
        } else if (isRide) {
            gain.gain.setTargetAtTime(vol, playTime, 0.005);
            // Tapered decay multiplier for high velocities to keep it focused
            const decayMult = velocity > 1.0 ? 0.12 : 0.2;
            gain.gain.setTargetAtTime(0, playTime + 0.05, (0.8 + velocity * decayMult) * rr());
        } else {
            gain.gain.setTargetAtTime(vol, playTime, 0.002);
            gain.gain.setTargetAtTime(0, playTime + 0.005, (0.05 + velocity * 0.02) * rr());
        }

        if (isRide) {
            groove.lastRideGain = gain; // @direct-mutation
        } else {
            groove.lastHatGain = gain; // @direct-mutation
        }

        source.connect(bpFilter);
        bpFilter.connect(hpFilter);
        hpFilter.connect(gain);
        gain.connect(panner);

        source.start(playTime);
        source.stop(playTime + (isOpen ? 2.0 : isRide ? 3.0 : 0.4));

        source.onended = () => {
            if (isRide) {
                if (groove.lastRideGain === gain) {
                    groove.lastRideGain = null; // @direct-mutation
                }
            } else if (groove.lastHatGain === gain) {
                groove.lastHatGain = null; // @direct-mutation
            }
            safeDisconnect([source, bpFilter, hpFilter, gain, panner]);
        };
    } else if (name === 'Crash') {
        const vol = masterVol * 0.85 * rr();
        const duration = 2.0 * rr();
        const baseFreq = 60 * rr();
        const ratios = [2.0, 3.0, 4.16, 5.43, 6.79, 8.21];

        const oscs = new Array(ratios.length);
        for (let i = 0; i < ratios.length; i++) {
            const o = playback.audio.createOscillator();
            o.type = 'square';
            o.frequency.setValueAtTime(baseFreq * ratios[i], playTime);
            oscs[i] = o;
        }

        const noise = playback.audio.createBufferSource();
        noise.buffer = groove.audioBuffers.noise;

        const hpFilter = playback.audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.setValueAtTime(6000, playTime);
        hpFilter.frequency.setTargetAtTime(1200, playTime, duration * 0.4);
        hpFilter.Q.value = 0.5;

        const gain = playback.audio.createGain();
        gain.gain.setValueAtTime(0, playTime);
        gain.gain.linearRampToValueAtTime(vol, playTime + 0.005);
        gain.gain.setTargetAtTime(vol * 0.15, playTime + 0.01, 0.02);
        gain.gain.setTargetAtTime(0, playTime + 0.08, duration * 0.2);

        const killTime = playTime + duration;
        gain.gain.setValueAtTime(0.001, killTime - 0.02);
        gain.gain.linearRampToValueAtTime(0, killTime);

        oscs.forEach((o) => {
            o.connect(hpFilter);
            o.start(playTime);
            o.stop(killTime + 0.1);
        });
        noise.connect(hpFilter);
        noise.start(playTime);
        noise.stop(killTime + 0.1);

        hpFilter.connect(gain);
        gain.connect(panner);

        oscs[0].onended = () => safeDisconnect([...oscs, noise, hpFilter, gain, panner]);
    } else if (name === 'Clave') {
        const vol = masterVol * 0.7 * rr();
        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: 2450 * rr(0.01),
            volume: vol,
            attack: 0.0005,
            decay: 0.008,
            duration: 0.1,
        });

        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * 0.4,
            filterType: 'highpass',
            freq: 5000,
            Q: 0.5,
            attack: 0.0005,
            decay: 0.003,
            duration: 0.1,
        });
    } else if (name.startsWith('Conga') || name.startsWith('Bongo')) {
        const isBongo = name.startsWith('Bongo');
        const isHigh = name.includes('High');
        const isSlap = name.includes('Slap');
        const isMute = name.includes('Mute');
        const baseFreq = isBongo ? (isHigh ? 420 : 280) : isHigh ? 210 : 155;
        const vol = masterVol * (isSlap ? 0.85 : 0.7) * rr();

        const decay = isMute ? 0.015 : isSlap ? 0.03 : 0.07;

        playResonantTone(playback.audio, panner, playTime, {
            type: isSlap ? 'triangle' : 'sine',
            freqStart: baseFreq * rr(0.01),
            freqEnd: baseFreq * 0.95,
            rampDuration: 0.05,
            volume: vol,
            attack: 0.002,
            decay: decay,
            duration: 0.3,
        });

        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: isSlap ? vol * 0.6 : vol * 0.25,
            filterType: 'bandpass',
            freq: isSlap ? 2500 : 800,
            Q: 1.0,
            attack: 0.001,
            decay: 0.015,
            duration: 0.3,
        });
    } else if (name.startsWith('Agogo') || name === 'Perc') {
        const isHigh = name.includes('High') || name === 'Perc';
        const vol = masterVol * 0.35 * rr();
        const freq = isHigh ? 1150 : 780;

        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: freq * rr(0.005),
            volume: vol,
            attack: 0.001,
            decay: 0.12,
            duration: 0.5,
        });

        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: freq * 1.492 * rr(0.005),
            volume: vol * 0.5,
            attack: 0.001,
            decay: 0.12,
            duration: 0.5,
        });

        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: freq,
            volume: vol * 0.5,
            attack: 0.002,
            decay: 0.04,
            duration: 0.5,
        });
    } else if (name === 'Guiro') {
        const vol = masterVol * 0.5 * rr();
        const noise = playback.audio.createBufferSource();
        noise.buffer = groove.audioBuffers.noise;
        noise.loop = true;
        const filter = playback.audio.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2500, playTime);
        filter.Q.value = 1.0;
        const gain = playback.audio.createGain();
        gain.gain.setValueAtTime(0, playTime);

        for (let i = 0; i < 4; i++) {
            const t = playTime + i * 0.035;
            gain.gain.setTargetAtTime(vol * (0.6 + i * 0.1), t, 0.005);
            gain.gain.setTargetAtTime(0, t + 0.015, 0.01);
        }
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        noise.start(playTime);
        noise.stop(playTime + 0.2);
        noise.onended = () => safeDisconnect([noise, filter, gain, panner]);
    } else if (name === 'Shaker') {
        const vol = masterVol * 0.45 * rr();
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol,
            filterType: 'highpass',
            freq: 6000,
            attack: 0.01,
            decay: 0.05,
            duration: 0.2,
        });
    } else if (name.includes('Tom')) {
        const vol = masterVol * 0.8 * rr();
        const isHigh = name.includes('High');
        const isMid = name.includes('Mid');
        const freq = isHigh ? 180 : isMid ? 135 : 90;

        // 1. Stick Impact (The "Thwack")
        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: freq * (3.0 + velocity * 2.0) * rr(),
            freqEnd: freq,
            rampDuration: 0.015,
            volume: vol * 0.4,
            attack: 0.001,
            decay: 0.01,
            duration: 0.1,
        });

        // 2. Head "Skin" Noise
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * 0.25 * velocity,
            filterType: 'bandpass',
            freq: freq * 10,
            Q: 1.5,
            attack: 0.002,
            decay: 0.02,
            duration: 0.2,
        });

        // 3. Resonant Body
        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: freq * 1.15 * rr(),
            freqEnd: freq,
            rampDuration: 0.05,
            volume: vol * 1.1,
            attack: 0.002,
            decay: 0.15,
            duration: 0.5,
        });

        // 4. Shell Resonance
        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: freq * rr(0.01),
            volume: vol * 0.8,
            attack: 0.01,
            decay: 0.4 * rr(),
            duration: 1.5,
        });
    }
}

/**
 * @param {AudioContext} audioCtx
 * @returns {AudioBuffer}
 */
function createMetallicBuffer(audioCtx) {
    const duration = 2.0;
    const sampleRate = audioCtx.sampleRate;
    const length = sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
    const baseFreq = 40;

    for (let i = 0; i < length; i++) {
        let sample = 0;
        const t = i / sampleRate;
        for (const r of ratios) {
            const freq = baseFreq * r;
            const phase = (t * freq) % 1;
            sample += phase < 0.5 ? 1 : -1;
        }
        data[i] = sample / ratios.length;
    }
    return buffer;
}
