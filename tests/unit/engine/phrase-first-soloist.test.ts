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
const STRONG_PCS = new Set([0, 7]); // C-major strong tones: tonic + 5th

function makeState(
    seedNotes: any[],
    {
        loopCount = 0,
        totalSteps = 64,
        loopLengthSteps = 64,
        bpm = 120,
        phrasingIntensity = 0.5,
    } = {},
): any {
    return {
        playback: { currentLoopCount: loopCount, bpm },
        arranger: { totalSteps, key: 'C', isMinor: false },
        soloist: {
            phrasingIntensity,
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
        // A body theme note F# (66) on the downbeat against Cmaj7 (C E G Bb) is NOT
        // a chord tone; it must snap to the nearest one (G, 67). A higher note at
        // step 8 is the form apex, so step 0 stays a body note (not the apex peak).
        const seed = [
            { step: 0, midi: 66, isAnchor: true, durationSteps: 2, velocity: 0.8 },
            { step: 8, midi: 79, isAnchor: true, durationSteps: 2, velocity: 0.8 },
        ];
        const { emitted } = run(makeState(seed, { loopLengthSteps: 16, totalSteps: 16 }), 16);
        const downbeat = emitted.find((e) => e.step === 0);
        expect(downbeat).toBeDefined();
        expect(downbeat.midi % 12).toBe(7); // G — a chord tone
    });

    // The anchor at step 4 (G=67) always sounds and is NOT a downbeat (bars are
    // every 16 steps here), so the chord-tone snap leaves it alone — it isolates
    // the development transposition. loopLengthSteps 64 → cycle period 3.
    const pitchAtStep4 = (loopCount: number): number | undefined =>
        run(makeState(buildSeed(), { loopCount })).emitted.find((e) => e.step === 4)?.midi;

    it('develops the theme — sequences progressively higher across loops', () => {
        // C major, theme note G: a diatonic third up = B (71), a fifth up = D (74).
        expect(pitchAtStep4(0)).toBe(67); // head: stated verbatim
        expect(pitchAtStep4(1)).toBe(71); // depth 1: reached up a third (same contour)
        expect(pitchAtStep4(2)).toBe(74); // depth 2: cumulative — higher still
    });

    it('returns to the head on the cadence (the recognizable recurrence)', () => {
        // period 3 → depth resets to 0 at loop 3: the idea comes home, verbatim.
        expect(pitchAtStep4(3)).toBe(pitchAtStep4(0));
    });

    it('fills more at slow tempo to stay present (tempo-awareness, §7)', () => {
        // A slow tune's bars are long in wall-clock, so it needs more notes per
        // bar to read as present. Same seed/loop, only tempo differs.
        const slow = run(makeState(buildSeed(), { loopCount: 1, bpm: 70 }));
        const fast = run(makeState(buildSeed(), { loopCount: 1, bpm: 160 }));
        expect(slow.emitted.length).toBeGreaterThan(fast.emitted.length);
    });

    it('states the theme more fully at higher phrasing intensity (the knob)', () => {
        const spacious = run(makeState(buildSeed(), { loopCount: 1, phrasingIntensity: 0.1 }));
        const present = run(makeState(buildSeed(), { loopCount: 1, phrasingIntensity: 1.0 }));
        expect(present.emitted.length).toBeGreaterThan(spacious.emitted.length);
    });

    // A theme whose lone high point (the apex) is a non-anchor ornament at step 8
    // (E5=76), over plain anchors (G=67) elsewhere — isolates the money-note reach.
    function buildApexSeed(): any[] {
        const notes: any[] = [];
        for (let s = 0; s < 64; s += 4) {
            if (s === 8) {
                notes.push({ step: 8, midi: 76, isAnchor: false, durationSteps: 2, velocity: 0.8 });
            } else {
                notes.push({ step: s, midi: 67, isAnchor: true, durationSteps: 2, velocity: 0.8 });
            }
        }
        return notes;
    }
    const apexPitch = (loopCount: number): number | undefined =>
        run(makeState(buildApexSeed(), { loopCount })).emitted.find((e) => e.step === 8)?.midi;

    it('lands the form apex on the money note — a strong tone — whenever it sounds', () => {
        // The apex (E5=76) is the form's single peak; it lands on the money note (a
        // strong key tone a third-to-sixth above: high C=84) EVERY time it sounds,
        // driven by its identity as the peak — NOT by the loop-count phase (which
        // is decoupled from the apex's fixed form position). So it is the money
        // note at the head, mid-development, and the cycle climax alike.
        for (const lc of [0, 1, 2, 3]) {
            expect(apexPitch(lc)).toBe(84);
        }
        expect(84 % 12).toBe(0); // the tonic — a resolved, strong tone
    });

    it('the money note reaches a strong tone above the apex without octave leaps', () => {
        // Regression for two coupled review findings: (a) the climax must land on a
        // strong key tone, not a tension tone; (b) the reach is bounded to <= a
        // sixth, so a LOW apex doesn't leap toward the ceiling. Low apex (C4=60):
        // the money note is a strong tone a fifth up (G4=67), not a two-octave jump.
        const seed: any[] = [];
        for (let s = 0; s < 64; s += 4) {
            seed.push(
                s === 8
                    ? { step: 8, midi: 60, isAnchor: false, durationSteps: 2, velocity: 0.8 }
                    : { step: s, midi: 55, isAnchor: true, durationSteps: 2, velocity: 0.8 },
            );
        }
        const apex = run(makeState(seed, { loopCount: 2 })).emitted.find((e) => e.step === 8);
        expect(STRONG_PCS.has(apex.midi % 12)).toBe(true); // a strong key tone (tonic/5th)
        expect(apex.midi).toBeGreaterThanOrEqual(63); // a clear reach above the apex
        expect(apex.midi).toBeLessThanOrEqual(69); // …but bounded — no octave leap
    });

    it('never gates out the apex — the money note always sounds', () => {
        // Even though the apex is a non-anchor ornament at the sparsest loop.
        for (const lc of [0, 1, 2]) {
            expect(apexPitch(lc)).toBeDefined();
        }
    });

    it('reaches INTO the peak — a scoop-up bend on the money note, never the body', () => {
        // Build 2d expression (one device, one location): the apex note carries a
        // negative bendStartInterval (start below, glide UP into the money note);
        // every body note stays unbent. Restraint — the reach reads because it's
        // rare. apex is the non-anchor ornament at step 8.
        const { emitted } = run(makeState(buildApexSeed(), { loopCount: 2 }));
        const apex = emitted.find((e) => e.step === 8);
        expect(apex.bendStartInterval).toBeLessThan(0); // a reach UP into the peak
        for (const e of emitted) {
            if (e.step !== 8) {
                expect(e.bendStartInterval ?? 0).toBe(0); // body of the line is unbent
            }
        }
    });

    it('clamps a note duration to the next sounding note (monophonic, no overlap)', () => {
        // A long held anchor (dur 8) at step 0 with the next anchor 2 steps later:
        // the lead is one voice, so step 0 must release by step 2 — not ring over it.
        const seed = [
            { step: 0, midi: 67, isAnchor: true, durationSteps: 8, velocity: 0.8 },
            { step: 2, midi: 69, isAnchor: true, durationSteps: 2, velocity: 0.8 },
        ];
        const { emitted } = run(makeState(seed, { loopLengthSteps: 16, totalSteps: 16 }), 16);
        const first = emitted.find((e) => e.step === 0);
        const second = emitted.find((e) => e.step === 2);
        expect(first.durationSteps).toBe(2); // clamped from 8 → gap to the next note
        expect(first.step + first.durationSteps).toBeLessThanOrEqual(second.step); // no overlap
    });

    it('preserves a long note that sustains into a rest (sustain, not truncation)', () => {
        // Lone held note over a 16-step window: nothing sounds after it, so its
        // full duration must survive — the clamp removes overlap, not sustain.
        const seed = [{ step: 0, midi: 67, isAnchor: true, durationSteps: 8, velocity: 0.8 }];
        const { emitted } = run(makeState(seed, { loopLengthSteps: 16, totalSteps: 16 }), 16);
        expect(emitted.find((e) => e.step === 0).durationSteps).toBe(8);
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
