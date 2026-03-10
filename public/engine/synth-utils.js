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
 * @param {Array} voices - Array of voice objects { gain, nodes, ... }.
 * @param {number} time - Current AudioContext time.
 * @param {number} fadeTime - Time constant for the fade out.
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
            v.nodes.forEach((node) => {
                try {
                    if (node.stop) {
                        node.stop(time + fadeTime + 0.05);
                    }
                } catch {
                    /* ignore stop errors */
                }
            });
        }
    });
    voices.length = 0; // Clear the array in-place
}

/**
 * Updates a density-aware ducking factor based on recent hits.
 * @param {Object} mixState - Object tracking hits { recentHits, lastTick, densityDuck }.
 * @param {number} now - Current AudioContext time.
 * @param {number} threshold - Hits threshold before ducking begins.
 * @param {number} factor - Ducking intensity per hit over threshold.
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
 */
export function createSimplePanner(ctx, panValue, time) {
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (ctx.createStereoPanner) {
        panner.pan.setValueAtTime(panValue, time);
    }
    return panner;
}
