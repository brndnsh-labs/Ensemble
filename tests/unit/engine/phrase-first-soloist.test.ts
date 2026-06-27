import { describe, expect, it } from 'vitest';
import { getSoloistNotePhraseFirst } from '../../../public/engine/soloist-phrase-first.js';

// Structural guard for the parallel phrase-first soloist engine (Slice 1,
// Build 2a). The real definition-of-done is the by-ear listening gate; these
// assertions only protect against gross regressions — a crash, a silent
// engine, an inverted arc — so a broken build never reaches the audition.
//
// The engine takes `state` as an argument and we always supply a seed, so the
// legacy fallback path is never exercised here and no module mocks are needed.

const CMAJ7 = { rootMidi: 60, intervals: [0, 4, 7, 10] }; // C E G Bb

function makeState(
    seedNotes: any[],
    { loopCount = 0, totalSteps = 64, loopLengthSteps = 64 } = {},
): any {
    return {
        playback: { currentLoopCount: loopCount },
        arranger: { totalSteps },
        soloist: {
            session: {
                seed: { notes: seedNotes, loopLengthSteps },
                phrasing: { isResting: true },
            },
        },
    };
}

// A simple theme: an anchor on every beat (steps 0,4,8,…) plus a non-anchor
// ornament between beats — so anchors are the skeleton, ornaments are arc fuel.
function buildSeed(loopLen = 64): any[] {
    const notes: any[] = [];
    for (let s = 0; s < loopLen; s += 4) {
        notes.push({ step: s, midi: 67, isAnchor: true, durationSteps: 2, velocity: 0.8 });
        notes.push({ step: s + 2, midi: 69, isAnchor: false, durationSteps: 1, velocity: 0.6 });
    }
    return notes;
}

function run(state: any, loopLen = 64) {
    const emitted: any[] = [];
    let rests = 0;
    for (let step = 0; step < loopLen; step++) {
        const isBar = step % 16 === 0;
        const stepInfo = { isDownbeat: isBar, isMeasureStart: isBar };
        const res = getSoloistNotePhraseFirst(
            state,
            CMAJ7,
            null,
            step,
            null,
            72,
            'smart',
            step % 16,
            {},
            stepInfo,
        );
        if (res) {
            emitted.push({ step, ...res });
        } else {
            rests++;
        }
    }
    return { emitted, rests };
}

describe('phrase-first soloist (Build 2a)', () => {
    it('states the theme WITH breath — emits notes and also leaves rests', () => {
        const { emitted, rests } = run(makeState(buildSeed(), { loopCount: 2 }));
        expect(emitted.length).toBeGreaterThan(0);
        expect(rests).toBeGreaterThan(0); // it is not a constant stream
    });

    it('always sounds the theme anchors, even at the sparsest (loop 0)', () => {
        const { emitted } = run(makeState(buildSeed(), { loopCount: 0 }));
        for (let a = 0; a < 64; a += 4) {
            expect(emitted.some((e) => e.step === a)).toBe(true);
        }
    });

    it('opens up over the song — denser at later loops (the dramatic arc)', () => {
        const early = run(makeState(buildSeed(), { loopCount: 0 }));
        const late = run(makeState(buildSeed(), { loopCount: 4 }));
        expect(late.emitted.length).toBeGreaterThan(early.emitted.length);
    });

    it('falls silent on steps with no theme note (real rests)', () => {
        // Seed with a single note at step 0 over a 16-step window → steps 1..15
        // have no theme note and must rest.
        const seed = [{ step: 0, midi: 67, isAnchor: true, durationSteps: 2, velocity: 0.8 }];
        const { rests } = run(makeState(seed, { loopLengthSteps: 16, totalSteps: 16 }), 16);
        expect(rests).toBe(15);
    });

    it('lands a chord tone on the downbeat (intentional resolution)', () => {
        // Theme note F# (66) on the downbeat against Cmaj7 (C E G Bb) is NOT a
        // chord tone; it must snap to the nearest one (G, 67).
        const seed = [{ step: 0, midi: 66, isAnchor: true, durationSteps: 2, velocity: 0.8 }];
        const { emitted } = run(makeState(seed, { loopLengthSteps: 16, totalSteps: 16 }), 16);
        const downbeat = emitted.find((e) => e.step === 0);
        expect(downbeat).toBeDefined();
        expect(downbeat.midi % 12).toBe(7); // G — a chord tone
    });

    it('emits crash-safe, playable note objects', () => {
        const { emitted } = run(makeState(buildSeed(), { loopCount: 3 }));
        for (const n of emitted) {
            expect(typeof n.midi).toBe('number');
            expect(n.velocity).toBeGreaterThan(0);
            expect(n.velocity).toBeLessThanOrEqual(1);
            expect(n.durationSteps).toBeGreaterThan(0);
        }
    });
});
