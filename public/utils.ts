import { ENHARMONIC_MAP, KEY_ORDER } from './config.js';
import type { StepInfo } from './types.js';

/**
 * utils.ts — shared musical/math primitives, DOM- and Web-Audio-free so the
 * logic worker can import it freely.
 *
 * What belongs here: pitch/frequency conversion (`getFrequency`, `getMidi`,
 * `midiToNote`, `getChordMidiNotes`) and the step/meter timing core
 * (`getStepInfo`, `secondsPerStepFor`, `getStepsPerMeasure`, `binarySearchMap`,
 * `normalizeKey`) — the things every lane's generator needs.
 *
 * What does NOT belong here (#1179 split): seeded RNG/hashing lives in
 * `engine/hash-utils.ts`; share-URL and preset encoding lives in
 * `state/share-codec.ts`; HTML escaping and display glyph formatting live in
 * `sanitize.ts`; Web Audio graph helpers live in `engine/audio-graph-utils.ts`.
 * Anything DOM-touching would break the worker bundle — keep it out.
 */

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
 * Chord-quality families whose triad has NO perfect fifth.
 *
 * Hoisted to module level so `getChordMidiNotes` (which picks a scale-degree table per
 * family) and `chordHasPerfectFifth` (which asks the narrower "is scale degree 5 natural"
 * question) read the SAME membership. Two local copies of the same list is how one of them
 * silently acquires a quality the other doesn't know about.
 *
 * Spellings are the union of what `getChordDetails` (`engine/chords-engine.ts`) normalizes
 * to (`dim`, `halfdim`, `aug`) and the longer forms that reach us from imported/hand-built
 * chord objects (`diminished`, `m7b5`, `half-diminished`, `augmented`, `+`).
 */
const DIMINISHED_QUALITIES = ['dim', 'dim7', 'diminished', 'halfdim', 'm7b5', 'half-diminished'];
const AUGMENTED_QUALITIES = ['augmented', 'aug', '+'];

/**
 * Does this chord quality contain a natural (perfect) fifth?
 *
 * why: any generator that wants to voice a bare "root + 5th" — the disco pump's `fifth`
 * variation in `bass-engine.ts` is the first — must not emit a natural 5 over a chord whose
 * fifth is flatted or sharped. On a `dim7`/`m7b5`/`aug`/`7alt` the comper is stating ♭5 or
 * ♯5 and a natural 5 in the bass grinds a semitone against it on an accented upbeat.
 *
 * NOTE for the bass in particular: "just play the altered fifth instead" is the wrong repair.
 * The bass sits at MIDI 34-46 under a pump, and down there a ♭5/♯5 fights the root it is
 * sounding against — the bass is the harmonic floor, so its job on those chords is to state
 * the root, not to color the alteration. That color belongs to the comper's register. So the
 * right answer for a quality without a perfect fifth is "pick a different gesture", which is
 * why this is a boolean predicate rather than a fifth-interval lookup.
 *
 * `false` for the diminished family, the augmented family (including `augmaj7`, which is
 * `maj7#5` normalized and so would slip a literal `#5` substring test), and any quality
 * spelled with `alt` / `b5` / `#5`. `true` otherwise — including `7b9`/`7#9`/`7#11`/`7b13`
 * and the sus qualities, all of which keep a natural fifth.
 */
export function chordHasPerfectFifth(quality: string | undefined | null): boolean {
    const q = (quality || 'major').toLowerCase();
    if (DIMINISHED_QUALITIES.includes(q) || AUGMENTED_QUALITIES.includes(q)) {
        return false;
    }
    return !(q.includes('alt') || q.includes('b5') || q.includes('#5') || q.includes('aug'));
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
    const isDiminishedFamily = DIMINISHED_QUALITIES.includes(quality);
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
    } else if (AUGMENTED_QUALITIES.includes(quality)) {
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

// safeDisconnect / createSoftClipCurve / clampFreq live in
// `public/engine/audio-graph-utils.ts` — they are Web Audio graph helpers, not
// part of this DOM/audio-free shared-primitives module. They went to
// `synth-utils.ts` first (#1176) to sit beside their peers, but that formed an
// import cycle with `sample-voice.ts`, so #1192 split them into a leaf module.

// escapeHTML / stripDangerousChars / formatUnicodeSymbols live in
// `public/sanitize.ts` — DOM-adjacent display concerns, main-thread only, moved
// out in #1179 so nothing DOM-shaped can drift back into this worker-safe module.
//
// encodeBase64Unicode / decodeBase64Unicode / compressSections /
// decompressSections / generateId live in `public/state/share-codec.ts` —
// persistence + share-URL wire format, also #1179.
//
// createPRNG lives in `public/engine/hash-utils.ts` beside its `stringHash33`
// fold and the other determinism primitives (#1179).

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
