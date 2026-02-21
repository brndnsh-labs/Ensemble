import { getState } from '../state.js';
import { safeDisconnect } from '../utils.js';

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

export function killDrumNote() {
    const { playback, groove } = getState();
    if (groove.lastHatGain) {
        try {
            const g = groove.lastHatGain.gain;
            g.cancelScheduledValues(playback.audio.currentTime);
            g.setTargetAtTime(0, playback.audio.currentTime, 0.005);
        } catch {
            /* ignore error */
        }
        groove.lastHatGain = null;
    }
}

// Internal mix state for density-aware normalization
const mixState = {
    recentHits: 0,
    densityDuck: 1.0,
    lastTick: 0,
};

export function playDrumSound(name, time, velocity = 1.0) {
    const { playback, groove } = getState();
    if (!name) {
        return;
    }
    const now = playback.audio.currentTime;

    // --- Density Normalization Logic ---
    // Tracks hits over a rolling window to prevent dense presets from blowing out the mix.
    if (now - mixState.lastTick > 0.5) {
        // Decay hits every 500ms
        mixState.recentHits *= 0.5;
        mixState.lastTick = now;
    }
    mixState.recentHits++;

    // Density Ducking: If more than 8 hits are scheduled in a short window (~2 bars of 16ths),
    // we start ducking to keep integrated loudness consistent.
    const densityThreshold = 12;
    mixState.densityDuck = Math.max(
        0.75,
        1.0 - Math.max(0, mixState.recentHits - densityThreshold) * 0.015,
    );

    // Add a tiny 2ms buffer to ensure scheduling always happens slightly in the future,
    // which prevents the "immediate-start" clicks common in Firefox.
    const playTime = Math.max(time, now + 0.002);
    const humanizeFactor = (groove.humanize || 0) / 100;
    const velJitter = 1.0 + (Math.random() - 0.5) * (humanizeFactor * 0.4);

    // Apply the density ducking factor to the master drum volume
    const masterVol = velocity * 1.3 * velJitter * mixState.densityDuck;

    // --- Mix Separation: Stereo Panning ---
    const panner = playback.audio.createStereoPanner
        ? playback.audio.createStereoPanner()
        : playback.audio.createGain();
    let panValue = 0;
    if (RIGHT_PANNED_INSTRUMENTS.has(name)) {
        panValue = 0.2; // Right
    } else if (name.includes('Tom') || name.includes('Conga') || name.includes('Bongo')) {
        panValue = (Math.random() * 2 - 1) * 0.1; // Slight spread
    }
    if (playback.audio.createStereoPanner) {
        panner.pan.setValueAtTime(panValue, playTime);
    }
    panner.connect(playback.drumsGain);

    // Round-robin variation (±1.5%)
    const rr = (amt = 0.03) => 1 + (Math.random() - 0.5) * amt;

    if (name === 'Kick') {
        const vol = masterVol * rr();

        // 1. Beater Snap (High-frequency transient)
        const beater = playback.audio.createOscillator();
        const beaterGain = playback.audio.createGain();
        beaterGain.gain.value = 0;
        beaterGain.gain.setValueAtTime(0, playTime);
        beater.type = 'sine';
        beater.frequency.setValueAtTime(3000 * rr(), playTime);
        beater.frequency.exponentialRampToValueAtTime(600, playTime + 0.005);
        beaterGain.gain.setTargetAtTime(vol * 0.4, playTime, 0.001);
        beaterGain.gain.setTargetAtTime(0, playTime + 0.005, 0.003);

        // 2. Head "Skin" (Mid-range noise for texture)
        const skin = playback.audio.createBufferSource();
        skin.buffer = groove.audioBuffers.noise;
        const skinFilter = playback.audio.createBiquadFilter();
        const skinGain = playback.audio.createGain();
        skinFilter.type = 'bandpass';
        skinFilter.frequency.value = 1000;
        skinFilter.Q.value = 1.0;
        skinGain.gain.value = 0;
        skinGain.gain.setValueAtTime(0, playTime);
        skinGain.gain.setTargetAtTime(vol * 0.2, playTime, 0.002);
        skinGain.gain.setTargetAtTime(0, playTime + 0.01, 0.01);

        // 3. The "Knock" (Fast pitch-sweeping body)
        const knock = playback.audio.createOscillator();
        const knockGain = playback.audio.createGain();
        knockGain.gain.value = 0;
        knockGain.gain.setValueAtTime(0, playTime);
        knock.type = 'triangle';
        // Very fast sweep creates a "knock" rather than a "woo"
        knock.frequency.setValueAtTime(180 * rr(), playTime);
        knock.frequency.exponentialRampToValueAtTime(60, playTime + 0.02);
        knockGain.gain.setTargetAtTime(vol * 1.3, playTime, 0.001);
        knockGain.gain.setTargetAtTime(0, playTime + 0.015, 0.03);

        // 4. The "Shell" (Static low-end resonance)
        const shell = playback.audio.createOscillator();
        const shellGain = playback.audio.createGain();
        shellGain.gain.value = 0;
        shellGain.gain.setValueAtTime(0, playTime);
        shell.type = 'sine';
        shell.frequency.setValueAtTime(52 * rr(), playTime);
        shellGain.gain.setTargetAtTime(vol * 0.8, playTime, 0.005);
        shellGain.gain.setTargetAtTime(0, playTime + 0.03, 0.05);

        // Connections
        beater.connect(beaterGain);
        skin.connect(skinFilter);
        skinFilter.connect(skinGain);
        knock.connect(knockGain);
        shell.connect(shellGain);

        [beaterGain, skinGain, knockGain, shellGain].forEach((g) => g.connect(panner));

        beater.start(playTime);
        skin.start(playTime);
        knock.start(playTime);
        shell.start(playTime);

        beater.stop(playTime + 0.1);
        skin.stop(playTime + 0.1);
        knock.stop(playTime + 0.2);
        shell.stop(playTime + 0.5);

        shell.onended = () =>
            safeDisconnect([
                beater,
                beaterGain,
                skin,
                skinFilter,
                skinGain,
                knock,
                knockGain,
                shell,
                shellGain,
                panner,
            ]);
    } else if (name === 'Snare' || name === 'Sidestick') {
        const isSidestick = name === 'Sidestick';
        const vol = masterVol * rr() * (isSidestick ? 0.8 : 1.0);

        if (isSidestick) {
            // --- Sidestick (Rim Click) - 3-Layer Model ---

            // 1. The "Click" (Transient Impact)
            const click = playback.audio.createOscillator();
            const clickGain = playback.audio.createGain();
            click.type = 'sine';
            click.frequency.setValueAtTime(6500 * rr(), playTime);

            clickGain.gain.setValueAtTime(0, playTime);
            clickGain.gain.setTargetAtTime(vol * 0.4, playTime, 0.001);
            clickGain.gain.setTargetAtTime(0, playTime + 0.005, 0.005); // Faster decay

            click.connect(clickGain);
            clickGain.connect(panner);

            // 2. The "Body" (Woody Resonance)
            const body = playback.audio.createOscillator();
            const bodyGain = playback.audio.createGain();
            const bodyFilter = playback.audio.createBiquadFilter();

            body.type = 'triangle';
            const bodyFreq = 330 * rr();
            body.frequency.setValueAtTime(bodyFreq, playTime);
            body.frequency.setTargetAtTime(bodyFreq * 0.9, playTime, 0.1);

            bodyFilter.type = 'bandpass';
            bodyFilter.frequency.setValueAtTime(350, playTime);
            bodyFilter.Q.setValueAtTime(1.5, playTime);

            bodyGain.gain.setValueAtTime(0, playTime);
            bodyGain.gain.setTargetAtTime(vol * 0.8, playTime, 0.002);
            bodyGain.gain.setTargetAtTime(0, playTime + 0.02, 0.04);

            body.connect(bodyFilter);
            bodyFilter.connect(bodyGain);
            bodyGain.connect(panner);

            // 3. The "Snap" (Noise Texture)
            const noise = playback.audio.createBufferSource();
            noise.buffer = groove.audioBuffers.noise;
            const noiseFilter = playback.audio.createBiquadFilter();
            const noiseGain = playback.audio.createGain();

            noiseFilter.type = 'highpass';
            noiseFilter.frequency.setValueAtTime(3500, playTime);

            noiseGain.gain.setValueAtTime(0, playTime);
            noiseGain.gain.setTargetAtTime(vol * 0.35, playTime, 0.002);
            noiseGain.gain.setTargetAtTime(0, playTime + 0.01, 0.02);

            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(panner);

            // Trigger
            click.start(playTime);
            body.start(playTime);
            noise.start(playTime);

            const stopTime = playTime + 0.5; // Generous stop
            click.stop(stopTime);
            body.stop(stopTime);
            noise.stop(stopTime);

            noise.onended = () =>
                safeDisconnect([
                    click,
                    clickGain,
                    body,
                    bodyFilter,
                    bodyGain,
                    noise,
                    noiseFilter,
                    noiseGain,
                    panner,
                ]);

            return; // Exit early for Sidestick
        }

        // 1. The Tone (Drum head resonance)
        const tone1 = playback.audio.createOscillator();
        const tone2 = playback.audio.createOscillator();
        const toneGain = playback.audio.createGain();
        toneGain.gain.value = 0;
        toneGain.gain.setValueAtTime(0, playTime);
        tone1.type = 'triangle';
        tone2.type = 'sine';
        tone1.frequency.setValueAtTime(180 * rr(), playTime);
        tone2.frequency.setValueAtTime(330 * rr(), playTime);

        toneGain.gain.setTargetAtTime(vol * 0.5, playTime, 0.001);
        toneGain.gain.setTargetAtTime(0, playTime + 0.01, 0.05);
        tone1.connect(toneGain);
        tone2.connect(toneGain);
        toneGain.connect(panner);

        // 2. The Wires (Snare rattle)
        const noise = playback.audio.createBufferSource();
        noise.buffer = groove.audioBuffers.noise;
        const noiseFilter = playback.audio.createBiquadFilter();
        const noiseGain = playback.audio.createGain();
        noiseGain.gain.value = 0;
        noiseGain.gain.setValueAtTime(0, playTime);
        noiseFilter.type = 'bandpass';
        const centerFreq = 1500 + velocity * 1000;
        const finalFreq = centerFreq * rr();

        // Firefox stability: set .value directly
        noiseFilter.frequency.value = finalFreq;
        noiseFilter.frequency.setValueAtTime(finalFreq, playTime);
        noiseFilter.Q.value = 1.2;
        noiseFilter.Q.setValueAtTime(1.2, playTime);

        noiseGain.gain.setTargetAtTime(vol, playTime, 0.001);
        noiseGain.gain.setTargetAtTime(0, playTime + 0.01, 0.08);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(panner);

        tone1.start(playTime);
        tone2.start(playTime);
        noise.start(playTime);
        tone1.stop(playTime + 0.5);
        tone2.stop(playTime + 0.5);
        noise.stop(playTime + 0.5);

        noise.onended = () =>
            safeDisconnect([tone1, tone2, toneGain, noise, noiseFilter, noiseGain, panner]);
    } else if (name === 'HiHat' || name === 'Open') {
        const isOpen = name === 'Open';
        const vol = masterVol * (isOpen ? 0.5 : 0.7) * rr();

        // 1. Improved Choking Logic (Natural "Grab")
        if (groove.lastHatGain) {
            try {
                const g = groove.lastHatGain.gain;
                g.cancelScheduledValues(playTime);
                g.setTargetAtTime(0, playTime, 0.005);
            } catch {
                /* ignore error */
            }
        }

        // 2. Pre-render / Cache the Metallic Buffer (Lazy Load)
        if (!groove.audioBuffers.hihatMetal) {
            groove.audioBuffers.hihatMetal = createMetallicBuffer(playback.audio);
        }

        // 3. Playback with variation
        const source = playback.audio.createBufferSource();
        source.buffer = groove.audioBuffers.hihatMetal;
        // Re-introduce the random pitch variation using playbackRate
        source.playbackRate.value = rr(0.05);

        // 4. Tone Shaping
        const bpFilter = playback.audio.createBiquadFilter();
        bpFilter.type = 'bandpass';
        bpFilter.frequency.setValueAtTime(10000, playTime);
        bpFilter.Q.value = 1.0;

        const hpFilter = playback.audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.setValueAtTime(7000, playTime);

        // 5. Envelope & Gain
        const gain = playback.audio.createGain();
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, playTime);

        if (isOpen) {
            gain.gain.setTargetAtTime(vol, playTime, 0.015);
            gain.gain.setTargetAtTime(0, playTime + 0.02, 0.35 * rr());
        } else {
            gain.gain.setTargetAtTime(vol, playTime, 0.002);
            gain.gain.setTargetAtTime(0, playTime + 0.005, 0.05 * rr());
        }

        groove.lastHatGain = gain;

        // Connections: Source -> BP -> HP -> Gain -> Master
        source.connect(bpFilter);
        bpFilter.connect(hpFilter);
        hpFilter.connect(gain);
        gain.connect(panner);

        source.start(playTime);
        source.stop(playTime + (isOpen ? 2.0 : 0.4));

        source.onended = () => {
            if (groove.lastHatGain === gain) {
                groove.lastHatGain = null;
            }
            safeDisconnect([source, bpFilter, hpFilter, gain, panner]);
        };
    } else if (name === 'Crash') {
        const vol = masterVol * 0.85 * rr();
        const duration = 2.0 * rr();

        // 1. Metallic Bank (Ring)
        const ratios = [2.0, 3.0, 4.16, 5.43, 6.79, 8.21];
        const baseFreq = 60 * rr();
        const oscs = ratios.map((r) => {
            const o = playback.audio.createOscillator();
            o.type = 'square';
            o.frequency.setValueAtTime(baseFreq * r, playTime);
            return o;
        });

        // 2. The Wash
        const noise = playback.audio.createBufferSource();
        noise.buffer = groove.audioBuffers.noise;

        const hpFilter = playback.audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.value = 6000;
        hpFilter.frequency.setValueAtTime(6000, playTime);
        hpFilter.frequency.setTargetAtTime(1200, playTime, duration * 0.4);
        hpFilter.Q.value = 0.5;

        const gain = playback.audio.createGain();
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, playTime);
        gain.gain.linearRampToValueAtTime(vol, playTime + 0.005);

        // Dual-Stage Decay:
        // 1. Explosive initial drop (The "Hit")
        gain.gain.setTargetAtTime(vol * 0.15, playTime + 0.01, 0.02);
        // 2. Natural lingering tail (The "Ring") - Scaled faster to ensure it hits zero
        gain.gain.setTargetAtTime(0, playTime + 0.08, duration * 0.2);

        // Smoothly ramp to absolute zero at the very end to prevent any possible click
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

        // 1. The "Wood" (Core frequency)
        const osc = playback.audio.createOscillator();
        const gain = playback.audio.createGain();
        osc.type = 'sine';
        // Classic claves are high-pitched but have a slight "thunk"
        osc.frequency.setValueAtTime(2450 * rr(0.01), playTime);

        gain.gain.setValueAtTime(0, playTime);
        gain.gain.setTargetAtTime(vol, playTime, 0.0005);
        // Faster decay for a tighter "tick"
        gain.gain.setTargetAtTime(0, playTime + 0.005, 0.008);

        // 2. The "Strike" (Noise transient for wood texture)
        const strike = playback.audio.createBufferSource();
        strike.buffer = groove.audioBuffers.noise;
        const strikeFilter = playback.audio.createBiquadFilter();
        const strikeGain = playback.audio.createGain();

        strikeFilter.type = 'highpass';
        strikeFilter.frequency.setValueAtTime(5000, playTime);
        strikeFilter.Q.value = 0.5;

        strikeGain.gain.setValueAtTime(0, playTime);
        strikeGain.gain.setTargetAtTime(vol * 0.4, playTime, 0.0005);
        strikeGain.gain.setTargetAtTime(0, playTime + 0.002, 0.003);

        osc.connect(gain);
        gain.connect(panner);

        strike.connect(strikeFilter);
        strikeFilter.connect(strikeGain);
        strikeGain.connect(panner);

        osc.start(playTime);
        strike.start(playTime);
        osc.stop(playTime + 0.1);
        strike.stop(playTime + 0.1);

        osc.onended = () => safeDisconnect([osc, gain, strike, strikeFilter, strikeGain, panner]);
    } else if (name.startsWith('Conga') || name.startsWith('Bongo')) {
        const isBongo = name.startsWith('Bongo');
        const isHigh = name.includes('High');
        const isSlap = name.includes('Slap');
        const isMute = name.includes('Mute');

        // Slightly lower frequencies for "warmth"
        const baseFreq = isBongo ? (isHigh ? 420 : 280) : isHigh ? 210 : 155;
        const vol = masterVol * (isSlap ? 0.85 : 0.7) * rr();

        // 1. The "Skin" (Tone) - Use Sine for warmth, Triangle only for slap
        const tone = playback.audio.createOscillator();
        const toneGain = playback.audio.createGain();
        tone.type = isSlap ? 'triangle' : 'sine';
        tone.frequency.setValueAtTime(baseFreq * rr(0.01), playTime);

        // Pitch drop on impact (simulates skin tension change)
        tone.frequency.exponentialRampToValueAtTime(baseFreq * 0.95, playTime + 0.05);

        toneGain.gain.setValueAtTime(0, playTime);
        toneGain.gain.setTargetAtTime(vol, playTime, 0.002);
        const decay = isMute ? 0.015 : isSlap ? 0.03 : 0.07;
        toneGain.gain.setTargetAtTime(0, playTime + 0.01, decay);

        tone.connect(toneGain);
        toneGain.connect(panner);

        // 2. The "Palm" (Impact transient)
        const noise = playback.audio.createBufferSource();
        noise.buffer = groove.audioBuffers.noise;
        const noiseFilter = playback.audio.createBiquadFilter();
        const noiseGain = playback.audio.createGain();

        // Bandpass at mid-range for the "thump"
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(isSlap ? 2500 : 800, playTime);
        noiseFilter.Q.value = 1.0;

        noiseGain.gain.setValueAtTime(0, playTime);
        noiseGain.gain.setTargetAtTime(isSlap ? vol * 0.6 : vol * 0.25, playTime, 0.001);
        noiseGain.gain.setTargetAtTime(0, playTime + 0.005, 0.015);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(panner);

        tone.start(playTime);
        noise.start(playTime);
        tone.stop(playTime + 0.3);
        noise.stop(playTime + 0.3);

        tone.onended = () =>
            safeDisconnect([tone, toneGain, noise, noiseFilter, noiseGain, panner]);
    } else if (name.startsWith('Agogo') || name === 'Perc') {
        const isHigh = name.includes('High') || name === 'Perc';
        const vol = masterVol * 0.35 * rr();
        const freq = isHigh ? 1150 : 780; // Slightly detuned from pure pitches

        // Refined metallic ring using resonant filters + FM-ish stack
        const osc1 = playback.audio.createOscillator();
        const osc2 = playback.audio.createOscillator();
        const gain = playback.audio.createGain();
        const filter = playback.audio.createBiquadFilter();

        osc1.type = 'sine'; // Sine + Triangle for less "harsh" square sound
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(freq * rr(0.005), playTime);
        osc2.frequency.setValueAtTime(freq * 1.492 * rr(0.005), playTime); // Non-harmonic ratio

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freq * 1.5, playTime);
        filter.Q.value = 4.0; // High resonance for "ping" but with softer waveforms

        gain.gain.setValueAtTime(0, playTime);
        gain.gain.setTargetAtTime(vol, playTime, 0.001);
        gain.gain.setTargetAtTime(0, playTime + 0.02, 0.12);

        // Add a secondary sine for low-end body
        const body = playback.audio.createOscillator();
        const bodyGain = playback.audio.createGain();
        body.type = 'sine';
        body.frequency.setValueAtTime(freq, playTime);
        bodyGain.gain.setValueAtTime(0, playTime);
        bodyGain.gain.setTargetAtTime(vol * 0.5, playTime, 0.002);
        bodyGain.gain.setTargetAtTime(0, playTime + 0.01, 0.04);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        body.connect(bodyGain);

        [gain, bodyGain].forEach((g) => g.connect(panner));

        [osc1, osc2, body].forEach((o) => {
            o.start(playTime);
            o.stop(playTime + 0.5);
        });

        osc1.onended = () => safeDisconnect([osc1, osc2, body, filter, gain, bodyGain, panner]);
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

        // Scrape effect: 4 quick pulses
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

        const noise = playback.audio.createBufferSource();
        noise.buffer = groove.audioBuffers.noise;

        const filter = playback.audio.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(6000, playTime);

        const gain = playback.audio.createGain();
        gain.gain.setValueAtTime(0, playTime);
        // Soft attack for shaker feel
        gain.gain.setTargetAtTime(vol, playTime, 0.01);
        gain.gain.setTargetAtTime(0, playTime + 0.02, 0.05);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(panner);

        noise.start(playTime);
        noise.stop(playTime + 0.2);

        noise.onended = () => safeDisconnect([noise, filter, gain, panner]);
    } else if (name.includes('Tom')) {
        const vol = masterVol * 0.8 * rr();
        const isHigh = name.includes('High');
        const isMid = name.includes('Mid');
        const freq = isHigh ? 180 : isMid ? 135 : 90;

        // 1. The Tone (Body resonance)
        const tone = playback.audio.createOscillator();
        const toneGain = playback.audio.createGain();
        tone.type = 'sine';
        tone.frequency.setValueAtTime(freq * 1.2 * rr(), playTime);
        tone.frequency.exponentialRampToValueAtTime(freq, playTime + 0.05);

        toneGain.gain.setValueAtTime(0, playTime);
        toneGain.gain.setTargetAtTime(vol, playTime, 0.002);
        toneGain.gain.setTargetAtTime(0, playTime + 0.05, 0.2);

        tone.connect(toneGain);
        toneGain.connect(panner);

        // 2. The "Stick" (Attack transient)
        const stick = playback.audio.createOscillator();
        const stickGain = playback.audio.createGain();
        stick.type = 'square';
        stick.frequency.setValueAtTime(freq * 2.5, playTime);
        stick.frequency.exponentialRampToValueAtTime(freq, playTime + 0.01);

        stickGain.gain.setValueAtTime(0, playTime);
        stickGain.gain.setTargetAtTime(vol * 0.3, playTime, 0.001);
        stickGain.gain.setTargetAtTime(0, playTime + 0.005, 0.01);

        stick.connect(stickGain);
        stickGain.connect(panner);

        tone.start(playTime);
        stick.start(playTime);
        tone.stop(playTime + 1.0);
        stick.stop(playTime + 0.1);

        tone.onended = () => safeDisconnect([tone, toneGain, stick, stickGain, panner]);
    }
}

/**
 * Generates a 2-second buffer of the metallic oscillator stack.
 * Used for HiHats to avoid creating 6 oscillators per hit.
 */
function createMetallicBuffer(audioCtx) {
    const duration = 2.0;
    const sampleRate = audioCtx.sampleRate;
    const length = sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // TR-808 Ratios
    const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
    const baseFreq = 40; // Fixed base frequency

    for (let i = 0; i < length; i++) {
        let sample = 0;
        const t = i / sampleRate;
        for (const r of ratios) {
            const freq = baseFreq * r;
            // Square wave approximation
            const phase = (t * freq) % 1;
            sample += phase < 0.5 ? 1 : -1;
        }
        data[i] = sample / ratios.length; // Normalize
    }
    return buffer;
}
