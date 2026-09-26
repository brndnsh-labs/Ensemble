export { KEY_ORDER } from './data/note-names.js';
export const ENHARMONIC_MAP = {
    // Standard sharp→flat equivalents (the 5 chromatic sharps)
    'C#': 'Db',
    'D#': 'Eb',
    'F#': 'Gb',
    'G#': 'Ab',
    'A#': 'Bb',
    // why: enharmonic naturals — B#/E# are valid notation (e.g. augmented chords, key of C#)
    // and Cb/Fb appear in flat keys (e.g. Cb major = B major). Without these, KEY_ORDER.indexOf
    // returns -1 and rootMidi computes baseOctave-1 (wrong pitch).
    'B#': 'C',
    Cb: 'B',
    'E#': 'F',
    Fb: 'E',
};
export const ROMAN_VALS = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
export const NNS_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
export const INTERVAL_TO_NNS = {
    0: '1',
    1: 'b2',
    2: '2',
    3: 'b3',
    4: '3',
    5: '4',
    6: 'b5',
    7: '5',
    8: 'b6',
    9: '6',
    10: 'b7',
    11: '7',
};
export const INTERVAL_TO_ROMAN = {
    0: 'I',
    1: 'bII',
    2: 'II',
    3: 'bIII',
    4: 'III',
    5: 'IV',
    6: '#IV',
    7: 'V',
    8: 'bVI',
    9: 'VI',
    10: 'bVII',
    11: 'VII',
};

/**
 * The displayed BPM always counts quarter-notes/min, for every meter — the
 * DAW/MIDI convention. In compound meters (6/8, 12/8) the felt pulse is the
 * dotted-quarter (= 1.5 quarters), so a 6/8 jazz-waltz "feels" slower than the
 * number suggests, but one BPM value maps to one absolute tempo regardless of
 * meter and exported MIDI tempo equals the displayed BPM with no conversion.
 * (Ensemble briefly used a dotted-quarter BPM unit for compound meters —
 * epic-1-compound-meter S1 — but reverted to quarter-universal for DAW parity.)
 *
 * Internal step granularity is a 16th note in all meters (`getStepsPerMeasure`
 * returns 16 for 4/4, 12 for 6/8, etc.); see `secondsPerStepFor` /
 * `secondsPerBeatFor` in `public/utils.ts`.
 */
export interface TimeSignatureConfig {
    beats: number;
    stepsPerBeat: number;
    subdivision: string;
    pulse: number[];
    grouping: number[];
    backbeat: number[];
    isCompound?: boolean;
}

/**
 * Meter table. **Null-prototype on purpose** (#1258) — do not "simplify" this back to a
 * plain object literal; `tests/unit/security/hydration-security.test.ts` pins it.
 *
 * why: this table is indexed by *untrusted* values — a persisted `timeSignature`, a
 * share payload's section meter, and the `?ts=` URL param. On a plain literal every
 * `Object.prototype` member resolves through the prototype chain and reads as truthy, so
 * `TIME_SIGNATURES['__proto__']` was a valid-looking hit. Worse, that defeated the
 * fallback the ~17 consumers all rely on: `TIME_SIGNATURES[x] || TIME_SIGNATURES['4/4']`
 * never fires when the left side is `Object.prototype`, so `ts.beats * ts.stepsPerBeat`
 * became `NaN` and meter math was *poisoned* rather than defaulting to 4/4. That
 * degrades rather than crashes (`for (let i = 0; i < NaN; i++)` simply never runs), and
 * it persisted: the poisoned value was saved and re-accepted on the next boot, so a
 * single `?ts=__proto__` link left a visitor's session permanently non-playing.
 *
 * A null prototype fixes every one of those call sites at the declaration instead of
 * patching each guard, which is what makes the *next* lookup correct by default too.
 * `Object.keys`, spread, and `JSON.stringify` all behave identically; only inherited
 * members disappear, and nothing reads those (verified — no `.hasOwnProperty`/`in`
 * usage against this table anywhere in `public/`, `scripts/`, or `tests/`).
 */
export const TIME_SIGNATURES: Record<string, TimeSignatureConfig> = Object.assign(
    Object.create(null),
    {
        '2/4': {
            beats: 2,
            stepsPerBeat: 4,
            subdivision: '16th',
            pulse: [0, 4],
            grouping: [2],
            backbeat: [1],
        },
        '3/4': {
            beats: 3,
            stepsPerBeat: 4,
            subdivision: '16th',
            pulse: [0, 4, 8],
            grouping: [3],
            backbeat: [2],
        },
        '4/4': {
            beats: 4,
            stepsPerBeat: 4,
            subdivision: '16th',
            pulse: [0, 4, 8, 12],
            grouping: [2, 2],
            backbeat: [1, 3],
        },
        '5/4': {
            beats: 5,
            stepsPerBeat: 4,
            subdivision: '16th',
            pulse: [0, 4, 8, 12, 16],
            grouping: [3, 2],
            backbeat: [1, 3],
        },
        '6/8': {
            beats: 6,
            stepsPerBeat: 2,
            subdivision: '8th',
            pulse: [0, 6],
            grouping: [3, 3],
            isCompound: true,
            backbeat: [1],
        },
        '7/8': {
            beats: 7,
            stepsPerBeat: 2,
            subdivision: '8th',
            pulse: [0, 4, 8],
            grouping: [2, 2, 3],
            backbeat: [1, 2],
        },
        '7/4': {
            beats: 7,
            stepsPerBeat: 4,
            subdivision: '16th',
            pulse: [0, 4, 8, 12, 16, 20, 24],
            grouping: [4, 3],
            backbeat: [1, 3, 5],
        },
        '12/8': {
            beats: 12,
            stepsPerBeat: 2,
            subdivision: '8th',
            pulse: [0, 6, 12, 18],
            grouping: [3, 3, 3, 3],
            isCompound: true,
            backbeat: [1, 3],
        },
    },
);

export const MIXER_GAIN_MULTIPLIERS = {
    master: 0.85,
    chords: 0.135, // Mix-pass 2026-05-23 (iter 2): -1.5 dB total — first ear-pass found chords still slightly too present in some genres; this lands rock/blues at roughly -10 dB vs full+solo
    bass: 0.135, // Mix-pass 2026-05-23: -1.3 dB; mix-report baseline put bass at -3.7 dB vs target -5; user confirmed it was sitting a touch forward at the first ear-pass
    soloist: 0.2, // Mix-pass 2026-05-23: soloist +2.5 dB; baseline mix-report put trumpet 5-7 dB under full mix — buried for a lead. Lifts toward -3 to -4 dB lead seat.
    harmonies: 0.085, // Holds harmony behind the chord bed while leaving drums a bit more room. #601 follow-up (2026-06-19): -1.4 dB (0.1→0.085) — the click-free retirement made harmony cleaner/more present, so trim it slightly to sit back in the mix.
    drums: 0.38, // Mix-pass 2026-05-23: drums +3.3 dB; rhythmic anchor was 7-9 dB under full mix in non-jazz scenes, making the beat hard to track. Iter 2 (+1.5 dB on top of iter 1) brings rock/blues/funk into the -4 to -5 dB target window; jazz stays naturally quieter (brushes/ride)
};
