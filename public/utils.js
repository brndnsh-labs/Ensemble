import { ENHARMONIC_MAP } from './config.js';

/**
 * Normalizes a note name (e.g., C# to Db) based on the project's map.
 * @param {string} k - The note name to normalize.
 * @returns {string} The normalized note name.
 */
export function normalizeKey(k) {
    return ENHARMONIC_MAP[k] || k;
}

const REGEX_AMP = /&/g;
const REGEX_LT = /</g;
const REGEX_GT = />/g;
const REGEX_QUOT = /"/g;
const REGEX_APOS = /'/g;
const REGEX_BACKTICK = /`/g;

/**
 * Escapes unsafe HTML characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHTML(str) {
    if (str === null || str === undefined) {
        return '';
    }
    if (typeof str !== 'string') {
        return String(str);
    }

    return str
        .replace(REGEX_AMP, '&amp;')
        .replace(REGEX_LT, '&lt;')
        .replace(REGEX_GT, '&gt;')
        .replace(REGEX_QUOT, '&quot;')
        .replace(REGEX_APOS, '&#39;')
        .replace(REGEX_BACKTICK, '&#96;');
}

const REGEX_DANGEROUS = /[<>"=`]/g;

/**
 * Strips dangerous characters from musical input strings to prevent XSS.
 * Allows common musical symbols but removes HTML/Script vectors.
 * @param {string} str
 * @returns {string}
 */
export function stripDangerousChars(str) {
    if (!str) {
        return '';
    }
    if (typeof str !== 'string') {
        return String(str);
    }
    // Remove < > " ` (Keep ' and & for text validity, relying on escaping for those)
    return str.replace(REGEX_DANGEROUS, '');
}

// Pre-calculate frequencies for standard MIDI range (0-127) to avoid expensive Math.pow calls
const FREQUENCY_CACHE = new Float32Array(128);
for (let i = 0; i < 128; i++) {
    FREQUENCY_CACHE[i] = 440 * 2 ** ((i - 69) / 12);
}

/**
 * Converts a MIDI note number to a frequency in Hertz.
 * @param {number} midi - The MIDI note number.
 * @returns {number} The frequency in Hz.
 */
export function getFrequency(midi) {
    // Fast path: lookup from cache if within 0-127 and integer
    // Float32Array returns undefined for out-of-bounds or non-integer indices
    const freq = FREQUENCY_CACHE[midi];
    if (freq !== undefined) {
        return freq;
    }

    // Slow path: calculate for extended range or microtonal values
    return 440 * 2 ** ((midi - 69) / 12);
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
        octave: Math.floor(midi / 12) - 1,
    };
}

/**
 * Converts a frequency in Hertz to a MIDI note number.
 * @param {number} freq - The frequency in Hz.
 * @returns {number} The MIDI note number.
 */
export function getMidi(freq) {
    if (!freq || freq <= 0) {
        return null;
    }
    return Math.round(12 * Math.log2(freq / 440) + 69);
}

/**
 * Generates a unique ID for sections.
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Calculates MIDI notes for specific scale degrees (Full 10-note scale)
 * based on a given chord object.
 *
 * @param {Object} chordObj - The chord object containing rootMidi and quality.
 * @param {number} baseOctave - The default octave to use (default: 4 for Soloist).
 * @returns {number[]} Array of 10 MIDI note numbers.
 *                     [0-4]: Odd degrees (1, 3, 5, 7, 9)
 *                     [5-9]: Even degrees (2, 4, 6, 8, 10)
 */
export function getChordMidiNotes(chordObj, baseOctave = 4) {
    if (!chordObj || typeof chordObj.rootMidi !== 'number') {
        return [];
    }

    // [Root, 3rd, 5th, 7th, 9th,  2nd, 4th, 6th, Octave, 10th]
    let intervals = [0, 4, 7, 11, 14, 2, 5, 9, 12, 16]; // Default to Major (M7, M9)

    const quality = chordObj.quality || 'major';

    if (quality === 'minor' || quality === 'm9' || quality === 'm11' || quality === 'm13') {
        intervals = [0, 3, 7, 10, 14, 2, 5, 8, 12, 15]; // Minor (m3, m7, M9) + (P2, P4, b6)
    } else if (
        quality === 'diminished' ||
        quality === 'm7b5' ||
        quality === 'dim7' ||
        quality === 'half-diminished'
    ) {
        intervals = [0, 3, 6, 10, 13, 1, 5, 8, 12, 15]; // Diminished (m3, d5, m7, m9) + (b2, P4, b6)
    } else if (quality === 'augmented' || quality === 'aug' || quality === '+') {
        intervals = [0, 4, 8, 10, 14, 2, 5, 9, 12, 16]; // Augmented (M3, A5, m7, M9) + (P2, P4, P6)
    } else if (
        quality === '7' ||
        quality === '9' ||
        quality === '11' ||
        quality === '13' ||
        quality === 'dominant'
    ) {
        intervals = [0, 4, 7, 10, 14, 2, 5, 9, 12, 16]; // Dominant (M3, P5, m7, M9) + (P2, P4, P6)
    }

    // rootMidi from the engine is usually based around C4 = 60
    // We adjust it based on the baseOctave parameter
    // Assuming rootMidi is in the 0-11 range + some octave base, we normalize it to pc
    const pc = chordObj.rootMidi % 12;
    const baseMidi = (baseOctave + 1) * 12 + pc; // C4 is MIDI 60, so (4+1)*12 = 60

    return intervals.map((interval) => baseMidi + interval);
}

/**
 * Compresses the sections array into a Base64 string, handling Unicode.
 * @param {Array} sections
 * @returns {string}
 */
export function compressSections(sections) {
    const minified = sections.map((s) => {
        const m = { l: s.label, v: s.value };
        if (s.key) {
            m.k = s.key;
        }
        if (s.repeat && s.repeat > 1) {
            m.r = s.repeat;
        }
        if (s.timeSignature) {
            m.t = s.timeSignature;
        }
        if (s.seamless) {
            m.s = 1;
        }
        return m;
    });
    const json = JSON.stringify(minified);
    const bytes = new TextEncoder().encode(json);
    const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
    return btoa(binString);
}

/**
 * Decompresses the Base64 string back into sections, handling Unicode.
 * @param {string} str
 * @returns {Array}
 */
export function decompressSections(str) {
    try {
        if (!str || typeof str !== 'string') {
            throw new Error('Invalid input');
        }
        // Limit input size to 100KB to prevent memory exhaustion
        if (str.length > 102400) {
            throw new Error('Payload too large');
        }

        const binString = atob(str);
        const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
        const json = new TextDecoder().decode(bytes);
        const minified = JSON.parse(json);

        if (!Array.isArray(minified)) {
            throw new Error('Invalid format: expected array');
        }
        // Limit number of sections to prevent DoS
        const safeMinified = minified.slice(0, 500);

        return safeMinified.map((s, i) => {
            // Sanitize label to prevent XSS (even though likely handled by UI framework, defense in depth)
            let safeLabel = escapeHTML(s.l || `Section ${i + 1}`);
            if (safeLabel.length > 100) {
                safeLabel = safeLabel.substring(0, 100);
            }

            // Clamp value length
            let safeValue = typeof s.v === 'string' ? s.v : '';
            if (safeValue.length > 1000) {
                safeValue = safeValue.substring(0, 1000);
            }

            safeValue = stripDangerousChars(safeValue);

            return {
                id: generateId(),
                label: safeLabel,
                value: safeValue,
                key: typeof s.k === 'string' ? escapeHTML(s.k) : '',
                repeat: Math.min(Math.max(1, parseInt(s.r, 10) || 1), 64), // Clamp repeats
                timeSignature: typeof s.t === 'string' && s.t.length < 10 ? s.t : '',
                seamless: !!s.s,
            };
        });
    } catch (e) {
        console.error('Failed to decompress sections', e);
        return [{ id: generateId(), label: 'Intro', value: 'I | IV' }];
    }
}

/**
 * Calculates the number of 16th-note (or equivalent) steps per measure for a given time signature.
 * @param {string} ts - Time signature (e.g. "4/4", "3/4", "6/8").
 * @returns {number}
 */
export function getStepsPerMeasure(ts) {
    if (ts === '2/4') {
        return 8;
    }
    if (ts === '3/4') {
        return 12;
    }
    if (ts === '6/8') {
        return 12;
    }
    if (ts === '7/8') {
        return 14;
    }
    if (ts === '5/4') {
        return 20;
    }
    if (ts === '7/4') {
        return 28;
    }
    if (ts === '12/8') {
        return 24;
    }
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
    const allTS = allTSConfigs || {};

    if (typeof currentTS === 'string') {
        currentTS = allTS[currentTS] || allTS['4/4'];
    } else if (currentTS && !currentTS.beats && currentTS.tsName) {
        // Handle case where it's an object with only tsName
        currentTS = allTS[currentTS.tsName] || allTS['4/4'];
    }

    if (!currentTS) {
        currentTS = allTS['4/4'] || { beats: 4, stepsPerBeat: 4, grouping: [4], backbeat: [1, 3] };
    }

    if (!currentTS.grouping) {
        currentTS.grouping = [currentTS.beats];
    }
    if (!currentTS.backbeat) {
        currentTS.backbeat = currentTS.beats === 4 ? [1, 3] : [1];
    }

    let tsName =
        currentTS.tsName ||
        (typeof tsConfig === 'string'
            ? tsConfig
            : `${currentTS.beats}/${currentTS.stepsPerBeat === 4 ? 4 : 8}`);
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
            tsName = measure.ts || tsName;
            currentTS = allTSConfigs?.[tsName] ? allTSConfigs[tsName] : tsConfig;
            if (!currentTS) {
                currentTS = allTSConfigs?.['4/4']
                    ? allTSConfigs['4/4']
                    : { beats: 4, stepsPerBeat: 4 };
            }
            mStep = step - measure.start;
            if (mStep === 0) {
                isMeasureStart = true;
            }
        } else {
            // Fallback for steps beyond the map
            const spm = getStepsPerMeasure(tsName);
            mStep = ((step % spm) + spm) % spm;
            isMeasureStart = mStep === 0;
        }
    } else {
        const spm = getStepsPerMeasure(tsName);
        mStep = ((step % spm) + spm) % spm;
        isMeasureStart = mStep === 0;
    }

    if (!currentTS) {
        currentTS = allTSConfigs?.['4/4'] ? allTSConfigs['4/4'] : { beats: 4, stepsPerBeat: 4 };
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
            if (stepInGroup === 0) {
                isGroupStart = true;
            }
            break;
        }
        accumulatedSteps += groupSteps;
    }

    const isBeatStart = mStep % stepsPerBeat === 0;
    const beatIndex = Math.floor(mStep / stepsPerBeat);
    const isCompound = !!currentTS.isCompound;

    let isBackbeat = false;
    const backbeatArray = currentTS.backbeat || [];
    if (isCompound) {
        if (isGroupStart && backbeatArray.includes(groupIndex)) {
            isBackbeat = true;
        }
    } else {
        if (isBeatStart && backbeatArray.includes(beatIndex)) {
            isBackbeat = true;
        }
    }

    // Semantic Timing Flags
    const stepInBeat = ((mStep % stepsPerBeat) + stepsPerBeat) % stepsPerBeat;
    const isOffbeat = stepsPerBeat === 4 ? stepInBeat === 2 : stepInBeat === 1; // 8th note offbeat
    const isEOfBeat = stepsPerBeat === 4 && stepInBeat === 1;
    const isAOfBeat = stepsPerBeat === 4 && stepInBeat === 3;

    return {
        isMeasureStart,
        isGroupStart,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        isCompound,
        groupIndex,
        stepInGroup,
        beatIndex,
        mStep,
        tsName,
        tsConfig: currentTS,
    };
}

/**
 * Safely disconnects multiple Web Audio nodes.
 * @param {AudioNode[]} nodes
 */
export function safeDisconnect(nodes) {
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
            data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
        }
    }
    return impulse;
}

const REGEX_SHARP = /#/g;
const REGEX_FLAT1 = /([A-G])b/g;
const REGEX_FLAT2 = /b(?=[0-9IVivm\-/])/g;

/**
 * Replaces ASCII # and b with Unicode ♯ and ♭ for display.
 * @param {string} str - The string to format.
 * @returns {string}
 */
export function formatUnicodeSymbols(str) {
    if (!str) {
        return str;
    }
    return str.replace(REGEX_SHARP, '♯').replace(REGEX_FLAT1, '$1♭').replace(REGEX_FLAT2, '♭');
}

let cachedSoftClipCurve = null;

/**
 * Creates a soft-clipping curve for the WaveShaperNode.
 * Cached for performance.
 * @returns {Float32Array}
 */
export function createSoftClipCurve() {
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
 * @param {number} freq
 * @param {number} max
 * @returns {number}
 */
export function clampFreq(freq, max = 24000) {
    // Nominal range for most browser implementations of BiquadFilter is [0, 24000]
    return Math.min(Math.max(0, freq), max);
}

/**
 * Calculates a unified timing offset for an instrument based on the global pocket state.
 * @param {string} instrument - 'drums', 'bass', 'chords', or 'soloist'.
 * @param {Object} pocket - The global pocket state.
 * @param {number} intensity - Current band intensity.
 * @returns {number} Offset in seconds.
 */
export function calculateTimingOffset(instrument, pocket, intensity) {
    if (!pocket) {
        return 0;
    }

    // 1. Global Drive (The whole band pushes or pulls)
    // Scale: 1.0 drive = -12ms (ahead), -1.0 drive = +12ms (behind)
    const driveBase = -(pocket.globalDrive * 0.012);

    // 2. Tightness (Inverse variance)
    // High tightness (1.0) = no random jitter. Low tightness (0.0) = ±8ms jitter.
    const jitter = (1.0 - pocket.tightness) * (Math.random() - 0.5) * 0.016;

    let instrumentSpecific = 0;

    // 3. Holistic Gravity (Instruments following each other)
    switch (instrument) {
        case 'drums':
            // Drums set the grid reference.
            if (intensity > 0.8) {
                instrumentSpecific -= 0.005;
            }
            break;
        case 'bass':
            // Bass follows Kick. High gravity = perfectly with Kick.
            // Low gravity = adds 'human' displacement (usually laid back).
            instrumentSpecific += (1.0 - pocket.bassGravity) * 0.008;
            break;
        case 'chords':
            // Chords follow Bass.
            instrumentSpecific += (1.0 - pocket.chordGravity) * 0.006;
            // Inherit 30% of the bass's expected displacement for cohesion
            instrumentSpecific += (1.0 - pocket.bassGravity) * 0.003;
            break;
        case 'soloist':
            // Soloist is the most elastic, but still feels the 'pull' of the band.
            instrumentSpecific += (1.0 - pocket.soloistGravity) * 0.012;
            break;
    }

    // 4. Intensity Elasticity: High intensity forces everyone closer to the base drive
    const elasticity = 0.4 + intensity * 0.6; // 0.4 to 1.0
    const finalOffset = driveBase + (instrumentSpecific + jitter) * (1.1 - elasticity);

    return finalOffset;
}
