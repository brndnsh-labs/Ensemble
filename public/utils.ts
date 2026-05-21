import { ENHARMONIC_MAP, KEY_ORDER } from './config.js';
import type { Section } from './state/arranger.js';
import type { StepInfo } from './types.js';

/**
 * Creates a seeded pseudo-random number generator (Mulberry32).
 */
export function createPRNG(seed: number | string): () => number {
    let s = typeof seed === 'string' ? hashString(seed) : seed;
    return () => {
        s |= 0;
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Simple string hash function (djb2).
 */
export function hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) + hash + str.charCodeAt(i);
    }
    return hash >>> 0;
}

/**
 * Generates a random 6-character hex string to act as a default seed.
 */
export function generateRandomSeed(): string {
    // 🛡️ Sentinel: Security Enhancement - Cryptographically Secure RNG
    // Fallback to Math.random() is maintained for environments without crypto.
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return (array[0] % 0xffffff).toString(16).padStart(6, '0').toUpperCase();
    }
    return Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0')
        .toUpperCase();
}

/**
 * Normalizes a note name (e.g., C# to Db) based on the project's map.
 */
export function normalizeKey(k: string): string {
    return (ENHARMONIC_MAP as Record<string, string>)[k] || k;
}

/**
 * Transposes a note-name key by semitones using the app's normalized spelling policy.
 */
export function transposeKeyName(key: string, semitoneShift: number): string {
    const normalized = normalizeKey(key);
    const currentIndex = KEY_ORDER.indexOf(normalized);
    if (currentIndex === -1) {
        return normalized;
    }
    return KEY_ORDER[(((currentIndex + semitoneShift) % 12) + 12) % 12];
}

const REGEX_AMP = /&/g;
const REGEX_LT = /</g;
const REGEX_GT = />/g;
const REGEX_QUOT = /"/g;
const REGEX_APOS = /'/g;
const REGEX_BACKTICK = /`/g;

/**
 * Escapes unsafe HTML characters to prevent XSS.
 */
export function escapeHTML(str: string): string {
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
 */
export function stripDangerousChars(str: string): string {
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
 */
export function getFrequency(midi: number): number {
    // Fast path: lookup from cache if within 0-127 and integer
    const freq = FREQUENCY_CACHE[midi];
    if (freq !== undefined) {
        return freq;
    }

    // Slow path: calculate for extended range or microtonal values
    return 440 * 2 ** ((midi - 69) / 12);
}

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Pre-calculate note names and octaves for standard MIDI range (0-127) to avoid object allocation
const MIDI_NOTE_CACHE: Array<{ name: string; octave: number }> = new Array(128);
for (let i = 0; i < 128; i++) {
    MIDI_NOTE_CACHE[i] = {
        name: NOTE_NAMES[i % 12],
        octave: Math.floor(i / 12) - 1,
    };
}

/**
 * Converts a MIDI note number to an object containing its note name and octave.
 */
export function midiToNote(midi: number): { name: string; octave: number } {
    if (typeof midi !== 'number' || !Number.isFinite(midi)) {
        return { name: '---', octave: 0 };
    }

    // Fast path: lookup from cache if within 0-127 and integer
    const cached = MIDI_NOTE_CACHE[midi];
    if (cached !== undefined) {
        return cached;
    }

    // Slow path: calculate for extended range or microtonal values
    const idx = Math.floor(midi) % 12;
    return {
        name: NOTE_NAMES[idx < 0 ? idx + 12 : idx],
        octave: Math.floor(midi / 12) - 1,
    };
}

/**
 * Converts a frequency in Hertz to a MIDI note number.
 */
export function getMidi(freq: number): number | null {
    if (!freq || freq <= 0 || !Number.isFinite(freq)) {
        return null;
    }
    return Math.round(12 * Math.log2(freq / 440) + 69);
}

/**
 * Generates a unique ID for sections.
 */
export function generateId(): string {
    // 🛡️ Sentinel: Security Enhancement - Cryptographically Secure UUID
    // Date.now() + Math.random() is susceptible to collisions and is not secure.
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `id-${crypto.randomUUID()}`;
    }
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint32Array(2);
        crypto.getRandomValues(array);
        return `id-${array[0].toString(36)}${array[1].toString(36)}`;
    }
    return `id-${Date.now().toString(36)}${Math.random().toString(36).substr(2)}`;
}

/**
 * Calculates MIDI notes for specific scale degrees (Full 10-note scale)
 * based on a given chord object.
 */
export function getChordMidiNotes(chordObj: any, baseOctave = 4): number[] {
    if (!chordObj || typeof chordObj.rootMidi !== 'number' || !Number.isFinite(chordObj.rootMidi)) {
        return [];
    }

    const quality = chordObj.quality || 'major';
    const isMinorQuality =
        quality === 'minor' ||
        quality === 'm6' ||
        quality === 'm9' ||
        quality === 'm11' ||
        quality === 'm13';
    const isDiminishedFamily = [
        'dim',
        'dim7',
        'diminished',
        'halfdim',
        'm7b5',
        'half-diminished',
    ].includes(quality);
    const isDominantFamily =
        quality === 'dominant' ||
        quality === '7' ||
        quality === '9' ||
        quality === '11' ||
        quality === '13' ||
        quality.startsWith('7');

    let safeIntervals: number[] = [0, 4, 7, 11, 14];
    let colorIntervals: number[] = [2, 5, 9, 12, 16];

    if (isMinorQuality) {
        safeIntervals = [0, 3, 7, 10, 14];
        colorIntervals = [2, 5, 8, 12, 15];
    } else if (isDiminishedFamily) {
        safeIntervals = [0, 3, 6, 10, 13];
        colorIntervals = [1, 5, 8, 12, 15];
    } else if (quality === 'augmented' || quality === 'aug' || quality === '+') {
        safeIntervals = [0, 4, 8, 10, 14];
        colorIntervals = [2, 6, 9, 12, 16];
    } else if (isDominantFamily) {
        safeIntervals = [0, 4, 7, 10, 14];
        colorIntervals = [2, 5, 9, 12, 16];
    }

    const pc = chordObj.rootMidi % 12;
    const baseMidi = (baseOctave + 1) * 12 + pc;

    const expandIntervals = (source: number[], targetCount: number): number[] => {
        const unique = [...new Set(source.filter(Number.isFinite))].sort((a, b) => a - b);
        if (unique.length === 0) {
            return [];
        }
        const result = unique.slice(0, targetCount);
        let octaveOffset = 12;
        while (result.length < targetCount) {
            for (const interval of unique) {
                const candidate = interval + octaveOffset;
                if (!result.includes(candidate)) {
                    result.push(candidate);
                }
                if (result.length >= targetCount) {
                    break;
                }
            }
            octaveOffset += 12;
        }
        return result.sort((a, b) => a - b);
    };

    const parsedIntervals: number[] = Array.isArray(chordObj.intervals)
        ? chordObj.intervals.filter(Number.isFinite)
        : [];
    if (parsedIntervals.length > 0) {
        safeIntervals = expandIntervals(parsedIntervals, 5);
        const remainingParsed = parsedIntervals.filter(
            (interval: number) => !safeIntervals.includes(interval),
        );
        const mergedColors = [...remainingParsed, ...colorIntervals].filter(
            (interval: number) => !safeIntervals.includes(interval),
        );
        colorIntervals = expandIntervals(mergedColors, 5);
    }

    let notes: number[] = [
        ...safeIntervals.map((interval) => baseMidi + interval),
        ...colorIntervals.map((interval) => baseMidi + interval),
    ];

    if (
        typeof chordObj.bassMidi === 'number' &&
        Number.isFinite(chordObj.bassMidi) &&
        notes.length > 0
    ) {
        const bassPc = chordObj.bassMidi % 12;
        let slashBassMidi = (baseOctave + 1) * 12 + bassPc;
        while (slashBassMidi >= notes[0]) {
            slashBassMidi -= 12;
        }

        let removedUpperBass = false;
        const upperNotes = notes.filter((note) => {
            if (!removedUpperBass && note % 12 === bassPc) {
                removedUpperBass = true;
                return false;
            }
            return true;
        });

        if (!removedUpperBass && upperNotes.length > 0) {
            upperNotes.pop();
        }
        notes = [slashBassMidi, ...upperNotes].slice(0, 10);
    }

    return notes;
}

/**
 * Compresses the sections array into a Base64 string, handling Unicode.
 */
export function compressSections(sections: Section[]): string {
    const minified = sections.map((s) => {
        const m: Record<string, unknown> = { l: s.label, v: s.value };
        if (s.key) {
            m.k = s.key;
        }
        if (typeof s.isMinor === 'boolean') {
            m.m = s.isMinor ? 1 : 0;
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
 */
export function decompressSections(str: string): Section[] {
    try {
        if (!str || typeof str !== 'string') {
            throw new Error('Invalid input');
        }
        // Limit input size to 100KB to prevent memory exhaustion
        if (str.length > 102400) {
            throw new Error('Payload too large');
        }

        const binString = atob(str);
        const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0) || 0);
        const json = new TextDecoder().decode(bytes);
        const minified = JSON.parse(json);

        if (!Array.isArray(minified)) {
            throw new Error('Invalid format: expected array');
        }
        // Limit number of sections to prevent DoS
        const safeMinified = minified.slice(0, 500);

        return safeMinified.map((s: any, i: number) => {
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
                isMinor: typeof s.m === 'number' ? s.m === 1 : undefined,
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
 */
export function getStepsPerMeasure(ts: string): number {
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
 * Optimized binary search for arrays containing objects with `start` and `end` properties.
 * Useful for fast O(log N) lookups in `arranger.stepMap`, `sectionMap`, and `measureMap`.
 */
export function binarySearchMapIndex(
    mapArray: Array<{ start: number; end: number }>,
    step: number,
): number {
    if (!mapArray || mapArray.length === 0) {
        return -1;
    }
    let low = 0;
    let high = mapArray.length - 1;

    while (low <= high) {
        const mid = (low + high) >>> 1;
        const m = mapArray[mid];
        if (step >= m.start && step < m.end) {
            return mid;
        } else if (step < m.start) {
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
    return -1;
}

export function binarySearchMap<T extends { start: number; end: number }>(
    mapArray: T[],
    step: number,
): T | null {
    const index = binarySearchMapIndex(mapArray, step);
    return index !== -1 ? mapArray[index] : null;
}

/**
 * Checks if a specific step falls within the "turnaround" (final part) of its section.
 */
export function isSectionTurnaround(
    step: number,
    sectionMap: Array<{ start: number; end: number }>,
    stepsPerBar: number,
    thresholdBars = 1,
): boolean {
    if (!sectionMap || sectionMap.length === 0) {
        return false;
    }
    const entry = binarySearchMap(sectionMap, step);
    if (!entry) {
        return false;
    }

    const sectionLengthSteps = entry.end - entry.start;
    const measuresInSection = Math.max(1, sectionLengthSteps / stepsPerBar);

    // Suppress turnarounds for extremely short sections (e.g., 1 measure)
    if (measuresInSection <= thresholdBars && thresholdBars === 1) {
        return false;
    }

    const stepInSection = step - entry.start;
    const barInSection = Math.floor(stepInSection / stepsPerBar);

    return barInSection >= measuresInSection - thresholdBars;
}

/**
 * Returns detailed structural information about a specific step in a measure.
 */
export function getStepInfo(
    step: number,
    tsConfig: any,
    measureMap?: any[],
    allTSConfigs?: any,
): StepInfo {
    let currentTS = typeof tsConfig === 'object' ? tsConfig : null;
    const allTS = allTSConfigs || {};

    if (typeof tsConfig === 'string') {
        currentTS = allTS[tsConfig] || allTS['4/4'];
    } else if (currentTS && !currentTS.beats && currentTS.tsName) {
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
        const measure = binarySearchMap(measureMap, step);

        if (measure) {
            tsName = measure.ts || tsName;
            currentTS = allTSConfigs?.[tsName]
                ? allTSConfigs[tsName]
                : typeof tsConfig === 'object'
                  ? tsConfig
                  : currentTS;
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

    const isPulse = currentTS.pulse ? currentTS.pulse.includes(mStep) : isBeatStart;
    const isPulseStart = isGroupStart;

    return {
        isMeasureStart,
        isDownbeat: isMeasureStart,
        isGroupStart,
        isBeatStart,
        isPulse,
        isPulseStart,
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

const REGEX_SHARP = /#/g;
const REGEX_FLAT1 = /([A-G])b/g;
const REGEX_FLAT2 = /b(?=[0-9IVivm\-/])/g;

/**
 * Replaces ASCII # and b with Unicode ♯ and ♭ for display.
 */
export function formatUnicodeSymbols(str: string): string {
    if (!str) {
        return str;
    }
    return str.replace(REGEX_SHARP, '♯').replace(REGEX_FLAT1, '$1♭').replace(REGEX_FLAT2, '♭');
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

/**
 * Calculates a unified timing offset for an instrument based on the global pocket state.
 *
 * `random` is an injectable PRNG (Epic 12 S1, the `pickByRank` pattern). It
 * defaults to `Math.random` so bass / drums / chords callers are byte-for-byte
 * unchanged; the soloist passes a `scrambleHash`-derived seeded source so its
 * micro-timing humanization is deterministic by construction (the soloist
 * engine-determinism critique test needs every emitted field reproducible).
 */
export function calculateTimingOffset(
    instrument: string,
    pocket: any,
    intensity: number,
    random: () => number = Math.random,
): number {
    if (!pocket) {
        return 0;
    }

    // 1. Global Drive (The whole band pushes or pulls)
    // Scale: 1.0 drive = -12ms (ahead), -1.0 drive = +12ms (behind)
    const driveBase = -(pocket.globalDrive * 0.012);

    // 2. Tightness (Inverse variance)
    // High tightness (1.0) = no random jitter. Low tightness (0.0) = ±8ms jitter.
    const jitter = (1.0 - pocket.tightness) * (random() - 0.5) * 0.016;

    let instrumentSpecific = 0;

    // 3. Holistic Gravity (Instruments following each other)
    switch (instrument) {
        case 'drums':
            if (intensity > 0.8) {
                instrumentSpecific -= 0.005;
            }
            break;
        case 'bass':
            instrumentSpecific += (1.0 - pocket.bassGravity) * 0.008;
            break;
        case 'chords':
            instrumentSpecific += (1.0 - pocket.chordGravity) * 0.006;
            // Inherit 30% of the bass's expected displacement for cohesion
            instrumentSpecific += (1.0 - pocket.bassGravity) * 0.003;
            break;
        case 'soloist':
            instrumentSpecific += (1.0 - pocket.soloistGravity) * 0.012;
            break;
    }

    // 4. Intensity Elasticity: High intensity forces everyone closer to the base drive
    const elasticity = 0.4 + intensity * 0.6; // 0.4 to 1.0
    const finalOffset = driveBase + (instrumentSpecific + jitter) * (1.1 - elasticity);

    return finalOffset;
}

/**
 * Applies blues bend styling to a note.
 *
 * `random` is an injectable PRNG (Epic 12 S1) — soloist-only consumer; the
 * soloist passes a `scrambleHash`-derived seeded source so the bend direction
 * is deterministic. Defaults to `Math.random` for any future caller.
 */
export function applyBluesBends(
    primary: any,
    activeStyle: string,
    currentChord: any,
    random: () => number = Math.random,
): void {
    if (activeStyle === 'blues') {
        const relativeInterval =
            ((primary.midi % 12) - ((currentChord.rootMidi || 0) % 12) + 12) % 12;
        if ((relativeInterval === 3 || relativeInterval === 6) && primary.bendStartInterval === 0) {
            primary.bendStartInterval = random() < 0.6 ? -0.5 : 0.5;
        }
    }
}
