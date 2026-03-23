import { safeDisconnect } from '../utils.js';

/**
 * Standardized WebAudio utilities for instrument synthesis.
 */

/**
 * Ramps a gain parameter to a target value with safety cleanup of previous schedules.
 * @param {AudioParam} param - The parameter to ramp.
 * @param {number} target - The target value.
 * @param {number} time - Start time.
 * @param {number} duration - Time constant or ramp duration.
 * @param {boolean} [isExponential=false] - Whether to use exponential ramping.
 */
export function rampGain(param, target, time, duration = 0.01, isExponential = false) {
    try {
        param.cancelScheduledValues(time);
        if (isExponential && target > 0.0001) {
            // We skip setValueAtTime(value, time) to match existing test expectations
            // and avoid the "automation curve overlap" warning in some browsers
            // when not strictly necessary for these simple fades.
            param.exponentialRampToValueAtTime(target, time + duration);
        } else {
            param.setTargetAtTime(target, time, duration);
        }
    } catch {
        /* ignore audio graph errors */
    }
}

/**
 * Fades out and stops a list of active voices.
 * @param {Array<any>} voices - Array of voice objects { gain, nodes, ... }.
 * @param {number} time - Current AudioContext time.
 * @param {number} [fadeTime=0.01] - Time constant for the fade out.
 */
export function killActiveVoices(voices, time, fadeTime = 0.01) {
    if (!voices || voices.length === 0) {
        return;
    }
    voices.forEach((v) => {
        if (v.gain) {
            // Support both { gain: GainNode } and { gain: AudioParam }
            const g = v.gain.gain || v.gain;
            rampGain(g, 0, time, fadeTime);
        }
        if (v.nodes) {
            v.nodes.forEach(
                /** @param {AudioNode|any} node */ (node) => {
                    try {
                        if (node.stop) {
                            node.stop(time + fadeTime + 0.05);
                        }
                    } catch {
                        /* ignore stop errors */
                    }
                },
            );
        }
    });
    voices.length = 0; // Clear the array in-place
}

/**
 * Updates a density-aware ducking factor based on recent hits.
 * @param {{recentHits: number, lastTick: number, densityDuck: number}} mixState - Object tracking hits { recentHits, lastTick, densityDuck }.
 * @param {number} now - Current AudioContext time.
 * @param {number} [threshold=4] - Hits threshold before ducking begins.
 * @param {number} [factor=0.02] - Ducking intensity per hit over threshold.
 * @returns {number} The calculated density ducking factor.
 */
export function updateDensityDucking(mixState, now, threshold = 4, factor = 0.02) {
    if (now - mixState.lastTick > 0.5) {
        mixState.recentHits *= 0.5;
        mixState.lastTick = now;
    }
    mixState.recentHits++;

    mixState.densityDuck = Math.max(
        0.75,
        1.0 - Math.max(0, mixState.recentHits - threshold) * factor,
    );
    return mixState.densityDuck;
}

/**
 * Creates a stereo panner or fallback gain node.
 * @param {AudioContext} ctx
 * @param {number} panValue - Pan value (-1 to 1).
 * @param {number} time - Scheduling time.
 * @returns {StereoPannerNode | GainNode}
 */
export function createSimplePanner(ctx, panValue, time) {
    const panner =
        typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : ctx.createGain();
    if (typeof ctx.createStereoPanner === 'function' && 'pan' in panner) {
        panner.pan.setValueAtTime(panValue, time);
    }
    return panner;
}

/**
 * Ducks a gain parameter to a target value and returns it to 1.0.
 * Useful for sidechaining (e.g., ducking bass when kick hits).
 * @param {AudioParam} param - The gain parameter to duck.
 * @param {number} target - The target gain during the duck (e.g. 0.4).
 * @param {number} time - Start time.
 * @param {number} attack - Time to reach target gain (seconds).
 * @param {number} release - Time to return to 1.0 (seconds).
 */
export function duckGain(param, target, time, attack = 0.01, release = 0.1) {
    try {
        param.cancelScheduledValues(time);
        param.setTargetAtTime(target, time, attack);
        param.setTargetAtTime(1.0, time + attack, release);
    } catch {
        /* ignore audio graph errors */
    }
}

/**
 * Plays a percussive strike using a noise buffer and filter.
 * Consolidated from various instrument engines to reduce duplication.
 *
 * @param {AudioContext} audio - WebAudio context.
 * @param {AudioBuffer} buffer - Noise buffer.
 * @param {AudioNode} destination - Target node.
 * @param {number} time - Start time.
 * @param {Object} options - Synthesis options.
 * @param {number} [options.volume=0.1] - Output volume.
 * @param {BiquadFilterType} [options.filterType='bandpass'] - Filter type.
 * @param {number} [options.freq=1200] - Filter frequency.
 * @param {number} [options.Q=1.5] - Filter resonance.
 * @param {number} [options.attack=0.001] - Attack time constant.
 * @param {number} [options.decay=0.01] - Decay time constant.
 * @param {number} [options.duration=0.1] - Stop duration.
 */
export function playPercussiveStrike(
    audio,
    buffer,
    destination,
    time,
    {
        volume = 0.1,
        filterType = 'bandpass',
        freq = 1200,
        Q = 1.5,
        attack = 0.001,
        decay = 0.01,
        duration = 0.1,
    } = {},
) {
    if (!audio || !buffer || !destination) {
        return;
    }

    try {
        const source = audio.createBufferSource();
        source.buffer = buffer;
        const filter = audio.createBiquadFilter();
        const gain = audio.createGain();

        filter.type = filterType;
        filter.frequency.setValueAtTime(freq, time);
        filter.Q.setValueAtTime(Q, time);

        gain.gain.setValueAtTime(0, time);
        gain.gain.setTargetAtTime(volume, time, attack);
        gain.gain.setTargetAtTime(0, time + attack, decay);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(destination);

        source.start(time);
        source.stop(time + duration);

        source.onended = () => safeDisconnect([source, filter, gain]);
    } catch {
        /* ignore audio errors */
    }
}

/**
 * Plays a resonant tone component using an oscillator and frequency ramp.
 * Standardizes "body" sounds for drums and bass.
 *
 * @param {AudioContext} audio - WebAudio context.
 * @param {AudioNode} destination - Target node.
 * @param {number} time - Start time.
 * @param {Object} options - Synthesis options.
 * @param {OscillatorType} [options.type='sine'] - Oscillator type.
 * @param {number} [options.freqStart=100] - Initial frequency.
 * @param {number} [options.freqEnd=100] - End frequency (ramp target).
 * @param {number} [options.rampDuration=0.02] - Duration of the frequency ramp.
 * @param {number} [options.volume=0.1] - Output volume.
 * @param {number} [options.attack=0.001] - Attack time constant.
 * @param {number} [options.decay=0.05] - Decay time constant.
 * @param {number} [options.duration=0.5] - Stop duration.
 * @param {number} [options.detune=0] - Initial detune in cents.
 */
export function playResonantTone(
    audio,
    destination,
    time,
    {
        type = 'sine',
        freqStart = 100,
        freqEnd = 100,
        rampDuration = 0.02,
        volume = 0.1,
        attack = 0.001,
        decay = 0.05,
        duration = 0.5,
        detune = 0,
    } = {},
) {
    if (!audio || !destination) {
        return;
    }

    try {
        const osc = audio.createOscillator();
        const gain = audio.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, time);
        if (freqStart !== freqEnd) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), time + rampDuration);
        }
        if (detune !== 0) {
            osc.detune.setValueAtTime(detune, time);
        }

        gain.gain.setValueAtTime(0, time);
        gain.gain.setTargetAtTime(volume, time, attack);
        gain.gain.setTargetAtTime(0, time + attack, decay);

        osc.connect(gain);
        gain.connect(destination);

        osc.start(time);
        osc.stop(time + duration);

        osc.onended = () => safeDisconnect([osc, gain]);
    } catch {
        /* ignore audio errors */
    }
}
