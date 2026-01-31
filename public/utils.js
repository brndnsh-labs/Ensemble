import { ENHARMONIC_MAP } from './config.js';

/**
 * Normalizes a note name (e.g., C# to Db) based on the project's map.
 * @param {string} k - The note name to normalize.
 * @returns {string} The normalized note name.
 */
export function normalizeKey(k) { 
    return ENHARMONIC_MAP[k] || k; 
}

/**
 * Escapes unsafe HTML characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') return String(str);

    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;');
}

/**
 * Strips dangerous characters from musical input strings to prevent XSS.
 * Allows common musical symbols but removes HTML/Script vectors.
 * @param {string} str
 * @returns {string}
 */
export function stripDangerousChars(str) {
    if (!str) return '';
    if (typeof str !== 'string') return String(str);
    // Remove < > " ` (Keep ' and & for text validity, relying on escaping for those)
    return str.replace(/[<>"=`]/g, '');
}

/**
 * Converts a MIDI note number to a frequency in Hertz.
 * @param {number} midi - The MIDI note number.
 * @returns {number} The frequency in Hz.
 */
export function getFrequency(midi) { 
    return 440 * Math.pow(2, (midi - 69) / 12); 
}

/**
 * Converts a MIDI note number to an object containing its note name and octave.
 * @param {number} midi - The MIDI note number.
 * @returns {{name: string, octave: number}}
 */
export function midiToNote(midi) {
    const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    return {
        name: notes[midi % 12],
        octave: Math.floor(midi / 12) - 1
    };
}

/**
 * Converts a frequency in Hertz to a MIDI note number.
 * @param {number} freq - The frequency in Hz.
 * @returns {number} The MIDI note number.
 */
export function getMidi(freq) {
    if (!freq || freq <= 0) return null;
    return Math.round(12 * Math.log2(freq / 440) + 69);
}

/**
 * Generates a unique ID for sections.
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Compresses the sections array into a Base64 string, handling Unicode.
 * @param {Array} sections 
 * @returns {string}
 */
export function compressSections(sections) {
    const minified = sections.map(s => {
        const m = { l: s.label, v: s.value };
        if (s.key) m.k = s.key;
        if (s.repeat && s.repeat > 1) m.r = s.repeat;
        if (s.timeSignature) m.t = s.timeSignature;
        if (s.seamless) m.s = 1;
        return m;
    });
    const json = JSON.stringify(minified);
    const bytes = new TextEncoder().encode(json);
    const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
    return btoa(binString);
}

/**
 * Decompresses the Base64 string back into sections, handling Unicode.
 * @param {string} str 
 * @returns {Array}
 */
export function decompressSections(str) {
    try {
        if (!str || typeof str !== 'string') throw new Error("Invalid input");
        // Limit input size to 100KB to prevent memory exhaustion
        if (str.length > 102400) throw new Error("Payload too large");

        const binString = atob(str);
        const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
        const json = new TextDecoder().decode(bytes);
        const minified = JSON.parse(json);

        if (!Array.isArray(minified)) throw new Error("Invalid format: expected array");
        // Limit number of sections to prevent DoS
        const safeMinified = minified.slice(0, 500);

        return safeMinified.map((s, i) => {
            // Sanitize label to prevent XSS (even though likely handled by UI framework, defense in depth)
            let safeLabel = escapeHTML(s.l || `Section ${i+1}`);
            if (safeLabel.length > 100) safeLabel = safeLabel.substring(0, 100);

            // Clamp value length
            let safeValue = typeof s.v === 'string' ? s.v : '';
            if (safeValue.length > 1000) safeValue = safeValue.substring(0, 1000);

            safeValue = stripDangerousChars(safeValue);

            return {
                id: generateId(),
                label: safeLabel,
                value: safeValue,
                key: typeof s.k === 'string' ? escapeHTML(s.k) : '',
                repeat: Math.min(Math.max(1, parseInt(s.r) || 1), 64), // Clamp repeats
                timeSignature: typeof s.t === 'string' && s.t.length < 10 ? s.t : '',
                seamless: !!s.s
            };
        });
    } catch (e) {
        console.error("Failed to decompress sections", e);
        return [{ id: generateId(), label: 'Intro', value: 'I | IV' }];
    }
}

/**
 * Calculates the number of 16th-note (or equivalent) steps per measure for a given time signature.
 * @param {string} ts - Time signature (e.g. "4/4", "3/4", "6/8").
 * @returns {number}
 */
export function getStepsPerMeasure(ts) {
    if (ts === '2/4') return 8;
    if (ts === '3/4') return 12;
    if (ts === '6/8') return 12;
    if (ts === '7/8') return 14;
    if (ts === '5/4') return 20;
    if (ts === '7/4') return 28;
    if (ts === '12/8') return 24;
    return 16;
}

/**
 * Returns detailed structural information about a specific step in a measure.
 * @param {number} step - The global step counter.
 * @param {Object} tsConfig - The global time signature configuration (fallback).
 * @param {Array} [measureMap] - Optional map of measure boundaries for variable time signatures.
 * @param {Object} [allTSConfigs] - Map of all available time signature configurations.
 * @returns {Object} { isMeasureStart, isGroupStart, isBeatStart, groupIndex, beatInGroup, tsName }
 */
export function getStepInfo(step, tsConfig, measureMap, allTSConfigs) {
    let currentTS = tsConfig;
    let tsName = `${tsConfig.beats}/${tsConfig.stepsPerBeat === 4 ? 4 : 8}`;
    let mStep = step;
    let isMeasureStart = false;

    if (measureMap && measureMap.length > 0) {
        // Binary search for O(log N) lookup instead of O(N) find
        let measure = null;
        let low = 0;
        let high = measureMap.length - 1;

        while (low <= high) {
            const mid = (low + high) >>> 1;
            const m = measureMap[mid];
            if (step >= m.start && step < m.end) {
                measure = m;
                break;
            } else if (step < m.start) {
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }

        if (measure) {
            tsName = measure.ts;
            currentTS = allTSConfigs ? allTSConfigs[tsName] : tsConfig;
            mStep = step - measure.start;
            if (mStep === 0) isMeasureStart = true;
        } else {
            // Fallback for steps beyond the map
            const spm = getStepsPerMeasure(tsName);
            mStep = step % spm;
            isMeasureStart = mStep === 0;
        }
    } else {
        const spm = getStepsPerMeasure(tsName);
        mStep = step % spm;
        isMeasureStart = mStep === 0;
    }
    
    const grouping = currentTS.grouping || [currentTS.beats];
    const stepsPerBeat = currentTS.stepsPerBeat;
    
    let accumulatedSteps = 0;
    let isGroupStart = false;
    let groupIndex = -1;
    let stepInGroup = -1;

    for (let i = 0; i < grouping.length; i++) {
        const groupBeats = grouping[i];
        const groupSteps = groupBeats * stepsPerBeat;
        
        if (mStep >= accumulatedSteps && mStep < accumulatedSteps + groupSteps) {
            groupIndex = i;
            stepInGroup = mStep - accumulatedSteps;
            if (stepInGroup === 0) isGroupStart = true;
            break;
        }
        accumulatedSteps += groupSteps;
    }

    const isBeatStart = (mStep % stepsPerBeat === 0);
    const beatIndex = Math.floor(mStep / stepsPerBeat);

    return {
        isMeasureStart,
        isGroupStart,
        isBeatStart,
        groupIndex,
        stepInGroup,
        beatIndex,
        mStep,
        tsName
    };
}

/**
 * Safely disconnects multiple Web Audio nodes.
 * @param {AudioNode[]} nodes 
 */
export function safeDisconnect(nodes) {
    nodes.forEach(node => {
        if (node) {
            try { node.disconnect(); } catch { /* ignore disconnect error */ }
        }
    });
}

/**
 * Creates a simple algorithmic reverb impulse response.
 * @param {AudioContext} audioCtx 
 * @param {number} duration 
 * @param {number} decay 
 * @returns {AudioBuffer}
 */
export function createReverbImpulse(audioCtx, duration = 2.0, decay = 2.0) {
    const sampleRate = audioCtx.sampleRate;
    const length = sampleRate * duration;
    const impulse = audioCtx.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
    }
    return impulse;
}

/**
 * Replaces ASCII # and b with Unicode ♯ and ♭ for display.
 * @param {string} str - The string to format.
 * @returns {string}
 */
export function formatUnicodeSymbols(str) {
    if (!str) return str;
    return str
        .replace(/#/g, '♯')
        .replace(/([A-G])b/g, '$1♭')
        .replace(/b(?=[0-9IVivm\-/])/g, '♭');
}

let cachedSoftClipCurve = null;

/**
 * Creates a soft-clipping curve for the WaveShaperNode.
 * Cached for performance.
 * @returns {Float32Array}
 */
export function createSoftClipCurve() {
    if (cachedSoftClipCurve) return cachedSoftClipCurve;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        // Normalized monotonic cubic: f(x) = (3x - x^3) / 2
        curve[i] = (3 * x - Math.pow(x, 3)) / 2;
    }
    cachedSoftClipCurve = curve;
    return curve;
}

/**
 * Clamps a frequency value to be within the safe range for Web Audio BiquadFilters.
 * @param {number} freq
 * @param {number} max
 * @returns {number}
 */
export function clampFreq(freq, max = 24000) {
    // Nominal range for most browser implementations of BiquadFilter is [0, 24000]
    return Math.min(Math.max(0, freq), max);
}
