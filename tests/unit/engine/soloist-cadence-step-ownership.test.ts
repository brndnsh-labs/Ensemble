// #1162 — a Q&A cadence owns its step even when it is not the first seed note there.
//
// The flair pass's Device-1 dotted split re-articulates a long note by emitting its
// second half at `step + stepsPerBeat * 1.5` with no occupancy check. That fragment
// carries the PARENT's pitch and is produced while the parent is processed, so when it
// lands on a planned cadence's step it sits AHEAD of the cadence in the array. (The
// split's own `!qaRole` guard protects the note being split, not wherever its tail
// lands.) The live engine used to read the cadence role off `here[0]` alone, so at
// those steps:
//
//   • the question lost its PINNED hang pitch (the engine developed the fragment
//     instead), so the comper's echo — digested by `computeQaWindows` from the
//     question note's own midi — answered a tone the lead never played; and
//   • it lost its DENSITY-GATE EXEMPTION, so the hang could be gated to silence
//     outright, destroying the carved breath the #1009/#1157 gesture is built on,
//
// while `emitsAt` (the duration-clamp lookahead) scanned every note at the step and
// therefore still predicted the cadence would sound — the exact "live emit and
// lookahead see one gate" invariant it is written to uphold.
//
// Reachability is measured, not assumed: 20 occurrences over 1800 production seeds
// (every chord preset x 10 genres x both soloist modes), i.e. roughly 1 seed in 90,
// always the same shape — a duration-2 role-less fragment in front of the cadence.
//
// The fixture is hand-built rather than a reproducing production seed on purpose: a
// seeder PRNG stream-shift re-rolls every seed, so a production-seed test would stop
// exercising this the moment an unrelated seeder change landed.
import { describe, expect, it } from 'vitest';
import { getSoloistNotePhraseFirst } from '../../../public/engine/soloist-phrase-first.js';
import { makeChord } from '../../utils/chord-fixture.js';

const TOTAL = 64;
const CHORD = makeChord({ rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11] });

function note(step: number, midi: number, extra: Record<string, unknown> = {}) {
    return { step, midi, isAnchor: false, durationSteps: 8, velocity: 0.7, ...extra };
}

/**
 * `collide` reproduces the production shape: a duration-2 role-less fragment placed
 * at the SAME step as the question, ahead of it in the array. With `collide` false
 * the question sits alone — the control.
 *
 * The high note at step 4 keeps the cycle apex well behind the question so neither
 * apex override (the apex step itself, or the 2-bar dovetail into it) applies.
 */
function makeState(collide: boolean) {
    const notes = [
        note(0, 60, { isAnchor: true, durationSteps: 4 }),
        note(4, 84),
        ...(collide ? [note(26, 71, { durationSteps: 2 })] : []),
        note(26, 65, { qaRole: 'question' }),
        note(40, 64, { isAnchor: true }),
        note(44, 60, { qaRole: 'answer' }),
    ];
    return {
        // `bandIntensity` lives on PLAYBACK (`playback.bandIntensity ?? 0.6`), not on
        // the conductor slice — it feeds `activity`, which test 2 weighs against the
        // step-26 density-gate hash, so a reader recomputing that needs the real source.
        playback: { currentLoopCount: 0, bpm: 120, bandIntensity: 0.5 },
        groove: { genreFeel: 'Jazz' },
        arranger: {
            totalSteps: TOTAL,
            timeSignature: '4/4',
            key: 'C',
            isMinor: false,
            sectionMap: [],
        },
        soloist: {
            octave: 0,
            phrasingIntensity: 0.5,
            session: {
                seed: { seedId: collide ? 2 : 1, loopLengthSteps: TOTAL, notes },
                phrasing: { isResting: false, busySteps: 0 },
            },
        },
    } as any;
}

function emitAt(state: any, step: number) {
    const res = getSoloistNotePhraseFirst(
        state,
        CHORD,
        CHORD,
        step,
        null,
        0,
        'smart',
        step % 16,
        {},
        null,
    );
    const voices = res ? (Array.isArray(res) ? res : [res]) : [];
    return voices[voices.length - 1] ?? null;
}

describe('#1162 a Q&A cadence owns its step', () => {
    it('pins the QUESTION pitch even when a fragment precedes it at the same step', () => {
        // Control: the question alone. Its hang is seed-pinned, so pc = 65 % 12 = 5.
        const alone = emitAt(makeState(false), 26);
        expect(alone).not.toBeNull();
        expect(((alone.midi % 12) + 12) % 12).toBe(5);

        // Regression: with the fragment (71 → pc 11) in front, the engine used to
        // develop the FRAGMENT and emit pc 11 — the comper's digest still said 5,
        // so it echoed a tone the lead never played.
        const collided = emitAt(makeState(true), 26);
        expect(collided).not.toBeNull();
        expect(((collided.midi % 12) + 12) % 12).toBe(5);
    });

    it('keeps the cadence sounding when the density gate would erode an ornament', () => {
        // A cadence is exempt from the density gate at ANY loop, including loop 0
        // where `activity` is at its lowest. With the role read off the role-less
        // fragment, the step fell through to the ordinary gate and could rest —
        // silencing a hang the lookahead had already promised would sound.
        const state = makeState(true);
        state.playback.currentLoopCount = 0;
        state.soloist.phrasingIntensity = 0; // push the density gate as low as it goes
        expect(emitAt(state, 26)).not.toBeNull();
    });

    it('leaves a role-less collision alone — the FIRST note still wins there', () => {
        // Guards over-reach from the other side. Two role-less notes share step 28 in
        // the same shape as the real collision (a dur-2 fragment ahead of a longer
        // note); with no planned role present the selector must fall through to
        // `here[0]`. Without a second note here the assertion would be vacuous: a
        // blanket "prefer the LAST note at the step" implementation — which would
        // change the winner at every multi-note step in the seed — passes a
        // single-note fixture, so this is what pins the rule from both sides.
        const state = makeState(false);
        state.soloist.session.seed.notes.push(
            { step: 28, midi: 71, isAnchor: true, durationSteps: 2, velocity: 0.7 },
            { step: 28, midi: 64, isAnchor: true, durationSteps: 8, velocity: 0.7 },
        );
        state.soloist.session.seed.seedId = 3;
        const emitted = emitAt(state, 28);
        expect(emitted).not.toBeNull();
        // 71 → pc 11 (the first note), NOT 64 → pc 4.
        expect(((emitted.midi % 12) + 12) % 12).toBe(11);
    });
});
