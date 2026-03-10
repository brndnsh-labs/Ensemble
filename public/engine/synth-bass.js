import { getState } from '../state.js';
import { createSoftClipCurve, safeDisconnect } from '../utils.js';
import { rampGain, updateDensityDucking } from './synth-utils.js';

export function killBassNote() {
    const { playback, bass } = getState();
    if (bass.lastBassGain) {
        rampGain(bass.lastBassGain.gain, 0, playback.audio.currentTime, 0.005);
        bass.lastBassGain = null;
    }
}

// Internal mix state for density-aware normalization
const mixState = {
    recentHits: 0,
    densityDuck: 1.0,
    lastTick: 0,
};

/**
 * P-Bass Synthesis: Layered physical model
 * 1. Thump: Triangle fundamental + Passive Pickup Warmth (WaveShaper)
 * 2. Growl: Sawtooth character + 12dB/oct LPF
 * 3. Impact: Sine 'Click' transient
 */
export function playBassNote(freq, time, duration, velocity = 1.0, muted = false) {
    const { playback, bass, groove } = getState();
    if (!Number.isFinite(freq) || !Number.isFinite(time) || !Number.isFinite(duration)) {
        return;
    }
    if (freq < 10 || freq > 24000) {
        return;
    }
    try {
        const now = playback.audio.currentTime;
        const startTime = Math.max(time, now);

        // --- Density Normalization Logic ---
        const densityDuck = updateDensityDucking(mixState, now, 4, 0.02);

        // Square-root compression for even volume, Motown usually has a very consistent level
        const vol = 1.0 * Math.sqrt(velocity) * densityDuck * (0.95 + Math.random() * 0.1);
        if (vol < 0.005) {
            return;
        }

        const tonalVol = muted ? vol * 0.15 : vol;

        // --- 1. The Thump (Fundamental + Passive Saturation) ---
        const oscSine = playback.audio.createOscillator();
        oscSine.type = 'sine';
        oscSine.frequency.setValueAtTime(freq, startTime);

        const oscTri = playback.audio.createOscillator();
        oscTri.type = 'triangle';
        oscTri.frequency.setValueAtTime(freq, startTime);

        const bodyMix = playback.audio.createGain();
        oscSine.connect(bodyMix);
        oscTri.connect(bodyMix);
        bodyMix.gain.setValueAtTime(0.8, startTime);

        const saturator = playback.audio.createWaveShaper();
        saturator.curve = createSoftClipCurve();
        saturator.oversample = '4x';

        // --- 2. The Growl (Flatwound Roll-off) ---
        const oscGrowl = playback.audio.createOscillator();
        oscGrowl.type = 'sawtooth';
        oscGrowl.frequency.setValueAtTime(freq, startTime);

        const lp1 = playback.audio.createBiquadFilter();
        const lp2 = playback.audio.createBiquadFilter();
        lp1.type = lp2.type = 'lowpass';

        const midi = 12 * Math.log2(freq / 440) + 69;
        const growlBase = 200 + midi * 5 + playback.bandIntensity * 400;
        const growlDepth = 1200 * (0.5 + playback.bandIntensity * 1.0);
        const cutoff = muted ? 300 : growlBase + vol * growlDepth;

        lp1.frequency.setValueAtTime(cutoff, startTime);
        lp2.frequency.setValueAtTime(cutoff, startTime);
        lp1.Q.setValueAtTime(1.0, startTime);
        lp2.Q.setValueAtTime(1.0, startTime);

        const growlGain = playback.audio.createGain();
        growlGain.gain.setValueAtTime(0, startTime);
        growlGain.gain.setTargetAtTime(tonalVol * 0.35, startTime, 0.005);

        // --- 3. The Impact (Finger Thud) ---
        const impact = playback.audio.createBufferSource();
        impact.buffer = groove.audioBuffers.noise;
        const impactFilter = playback.audio.createBiquadFilter();
        impactFilter.type = 'bandpass';
        impactFilter.frequency.setValueAtTime(600, startTime);
        impactFilter.Q.setValueAtTime(2.0, startTime);

        const impactGain = playback.audio.createGain();
        impactGain.gain.setValueAtTime(0, startTime);
        impactGain.gain.setTargetAtTime(vol * 0.4, startTime, 0.001);
        impactGain.gain.setTargetAtTime(0, startTime + 0.015, 0.02);

        // --- 4. Articulation (Body Resonance) ---
        const bodyEQ = playback.audio.createBiquadFilter();
        bodyEQ.type = 'peaking';
        bodyEQ.frequency.setValueAtTime(120, startTime);
        bodyEQ.Q.setValueAtTime(0.8, startTime);
        bodyEQ.gain.setValueAtTime(4, startTime);

        // --- 5. Global Envelope (The "Foam Mute" Feel) ---
        const mainGain = playback.audio.createGain();
        mainGain.gain.setValueAtTime(0, startTime);
        mainGain.gain.setTargetAtTime(tonalVol, startTime, 0.008);

        const releaseTime = muted ? 0.015 : duration;

        if (!muted) {
            mainGain.gain.setTargetAtTime(tonalVol * 0.5, startTime + 0.015, 0.06);
            mainGain.gain.setTargetAtTime(tonalVol * 0.2, startTime + 0.08, 0.6);
            mainGain.gain.setTargetAtTime(0, startTime + releaseTime, 0.08);
        } else {
            mainGain.gain.setTargetAtTime(0, startTime + releaseTime, 0.01);
        }

        // --- Connections ---
        bodyMix.connect(saturator);
        saturator.connect(mainGain);

        oscGrowl.connect(lp1);
        lp1.connect(lp2);
        lp2.connect(growlGain);
        growlGain.connect(mainGain);

        impact.connect(impactFilter);
        impactFilter.connect(impactGain);
        impactGain.connect(mainGain);

        mainGain.connect(bodyEQ);
        bodyEQ.connect(playback.bassGain);

        // Monophonic Note-Offs
        if (bass.lastBassGain && bass.lastBassGain !== mainGain) {
            rampGain(bass.lastBassGain.gain, 0, startTime, 0.005);
        }
        bass.lastBassGain = mainGain;

        oscSine.start(startTime);
        oscTri.start(startTime);
        oscGrowl.start(startTime);
        impact.start(startTime);

        const stopTime = startTime + releaseTime + 1.0;
        oscSine.stop(stopTime);
        oscTri.stop(stopTime);
        oscGrowl.stop(stopTime);
        impact.stop(startTime + 0.1);

        oscSine.onended = () =>
            safeDisconnect([
                oscSine,
                oscTri,
                bodyMix,
                saturator,
                oscGrowl,
                lp1,
                lp2,
                growlGain,
                impact,
                impactFilter,
                impactGain,
                mainGain,
                bodyEQ,
            ]);
    } catch (e) {
        console.error('playBassNote error:', e, { freq, time, duration });
    }
}
