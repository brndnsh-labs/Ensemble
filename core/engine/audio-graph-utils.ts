/**
 * Leaf-level Web Audio graph helpers.
 *
 * This module is deliberately a LEAF: it imports nothing from the engine (or
 * anywhere else in the app). That is the whole reason it exists.
 *
 * These three helpers previously lived in `synth-utils.ts`, which imports
 * `foldToSampledCeiling`/`pickZone` from `sample-voice.ts` — while
 * `sample-voice.ts` needed `safeDisconnect` back from `synth-utils.ts`. That
 * two-module cycle was runtime-safe only by accident: `safeDisconnect` is a
 * hoisted `export function` and both directions were dereferenced inside
 * function bodies, so there was no module-init-time evaluation and no TDZ
 * window under ESM. Converting it to `export const safeDisconnect = () => …`,
 * or adding any module-level `const X = pickZone(…)` to `synth-utils.ts`, would
 * have turned it into a load-time crash surfacing as "undefined is not a
 * function" somewhere in the audio path. (#1176 → #1192)
 *
 * Keep this module free of engine imports. Anything that needs engine state or
 * sample-pack knowledge belongs in `synth-utils.ts`, not here.
 */

/**
 * Safely disconnects multiple Web Audio nodes.
 */
export function safeDisconnect(nodes: AudioNode[]): void {
    nodes.forEach((node) => {
        if (node) {
            try {
                node.disconnect();
            } catch {
                /* ignore disconnect error */
            }
        }
    });
}

let cachedSoftClipCurve: Float32Array<ArrayBuffer> | null = null;

/**
 * Creates a soft-clipping curve for the WaveShaperNode. Cached for performance.
 */
export function createSoftClipCurve(): Float32Array<ArrayBuffer> {
    if (cachedSoftClipCurve) {
        return cachedSoftClipCurve;
    }
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        // Normalized monotonic cubic: f(x) = (3x - x^3) / 2
        curve[i] = (3 * x - x * x * x) / 2;
    }
    cachedSoftClipCurve = curve;
    return curve;
}

/**
 * Clamps a frequency value to be within the safe range for Web Audio BiquadFilters.
 */
export function clampFreq(freq: number, max = 24000): number {
    // Nominal range for most browser implementations of BiquadFilter is [0, 24000]
    return Math.min(Math.max(0, freq), max);
}
