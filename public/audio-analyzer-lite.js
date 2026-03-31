/**
 * Ensemble Lightweight Audio Analyzer
 * Pure JavaScript implementation of Chromagram-based Chord Recognition.
 * Complexity: O(N) where N is audio samples.
 */

// Helper to allow UI updates during heavy processing
const yieldToMain = () => new Promise((r) => setTimeout(r, 0));

const { min, max, floor, PI, cos, sin, abs, round, ceil, sqrt } = Math;

// --- Static Data (Optimization: Avoid Re-allocation) ---
const KEY_TYPES = ['major', 'minor', 'dominant', 'bluesMaj', 'bluesMin'];

/**
 * Template profiles for chord-type matching in {@link ChordAnalyzerLite#identifyChord}.
 * Keys are semitone intervals from the chord root (0–11); values are relative energy weights.
 * A profile only lists the *required* intervals — chromagram bins absent from the profile
 * incur a small penalty (`score -= val * 0.5`) to penalize "wrong" notes, while missing
 * required bins incur a larger penalty (`score -= 2.0`).
 */
const CHORD_PROFILES = {
    maj: { 0: 1.6, 4: 1.4, 7: 1.1 },
    m: { 0: 1.6, 3: 1.4, 7: 1.1 },
    7: { 0: 1.6, 4: 1.3, 7: 1.1, 10: 1.5 },
    maj7: { 0: 1.6, 4: 1.3, 7: 1.1, 11: 1.2 },
    m7: { 0: 2.0, 3: 1.4, 7: 1.1, 10: 1.3 },
    6: { 0: 1.6, 4: 1.4, 7: 1.1, 9: 1.2 },
    m6: { 0: 1.6, 3: 1.4, 7: 1.1, 9: 1.2 },
    sus4: { 0: 1.6, 5: 1.4, 7: 1.1 },
    dim: { 0: 1.7, 3: 1.4, 6: 1.4 },
    dim7: { 0: 1.6, 3: 1.4, 6: 1.4, 9: 1.4 },
    aug: { 0: 1.6, 4: 1.4, 8: 1.4 },
};
const CHORD_PROFILE_ENTRIES = Object.entries(CHORD_PROFILES);

const MAJOR_DIATONIC = [0, 2, 4, 5, 7, 9, 11]; // I ii iii IV V vi vii°
const MINOR_DIATONIC = [0, 2, 3, 5, 7, 8, 10]; // i ii° III iv v VI VII

/**
 * @typedef {Object} SharedBuffers
 * @property {Float32Array} chroma
 * @property {Float32Array} pitchEnergy
 * @property {Float32Array} windowValues
 * @property {Float32Array} windowedSignal
 * @property {Float32Array} cosTable
 * @property {Float32Array} sinTable
 */

/**
 * @typedef {Object} ChromagramOptions
 * @property {number} [step] - Down-sampling stride (default 4). Higher values are faster but less accurate.
 * @property {number} [minMidi] - Lowest MIDI pitch to include in the analysis (default 0).
 * @property {number} [maxMidi] - Highest MIDI pitch to include in the analysis (default 127).
 * @property {boolean} [suppressHarmonics] - When true the full MIDI range is analyzed so overtones
 *   can be detected and removed.  When false only `[minMidi, maxMidi]` is processed (faster).
 * @property {boolean} [skipSharpening] - When true the post-process harmonic-sharpening pass is skipped.
 * @property {SharedBuffers} [buffers] - Pre-allocated typed arrays to avoid per-call GC pressure.
 * @property {number} [startTime] - Seconds from which to start analysis (default 0).
 * @property {number} [endTime] - Seconds at which to stop analysis (default: full buffer duration).
 * @property {number} [bpm] - Known BPM.  Supplied to skip BPM detection inside {@link identifyPulse}.
 * @property {Function} [onProgress] - Progress callback `(percent: number) => void` (0-100).
 * @property {any} [keyBias] - Result of {@link identifyGlobalKey} used to boost diatonic chord scores.
 * @property {string|null} [bassNote] - Note name of the bass voice (e.g. 'G') for slash-chord detection.
 * @property {Float32Array} [bassChroma] - Low-register chromagram (MIDI 24-47) used to reinforce
 *   bass note evidence when the main chromagram range starts at MIDI 48.
 */

/**
 * @typedef {Object} PulseData
 * @property {number} bpm - Detected (or confirmed) tempo in BPM.
 * @property {number} beatsPerMeasure - Detected meter numerator (2, 3, 4, or 6).
 * @property {number} downbeatOffset - Seconds from the start of the buffer to the first downbeat.
 *   Used by {@link analyze} to align measure boundaries before chord slicing.
 * @property {Array<{bpm: number, score: number}>} candidates - Ranked list of BPM hypotheses
 *   from the autocorrelation search, useful for debugging or multi-tempo recordings.
 */

/**
 * @param {Float32Array} signal
 * @param {number} sampleRate
 * @param {ChromagramOptions} options
 * @param {Array<{midi: number, freq: number, bin: number}>} pitchFrequencies
 * @returns {Float32Array}
 */
function calculateChromagramStandalone(signal, sampleRate, options, pitchFrequencies) {
    let chroma, pitchEnergy, windowValues;

    if (options.buffers) {
        chroma = options.buffers.chroma;
        chroma.fill(0);
        pitchEnergy = options.buffers.pitchEnergy;
        pitchEnergy.fill(0);
    } else {
        chroma = new Float32Array(12).fill(0);
        pitchEnergy = new Float32Array(128).fill(0); // High-res pitch map
    }

    const len = signal.length;
    const step = options.step || 4;
    const minMidi = options.minMidi || 0;
    const maxMidi = options.maxMidi || 127;

    // Pre-calculate window function
    if (options.buffers?.windowValues) {
        windowValues = options.buffers.windowValues;
    } else {
        const numSteps = ceil(len / step);
        windowValues = new Float32Array(numSteps);
        for (let i = 0, idx = 0; i < len; i += step, idx++) {
            windowValues[idx] = 0.5 * (1 - cos((2 * PI * i) / (len - 1)));
        }
    }

    // Optimization: Determine loop bounds based on MIDI range
    // pitchFrequencies starts at MIDI 24 (Index 0)
    let startIdx = 0;
    let endIdx = pitchFrequencies.length;

    if (!options.suppressHarmonics) {
        // If suppression is OFF, we only need to calculate the requested range.
        // clamp to valid array indices
        startIdx = max(0, min(pitchFrequencies.length, minMidi - 24));
        endIdx = max(0, min(pitchFrequencies.length, maxMidi - 24 + 1));
    }

    // Pre-windowing Optimization: Apply window function once, outside the frequency loop.
    let windowedSignal;
    if (options.buffers?.windowedSignal) {
        windowedSignal = options.buffers.windowedSignal;
    } else {
        const numSteps = ceil(len / step);
        windowedSignal = new Float32Array(numSteps);
    }

    for (let i = 0, idx = 0; i < len; i += step, idx++) {
        windowedSignal[idx] = signal[i] * windowValues[idx];
    }

    const useTrigCache = options.buffers?.cosTable && options.buffers.sinTable;

    for (let pfIdx = startIdx; pfIdx < endIdx; pfIdx++) {
        const p = pitchFrequencies[pfIdx];

        let real = 0;
        let imag = 0;
        let cosDelta, sinDelta;

        if (useTrigCache && options.buffers) {
            cosDelta = options.buffers.cosTable[pfIdx];
            sinDelta = options.buffers.sinTable[pfIdx];
        } else {
            const angleStep = (2 * PI * p.freq) / sampleRate;

            // Optimization: Trigonometric recurrence
            const delta = step * angleStep;
            cosDelta = cos(delta);
            sinDelta = sin(delta);
        }

        let c = 1.0; // cos(0)
        let s = 0.0; // sin(0)

        const wsLen = windowedSignal.length;
        // Optimization: Iterate over the windowed buffer directly using a single index.
        // This avoids the 'i' loop variable and step increment in the hot path.
        for (let idx = 0; idx < wsLen; idx++) {
            const sample = windowedSignal[idx];
            real += sample * c;
            imag += sample * s;

            const nextC = c * cosDelta - s * sinDelta;
            const nextS = s * cosDelta + c * sinDelta;
            c = nextC;
            s = nextS;
        }

        pitchEnergy[p.midi] = real * real + imag * imag;
    }

    // Harmonic Suppression: Remove overtones of low fundamentals
    if (options.suppressHarmonics) {
        for (let m = 24; m <= 72; m++) {
            const energy = pitchEnergy[m];
            if (energy <= 0) {
                continue;
            }

            // Suppress 2nd harmonic (Octave) - REDUCED WEIGHTS
            if (m + 12 < 128) {
                pitchEnergy[m + 12] = max(0, pitchEnergy[m + 12] - energy * 0.2);
            }
            // Suppress 3rd harmonic (Perfect 5th + Octave)
            if (m + 19 < 128) {
                pitchEnergy[m + 19] = max(0, pitchEnergy[m + 19] - energy * 0.1);
            }
            // Suppress 4th harmonic (Two Octaves)
            if (m + 24 < 128) {
                pitchEnergy[m + 24] = max(0, pitchEnergy[m + 24] - energy * 0.1);
            }
            // Suppress 5th harmonic (Major 3rd + Two Octaves)
            if (m + 28 < 128) {
                pitchEnergy[m + 28] = max(0, pitchEnergy[m + 28] - energy * 0.05);
            }
        }
    }

    // Map suppressed pitch energy to 12-bin Chroma, RESPECTING minMidi/maxMidi
    for (let m = 24; m <= 96; m++) {
        if (m < minMidi || m > maxMidi) {
            continue;
        }

        const mag = pitchEnergy[m];
        let weight = 1.0;
        // De-emphasize very low notes for chord detection to avoid walking bass interference
        if (m < 48) {
            weight = 0.6;
        } else if (m < 72) {
            weight = 1.2; // Focus on the "meat" of the chords
        } else if (m > 80) {
            weight = 0.5;
        }

        chroma[m % 12] += mag * weight;
    }

    if (options.skipSharpening) {
        return chroma;
    }

    // Apply "Harmonic Sharpening"
    const sharpened = new Float32Array(12);
    for (let i = 0; i < 12; i++) {
        const prev = chroma[(i - 1 + 12) % 12];
        const next = chroma[(i + 1) % 12];
        // Only keep bins that are local maxima to clear out spectral leakage
        // We use a tolerance (0.85) to allow adjacent peaks of similar magnitude (e.g. Major 7th intervals C and B)
        if (chroma[i] >= prev * 0.85 && chroma[i] >= next * 0.85 && chroma[i] > 0.1) {
            sharpened[i] = chroma[i];
        }
    }

    // Normalize
    const maxVal = max.apply(null, Array.from(sharpened));
    if (maxVal > 0) {
        for (let i = 0; i < 12; i++) {
            sharpened[i] /= maxVal;
        }
    }

    return sharpened;
}

/**
 * Lightweight, pure-JS chord and pulse analyzer for the Ensemble Audio Workbench.
 *
 * **Algorithm overview:**
 * 1. {@link identifyPulse} – Spectral-flux onset detection + autocorrelation BPM search +
 *    phase scan for downbeat alignment.  Capped at 30 s of analysis for performance.
 * 2. {@link analyze} – Global key identification (Krumhansl-Schmuckler profiles with tuning
 *    search), then per-beat chromagram extraction with a rolling local-key tracker, finally
 *    {@link identifyChord} applied beat-by-beat with diatonic bias and slash-chord detection.
 *
 * **Assumptions / constraints:**
 * - Input is expected to be a mono (or left-channel) `AudioBuffer`.
 * - `pitchFrequencies` covers MIDI 24–96; analysis below MIDI 24 or above MIDI 96 is not
 *   supported without reinitializing `this.pitchFrequencies`.
 * - The analyzer is designed for typical song recordings (30 s – 5 min).  Very short clips
 *   (< 2 beats) may produce unreliable pulse and chord results.
 * - Reuse a single `ChordAnalyzerLite` instance across multiple calls to share the
 *   pre-computed `pitchFrequencies` table and avoid repeated allocations.
 */
export class ChordAnalyzerLite {
    constructor() {
        /** @type {string[]} */
        this.notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

        /**
         * Pre-calculate frequencies for notes from MIDI 24 (C1) to 96 (C7)
         * @type {Array<{midi: number, freq: number, bin: number}>}
         */
        this.pitchFrequencies = [];
        for (let m = 24; m <= 96; m++) {
            this.pitchFrequencies.push({
                midi: m,
                freq: 440 * 2 ** ((m - 69) / 12),
                bin: m % 12,
            });
        }

        /**
         * Krumhansl-Schmuckler Key Profiles (Major and Minor)
         * Weights used for global key identification.
         * @type {Record<string, number[]>}
         */
        this.keyProfiles = {
            major: [6.5, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 5.0, 2.0, 3.5, 2.0, 3.0],
            minor: [6.5, 2.5, 3.5, 5.0, 2.5, 3.5, 2.5, 4.5, 4.0, 2.5, 3.5, 3.0],
            dominant: [7.5, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 5.0, 2.0, 3.5, 4.5, 2.0], // Stronger Root and b7
            bluesMaj: [7.5, 1.0, 2.0, 2.5, 6.0, 4.0, 1.5, 4.5, 1.5, 2.0, 5.5, 1.0], // Strong 3, b7
            bluesMin: [7.5, 1.0, 2.0, 6.0, 2.0, 4.0, 1.5, 4.5, 1.5, 2.0, 5.5, 1.0], // Strong b3, b7
        };
    }

    /**
     * Identifies the global key and tuning offset of the audio.
     * Includes a high-res rotation check to handle tuning drift.
     * @param {Float32Array} totalChroma
     * @returns {{root: number, type: string, tuningOffset: number}}
     */
    identifyGlobalKey(totalChroma) {
        let bestScore = -1;
        /** @type {{root: number, type: string, tuningOffset: number}} */
        let bestKey = { root: 0, type: 'major', tuningOffset: 0 };
        const rotatedBuffer = new Float32Array(12);

        // Test -2.0 to +2.0 semitones in 0.1 steps (higher res)
        for (let offset = -20; offset <= 20; offset++) {
            const rotatedChroma = this.rotateChroma(totalChroma, offset * 0.1, rotatedBuffer);

            for (let root = 0; root < 12; root++) {
                for (const type of KEY_TYPES) {
                    let score = 0;
                    for (let i = 0; i < 12; i++) {
                        score +=
                            rotatedChroma[(root + i) % 12] *
                            /** @type {any} */ (this.keyProfiles)[type][i];
                    }

                    // Bias towards zero tuning offset (favors standard 440Hz)
                    const offsetBias = 1.0 - abs(offset) * 0.02;
                    // Strong bias towards dominant/blues for groovier signals
                    const typeBias = type.startsWith('blues')
                        ? 1.2
                        : type === 'dominant'
                          ? 1.15
                          : 1.0;

                    score *= offsetBias * typeBias;

                    if (score > bestScore) {
                        bestScore = score;
                        bestKey = { root, type, tuningOffset: offset * 0.1 };
                    }
                }
            }
        }
        return bestKey;
    }

    /**
     * Identifies the key from a chromagram without tuning search.
     * Used for fast local key estimation during analysis.
     * @param {Float32Array} chroma
     * @returns {{root: number, type: string, score: number}}
     */
    identifySimpleKey(chroma) {
        let bestScore = -1;
        /** @type {{root: number, type: string, score: number}} */
        let bestKey = { root: 0, type: 'major', score: 0 };

        for (let root = 0; root < 12; root++) {
            for (const type of KEY_TYPES) {
                let score = 0;
                for (let i = 0; i < 12; i++) {
                    score +=
                        chroma[(root + i) % 12] * /** @type {any} */ (this.keyProfiles)[type][i];
                }

                // Bias (same as Global)
                const typeBias = type.startsWith('blues') ? 1.2 : type === 'dominant' ? 1.15 : 1.0;
                score *= typeBias;

                if (score > bestScore) {
                    bestScore = score;
                    bestKey = { root, type, score };
                }
            }
        }
        return bestKey;
    }

    /**
     * Rotates a 12-bin chromagram by a fractional semitone using linear interpolation.
     * @param {Float32Array} chroma
     * @param {number} amount
     * @param {Float32Array|null} [output=null]
     */
    rotateChroma(chroma, amount, output = null) {
        if (!output && amount === 0) {
            return chroma;
        }

        const result = output || new Float32Array(12);

        if (amount === 0) {
            if (result !== chroma) {
                result.set(chroma);
            }
            return result;
        }

        for (let i = 0; i < 12; i++) {
            const sourceIdx = (i - amount + 12) % 12;
            const idx1 = floor(sourceIdx);
            const idx2 = (idx1 + 1) % 12;
            const frac = sourceIdx - idx1;
            result[i] = chroma[idx1] * (1 - frac) + chroma[idx2] * frac;
        }
        return result;
    }

    /**
     * Analyzes an AudioBuffer and returns detected chords and pulse metadata.
     *
     * Processing is async and yields to the main thread every 10 beats (via `yieldToMain`)
     * so the UI remains responsive during analysis of long clips.
     *
     * @param {AudioBuffer} audioBuffer
     * @param {ChromagramOptions} [options={}]
     * @returns {Promise<{
     *   chords: Array<{beat: number, chord: string | null, energy: number}>,
     *   pulse: PulseData,
     * }>}
     */
    async analyze(audioBuffer, options = {}) {
        // 1. Identify Pulse (BPM, Meter, Downbeat)
        const pulse = await this.identifyPulse(audioBuffer, options);

        // Ensure we have a valid numeric BPM
        let bpm = 120;
        if (typeof options.bpm === 'number' && options.bpm > 0) {
            bpm = options.bpm;
        } else if (typeof pulse.bpm === 'number' && pulse.bpm > 0) {
            bpm = pulse.bpm;
        }

        const beatsPerMeasure = pulse.beatsPerMeasure || 4;

        const sampleRate = audioBuffer.sampleRate;
        let fullSignal = audioBuffer.getChannelData(0); // Mono

        // Handle Trimming & Downbeat Alignment
        // We start analysis exactly on the detected downbeat to ensure measures align.
        const startOffset = options.startTime || 0;
        // In synthetic tests without transients, downbeatOffset might be 0 but we check for sanity
        const alignmentOffset = pulse.downbeatOffset >= 0 ? pulse.downbeatOffset : 0;

        let startSample = floor((startOffset + alignmentOffset) * sampleRate);
        // Safety: If alignment offset pushes us past the end, start at 0
        if (startSample >= fullSignal.length) {
            console.warn(
                `[Analyzer-Lite] Alignment offset (${alignmentOffset.toFixed(3)}s) exceeds signal length. Starting at 0.`,
            );
            startSample = 0;
        }

        const secondsPerBeat = 60 / bpm;
        const samplesPerBeat = floor(secondsPerBeat * sampleRate);

        // Safety: If alignment offset leaves less than one beat, but the original signal was long enough, reset to 0
        if (
            fullSignal.length - startSample < samplesPerBeat &&
            fullSignal.length >= samplesPerBeat
        ) {
            console.warn(
                `[Analyzer-Lite] Alignment offset (${alignmentOffset.toFixed(3)}s) leaves insufficient data (< 1 beat). Resetting to 0.`,
            );
            startSample = floor(startOffset * sampleRate);
        }

        const endSample = options.endTime ? floor(options.endTime * sampleRate) : fullSignal.length;
        const signal = fullSignal.subarray(startSample, endSample);

        const beats = floor(signal.length / samplesPerBeat);

        // --- PASS 1: Global Key Inference ---
        // Analyze the entire signal with a large step to find the consensus key.
        // We raise minMidi to 48 (C3) to ignore the walking bass, which is chromatical and confusing for key detection.
        const globalChroma = this.calculateChromagram(signal, sampleRate, {
            minMidi: 48,
            maxMidi: 84,
            skipSharpening: true,
            suppressHarmonics: false,
            step: max(4, floor(signal.length / 1000000)),
        });
        const globalKey = this.identifyGlobalKey(globalChroma);
        const tuningOffset = globalKey.tuningOffset;

        if (options.onProgress) {
            options.onProgress(15);
        }

        const results = [];
        let lastChord = 'Rest';

        // Local Key Tracking
        const rollingChroma = new Float32Array(12).fill(0);
        const ROLL_DECAY = 0.1; // Fast adaptation for rapid modulation (Coltrane changes)

        // Pre-allocate buffers for analysis loop
        const chromaBuffer = new Float32Array(12);
        const pitchEnergyBuffer = new Float32Array(128);
        const step = 4; // Default step
        const numWindowSteps = ceil(samplesPerBeat / step);
        const windowValuesBuffer = new Float32Array(numWindowSteps);
        const windowedSignalBuffer = new Float32Array(numWindowSteps);

        // Pre-calculate window values
        for (let i = 0, idx = 0; i < samplesPerBeat; i += step, idx++) {
            windowValuesBuffer[idx] = 0.5 * (1 - cos((2 * PI * i) / (samplesPerBeat - 1)));
        }

        // Pre-calculate trig tables for analysis loop
        const cosTable = new Float32Array(this.pitchFrequencies.length);
        const sinTable = new Float32Array(this.pitchFrequencies.length);
        for (let i = 0; i < this.pitchFrequencies.length; i++) {
            const p = this.pitchFrequencies[i];
            const angleStep = (2 * PI * p.freq) / sampleRate;
            const delta = step * angleStep;
            cosTable[i] = cos(delta);
            sinTable[i] = sin(delta);
        }

        const sharedBuffers = {
            chroma: chromaBuffer,
            pitchEnergy: pitchEnergyBuffer,
            windowValues: windowValuesBuffer,
            windowedSignal: windowedSignalBuffer,
            cosTable: cosTable,
            sinTable: sinTable,
        };

        const fullChromaOptions = {
            minMidi: 48,
            maxMidi: 88,
            suppressHarmonics: false,
            step: step,
            buffers: sharedBuffers,
        };

        const bassChromaOptions = {
            minMidi: 24,
            maxMidi: 47,
            suppressHarmonics: false,
            step: step,
            buffers: sharedBuffers,
        };

        const finalChroma = new Float32Array(12);
        const finalBassChroma = new Float32Array(12);

        for (let b = 0; b < beats; b++) {
            if (b % 10 === 0) {
                await yieldToMain();
            }

            const start = b * samplesPerBeat;
            const end = start + samplesPerBeat;
            const window = signal.subarray(start, end);

            // Calculate relative energy for this beat
            let sum = 0;
            const wLen = window.length;
            for (let i = 0; i < wLen; i++) {
                const x = window[i];
                sum += x * x;
            }
            const energy = sqrt(sum / wLen);

            // 1. Full Chromagram (for quality)
            // We raise minMidi to 48 (C3) to ignore the walking bass range for chord quality detection.
            // This prevents bass notes (E, G, A) from being interpreted as the Root of the chord.
            // We DISABLE harmonic suppression because it removes the Chord Root/5th when the Bass plays the Root!
            let chroma = this.calculateChromagram(window, sampleRate, fullChromaOptions);
            chroma = this.rotateChroma(chroma, tuningOffset, finalChroma);

            // Update Rolling Chroma (Local Key Context)
            if (energy > 0.0001) {
                for (let i = 0; i < 12; i++) {
                    rollingChroma[i] = rollingChroma[i] * ROLL_DECAY + chroma[i] * (1 - ROLL_DECAY);
                }
            }
            const localKey = this.identifySimpleKey(rollingChroma);

            // 2. Bass Chromagram (for inversions)
            let bassChroma = this.calculateChromagram(window, sampleRate, bassChromaOptions);
            bassChroma = this.rotateChroma(bassChroma, tuningOffset, finalBassChroma);

            // Identify Chord with Local Key Bias
            let chord = 'Rest';
            if (energy > 0.0001) {
                chord = this.identifyChord(chroma, {
                    keyBias: localKey,
                    bassNote: this.getStrongestBassNote(bassChroma),
                    bassChroma: bassChroma,
                });

                // If it's a weak detection, maybe keep the last chord?
                // This helps with walking bass passing tones.
                if (chord === 'Rest' && lastChord !== 'Rest' && energy > 0.0002) {
                    chord = lastChord;
                }
            }

            results.push({ beat: b, chord, energy, localKey });
            lastChord = chord;

            if (options.onProgress) {
                // Scale progress from 15% to 100%
                options.onProgress(15 + (b / beats) * 85);
            }
        }

        // --- SECOND PASS: Musician Smoothing & Diatonic Sanity ---
        // 1. Look for the consensus chord in a sliding 3-beat window to remove "jitter"
        // 2. Use the Global Key as a "magnetic pull" for ambiguous chords.
        const smoothed = [];
        let lastConsensus = null;

        for (let i = 0; i < results.length; i++) {
            // Sliding window: [Previous, Current, Next]
            const window = results.slice(max(0, i - 1), min(results.length, i + 2));
            /** @type {Record<string, number>} */
            const counts = {};

            window.forEach((/** @type {{chord: string}} */ r) => {
                const chord = r.chord;
                // We keep it simple for now: raw count.
                counts[chord] = (counts[chord] || 0) + 1;
            });

            // Average energy in the same window
            let energySum = 0;
            const wLen = window.length;
            for (let j = 0; j < wLen; j++) {
                energySum += window[j].energy;
            }
            const avgEnergy = energySum / wLen;

            // Pick the winner
            // Optimization: Replace Object.entries().reduce() with a simple for-in loop to avoid
            // intermediate array allocations and callback overhead per beat in the smoothing loop.
            let consensus = null;
            let maxCount = -1;
            for (const chordKey in counts) {
                if (counts[chordKey] > maxCount) {
                    maxCount = counts[chordKey];
                    consensus = chordKey;
                }
            }

            if (consensus !== lastConsensus || (i === 0 && smoothed.length === 0)) {
                smoothed.push({
                    beat: i,
                    time: i * secondsPerBeat,
                    chord: consensus,
                    bpm,
                    energy: avgEnergy,
                });
                lastConsensus = consensus;
            }
        }

        // Final Safety: If smoothed is still empty but we have beats, push a generic result
        if (smoothed.length === 0 && results.length > 0) {
            smoothed.push({
                beat: 0,
                time: 0,
                chord: results[0].chord,
                bpm,
                energy: results[0].energy,
            });
        }

        // Cleanup large local references to assist GC
        /** @type {any} */ (fullSignal) = null;

        return {
            chords: smoothed,
            pulse: {
                bpm,
                candidates: pulse.candidates,
                beatsPerMeasure,
                downbeatOffset: pulse.downbeatOffset,
            },
        };
    }

    /**
     * Extracts the single strongest note per beat from the audio.
     * Used for the "Harmonize Melody" feature.
     * Includes Diatonic Gravity to favor notes within the detected key.
     * @param {AudioBuffer} audioBuffer
     * @param {PulseData} pulseData
     * @param {ChromagramOptions} [options={}]
     * @returns {Promise<Array<{beat: number, midi: number | null, energy: number}>>}
     */
    async extractMelody(audioBuffer, pulseData, options = {}) {
        const signal = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const bpm = pulseData.bpm;
        const secondsPerBeat = 60 / bpm;
        const samplesPerBeat = floor(secondsPerBeat * sampleRate);
        const startSample = floor((pulseData.downbeatOffset || 0) * sampleRate);

        // Safety check
        if (startSample >= signal.length) {
            return [];
        }

        const workingSignal = signal.subarray(startSample);
        const beats = floor(workingSignal.length / samplesPerBeat);
        const rawMelody = [];

        // Key Bias logic
        const keyBias = options.keyBias || null;
        let scale = null;
        if (keyBias) {
            scale = keyBias.type === 'minor' ? MINOR_DIATONIC : MAJOR_DIATONIC;
        }

        // We focus on the vocal range: C3 (48) to C6 (84)
        const minMidi = 48;
        const maxMidi = 84;

        // Pre-calculate trig values for melody extraction loop
        const cosTable = new Float32Array(this.pitchFrequencies.length);
        const sinTable = new Float32Array(this.pitchFrequencies.length);
        const step = 4;
        for (let i = 0; i < this.pitchFrequencies.length; i++) {
            const p = this.pitchFrequencies[i];
            const angleStep = (2 * PI * p.freq) / sampleRate;
            const delta = step * angleStep;
            cosTable[i] = cos(delta);
            sinTable[i] = sin(delta);
        }

        let lastMidi = 60; // Middle C anchor

        for (let b = 0; b < beats; b++) {
            if (b % 20 === 0) {
                await yieldToMain();
            }

            const start = b * samplesPerBeat;
            const end = start + samplesPerBeat;
            const window = workingSignal.subarray(start, end);

            // Calculate energy for this beat to ignore silence
            let sum = 0;
            const wLen = window.length;
            for (let i = 0; i < wLen; i++) {
                const x = window[i];
                sum += x * x;
            }
            const rms = sqrt(sum / wLen);
            if (rms < 0.01) {
                rawMelody.push({ beat: b, midi: null, energy: 0 });
                continue;
            }

            // Find strongest frequency in vocal range
            let maxScore = -1;
            let bestMidi = -1;

            const startIdx = max(0, minMidi - 24);
            const endIdx = min(this.pitchFrequencies.length, maxMidi - 24 + 1);

            for (let pfIdx = startIdx; pfIdx < endIdx; pfIdx++) {
                const p = this.pitchFrequencies[pfIdx];

                let real = 0;
                let imag = 0;
                const cosDelta = cosTable[pfIdx];
                const sinDelta = sinTable[pfIdx];
                let c = 1.0;
                let s = 0.0;

                for (let i = 0; i < window.length; i += 4) {
                    const val = window[i];
                    real += val * c;
                    imag += val * s;

                    const nextC = c * cosDelta - s * sinDelta;
                    const nextS = s * cosDelta + c * sinDelta;
                    c = nextC;
                    s = nextS;
                }

                const energy = real * real + imag * imag;

                // --- 1. Diatonic Gravity ---
                let score = energy;
                if (scale) {
                    const relativePitch = (p.midi - keyBias.root + 12) % 12;
                    if (scale.includes(relativePitch)) {
                        score *= 1.4; // Boost for notes in the detected key
                    }
                }

                // --- 2. Anchor Tone Weighting (Downbeats) ---
                const beatsPerMeasure = pulseData.beatsPerMeasure || 4;
                const beatInMeasure = b % beatsPerMeasure;
                if (beatInMeasure === 0) {
                    score *= 1.5; // Strongest anchor on Beat 1
                } else if (beatInMeasure === 2 && beatsPerMeasure === 4) {
                    score *= 1.25; // Secondary anchor on Beat 3
                }

                // --- 3. Melodic Continuity (Soloist-Inspired) ---
                // Penalize large leaps from the previous detected MIDI note
                const dist = abs(p.midi - lastMidi);
                if (dist > 2) {
                    score *= max(0.1, 1.0 - (dist - 2) * 0.1);
                }

                if (score > maxScore) {
                    maxScore = score;
                    bestMidi = p.midi;
                }
            }

            // Normalize energy score using the raw energy of the winner
            const normalizedEnergy = min(1.0, maxScore / 130);

            rawMelody.push({
                beat: b,
                midi: bestMidi,
                energy: normalizedEnergy,
            });

            if (bestMidi !== -1) {
                lastMidi = bestMidi;
            }
        }

        // --- SECOND PASS: Structural Smoothing ---
        const smoothedMelody = [];
        for (let i = 0; i < rawMelody.length; i++) {
            const prev = rawMelody[i - 1];
            const curr = rawMelody[i];
            const next = rawMelody[i + 1];

            // 1. Remove isolated "jitter" notes surrounded by silence
            if (prev && next && curr.midi !== null && prev.midi === null && next.midi === null) {
                smoothedMelody.push({ ...curr, midi: null, energy: 0 });
            }
            // 2. Correction for oscillating jitter (A B A -> A A A) or outliers
            else if (
                prev &&
                next &&
                curr.midi !== null &&
                prev.midi !== null &&
                next.midi !== null
            ) {
                const distPrev = abs(curr.midi - prev.midi);
                const distNext = abs(curr.midi - next.midi);

                // If it's a sudden leap and return (Outlier Blip)
                if (distPrev > 7 && distNext > 7 && prev.midi === next.midi) {
                    smoothedMelody.push({ ...curr, midi: prev.midi });
                } else if (prev.midi === next.midi && curr.midi !== prev.midi) {
                    // Standard jitter (A B A where B is close but different)
                    smoothedMelody.push({ ...curr, midi: prev.midi });
                } else {
                    smoothedMelody.push(curr);
                }
            } else {
                smoothedMelody.push(curr);
            }
        }

        return smoothedMelody;
    }

    /**
     * Identifies the "Pulse" (BPM, Meter, and Downbeat) of the audio using
     * Spectral Flux for robust onset detection and autocorrelation.
     * Includes "Top-Down" structural snapping based on clip duration.
     *
     * Analysis is limited to the first 30 s of audio for performance; longer clips
     * are assumed to have a consistent tempo and meter throughout.
     *
     * @param {AudioBuffer} audioBuffer
     * @param {ChromagramOptions} [options={}]
     * @returns {Promise<PulseData>}
     */
    async identifyPulse(audioBuffer, options = {}) {
        const signal = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;

        // Use effective duration from options (trim) or buffer
        const startTime = options.startTime || 0;
        const rawEndTime = options.endTime || audioBuffer.duration;
        let effectiveEndTime = rawEndTime;

        const durationRaw = rawEndTime - startTime;

        // If a valid BPM is provided, we skip the search and just find the downbeat
        const manualBpm = typeof options.bpm === 'number' && options.bpm > 0 ? options.bpm : 0;

        // 1. Calculate Spectral Flux...
        // We use 20ms windows (50Hz resolution) to capture transients
        const winSize = floor(sampleRate * 0.02);
        const hopSize = floor(sampleRate * 0.01); // 10ms hop

        // Only analyze first 30s for pulse to save time (unless duration is close)
        const pulseMaxSeconds = max(30, durationRaw + 1);
        const numWindows = floor(min(signal.length, sampleRate * pulseMaxSeconds) / hopSize) - 2;

        const flux = new Float32Array(numWindows);
        let lastSpectrum = new Float32Array(12); // Use 12-bin chroma spectrum for flux

        // Pre-allocate buffers for reuse in the loop
        const chromaBuffer = new Float32Array(12);
        const pitchEnergyBuffer = new Float32Array(128);
        const step = 8;
        const numWindowSteps = ceil(winSize / step);
        const windowValuesBuffer = new Float32Array(numWindowSteps);
        const windowedSignalBuffer = new Float32Array(numWindowSteps);

        // Pre-calculate window values for this winSize
        for (let i = 0, idx = 0; i < winSize; i += step, idx++) {
            windowValuesBuffer[idx] = 0.5 * (1 - cos((2 * PI * i) / (winSize - 1)));
        }

        // Pre-calculate trig tables for pulse detection loop
        const cosTable = new Float32Array(this.pitchFrequencies.length);
        const sinTable = new Float32Array(this.pitchFrequencies.length);
        for (let i = 0; i < this.pitchFrequencies.length; i++) {
            const p = this.pitchFrequencies[i];
            const angleStep = (2 * PI * p.freq) / sampleRate;
            const delta = step * angleStep;
            cosTable[i] = cos(delta);
            sinTable[i] = sin(delta);
        }

        const calcOptions = {
            step: step,
            skipSharpening: true,
            minMidi: 48, // Focus on rhythmic range (C3 and up, ignoring walking bass)
            maxMidi: 96,
            suppressHarmonics: false,
            buffers: {
                chroma: chromaBuffer,
                pitchEnergy: pitchEnergyBuffer,
                windowValues: windowValuesBuffer,
                windowedSignal: windowedSignalBuffer,
                cosTable: cosTable,
                sinTable: sinTable,
            },
        };

        let lastActiveHop = 0;
        for (let w = 0; w < numWindows; w++) {
            if (w % 500 === 0) {
                await yieldToMain();
            }

            const start = w * hopSize;
            const window = signal.subarray(start, start + winSize);

            const currentSpectrum = this.calculateChromagram(window, sampleRate, calcOptions);

            let sum = 0;
            for (let i = 0; i < 12; i++) {
                const diff = currentSpectrum[i] - lastSpectrum[i];
                if (diff > 0) {
                    sum += diff;
                }
            }
            flux[w] = sum;
            if (sum > 0.001) {
                lastActiveHop = w; // Track last activity
            }
            lastSpectrum.set(currentSpectrum);
        }

        // --- Flux-Based Tail Compensation ---
        // Use the last detected transient to determine the musical end.
        // We add a small buffer (0.5s) to the last transient.
        effectiveEndTime = min(rawEndTime, (lastActiveHop * hopSize + winSize) / sampleRate + 0.5);

        // If the trimmed duration is very close to the raw duration, don't trim.
        if (rawEndTime - effectiveEndTime < 0.2) {
            effectiveEndTime = rawEndTime;
        }

        const duration = effectiveEndTime - startTime;

        // Half-wave rectification and normalization of flux
        const maxFlux = max.apply(null, Array.from(flux));
        const onsets = new Float32Array(flux.length);
        const invMaxFlux = 1 / (maxFlux || 1);
        for (let i = 0; i < flux.length; i++) {
            onsets[i] = flux[i] * invMaxFlux;
        }

        if (options.onProgress) {
            options.onProgress(5);
        }

        // 2. Generate Structural BPM Candidates (Top-Down)
        // If the user meant 120BPM for a 16-bar phrase, it's 32.0s exactly.
        /** @type {any[]} */
        const structuralCandidates = [];
        const commonBarCounts = [4, 8, 12, 16, 24, 32, 48, 64];
        const commonMeters = [4, 3];

        commonBarCounts.forEach((/** @type {number} */ bars) => {
            commonMeters.forEach((/** @type {number} */ meter) => {
                const totalBeats = bars * meter;
                let bpm = (totalBeats * 60) / duration;

                // Favor integers for structural targets if very close
                if (abs(bpm - round(bpm)) < 0.1) {
                    bpm = round(bpm);
                }

                if (bpm >= 50 && bpm <= 200) {
                    structuralCandidates.push({
                        bpm,
                        bars,
                        meter,
                        lag: round(60 / (bpm * 0.01)),
                    });
                }
            });
        });

        // 3. Find BPM via autocorrelation (Search range: 25 - 240 BPM)
        const minLag = 25;
        const maxLag = 240;
        let bestLag = 60;
        let maxCorr = -1;
        const correlations = new Float32Array(maxLag + 1);

        if (manualBpm > 0) {
            bestLag = round(60 / (manualBpm * 0.01));
        } else {
            for (let lag = minLag; lag <= maxLag; lag++) {
                if (lag % 20 === 0) {
                    await yieldToMain();
                }

                let corr = 0;
                for (let i = 0; i < onsets.length - lag; i++) {
                    corr += onsets[i] * onsets[i + lag];
                }

                // --- Top-Down Structural Bias ---
                let structuralBoost = 1.0;
                const currentBPM = 60 / (lag * 0.01);

                for (const cand of structuralCandidates) {
                    const bpmDiff = abs(currentBPM - cand.bpm);
                    // If within 2.5%, apply a boost. Favor closer matches.
                    if (bpmDiff < cand.bpm * 0.025) {
                        structuralBoost = max(
                            structuralBoost,
                            2.0 * (1 - bpmDiff / (cand.bpm * 0.025)),
                        );
                    }
                }

                // Musical Range Bias: Favor 60-160 BPM
                let rangeBias = 1.0;
                if (lag >= 42 && lag <= 75) {
                    rangeBias = 1.25;
                } else if (lag >= 37 && lag <= 100) {
                    rangeBias = 1.1;
                } else if (lag > 120) {
                    rangeBias = 0.8;
                }

                const biasedScore = corr * rangeBias * structuralBoost;
                correlations[lag] = biasedScore;

                if (biasedScore > maxCorr) {
                    maxCorr = biasedScore;
                    bestLag = lag;
                }
            }
        }
        if (options.onProgress) {
            options.onProgress(5);
        }

        // Harmonic Check: Detect if we picked a "sub-beat" pulse (too fast) or "measure" pulse (too slow)
        const checkHarmonic = (/** @type {number} */ targetLag) => {
            let currentLag = targetLag;

            // 1. Check for slower tempos (downward)
            let changed = true;
            while (changed) {
                changed = false;
                for (const m of [2, 3, 4]) {
                    const slowerLag = round(currentLag * m);
                    if (slowerLag > maxLag) {
                        continue;
                    }

                    const scoreSlower = correlations[slowerLag];
                    const targetScore = correlations[currentLag];

                    let threshold = 0.75;
                    // Be reluctant to slow down if we are already in a good range
                    if (currentLag >= 46 && currentLag <= 85) {
                        threshold = 1.3;
                    }
                    if (slowerLag > 120) {
                        threshold = 2.5;
                    }

                    if (scoreSlower > targetScore * threshold) {
                        currentLag = slowerLag;
                        changed = true;
                        break;
                    }
                }
            }

            // 2. Check for faster tempos (upward)
            // If we are "stuck in the mud" (< 70 BPM), check if we missed a faster pulse
            changed = true;
            while (changed) {
                changed = false;
                if (currentLag > 85) {
                    // < 70 BPM
                    for (const m of [2, 3, 4]) {
                        const fasterLag = round(currentLag / m);
                        if (fasterLag < minLag) {
                            continue;
                        }

                        const scoreFaster = correlations[fasterLag];
                        const scoreCurrent = correlations[currentLag];

                        // If the faster pulse is at least 40% of the slow one, take it.
                        // We give a bonus if the faster pulse is in the sweet spot.
                        const bonus = fasterLag >= 42 && fasterLag <= 75 ? 1.5 : 1.0;

                        if (scoreFaster * bonus > scoreCurrent * 0.5) {
                            currentLag = fasterLag;
                            changed = true;
                            break;
                        }
                    }
                }
            }

            return currentLag;
        };
        bestLag = checkHarmonic(bestLag);

        // --- Final Snap to Structural Grid ---
        let primaryBPM = 60 / (bestLag * 0.01);
        const snapThresholdBPM = 2.5; // Snap if within 2.5 BPM of a structural target
        let bestStructuralMatch = null;

        // 1. Check for a structural match using the EFFECTIVE (tail-trimmed) duration
        // This is preferred as it ignores silent tails.
        bestStructuralMatch = structuralCandidates
            .filter((/** @type {any} */ c) => abs(c.bpm - primaryBPM) < snapThresholdBPM)
            .sort((a, b) => abs(a.bpm - primaryBPM) - abs(b.bpm - primaryBPM))[0];

        if (bestStructuralMatch) {
            primaryBPM = parseFloat(bestStructuralMatch.bpm.toFixed(2));
            bestLag = round(60 / (primaryBPM * 0.01));
        } else {
            // 2. Otherwise, check if the RAW primary BPM matches a structural anchor for the FULL duration
            // This handles perfectly trimmed loops where tail-trimming might be too aggressive.
            const fullDuration = rawEndTime - startTime;
            /** @type {any[]} */
            const structuralCandidatesFull = [];
            [4, 8, 12, 16, 24, 32, 48, 64].forEach((/** @type {number} */ bars) => {
                [4, 3].forEach((/** @type {number} */ meter) => {
                    const bpm = (bars * meter * 60) / fullDuration;
                    if (bpm >= 50 && bpm <= 200) {
                        structuralCandidatesFull.push({ bpm, bars, meter });
                    }
                });
            });

            bestStructuralMatch = structuralCandidatesFull
                .filter((/** @type {any} */ c) => abs(c.bpm - primaryBPM) < snapThresholdBPM)
                .sort((a, b) => abs(a.bpm - primaryBPM) - abs(b.bpm - primaryBPM))[0];

            if (bestStructuralMatch) {
                primaryBPM = parseFloat(bestStructuralMatch.bpm.toFixed(2));
                bestLag = round(60 / (primaryBPM * 0.01));
            }
        }

        // Generate candidates
        const candidatesMap = new Map();
        [2, 1, 0.5, 4, 0.25].forEach((/** @type {number} */ mult) => {
            const lag = round(bestLag * mult);
            if (lag >= minLag && lag <= maxLag) {
                const bpm = mult === 1 ? primaryBPM : round(60 / (lag * 0.01));
                if (!candidatesMap.has(bpm)) {
                    candidatesMap.set(bpm, correlations[lag] || 0);
                }
            }
        });

        const candidates = [];
        for (const [bpm, score] of Array.from(candidatesMap.entries())) {
            candidates.push({ bpm, score });
        }
        const primaryCandidate = candidates.find(
            (/** @type {{bpm: number, score: number}} */ c) => c.bpm === primaryBPM,
        );

        // If we have a structural match, give it an overwhelming score boost to ensure it wins
        if (primaryCandidate) {
            primaryCandidate.score *= bestStructuralMatch ? 100.0 : 3.0;
        }
        candidates.sort(
            (
                /** @type {{bpm: number, score: number}} */ a,
                /** @type {{bpm: number, score: number}} */ b,
            ) => b.score - a.score,
        );

        // 4. Meter Detection (3/4 vs 4/4)
        // If we snapped to a structural match, use its meter!
        let beatsPerMeasure = bestStructuralMatch ? bestStructuralMatch.meter : 4;

        if (!bestStructuralMatch) {
            let score3 = 0;
            let score4 = 0;
            const lag3 = bestLag * 3;
            const lag4 = bestLag * 4;
            if (onsets.length > lag4) {
                for (let i = 0; i < onsets.length - lag4; i++) {
                    score3 += onsets[i] * onsets[i + lag3];
                    score4 += onsets[i] * onsets[i + lag4];
                }
            }
            beatsPerMeasure = score3 > score4 * 1.4 ? 3 : 4;
        }

        // 5. Downbeat Detection (Phase Alignment)
        const measureSteps = bestLag * beatsPerMeasure;
        const phaseScores = new Float32Array(measureSteps);
        for (let i = 0; i < onsets.length; i++) {
            phaseScores[i % measureSteps] += onsets[i];
        }

        let bestPhase = 0;
        let maxPhaseScore = 0;
        for (let p = 0; p < measureSteps; p++) {
            if (phaseScores[p] > maxPhaseScore) {
                maxPhaseScore = phaseScores[p];
                bestPhase = p;
            }
        }

        lastSpectrum = /** @type {any} */ (null);

        let finalBpm = candidates[0]?.bpm || primaryBPM;
        // Near-integer rounding (e.g. 119.78 -> 120)
        if (abs(finalBpm - round(finalBpm)) < 0.3) {
            finalBpm = round(finalBpm);
        }

        return {
            bpm: finalBpm,
            candidates: candidates.length > 0 ? candidates : [{ bpm: finalBpm, score: 1 }],
            beatsPerMeasure,
            downbeatOffset: bestPhase * 0.01,
        };
    }

    /**
     * Extracts the single strongest note from a bass-specific chromagram.
     * @param {Float32Array} bassChroma - 12-bin chroma vector covering MIDI 24-47.
     * @returns {string|null} Note name (e.g. 'G') or null if the chromagram is silent.
     */
    getStrongestBassNote(bassChroma) {
        let maxBass = 0;
        let bassNoteIdx = -1;
        for (let i = 0; i < 12; i++) {
            if (bassChroma[i] > maxBass) {
                maxBass = bassChroma[i];
                bassNoteIdx = i;
            }
        }
        return bassNoteIdx > -1 ? this.notes[bassNoteIdx] : null;
    }

    /**
     * Calculates energy in 12 semitone bins using a bank of targeted
     * single-frequency filters with Hann windowing and Harmonic Suppression.
     * Thin wrapper over {@link calculateChromagramStandalone} that injects
     * `this.pitchFrequencies` (MIDI 24-96 pre-computed table).
     * @param {Float32Array} signal
     * @param {number} sampleRate
     * @param {ChromagramOptions} [options={}]
     * @returns {Float32Array} 12-element chroma vector, values roughly 0.0 – 1.0+ (not normalized).
     */
    calculateChromagram(signal, sampleRate, options = {}) {
        return calculateChromagramStandalone(signal, sampleRate, options, this.pitchFrequencies);
    }

    /**
     * Identifies the most likely chord name from a 12-bin chromagram.
     *
     * Scoring combines:
     *  - Profile match against {@link CHORD_PROFILES} (required intervals boost, absent intervals penalize)
     *  - Global key diatonic bias (`options.keyBias`)
     *  - 7th-chord sanity check (avoids false positives from key-bias overtones)
     *  - Simplicity bias (slight penalty for complex chord types to favour triads when scores are close)
     *  - Slash-chord detection using `options.bassNote` and `options.bassChroma`
     *
     * Returns 'Rest' when total chromagram energy is below 0.05 (silence threshold).
     *
     * @param {Float32Array} chroma - 12-bin chromagram (e.g. output of {@link calculateChromagram}).
     * @param {ChromagramOptions} [options={}]
     * @returns {string} Chord name string (e.g. 'Cmaj7', 'Gm', 'F/A') or 'Rest'.
     */
    identifyChord(chroma, options = {}) {
        let bestScore = -1;
        let bestChordData = { root: 0, type: 'maj' };

        for (let root = 0; root < 12; root++) {
            for (const [type, profile] of CHORD_PROFILE_ENTRIES) {
                let score = 0;
                const _typedProfile = /** @type {any} */ (profile);

                // 1. Profile Match
                for (let i = 0; i < 12; i++) {
                    const chromaIdx = (root + i) % 12;
                    const val = chroma[chromaIdx];
                    if (/** @type {any} */ (profile)[i]) {
                        let effectiveVal = val;
                        if (
                            val < 0.1 &&
                            options.bassChroma &&
                            options.bassChroma[chromaIdx] > 0.1
                        ) {
                            effectiveVal = options.bassChroma[chromaIdx];
                        }

                        score += effectiveVal * /** @type {any} */ (profile)[i];
                        if (effectiveVal < 0.1) {
                            score -= 2.0; // Penalty for missing a required note
                        }
                    } else {
                        score -= val * 0.5;
                    }
                }

                // 2. Global Key Bias
                if (options.keyBias) {
                    const relativeRoot = (root - options.keyBias.root + 12) % 12;
                    let isDiatonic = false;

                    if (options.keyBias.type === 'major') {
                        isDiatonic = MAJOR_DIATONIC.includes(relativeRoot);
                    } else if (options.keyBias.type === 'minor') {
                        isDiatonic = MINOR_DIATONIC.includes(relativeRoot);
                    } else if (options.keyBias.type === 'dominant') {
                        // Mixolydian: I7, II, iii, IV, v, vi, bVII
                        isDiatonic = [0, 2, 4, 5, 7, 9, 10].includes(relativeRoot);
                        if (isDiatonic && type === '7' && [0, 5, 7, 10].includes(relativeRoot)) {
                            score *= 1.2; // Extra boost for 7th chords in blues
                        }
                    } else if (options.keyBias.type.startsWith('blues')) {
                        // Blues Scale-ish: I7, IV7, V7 are kings. bIII, bVI, bVII are common.
                        // Major: I, IV, V.  Minor: i, iv, v.
                        // Roots: 0, 3, 5, 7, 10
                        if ([0, 5, 7].includes(relativeRoot) && type === '7') {
                            score *= 1.35; // Primary Blues Chords
                        } else if ([3, 10].includes(relativeRoot)) {
                            score *= 1.15; // Secondary Blues Chords
                        }
                        isDiatonic = [0, 3, 5, 7, 10].includes(relativeRoot);
                    }

                    if (isDiatonic) {
                        score *= 1.3; // 30% boost for diatonic chords
                    }
                }

                // Sanity Check for 7th Chords
                // If a chord claims to be a 7th but has minimal energy in the 7th interval,
                // penalize it to prevent false positives from bias/overtones.
                if (type === '7' || type === 'm7' || type === 'maj7') {
                    const seventhIdx = type === 'maj7' ? 11 : 10;
                    const absSeventhIdx = (root + seventhIdx) % 12;
                    if (chroma[absSeventhIdx] < 0.15) {
                        score *= 0.6;
                    }
                }

                // Simplicity Bias: Slight penalty for complex chords to favor triads if scores are close
                if (['maj7', 'm7', '6', 'm6', 'dim7'].includes(type)) {
                    score *= 0.96;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestChordData = { root, type };
                }
            }
        }

        let energy = 0;
        for (let i = 0; i < chroma.length; i++) {
            energy += chroma[i];
        }
        if (energy < 0.05) {
            return 'Rest';
        }

        let chordName =
            this.notes[bestChordData.root] +
            (bestChordData.type === 'maj' ? '' : bestChordData.type);

        // 3. Slash Chord Detection (Inversions)
        if (options.bassNote && options.bassNote !== this.notes[bestChordData.root]) {
            // Check if bass note is strong relative to total energy
            let totalEnergy = 0;
            for (let i = 0; i < chroma.length; i++) {
                totalEnergy += chroma[i];
            }
            /** @type {any} */
            const notes = this.notes;
            const bassIdx = notes.indexOf(options.bassNote);

            let bassEnergy = chroma[bassIdx];
            // If bassChroma is provided, use it to capture energy below the main analysis range (e.g. C1-B2)
            if (options.bassChroma) {
                bassEnergy = max(bassEnergy, options.bassChroma[bassIdx]);
            }

            // Significant bass presence (at least 12% of total chromagram energy to avoid jitter in walking lines)
            if (bassEnergy > totalEnergy * 0.12) {
                const root = bestChordData.root;
                const interval = (bassIdx - root + 12) % 12;
                // Only consider 3rd or 5th as stable inversions for this demo
                // IGNORE 7th in bass as it's often a passing tone or just muddy
                const isStableInversion = [3, 4, 7].includes(interval);

                if (isStableInversion) {
                    chordName += `/${options.bassNote}`;
                }
            }
        }

        return chordName;
    }
}
