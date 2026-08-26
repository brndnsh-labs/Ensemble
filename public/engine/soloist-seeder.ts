import { getEffectiveMeterAtStep, getEffectiveTimeSignature } from '../meter.js';
import type { ArrangerState } from '../state/arranger.js';
import type {
    EnsembleState,
    SeedGuitarSupportHint,
    SeedNote,
    SeedSupportHints,
    SeedSupportRole,
} from '../types.js';
import { binarySearchMap, generateRandomSeed, isSectionTurnaround } from '../utils.js';
import { unrollArrangement } from './arranger-utils.js';
import { createPRNG } from './hash-utils.js';
import { getSoloistRegisterProfile, resolveSoloistStyle, STYLE_CONFIG } from './soloist-config.js';
import { classifyChordQuality } from './soloist-pitch-engine.js';
import { getKeyContext, getScaleForChord } from './theory-scales.js';

export type { SeedGuitarSupportHint, SeedNote, SeedSupportRole } from '../types.js';

export interface SeedSupportHintOverrides {
    role?: SeedSupportRole;
    sustainBias?: number;
    guitar?: Partial<SeedGuitarSupportHint>;
}

/**
 * A single note-like event inside a rhythmic cell template.
 * "isRest: false" cells are converted to SeedNotes during motif application.
 */
export interface MotifCellNote {
    /** Beat position within the measure (fractional beats, e.g. 0.5 = "and of 1"). */
    beatOffset: number;
    /** When true the slot is silent; used to create space between phrases. */
    isRest: boolean;
    /** Note length in steps. */
    duration: number;
}

/**
 * Ordered list of motif events. Scale-degree offsets are relative to the root of the section's
 * first chord; they get resolved to absolute MIDI values during the application phase.
 */
export interface MotifEvent {
    beatOffset: number;
    isPickup: boolean;
    scaleDegreeOffset: number;
    duration: number;
    isRest: boolean;
}

/**
 * One section's worth of rhythmic/melodic template that gets repeated and mutated
 * as the arrangement progresses.  The motif stores relative scale-degree offsets so
 * it can be transposed and re-harmonized against any chord progression.
 */
export interface MotifEntry {
    motif: MotifEvent[];
    /** Template length in measures (2 or 4). */
    phraseLength: number;
    /**
     * Melodic contour archetype selected for this section
     * ('ASCEND' | 'DESCEND' | 'ARCH' | 'VALLEY' | 'HOOK' | 'ARPEGGIATE' | 'STATIC').
     */
    contourType: string;
    /** Summary stats used to detect contrast needs when generating departure sections. */
    metrics: { density: number; syncopationRatio: number };
    /**
     * When true all notes stay near the anchor pitch, producing a drone-like pedal effect.
     */
    isStationaryMotif: boolean;
}

/**
 * Rhythmic Cell Dictionary
 * Common musical motifs used to build the "Head".
 * Expressed in beats relative to the start of the cell.
 */
const RH_CELLS = {
    // 4/4 Basic Cells
    BASIC: [
        [0, 1, 2, 3], // Straight Quarters
        [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], // Straight 8ths
        [0, 1.5, 2, 3.5], // Syncopated (And of 1, And of 4)
        [0, 1, 2], // The "Missing 4"
        [1, 2, 3], // The "Late Start"
    ],
    // 4/4 Stylistic/Complex
    SYNC: [
        [0, 0.75, 1.5, 2.25, 3], // Dotted 8th (Bossa-ish)
        [0, 0.5, 1.25, 1.5, 2, 2.5, 3.25, 3.5], // 16th pushes
        [0.5, 1, 1.5, 2, 2.5, 3, 3.5], // Off-beat start
        [0, 1, 2, 2.75, 3, 3.75], // Gallop finish
    ],
    LINE: [
        [0, 0.5, 1, 2, 2.5, 3], // Quarter anchors with 8th-note continuation
        [0, 0.5, 1.5, 2, 2.5, 3.5], // 8th-note line with a small breath
        [0.5, 1, 1.5, 2.5, 3, 3.5], // Pickup-leaning line
        [0, 1, 1.5, 2, 2.5, 3, 3.5], // Hooky quarter + 8th tail
    ],
    TRIPLET: [
        [0, 2 / 3, 4 / 3, 2, 8 / 3, 10 / 3], // Rolling 8th-note triplets
        [0, 1 / 3, 2 / 3, 2, 7 / 3, 8 / 3], // Downbeat burst with a later answer
        [0, 1, 5 / 3, 7 / 3, 3], // Anchor + triplet tail
        [1 / 3, 1, 5 / 3, 7 / 3, 3, 11 / 3], // Late-start triplet line
    ],
    TRIPLET_TAIL: [
        [0, 1, 2, 3, 10 / 3, 11 / 3], // Quarter-note frame with a beat-4 triplet turn
        [0, 1, 2, 8 / 3, 10 / 3, 11 / 3], // Pickup into the final triplet burst
        [0, 1, 5 / 3, 7 / 3, 3, 10 / 3, 11 / 3], // Mid-bar lift into a closing triplet tail
    ],
    // 3/4 Cells
    WALTZ: [
        [0, 1, 2], // Straight
        [0, 0.5, 1, 1.5, 2, 2.5], // 8ths
        [0, 1.5, 2], // Syncopated 2
        [0, 0.75, 1.5, 2.25], // Dotted
    ],
};

/**
 * Pickup Dictionary (Anacrusis)
 * Common run-ups and pushes leading into a downbeat.
 * Expressed in beats relative to the downbeat (negative values).
 */
const PICKUP_DICTIONARY = {
    SCALE_RUN: [-0.75, -0.5, -0.25], // 16th note walk-up
    CHORD_PUSH: [-0.5], // Syncopated 'And' of 4
    DOUBLE_HIT: [-1.0, -0.5], // Two 8th notes (dun-dun)
    LATE_SWEEP: [-0.375, -0.25, -0.125], // Fast 32nd note flurry
    TRIPLET_RUN: [-0.666, -0.333], // Triplet lead-in
};

/**
 * Soloist Seeder Module (v4)
 * Generates a "Dynamic Head" (Seed Melody) for the entire arrangement.
 * Implements a continuous, musically connected line utilizing target notes,
 * stepwise motion, and pickups (anacrusis).
 */

function normalizeInterval(interval: number): number {
    return ((interval % 12) + 12) % 12;
}

const TRIPLET_POSITION_TOLERANCE = 0.05;

function roundSeedRhythmValue(value: number): number {
    return Math.round(value * 1000) / 1000;
}

function getTripletPlacementTag(beatOffset: number): 't1' | 't2' | undefined {
    const beatFraction = ((beatOffset % 1) + 1) % 1;
    if (Math.abs(beatFraction - 1 / 3) <= TRIPLET_POSITION_TOLERANCE) {
        return 't1';
    }
    if (Math.abs(beatFraction - 2 / 3) <= TRIPLET_POSITION_TOLERANCE) {
        return 't2';
    }
    return undefined;
}

function buildSeedTimingPlacement(
    beatOffset: number,
    stepsPerBeat: number,
    bpm: number,
    timingStrength: number,
): { stepOffset: number; timingOffset: number; tripletPlacement: 't1' | 't2' | undefined } {
    const rawStep = beatOffset * stepsPerBeat;
    const stepOffset = Math.round(rawStep);
    const tripletPlacement = getTripletPlacementTag(beatOffset);

    if (!tripletPlacement || timingStrength <= 0) {
        return { stepOffset, timingOffset: 0, tripletPlacement: undefined };
    }

    const secondsPerStep = 60 / Math.max(40, bpm || 100) / stepsPerBeat;
    const timingOffset = roundSeedRhythmValue(
        (rawStep - stepOffset) * secondsPerStep * timingStrength,
    );
    return { stepOffset, timingOffset, tripletPlacement };
}

function repeatCellPool<T>(pool: T[], repeats: number): T[] {
    const repeated: T[] = [];
    for (let i = 0; i < repeats; i++) {
        repeated.push(...pool);
    }
    return repeated;
}

function buildPatternCell(
    pattern: number[],
    beatsPerCell: number,
    stepsPerBeat: number,
): MotifCellNote[] {
    return pattern.map((beatOffset, idx) => {
        const nextOffset = pattern[idx + 1] ?? beatsPerCell;
        return {
            beatOffset,
            duration: (nextOffset - beatOffset) * stepsPerBeat,
            isRest: false,
        };
    });
}

function isTripletSeedNote(note: SeedNote | undefined | null): boolean {
    return Boolean(note?.tripletPlacement);
}

interface BuildSeedSupportHintsOptions {
    style: string;
    step: number;
    durationSteps: number;
    isAnchor: boolean;
    isPickup: boolean;
    stepsPerMeasure: number;
    stepsPerBeat: number;
    measureStep: number;
}

/**
 * Build optional support metadata so phrasing modes can reinforce the melody without rewriting it.
 */
function buildSeedSupportHints(options: BuildSeedSupportHintsOptions): SeedSupportHints {
    const {
        style,
        step,
        durationSteps,
        isAnchor,
        isPickup,
        stepsPerMeasure,
        stepsPerBeat,
        measureStep,
    } = options;
    const isLineStyle = ['jazz', 'bird', 'bossa'].includes(style);
    const isCadenceZone = measureStep >= Math.max(0, stepsPerMeasure - stepsPerBeat);
    const isBeatAttack = measureStep % stepsPerBeat === 0;

    let role: SeedSupportRole = 'line';
    if (isPickup || step < 0) {
        role = 'pickup';
    } else if (isAnchor && isCadenceZone) {
        role = 'cadence';
    } else if (isAnchor) {
        role = 'anchor';
    } else if (durationSteps >= stepsPerBeat * 2) {
        role = 'sustain';
    } else if (isBeatAttack) {
        role = 'accent';
    }

    let sustainBias = 0.4;
    if (role === 'pickup') {
        sustainBias = 0.15;
    } else if (role === 'accent') {
        sustainBias = 0.65;
    } else if (role === 'sustain') {
        sustainBias = 0.88;
    } else if (role === 'anchor' || role === 'cadence') {
        sustainBias = 1.0;
    }

    let allowDoubleStop = false;
    if (!isPickup && step >= 0) {
        if (role === 'anchor' || role === 'cadence') {
            allowDoubleStop = true;
        } else if (!isLineStyle && (role === 'sustain' || role === 'accent')) {
            allowDoubleStop = true;
        } else if (style === 'blues' && durationSteps >= stepsPerBeat && isBeatAttack) {
            allowDoubleStop = true;
        }
    }

    let intervalPalette: 'tight' | 'open' | 'blues' = 'tight';
    if (style === 'blues') {
        intervalPalette = 'blues';
    } else if (style === 'country' || role === 'sustain' || role === 'cadence') {
        intervalPalette = 'open';
    }

    return {
        role,
        sustainBias,
        guitar: {
            allowDoubleStop,
            intervalPalette,
            preferBelow: true,
        },
    };
}

interface CreateSeedNoteOptions {
    style: string;
    step: number;
    midi: number;
    isAnchor: boolean;
    durationSteps: number;
    velocity: number;
    timingOffset?: number;
    tripletPlacement?: 't1' | 't2';
    isPickup?: boolean;
    stepsPerMeasure: number;
    stepsPerBeat: number;
    measureStep: number;
    qaRole?: 'question' | 'answer';
    hookRole?: boolean;
}

function createSeedNote(options: CreateSeedNoteOptions): SeedNote {
    const {
        style,
        step,
        midi,
        isAnchor,
        durationSteps,
        velocity,
        timingOffset = 0,
        tripletPlacement = undefined,
        isPickup = false,
        stepsPerMeasure,
        stepsPerBeat,
        measureStep,
        qaRole = undefined,
        hookRole = undefined,
    } = options;

    const note: SeedNote = {
        step,
        midi,
        isAnchor,
        durationSteps,
        velocity,
        supportHints: buildSeedSupportHints({
            style,
            step,
            durationSteps,
            isAnchor,
            isPickup,
            stepsPerMeasure,
            stepsPerBeat,
            measureStep,
        }),
    };

    if (timingOffset) {
        note.timingOffset = timingOffset;
    }
    if (tripletPlacement) {
        note.tripletPlacement = tripletPlacement;
    }
    if (qaRole) {
        note.qaRole = qaRole;
    }
    if (hookRole) {
        note.hookRole = hookRole;
    }

    return note;
}

function overrideSeedSupportHints(
    note: SeedNote,
    overrides: SeedSupportHintOverrides,
): SeedSupportHints | undefined {
    if (!note.supportHints) {
        return undefined;
    }

    return {
        ...note.supportHints,
        ...overrides,
        guitar: {
            ...note.supportHints.guitar,
            ...(overrides.guitar || {}),
        },
    };
}

function getSectionCategory(label: string | undefined, style: string): string {
    const normalized = (label || 'Main').toLowerCase();

    if (normalized.includes('intro')) {
        return 'intro';
    }
    // MUST stay ahead of the 'chorus' test below, and ahead of the jazz-style
    // collapse further down. 'Pre-Chorus' *contains* 'chorus', so without this
    // the more specific label lost the substring race and a pre-chorus was
    // filed under the SAME `sectionMotifs` entry as the real chorus — the
    // soloist played the chorus line during the pre-chorus and then again in
    // the chorus. The wizard's bare 'Pre' missed in the other direction: it
    // fell through to the generic `replace(/[^a-z]/g,'')` tail as category
    // 'pre', which `isDepartureCategory` doesn't list, so it was treated as a
    // statement. Both spellings now resolve here, to the same category.
    //
    // `\bpre` (not `startsWith`) so a hand-typed 'The Pre-Chorus' also lands,
    // while 'impressive' and friends don't. (#1206)
    if (/\bpre/.test(normalized)) {
        return 'prechorus';
    }
    if (normalized.includes('chorus') || normalized.includes('drop')) {
        return 'chorus';
    }
    if (normalized.includes('outro') || normalized.includes('end')) {
        return 'outro';
    }
    if (style === 'jazz' || style === 'bird' || style === 'bossa') {
        return 'jazz';
    }

    const category = normalized.replace(/[^a-z]/g, '');
    return category || 'main';
}

/**
 * A departure section leaves the statement rather than restating it — it takes
 * the register lift, gets rhythmic contrast against the verse motif, and is
 * exempt from the end-of-section pull onto a stable chord tone.
 *
 * `'prechorus'` was UNREACHABLE dead code until #1206: nothing could produce
 * that string, because the `replace(/[^a-z]/g,'')` tail that would have built
 * it sat downstream of the `includes('chorus')` short-circuit. `getSectionCategory`
 * now emits it directly.
 */
function isDepartureCategory(category: string): boolean {
    return (
        category === 'chorus' ||
        category === 'bridge' ||
        category === 'b' ||
        category === 'prechorus'
    );
}

/**
 * #1058 — development depth per role when an UNROLLED macro-form inherits the head
 * motif (`unrollArrangement` only emits Intro/Verse/Chorus/Solo/Outro labels; jazz
 * styles collapse verse+solo to one 'jazz' category). The macro-form reads
 * A–A′–B–C–A: Verse is a developed restatement, Solo develops deeper (thematic
 * improvisation), Outro is the verbatim theme return ("head out"). Chorus is
 * deliberately not listed — it composes fresh with the departure-contrast machinery.
 */
const UNROLLED_INHERIT_OPS: Record<string, number> = {
    verse: 1,
    jazz: 1,
    solo: 2,
    outro: 0,
};

/** Summary stats used to detect contrast needs when generating departure sections. */
function computeMotifMetrics(
    motif: MotifEvent[],
    phraseLength: number,
    beatsPerMeasure: number,
): { density: number; syncopationRatio: number } {
    let attacks = 0;
    let syncopatedAttacks = 0;
    motif.forEach((n) => {
        if (!n.isRest) {
            attacks++;
            // An off-beat is any offset that is not a whole number or downbeat
            const isDownbeat = n.beatOffset % beatsPerMeasure === 0;
            const isWholeBeat = n.beatOffset % 1 === 0;
            if (!isWholeBeat || !isDownbeat) {
                syncopatedAttacks++;
            }
        }
    });
    return {
        density: attacks / phraseLength, // attacks per measure
        syncopationRatio: attacks > 0 ? syncopatedAttacks / attacks : 0,
    };
}

function isSoftCadenceInterval(interval: number): boolean {
    const normalized = normalizeInterval(interval);
    return normalized === 2 || normalized === 5 || normalized === 9;
}

function isStableCadenceInterval(interval: number, chordIntervals: number[]): boolean {
    const normalized = normalizeInterval(interval);
    return chordIntervals.some((chordInterval) => normalizeInterval(chordInterval) === normalized);
}

function buildCadenceDegreePool(
    scale: number[],
    chordIntervals: number[],
    {
        preferStable = false,
        preferConclusive = false,
    }: { preferStable?: boolean; preferConclusive?: boolean } = {},
): number[] {
    const rootDegrees: number[] = [];
    const thirdDegrees: number[] = [];
    const stableDegrees: number[] = [];
    const colorDegrees: number[] = [];

    scale.forEach((interval, degree) => {
        const normalized = normalizeInterval(interval);

        if (normalized === 0) {
            rootDegrees.push(degree);
        }
        if (normalized === 3 || normalized === 4) {
            thirdDegrees.push(degree);
        }
        if (isStableCadenceInterval(normalized, chordIntervals)) {
            stableDegrees.push(degree);
        } else if (isSoftCadenceInterval(normalized)) {
            colorDegrees.push(degree);
        }
    });

    if (preferConclusive) {
        return [...rootDegrees, ...rootDegrees, ...thirdDegrees, ...thirdDegrees, ...stableDegrees];
    }

    if (preferStable) {
        return [...thirdDegrees, ...stableDegrees, ...stableDegrees, ...colorDegrees];
    }

    return [...stableDegrees, ...stableDegrees, ...colorDegrees];
}

function selectLandingMidi(
    note: SeedNote,
    previousNote: SeedNote | null,
    chord: any,
    allowSoftColor: boolean,
): number {
    const chordIntervals = chord.intervals || [0, 4, 7];
    const allowedIntervals: number[] = [...chordIntervals];

    if (allowSoftColor) {
        allowedIntervals.push(2, 5, 9);
    }

    let bestMidi = note.midi;
    let minScore = Number.POSITIVE_INFINITY;
    const baseOctave = Math.floor(note.midi / 12) * 12;

    for (const interval of allowedIntervals) {
        const targetPitchClass = normalizeInterval(chord.rootMidi + interval);
        for (const octaveShift of [-12, 0, 12]) {
            const candidateMidi = baseOctave + targetPitchClass + octaveShift;
            const movePenalty = Math.abs(candidateMidi - note.midi) * 2.0;
            const linePenalty = previousNote
                ? Math.abs(candidateMidi - previousNote.midi) * 0.5
                : 0;
            const stableBonus =
                interval === 0 || interval === 3 || interval === 4
                    ? -1.25
                    : interval === 7 || interval === 10 || interval === 11
                      ? -0.5
                      : 0;
            const totalScore = movePenalty + linePenalty + stableBonus;

            if (totalScore < minScore) {
                minScore = totalScore;
                bestMidi = candidateMidi;
            }
        }
    }

    return bestMidi;
}

function polishCadenceLandings(
    notes: SeedNote[],
    stepMap: any[],
    sectionMap: any[],
    actualTotalSteps: number,
    arranger: ArrangerState,
    style: string,
): SeedNote[] {
    const polishedNotes = [...notes].sort((a, b) => a.step - b.step);

    for (let measureStart = 0; measureStart < actualTotalSteps; ) {
        const { ts } = getEffectiveMeterAtStep(arranger, measureStart);
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        const measureEnd = measureStart + stepsPerMeasure;
        const noteIndexes: number[] = [];

        for (let i = 0; i < polishedNotes.length; i++) {
            const note = polishedNotes[i];
            if (note.step >= measureStart && note.step < measureEnd) {
                noteIndexes.push(i);
            }
        }

        if (noteIndexes.length === 0) {
            measureStart = measureEnd;
            continue;
        }

        const lastIndex = noteIndexes[noteIndexes.length - 1];
        const note = polishedNotes[lastIndex];
        const stepEntry = binarySearchMap(stepMap, Math.min(note.step, actualTotalSteps - 1));

        if (!stepEntry?.chord) {
            measureStart = measureEnd;
            continue;
        }

        const currentSection = sectionMap.find(
            (section: any) => measureStart >= section.start && measureStart < section.end,
        );
        const category = getSectionCategory(currentSection?.label, style);
        const isDeparture = isDepartureCategory(category);
        const isSectionEnding = currentSection ? measureEnd >= currentSection.end : false;
        const chordIntervals = stepEntry.chord.intervals || [0, 4, 7];
        const interval = normalizeInterval(note.midi - stepEntry.chord.rootMidi);
        const isStable = isStableCadenceInterval(interval, chordIntervals);
        const isSoft = isSoftCadenceInterval(interval);
        const shouldRepairHarshLanding = !isStable && !isSoft;
        const shouldTightenStatementEnding = !isDeparture && isSectionEnding && !isStable;

        if (!shouldRepairHarshLanding && !shouldTightenStatementEnding) {
            measureStart = measureEnd;
            continue;
        }

        const previousNote = lastIndex > 0 ? polishedNotes[lastIndex - 1] : null;
        const replacementMidi = selectLandingMidi(
            note,
            previousNote,
            stepEntry.chord,
            !shouldTightenStatementEnding,
        );

        if (replacementMidi !== note.midi) {
            polishedNotes[lastIndex] = { ...note, midi: replacementMidi };
        }
        measureStart = measureEnd;
    }

    return polishedNotes;
}

/**
 * Generates a song-wide seed melody for the soloist.
 * Generates the entire "Dynamic Head" (seed melody) for the current arrangement.
 *
 * The algorithm works in three phases:
 *  1. **Motif generation** – for each distinct section category (verse, chorus, bridge …)
 *     a rhythmic/melodic template (MotifEntry) is built using the Rhythm Cell Dictionary
 *     and a probabilistically chosen melodic contour.  Sections that share the same
 *     category reuse and mutate the same template, producing the A-A-B-A repetition
 *     expected in a song head.
 *  2. **Motif application** – each template event is resolved to an absolute MIDI pitch
 *     via a multi-criteria voice-leading search that balances stepwise motion, register
 *     anchoring, guide-tone preference, and chord-pivot awareness.
 *  3. **Improvisational post-processing** – syllable splits, syncopated anticipations,
 *     and neighbor/passing tones are injected stochastically to add vocal phrasing.
 *
 * All randomness is driven by `prng` (seeded via `seedStr`) so the output is
 * fully deterministic for a given seed, enabling consistent replay and testing.
 *
 * @param state - Ensemble state snapshot.
 * @param arranger - Arranger state snapshot.
 * @param style - Resolved soloist style key (e.g. 'jazz', 'scalar', 'bossa').
 * @param _intensity - Reserved for future intensity-aware seeding; currently unused.
 * @param seedStr - Optional PRNG seed string.  Omit for a random seed each call.
 * @returns `notes` is sorted ascending by `step`.  `loopLengthSteps` is the total length of one
 *   arrangement loop in scheduler steps (matches the arranger's unrolled length).  `seedId` is a
 *   content hash of the emitted notes — see {@link computeSeedId}.
 */
// #1157 — content token stamped on every session seed.
//
// why it exists: the WORKER does not see a regenerated seed as a NEW OBJECT.
// `recursiveSafeSync` (worker-utils.ts) deep-merges a plain-object field into
// the existing target rather than replacing it, so `soloist.session.seed` keeps
// its identity across a mid-playback regeneration (a key change / chart edit
// while playing — see `regenerateSessionSeeds` in state-effects.ts) while its
// `notes` are swapped underneath. Any worker-side consumer that caches by seed
// IDENTITY (the Q&A window digest in soloist-phrase-first.ts) would therefore
// keep serving the OLD seed's derived data against the new line.
//
// why CONTENT-derived and not a counter: a counter would make this function
// impure (same inputs, different output every call) — against the determinism
// rule, and it breaks value-equality between two identical generations. A hash
// over the emitted notes invalidates a cache exactly when the music changed,
// which is the property the cache actually wants. djb2 over the fields that
// define a note musically; `loopLengthSteps` seeds it so two same-note seeds on
// different form lengths still differ.
function computeSeedId(notes: SeedNote[], loopLengthSteps: number): number {
    let h = (5381 ^ loopLengthSteps) | 0;
    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        h = (Math.imul(h, 33) ^ (n.step | 0)) | 0;
        h = (Math.imul(h, 33) ^ (n.midi | 0)) | 0;
        h = (Math.imul(h, 33) ^ (n.durationSteps | 0)) | 0;
    }
    return h;
}

export function generateSessionSeed(
    state: EnsembleState,
    arranger: ArrangerState,
    style: string,
    _intensity?: number,
    seedStr?: string,
): { notes: SeedNote[]; loopLengthSteps: number; seedId: number } {
    style = resolveSoloistStyle(style, state?.groove?.genreFeel);

    // Unroll the arrangement for virtual macro-form (max 128 bars for performance)
    const unrolled = unrollArrangement(arranger, 128);
    const { stepMap, sectionMap, totalSteps } = unrolled;

    if (!stepMap || stepMap.length === 0) {
        return { notes: [], loopLengthSteps: 0, seedId: computeSeedId([], 0) };
    }

    // Seed-generation diagnostics — silent unless the soloist debug flag is on,
    // matching the runtime gating in soloist.ts / synth-soloist.ts.
    const logSeed = (msg: string) => {
        if (state?.playback?.debugSoloist) {
            // biome-ignore lint/suspicious/noConsole: deliberate diagnostic, gated behind playback.debugSoloist
            console.log(msg);
        }
    };

    const prng = createPRNG(seedStr || generateRandomSeed());

    const styleConfig: any = STYLE_CONFIG[style] || STYLE_CONFIG.scalar;
    const playbackBpm = state?.playback?.bpm || 100;

    const notes: SeedNote[] = [];

    // Ensure totalSteps is a valid number
    const actualTotalSteps =
        typeof totalSteps === 'number' && !Number.isNaN(totalSteps)
            ? totalSteps
            : sectionMap[sectionMap.length - 1]?.end || 0;

    if (!sectionMap || sectionMap.length === 0 || actualTotalSteps === 0) {
        return {
            notes: [],
            loopLengthSteps: actualTotalSteps,
            seedId: computeSeedId([], actualTotalSteps),
        };
    }

    // To ensure repetition across compatible sections (e.g. AABA form),
    // memorize the target note sequence for each section label + meter identity.
    // A beat-offset motif is not portable across meters: interpreting a 7/8 motif
    // with 4/4's stepsPerBeat stretches the phrase beyond its section and drops
    // events at the seam.
    // For even more musicality, we'll store the 'motif' of steps and intervals relative to chords.
    const sectionMotifs = new Map<string, MotifEntry>();

    const sectionIterationCount = new Map<string, number>();

    // --- #1058 Motif inheritance on unrolled macro-forms ---
    // `unrollArrangement` merges adjacent same-role iterations, so on a synthetic
    // macro-form every role category occurs exactly once and the `iteration > 0`
    // restatement ops below can never fire — each role would compose a FRESH motif
    // and the head the listener just learned gets replaced wholesale. Instead,
    // theme-roles INHERIT the head (A–A′–B–C–A): Verse develops it (1 op), Solo
    // develops it deeper (2 ops), Outro returns it verbatim ("head out"), while
    // Chorus stays freshly composed with the existing contrast machinery (the B).
    // Real multi-section charts are NOT unrolled, so they keep composer freedom
    // and their existing restatement behavior.
    const isUnrolledForm = unrolled.totalSteps !== unrolled.originalSteps;
    let headMeterIdentity: string | null = null;
    let headMotifKey: string | null = null;

    // Find macro turnaround index
    const turnaroundIndex = sectionMap.length - 1;
    // ... (rest of logic remains same, but using actualTotalSteps)

    // Walk through each section
    logSeed(
        `[Seeder Debug] Starting seed generation. Total steps: ${actualTotalSteps}, time signature: ${arranger.timeSignature}`,
    );

    sectionMap.forEach((sectionRange, index) => {
        const sectionTsName = sectionRange.timeSignature || arranger.timeSignature;
        const tsConfig: any = getEffectiveTimeSignature(
            sectionTsName,
            sectionTsName === arranger.timeSignature ? arranger.grouping : null,
        );
        const stepsPerBeat = tsConfig.stepsPerBeat;
        const stepsPerMeasure = tsConfig.beats * stepsPerBeat;
        const tripletProfile = styleConfig.seedTriplets || {};
        const tripletEnabled = Boolean(
            tripletProfile.enabled &&
                !tsConfig.isCompound &&
                tsConfig.beats === 4 &&
                stepsPerBeat >= 4,
        );
        const tripletCellBias = tripletEnabled ? tripletProfile.cellBias || 0 : 0;
        const tripletPickupBias = tripletEnabled ? tripletProfile.pickupBias || 0 : 0;
        const tripletMutationBias = tripletEnabled ? tripletProfile.mutationBias || 0 : 0;
        const tripletCadenceBias = tripletEnabled ? tripletProfile.cadenceBias || 0 : 0;
        const tripletTimingStrength = tripletEnabled ? tripletProfile.timingStrength || 0 : 0;
        const label = (sectionRange.label || 'Main').toLowerCase();

        const category = getSectionCategory(label, style);
        const meterIdentity = `${sectionTsName}:${tsConfig.beats}/${stepsPerBeat}:${(
            tsConfig.grouping || [tsConfig.beats]
        ).join('+')}`;
        const motifKeyFor = (candidateCategory: string) => `${candidateCategory}:${meterIdentity}`;
        const motifKey = motifKeyFor(category);
        if (index === 0) {
            headMeterIdentity = meterIdentity;
            headMotifKey = motifKey;
        }

        const sectionStartMeasure = 0;
        const sectionEndMeasure = Math.ceil(
            (sectionRange.end - sectionRange.start) / stepsPerMeasure,
        );

        logSeed(
            `[Seeder Debug] Section ${label}: start measure ${sectionStartMeasure}, end measure ${sectionEndMeasure}. Applying motif.`,
        );

        const isDeparture = isDepartureCategory(category);

        // Track iterations to apply restatement mutations
        const iteration = sectionIterationCount.get(motifKey) || 0;
        sectionIterationCount.set(motifKey, iteration + 1);

        const config = styleConfig;
        const registerProfile = getSoloistRegisterProfile(style);
        const rhythmicDensity = config.rhythmicDensity || 0.5;
        const syncBias = config.syncopationLikelihood || 0.2;
        const isBossaStyle = style === 'bossa';
        const isNeoStyle = style === 'neo';
        const isSmoothSyncStyle = isBossaStyle || isNeoStyle;
        const isJazzStyle = ['jazz', 'bird', 'bossa'].includes(style);
        const isForwardStatement = !isJazzStyle && (index === 0 || !isDeparture);
        // Lean the head a little denser without flattening the contour.
        const statementDensity = isForwardStatement
            ? Math.min(0.84, rhythmicDensity + 0.1 + syncBias * 0.12)
            : rhythmicDensity;

        /**
         * Helper to generate a 1-measure rhythmic cell
         */
        const generateCell = (sparse: boolean, dense: boolean, density: number): any[] => {
            const cell: any[] = [];
            const beatsPerCell = tsConfig.beats;
            const isCompound = tsConfig.pulse && tsConfig.pulse.length > 0;

            if (isCompound) {
                // Compound Meter Pulse-Aware Generation (e.g. 6/8)
                const grouping = tsConfig.grouping || [beatsPerCell];
                let currentGroupStep = 0;

                grouping.forEach((groupSize: number) => {
                    const groupSteps = groupSize * stepsPerBeat;
                    let stepInGroup = 0;

                    while (stepInGroup < groupSteps) {
                        const isPulseStart = stepInGroup === 0;
                        let isRest = false;

                        if (sparse) {
                            isRest = prng() > (isPulseStart ? density * 0.6 : density * 0.4);
                        } else if (dense) {
                            isRest = prng() > Math.min(0.98, density * 1.5);
                        } else {
                            isRest = prng() > (isPulseStart ? density * 1.1 : density * 0.9);
                        }

                        // Calculate duration
                        let durationSteps = stepsPerBeat;
                        if (dense) {
                            durationSteps = prng() > 0.5 ? stepsPerBeat / 2 : stepsPerBeat;
                        } else if (sparse) {
                            durationSteps = groupSteps - stepInGroup;
                        } else {
                            if (stepInGroup + stepsPerBeat > groupSteps) {
                                durationSteps = groupSteps - stepInGroup;
                            }
                        }

                        if (!isRest) {
                            cell.push({
                                beatOffset: (currentGroupStep + stepInGroup) / stepsPerBeat,
                                duration: durationSteps,
                                isRest: false,
                            });
                        }

                        stepInGroup += durationSteps;
                    }
                    currentGroupStep += groupSteps;
                });
            } else {
                // Standard Meter: Use Rhythm Dictionary
                let pool = RH_CELLS.BASIC;
                const forwardPool = [
                    RH_CELLS.BASIC[0],
                    RH_CELLS.BASIC[1],
                    RH_CELLS.SYNC[1],
                    RH_CELLS.SYNC[3],
                ];
                const linePool = [
                    RH_CELLS.BASIC[1],
                    RH_CELLS.SYNC[1],
                    RH_CELLS.SYNC[2],
                    ...RH_CELLS.LINE,
                ];
                const hookPool = [
                    RH_CELLS.BASIC[2],
                    RH_CELLS.BASIC[3],
                    RH_CELLS.SYNC[3],
                    RH_CELLS.LINE[3],
                ];
                if (beatsPerCell === 3) {
                    pool = RH_CELLS.WALTZ;
                } else if (isJazzStyle) {
                    if (dense || density > 0.68 || syncBias > 0.82) {
                        pool = [...linePool, ...hookPool, ...RH_CELLS.SYNC, ...RH_CELLS.SYNC];
                    } else if (density >= 0.52) {
                        pool =
                            prng() < 0.55 + syncBias * 0.25
                                ? [...linePool, ...hookPool, ...RH_CELLS.SYNC]
                                : [...linePool, ...RH_CELLS.BASIC];
                    } else {
                        pool =
                            prng() < 0.65 + syncBias * 0.15
                                ? [...linePool, ...RH_CELLS.SYNC, RH_CELLS.BASIC[3]]
                                : [...RH_CELLS.BASIC, ...RH_CELLS.LINE];
                    }
                } else if (isForwardStatement && density >= 0.55) {
                    pool =
                        syncBias > 0.65
                            ? prng() < 0.8
                                ? [...RH_CELLS.LINE, ...forwardPool, ...RH_CELLS.SYNC]
                                : [...RH_CELLS.SYNC, ...hookPool]
                            : prng() < 0.65
                              ? forwardPool
                              : [...forwardPool, ...RH_CELLS.SYNC];
                } else if (syncBias > 0.6 && (density > 0.5 || dense)) {
                    pool =
                        prng() < 0.7
                            ? [...RH_CELLS.LINE, ...RH_CELLS.SYNC, ...hookPool]
                            : [...RH_CELLS.BASIC, ...RH_CELLS.SYNC];
                } else if (density > 0.7 || dense || prng() < 0.3) {
                    pool = [...RH_CELLS.BASIC, ...RH_CELLS.SYNC];
                }

                if (tripletEnabled) {
                    const tripletChance = Math.min(
                        0.95,
                        tripletCellBias +
                            syncBias * 0.12 +
                            (dense ? 0.12 : 0) +
                            (density > 0.6 ? 0.08 : 0) +
                            tripletCadenceBias * 0.08,
                    );
                    if (prng() < tripletChance) {
                        const repeats = Math.max(
                            1,
                            Math.round(1 + tripletCellBias * 4 + tripletCadenceBias * 2),
                        );
                        pool = [...pool, ...repeatCellPool(RH_CELLS.TRIPLET, repeats)];
                    }
                }

                const selectedPattern = pool[Math.floor(prng() * pool.length)];
                const restProb = 1.0 - density;
                const restScale = isJazzStyle ? 0.08 : Math.max(0.06, 0.15 - syncBias * 0.08);

                selectedPattern.forEach((beatOffset, idx) => {
                    // Sparse mode drops non-anchors
                    if (sparse && idx % 2 !== 0 && prng() < 0.6) {
                        return;
                    }

                    // General rest probability (significantly reduced since dictionary cells are already musical)
                    if (!dense && prng() < restProb * restScale) {
                        return;
                    }

                    const nextOffset = selectedPattern[idx + 1] || beatsPerCell;
                    let dur = (nextOffset - beatOffset) * stepsPerBeat;

                    // Add some length variety to basic patterns
                    if (
                        !dense &&
                        !isJazzStyle &&
                        dur === stepsPerBeat &&
                        prng() < Math.max(0.05, 0.2 - syncBias * 0.12)
                    ) {
                        dur *= 2;
                    }

                    cell.push({
                        beatOffset,
                        duration: dur,
                        isRest: false,
                    });
                });
            }
            return cell;
        };

        /**
         * One motivic development op (the restatement vocabulary), applied in place.
         * `eligible` scopes which events an op may touch — `() => true` reproduces the
         * classic whole-motif restatement (and preserves its exact PRNG draw order);
         * the #1058 inheritance path passes a tail-measures guard so the measure-0
         * hook cell recurs verbatim while the rest of the motif develops.
         */
        const applyRestatementOp = (
            motifNotes: MotifEvent[],
            eligible: (n: MotifEvent) => boolean,
        ): void => {
            const r = prng();
            if (r < 0.2) {
                // Enhanced Rhythmic Displacement: Shift motif by 16th, 8th, or anticipate
                const shiftAmount =
                    tripletEnabled && prng() < tripletMutationBias
                        ? prng() > 0.5
                            ? 1 / 3
                            : -1 / 3
                        : prng() > 0.5
                          ? 0.5
                          : prng() > 0.5
                            ? 0.25
                            : -0.5;
                motifNotes.forEach((n) => {
                    if (eligible(n)) {
                        n.beatOffset += shiftAmount;
                    }
                });
            } else if (r < 0.4) {
                // Rhythmic Compression / Subdivision
                const longNotes = motifNotes.filter(
                    (n) => n.duration >= stepsPerBeat && !n.isRest && eligible(n),
                );
                if (longNotes.length > 0) {
                    const target = longNotes[Math.floor(prng() * longNotes.length)];
                    const originalDuration = target.duration;
                    const useTripletSplit =
                        tripletEnabled &&
                        prng() < tripletMutationBias &&
                        originalDuration >= stepsPerBeat * 1.5;
                    const firstDuration = useTripletSplit
                        ? roundSeedRhythmValue(originalDuration / 3)
                        : originalDuration / 2;
                    const secondDuration = roundSeedRhythmValue(originalDuration - firstDuration);
                    target.duration = firstDuration;
                    // Insert the second note
                    const newNote = {
                        ...target,
                        beatOffset: roundSeedRhythmValue(
                            target.beatOffset + firstDuration / stepsPerBeat,
                        ),
                        duration: secondDuration,
                        scaleDegreeOffset: target.scaleDegreeOffset + (prng() > 0.5 ? 1 : -1),
                    };
                    const idx = motifNotes.indexOf(target);
                    motifNotes.splice(idx + 1, 0, newNote);
                }
            } else if (r < 0.55) {
                // Note Drop (Less is More)
                const optionalNotes = motifNotes.filter(
                    (n) => !n.isRest && n.beatOffset % tsConfig.beats !== 0 && eligible(n),
                );
                if (optionalNotes.length > 0) {
                    const target = optionalNotes[Math.floor(prng() * optionalNotes.length)];
                    target.isRest = true;
                }
            } else if (r < 0.7) {
                // Interval Expansion: Push the highest pitch up a diatonic third
                let maxDegree = -999;
                let targetNote: MotifEvent | null = null;
                motifNotes.forEach((n) => {
                    if (!n.isRest && eligible(n) && n.scaleDegreeOffset > maxDegree) {
                        maxDegree = n.scaleDegreeOffset;
                        targetNote = n;
                    }
                });
                if (targetNote) {
                    (targetNote as MotifEvent).scaleDegreeOffset += 2; // Diatonic third
                }
            } else if (r < 0.85) {
                if (isSmoothSyncStyle) {
                    // Smooth-sync styles still benefit from a memorable restatement,
                    // but a total pitch collapse tends to produce overly static weak seeds.
                    let gestureDir = prng() > 0.5 ? 1 : -1;
                    let activeIndex = 0;
                    motifNotes.forEach((n) => {
                        if (n.isRest || !eligible(n)) {
                            return;
                        }
                        const gestureSlot = activeIndex % 4;
                        if (gestureSlot === 0 || gestureSlot === 2) {
                            n.scaleDegreeOffset = 0;
                        } else if (gestureSlot === 1) {
                            n.scaleDegreeOffset = gestureDir * 2;
                        } else {
                            n.scaleDegreeOffset = gestureDir;
                            gestureDir *= -1;
                        }
                        activeIndex++;
                    });
                } else {
                    // Stationary Transformation: Collapse all pitches to a single anchor tone (Root/5th)
                    // This creates "tension hooks" during restatements
                    motifNotes.forEach((n) => {
                        if (eligible(n)) {
                            n.scaleDegreeOffset = 0;
                        }
                    });
                }
            } else {
                // Sequencing: Transpose the entire motif by a diatonic step or third
                const shift = prng() > 0.5 ? 1 : 2;
                motifNotes.forEach((n) => {
                    if (!n.isRest && eligible(n)) {
                        n.scaleDegreeOffset += shift;
                    }
                });
            }
        };

        // --- #1058 Inheritance branch (unrolled macro-forms only; see the note at
        // `isUnrolledForm`) --- Theme-roles clone the head's motif instead of composing
        // fresh. Measure 0 is held verbatim: it is the #1056 hook cell, which re-realizes
        // over each block's downbeat chord, so an identical degree shape recurs and
        // transposes with the harmony for free. Dev ops touch only the tail measures.
        // Chorus is deliberately absent — it stays freshly composed with the departure
        // contrast machinery (the B section).
        if (
            isUnrolledForm &&
            index > 0 &&
            !sectionMotifs.has(motifKey) &&
            category in UNROLLED_INHERIT_OPS
        ) {
            // Inheritance is rhythmic reuse too, so it is valid only inside the
            // head's meter identity. A role in a different meter composes its own
            // motif instead of reinterpreting head beat offsets on another grid.
            const headEntry =
                meterIdentity === headMeterIdentity && headMotifKey
                    ? sectionMotifs.get(headMotifKey)
                    : undefined;
            if (headEntry) {
                const inherited = headEntry.motif.map((n) => ({ ...n }));
                const inTailMeasures = (n: MotifEvent) => n.beatOffset >= tsConfig.beats;
                for (let op = 0; op < UNROLLED_INHERIT_OPS[category]; op++) {
                    applyRestatementOp(inherited, inTailMeasures);
                }
                sectionMotifs.set(motifKey, {
                    motif: inherited,
                    phraseLength: headEntry.phraseLength,
                    contourType: headEntry.contourType,
                    metrics: computeMotifMetrics(inherited, headEntry.phraseLength, tsConfig.beats),
                    isStationaryMotif: headEntry.isStationaryMotif,
                });
            }
        }

        // Generate or retrieve the motif for this section category
        // A motif is a 2-measure rhythmic/melodic contour template
        if (!sectionMotifs.has(motifKey)) {
            const stationaryProb = Math.max(
                isSmoothSyncStyle && !isDeparture ? 0.01 : 0.02,
                (config.stationaryProb || 0.05) *
                    Math.max(0.35, 1 - syncBias * 0.7) *
                    (isSmoothSyncStyle && !isDeparture ? 0.4 : 1),
            );
            const isStationaryMotif = prng() < stationaryProb;

            // Generate a 2-measure template
            const motif: any[] = [];
            let currentDegreeOffset = 0;

            // Check for contrast needs
            let forceSparse = false;
            let forceDense = false;
            if (isDeparture) {
                // Find primary motif metrics to create contrast. On an unrolled
                // macro-form the head is the true primary (#1058) — jazz styles file
                // their verse under the 'jazz' category, so the label chain misses.
                const primaryMetrics =
                    sectionMotifs.get(motifKeyFor('verse'))?.metrics ||
                    sectionMotifs.get(motifKeyFor('main'))?.metrics ||
                    sectionMotifs.get(motifKeyFor('a'))?.metrics ||
                    (isUnrolledForm && meterIdentity === headMeterIdentity && headMotifKey
                        ? sectionMotifs.get(headMotifKey)?.metrics
                        : undefined);
                if (primaryMetrics) {
                    if (primaryMetrics.density > 4 && primaryMetrics.syncopationRatio > 0.4) {
                        forceSparse = true;
                    } else if (primaryMetrics.density < 3) {
                        forceDense = true;
                    }
                }
            }

            // Determine phrase length dynamically
            const sectionTotalMeasures = sectionEndMeasure - sectionStartMeasure;
            let phraseLength = 2; // default
            if (sectionTotalMeasures > 0) {
                if (sectionTotalMeasures % 12 === 0) {
                    phraseLength = 4; // Blues phrasing
                } else if (sectionTotalMeasures % 8 === 0) {
                    phraseLength = 4; // Pop/Jazz standard
                } else if (sectionTotalMeasures % 4 === 0) {
                    phraseLength = 4;
                }
            }

            // --- Melodic Intent Phase ---
            const contourPool = isBossaStyle
                ? [
                      'ASCEND',
                      'DESCEND',
                      'ARCH',
                      'ARCH',
                      'VALLEY',
                      'HOOK',
                      'ARPEGGIATE',
                      'ARPEGGIATE',
                      'ARPEGGIATE',
                  ]
                : isJazzStyle
                  ? [
                        'ASCEND',
                        'DESCEND',
                        'ARCH',
                        'VALLEY',
                        'HOOK',
                        'ARPEGGIATE',
                        'HOOK',
                        'ARPEGGIATE',
                        'ARCH',
                    ]
                  : isNeoStyle
                    ? [
                          'ASCEND',
                          'DESCEND',
                          'ARCH',
                          'ARCH',
                          'VALLEY',
                          'HOOK',
                          'ARPEGGIATE',
                          'ARPEGGIATE',
                          'ARPEGGIATE',
                      ]
                    : isForwardStatement
                      ? syncBias > 0.65
                          ? [
                                'ASCEND',
                                'DESCEND',
                                'ARCH',
                                'VALLEY',
                                'HOOK',
                                'HOOK',
                                'ARPEGGIATE',
                                'ARPEGGIATE',
                                'ARCH',
                            ]
                          : [
                                'ASCEND',
                                'DESCEND',
                                'ARCH',
                                'VALLEY',
                                'STATIC',
                                'HOOK',
                                'HOOK',
                                'ARPEGGIATE',
                            ]
                      : syncBias > 0.55
                        ? [
                              'ASCEND',
                              'DESCEND',
                              'ARCH',
                              'VALLEY',
                              'HOOK',
                              'ARPEGGIATE',
                              'ARPEGGIATE',
                              'STATIC',
                          ]
                        : ['ASCEND', 'DESCEND', 'ARCH', 'VALLEY', 'STATIC', 'HOOK', 'ARPEGGIATE'];
            const contourType = contourPool[Math.floor(prng() * contourPool.length)];
            logSeed(`[Composer] Assigned contour: ${contourType} to category: ${category}`);

            // 1. Generate the initial A cell
            const cellA = generateCell(forceSparse, forceDense, statementDensity);

            // Generate secondary cells for longer phrases
            const cellB = generateCell(forceSparse, forceDense, statementDensity);
            const cellC = generateCell(forceSparse, forceDense, statementDensity);

            // Determine motif structure based on phrase length
            const structureRoll = prng();
            let structureType = 'A-B'; // fallback

            if (phraseLength === 4) {
                if (isJazzStyle || isForwardStatement) {
                    if (structureRoll < 0.35) {
                        structureType = 'A-A-B-A';
                    } else if (structureRoll < 0.65) {
                        structureType = 'A-A-A-B';
                    } else if (structureRoll < 0.82) {
                        structureType = 'A-B-A-B';
                    } else if (structureRoll < 0.95) {
                        structureType = 'A-B-A-C';
                    } else {
                        structureType = 'A-B-A-Rest';
                    }
                } else if (structureRoll < 0.25) {
                    structureType = 'A-A-A-B';
                } else if (structureRoll < 0.5) {
                    structureType = 'A-B-A-C';
                } else if (structureRoll < 0.75) {
                    structureType = 'A-A-B-A';
                } else if (structureRoll < 0.9) {
                    structureType = 'A-B-A-B';
                } else {
                    structureType = 'A-B-A-Rest'; // More tasteful than A-Rest-B-Rest
                }
            } else {
                if (isJazzStyle) {
                    if (structureRoll < 0.62) {
                        structureType = 'A-A';
                    } else if (structureRoll < 0.92) {
                        structureType = 'A-B';
                    } else {
                        structureType = 'A-Rest';
                    }
                } else if (structureRoll < 0.5) {
                    structureType = 'A-A';
                }
            }

            // 2. Build the motif based on the chosen structure
            currentDegreeOffset = 0;
            // Contour-based starting offset
            if (contourType === 'ASCEND') {
                currentDegreeOffset = -2;
            } else if (contourType === 'DESCEND') {
                currentDegreeOffset = 4;
            }

            let lastMotion = 0;
            const structureArray = structureType.split('-');

            const cellMemory = new Map<string, number[]>();

            let tiedDurationBeats = 0;

            for (let measure = 0; measure < phraseLength; measure++) {
                let currentCell = cellA;
                const cellType = structureArray[measure % structureArray.length];

                if (cellType === 'B') {
                    currentCell = cellB;
                } else if (cellType === 'C') {
                    currentCell = cellC;
                } else if (cellType === 'Rest') {
                    // Create a mostly empty cell
                    currentCell = [
                        {
                            beatOffset: 0,
                            duration: tsConfig.beats * stepsPerBeat,
                            isRest: true,
                        },
                    ];
                    // 30% chance for a small closing hit on beat 4
                    if (prng() < 0.3) {
                        currentCell[0].duration = (tsConfig.beats - 1) * stepsPerBeat;
                        currentCell.push({
                            beatOffset: tsConfig.beats - 1,
                            duration: stepsPerBeat,
                            isRest: false,
                        });
                    }
                }

                const isPhraseEndingMeasure = measure === phraseLength - 1;
                const hasTripletOffsets = currentCell.some((note) =>
                    Boolean(getTripletPlacementTag(note.beatOffset)),
                );
                if (
                    tripletEnabled &&
                    !isStationaryMotif &&
                    !forceSparse &&
                    cellType !== 'Rest' &&
                    isPhraseEndingMeasure &&
                    !hasTripletOffsets
                ) {
                    const cadenceTripletChance = Math.min(
                        0.88,
                        0.18 +
                            tripletCadenceBias * 0.42 +
                            tripletCellBias * 0.2 +
                            (forceDense || statementDensity > 0.68 ? 0.06 : 0) +
                            (contourType === 'HOOK' || contourType === 'ARPEGGIATE' ? 0.08 : 0),
                    );
                    if (prng() < cadenceTripletChance) {
                        const cadencePool =
                            contourType === 'HOOK' || contourType === 'ARPEGGIATE'
                                ? [
                                      ...RH_CELLS.TRIPLET_TAIL,
                                      RH_CELLS.TRIPLET[2],
                                      RH_CELLS.TRIPLET[3],
                                  ]
                                : [...RH_CELLS.TRIPLET_TAIL, ...RH_CELLS.TRIPLET];
                        const cadencePattern =
                            cadencePool[Math.floor(prng() * cadencePool.length)] ||
                            RH_CELLS.TRIPLET_TAIL[0];
                        currentCell = buildPatternCell(
                            cadencePattern,
                            tsConfig.beats,
                            stepsPerBeat,
                        );
                    }
                }

                // --- Melodic Sequencing Logic ---
                // If we've seen this cell type before, reuse its relative intervals (offsets)
                const previousOffsets = cellMemory.get(cellType);
                const currentCellOffsets: number[] = [];

                currentCell.forEach((cellNote, noteIdx) => {
                    let isRest = cellNote.isRest;
                    let duration = cellNote.duration;

                    // BARLINE TIE: If the previous measure tied over, silence notes at the entrance
                    if (tiedDurationBeats > 0 && cellNote.beatOffset < tiedDurationBeats) {
                        isRest = true;
                    }

                    // Imperfect Symmetry: Even if A-A, let repeated measures drift slightly
                    const symmetryMutationProb =
                        contourType === 'HOOK' ? 0.15 : isJazzStyle ? 0.22 : 0.3;
                    if (measure > 0 && cellType === 'A' && prng() < symmetryMutationProb) {
                        const r = prng();
                        if (r < 0.4) {
                            isRest = !isRest; // Flip rest status
                        } else if (r < 0.7) {
                            duration = Math.max(
                                stepsPerBeat / 2,
                                duration + (prng() > 0.5 ? 2 : -2),
                            ); // Change duration
                        }
                    }

                    let motion = 0;
                    if (!isRest) {
                        if (previousOffsets && previousOffsets[noteIdx] !== undefined) {
                            // SEQUENCE: Reuse the motion from the first time we played this cell type
                            motion = previousOffsets[noteIdx];
                        } else if (!isStationaryMotif) {
                            const r = prng();
                            const highSyncContour =
                                syncBias > 0.75 && !['jazz', 'bird'].includes(style);

                            // CONTOUR BIASING
                            const progress = measure / phraseLength;
                            let upProb = 0.5;
                            if (contourType === 'ASCEND') {
                                upProb = 0.7;
                            } else if (contourType === 'DESCEND') {
                                upProb = 0.3;
                            } else if (contourType === 'ARCH') {
                                upProb = progress < 0.5 ? 0.7 : 0.3;
                            } else if (contourType === 'VALLEY') {
                                upProb = progress < 0.5 ? 0.3 : 0.7;
                            } else if (contourType === 'STATIC') {
                                upProb = currentDegreeOffset > 0 ? 0.2 : 0.8;
                            }

                            // Leap-and-Fill Logic: If we just jumped, must step back
                            if (
                                Math.abs(lastMotion) >=
                                (contourType === 'ARPEGGIATE' ? 5 : contourType === 'HOOK' ? 4 : 4)
                            ) {
                                motion = lastMotion > 0 ? -1 : 1; // Step in opposite direction
                            } else if (contourType === 'ARPEGGIATE') {
                                if (r < (highSyncContour ? 0.34 : 0.38)) {
                                    motion = prng() < upProb ? 2 : -2; // Thirds
                                } else if (r < (highSyncContour ? 0.74 : 0.68)) {
                                    motion = prng() < upProb ? 4 : -4; // Fifth-ish vaults
                                } else if (r < 0.92) {
                                    motion = prng() < upProb ? 1 : -1; // Filling step
                                } else {
                                    motion = 0; // Tasteful repeat
                                }
                            } else if (contourType === 'HOOK') {
                                if (r < (highSyncContour ? 0.18 : 0.24)) {
                                    motion = 0; // Repetition keeps the hook singable
                                } else if (r < (highSyncContour ? 0.58 : 0.6)) {
                                    motion = prng() < upProb ? 2 : -2; // Skips add contour
                                } else if (r < (highSyncContour ? 0.76 : 0.82)) {
                                    motion = prng() < upProb ? 1 : -1;
                                } else {
                                    motion =
                                        prng() < upProb
                                            ? highSyncContour
                                                ? 4
                                                : 3
                                            : highSyncContour
                                              ? -4
                                              : -3;
                                }
                            } else {
                                // Normal motion logic
                                if (r < (highSyncContour ? 0.44 : 0.52)) {
                                    motion = prng() < upProb ? 1 : -1; // Step
                                } else if (r < (highSyncContour ? 0.76 : 0.79)) {
                                    motion = prng() < upProb ? 2 : -2; // Skip
                                } else if (r < (highSyncContour ? 0.84 : 0.88)) {
                                    motion = 0; // Repeat
                                } else {
                                    motion =
                                        prng() < upProb
                                            ? highSyncContour
                                                ? 4
                                                : 3
                                            : highSyncContour
                                              ? -4
                                              : -3; // Leap
                                }
                            }

                            // Magnetic Center: Pull back towards 0 if we drift too far
                            // This ensures contour doesn't drift too high or low
                            const excursionLimit =
                                contourType === 'ARPEGGIATE'
                                    ? 8
                                    : contourType === 'HOOK'
                                      ? 7
                                      : syncBias > 0.75
                                        ? 7
                                        : 6;
                            if (currentDegreeOffset > excursionLimit && motion > 0) {
                                motion = prng() > 0.5 ? -1 : -2;
                            }
                            if (currentDegreeOffset < -excursionLimit && motion < 0) {
                                motion = prng() > 0.5 ? 1 : 2;
                            }
                        }
                        currentDegreeOffset += motion;
                        lastMotion = motion;
                        currentCellOffsets.push(motion);
                    } else {
                        currentCellOffsets.push(0);
                    }

                    motif.push({
                        beatOffset: cellNote.beatOffset + measure * tsConfig.beats,
                        isPickup: false,
                        scaleDegreeOffset: currentDegreeOffset,
                        duration: duration,
                        isRest: isRest,
                    });
                });

                // Store the offsets for future sequencing
                if (!cellMemory.has(cellType)) {
                    cellMemory.set(cellType, currentCellOffsets);
                }

                // BARLINE TIE: At the end of the measure, decide if we should tie the last note over
                tiedDurationBeats = 0; // Reset for next measure
                if (measure < phraseLength - 1) {
                    const lastActiveNote = motif.filter((n) => !n.isRest).pop();
                    // If the last note ends late in the measure (beat 3 or later)
                    if (
                        lastActiveNote &&
                        lastActiveNote.beatOffset >= measure * tsConfig.beats + (tsConfig.beats - 1)
                    ) {
                        const tieProb = isJazzStyle ? 0.5 : isForwardStatement ? 0.1 : 0.25;
                        if (prng() < tieProb) {
                            const tieLengthBeats = prng() > 0.5 ? 1 : 0.5;
                            lastActiveNote.duration += tieLengthBeats * stepsPerBeat;
                            tiedDurationBeats = tieLengthBeats;
                        }
                    }
                }
            }

            // SAFETY: If motif is empty (all rests), force a note on the first downbeat
            const activeNotes = motif.filter((n) => !n.isRest);
            if (activeNotes.length === 0 && motif.length > 0) {
                const firstDownbeat = motif.find((n) => n.beatOffset === 0);
                if (firstDownbeat) {
                    firstDownbeat.isRest = false;
                    firstDownbeat.scaleDegreeOffset = 0;
                }
            }

            sectionMotifs.set(motifKey, {
                motif,
                phraseLength,
                contourType,
                metrics: computeMotifMetrics(motif, phraseLength, tsConfig.beats),
                isStationaryMotif,
            });
        }

        let { motif, phraseLength, isStationaryMotif, contourType } = sectionMotifs.get(
            motifKey,
        ) || {
            motif: [],
            phraseLength: 2,
            isStationaryMotif: false,
            contourType: 'STATIC',
        };

        // Motivic Mutation (Restatement)
        if (iteration > 0) {
            // Create a deep copy to mutate
            motif = motif.map((n) => ({ ...n }));
            // #1058 — on an unrolled form, a repeated category is inheritance-sourced
            // (jazz styles collapse verse+solo to one 'jazz' category, so the Solo is
            // the second occurrence). Its restatement keeps the same measure-0 hook
            // guard as the inheritance branch — the head's hook cell stays the
            // through-line while the tail develops ("blow on the head"). Real charts
            // (isUnrolledForm false) keep the classic whole-motif op, and its exact
            // PRNG draw order.
            const restatementEligible =
                isUnrolledForm && category in UNROLLED_INHERIT_OPS
                    ? (n: MotifEvent) => n.beatOffset >= tsConfig.beats
                    : () => true;
            applyRestatementOp(motif, restatementEligible);
        }

        // Apply motif to the section, typically repeating in 2-measure blocks
        // within a larger 4 or 8 measure block with a forced rest at the end.
        let registerBase = registerProfile.seedCenter;
        const intensityVal = _intensity || 0.5;

        if (category === 'intro' || index === 0) {
            registerBase -= registerProfile.seedIntroDrop;
        } else if (category === 'chorus') {
            registerBase += registerProfile.seedChorusLift;
        } else if (isDeparture) {
            registerBase += registerProfile.seedDepartureLift;
        } else if (intensityVal > 0.7) {
            registerBase += 2;
        }
        registerBase = Math.max(
            registerProfile.seedFloor,
            Math.min(registerProfile.seedCeiling - 6, registerBase),
        );

        let lastMidi = registerBase;

        // Find if this is the last section before a structural reset (macro form turnaround)
        // Usually the last section in the arranger.sectionMap, or right before a loop
        const _isLastSectionOfForm = index === turnaroundIndex;

        // Apply motifs in phraseLength-measure blocks across the entire section range
        for (let m = sectionStartMeasure; m < sectionEndMeasure; m += phraseLength) {
            const baseStep = sectionRange.start + m * stepsPerMeasure;

            // --- Sectional Turnaround Logic (A-A-A-B) ---
            // If this is the last phraseLength measures of a >= 8 measure section,
            // trigger a unique turnaround motif to break predictability.
            const isTurnaroundMeasures =
                !isStationaryMotif &&
                sectionEndMeasure - sectionStartMeasure >= 8 &&
                isSectionTurnaround(baseStep, sectionMap, stepsPerMeasure, phraseLength);
            let activeMotif: MotifEvent[] = [...motif]; // Copy so we can safely inject one-off pickups

            if (isTurnaroundMeasures) {
                // Generate a one-off "Departure" motif for the turnaround
                // Busier turnaround (+0.2 density boost) but still respects genre
                const tDensity = Math.min(1.0, rhythmicDensity + 0.2);

                activeMotif = [];
                let tDegree = 0;
                for (let tc = 0; tc < phraseLength; tc++) {
                    const tCell = generateCell(false, true, tDensity);
                    tCell.forEach((cNote) => {
                        tDegree += prng() > 0.5 ? 1 : -1;
                        activeMotif.push({
                            beatOffset: cNote.beatOffset + tc * tsConfig.beats,
                            isPickup: false,
                            scaleDegreeOffset: tDegree,
                            duration: cNote.duration,
                            isRest: false,
                        });
                    });
                }
            } else if (m === sectionStartMeasure) {
                // --- Sectional Entrance (Anacrusis) ---
                // Only trigger at the start of a structural block (and avoid sparse sections)
                if (prng() > 0.3 && !isStationaryMotif) {
                    const pickupEntries: Array<[string, number[]]> =
                        Object.entries(PICKUP_DICTIONARY);
                    if (tripletEnabled) {
                        const tripletPickupEntries: Array<[string, number[]]> = [
                            ['TRIPLET_RUN', PICKUP_DICTIONARY.TRIPLET_RUN],
                        ];
                        pickupEntries.push(
                            ...repeatCellPool(
                                tripletPickupEntries,
                                Math.max(1, Math.round(1 + tripletPickupBias * 4)),
                            ),
                        );
                    }
                    const [pKey, pPattern] =
                        pickupEntries[Math.floor(prng() * pickupEntries.length)] || [];

                    // Find the target degree we are leading into
                    const firstNote = activeMotif.find((n) => !n.isRest && n.beatOffset >= 0);
                    const targetDegree = firstNote ? firstNote.scaleDegreeOffset : 0;

                    // Start below the target and walk up to it
                    let currentDegree = targetDegree - pPattern.length;

                    // Inject pickup notes at the beginning of the motif
                    const pickupNotes = pPattern.map((pOffset: number, i: number) => {
                        const nextOffset = pPattern[i + 1] || 0;
                        return {
                            beatOffset: pOffset,
                            isPickup: true,
                            scaleDegreeOffset: currentDegree++,
                            duration: (nextOffset - pOffset) * stepsPerBeat,
                            isRest: false,
                        };
                    });

                    activeMotif = [...pickupNotes, ...activeMotif];
                    logSeed(`[Composer] Injected ${pKey} pickup into section ${label}`);
                }
            }

            // --- #1009 Question→answer phrase pairing (plan the pair up front) ---
            // Within a full 4-measure motif block, measures 0-1 are a QUESTION that
            // hangs on soft-color tension and measures 2-3 an ANSWER that resolves onto
            // a chord pillar — a musical sentence, so even the exposed early loops (0-1,
            // before development kicks in) "say something". Only full 4-measure blocks
            // (the common case); turnaround / stationary / pickup-only blocks stay
            // through-composed. The SESSION'S OPENING block is left a plain statement —
            // state the head first, start asking from the second phrase on (#1009 owner
            // decision). Cadence notes are identified by REFERENCE (like
            // `lastActiveMotifNote` below), tension/resolution PINNED post-scoring, and
            // the seam breath carved here at seed time (silence as a choice, not a gate).
            const qaBeatsPerMeasure = tsConfig.beats;
            const qaQuestionEndBeat = 2 * qaBeatsPerMeasure; // measures 0-1 = the question
            const qaBreathBeats = 1; // carved gap at the seam (≥ the §7 wall-clock floor)
            const isSessionOpeningBlock = index === 0 && m === sectionStartMeasure;
            const applyQA =
                phraseLength === 4 &&
                !isTurnaroundMeasures &&
                !isStationaryMotif &&
                !isSessionOpeningBlock;
            let questionCadenceNote: MotifEvent | null = null;
            let answerCadenceNote: MotifEvent | null = null;
            if (applyQA) {
                // `activeMotif` shares note OBJECTS with the reusable `motif` template
                // (shallow `[...motif]`), so deep-copy before mutating durations/rests —
                // otherwise the breath carve would corrupt every later block/section.
                activeMotif = activeMotif.map((n) => ({ ...n }));
                const qActive = activeMotif.filter(
                    (n) =>
                        !n.isRest &&
                        !n.isPickup &&
                        n.beatOffset >= 0 &&
                        n.beatOffset < qaQuestionEndBeat,
                );
                const aActive = activeMotif.filter(
                    (n) => !n.isRest && !n.isPickup && n.beatOffset >= qaQuestionEndBeat,
                );
                // Question cadence = the latest active question-half note that ends BY
                // the breath window (room to ring) and PREFERABLY sits on a WEAK beat —
                // a hanging question reads better off the beat, and it keeps the STRONG
                // beats resolving to chord tones (the §5 voice-leading invariant). This
                // is a PREFERENCE, not a guarantee: on a sparse question-half whose only
                // pre-breath notes are on strong beats, the fallbacks pin the hang to a
                // strong beat — a soft-color appoggiatura/suspension, which is itself a
                // fine question gesture, just not the invariant-preserving one.
                const qBreathStartBeat = qaQuestionEndBeat - qaBreathBeats;
                const qaMidBeat = Math.floor(qaBeatsPerMeasure / 2);
                const isStrongBeatOffset = (bo: number) =>
                    bo % qaBeatsPerMeasure === 0 || bo % qaBeatsPerMeasure === qaMidBeat;
                for (const n of qActive) {
                    if (n.beatOffset < qBreathStartBeat && !isStrongBeatOffset(n.beatOffset)) {
                        questionCadenceNote = n;
                    }
                }
                if (!questionCadenceNote) {
                    for (const n of qActive) {
                        if (n.beatOffset < qBreathStartBeat) {
                            questionCadenceNote = n;
                        }
                    }
                }
                if (!questionCadenceNote && qActive.length > 0) {
                    questionCadenceNote = qActive[qActive.length - 1];
                }
                answerCadenceNote = aActive.length > 0 ? aActive[aActive.length - 1] : null;
                // Only pair when BOTH halves are present — never half-apply (that would
                // leave a dangling question with no resolution).
                if (questionCadenceNote && answerCadenceNote) {
                    // Carve the breath: rest question-half notes AFTER the cadence so it
                    // rings into a real gap before the answer.
                    for (const n of activeMotif) {
                        if (
                            !n.isRest &&
                            !n.isPickup &&
                            n !== questionCadenceNote &&
                            n.beatOffset > questionCadenceNote.beatOffset &&
                            n.beatOffset < qaQuestionEndBeat
                        ) {
                            n.isRest = true;
                        }
                    }
                    // Hold the question cadence up to the breath (a raised-eyebrow hang).
                    const ringSteps = Math.max(
                        stepsPerBeat,
                        Math.round(
                            (qBreathStartBeat - questionCadenceNote.beatOffset) * stepsPerBeat,
                        ),
                    );
                    questionCadenceNote.duration = ringSteps;
                    // The answer sits down: a held landing (≥ 2 beats) so it reads closed.
                    answerCadenceNote.duration = Math.max(
                        answerCadenceNote.duration,
                        stepsPerBeat * 2,
                    );
                } else {
                    questionCadenceNote = null;
                    answerCadenceNote = null;
                }
            }

            // --- #1056 Hook cell (plan it up front, like the Q&A pair) ---
            // The first few active notes of MEASURE 0 become a protected, chord-rooted
            // repeating figure. Measure 0 is the same template position every block, so
            // its degree-shape is identical block-to-block; pinning its pitch (below,
            // post-scoring) makes it recur verbatim and SEQUENCE with the harmony —
            // exactly the short, identifiable hook the exposed early loops lack (#1055).
            // Skipped on turnaround (meant to surprise) and stationary (already static)
            // blocks; a note that is ALSO a Q&A cadence stays a cadence (that feature
            // wins). Computed on the FINAL `activeMotif` (after the QA deep-copy above)
            // so the references match what the note loop iterates.
            // ASSUMES one chord per measure-0 bar (true for the riff-blues/ballad charts
            // this targets): the whole cell is realized over the block's DOWNBEAT chord
            // (`hookToneSet`/`hookCellOctaveOffset` below), so a mid-measure-0 chord change
            // would blend that quality-shape with a later note's root. Doesn't arise in the
            // supported presets; a fast-changing hook bar would need per-note chord tones.
            const HOOK_MAX_NOTES = 4;
            const hookNotes = new Set<MotifEvent>();
            if (!isTurnaroundMeasures && !isStationaryMotif) {
                const measureZeroActive = activeMotif.filter(
                    (n) =>
                        !n.isRest &&
                        !n.isPickup &&
                        n.beatOffset >= 0 &&
                        n.beatOffset < qaBeatsPerMeasure,
                );
                for (const n of measureZeroActive.slice(0, HOOK_MAX_NOTES)) {
                    hookNotes.add(n);
                }
            }
            // Realize the hook over CHORD TONES (root/3rd/5th/7th), stepping the motif's
            // degree shape through them. This keeps every hook note consonant and in-key
            // (so strong beats still land chord tones — the §5 voice-leading invariant the
            // rest of the line honors), makes the cell a classic arpeggiated riff, and — the
            // key property — gives it ONE fixed interval shape that only TRANSPOSES with the
            // chord root (a dom7 is [0,4,7,10] over I, IV and V alike), so the same figure
            // is recognizable I→IV→V. Mapping through a key scale instead put non-chord,
            // out-of-key tones on strong beats; per-chord scales gave a shape that only
            // recurred every 3 blocks.
            const hookRawOf = (degree: number, rootMidi: number, tones: number[]) => {
                const len = tones.length;
                const oct = Math.floor(degree / len) * 12;
                const mod = ((degree % len) + len) % len;
                return rootMidi + tones[mod] + oct;
            };

            // Pick a target chord tone for the downbeat of these 2 measures
            const stepToSearch = Math.min(baseStep, actualTotalSteps - 1);
            const entryForMeasure = binarySearchMap(stepMap, stepToSearch);

            if (!entryForMeasure?.chord) {
                continue;
            }
            const targetChord: any = entryForMeasure.chord;
            const chordTones = targetChord.intervals || [0, 4, 7]; // Fallback to triad if not parsed
            const targetInterval = chordTones[Math.floor(prng() * chordTones.length)]; // Root, 3rd, 5th, etc.
            const targetPitchClass = (targetChord.rootMidi + targetInterval) % 12;

            // #1056 — the hook's chord-tone stepping cycle, WEIGHTED toward guide tones:
            // root anchor, then the guides (3rd/7th) listed TWICE, then the rest (5th). The
            // motif's degree shape steps through this cycle, so the riff leans on the
            // harmony-defining tones — a root-heavy arpeggio diluted the line's guide-tone
            // rate below the §5 floor, and on triads (one guide) only the doubling lifts it.
            // Still all chord tones, still one fixed shape per chord quality (recurrence
            // intact). Natural chord-tone order is the fallback if the split comes up empty.
            const hookNorm = (iv: number) => ((iv % 12) + 12) % 12;
            const hookIsGuide = (iv: number) => [3, 4, 10, 11].includes(hookNorm(iv));
            const hookGuides = chordTones.filter((t: number) => hookIsGuide(t));
            const hookTones = [
                ...chordTones.filter((t: number) => hookNorm(t) === 0),
                ...hookGuides,
                ...hookGuides,
                ...chordTones.filter((t: number) => hookNorm(t) !== 0 && !hookIsGuide(t)),
            ];
            const hookToneSet = hookTones.length > 0 ? hookTones : chordTones;

            const registerOctaveBase = Math.floor(registerBase / 12) * 12;

            // #1056 — fit the WHOLE hook cell in-register with ONE shared octave offset,
            // computed up front from every hook note over the block's downbeat chord (all
            // hook notes sit in measure 0 = that one bar). Folding the cell as a unit — vs
            // clamping each note to the floor/ceiling — is what preserves the interval
            // shape when the cell transposes onto a low or high chord root (a per-note
            // clamp collapsed the descending tail onto the floor and killed the recurrence).
            let hookCellOctaveOffset = 0;
            if (hookNotes.size > 0) {
                const raws = [...hookNotes].map((n) =>
                    hookRawOf(n.scaleDegreeOffset, targetChord.rootMidi, hookToneSet),
                );
                const cellMid = (Math.min(...raws) + Math.max(...raws)) / 2;
                hookCellOctaveOffset = Math.round((registerBase - cellMid) / 12) * 12;
                while (Math.min(...raws) + hookCellOctaveOffset < registerProfile.seedFloor) {
                    hookCellOctaveOffset += 12;
                }
                while (Math.max(...raws) + hookCellOctaveOffset > registerProfile.seedCeiling) {
                    hookCellOctaveOffset -= 12;
                }
            }
            let anchorMidi = registerOctaveBase + targetPitchClass;
            while (anchorMidi < registerBase - 6) {
                anchorMidi += 12;
            }
            while (anchorMidi > registerBase + 6) {
                anchorMidi -= 12;
            }
            // Give arpeggio / hook contours a little more room before we fold the octave.
            const anchorSpan =
                contourType === 'ARPEGGIATE' || contourType === 'HOOK'
                    ? syncBias > 0.75 && !['jazz', 'bird'].includes(style)
                        ? 9
                        : 8
                    : syncBias > 0.75 && !['jazz', 'bird'].includes(style)
                      ? 7
                      : 6;
            if (Math.abs(anchorMidi - lastMidi) > anchorSpan) {
                if (anchorMidi > lastMidi) {
                    anchorMidi -= 12;
                } else {
                    anchorMidi += 12;
                }
            }
            anchorMidi = Math.max(
                registerProfile.seedFloor,
                Math.min(registerProfile.seedCeiling, anchorMidi),
            );

            // Find the last active note in the motif to apply resolution biases
            const lastActiveMotifNote = activeMotif.filter((n) => !n.isRest).pop();
            const isLastMeasureOfSection = m >= sectionEndMeasure - 2;
            const isArpeggioContour = contourType === 'ARPEGGIATE';
            const isHookContour = contourType === 'HOOK';

            let prevNoteChord: any = null;
            let prevScalePitches: number[] = [];
            let previousMotifDegree: number | null = null;

            activeMotif.forEach((motifNote) => {
                if (motifNote.isRest) {
                    return;
                }

                const timingPlacement = buildSeedTimingPlacement(
                    motifNote.beatOffset,
                    stepsPerBeat,
                    playbackBpm,
                    tripletTimingStrength,
                );
                const exactStep = baseStep + timingPlacement.stepOffset;

                // Wrap the step for the chord lookup so pick-ups to measure 0 look at the end of the song
                let lookupStep = exactStep;
                if (lookupStep < 0) {
                    lookupStep = actualTotalSteps + lookupStep;
                }
                if (lookupStep >= actualTotalSteps) {
                    lookupStep = lookupStep % actualTotalSteps;
                }

                // Don't bleed into next section unless it's a pickup
                if (exactStep >= sectionRange.end && !motifNote.isPickup) {
                    return;
                }

                const stepEntry = binarySearchMap(stepMap, lookupStep);
                if (!stepEntry?.chord) {
                    return;
                }

                const currentChord: any = stepEntry.chord;
                const scale = getScaleForChord(state, currentChord, null, style);
                // #1051 — the KEY frame (beside the chord-relative scale). Blues Q&A pins
                // the question on a tone unstable in BOTH frames; over a dominant the chord
                // frame alone can't tell an ask (V7's ♭7) from a false-hang (V7's 11 = key
                // tonic). `keyRootIdx` is -1 when the key can't be parsed → the two-frame
                // pin degrades to the diatonic chord-only rule (see the pin block below).
                const keyCtx = getKeyContext(state, currentChord);
                const currentScalePitches = scale.map((ivl) => (currentChord.rootMidi + ivl) % 12);
                const chordIntervals = currentChord.intervals || [0, 4, 7];

                // Map scale degree offset to an actual interval
                const scaleLen = scale.length;
                let degree = motifNote.scaleDegreeOffset;

                // --- Catchy Harmonic Resolution Bias ---
                const isFinalNoteOfSection =
                    motifNote === lastActiveMotifNote && isLastMeasureOfSection;
                const isConclusion =
                    category === 'outro' || (_isLastSectionOfForm && isLastMeasureOfSection);

                if (isFinalNoteOfSection) {
                    if (isConclusion) {
                        const conclusiveDegrees = buildCadenceDegreePool(scale, chordIntervals, {
                            preferConclusive: true,
                        });
                        if (conclusiveDegrees.length > 0) {
                            degree =
                                conclusiveDegrees[Math.floor(prng() * conclusiveDegrees.length)];
                        }
                    } else if (!isDeparture && !isJazzStyle) {
                        // Statement endings can still leave a question in the air, but they should
                        // do it with soft color or chord tones rather than a harsh landing.
                        const statementDegrees = buildCadenceDegreePool(scale, chordIntervals, {
                            preferStable: true,
                        });
                        if (statementDegrees.length > 0) {
                            degree = statementDegrees[Math.floor(prng() * statementDegrees.length)];
                        }
                    }
                }

                const octaveShift = Math.floor(degree / scaleLen) * 12;
                const modDegree = ((degree % scaleLen) + scaleLen) % scaleLen;

                const intervalFromRoot = scale[modDegree];
                const pitchClass = (currentChord.rootMidi + intervalFromRoot) % 12;

                // Pivot Check: Is this chord different from the one we played the last note over?
                const isPivotStep = prevNoteChord && currentChord !== prevNoteChord;

                // --- NEW: Voice-Leading Scoring Logic ---
                // If the chord has just changed, or we're in Loop 0, try to find a note in the scale
                // that is a "Common Tone" or "Guide Tone" and is close to lastMidi.
                // --- Voice-Leading Scoring (lower = better) ---
                // Each candidate note is penalized for: large melodic jumps (jumpPenalty),
                // straying far from the phrase's register anchor (anchorPenalty),
                // deviating from the motif's intended scale degree (motifPenalty),
                // moving in the wrong contour direction (directionPenalty + motionPenalty),
                // sitting outside the register (floorPenalty / ceilingPenalty).
                // Bonuses reduce the score for guide tones (3rds/7ths), pivot-chord fresh notes,
                // chord-tone arpeggios, and short interval hops in hook contours.
                let bestMidi = registerOctaveBase + pitchClass + octaveShift;
                let minScore = 999;
                const expectedDirection =
                    previousMotifDegree === null
                        ? 0
                        : Math.sign(motifNote.scaleDegreeOffset - previousMotifDegree);

                // Search all scale degrees for the "best" melodic path
                for (let d = 0; d < scaleLen; d++) {
                    const testInterval = scale[d];
                    const testPC = (currentChord.rootMidi + testInterval) % 12;

                    // Possible Octaves
                    for (const oShift of [-12, 0, 12]) {
                        const testMidi = registerOctaveBase + testPC + oShift;
                        const distToLast = Math.abs(testMidi - lastMidi);
                        const distToAnchor = Math.abs(testMidi - anchorMidi);

                        // Scoring components
                        const contourFreedom = syncBias > 0.75 && !['jazz', 'bird'].includes(style);
                        const jumpWeight = contourFreedom
                            ? isArpeggioContour
                                ? 0.75
                                : isHookContour
                                  ? 0.9
                                  : 1.15
                            : isArpeggioContour
                              ? 0.85
                              : isHookContour
                                ? 1.0
                                : 1.35;
                        const jumpPenalty = distToLast * jumpWeight;
                        const anchorPenalty =
                            distToAnchor *
                            (contourFreedom
                                ? 0.18
                                : isArpeggioContour || isHookContour
                                  ? 0.22
                                  : 0.3);

                        // Motif adherence: How far is this degree from the intended motif degree?
                        const degreeDist = Math.abs(d - modDegree);
                        const motifWeight = isStationaryMotif
                            ? 1.5
                            : contourFreedom
                              ? isArpeggioContour
                                  ? 1.9
                                  : isHookContour
                                    ? 2.3
                                    : 3.0
                              : isArpeggioContour
                                ? 2.1
                                : isHookContour
                                  ? 2.6
                                  : 3.6;
                        const motifPenalty = degreeDist * motifWeight;
                        const wrongWayPenalty = contourFreedom
                            ? isArpeggioContour
                                ? 2
                                : isHookContour
                                  ? 3
                                  : 5
                            : isArpeggioContour
                              ? 3
                              : isHookContour
                                ? 4
                                : 6;
                        const directionPenalty =
                            expectedDirection === 0
                                ? 0
                                : expectedDirection > 0
                                  ? testMidi <= lastMidi
                                      ? wrongWayPenalty
                                      : 0
                                  : testMidi >= lastMidi
                                    ? wrongWayPenalty
                                    : 0;
                        const motionPenalty =
                            expectedDirection !== 0 && testMidi === lastMidi
                                ? isHookContour
                                    ? 3
                                    : 7
                                : 0;

                        // Guide Tone Bonus (3rd or 7th)
                        const isGuideTone =
                            testInterval === 3 ||
                            testInterval === 4 ||
                            testInterval === 10 ||
                            testInterval === 11;
                        const guideBonus = isGuideTone ? -2 : 0;

                        // Pivot Bonus: Favor "Fresh" notes that weren't in the previous scale
                        // This helps highlight key changes (modulations).
                        const isFreshNote = isPivotStep && !prevScalePitches.includes(testPC);
                        const pivotBonus = isFreshNote ? -3 : 0;
                        const chordToneBonus =
                            (isArpeggioContour ||
                                (isHookContour && motifNote.beatOffset % 1 === 0)) &&
                            chordIntervals.includes(testInterval)
                                ? -2.5
                                : 0;
                        const arpeggioMotionBonus =
                            isArpeggioContour && distToLast >= 3 && distToLast <= 7 ? -1.5 : 0;
                        const hookMotionBonus = isHookContour && distToLast <= 5 ? -1.0 : 0;

                        const floorPenalty =
                            testMidi < registerProfile.seedFloor
                                ? (registerProfile.seedFloor - testMidi) * 2.5
                                : 0;
                        const ceilingPenalty =
                            testMidi > registerProfile.seedCeiling
                                ? (testMidi - registerProfile.seedCeiling) * 2.0
                                : 0;

                        const totalScore =
                            jumpPenalty +
                            anchorPenalty +
                            motifPenalty +
                            directionPenalty +
                            motionPenalty +
                            guideBonus +
                            pivotBonus +
                            chordToneBonus +
                            arpeggioMotionBonus +
                            hookMotionBonus +
                            floorPenalty +
                            ceilingPenalty;

                        if (totalScore < minScore) {
                            minScore = totalScore;
                            bestMidi = testMidi;
                        }
                    }
                }

                let midi = bestMidi;

                // #1009 — PIN the Q&A cadence pitches. The scoring loop above only
                // SOFT-biases toward the intended degree (`motifPenalty`), so a cadence
                // pool alone gets washed out toward the nearest guide/chord tone — the
                // same reason the live path pins its targets with `landOnTarget` instead
                // of trusting a bias. Here we override post-scoring, choosing the pool
                // tone nearest `lastMidi` (smooth voice-leading INTO the cadence, and
                // deterministic — no PRNG draw, so no downstream stream desync).
                const qaRoleForNote =
                    motifNote === questionCadenceNote
                        ? 'question'
                        : motifNote === answerCadenceNote
                          ? 'answer'
                          : undefined;
                if (qaRoleForNote) {
                    // Collect the candidate degrees for THIS cadence role, then pin to
                    // the nearest one (smooth voice-leading in; deterministic — no PRNG,
                    // so no downstream stream desync). Nearest-select only within the
                    // RIGHT set: a mixed pool would let a stable tone win on distance and
                    // resolve a question we meant to leave hanging.
                    const wantAnswer = qaRoleForNote === 'answer';
                    // #1051 — dominant chords get a TWO-FRAME question pin and a tightened
                    // answer set. Detection is by chord QUALITY (robust to the rootless blues
                    // comp voicing) — same rationale as `chordTargetTones`. `alt` counts too.
                    const chordClass = classifyChordQuality(currentChord.quality);
                    const isDomChord = chordClass === 'dom' || chordClass === 'alt';
                    // Two-frame needs a parseable key; without one, fall through to the
                    // diatonic chord-only rule (a dominant still hangs, never un-pins).
                    const useTwoFrameQuestion = !wantAnswer && isDomChord && keyCtx.keyRootIdx >= 0;
                    // The key's tonic triad — the tones that DON'T pull. Everything else is
                    // key-unstable ("asks"). Minor key uses the ♭3.
                    const keyStable = keyCtx.isMinor ? [0, 3, 7] : [0, 4, 7];
                    const candidateDegrees: number[] = [];
                    scale.forEach((interval, deg) => {
                        const norm = normalizeInterval(interval);
                        const isChordTone = chordIntervals.some(
                            (ci: number) => normalizeInterval(ci) === norm,
                        );
                        if (wantAnswer) {
                            // ANSWER resolves onto a chord pillar. On a DOMINANT restrict to
                            // the triad {root,3,5}: the blues-dominant scale has BOTH ♭3 and
                            // ♮3, so the old {0,3,4,7} could pin the ♯9 (a TENSION) as the
                            // "resolution"; and ♭7 is reserved for the question, keeping the
                            // Q and A vocabularies disjoint (the asymmetry the feature exists
                            // for). Non-dominant chords keep the original {root,♭3,3,5}.
                            // NB the disjointness is a SEED-time guarantee governing loops
                            // 0-1 (depth 0, the story's target): on later loops the live
                            // answer re-snap (soloist-phrase-first.ts) pulls to the full
                            // dominant pillar set {0,4,7,10}, which can re-admit ♭7 to a
                            // developed answer — harmless (♭7 is a chord tone) and outside
                            // the early-loop window this slice is scored on.
                            const answerOk = isDomChord
                                ? norm === 0 || norm === 4 || norm === 7
                                : norm === 0 || norm === 3 || norm === 4 || norm === 7;
                            if (answerOk) {
                                candidateDegrees.push(deg);
                            }
                        } else if (useTwoFrameQuestion) {
                            // QUESTION over a DOMINANT — the TWO-FRAME pin. Hang on a tone that
                            // is chord-color {9, ♯9/blue-3rd, 11, 13, ♭7} AND key-unstable (not
                            // the key's tonic triad). Over blues the chord frame alone lies: on
                            // V7 the chord-11 IS the key tonic (a false hang) while the ♭7 — a
                            // chord tone — is the true ask. So here, unlike the diatonic branch,
                            // we do NOT exclude chord tones; the key frame carries instability.
                            const isDomColor =
                                norm === 2 || norm === 3 || norm === 5 || norm === 9 || norm === 10;
                            const keyNorm = normalizeInterval(
                                currentChord.rootMidi + interval - keyCtx.keyRootIdx,
                            );
                            if (isDomColor && !keyStable.includes(keyNorm)) {
                                candidateDegrees.push(deg);
                            }
                        } else if (!isChordTone && isSoftCadenceInterval(norm)) {
                            // QUESTION (diatonic idiom) — hang on a soft-color NON-chord tone
                            // (9/11/13), CHORD frame only. Over I/V chord-color and key-
                            // instability align; over IV the chord-9 is the key's 5th (a softer
                            // hang) — acceptable for the diatonic idiom. Dominants use the
                            // two-frame branch above; this stays byte-identical for triads.
                            candidateDegrees.push(deg);
                        }
                    });
                    // Two-frame question came up empty (exotic dominant scale / odd key) —
                    // fall back to the diatonic chord-only rule so a dominant question still
                    // hangs rather than un-pinning (the #1009 pre-fix wash). Deterministic.
                    if (useTwoFrameQuestion && candidateDegrees.length === 0) {
                        scale.forEach((interval, deg) => {
                            const norm = normalizeInterval(interval);
                            const isChordTone = chordIntervals.some(
                                (ci: number) => normalizeInterval(ci) === norm,
                            );
                            if (!isChordTone && isSoftCadenceInterval(norm)) {
                                candidateDegrees.push(deg);
                            }
                        });
                    }
                    if (candidateDegrees.length > 0) {
                        let bestCadenceMidi = midi;
                        let bestCadenceDist = Number.POSITIVE_INFINITY;
                        for (const deg of candidateDegrees) {
                            const ivl = scale[((deg % scaleLen) + scaleLen) % scaleLen];
                            const pc = (currentChord.rootMidi + ivl) % 12;
                            let cand = registerOctaveBase + pc;
                            while (cand < registerBase - 6) {
                                cand += 12;
                            }
                            while (cand > registerBase + 6) {
                                cand -= 12;
                            }
                            cand = Math.max(
                                registerProfile.seedFloor,
                                Math.min(registerProfile.seedCeiling, cand),
                            );
                            const dist = Math.abs(cand - lastMidi);
                            if (dist < bestCadenceDist) {
                                bestCadenceDist = dist;
                                bestCadenceMidi = cand;
                            }
                        }
                        midi = bestCadenceMidi;
                    }
                }

                // #1056 — PIN the hook pitch. Like the Q&A pin, the scoring loop only
                // soft-biases toward the intended degree, so the hook would re-realize
                // differently each block (fresh anchor draw + `lastMidi` carry) and never
                // recur. Override post-scoring to the motif's INTENDED degree shape,
                // re-rooted on the current chord — deterministic (no PRNG, so no stream
                // desync). The whole cell shares ONE octave offset (`hookCellOctaveOffset`,
                // locked on the first hook note of the block): the interval shape stays
                // intact and only the cell as a WHOLE transposes with the chord root, so
                // the SAME figure is recognizable I→IV→V. (Per-note folding — the naive
                // version — scattered degrees into different octaves per block and killed
                // the shape.) A Q&A cadence note is never also a hook (cadence pin wins).
                const isHookNote = hookNotes.has(motifNote) && !qaRoleForNote;
                if (isHookNote) {
                    // The cell's raw pitch, stepped through the current chord's tones (same
                    // fixed shape every block), plus the whole-cell octave offset. No per-
                    // note clamp: the offset already fit the cell in-register, so the
                    // interval shape is preserved exactly and transposes with the chord.
                    midi =
                        hookRawOf(motifNote.scaleDegreeOffset, currentChord.rootMidi, hookToneSet) +
                        hookCellOctaveOffset;
                }

                lastMidi = midi;
                previousMotifDegree = motifNote.scaleDegreeOffset;
                prevNoteChord = currentChord;
                prevScalePitches = currentScalePitches;

                // Adjust duration if it overlaps with the next section or end of song
                const hasFractionalDuration =
                    Math.abs(motifNote.duration - Math.round(motifNote.duration)) > 0.05;
                let duration = hasFractionalDuration
                    ? roundSeedRhythmValue(motifNote.duration)
                    : Math.round(motifNote.duration);
                if (exactStep + duration > actualTotalSteps) {
                    duration = roundSeedRhythmValue(actualTotalSteps - exactStep);
                }

                // Prevent multiple notes from stacking exactly on the same step (causes polyphony/choking bugs)
                const existingIdx = notes.findIndex((n) => n.step === exactStep);
                if (existingIdx !== -1) {
                    // Override the existing note if it's not an anchor, or just skip
                    if (motifNote.beatOffset === 0) {
                        notes[existingIdx] = createSeedNote({
                            style,
                            step: exactStep,
                            midi: midi,
                            isAnchor: true,
                            durationSteps: duration,
                            velocity: 0.9,
                            timingOffset: timingPlacement.timingOffset,
                            tripletPlacement: timingPlacement.tripletPlacement,
                            isPickup: Boolean(motifNote.isPickup),
                            stepsPerMeasure,
                            stepsPerBeat,
                            measureStep:
                                (((exactStep - sectionRange.start) % stepsPerMeasure) +
                                    stepsPerMeasure) %
                                stepsPerMeasure,
                            qaRole: qaRoleForNote,
                            hookRole: isHookNote || undefined,
                        });
                    }
                } else {
                    notes.push(
                        createSeedNote({
                            style,
                            step: exactStep,
                            midi: midi,
                            isAnchor: motifNote.beatOffset === 0,
                            durationSteps: duration,
                            velocity: motifNote.beatOffset === 0 ? 0.9 : 0.75,
                            timingOffset: timingPlacement.timingOffset,
                            tripletPlacement: timingPlacement.tripletPlacement,
                            isPickup: Boolean(motifNote.isPickup),
                            stepsPerMeasure,
                            stepsPerBeat,
                            measureStep:
                                (((exactStep - sectionRange.start) % stepsPerMeasure) +
                                    stepsPerMeasure) %
                                stepsPerMeasure,
                            qaRole: qaRoleForNote,
                            hookRole: isHookNote || undefined,
                        }),
                    );
                }
            });
        }
    });

    // --- Improvisational Pass (Post-Processing) ---
    // Apply musical flair to the generated head to break up monotony
    // and make the melody sound more intentional and vocal.
    const processedNotes: SeedNote[] = [];
    const postSyncBias =
        ((STYLE_CONFIG[style] || STYLE_CONFIG.scalar) as any).syncopationLikelihood || 0.2;
    const flairProb = Math.min(0.55, 0.22 + postSyncBias * 0.28);
    const subdivisionProb = Math.max(0, postSyncBias - 0.45);

    for (let i = 0; i < notes.length; i++) {
        const currentNote = notes[i];
        const nextNote = notes[i + 1];
        const { stepInfo: currentStepInfo, ts: tsConfig } = getEffectiveMeterAtStep(
            arranger,
            currentNote.step,
        );
        const stepsPerBeat = tsConfig.stepsPerBeat;
        const tripletProtected =
            isTripletSeedNote(currentNote) ||
            isTripletSeedNote(nextNote) ||
            Math.abs(
                (currentNote.durationSteps || 0) - Math.round(currentNote.durationSteps || 0),
            ) > 0.05;

        // We only apply flair probabilistically
        // #1009 — never fracture a Q&A cadence with flair: the question must ring and
        // the answer must sit. The guard `prng()` is still drawn (left of `&&`) so the
        // flair GATE stays aligned; a cadence that would have taken the flair path does
        // skip its inner mutation draws, shifting the stream from there — harmless, #1009
        // recomposes the block anyway (there's no prior seed to keep byte-identical),
        // and the whole seed stays deterministic. The cadence passes through held/intact.
        if (prng() < flairProb && !currentNote.qaRole && !currentNote.hookRole) {
            let mutationApplied = false;
            const r = prng();

            // Device 1: Syllable Splits (Repeated Notes)
            // Break up long sustained notes into two notes of the same pitch
            if (
                !mutationApplied &&
                !tripletProtected &&
                currentNote.durationSteps >= stepsPerBeat * 2
            ) {
                if (r < 0.4) {
                    // Split a long note into a dotted-quarter and an eighth (or similar based on meter)
                    const splitPoint = stepsPerBeat * 1.5;
                    const firstDuration = splitPoint;
                    const secondDuration = currentNote.durationSteps - splitPoint;

                    if (secondDuration >= stepsPerBeat * 0.5) {
                        processedNotes.push({
                            ...currentNote,
                            durationSteps: firstDuration,
                            supportHints: overrideSeedSupportHints(currentNote, {
                                sustainBias: Math.min(
                                    currentNote.supportHints?.sustainBias || 1,
                                    0.72,
                                ),
                            }),
                        });
                        processedNotes.push({
                            ...currentNote,
                            step: currentNote.step + firstDuration,
                            durationSteps: secondDuration,
                            isAnchor: false,
                            supportHints: overrideSeedSupportHints(currentNote, {
                                role: 'line',
                                sustainBias: 0.3,
                                guitar: { allowDoubleStop: false },
                            }),
                        });
                        mutationApplied = true;
                    }
                } else if (r < 0.7) {
                    // Split equally
                    const halfDuration = Math.floor(currentNote.durationSteps / 2);
                    if (halfDuration >= stepsPerBeat * 0.5) {
                        processedNotes.push({
                            ...currentNote,
                            durationSteps: halfDuration,
                            supportHints: overrideSeedSupportHints(currentNote, {
                                role: 'line',
                                sustainBias: 0.35,
                                guitar: { allowDoubleStop: false },
                            }),
                        });
                        processedNotes.push({
                            ...currentNote,
                            step: currentNote.step + halfDuration,
                            durationSteps: currentNote.durationSteps - halfDuration,
                            isAnchor: false,
                            supportHints: overrideSeedSupportHints(currentNote, {
                                role: 'line',
                                sustainBias: 0.28,
                                guitar: { allowDoubleStop: false },
                            }),
                        });
                        mutationApplied = true;
                    }
                }
            }

            // Device 1b: Split selected one-beat attacks into two lighter syllables.
            // This keeps high-sync heads from defaulting to too many square quarter-note attacks.
            if (
                !mutationApplied &&
                !tripletProtected &&
                subdivisionProb > 0 &&
                currentNote.durationSteps === stepsPerBeat &&
                stepsPerBeat >= 2
            ) {
                const nextStep = nextNote
                    ? nextNote.step
                    : currentNote.step + currentNote.durationSteps + stepsPerBeat;
                const hasRoomToSplit = nextStep >= currentNote.step + currentNote.durationSteps;
                const splitChance = currentNote.isAnchor
                    ? subdivisionProb * 0.35
                    : subdivisionProb * 0.75;

                if (hasRoomToSplit && prng() < splitChance) {
                    const splitPoint = stepsPerBeat / 2;
                    processedNotes.push({
                        ...currentNote,
                        durationSteps: splitPoint,
                        supportHints: overrideSeedSupportHints(currentNote, {
                            role: 'line',
                            sustainBias: 0.3,
                            guitar: { allowDoubleStop: false },
                        }),
                    });
                    processedNotes.push({
                        ...currentNote,
                        step: currentNote.step + splitPoint,
                        durationSteps: currentNote.durationSteps - splitPoint,
                        velocity: Math.max(0.55, (currentNote.velocity || 0.75) - 0.08),
                        isAnchor: false,
                        supportHints: overrideSeedSupportHints(currentNote, {
                            role: 'line',
                            sustainBias: 0.24,
                            guitar: { allowDoubleStop: false },
                        }),
                    });
                    mutationApplied = true;
                }
            }

            // Device 2: Syncopated Anticipations (Pushes)
            // If the note lands squarely on a beat, push it early by an eighth and tie it
            if (!mutationApplied && !tripletProtected && currentStepInfo.isBeatStart) {
                // Only push if there's room before this note (i.e. it doesn't overlap the previous note)
                const prevNote = processedNotes[processedNotes.length - 1];
                // why: epic-1-compound-meter S6 — an eighth-note push is
                // `stepsPerBeat/2` on a 16th-grid (simple meters, where one
                // step = one 16th) but `stepsPerBeat` on an 8th-grid (compound
                // meters, where one step = one eighth). The old `* 0.5` was
                // silently a 16th push in 6/8/12/8 — too small to be an
                // idiomatic anticipation.
                const shiftAmount = tsConfig.isCompound ? stepsPerBeat : stepsPerBeat * 0.5;

                const canPush =
                    !prevNote ||
                    prevNote.step + prevNote.durationSteps <= currentNote.step - shiftAmount;

                if (canPush && currentNote.durationSteps >= stepsPerBeat) {
                    processedNotes.push({
                        ...currentNote,
                        step: currentNote.step - shiftAmount,
                        durationSteps: currentNote.durationSteps + shiftAmount,
                        supportHints: overrideSeedSupportHints(currentNote, {
                            role: currentNote.isAnchor ? 'anchor' : 'accent',
                            sustainBias: Math.min(
                                1,
                                (currentNote.supportHints?.sustainBias || 0.6) + 0.08,
                            ),
                        }),
                    });
                    mutationApplied = true;
                }
            }

            // Device 3: Neighbor/Passing Tones (Motion)
            // If this pitch is the same as the next pitch, move this one to create motion
            if (!mutationApplied && nextNote && currentNote.midi === nextNote.midi) {
                // Find scale for the current step to select a diatonic neighbor
                let lookupStep = currentNote.step;
                if (lookupStep < 0) {
                    lookupStep = actualTotalSteps + lookupStep;
                }
                if (lookupStep >= actualTotalSteps) {
                    lookupStep = lookupStep % actualTotalSteps;
                }

                const stepEntry = binarySearchMap(stepMap, lookupStep);
                if (stepEntry?.chord) {
                    const scale = getScaleForChord(state, stepEntry.chord, null, style);
                    const scaleLen = scale.length;

                    // Find the current note's scale degree
                    let currentDegreeIndex = -1;
                    const targetPC = currentNote.midi % 12;
                    for (let d = 0; d < scaleLen; d++) {
                        const testPC = (stepEntry.chord.rootMidi + scale[d]) % 12;
                        if (testPC === targetPC) {
                            currentDegreeIndex = d;
                            break;
                        }
                    }

                    if (currentDegreeIndex !== -1) {
                        // Move up or down one scale step
                        const shiftDir = prng() > 0.5 ? 1 : -1;
                        const newDegreeIndex =
                            (((currentDegreeIndex + shiftDir) % scaleLen) + scaleLen) % scaleLen;

                        // Calculate octave adjustment
                        let octaveShift = 0;
                        if (currentDegreeIndex + shiftDir >= scaleLen) {
                            octaveShift = 12;
                        }
                        if (currentDegreeIndex + shiftDir < 0) {
                            octaveShift = -12;
                        }

                        const newPC = (stepEntry.chord.rootMidi + scale[newDegreeIndex]) % 12;
                        const baseOctave = Math.floor(currentNote.midi / 12) * 12;

                        let newMidi = baseOctave + newPC + octaveShift;

                        // Ensure we don't jump too far
                        if (Math.abs(newMidi - currentNote.midi) > 6) {
                            if (newMidi > currentNote.midi) {
                                newMidi -= 12;
                            } else {
                                newMidi += 12;
                            }
                        }

                        processedNotes.push({
                            ...currentNote,
                            midi: newMidi,
                            supportHints: overrideSeedSupportHints(currentNote, {
                                role: 'line',
                                sustainBias: 0.25,
                                guitar: { allowDoubleStop: false },
                            }),
                        });
                        mutationApplied = true;
                    }
                }
            }

            if (!mutationApplied) {
                processedNotes.push(currentNote);
            }
        } else {
            processedNotes.push(currentNote);
        }
    }

    // Reinforce sparse late-entry statement bars with a lead-in attack so
    // non-jazz heads speak earlier in the measure instead of waiting until beat 4.
    if (!['jazz', 'bird', 'bossa'].includes(style)) {
        const reinforcedNotes: SeedNote[] = [];
        const sortedSeedNotes = [...processedNotes].sort((a, b) => a.step - b.step);

        for (let i = 0; i < sortedSeedNotes.length; i++) {
            const note = sortedSeedNotes[i];
            const { stepInfo, ts } = getEffectiveMeterAtStep(arranger, note.step);
            const noteTripletProfile = styleConfig.seedTriplets || {};
            const noteTripletEnabled = Boolean(
                noteTripletProfile.enabled &&
                    !ts.isCompound &&
                    ts.beats === 4 &&
                    ts.stepsPerBeat >= 4,
            );
            if (ts.isCompound || noteTripletEnabled) {
                reinforcedNotes.push(note);
                continue;
            }
            const localStepsPerBeat = ts.stepsPerBeat;
            const measureStart = note.step - stepInfo.mStep;
            const localStepsPerMeasure = ts.beats * localStepsPerBeat;
            const measureEnd = measureStart + localStepsPerMeasure;
            const measureNotes = sortedSeedNotes.filter(
                (candidate) => candidate.step >= measureStart && candidate.step < measureEnd,
            );
            const isLateSingleAttack =
                note.step >= measureStart + localStepsPerBeat * 2 &&
                measureNotes.length === 1 &&
                note.durationSteps >= localStepsPerBeat;

            if (isLateSingleAttack) {
                const pickupStep = note.step - localStepsPerBeat;
                const pickupDuration = note.step - pickupStep;
                const hasLeadInSpace =
                    pickupStep >= measureStart &&
                    pickupDuration >= localStepsPerBeat / 2 &&
                    !sortedSeedNotes.some(
                        (candidate) =>
                            candidate !== note &&
                            candidate.step >= pickupStep &&
                            candidate.step < note.step,
                    );

                if (hasLeadInSpace) {
                    reinforcedNotes.push({
                        ...note,
                        step: pickupStep,
                        durationSteps: pickupDuration,
                        velocity: Math.min(note.velocity, 0.75),
                        isAnchor: false,
                        supportHints: overrideSeedSupportHints(note, {
                            role: 'pickup',
                            sustainBias: 0.15,
                            guitar: { allowDoubleStop: false },
                        }),
                    });
                }
            }

            reinforcedNotes.push(note);
        }

        processedNotes.length = 0;
        processedNotes.push(...reinforcedNotes);
    }

    // Sort the processed notes by step just in case our pushes or reinforcements messed up the order
    const polishedNotes = polishCadenceLandings(
        processedNotes,
        stepMap,
        sectionMap,
        actualTotalSteps,
        arranger,
        style,
    );
    polishedNotes.sort((a: SeedNote, b: SeedNote) => a.step - b.step);

    logSeed(`[Seeder Debug] Finished generation. Total seed notes: ${polishedNotes.length}.`);
    return {
        notes: polishedNotes,
        loopLengthSteps: actualTotalSteps,
        seedId: computeSeedId(polishedNotes, actualTotalSteps),
    };
}
