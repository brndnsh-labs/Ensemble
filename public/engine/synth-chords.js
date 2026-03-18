import { safeDisconnect } from '../utils.js';
import { createSimplePanner, rampGain } from './synth-utils.js';

/**
 * Instrument definitions for the chord engine.
 */
export const INSTRUMENT_PRESETS = {
    Warm: {
        attack: 0.03,
        decay: 0.6,
        filterBase: 600,
        filterDepth: 1800,
        resonance: 2.2,
        tine: true,
        fundamental: 'triangle',
        harmonic: 'sine',
        fifth: 'sine',
        weights: [1.2, 0.3, 0.1],
        reverbMult: 1.1,
        gainMult: 1.0,
    },
    Piano: {
        attack: 0.001,
        decay: 5.0,
        filterBase: 400,
        filterDepth: 2400,
        resonance: 1.2,
        gainMult: 1.25,
    },
};

/**
 * @param {AudioContext} audioCtx
 * @returns {PeriodicWave}
 */
function createPianoWave(audioCtx) {
    const real = new Float32Array([0, 1, 0.6, 0.4, 0.25, 0.15, 0.1, 0.08, 0.05, 0.03]);
    const imag = new Float32Array(real.length).fill(0);
    return audioCtx.createPeriodicWave(real, imag);
}

/** @type {PeriodicWave|null} */
let pianoWave = null;
/** @type {Float32Array|null} */
let cachedShaperCurve = null;
let cachedShaperDrive = -1;

/**
 * Updates the sustain pedal state, precisely scheduled.
 * @param {Object} state - Global ensemble state.
 * @param {boolean} active - Sustain state.
 * @param {number|null} [time=null] - Scheduled time.
 */
export function updateSustain(state, active, time = null) {
    const { playback } = state;
    const scheduleTime = time !== null ? time : playback.audio?.currentTime || 0;
    playback.sustainActive = active; // @direct-mutation

    if (!active && playback.heldNotes) {
        playback.heldNotes.forEach(
            /** @param {any} note */ (note) => {
                note.stop(scheduleTime);
            },
        );
        playback.heldNotes.clear();
    }
}

/**
 * Forcefully kills all ringing piano notes (panic button).
 * @param {Object} state - Global ensemble state.
 */
export function killAllPianoNotes(state) {
    const { playback } = state;
    const now = playback.audio?.currentTime || 0;
    if (playback.heldNotes) {
        playback.heldNotes.forEach(
            /** @param {any} note */ (note) => {
                if (typeof note.stop === 'function') {
                    note.stop(now, true);
                }
            },
        );
        playback.heldNotes.clear();
    }
    playback.sustainActive = false; // @direct-mutation
}

/**
 * Plays a musical note with advanced synthesis based on instrument presets.
 * @param {Object} state - Global ensemble state.
 * @param {number} freq - Frequency in Hz.
 * @param {number} time - Start time in seconds.
 * @param {number} duration - Note duration in seconds.
 * @param {Object} [options={}] - Options object.
 * @param {number} [options.vol=0.1] - Output volume.
 * @param {number} [options.index=0] - Note index for staggering.
 * @param {string} [options.instrument='Piano'] - Instrument preset name.
 * @param {boolean} [options.muted=false] - Whether the note is muted.
 * @param {number} [options.numVoices=1] - Number of active voices for polyphony comp.
 */
export function playNote(
    state,
    freq,
    time,
    duration,
    { vol = 0.1, index = 0, instrument = 'Piano', muted = false, numVoices = 1 } = {},
) {
    const { playback, groove } = state;
    if (!Number.isFinite(freq)) {
        return;
    }

    const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));
    const finalVol = vol * polyphonyComp;

    if (!playback.heldNotes) {
        playback.heldNotes = new Set(); // @direct-mutation
    }

    try {
        if (instrument !== 'Piano' && instrument !== 'Warm') {
            instrument = 'Piano';
        }

        const preset = INSTRUMENT_PRESETS[instrument] || INSTRUMENT_PRESETS.Piano;
        const now = playback.audio.currentTime;
        const baseTime = Math.max(time, now);

        const isPiano = instrument === 'Piano';
        if (isPiano && !pianoWave) {
            pianoWave = createPianoWave(playback.audio);
        }

        const staggerMult = muted ? 0.4 : 1.0;
        const stagger = index * (0.005 + Math.random() * 0.01) * staggerMult;
        const startTime = baseTime + stagger;

        const intensity = playback.bandIntensity;
        const intensityShift = (intensity - 0.5) * 2400;
        const intensityDepthMult = 0.5 + intensity * 2.5;
        const velocityCutoff = Math.max(
            100,
            preset.filterBase + intensityShift + finalVol * preset.filterDepth * intensityDepthMult,
        );

        // --- Component A: The Hammer Strike ---
        if (isPiano && !muted) {
            const strike = playback.audio.createBufferSource();
            strike.buffer = groove.audioBuffers.noise;
            const strikeFilter = playback.audio.createBiquadFilter();
            const strikeGain = playback.audio.createGain();

            strikeFilter.type = 'bandpass';
            strikeFilter.frequency.setValueAtTime(1200 + finalVol * 800, startTime);
            strikeFilter.Q.setValueAtTime(1.5, startTime);

            strikeGain.gain.setValueAtTime(0, startTime);
            strikeGain.gain.setTargetAtTime(finalVol * 0.15, startTime, 0.001);
            strikeGain.gain.setTargetAtTime(0, startTime + 0.01, 0.01);

            strike.connect(strikeFilter);
            strikeFilter.connect(strikeGain);
            strikeGain.connect(playback.chordsGain);
            strike.start(startTime);
            strike.stop(startTime + 0.1);
            strike.onended = () => safeDisconnect([strike, strikeFilter, strikeGain]);
        }

        // --- Component B: The Harmonic Body ---
        const osc = playback.audio.createOscillator();
        const mainGain = playback.audio.createGain();
        const filter = playback.audio.createBiquadFilter();

        if (isPiano) {
            osc.setPeriodicWave(pianoWave);
        } else {
            osc.type = preset.fundamental || 'sine';
        }

        osc.frequency.setValueAtTime(freq, startTime);
        osc.detune.setValueAtTime(Math.random() * 4 - 2, startTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(velocityCutoff, startTime);
        filter.frequency.setTargetAtTime(preset.filterBase, startTime, isPiano ? 0.35 : 0.1);
        filter.Q.setValueAtTime(preset.resonance, startTime);

        mainGain.gain.setValueAtTime(0, startTime);
        mainGain.gain.setTargetAtTime(
            finalVol * (preset.gainMult || 1.0),
            startTime,
            preset.attack,
        );

        /**
         * @param {number} t
         * @param {boolean} [isPanic=false]
         */
        const stopNote = (t, isPanic = false) => {
            const dampingConstant = isPanic ? 0.005 : duration < 0.2 ? 0.02 : 0.12;
            rampGain(mainGain.gain, 0, t, dampingConstant);
            try {
                osc.stop(t + 0.5);
            } catch {
                /* ignore */
            }
        };

        if (playback.sustainActive && !muted) {
            const noteRef = { stop: stopNote };
            playback.heldNotes.add(noteRef);
            if (playback.heldNotes.size > 64) {
                const firstNote = playback.heldNotes.values().next().value;
                firstNote.stop(now);
                playback.heldNotes.delete(firstNote);
            }
        } else {
            const actualDuration = muted ? 0.015 : duration;
            rampGain(mainGain.gain, 0, startTime + actualDuration, 0.03);
        }

        osc.connect(filter);

        let lastNode = filter;
        if (intensity >= 0.8 && !muted) {
            const shaper = playback.audio.createWaveShaper();
            const drive = 1.0 + (intensity - 0.8) * 10.0;

            if (!cachedShaperCurve || Math.abs(drive - cachedShaperDrive) > 0.01) {
                const n_samples = 44100;
                cachedShaperCurve = new Float32Array(n_samples);
                for (let i = 0; i < n_samples; ++i) {
                    const x = (i * 2) / n_samples - 1;
                    cachedShaperCurve[i] =
                        ((Math.PI + drive) * x) / (Math.PI + drive * Math.abs(x));
                }
                cachedShaperDrive = drive;
            }

            shaper.curve = cachedShaperCurve;
            shaper.oversample = '2x';
            filter.connect(shaper);
            lastNode = shaper;
        }

        lastNode.connect(mainGain);

        const hpf = playback.audio.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.setValueAtTime(150, startTime);

        const panner = createSimplePanner(playback.audio, -0.2, startTime);

        mainGain.connect(hpf);
        hpf.connect(panner);
        panner.connect(playback.chordsGain);

        osc.start(startTime);
        if (!playback.sustainActive || muted) {
            osc.stop(startTime + (muted ? 0.1 : duration + 1.0));
        }

        osc.onended = () => safeDisconnect([osc, filter, mainGain, hpf, panner]);
    } catch (err) {
        console.error('playNote error:', err);
    }
}

/**
 * Plays a percussive "scratch" or muted strum sound for chord rhythms.
 * @param {Object} state - Global ensemble state.
 * @param {number} time - Scheduled time.
 * @param {number} [vol=0.1] - Output volume.
 */
export function playChordScratch(state, time, vol = 0.1) {
    const { playback, groove } = state;
    try {
        const randomizedVol = vol * (0.8 + Math.random() * 0.4);
        const gain = playback.audio.createGain();
        const filter = playback.audio.createBiquadFilter();
        const noise = playback.audio.createBufferSource();

        noise.buffer = groove.audioBuffers.noise;
        filter.type = 'bandpass';
        const scratchFreq = 1200 + Math.random() * 400;
        filter.frequency.value = scratchFreq;
        filter.frequency.setValueAtTime(scratchFreq, time);
        filter.Q.value = 1.5;
        filter.Q.setValueAtTime(1.5, time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.setTargetAtTime(randomizedVol, time, 0.005);
        gain.gain.setTargetAtTime(0, time + 0.02, 0.02);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(playback.chordsGain);

        noise.start(time);
        noise.stop(time + 0.2);

        noise.onended = () => safeDisconnect([gain, filter, noise]);
    } catch (e) {
        console.error('playChordScratch error:', e);
    }
}
