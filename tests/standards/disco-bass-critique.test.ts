// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';
import { installSeededRandom } from '../utils/seeded-random.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Disco Bassist Critique', () => {
    // why: the octave pump rolls raw `Math.random() < octaveProb` once per upbeat
    // (`bass-styles.ts`, the disco branch), so the alternation rate is an unseeded
    // binomial and this file used to flake on its tail (CI run 283, `31/41 = 75.6%`
    // against a 0.80 floor). A mulberry32-seeded spy collapses every test in this file
    // to one deterministic run. Restores mocks in before+after, so it subsumes the old
    // `vi.restoreAllMocks()` beforeEach. See docs/FLAKY_TESTS.md (unseeded-statistical).
    //
    // Measured under the CURRENT (#1254, step-index) metric at 512 pairs, 300 unseeded
    // runs: mean 88.84%, sd 1.41%. That is NOT the 0.94 `octaveProb` implies, and the
    // gap is a real engine defect, not measurement noise — see the Root-Octave test.
    // The pre-#1254 figures that used to live here (pooled 94.2%, ~40 pairs/run, a
    // 2000-iteration sweep against the 0.80 floor) all described the old
    // array-adjacency metric and no longer apply to anything in this file.
    //
    // Seed choice (0x1234, not the shared 0xc0ffee default): under the old metric
    // 0xc0ffee drew a verified bottom-1% sample (29/34 = 85.3%), and #1254 had to
    // re-derive the band *from the pinned value* — anchoring a musical target to a
    // bottom-1% draw would have frozen RNG noise as the target. 0x1234 was picked as
    // the closest of twelve candidates to the mean and remains a good pin under the
    // corrected metric: it draws 452/512 = 88.3%, 0.4σ below the 88.84% mean.
    //
    // Pinned at the describe level deliberately: `reseed()` mutates the handle's
    // persistent seed and `beforeEach` replays it, so a per-test `rng.reseed()` would
    // silently govern every *later* test in the file too — making three unrelated
    // critique tests' streams a function of test ordering.
    installSeededRandom(0x1234);

    const simulatePerformance = (numBars, stateOverrides = {}, rootMidi = 48, context = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 124 },
            groove: {
                genreFeel: 'Disco',
                lastDrumPreset: 'Disco',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const chordC = {
            rootMidi,
            intervals: [0, 4, 7],
            quality: 'maj',
            beats: 4,
            // #1271 — Imperfect Symmetry hashes the sectionId to pick its target beat, so
            // the occurrence-2 test below needs a stable non-empty one to be deterministic.
            sectionId: 'sec-1',
        };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(getState(), 'disco', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'disco',
                    0,
                    globalStep,
                    globalStep % 16,
                    context,
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

    /**
     * Octave-pump rate: of every beat that has a playable "and" two 16th steps later,
     * how often does the "and" land an octave ABOVE the beat?
     *
     * #1254 — the "and" is looked up BY STEP INDEX, not by array adjacency. The old
     * `performance[i + 1]` asked "is the next note played an 'and'?", so whenever the
     * gallop claimed the 'e' in between, the pair failed the `mStep % 4 === 2` check and
     * was dropped from the sample entirely — not counted as a miss. That voided ~37% of
     * beats, and it voided precisely the busiest ones, which a disco listener judges
     * hardest. The metric was silent about its own hardest case while being named
     * "Root-Octave alternating". Correcting it moved the measured rate from ~94.5% to
     * ~88.8%, because the discarded pairs were the failing ones.
     *
     * #1271 — DIRECTIONAL. The score is now `and - beat === +12`, not
     * `Math.abs(...) === 12`. The absolute form scored an INVERTED pump (octave on the
     * downbeat, root on the upbeat) as a perfect 100%, and that was not hypothetical:
     * the register anchor drifted off `prevMidi`, so the measured line descended (243)
     * more often than it rose (209) and the low root anchored only 47.9% of downbeats
     * while the metric read 88.8%. Direction is the whole gesture — the low root is the
     * floor of the groove and the octave is the lift above it, not an interchangeable
     * pair. `inversions` and `lowRootOnBeat` are returned so the failure the absolute
     * metric was blind to now has its own assertions rather than living inside the rate.
     */
    const scoreOctaveAlternation = (performance) => {
        let octaveLifts = 0;
        let inversions = 0;
        const illegalDeltas = [];
        let checks = 0;
        let andsNotPlayed = 0;
        let beats = 0;
        const byStep = new Map(performance.map((p) => [p.step, p]));
        const beatMidis = [];

        performance.forEach((p) => {
            if (!p.info.isBeatStart) {
                return;
            }
            beats++;
            beatMidis.push(p.note.midi);
            const and = byStep.get(p.step + 2);
            if (!and) {
                // A genuinely unplayed "and" is not a failed alternation — there is no
                // pair to judge. Counted and reported so a silent collapse in the
                // sample size can't masquerade as a healthy score.
                andsNotPlayed++;
                return;
            }
            checks++;
            const delta = and.note.midi - p.note.midi;
            if (delta === 12) {
                octaveLifts++;
            } else if (delta < 0) {
                // The upbeat BELOW its own downbeat. Not merely a missed pump — the
                // gesture upside down.
                inversions++;
            }
            // The vocabulary check, and the tightest assertion in this file. A disco pump
            // has exactly two legal beat→"and" moves: repeat the root (the `octaveProb`
            // roll declining) or lift an octave. ANYTHING else — a 24-semitone leap, a
            // 7-semitone slip, a unison arrived at from a drifted register — means the
            // anchor moved between the two steps of a single beat, which a rate and an
            // inversion count between them can both miss. This is what catches the class
            // of bug where the anchor is a step function of live `bandIntensity`: a
            // conductor ramp crossing a boundary mid-beat yields delta +24 or 0-from-drift,
            // neither of which is negative and neither of which dents a 94% rate much.
            if (delta !== 0 && delta !== 12) {
                illegalDeltas.push(`step${p.step}:${p.note.midi}->${and.note.midi}`);
            }
        });

        // The anchor: how often the downbeat carries the lowest note the line plays AT
        // ALL. Taking the minimum over every note rather than over downbeats only is what
        // makes this an independent claim — over downbeats only it is arithmetically the
        // same statement as `distinctBeatMidis === 1` (both just say "the downbeats agree
        // with each other"), which is how an earlier draft of this file ended up asserting
        // the same thing twice and reporting a constant as a measurement. Over all notes
        // it says the thing the gesture actually needs: the downbeat is the FLOOR of the
        // line, not merely a stable pitch. Measured against the line's own minimum rather
        // than a hardcoded MIDI number so it holds for any chord root.
        const lowestNote = performance.length
            ? Math.min(...performance.map((p) => p.note.midi))
            : 0;
        const lowRootOnBeat = beatMidis.filter((m) => m === lowestNote).length / (beats || 1);

        return {
            score: octaveLifts / (checks || 1),
            octaveLifts,
            inversions,
            illegalDeltas,
            checks,
            andsNotPlayed,
            lowRootOnBeat,
            anchorMidi: lowestNote,
            distinctBeatMidis: new Set(beatMidis).size,
        };
    };

    it('should implement Root-Octave alternating at high intensity', () => {
        // 128 bars, not the file's usual 16 (#1254). At 16 bars the metric samples 64
        // pairs and carries sd 4.05, which is wider than the effect it has to detect:
        // the 0.94 → 0.859 engine regression this test exists to catch only moves the
        // mean 7pt, so the healthy and regressed distributions overlap and NO threshold
        // can separate them. Measured sd by sample size (300 runs each): 64 pairs 4.05,
        // 128 pairs 2.81, 256 pairs 2.01, 512 pairs 1.43 — textbook 1/sqrt(n), and the
        // mean holds at 88.8-89.2 throughout, which also confirms nothing loop- or
        // section-dependent drifts over the longer run. 512 pairs is what makes the band
        // below an actual gate rather than a fence. One extra simulated run, no
        // measurable runtime cost.
        const performance = simulatePerformance(128, {
            playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 },
        });

        const r = scoreOctaveAlternation(performance);
        console.log(
            `[Disco Critique] Octave Pump Score: ${(r.score * 100).toFixed(1)}% ` +
                `(${r.octaveLifts}/${r.checks} pairs up an octave; ${r.inversions} inverted; ` +
                `${r.andsNotPlayed} "and"s unplayed) — low root ${r.anchorMidi} on ` +
                `${(r.lowRootOnBeat * 100).toFixed(1)}% of downbeats, ` +
                `${r.distinctBeatMidis} distinct downbeat pitch(es)`,
        );

        // The musical claim: at high intensity the octave lifts off at least 9 of every 10
        // upbeats — the pump is the line's identity, not an occasional flourish.
        //
        // Derived, not guessed. Re-derived UPWARD in #1271 as that story predicted, and
        // the reason is worth keeping: the pre-#1271 design mean was 88.84% against an
        // `octaveProb` of 0.94, and that 5pt gap was the anchor defect, not noise. With
        // the anchor fixed the metric now tracks the design probability exactly, measured
        // at 512 pairs over 300 unseeded runs per intensity:
        //
        //   intensity | octaveProb | measured mean | sd   | min  | max
        //   0.9       | 0.94       | 93.90         | 1.08 | 91.4 | 97.1
        //   0.7       | 0.82       | 81.94         | 1.56 | 76.4 | 86.3
        //   0.5       | 0.70       | 70.00         | 2.03 | 64.8 | 75.0
        //   0.3       | 0.58       | 58.16         | 2.07 | 51.4 | 64.1
        //
        // Every row lands within 0.4pt of its own `octaveProb`. That agreement is the real
        // evidence the fix is right: the ONLY remaining miss is the roll itself declining,
        // which is the design. It also means this floor is now readable directly off the
        // engine's curve rather than off an empirical offset nobody could explain.
        //
        // Floor 0.90 sits 3.6σ below the design mean, and 1.4pt below the 300-run minimum
        // of 91.4 — so unlike the old 0.85 (which sat just INSIDE the lower tail and would
        // have failed ~1 unseeded run in 300) there is no healthy-run failure risk here.
        // It still catches an `octaveProb` drop to ~0.89 or below, and it catches a revert
        // of the anchor fix by a mile: under the directional metric the pre-#1271 engine
        // scores ~41% (209 of 512 pairs rose), not 88.8%.
        //
        // The PINNED run reports 91.6%, which is ≈2.1σ below that 93.90 mean — read the
        // two numbers together before suspecting a regression. Seed 0x1234 was chosen in
        // #1254 as near-mean under the OLD absolute metric and sits near the low end of
        // the new directional one; it is left alone because re-picking a seed to flatter a
        // number is how you end up anchoring a target to an RNG draw (the mistake #1254
        // was written to undo). Stream-shift risk is negligible regardless:
        // P(draw < 0.90) ≈ 4e-5.
        //
        // NO CEILING here, deliberately. `octaveProb = 0.4 + intensity * 0.6` reaches
        // exactly 1.0 at intensity 1.0, so the engine's own design says "alternate on
        // every upbeat" is correct at the top of the range — an upper bound asserting the
        // pump must MISS some upbeats would contradict the curve it is testing, and
        // relentlessness is the disco idiom besides. The "must redden in both directions"
        // property comes from the intensity-response test below, which is a real musical
        // claim and is immune to a level shift.
        expect(r.score).toBeGreaterThan(0.9);

        // #1271 — the two claims the old absolute metric could not make. Both are hard
        // equalities rather than bands because the anchor is now deterministic: it depends
        // only on the chord root's pitch class and the style's intensity-shifted center,
        // so there is nothing left to vary. Measured 0 inversions and 100.0% anchoring
        // across ~1,200 unseeded runs (~600k pairs) spanning intensities 0.3-0.9.
        //
        // These are the assertions that actually pin the fix. The rate above would still
        // read ~94% if the anchor drifted but happened to drift upward.
        expect(r.inversions).toBe(0);
        expect(r.illegalDeltas).toEqual([]);
        expect(r.lowRootOnBeat).toBe(1);
        // One anchor for the whole chord. Pre-#1271 the downbeat alternated between two
        // octaves (36 and 48 on a C chord) — the line wandered, and this would read 2.
        expect(r.distinctBeatMidis).toBe(1);
    });

    // #1271 review (P0) — the anchor must not move with LIVE intensity.
    //
    // Every other test in this file holds `bandIntensity` constant, and that is exactly
    // the blind spot the first draft of this fix shipped into. The anchor was chosen as
    // the candidate nearest `safeCenterMidi = 36 + floor(intensity * 7)` out of a
    // 23-semitone window, so it was a step function of live intensity: pitch classes with
    // two candidates in that window flipped a full octave at the boundary. The default-on
    // auto-conductor ramps `bandIntensity` roughly per step, so on an A root crossing
    // i = 4/7 a single beat produced `33 -> 57` (a 24-semitone leap) and the reverse
    // crossing `45 -> 45` (a unison) — this story's own defect, mid-bar and louder.
    //
    // A ramp is the only shape that can see it. Note the assertion is `illegalDeltas`,
    // not the rate and not `inversions`: neither of those artifacts is negative, and 32
    // damaged beats out of 512 barely dent a 94% rate.
    it('holds the anchor still while the conductor ramps intensity (#1271)', () => {
        // A, Gb, G and Ab are the roots whose anchor flipped under the old rule, at
        // i = 4/7, 1/7, 2/7 and 3/7 respectively. Sweep a ramp across all four boundaries.
        const roots = [
            ['A', 57],
            ['Gb', 54],
            ['G', 55],
            ['Ab', 56],
        ];
        for (const [name, rootMidi] of roots) {
            const perStep = [];
            // Rebuild the performance by hand: the shared harness fixes intensity for the
            // whole run, and the point here is that it must not.
            for (let bar = 0; bar < 24; bar++) {
                const intensity = 0.15 + (bar / 23) * 0.8; // sweeps every k/7 boundary
                perStep.push(
                    ...simulatePerformance(
                        1,
                        { playback: { bandIntensity: intensity, complexity: 0.5, bpm: 124 } },
                        rootMidi,
                    ).map((p) => p.note.midi),
                );
            }
            const distinct = [...new Set(perStep)].sort((a, b) => a - b);
            console.log(
                `[Disco Critique] ${name} root under an intensity ramp 0.15→0.95: ` +
                    `pitches used = ${distinct.join(', ')}`,
            );

            // The whole line, across the entire intensity range, uses exactly two
            // pitches: the anchor and its octave. Under the old center-relative rule this
            // read four (both anchors and both octaves).
            expect(distinct.length).toBe(2);
            expect(distinct[1] - distinct[0]).toBe(12);
            // ...and they are the comfort-range pair for that pitch class, not whichever
            // octave the ramp happened to be passing through.
            expect(distinct[0]).toBeGreaterThanOrEqual(28);
            expect(distinct[1]).toBeLessThanOrEqual(51);
        }
    });

    it('scales the octave pump with intensity — the octave emerges as energy builds', () => {
        // This is where "reddens in both directions" comes from (#1254), replacing an
        // upper bound on the high-intensity rate. The design is `octaveProb = 0.4 +
        // intensity * 0.6`, so the pump is meant to be a GRADIENT: present but sparse when
        // the band is laying back, relentless when it lifts. A fixed rate — at any level,
        // including a mechanically perfect 100% — fails this, which is precisely what a
        // ceiling on the high-intensity number cannot express.
        //
        // Measured means at 512 pairs (#1271, post-fix): i=0.3 → 58.16%, i=0.5 → 70.00%,
        // i=0.7 → 81.94%, i=0.9 → 93.90% — tracking `octaveProb` (0.58/0.70/0.82/0.94)
        // to within 0.4pt at every rung, with no offset left to explain. sd at this
        // sample is ~1.1-2.1%, so the ~36pt spread between the extremes is ~20σ.
        //
        // Deliberately asserted as a GAP rather than two absolute bands, which is why this
        // test needed no change through the anchor fix even though the fix moved every
        // level: what must not change is that the low end stays clearly below the high end.
        const low = scoreOctaveAlternation(
            simulatePerformance(128, {
                playback: { bandIntensity: 0.3, complexity: 0.5, bpm: 124 },
            }),
        );
        const high = scoreOctaveAlternation(
            simulatePerformance(128, {
                playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 },
            }),
        );

        console.log(
            `[Disco Critique] Octave pump vs intensity: i=0.3 → ${(low.score * 100).toFixed(1)}% ` +
                `(n=${low.checks}), i=0.9 → ${(high.score * 100).toFixed(1)}% (n=${high.checks}), ` +
                `gap ${((high.score - low.score) * 100).toFixed(1)}pt`,
        );

        // Sample integrity first — a collapsed n would make the gap meaningless.
        expect(low.checks).toBeGreaterThan(400);
        expect(high.checks).toBeGreaterThan(400);

        // Measured gap ~31pt. Floor of 15pt is ~7σ of headroom below it while still being
        // far more than any plausible re-levelling from the anchor fix would erase: the
        // design's own low-to-high span is 36pt (0.58 → 0.94), so a 15pt floor tolerates
        // the gradient being compressed by more than half before it complains.
        expect(high.score - low.score).toBeGreaterThan(0.15);
        // And the laid-back end must actually sound laid back — not the hook at full tilt.
        expect(low.score).toBeLessThan(0.75);
    });

    // #1271 — the anchor invariant, across every pitch class rather than the file's
    // habitual C. This is what makes the "Smart Octave Flipping" fold in the disco branch
    // (`bass-styles.ts`) unreachable, and it is the only honest way to cover that fold:
    // with the pair confined to the comfort range the overflow it guards cannot happen, so
    // no mutation of the fold itself can redden anything. Pinning its PRECONDITION instead
    // means a future change to the anchor's window gets caught here rather than silently
    // re-arming the inversion.
    //
    // The pair is asserted against the COMFORT range (28-51), not the absolute slot
    // (23-57), and the distinction is musical rather than pedantic. A review of the first
    // draft caught it sitting between the two: with the anchor window at `absMax - 12` the
    // E/F/Gb/G/Ab/A anchors put every upbeat at 52-57 — inside the chords/harmony slot —
    // so the octave stopped reading as a bass lift and started doubling the comper, on
    // ~94% of upbeats, forever. `should stay strictly within the bass spectral slot`
    // further down asserts 28-51 and passed only because it uses the default C root. The
    // two now agree. 52-57 is headroom for an occasional melodic fill, not somewhere to
    // park a genre's whole vocabulary.
    it.each([
        ['C', 48],
        ['Db', 49],
        ['D', 50],
        ['Eb', 51],
        ['E', 52],
        ['F', 53],
        ['Gb', 54],
        ['G', 55],
        ['Ab', 56],
        ['A', 57],
        ['Bb', 58],
        ['B', 59],
    ])('anchors the pump in-slot and upward on a %s root (#1271)', (name, rootMidi) => {
        const performance = simulatePerformance(
            32,
            { playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 } },
            rootMidi,
        );
        const r = scoreOctaveAlternation(performance);
        console.log(
            `[Disco Critique] ${name} root: anchor ${r.anchorMidi}, pump ${(r.score * 100).toFixed(1)}%, ` +
                `${r.inversions} inverted, ${r.distinctBeatMidis} distinct downbeat pitch(es)`,
        );

        // One fixed anchor, and the whole pair inside the bass comfort range — so the fold
        // never has to choose between overflowing and inverting, and the upbeat never
        // lands in the comper's register.
        expect(r.distinctBeatMidis).toBe(1);
        expect(r.anchorMidi + 12).toBeLessThanOrEqual(51);
        expect(r.anchorMidi).toBeGreaterThanOrEqual(28);
        expect(r.inversions).toBe(0);
        expect(r.illegalDeltas).toEqual([]);
        expect(r.lowRootOnBeat).toBe(1);
        // Pitch class is preserved — the anchor is this chord's root, not a nearby note.
        expect(r.anchorMidi % 12).toBe(rootMidi % 12);
        // And the pump still fires at the design rate in every key: no pitch class is
        // quietly getting a worse gesture because its anchor sits at the edge of the slot.
        expect(r.score).toBeGreaterThan(0.85);
    });

    // #1271 — the repeat-pass register shift has to move the PAIR, not one note.
    //
    // Imperfect Symmetry (`bass-engine.ts`) displaces one seeded beat per 4-bar phrase on
    // a section's second-and-later passes, so Verse 2 doesn't clone Verse 1. For an
    // ordinary line it displaces a single note and relies on the shift cascading through
    // `prevMidi`'s hand-position bonuses to migrate the rest of the phrase. A pump style
    // has no cascade by construction — the whole point of the fixed anchor — so a
    // single-note displacement would leave the upbeat computed from the anchor as it
    // stood, putting the shifted downbeat on its own upbeat's pitch: a unison, i.e. this
    // story's defect re-created by a second route. Measured 66 unisons/512 at occurrence 2
    // before the fix versus 60 at occurrence 1.
    //
    // The rest of this file runs at occurrence 1, where the whole mechanism is a no-op —
    // so without this test the pump path through Imperfect Symmetry would ship with no gate.
    it('keeps the pump intact through the repeat-pass register shift (#1271)', () => {
        const first = scoreOctaveAlternation(
            simulatePerformance(128, {
                playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 },
            }),
        );
        const repeat = scoreOctaveAlternation(
            simulatePerformance(
                128,
                { playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 } },
                48,
                { stepCoordination: { sectionOccurrence: 2 } },
            ),
        );
        console.log(
            `[Disco Critique] Repeat-pass shift: pass 1 → ${(first.score * 100).toFixed(1)}% pump, ` +
                `${first.distinctBeatMidis} anchor(s); pass 2 → ${(repeat.score * 100).toFixed(1)}% pump, ` +
                `${repeat.distinctBeatMidis} anchor(s), ${repeat.inversions} inverted`,
        );

        // The gesture fires: pass 2 uses a second register that pass 1 never touches. This
        // is the non-vacuity guard — if the pump path silently no-op'd (e.g. a headroom
        // test done in the comfort range, where 36 - 12 = 24 has none), pass 2 would be
        // byte-identical to pass 1 and the variation would be quietly gone for the genre.
        expect(first.distinctBeatMidis).toBe(1);
        expect(repeat.distinctBeatMidis).toBe(2);

        // ...and it fires as a register shift, not a jolt: exactly one octave, and every
        // displaced beat is still a pump.
        //
        // `illegalDeltas` is the assertion that catches the single-note variant, and it is
        // worth being precise about why, because an earlier draft credited `inversions`
        // and that was wrong. Displacing the downbeat alone gives delta 0 in the up
        // direction (36 → 48 against an "and" still at 48) and +24 in the down direction
        // (24 against 48). NEITHER is negative, so `inversions` stays 0 through the exact
        // bug this test exists to catch. The `+24` trips `illegalDeltas`; the delta-0 case
        // shows up in `score` (32 damaged beats of 512 → ~6pt, below the 0.90 floor).
        expect(repeat.illegalDeltas).toEqual([]);
        expect(repeat.inversions).toBe(0);
        // Rate holds through the shift — the displaced beats are not paying for it.
        expect(repeat.score).toBeGreaterThan(0.9);
    });

    it('should implement the "Gallop" (16th skips) at maximum complexity', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.95, complexity: 0.95, bpm: 124 },
        });

        const syncopatedHits = performance.filter((p) => p.info.mStep % 2 !== 0);
        console.log(`[Disco Critique] Syncopated (Gallop) Hits: ${syncopatedHits.length}`);

        // gallopProb-0.1 = intensity^2*0.4 + complexity*0.3 - 0.1 = 0.55 at max settings.
        // 128 possible 16th positions × 0.55 = ~70 expected.
        expect(syncopatedHits.length).toBeGreaterThan(50);
    });

    it('should stay strictly within the bass spectral slot (28-51)', () => {
        const performance = simulatePerformance(32, {
            playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 },
        });

        performance.forEach((p) => {
            expect(p.note.midi).toBeGreaterThanOrEqual(28);
            expect(p.note.midi).toBeLessThanOrEqual(51);
        });
    });

    it('should suppress the Gallop at low intensity', () => {
        // gallopProb-0.1 = intensity^2*0.4 + complexity*0.3 - 0.1.
        // At intensity 0.2, complexity 0.2: 0.016 + 0.06 - 0.1 = negative → 0 firings.
        // High vs low: dramatic density gap from 16th positions.
        const high = simulatePerformance(16, {
            playback: { bandIntensity: 0.95, complexity: 0.95, bpm: 124 },
        });
        const low = simulatePerformance(16, {
            playback: { bandIntensity: 0.2, complexity: 0.2, bpm: 124 },
        });
        const galloperCount = (perf) => perf.filter((p) => p.info.mStep % 2 !== 0).length;
        const highGallops = galloperCount(high);
        const lowGallops = galloperCount(low);
        console.log(`[Disco Critique] Gallop scaling: high=${highGallops} low=${lowGallops}`);
        expect(highGallops).toBeGreaterThan(50);
        expect(lowGallops).toBe(0);
    });
});
