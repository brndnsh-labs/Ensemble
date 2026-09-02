import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import { getSoloistNotePhraseFirst } from '../../../public/engine/soloist-phrase-first.js';
import { getEffectiveTimeSignature, getEffectiveTimeSignatures } from '../../../public/meter.js';
import { getStepInfo } from '../../../public/utils.js';
import { makeChord } from '../../utils/chord-fixture.js';

// Structural guard for the parallel phrase-first soloist engine (Slice 1,
// Build 2a). The real definition-of-done is the by-ear listening gate; these
// assertions only protect against gross regressions — a crash, a silent
// engine, an inverted arc — so a broken build never reaches the audition.
//
// The engine takes `state` as an argument and we always supply a seed, so the
// legacy fallback path is never exercised here and no module mocks are needed.

const CMAJ7 = makeChord({ rootMidi: 60, intervals: [0, 4, 7, 10] }); // C E G Bb
const STRONG_PCS = new Set([0, 7]); // C-major strong tones: tonic + 5th

function makeState(
    seedNotes: any[],
    {
        loopCount = 0,
        totalSteps = 64,
        loopLengthSteps = 64,
        bpm = 120,
        phrasingIntensity = 0.5,
        timeSignature = '4/4',
        grouping = null as number[] | null,
    } = {},
): any {
    return {
        playback: { currentLoopCount: loopCount, bpm },
        arranger: { totalSteps, key: 'C', isMinor: false, timeSignature, grouping },
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

    it('lands a GUIDE tone on the downbeat (voice-leading §5)', () => {
        // A body theme note F# (66) on the downbeat against Cmaj7 is NOT a chord
        // tone, so the strong beat re-targets it — and prefers a GUIDE tone (the
        // 3rd, E=64) over the nearer 5th, because guide tones define the harmony.
        // A higher note at step 8 is the form apex, so step 0 stays a body note.
        const seed = [
            { step: 0, midi: 66, isAnchor: true, durationSteps: 2, velocity: 0.8 },
            { step: 8, midi: 79, isAnchor: true, durationSteps: 2, velocity: 0.8 },
        ];
        const { emitted } = run(makeState(seed, { loopLengthSteps: 16, totalSteps: 16 }), 16);
        const downbeat = emitted.find((e) => e.step === 0);
        expect(downbeat).toBeDefined();
        expect(downbeat.midi % 12).toBe(4); // E — the major 3rd, a guide tone
    });

    it('leaves a strong-beat note that already lands a chord tone alone', () => {
        // The theme states G (67, the 5th) on the downbeat over Cmaj7 — already a
        // chord tone, so voice-leading must NOT wrench it to the 3rd; the tune wins.
        const seed = [
            { step: 0, midi: 67, isAnchor: true, durationSteps: 2, velocity: 0.8 },
            { step: 8, midi: 79, isAnchor: true, durationSteps: 2, velocity: 0.8 },
        ];
        const { emitted } = run(makeState(seed, { loopLengthSteps: 16, totalSteps: 16 }), 16);
        expect(emitted.find((e) => e.step === 0).midi % 12).toBe(7); // G — left as stated
    });

    it('moves guide-tone landings with the authored 5/4 grouping', () => {
        const seed = [
            { step: 0, midi: 84, isAnchor: true, durationSteps: 1, velocity: 0.8 },
            { step: 8, midi: 66, isAnchor: true, durationSteps: 1, velocity: 0.8 },
            { step: 12, midi: 66, isAnchor: true, durationSteps: 1, velocity: 0.8 },
        ];
        const perform = (grouping: number[]) => {
            const state = makeState(seed, {
                loopLengthSteps: 20,
                totalSteps: 20,
                timeSignature: '5/4',
                grouping,
            });
            const ts = getEffectiveTimeSignature('5/4', grouping);
            const signatures = getEffectiveTimeSignatures('5/4', grouping);
            return new Map(
                [8, 12].map((step) => {
                    const note = getSoloistNotePhraseFirst(
                        state,
                        CMAJ7,
                        null,
                        step,
                        null,
                        72,
                        'smart',
                        step,
                        {},
                        getStepInfo(step, ts, [], signatures),
                    );
                    return [step, note?.midi];
                }),
            );
        };

        const threeTwo = perform(TIME_SIGNATURES['5/4'].grouping);
        const twoThree = perform([2, 3]);
        expect(threeTwo.get(12) % 12).toBe(4);
        expect(threeTwo.get(8) % 12).toBe(6);
        expect(twoThree.get(8) % 12).toBe(4);
        expect(twoThree.get(12) % 12).toBe(6);
    });

    it('approaches a chromatic guide tone (the dominant ♭7) BY STEP, not a leap', () => {
        // Regression for the review's voice-leading bug: a naive diatonic shift
        // approaches a CHROMATIC target (the ♭7 of a dominant — B♭ over C7 in C
        // major) from a minor third below (G), discarding the true leading tone.
        // The fix (`diatonicNeighbor`) steps from A, a whole step. Setup: a 16-step
        // bar over C7. The downbeat note A (69) is NOT a C7 chord tone, so it snaps
        // to the nearest guide — B♭ (the chromatic ♭7); the pickup at step 15 must
        // resolve INTO that landing by step. A note at step 8 is the apex elsewhere.
        const C7 = makeChord({ rootMidi: 60, quality: '7', intervals: [0, 4, 7, 10] });
        const seed = [
            { step: 0, midi: 69, isAnchor: true, durationSteps: 1, velocity: 0.8 },
            { step: 8, midi: 84, isAnchor: true, durationSteps: 1, velocity: 0.8 },
            { step: 15, midi: 67, isAnchor: true, durationSteps: 1, velocity: 0.8 },
        ];
        const state = makeState(seed, { loopLengthSteps: 16, totalSteps: 16 });
        const emitted: any[] = [];
        for (let step = 0; step < 16; step++) {
            const isBar = step % 16 === 0;
            const res = getSoloistNotePhraseFirst(
                state,
                C7,
                C7,
                step,
                null,
                72,
                'smart',
                step % 16,
                {},
                {
                    isDownbeat: isBar,
                    isMeasureStart: isBar,
                },
            );
            if (res) {
                emitted.push({ step, ...res });
            }
        }
        const landing = emitted.find((e) => e.step === 0);
        const approach = emitted.find((e) => e.step === 15);
        expect(landing.midi % 12).toBe(10); // B♭ — the chromatic ♭7, a guide tone
        expect(Math.abs(approach.midi - landing.midi)).toBeLessThanOrEqual(2); // resolves BY STEP
        expect(approach.midi % 12).toBe(9); // A — the true leading tone, not G (a third below)
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

    it('clusters bends into a flurry around the peak, with clean space between', () => {
        // Build 2d expression: the apex carries the big reach UP into the money
        // note, AND nearby notes get lighter scoops — a lyrical burst, not one
        // isolated ornament. Notes well away from the peak stay clean, so the
        // flurries have space. apex is the non-anchor ornament at step 8.
        const { emitted } = run(makeState(buildApexSeed(), { loopCount: 2 }));
        const apex = emitted.find((e) => e.step === 8);
        expect(apex.bendStartInterval).toBeLessThan(0); // the big reach into the peak
        // A FLURRY: nearby notes also scoop — multiple bends in succession.
        const flurryBends = emitted.filter(
            (e) => e.step !== 8 && Math.abs(e.step - 8) <= 12 && (e.bendStartInterval ?? 0) < 0,
        );
        expect(flurryBends.length).toBeGreaterThan(0);
        // SPACE between flurries: notes well away from the peak stay clean.
        for (const e of emitted) {
            if (Math.abs(e.step - 8) > 16) {
                expect(e.bendStartInterval ?? 0).toBe(0);
                expect(e.vibrato).toBe(false);
            }
        }
    });

    it('sings on SUSTAINED notes in the flurry — vibrato clusters at the peak', () => {
        // Lengthen the apex AND a flurry neighbor (step 4) to a full beat: both
        // held notes in the cluster shimmer — multiple vibrato events in
        // succession. A quick note in the zone and notes far away stay clean.
        const held = buildApexSeed().map((n) =>
            n.step === 8 || n.step === 4 ? { ...n, durationSteps: 4 } : n,
        );
        const { emitted } = run(makeState(held, { loopCount: 2 }));
        expect(emitted.find((e) => e.step === 8).vibrato).toBe(true); // the peak sings
        expect(emitted.find((e) => e.step === 4).vibrato).toBe(true); // a flurry neighbor too
        expect(emitted.find((e) => e.step === 12).vibrato).toBe(false); // dur 2 < a beat → clean
        for (const e of emitted) {
            if (Math.abs(e.step - 8) > 16) {
                expect(e.vibrato).toBe(false); // space between flurries stays clean
            }
        }

        // …and a SHORT peak (the default 2-step apex) gets no vibrato to voice.
        const quick = run(makeState(buildApexSeed(), { loopCount: 2 })).emitted.find(
            (e) => e.step === 8,
        );
        expect(quick.vibrato).toBe(false);
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
