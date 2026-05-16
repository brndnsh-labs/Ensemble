import type { EnsembleState, Mutable } from '../types.js';
import { createSoftClipCurve, safeDisconnect } from '../utils.js';
import { playPercussiveStrike, rampGain, updateDensityDucking } from './synth-utils.js';

export function killBassNote(state: EnsembleState): void {
    const { playback, bass } = state;
    if (!playback.audio) {
        return;
    }
    if (bass.lastBassGain) {
        rampGain(bass.lastBassGain.gain, 0, playback.audio.currentTime, 0.005);
        (bass as Mutable<typeof bass>).lastBassGain = null; // @direct-mutation
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
 */
export function playBassNote(
    state: EnsembleState,
    freq: number,
    time: number,
    duration: number,
    velocity = 1.0,
    muteAmount = 0,
): void {
    const { playback, bass, groove } = state;
    if (!playback.audio) {
        return;
    }
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

        const tonalVol = vol * (1 - muteAmount * 0.85);

        // --- 5. Global Envelope (The "Foam Mute" Feel) ---
        const mainGain = playback.audio.createGain();
        mainGain.gain.setValueAtTime(0, startTime);

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
        // Guard against 0 * NaN = NaN when bandIntensity is undefined (e.g. tests)
        const cutoff =
            muteAmount >= 1
                ? 300
                : 300 + (1 - muteAmount) * Math.max(0, growlBase + vol * growlDepth - 300);

        lp1.frequency.setValueAtTime(cutoff, startTime);
        lp2.frequency.setValueAtTime(cutoff, startTime);
        lp1.Q.setValueAtTime(1.0, startTime);
        lp2.Q.setValueAtTime(1.0, startTime);

        const growlGain = playback.audio.createGain();
        growlGain.gain.setValueAtTime(0, startTime);
        growlGain.gain.setTargetAtTime(tonalVol * 0.35, startTime, 0.005);

        // --- 3. The Impact (Finger Thud) ---
        // Scale bandpass center and Q with note pitch: low notes thump, high notes click.
        const impactFreq = Math.max(200, Math.min(1400, freq * 1.6));
        const impactQ = 1.5 + (freq / 440) * 1.5;
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, mainGain, startTime, {
            volume: vol * 0.4,
            filterType: 'bandpass',
            freq: impactFreq,
            Q: impactQ,
            attack: 0.001,
            decay: 0.02,
            duration: 0.1,
        });

        // --- 4. Articulation (Body Resonance) ---
        const bodyEQ = playback.audio.createBiquadFilter();
        bodyEQ.type = 'peaking';
        bodyEQ.frequency.setValueAtTime(120, startTime);
        bodyEQ.Q.setValueAtTime(0.8, startTime);
        bodyEQ.gain.setValueAtTime(4, startTime);

        mainGain.gain.setTargetAtTime(tonalVol, startTime, 0.008);

        const releaseTime = duration * (1 - muteAmount) + 0.015 * muteAmount;
        const releaseTc = 0.08 * (1 - muteAmount) + 0.01 * muteAmount;

        if (muteAmount < 1) {
            const tailScale = 1 - muteAmount * 0.7;
            mainGain.gain.setTargetAtTime(tonalVol * 0.5 * tailScale, startTime + 0.015, 0.06);
            mainGain.gain.setTargetAtTime(tonalVol * 0.2 * tailScale, startTime + 0.08, 0.6);
        }
        mainGain.gain.setTargetAtTime(0, startTime + releaseTime, releaseTc);

        // --- Connections ---
        bodyMix.connect(saturator);
        saturator.connect(mainGain);

        oscGrowl.connect(lp1);
        lp1.connect(lp2);
        lp2.connect(growlGain);
        growlGain.connect(mainGain);

        mainGain.connect(bodyEQ);
        if (playback.bassGain) {
            bodyEQ.connect(playback.bassGain);
        }

        // Monophonic Note-Offs
        if (bass.lastBassGain && bass.lastBassGain !== mainGain) {
            rampGain(bass.lastBassGain.gain, 0, startTime, 0.005);
        }
        (bass as Mutable<typeof bass>).lastBassGain = mainGain; // @direct-mutation

        oscSine.start(startTime);
        oscTri.start(startTime);
        oscGrowl.start(startTime);

        const stopTime = startTime + releaseTime + 1.0;
        oscSine.stop(stopTime);
        oscTri.stop(stopTime);
        oscGrowl.stop(stopTime);

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
                mainGain,
                bodyEQ,
            ]);
    } catch (e) {
        console.error('playBassNote error:', e, { freq, time, duration });
    }
}
