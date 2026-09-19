// @ts-nocheck
// cspell:ignore Bdim
/**
 * Walking-bass FIFTH slots over a chord with no perfect fifth (#1334).
 *
 * Four slots in `bass-styles.ts` decided the chord's fifth with a hand-rolled
 * `hasFlat5 = quality === 'dim' || quality === 'halfdim'` (and, at one, an `hasSharp5` branch):
 * the jazz low-intensity fifth, the beat-3 fifth, the fifth-or-octave eighth variation, and the
 * bossa root/fifth alternation. On `7b5`, `7alt` and `maj7b5` — and on `aug`/`augmaj7` at three
 * of them — they played a NATURAL 5, a semitone from the altered fifth the comp is voicing in
 * the register above.
 *
 * Decision (#1334): those slots play the ROOT (or its octave) on a chord with no perfect fifth.
 * The diminished family keeps its b5, which is a chord tone the bass idiomatically outlines.
 * `chordHasPerfectFifth` in utils.ts documents why "play the altered fifth instead" is the wrong
 * repair down here: at MIDI 34-46 a b5/#5 fights the root the bass is sounding.
 *
 * The last test is the load-bearing one for review: a plain ii-V-I's note sequence is pinned
 * NOTE FOR NOTE, so this change is provably invisible on ordinary chords.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getFrequency, getMidi, getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

const FOUR_FOUR = TIME_SIGNATURES['4/4'];
const STEPS_PER_BAR = FOUR_FOUR.beats * FOUR_FOUR.stepsPerBeat; // 16

// Canonical parser qualities. `7#5` normalises to 'aug', `M7b5` to 'maj7b5'.
const ALTERED = [
    { rootMidi: 67, quality: '7b5', intervals: [0, 4, 6, 10], label: 'G7b5' },
    { rootMidi: 67, quality: '7alt', intervals: [0, 4, 10, 13, 15, 18, 20], label: 'G7alt' },
    { rootMidi: 60, quality: 'aug', intervals: [0, 4, 8], label: 'C+' },
    { rootMidi: 60, quality: 'maj7b5', intervals: [0, 4, 6, 11], label: 'Cmaj7b5' },
    // #1336 — the minor-#5 triad is the same lane's case one alteration over:
    // `chordHasPerfectFifth` already reads its '#5' (so `fifthSlotInterval` returns the ROOT
    // with no new code), and its scale is now Aeolian-without-the-5th, so beat 2 holds too.
    { rootMidi: 60, quality: 'm#5', intervals: [0, 3, 8], label: 'Cm#5' },
];
const PLAIN = [
    { rootMidi: 62, quality: 'minor', intervals: [0, 3, 7, 10], label: 'Dm7' },
    { rootMidi: 67, quality: '7', intervals: [0, 4, 7, 10], label: 'G7' },
    { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], label: 'Cmaj7' },
];
const HALF_DIM = [{ rootMidi: 71, quality: 'halfdim', intervals: [0, 3, 6, 10], label: 'Bm7b5' }];

function buildJazzState(intensity, loopCount, progression) {
    return {
        playback: {
            bandIntensity: intensity,
            bpm: 120,
            complexity: 0.5,
            currentLoopCount: loopCount,
            songMode: false,
        },
        groove: { genreFeel: 'Jazz', lastDrumPreset: 'Jazz', instruments: [], pocket: 0 },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0, tension: 0 }),
        arranger: {
            timeSignature: '4/4',
            totalSteps: STEPS_PER_BAR * progression.length,
            stepMap: [],
        },
    };
}

/** Every onset the walking engine emits over `numLoops` passes of `progression`. */
function walk(progression, intensity, numLoops = 10) {
    const onsets = [];
    for (let loop = 0; loop < numLoops; loop++) {
        const state = buildJazzState(intensity, loop, progression);
        getState.mockReturnValue(state);
        state.arranger.stepMap = progression.map((chord, bar) => ({
            start: bar * STEPS_PER_BAR,
            end: (bar + 1) * STEPS_PER_BAR,
            chord,
            ts: '4/4',
        }));

        let lastMidi = null;
        for (let step = 0; step < STEPS_PER_BAR * progression.length; step++) {
            const mStep = step % STEPS_PER_BAR;
            const bar = Math.floor(step / STEPS_PER_BAR);
            const chord = progression[bar];
            const nextChord = progression[(bar + 1) % progression.length];
            const info = getStepInfo(step, FOUR_FOUR, state.arranger.stepMap, TIME_SIGNATURES);
            if (!isBassActive(getState(), 'quarter', step, mStep, info, {})) {
                continue;
            }
            const note = getBassNote(
                getState(),
                chord,
                nextChord,
                info.beatIndex,
                lastMidi ? getFrequency(lastMidi) : 0,
                36,
                'quarter',
                bar,
                step,
                mStep,
                {},
                info,
            );
            if (!note || note.muted) {
                continue;
            }
            const midi = note.midi ?? getMidi(note.frequency);
            onsets.push({
                chord,
                loop,
                step,
                mStep,
                midi,
                degree: (((midi - chord.rootMidi) % 12) + 12) % 12,
            });
            lastMidi = midi;
        }
    }
    return onsets;
}

describe('Walking bass over a chord with no perfect fifth (#1334)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * The fifth SLOTS, by position: beat 3 (mStep 8) is the beat-3 fifth and, at intensity < 0.3,
     * the jazz low-intensity fifth; the off-eighths are the fifth-or-octave variation.
     *
     * #1336 added beat 2 (mStep 4) — the jazz path-note walk, which picks from
     * `getScaleForChord`. It used to be excluded because `maj7b5` had no branch there and fell
     * through to LYDIAN, whose natural 5 the walk duly sounded (measured: degree 7 at mStep 4
     * over `Cmaj7b5` in this very chart). `maj7b5` now answers a fifth-less Lydian
     * [0,2,4,6,9,11], so the scale lane holds the same line as the fifth slots and beat 2 is
     * asserted with them. Only mStep 0 (the downbeat root) and mStep 12 are outside the set.
     */
    const isFifthSlot = (mStep) => mStep === 4 || mStep === 8 || mStep % 4 === 2;

    // 0.2 reaches the `isJazz && intensity < 0.3` low-intensity fifth; 0.9 reaches the beat-3
    // fifth and the eighth-note fifth-or-octave variation.
    it.each([0.2, 0.9])(
        'never sounds the natural 5 of an altered-5 chord (intensity %s)',
        (intensity) => {
            const onsets = walk(ALTERED, intensity).filter((onset) => isFifthSlot(onset.mStep));
            expect(onsets.length, 'no fifth slot fired').toBeGreaterThan(0);
            for (const { chord, degree, midi, mStep } of onsets) {
                expect(
                    degree,
                    `${chord.label} @${intensity} sounds a natural 5 (midi ${midi}, step ${mStep})`,
                ).not.toBe(7);
            }
        },
    );

    it.each([0.2, 0.9])('states the root instead (intensity %s)', (intensity) => {
        // Not just "no 5th" — the slots must still sound, and on the root.
        for (const chord of ALTERED) {
            const degrees = walk([chord], intensity)
                .filter((onset) => isFifthSlot(onset.mStep))
                .map((onset) => onset.degree);
            expect(degrees.length, `${chord.label} produced no fifth-slot onsets`).toBeGreaterThan(
                0,
            );
            expect(degrees, `${chord.label} never states its root`).toContain(0);
        }
    });

    it.each([0.2, 0.9])(
        'a half-diminished chord may still sound its b5 (intensity %s)',
        (intensity) => {
            const degrees = walk(HALF_DIM, intensity).map((onset) => onset.degree);
            expect(degrees.length).toBeGreaterThan(0);
            expect(degrees, 'the b5 is a chord tone the bass outlines').toContain(6);
            expect(degrees, 'but never the natural 5').not.toContain(7);
        },
    );

    /**
     * The regression pin. These are the exact midi sequences the engine produced BEFORE #1334
     * (captured on the parent commit's `bass-styles.ts` and re-verified against it after the
     * change), for a chart of ordinary chords at both intensities. Every quality here has a
     * perfect fifth, so `fifthSlotInterval` returns 7 exactly as the old `hasFlat5 ? 6 : 7` did
     * and not one note may move.
     */
    it.each([
        [0.2, [38, 45, 43, 50, 48, 31, 38, 45, 43, 50, 48, 31]],
        [
            0.9,
            [
                38, 42, 43, 45, 38, 44, 44, 43, 38, 43, 35, 36, 38, 36, 37, 38, 41, 38, 45, 38, 44,
                43, 31, 35, 29, 31, 35, 35, 35, 36, 37, 38, 37, 36, 33, 37,
            ],
        ],
    ])('leaves a plain ii-V-I note for note (intensity %s)', (intensity, expected) => {
        const midis = walk(PLAIN, intensity, 2).map((onset) => onset.midi);
        expect(midis).toEqual(expected);
    });
});
