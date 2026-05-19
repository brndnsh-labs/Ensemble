// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Reggae Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}, opts = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 90 },
            groove: {
                genreFeel: 'Reggae',
                creativity: true,
                lastDrumPreset: 'Reggae',
                instruments: [],
                measures: numBars,
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const chordC = { rootMidi: 36, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            // why: phrase-end fill (epic-coordination-consistency S2.b) needs
            // a coordination context with soloistResting + soloistNotesInPhrase.
            // Tests that want to exercise the fill pass `coordinationFactory`;
            // existing tests pass nothing and get a phrase-mid baseline (no fill).
            const coordination =
                typeof opts.coordinationFactory === 'function'
                    ? opts.coordinationFactory(globalStep)
                    : {};
            const nextChord =
                typeof opts.nextChordFactory === 'function'
                    ? opts.nextChordFactory(globalStep)
                    : null;
            // why: chord-change tests that need a non-default current chord
            // (e.g. to flip prevMidi above the target so the fromAbove branch
            // of the ±1 approach is exercised — review P1 #5) override via
            // `chordFactory`. Defaults to chordC for all existing tests.
            const currentChord =
                typeof opts.chordFactory === 'function' ? opts.chordFactory(globalStep) : chordC;
            const active = isBassActive(
                getState(),
                'dub',
                globalStep,
                globalStep % 16,
                info,
                coordination,
            );

            if (active) {
                const note = getBassNote(
                    getState(),
                    currentChord,
                    nextChord,
                    info.beatIndex,
                    prevFreq,
                    32,
                    'dub',
                    0,
                    globalStep,
                    globalStep % 16,
                    { stepCoordination: coordination },
                    info,
                );
                if (note) {
                    performance.push({ step: globalStep, loopStep: globalStep % 16, info, note });
                    prevFreq = note.freq;
                }
            }
        }
        return performance;
    };

    it('should fire beat 1 reliably at intensity 0.5 (54-46 riddim has step-0 entry)', () => {
        // bass.md P0 #3: the old silencer was randomly dropping beat 1 80% of the time
        // on the 54-46 and Stalag riddims (intensity 0.45-0.7), which DO have step-0
        // entries. After deletion, the riddim table alone governs beat-1 presence.
        // 54-46 fires at intensity > 0.45: step-0 entry [0, 0, 1.1, 2] present.
        const performance = simulatePerformance(128, {
            playback: { bandIntensity: 0.5, complexity: 0.5, bpm: 90 },
        });

        let beatOneHits = 0;
        const totalBars = 128;
        performance.forEach((p) => {
            if (p.loopStep === 0) {
                beatOneHits++;
            }
        });

        const beatOneRate = beatOneHits / totalBars;
        console.log(`[Reggae Critique] 54-46 beat-1 hit rate: ${(beatOneRate * 100).toFixed(1)}%`);

        // 54-46 has a step-0 entry. Path is deterministic after silencer removal
        // (isBassActive → riddim.find → emit, no gating RNG). Require exact match
        // so a future ~5% beat-1 regression cannot slip through a loose band.
        expect(beatOneHits).toBe(totalBars);
    });

    it('should fire beat 1 reliably at intensity 0.7 (Stalag riddim has step-0 entry)', () => {
        // bass.md P0 #3: Stalag fires at intensity > 0.65. Its step-0 entry [0, 0, 1.1, 2]
        // means beat 1 should hit every bar. The old silencer wrongly suppressed it.
        const performance = simulatePerformance(128, {
            playback: { bandIntensity: 0.7, complexity: 0.5, bpm: 90 },
        });

        let beatOneHits = 0;
        const totalBars = 128;
        performance.forEach((p) => {
            if (p.loopStep === 0) {
                beatOneHits++;
            }
        });

        const beatOneRate = beatOneHits / totalBars;
        console.log(`[Reggae Critique] Stalag beat-1 hit rate: ${(beatOneRate * 100).toFixed(1)}%`);

        // Stalag has a step-0 entry; same deterministic path as 54-46. Tighten to
        // exact match (sibling Steppers test on line 127 uses the same pattern).
        expect(beatOneHits).toBe(totalBars);
    });

    it('should leave Beat 1 fully open at high intensity (Steppers riddim)', () => {
        // intensity > 0.85 selects 'Steppers' which DOES have a step-0 entry.
        // The old silencer is gone; at 0.95 the riddim table alone governs beat 1,
        // so every bar's beat 1 should fire deterministically.
        const performance = simulatePerformance(64, {
            playback: { bandIntensity: 0.95, complexity: 0.5, bpm: 90 },
        });
        const beatOneHits = performance.filter((p) => p.loopStep === 0).length;
        console.log(`[Reggae Critique] Steppers beat-1 hits: ${beatOneHits}/64`);
        expect(beatOneHits).toBe(64); // deterministic — no random gate at this intensity
    });

    it('should stay grounded in the ultra-deep sub register (23-42)', () => {
        // bass-engine.ts:127-128 sets extended-range softMin=23 / softMax=57 for Reggae.
        // bass-styles.ts:700-708 then forces finalDeepRoot <= 38 (octave-down loop) and
        // >= absMin. The added riddim interval (0 or 7) can push the resulting note up
        // to ~45. Range 23–42 covers both pure-root and 5th-of-root riddim slots.
        const performance = simulatePerformance(32, {
            playback: { bandIntensity: 0.8, complexity: 0.5, bpm: 90 },
        });

        expect(performance.length).toBeGreaterThan(20); // sanity: bass actually fired
        performance.forEach((p) => {
            expect(p.note.midi).toBeGreaterThanOrEqual(23);
            expect(p.note.midi).toBeLessThanOrEqual(42);
        });
    });

    it('should switch riddims based on intensity', () => {
        // bass-styles.ts:710-719 picks riddim by intensity bands:
        //   > 0.85 Steppers (positions 0, 4, 8, 12 — 4 hits/bar)
        //   > 0.65 Stalag (positions 0, 2, 4, 6, 10, 12 — 6 hits/bar)
        //   > 0.45 54-46 (positions 0, 2, 6, 8, 10, 14 — 6 hits/bar)
        //   else   One Drop (position 8 only — 1 hit/bar)
        const oneDrop = simulatePerformance(32, {
            playback: { bandIntensity: 0.3, complexity: 0.5, bpm: 90 },
        });
        const steppers = simulatePerformance(32, {
            playback: { bandIntensity: 0.95, complexity: 0.5, bpm: 90 },
        });

        // One Drop: only step 8 fires
        const oneDropPositions = new Set(oneDrop.map((p) => p.loopStep));
        // Steppers: steps 0, 4, 8, 12 fire
        const steppersPositions = new Set(steppers.map((p) => p.loopStep));

        console.log(
            `[Reggae Critique] Riddim positions — OneDrop: [${[...oneDropPositions].sort((a, b) => a - b).join(',')}] Steppers: [${[...steppersPositions].sort((a, b) => a - b).join(',')}]`,
        );

        // One Drop has no step-0 entry — position 8 is its only hit.
        // The riddim table alone constrains which positions fire.
        for (const pos of oneDropPositions) {
            expect(pos).toBe(8);
        }
        // Steppers fires on a 4-on-the-floor pattern at high intensity.
        expect(steppersPositions).toEqual(new Set([0, 4, 8, 12]));
    });

    // epic-coordination-consistency S2.b — reggae bass coordination consumption.
    // The dub branch previously read only kickHit; on a soloist phrase-end OR a
    // bar-to-bar chord change, the bass now emits a single chromatic approach
    // note at step 14 (the "and-of-4") as a conversational gesture into the
    // next downbeat. These tests verify both branches fire and don't double-emit.

    it('S2.b: phrase-end produces an approach note at step 14 (One Drop riddim)', () => {
        // One Drop is the lowest-intensity riddim and only fires at step 8 —
        // step 14 is normally silent. With phrase-end coordination, the bass
        // should add a step-14 attack on every bar (the fill).
        const phraseEndCoord = () => ({
            soloistResting: true,
            soloistNotesInPhrase: 5,
        });
        const performance = simulatePerformance(
            32,
            { playback: { bandIntensity: 0.3, complexity: 0.5, bpm: 90 } },
            { coordinationFactory: phraseEndCoord },
        );

        const step14Hits = performance.filter((p) => p.loopStep === 14).length;
        const step8Hits = performance.filter((p) => p.loopStep === 8).length;

        console.log(
            `[Reggae S2.b] phrase-end fill on One Drop — step-14 hits: ${step14Hits}/32, step-8 hits: ${step8Hits}/32`,
        );

        // Every bar should produce both: the riddim's step-8 root AND the
        // step-14 phrase-end approach (force-activated by isBassActive).
        expect(step14Hits).toBe(32);
        expect(step8Hits).toBe(32);
    });

    it('S2.b: phrase-end-fill approach lands within ±1 semitone of upcoming root', () => {
        // The approach note is chromatic: targetRoot ± 1 semitone. With no
        // chord change (nextChord = null), it targets the CURRENT chord's
        // root (rootMidi 36 = C2). With the reggae register clamp (≤ 38),
        // the approach must be at 36 ± 1 transposed into ≤38 range.
        // Specifically: from below = 35 (B1), from above = 37 (C#2). Both
        // are ≤ 38 and ≥ absMin (23). Direction is whichever is closer to
        // prevMidi; without prev, tie-breaks to BELOW.
        const phraseEndCoord = () => ({
            soloistResting: true,
            soloistNotesInPhrase: 5,
        });
        const performance = simulatePerformance(
            8,
            { playback: { bandIntensity: 0.3, complexity: 0.5, bpm: 90 } },
            { coordinationFactory: phraseEndCoord },
        );

        const step14Notes = performance.filter((p) => p.loopStep === 14);
        expect(step14Notes.length).toBeGreaterThan(0);
        for (const p of step14Notes) {
            // Target root pc = 0 (C). Approach must be pc 11 (B = -1) or
            // pc 1 (C# = +1). Octave can be anywhere in reggae deep-bass.
            const pc = p.note.midi % 12;
            expect([11, 1]).toContain(pc);
            // Reggae register constraint: the dub branch normally forces
            // ≤ 38; the approach respects the same ceiling.
            expect(p.note.midi).toBeLessThanOrEqual(38);
            expect(p.note.midi).toBeGreaterThanOrEqual(23);
        }
    });

    it('S2.b: chord-change approach lands on next chord root pc (no phrase-end)', () => {
        // No phrase-end signal; instead, a bar-to-bar chord change. Bar 0 is
        // C (rootMidi 36), bars 1+ are F (rootMidi 41). isChordChangeApproach
        // returns true at step 14 of bar 0, so the bass should walk into
        // F-root (pc 5) chromatically — i.e. pc 4 (E) or pc 6 (F#).
        const phraseMidCoord = () => ({
            soloistResting: false,
            soloistNotesInPhrase: 1,
        });
        // F major chord upcoming
        const fChord = { rootMidi: 41, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const performance = simulatePerformance(
            4,
            { playback: { bandIntensity: 0.5, complexity: 0.5, bpm: 90 } },
            {
                coordinationFactory: phraseMidCoord,
                // Apply next-chord only at the LAST bar boundary so we measure
                // a single transition. For simplicity, return F as nextChord
                // on every step — the gate only fires at step 14 anyway.
                nextChordFactory: () => fChord,
            },
        );

        const step14Notes = performance.filter((p) => p.loopStep === 14);
        console.log(
            `[Reggae S2.b] chord-change approach — ${step14Notes.length} step-14 emissions; pcs: [${step14Notes.map((p) => p.note.midi % 12).join(',')}]`,
        );

        // Should fire on every bar (chord-change present at every step-14).
        expect(step14Notes.length).toBeGreaterThan(0);
        for (const p of step14Notes) {
            const pc = p.note.midi % 12;
            // F root pc = 5. Approach is pc 4 (E) or pc 6 (F#).
            expect([4, 6]).toContain(pc);
        }
    });

    it('S2.b: chord-change approach takes precedence over phrase-end (single note, no double-fire)', () => {
        // Both triggers fire simultaneously. The implementation prefers the
        // chord-change target (functional voice-leading is the stronger musical
        // signal). One step-14 emission per bar, no double-emission.
        const bothCoord = () => ({
            soloistResting: true,
            soloistNotesInPhrase: 5,
        });
        const fChord = { rootMidi: 41, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const performance = simulatePerformance(
            4,
            { playback: { bandIntensity: 0.3, complexity: 0.5, bpm: 90 } }, // One Drop
            {
                coordinationFactory: bothCoord,
                nextChordFactory: () => fChord,
            },
        );

        const step14Notes = performance.filter((p) => p.loopStep === 14);
        // One emission per bar — never two on the same step.
        expect(step14Notes.length).toBe(4);

        // Target is F root pc 5; approach is pc 4 (E) or pc 6 (F#) — chord-
        // change branch should win.
        for (const p of step14Notes) {
            const pc = p.note.midi % 12;
            expect([4, 6]).toContain(pc);
        }
    });

    it('S2.b: chord-change approach exercises fromAbove branch when prevMidi sits above target', () => {
        // why: review P1 #5 — the existing chord-change test always exercises
        // the fromBelow branch (C deep root ≈ 24 → F target 29, distBelow=4 <
        // distAbove=6). If a bug zeroed out the fromAbove arm, the test would
        // still pass. Fixture: current chord G (rootMidi 43, deep ≈ 31),
        // next chord F (rootMidi 41, deep ≈ 29). prevMidi tracks G's deep
        // root ~31; distAbove(30)=1 < distBelow(28)=3 → fromAbove wins → pc 6.
        const phraseMidCoord = () => ({
            soloistResting: false,
            soloistNotesInPhrase: 1,
        });
        const gChord = { rootMidi: 43, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const fChord = { rootMidi: 41, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const performance = simulatePerformance(
            4,
            { playback: { bandIntensity: 0.5, complexity: 0.5, bpm: 90 } },
            {
                coordinationFactory: phraseMidCoord,
                chordFactory: () => gChord,
                nextChordFactory: () => fChord,
            },
        );

        const step14Notes = performance.filter((p) => p.loopStep === 14);
        console.log(
            `[Reggae S2.b] fromAbove branch — ${step14Notes.length} step-14 emissions; pcs: [${step14Notes.map((p) => p.note.midi % 12).join(',')}]`,
        );

        expect(step14Notes.length).toBeGreaterThan(0);
        // Without an asserted fromAbove hit, the test for ±1 is half-blind.
        // At least one bar must produce pc 6 (F#, target+1 from above).
        const aboveHits = step14Notes.filter((p) => p.note.midi % 12 === 6);
        expect(aboveHits.length).toBeGreaterThan(0);
    });

    it('S2.b: no coordination → no fill (regression guard against always-on)', () => {
        // With no soloistResting and no chord change, the dub branch's normal
        // riddim alone should govern. One Drop at intensity 0.3 fires only at
        // step 8; step 14 must remain silent.
        const performance = simulatePerformance(
            32,
            { playback: { bandIntensity: 0.3, complexity: 0.5, bpm: 90 } },
            {}, // no coordination, no nextChord
        );

        const step14Hits = performance.filter((p) => p.loopStep === 14).length;
        expect(step14Hits).toBe(0);
    });
});
