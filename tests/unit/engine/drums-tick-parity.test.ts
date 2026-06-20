// @ts-nocheck
// tests/unit/engine/drums-tick-parity.test.ts
//
// Parity oracle for the #542 drum/tick split. `generateDrumsForStep`
// (drums-tick.ts) MUST produce byte-identical `drumHits` to the legacy
// drums-only `generateNotesForStep` call across a representative spread of
// steps and genres. The split moved the drum preamble + drum block VERBATIM
// into drums-tick.ts; this test guards that "verbatim" stayed true.
//
// Drum output is sacred: if this fails, the split changed behavior — STOP.

import { describe, expect, it } from 'vitest';

import { generateDrumsForStep } from '../../../public/engine/drums-tick.js';
import { generateNotesForStep } from '../../../public/engine/tick-logic.js';
import { installSeededRandom } from '../../utils/seeded-random.js';

// A 4/4 chord covering a full 16-step bar, with a section id so the
// section-seed / variation lookups exercise real keys.
const CHORD_C = {
    rootMidi: 60,
    quality: 'maj7',
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [261.63, 329.63, 392.0, 493.88],
    sectionId: 'A',
    sectionLabel: 'Verse',
};

// A realistic drum kit so the groove engine actually emits hits. Each
// instrument's `steps` array is a plausible 16-step pattern.
function makeInstruments() {
    const mk = (name, steps) => ({ name, muted: false, steps, volume: 0.8 });
    return [
        mk('Kick', [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
        mk('Snare', [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]),
        mk('Hat', [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]),
        mk('OpenHat', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]),
        mk('Crash', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        mk('Tom', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]),
        mk('Ride', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ];
}

function makeState(genreFeel) {
    return {
        arranger: {
            totalSteps: 16,
            timeSignature: '4/4',
            measureMap: [{ start: 0, end: 16 }],
            sectionMap: [{ start: 0, end: 16, chord: CHORD_C }],
            stepMap: [{ start: 0, end: 16, chord: CHORD_C, sectionStart: 0, sectionEnd: 16 }],
            progression: [CHORD_C],
            key: 'C',
            isMinor: false,
        },
        chords: { enabled: true, style: 'smart', volume: 0.5 },
        bass: { enabled: true, style: 'smart', volume: 0.5, lastFreq: null, octave: 0 },
        soloist: {
            enabled: true,
            style: 'smart',
            volume: 0.5,
            octave: 0,
            audio: { lastFreq: null },
            session: {
                phrasing: { isResting: false },
                currentPhrase: { notesInPhrase: 0 },
                memory: { sharedHookBuffer: [] },
                seed: 1234,
            },
        },
        harmony: {
            enabled: true,
            style: 'smart',
            volume: 0.5,
            complexity: 0.5,
            octave: 0,
            lastMidis: [],
        },
        groove: {
            enabled: true,
            genreFeel,
            measures: 1,
            instruments: makeInstruments(),
            fillActive: false,
            humanize: 0,
            sectionSeedMap: { A: 0 },
        },
        playback: {
            bpm: 120,
            bandIntensity: 0.6,
            intent: {},
            songMode: false,
            isEndingPending: false,
            autoIntensity: false,
            conductorVelocity: 1.0,
        },
    };
}

const GENRES = ['Rock', 'Funk', 'Jazz', 'Hip Hop'];

describe('drums-tick parity (#542)', () => {
    // The groove engines use raw Math.random() for velocity/timing humanization,
    // so two independent invocations of the (identical) drum code naturally
    // diverge. Seed Math.random and reset the stream to the SAME point before
    // each path so the parity comparison isolates the code-move, not the RNG.
    const rng = installSeededRandom(0xc0ffee);

    for (const genre of GENRES) {
        it(`generateDrumsForStep matches drums-only generateNotesForStep across steps (${genre})`, () => {
            // Independent cursor objects per path — getChordAtStep mutates the
            // cursor it's handed, so the two paths must not share one.
            const freshCursors = () => ({
                mainCursor: { index: 0, sectionIndex: 0 },
                lookaheadCursor: { index: 0, sectionIndex: 0 },
            });

            for (let step = 0; step <= 256; step++) {
                // Fresh state per step per path: the engines write @worker-mutation
                // fields (lastFreq etc.), and a shared state would let one path's
                // writes leak into the other's read.
                const stateA = makeState(genre);
                const stateB = makeState(genre);

                // Reset the RNG stream to an identical, step-derived point before
                // each path so both consume the same humanization draws.
                rng.reseed(0xc0ffee + step);
                const fromDrumsModule = generateDrumsForStep(stateA, step, freshCursors()).drumHits;

                rng.reseed(0xc0ffee + step);
                const fromLegacy = generateNotesForStep(stateB, step, freshCursors(), {
                    includeDrums: true,
                    includeBass: false,
                    includeChords: false,
                    includeHarmony: false,
                    includeSoloist: false,
                }).drumHits;

                expect(fromDrumsModule).toEqual(fromLegacy);
            }
        });
    }
});
