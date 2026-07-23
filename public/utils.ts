import { ENHARMONIC_MAP, KEY_ORDER } from './config.js';
import { stringHash33 } from './engine/hash-utils.js';
import type { Section } from './state/arranger.js';
import type { StepInfo } from './types.js';

/**
 * Creates a seeded pseudo-random number generator (Mulberry32).
 *
 * String seeds are folded with the canonical djb2 ×33 hash
 * ({@link stringHash33}) and coerced **unsigned** (`>>> 0`). The unsigned
 * coercion is load-bearing history, not decoration: the local `hashString`
 * this replaced returned `hash >>> 0`, and every seeded stream in the repo was
 * tuned against that starting value. `stringHash33` returns the signed (`| 0`)
 * form of the identical accumulator, so `>>> 0` reproduces the old seed
 * bit-for-bit — do not "simplify" it to `| 0`.
 */
export function createPRNG(seed: number | string): () => number {
    let s = typeof seed === 'string' ? stringHash33(seed) >>> 0 : seed;
    return () => {
        s |= 0;
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Clamps a value into the unit interval [0, 1].
 *
 * The canonical clamp for the repo's 0..1 scalars (velocity, intensity,
 * normalized envelope positions). Written as nested ternaries rather than
 * `Math.max(0, Math.min(1, x))` so it stays allocation- and call-free on the
 * per-note hot paths that use it (soloist velocity shaping, drum voices).
 *
 * Edge cases: `NaN` passes through unchanged (as it does for the `Math.*`
 * form); `-0` is returned as `-0` rather than being normalized to `+0`.
 *
 * NOTE: the per-sample / per-frame loops in `wav-encoder.ts` and
 * `visualizer-engine.ts` deliberately keep their clamp inlined — don't route
 * those through here.
 */
export function clamp01(x: number): number {
    return x < 0 ? 0 : x > 1 ? 1 : x;
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
 * Unicode-safe Base64 encode: JSON string → UTF-8 bytes → binary string → btoa.
 * Shared by the share-URL payloads (sections + band settings).
 */
export function encodeBase64Unicode(json: string): string {
    const bytes = new TextEncoder().encode(json);
    const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
    return btoa(binString);
}

/**
 * Unicode-safe Base64 decode: atob → binary string → UTF-8 bytes → JSON string.
 * The inverse of {@link encodeBase64Unicode}. Callers own size guards and JSON.parse.
 */
export function decodeBase64Unicode(str: string): string {
    const binString = atob(str);
    const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0) || 0);
    return new TextDecoder().decode(bytes);
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
        if (typeof s.targetIntensity === 'number') {
            m.i = Math.max(0, Math.min(1, s.targetIntensity));
        }
        if (s.instruments && Object.keys(s.instruments).length > 0) {
            const e: Record<string, 0 | 1> = {};
            for (const [k, v] of Object.entries(s.instruments)) {
                if (typeof v === 'boolean') {
                    e[k] = v ? 1 : 0;
                }
            }
            if (Object.keys(e).length > 0) {
                m.e = e;
            }
        }
        return m;
    });
    const json = JSON.stringify(minified);
    return encodeBase64Unicode(json);
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

        const json = decodeBase64Unicode(str);
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

            const out: Section = {
                id: generateId(),
                label: safeLabel,
                value: safeValue,
                key: typeof s.k === 'string' ? escapeHTML(s.k) : '',
                isMinor: typeof s.m === 'number' ? s.m === 1 : undefined,
                repeat: Math.min(Math.max(1, parseInt(s.r, 10) || 1), 64), // Clamp repeats
                timeSignature: typeof s.t === 'string' && s.t.length < 10 ? s.t : '',
                seamless: !!s.s,
            };
            if (typeof s.i === 'number' && Number.isFinite(s.i)) {
                out.targetIntensity = Math.max(0, Math.min(1, s.i));
            }
            if (s.e && typeof s.e === 'object') {
                const allowed: Section['instruments'] = {};
                const keys: Array<keyof NonNullable<Section['instruments']>> = [
                    'groove',
                    'bass',
                    'chords',
                    'harmony',
                    'soloist',
                ];
                for (const k of keys) {
                    const raw = (s.e as Record<string, unknown>)[k];
                    if (raw === 0 || raw === 1) {
                        allowed[k] = raw === 1;
                    } else if (typeof raw === 'boolean') {
                        allowed[k] = raw;
                    }
                }
                if (Object.keys(allowed).length > 0) {
                    out.instruments = allowed;
                }
            }
            return out;
        });
    } catch (e) {
        console.error('Failed to decompress sections', e);
        return [{ id: generateId(), label: 'Intro', value: 'I | IV' }];
    }
}

/**
 * Returns the duration, in seconds, of one internal step (always a 16th)
 * given the displayed BPM.
 *
 * BPM is quarter-notes/min for every meter (DAW/MIDI convention), and an
 * internal step is a 16th in all meters, so a step is always one quarter of
 * a beat: `stepSec = (60/bpm) / 4`. This holds for compound meters too — a
 * 6/8 bar is 12 sixteenths = 3 quarters' worth of clock time.
 */
export function secondsPerStepFor(bpm: number): number {
    return 60.0 / bpm / 4;
}

/**
 * Returns the duration, in seconds, of one `ts.beats`-native unit given a
 * time signature and displayed BPM.
 *
 * Definition: `ts.beats` is the denominator-derived count — quarters for
 * 4/4, eighths for 6/8 / 7/8 / 12/8 — so this helper returns
 * `stepsPerBeat * secondsPerStepFor(bpm)`.
 *
 *   - 4/4 / 3/4 / 5/4 / 7/4 (stepsPerBeat=4) → 60/bpm (one quarter)
 *   - 6/8 / 12/8 / 7/8 (stepsPerBeat=2)      → (60/bpm)/2 (one eighth)
 *
 * Use this for count-in (`ts.beats` clicks per bar), chord-duration
 * visualization (`chord.beats * secondsPerBeat`), etc.
 */
export function secondsPerBeatFor(ts: { stepsPerBeat?: number } | undefined, bpm: number): number {
    const stepsPerBeat = ts?.stepsPerBeat ?? 4;
    return secondsPerStepFor(bpm) * stepsPerBeat;
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
    // why: midpoint of a beat — works for any stepsPerBeat value (floor(4/2)=2 for 16th-grid,
    // floor(2/2)=1 for 8th-grid, floor(3/2)=1 for any future triplet-grid, etc.)
    // Previously hard-coded `stepsPerBeat === 4 ? stepInBeat === 2 : stepInBeat === 1` which
    // silently mislabels offbeats for any stepsPerBeat other than 2 or 4.
    const isOffbeat = stepInBeat === Math.floor(stepsPerBeat / 2); // 8th note offbeat
    // why: epic-1-compound-meter S2 — "every eighth-note boundary" flag. An eighth
    // note is half a beat, so a step is an eighth boundary iff its position is an
    // integer multiple of half a beat: `(2 * mStep) % stepsPerBeat === 0`. This is
    // correct for every grid:
    //   16th grid (spb=4) → mStep % 2 === 0 (every other step);
    //   8th grid (spb=2: 6/8, 7/8, 12/8) → always true (each step IS an eighth);
    //   triplet grid (spb=3) → only beat-starts (mStep 0,3,6…), since triplet
    //     partials don't land on eighth boundaries.
    // epic-1-compound-meter S2 follow-up (2026-05-28): generalized from the old
    // `stepsPerBeat >= 4 ? mStep % 2 === 0 : true`, which silently mislabelled
    // every step of a triplet grid as an eighth boundary. Behavior is byte-
    // identical for the shipped meters (spb 2 and 4); the change only fixes the
    // hypothetical triplet-grid case (locked in by meter-integrity.test.ts).
    const isEighthBoundary = (2 * mStep) % stepsPerBeat === 0;
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
        isEighthBoundary,
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

// safeDisconnect / createSoftClipCurve / clampFreq moved to
// `public/engine/synth-utils.ts` (#1176) — they are Web Audio graph helpers and
// belong beside their peers (createSimplePanner / killActiveVoices / rampGain),
// not in this DOM/audio-free shared-primitives module.

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

// calculateTimingOffset (the gravity-era pocket formula: globalDrive / tightness /
// per-instrument gravity) removed in #1063 — post-#714 its output was added to the
// drum grid AND every melodic lane equally, a uniform whole-band shift that is
// inaudible by construction. The live band-level lean is getBandPocket in
// coordination-engine.ts. See docs/design/timing-model.md §2/§4.

// applyBluesBends (the blues/neo ±0.5 gospel b3/b5 vocal scoop) removed in
// epic #10/#866 — its only caller was the retired legacy picker. The live
// phrase-first engine uses an integer `bendStartInterval` flurry around the apex,
// not this per-blue-note microtonal scoop. The gospel-scoop idiom is a tracked
// #870 PORT CANDIDATE (recoverable from git history if/when it's ported).
