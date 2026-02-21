import { getState } from '../state.js';
import { createSoftClipCurve, safeDisconnect } from '../utils.js';

export function killBassNote() {
    const { playback, bass } = getState();
    if (bass.lastBassGain) {
        try {
            const g = bass.lastBassGain.gain;
            g.cancelScheduledValues(playback.audio.currentTime);
            g.setTargetAtTime(0, playback.audio.currentTime, 0.005);
        } catch {
            /* ignore safety disconnect */
        }
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
        if (now - mixState.lastTick > 0.5) {
            mixState.recentHits *= 0.5;
            mixState.lastTick = now;
        }
        mixState.recentHits++;

        // If we're chugging (8th/16th notes), duck volume slightly to keep the mix clear.
        const densityThreshold = 4;
        mixState.densityDuck = Math.max(
            0.85,
            1.0 - Math.max(0, mixState.recentHits - densityThreshold) * 0.02,
        );

        // Square-root compression for even volume, Motown usually has a very consistent level
        const vol = 1.0 * Math.sqrt(velocity) * mixState.densityDuck * (0.95 + Math.random() * 0.1);
        if (vol < 0.005) {
            return;
        }

        const tonalVol = muted ? vol * 0.15 : vol;

        // --- 1. The Thump (Fundamental + Passive Saturation) ---
        // Mix Sine (Pure fundamental) and Triangle (Warmth)
        const oscSine = playback.audio.createOscillator();
        oscSine.type = 'sine';
        oscSine.frequency.setValueAtTime(freq, startTime);

        const oscTri = playback.audio.createOscillator();
        oscTri.type = 'triangle';
        oscTri.frequency.setValueAtTime(freq, startTime);

        const bodyMix = playback.audio.createGain();
        oscSine.connect(bodyMix);
        oscTri.connect(bodyMix);
        oscSine.gain = 0.7; // Internal helper-ish (not a real prop, just for logic)
        bodyMix.gain.setValueAtTime(0.8, startTime);

        const saturator = playback.audio.createWaveShaper();
        saturator.curve = createSoftClipCurve();
        saturator.oversample = '4x';

        // --- 2. The Growl (Flatwound Roll-off) ---
        const oscGrowl = playback.audio.createOscillator();
        oscGrowl.type = 'sawtooth';
        oscGrowl.frequency.setValueAtTime(freq, startTime);

        // Chain two 12dB filters for a steep 24dB/octave roll-off (Vintage character)
        const lp1 = playback.audio.createBiquadFilter();
        const lp2 = playback.audio.createBiquadFilter();
        lp1.type = lp2.type = 'lowpass';

        const midi = 12 * Math.log2(freq / 440) + 69;
        // Flatwounds have very little above 1.5kHz, but we expand this for more growl
        const growlBase = 200 + midi * 5 + playback.bandIntensity * 400; // Intensity adds up to 400Hz base (Expanded from 200)
        const growlDepth = 1200 * (0.5 + playback.bandIntensity * 1.0); // Depth scales from 0.5x to 1.5x (Expanded from 0.7-1.3)
        const cutoff = muted ? 300 : growlBase + vol * growlDepth;

        lp1.frequency.setValueAtTime(cutoff, startTime);
        lp2.frequency.setValueAtTime(cutoff, startTime);
        lp1.Q.setValueAtTime(1.0, startTime);
        lp2.Q.setValueAtTime(1.0, startTime);

        const growlGain = playback.audio.createGain();
        growlGain.gain.setValueAtTime(0, startTime);
        growlGain.gain.setTargetAtTime(tonalVol * 0.35, startTime, 0.005);

        // --- 3. The Impact (Finger Thud) ---
        // Replace Sine Click with Band-passed Noise for a woody "thud"
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
        // 120Hz bump: the "Jamerson" punch
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
            // Stage 1: Punchy Pluck settle (Classic Motown decay)
            mainGain.gain.setTargetAtTime(tonalVol * 0.5, startTime + 0.015, 0.06);
            // Stage 2: Woody Ring
            mainGain.gain.setTargetAtTime(tonalVol * 0.2, startTime + 0.08, 0.6);
            // Stage 3: Release
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
            try {
                const prevGain = bass.lastBassGain.gain;
                prevGain.cancelScheduledValues(startTime);
                prevGain.setTargetAtTime(0, startTime, 0.005);
            } catch {
                /* ignore error during note end */
            }
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
