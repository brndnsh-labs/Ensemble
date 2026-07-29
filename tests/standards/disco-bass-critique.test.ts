// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { DRUM_PRESETS } from '../../public/data/drum-presets.js';
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
    // Measured under the CURRENT metric at 512 pairs, 300 seeds: mean 93.95%, sd 1.05%
    // (two independent seed families — sequential 1..300 and 0x10000 + 7919n — agreed to
    // 0.02pt on the mean and 0.1pt on the sd). That tracks the 0.94 `octaveProb` exactly,
    // which is the post-#1271 picture; the full per-intensity table and the argument for
    // why the agreement is the evidence live at the Root-Octave test.
    //
    // Two generations of superseded figures used to sit here, and naming them is cheaper
    // than rediscovering why they don't apply: the pre-#1254 numbers (pooled 94.2%, ~40
    // pairs/run against a 0.80 floor) describe the old array-adjacency metric, and the
    // #1254-era numbers (mean 88.84%, sd 1.41%) describe the step-index metric run
    // against the pre-#1271 drifting anchor. That 5pt shortfall against `octaveProb` was
    // the anchor defect itself, not measurement noise, and #1271 fixed it.
    //
    // Seed choice (0x1234, not the shared 0xc0ffee default): under the old metric
    // 0xc0ffee drew a verified bottom-1% sample (29/34 = 85.3%), and #1254 had to
    // re-derive the band *from the pinned value* — anchoring a musical target to a
    // bottom-1% draw would have frozen RNG noise as the target. 0x1234 was picked as the
    // closest of twelve candidates to the mean UNDER THAT METRIC, and it is no longer a
    // near-mean pin: it draws 469/512 = 91.6%, ≈2.2σ BELOW the 93.95% mean and within
    // 4 pairs of the 300-seed minimum. Left alone deliberately. Every band it feeds is a
    // floor, so a low pin is the conservative side of the distribution, and re-picking a
    // seed to flatter a number is exactly the mistake #1254 was written to undo. Read it
    // as "a pessimistic but healthy draw", and don't re-derive a threshold from it
    // without checking the population figure above.
    //
    // Pinned at the describe level deliberately: `reseed()` mutates the handle's
    // persistent seed and `beforeEach` replays it, so a per-test `rng.reseed()` would
    // silently govern every *later* test in the file too — making three unrelated
    // critique tests' streams a function of test ordering.
    installSeededRandom(0x1234);

    /**
     * @param opts - #1276 shape knobs. Defaults reproduce the pre-#1276 harness exactly
     *   (one 4/4 bar-long major chord, repeated), so every older test is byte-unchanged.
     *   - `quality` — the chord quality string, for the altered-fifth sweep.
     *   - `roots` / `barsPerChord` — a real progression. `barsPerChord: 0.5` puts a chord
     *     change on beat 3 of every bar, which is the ONLY way to observe the drop's
     *     chord-entry guard: with one chord per bar every chord entry is also a bar's One
     *     and the two guards are indistinguishable.
     *   - `timeSignature` — for the compound-meter characterization case.
     */
    const simulatePerformance = (
        numBars,
        stateOverrides = {},
        rootMidi = 48,
        context = {},
        opts = {},
    ) => {
        const timeSignature = opts.timeSignature || '4/4';
        const tsConfig = TIME_SIGNATURES[timeSignature];
        const stepsPerBar = tsConfig.beats * tsConfig.stepsPerBeat;
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 124 },
            groove: {
                genreFeel: 'Disco',
                lastDrumPreset: 'Disco',
                instruments: [],
            },
            arranger: {
                timeSignature,
                totalSteps: numBars * stepsPerBar,
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const barsPerChord = opts.barsPerChord ?? 1;
        const stepsPerChord = Math.round(stepsPerBar * barsPerChord);
        const roots = opts.roots || [rootMidi];
        const chordAt = (chordIndex) => ({
            rootMidi: roots[chordIndex % roots.length],
            intervals: [0, 4, 7],
            quality: opts.quality || 'maj',
            beats: tsConfig.beats * barsPerChord,
            // #1271 — Imperfect Symmetry hashes the sectionId to pick its target beat, so
            // the occurrence-2 test below needs a stable non-empty one to be deterministic.
            sectionId: 'sec-1',
        });

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * stepsPerBar; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const chord = chordAt(Math.floor(globalStep / stepsPerChord));
            const stepInChord = globalStep % stepsPerChord;
            const active = isBassActive(getState(), 'disco', globalStep, stepInChord, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chord,
                    null,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'disco',
                    0,
                    globalStep,
                    stepInChord,
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
     *
     * #1276 — the legal vocabulary widens by ONE interval, +7, because the repeat-pass
     * `fifth` variation voices the beat's lift as a 5th instead of an octave. It is
     * counted separately as `fifthLifts` rather than folded into `octaveLifts`, and the
     * widening is bounded from two directions so it can't become a blanket loosening:
     * every occurrence-1 test asserts `fifthLifts === 0` (at occurrence 1 the whole
     * mechanism is a no-op, so a +7 there would be a drifted anchor — exactly what
     * `illegalDeltas` exists to catch), and the occurrence-2 tests assert at most one per
     * 4-bar phrase, the structural ceiling of a once-per-phrase gesture. That second bound
     * is a constraint the pre-#1276 test could not express at all, so the file gets
     * stronger here rather than looser.
     */
    const scoreOctaveAlternation = (performance) => {
        let octaveLifts = 0;
        let fifthLifts = 0;
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
            } else if (delta === 7) {
                // #1276 — the `fifth` variation's lift. Still a lift, still upward, still
                // built off the beat's own low root; only the interval changed.
                fifthLifts++;
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
            //
            // #1276 adds +7 to the legal set and nothing else. The three legal moves are
            // now the root repeat, the octave lift, and the once-per-phrase fifth lift;
            // the +24 leap, the drifted unison and the 7-semitone SLIP this check was
            // written to catch are all still illegal, because a slip would have to survive
            // the separate "at most one +7 per 4-bar phrase" bound to hide here.
            if (delta !== 0 && delta !== 12 && delta !== 7) {
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
            // #1276 — the pump's total lift rate: octave OR fifth. Identical to `score` at
            // occurrence 1 (where `fifthLifts` is 0 by construction), so every existing
            // occurrence-1 band still reads off `score` unchanged. The repeat-pass test
            // asserts on this instead, because the musical claim there is "the beat still
            // lifts off its low root", and the once-per-phrase fifth satisfies that — the
            // pump is not paying for the variation, it is expressing it.
            liftRate: (octaveLifts + fifthLifts) / (checks || 1),
            octaveLifts,
            fifthLifts,
            inversions,
            illegalDeltas,
            checks,
            andsNotPlayed,
            lowRootOnBeat,
            anchorMidi: lowestNote,
            distinctBeatMidis: new Set(beatMidis).size,
        };
    };

    /**
     * #1276 — classify what the repeat-pass variation actually DID, read off the rendered
     * performance alone.
     *
     * Deliberately empirical. Re-deriving the engine's target-beat hash or its menu draw
     * here would make the test a restatement of the implementation rather than a check on
     * it (docs/guides/musical-engine-patterns.md § Methodology, smell (a) — tautology). So
     * every kind is detected by an artifact that is STRUCTURALLY IMPOSSIBLE at
     * occurrence 1, which is also what makes the classifier non-vacuous:
     *
     *   drop   — a beat start with no note at all. At occurrence 1 disco emits on every
     *            single beat start without exception: `checkBassActiveStyle` returns true
     *            unconditionally for the style, and the disco branch's `isBeatStart` arm
     *            always fires.
     *   fifth  — a beat → "and" delta of exactly +7. The pump's only other legal moves are
     *            0 (the `octaveProb` roll declining) and +12.
     *   octave — a beat-start pitch away from the anchor. At occurrence 1 the anchor is a
     *            pure function of the chord root, so there is exactly one (asserted as
     *            `distinctBeatMidis === 1` throughout this file).
     *
     * The anchor is taken as the MODAL beat-start pitch, not the minimum: the variation
     * touches one beat per 4-bar phrase, so the un-displaced anchor is always the strict
     * majority, and a downward displacement would make `min` report the displaced pitch.
     *
     * KNOWN UNDER-COUNT, deliberately not repaired: `fifth` is detected as a beat → "and"
     * delta of +7, so it is invisible on the ~6-10% of target beats where the `octaveProb`
     * roll declines and the beat plays root → root with no upper note at all. Those phrases
     * classify as `'none'`. That is harmless for every assertion here (each one is either a
     * ceiling on fifths or a difference between two sequences, and an under-count can only
     * make both harder to pass) — but it does mean the PRINTED distribution under-reports
     * `fifth` by that margin. Don't read the report as evidence the draw is uniform, or as
     * a measurement of the 0.5/0.3/0.2 weighting; it is a floor on the fifth's share, not
     * an estimate of it.
     */
    const summarizeVariations = (performance, numBars, timeSignature = '4/4') => {
        const ts = TIME_SIGNATURES[timeSignature];
        const stepsPerBeat = ts.stepsPerBeat;
        const beatsPerPhrase = 4 * ts.beats; // one variation target beat per 4-bar phrase
        const byStep = new Map(performance.map((p) => [p.step, p]));
        const totalBeats = numBars * ts.beats;
        const beatCounts = new Map();
        for (let b = 0; b < totalBeats; b++) {
            const n = byStep.get(b * stepsPerBeat);
            if (n) {
                beatCounts.set(n.note.midi, (beatCounts.get(n.note.midi) || 0) + 1);
            }
        }
        const anchor = [...beatCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

        const kinds = new Set();
        const kindAtBeat = new Map();
        const dropped = [];
        const fifths = [];
        const shifted = [];
        for (let b = 0; b < totalBeats; b++) {
            const beat = byStep.get(b * stepsPerBeat);
            if (!beat) {
                kinds.add('drop');
                kindAtBeat.set(b, 'drop');
                dropped.push(b);
                continue;
            }
            if (beat.note.midi !== anchor) {
                kinds.add('octave');
                kindAtBeat.set(b, 'octave');
                shifted.push(b);
            }
            const and = byStep.get(b * stepsPerBeat + stepsPerBeat / 2);
            if (and && and.note.midi - beat.note.midi === 7) {
                kinds.add('fifth');
                kindAtBeat.set(b, 'fifth');
                fifths.push(b);
            }
        }

        // One entry per 4-bar phrase, in order — the SEQUENCE, which is what distinguishes
        // one occurrence from another. A union-of-kinds set cannot: pool four occurrences
        // and every one of them shows a mixture, so the union is 3 whether or not the
        // occurrences differ from each other at all.
        const phraseKinds = [];
        for (let ph = 0; ph * beatsPerPhrase < totalBeats; ph++) {
            let kind = 'none';
            for (let b = ph * beatsPerPhrase; b < (ph + 1) * beatsPerPhrase; b++) {
                if (kindAtBeat.has(b)) {
                    kind = kindAtBeat.get(b);
                }
            }
            phraseKinds.push(kind);
        }

        return {
            anchor,
            kinds: [...kinds].sort(),
            phraseKinds,
            // The phrase-relative positions the drops landed on. #1276's placement claim is
            // that this set has at most one member within an occurrence.
            dropBeatsInPhrase: [...new Set(dropped.map((b) => b % beatsPerPhrase))].sort(
                (a, b) => a - b,
            ),
            dropped,
            fifths,
            shifted,
            pitches: [...new Set(performance.map((p) => p.note.midi))].sort((a, b) => a - b),
        };
    };

    const PITCH_CLASSES = [
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
    ];

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
                `(${r.octaveLifts}/${r.checks} pairs up an octave; ${r.fifthLifts} up a 5th; ` +
                `${r.inversions} inverted; ` +
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
        // #1276 — the control on the widened `illegalDeltas` vocabulary. This run is at
        // occurrence 1 (the "Statement"), where Imperfect Symmetry is a no-op end to end,
        // so the +7 the delta check now tolerates must not appear even once. Without this
        // assertion, admitting +7 to the legal set would be a blanket loosening: a drifted
        // anchor landing a fifth away mid-beat would sail straight through the tightest
        // check in the file. intent: at occurrence 1 the only lift is the octave.
        expect(r.fifthLifts).toBe(0);
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
        // #1276 — both runs are at occurrence 1, where the repeat-pass variation is a no-op
        // end to end, so the +7 that `illegalDeltas` now tolerates must not appear at either
        // intensity. Part of making the "every occurrence-1 test asserts `fifthLifts === 0`"
        // claim at `scoreOctaveAlternation` literally true rather than mostly true.
        expect(low.fifthLifts).toBe(0);
        expect(high.fifthLifts).toBe(0);

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
    it.each(PITCH_CLASSES)(
        'anchors the pump in-slot and upward on a %s root (#1271)',
        (name, rootMidi) => {
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
            // #1276 — the per-key half of the widened-vocabulary control. Occurrence 1, so
            // no key may produce the fifth lift; if one did it would be a drifted anchor
            // wearing the new gesture's clothes. intent, not measured.
            expect(r.fifthLifts).toBe(0);
            // Pitch class is preserved — the anchor is this chord's root, not a nearby note.
            expect(r.anchorMidi % 12).toBe(rootMidi % 12);
            // And the pump still fires at the design rate in every key: no pitch class is
            // quietly getting a worse gesture because its anchor sits at the edge of the slot.
            expect(r.score).toBeGreaterThan(0.85);
        },
    );

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
    //
    // #1276 — the shift is now one of three outcomes on the target beat (drop / fifth /
    // octave), so this test keeps the same claim but reads it off the whole menu: the beat
    // varies, and whichever way it varies the pump survives the variation.
    it('keeps the pump intact through the repeat-pass variation (#1271, #1276)', () => {
        const BARS = 128;
        const PHRASES = BARS / 4; // one variation target beat per 4-bar phrase
        const first = simulatePerformance(BARS, {
            playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 },
        });
        const repeatPerf = simulatePerformance(
            BARS,
            { playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 } },
            48,
            { stepCoordination: { sectionOccurrence: 2 } },
        );
        const firstScore = scoreOctaveAlternation(first);
        const repeat = scoreOctaveAlternation(repeatPerf);
        const v = summarizeVariations(repeatPerf, BARS);
        console.log(
            `[Disco Critique] Repeat-pass variation: pass 1 → ${(firstScore.score * 100).toFixed(1)}% pump, ` +
                `${firstScore.distinctBeatMidis} anchor(s); pass 2 → ${(repeat.score * 100).toFixed(1)}% octave / ` +
                `${(repeat.liftRate * 100).toFixed(1)}% total lift, ${repeat.distinctBeatMidis} anchor(s), ` +
                `${repeat.inversions} inverted, ${repeat.fifthLifts} +7 lift(s) — kinds ` +
                `[${v.kinds.join(', ')}] over ${PHRASES} phrases: ${v.dropped.length} dropped ` +
                `beat(s), ${v.fifths.length} fifth beat(s), ${v.shifted.length} displaced beat(s)`,
        );

        // The gesture fires: pass 2 does things pass 1 structurally cannot. This is the
        // non-vacuity guard — if the pump path silently no-op'd (e.g. a headroom test done
        // in the comfort range, where 36 - 12 = 24 has none), pass 2 would be
        // indistinguishable from pass 1 and the variation would be quietly gone for the
        // genre. Two independent readings of that, because #1276 makes the octave shift
        // only one third of the menu: the anchor count (as in #1271) and the classifier.
        expect(firstScore.distinctBeatMidis).toBe(1);
        expect(repeat.distinctBeatMidis).toBe(2);
        expect(v.kinds.length).toBeGreaterThanOrEqual(2);
        // The occurrence-1 control for the widened `illegalDeltas` vocabulary, on this
        // test's own pass-1 run — completing the "every occurrence-1 test asserts
        // `fifthLifts === 0`" claim documented at `scoreOctaveAlternation`.
        expect(firstScore.fifthLifts).toBe(0);

        // ...and it fires as phrasing, not a jolt.
        //
        // `illegalDeltas` is the assertion that catches the single-note variant, and it is
        // worth being precise about why, because an earlier draft credited `inversions`
        // and that was wrong. Displacing the downbeat alone gives delta 0 in the up
        // direction (36 → 48 against an "and" still at 48) and +24 in the down direction
        // (24 against 48). NEITHER is negative, so `inversions` stays 0 through the exact
        // bug this test exists to catch. The `+24` trips `illegalDeltas`; the delta-0 case
        // shows up in `liftRate` (32 damaged beats of 512 → ~6pt, below the 0.90 floor).
        expect(repeat.illegalDeltas).toEqual([]);
        expect(repeat.inversions).toBe(0);

        // The +7 vocabulary widening, as a BAND rather than the structural ceiling. `<=
        // PHRASES` (32) is near-tautological against an observed 18 — the fifth can only
        // land on the phrase's one target beat, so that bound holds for any implementation,
        // including a menu degenerated to always-`fifth`.
        //
        // Both ends are derived, not guessed. RE-DERIVED for the #1276 follow-up that made
        // `isPumpTargetBeat` select only from non-One beats: the earlier band was centred on
        // 0.8 because occurrence 2's target used to land on a bar's One, where `drop` was
        // forbidden and the ladder routed its 0.3 into the fifth. With the One excluded from
        // the candidate set, every outcome is legal at every target this can pick, so the
        // fifth gets its own weight and nothing else — 0.5 × 32 = 16 phrases; observed 18
        // (32 phrases split 18 fifth / 8 drop / 6 octave against an expected 16 / 9.6 / 6.4).
        // A menu degenerated to always-`fifth` reads 32 (every phrase), MEASURED by
        // temporarily forcing the draw, so `< 29` catches it with 3 phrases of margin; a
        // fifth that never fires reads 0, so `> 8` catches that. Both ends sit ~2.8σ off the
        // observed value at binomial sd 2.83 — the value is deterministic, so the width is
        // there to tolerate a re-weighting, not sampling noise.
        //
        // The primary catcher for the degenerate menu is `distinctBeatMidis === 2` above
        // (always-`fifth` never displaces a beat, so it reads 1 — verified by the same
        // mutation). This band is a second, independent reading of the same failure.
        expect(repeat.fifthLifts).toBeGreaterThan(8);
        expect(repeat.fifthLifts).toBeLessThan(29);

        // Rate holds through the variation — the varied beats are not paying for it. Read
        // on `liftRate` (octave OR fifth) rather than `score`, because a fifth beat is a
        // lift that happens not to be an octave: scoring it as a miss would assert that
        // the new gesture must be rare, which is not the musical claim.
        expect(repeat.liftRate).toBeGreaterThan(0.9);
        // ...but the octave-only rate needs its own floor, or switching this guard to
        // `liftRate` would leave the pump proper unguarded: a `fifth` leaking past the one
        // target beat onto every upbeat keeps `liftRate` at ~1.0 while `score` goes to ~0.
        //
        // The floor is set from the gesture's structural worst case, not from the observed
        // number. The variation touches 32 of 512 pairs, so even if EVERY target beat were
        // a non-octave the rate could only fall from pass 1's 91.6% to ~85.4% (the
        // always-`fifth` mutation measured 87.9%). Observed here: 90.9%. 0.84 sits below
        // that structural bound and far above anything that would mean the pump broke.
        expect(repeat.score).toBeGreaterThan(0.84);
    });

    // #1276 acceptance 1 — the repeat-pass variation must fire on EVERY root.
    //
    // Bb is the reason this sweep exists, and it should be named rather than left to be
    // rediscovered. Under #1271's octave-only shift the Bb anchor (34) failed BOTH headroom
    // tests — 34 + 24 = 58 > absMax and 34 - 12 = 22 < absMin — so a pair displacement
    // needed a 36-semitone window inside a 34-semitone slot and Bb was provably the one
    // anchor that could never vary. Not at any intensity, not on any repeat, forever, while
    // the other eleven keys varied normally. Bb is a core disco/horn key. No rate and no
    // single-root test can see that failure: the Bb line stays perfectly healthy, it just
    // clones the Statement. Only a per-pitch-class sweep can.
    it.each(PITCH_CLASSES)('varies the repeat pass on a %s root (#1276)', (name, rootMidi) => {
        const BARS = 32;
        const settings = { playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 } };
        const statement = summarizeVariations(simulatePerformance(BARS, settings, rootMidi), BARS);
        const restatement = summarizeVariations(
            simulatePerformance(BARS, settings, rootMidi, {
                stepCoordination: { sectionOccurrence: 2 },
            }),
            BARS,
        );
        console.log(
            `[Disco Critique] ${name} repeat pass: anchor ${restatement.anchor}, ` +
                `kinds [${restatement.kinds.join(', ')}] — ${restatement.dropped.length} dropped, ` +
                `${restatement.fifths.length} fifth, ${restatement.shifted.length} displaced ` +
                `(occurrence 1 kinds [${statement.kinds.join(', ')}])`,
        );

        // The control, and the proof the classifier isn't just reading noise: at occurrence
        // 1 the mechanism is a no-op end to end, so none of the three artifacts can occur.
        expect(statement.kinds).toEqual([]);
        // ...and at occurrence 2 at least one does, for every root without exception.
        expect(restatement.kinds.length).toBeGreaterThanOrEqual(1);
    });

    // #1276 acceptance 2 — at least two distinguishable outcomes across repeats, so V4 ≠ V2
    // in KIND and not merely in which beat is affected.
    //
    // This is the assertion #1271 could not have passed. Its `symmetryDirection` hash branch
    // needed anchor ≤ 33 AND anchor ≥ 35 to be reachable, so every repeat of a section moved
    // the same direction and the only per-repeat variation was the target beat's position.
    // Classified from the rendered performance, never by asking the engine's chooser.
    //
    // The load-bearing assertion is the per-occurrence phrase-kind SEQUENCE comparison, not
    // the union of kinds. An earlier draft pooled occurrences 2-5 into one set and asserted
    // `size >= 2`, which never compared an occurrence to another: delete `sectionOccurrence`
    // from both the target-beat and the menu seed — making V2..V5 byte-identical, the exact
    // defect #1276 exists to fix — and each occurrence would still show a mixture of kinds,
    // the union would still be 3, and the assertion would still pass. Mutation-verified
    // against the sequence form: stripping `sectionOccurrence` reddens it in every root.
    it('gives every root at least two variation kinds across repeats (#1276)', () => {
        const BARS = 32;
        const PHRASES = BARS / 4;
        const settings = { playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 } };
        const rows = PITCH_CLASSES.map(([name, rootMidi]) => {
            const perOcc = [];
            for (let occ = 2; occ <= 5; occ++) {
                const perf = simulatePerformance(BARS, settings, rootMidi, {
                    stepCoordination: { sectionOccurrence: occ },
                });
                perOcc.push({
                    occ,
                    v: summarizeVariations(perf, BARS),
                    r: scoreOctaveAlternation(perf),
                });
            }
            const kinds = [...new Set(perOcc.flatMap((o) => o.v.kinds))].sort();
            return { name, kinds, perOcc };
        });

        console.log(
            `[Disco Critique] Variation kinds over occurrences 2-5 ` +
                `(phrase sequence, d=drop f=fifth o=octave n=none):\n  ` +
                rows
                    .map(
                        (row) =>
                            `${row.name}: {${row.kinds.join('|')}} ` +
                            `[${row.perOcc
                                .map(
                                    (o) => `V${o.occ}:${o.v.phraseKinds.map((k) => k[0]).join('')}`,
                                )
                                .join(' ')}]`,
                    )
                    .join('\n  '),
        );

        for (const row of rows) {
            // intent: two outcomes is the minimum that makes "V4 ≠ V2" a statement about
            // the gesture rather than about its placement. Bb reaches it on a two-item menu
            // (drop + fifth); every other root has three available.
            expect(row.kinds.length).toBeGreaterThanOrEqual(2);

            // ...and the actual "V4 ≠ V2" claim: each occurrence's per-phrase kind sequence
            // differs from every other occurrence's. This is what a byte-identical repeat
            // would fail. Compared pairwise rather than as a set size so the failure message
            // names the two occurrences that collided.
            for (let i = 0; i < row.perOcc.length; i++) {
                for (let j = i + 1; j < row.perOcc.length; j++) {
                    const a = row.perOcc[i];
                    const b = row.perOcc[j];
                    expect(
                        a.v.phraseKinds.join(','),
                        `${row.name}: V${a.occ} and V${b.occ} play the identical phrase sequence`,
                    ).not.toEqual(b.v.phraseKinds.join(','));
                }
            }

            for (const { occ, v, r } of row.perOcc) {
                const where = `${row.name} V${occ}`;
                // #1271's invariants, held through every variation (acceptance 3).
                expect(r.illegalDeltas, where).toEqual([]);
                expect(r.inversions, where).toBe(0);
                // The fifth stays a once-per-phrase gesture in every key.
                expect(r.fifthLifts, where).toBeLessThanOrEqual(PHRASES);

                // The line's whole vocabulary, stated as a set. Anything the varied line
                // plays is the anchor, its octave, the fifth above the anchor, or the
                // displaced pair — nothing else, in any key, on any repeat.
                //
                // Acceptance 3 asks for "every sounding note inside 28-51" and that is
                // true of the unvaried line and of the `fifth` variation by construction
                // (`baseRoot + 7 <= 46`), but NOT of the `octave` variation, which #1271
                // deliberately measures against the ABSOLUTE slot: at anchor 36 the
                // octave-down thump lands on 24, five semitones below comfortMin, and a
                // comfort-range headroom test would leave the whole genre with no gesture
                // at all. So the hard bound asserted here is the bass register slot
                // (23-57), plus an explicit check that the ONLY thing ever outside 28-51
                // is that one displaced pair. Widening the comfort exception any further
                // would need re-opening #1271's headroom argument.
                const allowed = new Set([
                    v.anchor - 12,
                    v.anchor,
                    v.anchor + 7,
                    v.anchor + 12,
                    v.anchor + 24,
                ]);
                for (const midi of v.pitches) {
                    expect(midi, `${where} register slot`).toBeGreaterThanOrEqual(23);
                    expect(midi, `${where} register slot`).toBeLessThanOrEqual(57);
                    expect(allowed.has(midi), `${where} plays ${midi}`).toBe(true);
                    if (midi < 28 || midi > 51) {
                        expect(
                            midi === v.anchor - 12 || midi === v.anchor + 24,
                            `${where}: ${midi} is outside comfort and is not the displaced pair`,
                        ).toBe(true);
                    }
                }
            }
        }
    });

    // #1276 acceptance 4 — a dropped beat must read as a hole, not as a dropout.
    //
    // The distinction is whether the kit still marks the spot. In 4/4 disco's kick is strict
    // 4-on-the-floor on BOTH drum paths, so every beat the bass can drop carries a kick and
    // the listener hears the bassist laying out rather than the track losing its footing:
    //   - the preset (`DRUM_PRESETS.Disco.Kick`), asserted below;
    //   - the groove strategy (`grooves/disco.ts`), whose Kick lane is `shouldPlay =
    //     isBeatStart` and THEN `if (shouldPlay && !compoundKickAllowed(context))
    //     shouldPlay = false`. That filter is a no-op in 4/4 — which is what makes the
    //     4/4 guarantee below exact — but NOT in compound meter; see the characterization
    //     case at the end of this test.
    // Asserted against the preset data rather than described in prose so that thinning the
    // disco kick lane later reddens THIS test, which is where the musical dependency lives.
    //
    // Swept across occurrences rather than pinned to one. #1276 made the target beat
    // occurrence-stable, so at this test's 32 bars (8 phrases) an occurrence can draw
    // `fifth`/`octave` in all eight and contribute no dropped beat at all — occurrence 2 is
    // one such. A single-occurrence version would assert nothing.
    it('keeps the kit marking every beat the bass can drop (#1276)', () => {
        const kick = DRUM_PRESETS.Disco.Kick;
        const BARS = 32;
        const settings = { playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 } };
        const droppedBeats = [];
        for (let occ = 2; occ <= 9; occ++) {
            const v = summarizeVariations(
                simulatePerformance(BARS, settings, 48, {
                    stepCoordination: { sectionOccurrence: occ },
                }),
                BARS,
            );
            droppedBeats.push(...v.dropped);
        }
        const uncovered = droppedBeats.filter((beat) => !(kick[(beat % 4) * 4] > 0));
        console.log(
            `[Disco Critique] Dropped beats over occurrences 2-9: ${droppedBeats.length}; ` +
                `disco kick lane [${kick.join('')}] covers ` +
                `${droppedBeats.length - uncovered.length}`,
        );

        // Non-vacuity: a drop has to actually happen, or this asserts nothing.
        expect(droppedBeats.length).toBeGreaterThan(0);
        // Every beat position in the bar is kicked, so no drop can ever land in a gap.
        expect([0, 1, 2, 3].filter((b) => kick[b * 4] > 0)).toEqual([0, 1, 2, 3]);
        expect(uncovered).toEqual([]);
    });

    // #1276 — CHARACTERIZATION, not a guarantee. In 6/8 the kit's coverage of the dropped
    // beat is only partial, and that is recorded here rather than fixed.
    //
    // `grooves/disco.ts`'s Kick lane is `isBeatStart` filtered by `compoundKickAllowed`,
    // which in 6/8 keeps the two dotted-quarter pulses (beats 0 and 3) plus — above
    // intensity 0.7 only — the last eighth of each group (beats 2 and 5). Beats 1 and 4 are
    // never kicked. The bass's target beat ranges over all six, so a dropped beat CAN land
    // where the kick was trimmed and the hole goes unmarked.
    //
    // Deliberately no engine veto: disco-in-6/8 is already an unusual reinterpretation (see
    // that lane's own comment), the bass gesture is not what makes it unusual, and a
    // meter-specific veto in the bass would encode a drum-lane detail in the wrong engine.
    // This test exists so the limit is measured rather than assumed — if a future change
    // makes 6/8 drops land only on kicked beats, this test reddens and should be promoted
    // from characterization to guarantee.
    it('characterizes the compound-meter gap in drop coverage (#1276)', () => {
        const BARS = 24;
        const settings = { playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 } };
        // Beats the 6/8 kick lane reaches at intensity > 0.7: the two pulses (0, 3) and the
        // `stepInGroup === groupSteps - 2` eighth of each group (2, 5).
        const KICKED_BEATS_6_8 = [0, 2, 3, 5];
        // why: 2-40, not the 2-9 an earlier draft used. Only beats 1 and 4 are unmarked, and
        // the selection now draws from five candidates per bar rather than six, so a short
        // sweep can miss both by luck and read the gap as closed — 2-9 did exactly that.
        const OCCURRENCES = 40;
        const dropBeatsInBar = new Set();
        for (let occ = 2; occ <= OCCURRENCES; occ++) {
            const v = summarizeVariations(
                simulatePerformance(
                    BARS,
                    settings,
                    48,
                    { stepCoordination: { sectionOccurrence: occ } },
                    { timeSignature: '6/8' },
                ),
                BARS,
                '6/8',
            );
            for (const beat of v.dropped) {
                dropBeatsInBar.add(beat % 6);
            }
        }
        const positions = [...dropBeatsInBar].sort((a, b) => a - b);
        const unmarkedPositions = positions.filter((b) => !KICKED_BEATS_6_8.includes(b));
        console.log(
            `[Disco Critique] 6/8 drop positions in bar over occurrences 2-${OCCURRENCES}: ` +
                `[${positions.join(', ')}] — unmarked by the trimmed compound kick: ` +
                `[${unmarkedPositions.join(', ')}]`,
        );

        // The gesture still fires in compound meter — it is not silently meter-gated off.
        expect(positions.length).toBeGreaterThan(0);
        // It still never claims the bar's One, which is the guard that does hold in every
        // meter (it is a beat-index test, not a kick-lane test).
        expect(positions).not.toContain(0);
        // ...and the recorded current behavior: at least one drop lands on a beat the
        // compound kick filter trimmed. Asserted rather than logged so the characterization
        // can't silently rot into a false claim.
        expect(unmarkedPositions.length).toBeGreaterThan(0);
    });

    // #1276 — the bar's One is off limits to the whole gesture, and that is enforced at
    // SELECTION, one level above the drop's own legality tests.
    //
    // Variation lives off the One: in four-on-the-floor that beat is where kick, bass and
    // comp lock, so it is the wrong place to re-voice, displace or remove the bass. Stating
    // it as a candidate-set restriction rather than as a per-gesture veto is not a
    // refactor, it is the fix for a real hole — the target beat is stable for a whole
    // occurrence, so a veto at the gesture level meant that any occurrence whose target
    // landed on a One had EVERY `drop` draw degrade through the ladder and the entire
    // repeat pass lost the headline gesture. Measured: verse 2 produced no dropped beat in
    // any of the twelve keys.
    //
    // So this test asserts the placement claim directly — over a wide occurrence sweep, the
    // target beat is never a bar One — which is both stronger than the old
    // "a bar-One target produces 0 drops" formulation and, unlike it, still reachable.
    //
    // The chord-entry claim stays a LEGALITY test, because it depends on the chart rather
    // than on beat position: a chord can enter mid-bar, on a beat the selection is free to
    // pick. It needs HALF-BAR chords to be visible at all — they put a chord entry on every
    // even beat of the phrase, so beats {2, 6, 10, 14} are chord entries that are not bar
    // Ones and the chord-entry term is the only thing protecting them. (The file's default
    // single unchanging chord cannot see this: with one chord per bar every chord entry is
    // also a bar's One, so the term is indistinguishable from the placement rule and a test
    // built on that harness passes on an engine that never implemented it.)
    //
    // The same beats under TWO-BAR chords are the control: there they are ordinary free
    // beats and do drop, which is what proves the half-bar zeros are the guard and not a
    // beat that simply never gets picked.
    //
    // Deliberately one-sided: a hole on the LAST beat before a chord change or a section
    // boundary is musically good (it is the breath into the new harmony), so there is no
    // symmetric window and this test asserts nothing about the beat before an arrival.
    it('never targets a bar One, and never drops a chord entry (#1276)', () => {
        const BARS = 32;
        const PHRASE_BEATS = 16;
        const BEATS_PER_BAR = 4;
        const CHORD_ENTRY_ONLY = [2, 6, 10, 14]; // chord entries under half-bar chords
        const SELECTION_OCCURRENCES = 200;
        const settings = { playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 } };

        const sweep = (barsPerChord) => {
            const rows = [];
            for (let occ = 2; occ <= 40; occ++) {
                const v = summarizeVariations(
                    simulatePerformance(
                        BARS,
                        settings,
                        48,
                        { stepCoordination: { sectionOccurrence: occ } },
                        // ii-V-I-vi, so consecutive chords have different roots.
                        { roots: [48, 53, 55, 50], barsPerChord },
                    ),
                    BARS,
                );
                // The occurrence's target beat, read off the ROOT-INDEPENDENT artifacts
                // only. `shifted`/`kinds` compare beat pitches against one modal anchor and
                // are meaningless under a progression — every chord has its own anchor — so
                // they are deliberately excluded here. A drop and a +7 lift are both
                // root-independent.
                const targets = [
                    ...new Set([...v.dropped, ...v.fifths].map((b) => b % PHRASE_BEATS)),
                ];
                rows.push({
                    occ,
                    target: targets.length === 1 ? targets[0] : null,
                    drops: v.dropped.length,
                });
            }
            return rows;
        };

        // --- The placement rule, read off the selection itself ---
        // Single unchanging chord, so all THREE artifacts are root-independent here and the
        // target beat is readable on every occurrence no matter which gesture the phrase
        // drew. Wide sweep because the claim is about the candidate SET: 199 occurrences
        // over 12 legal positions is enough to assert full coverage as well as the
        // exclusion, and coverage is what proves the sweep explores the space rather than
        // an engine that happens to freeze on one safe beat.
        const selectionTargets = [];
        for (let occ = 2; occ <= SELECTION_OCCURRENCES; occ++) {
            const v = summarizeVariations(
                simulatePerformance(BARS, settings, 48, {
                    stepCoordination: { sectionOccurrence: occ },
                }),
                BARS,
            );
            const targets = [
                ...new Set([...v.dropped, ...v.fifths, ...v.shifted].map((b) => b % PHRASE_BEATS)),
            ];
            selectionTargets.push({ occ, target: targets.length === 1 ? targets[0] : null });
        }
        const onBarOne = selectionTargets.filter(
            (r) => r.target !== null && r.target % BEATS_PER_BAR === 0,
        );
        const covered = [...new Set(selectionTargets.map((r) => r.target))].sort((a, b) => a - b);

        const half = sweep(0.5);
        const twoBar = sweep(2);
        const pick = (rows, beats) => rows.filter((r) => beats.includes(r.target));
        const halfOnEntry = pick(half, CHORD_ENTRY_ONLY);
        const twoBarOnEntryBeats = pick(twoBar, CHORD_ENTRY_ONLY);

        console.log(
            `[Disco Critique] Target beat over occurrences 2-${SELECTION_OCCURRENCES}: ` +
                `positions used [${covered.join(',')}], ${onBarOne.length} on a bar One — ` +
                `drop legality over occurrences 2-40: half-bar chords, target on a mid-bar ` +
                `CHORD ENTRY (${halfOnEntry.length} occurrences): ` +
                `${halfOnEntry.reduce((n, r) => n + r.drops, 0)} drops; two-bar chords, same ` +
                `beats but now free (${twoBarOnEntryBeats.length}): ` +
                `${twoBarOnEntryBeats.reduce((n, r) => n + r.drops, 0)} drops`,
        );

        // Sample integrity: the target beat has to be readable, and each bucket populated.
        expect(selectionTargets.filter((r) => r.target === null)).toEqual([]);
        expect(half.filter((r) => r.target === null)).toEqual([]);
        expect(twoBar.filter((r) => r.target === null)).toEqual([]);
        expect(halfOnEntry.length).toBeGreaterThanOrEqual(5);
        expect(twoBarOnEntryBeats.length).toBeGreaterThanOrEqual(5);

        // The placement rule: no occurrence ever aims the gesture at a bar's One...
        expect(
            onBarOne.map((r) => `V${r.occ}@${r.target}`),
            'the pump targeted a bar One',
        ).toEqual([]);
        // ...and the exclusion is exactly that — every one of the 12 non-One beats of the
        // 4-bar phrase is still reachable, so the rule narrows the candidate set rather than
        // collapsing it. Written as the full expected set, not a count, so a selection that
        // lost (say) every bar-3 position reddens with a readable diff.
        expect(covered).toEqual([1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15]);

        // A chord entry is never silenced...
        for (const r of halfOnEntry) {
            expect(r.drops, `V${r.occ} dropped a chord entry (beat ${r.target})`).toBe(0);
        }
        // The control that zero needs: those very beats DO drop when nothing protects them.
        expect(twoBarOnEntryBeats.reduce((n, r) => n + r.drops, 0)).toBeGreaterThan(5);
    });

    // #1276 — the section-entrance term, isolated. It is kept separate from `isDownbeat` in
    // the engine because a section can begin MID-BAR, and that is the only configuration in
    // which it does independent work — so it is the only configuration worth testing.
    //
    // Probed with the engine rather than by re-deriving the target-beat hash: run each
    // occurrence with no `sectionStart` in context to find the ones whose target beat is
    // beat 1 of bar 0, then re-run exactly those with `sectionStart` pointing at that beat
    // (step 4) and require the entrance back. The first loop doubles as the non-vacuity
    // check — if it finds nothing, the second asserts nothing.
    it('never silences a mid-bar section entrance (#1276)', () => {
        const BARS = 32;
        // why: the "guard is surgical" re-run needs a LONG occurrence — 128 bars is 32
        // phrases, so "some later phrase still drops" is near-certain (0.7^31 ≈ 5e-6) at the
        // 0.3 drop weight. At 32 bars it is 8 phrases and 0.7^7 ≈ 8%, which is exactly how
        // occurrence 96 came up with zero drops and reddened a claim that is true.
        const GUARDED_BARS = 128;
        const ENTRANCE_STEP = 4; // beat 1 of bar 0 — a section beginning mid-bar
        const OCCURRENCES = 200;
        const settings = { playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 } };
        const wouldDropEntrance = [];
        for (let occ = 2; occ <= OCCURRENCES; occ++) {
            const unguarded = simulatePerformance(BARS, settings, 48, {
                stepCoordination: { sectionOccurrence: occ },
            });
            if (!unguarded.some((p) => p.step === ENTRANCE_STEP)) {
                wouldDropEntrance.push(occ);
            }
        }
        console.log(
            `[Disco Critique] Mid-bar section-entrance guard: occurrences that would drop ` +
                `step ${ENTRANCE_STEP} = [${wouldDropEntrance.join(', ')}] of 2-${OCCURRENCES}`,
        );

        // The sweep is wide because the COINCIDENCE is rare, not because the guard is:
        // silencing this entrance needs the occurrence's target beat to be beat 1 of bar 0
        // (1 in 12, since the selection only draws from the phrase's non-One beats) AND
        // phrase 0's menu draw to be `drop` (0.3), so it lands on ~2% of occurrences. A
        // narrow sweep passes vacuously — 2-40 found exactly one.
        expect(wouldDropEntrance.length).toBeGreaterThan(2);
        for (const occ of wouldDropEntrance) {
            const guarded = simulatePerformance(GUARDED_BARS, settings, 48, {
                sectionStart: ENTRANCE_STEP,
                stepCoordination: { sectionOccurrence: occ },
            });
            // The entrance sounds...
            expect(
                guarded.some((p) => p.step === ENTRANCE_STEP),
                `occurrence ${occ} silenced the mid-bar section entrance`,
            ).toBe(true);
            // ...and the guard is surgical: it protects that ONE beat, it does not disarm
            // the gesture for the whole occurrence. Later phrases still drop their target
            // beat, because only phrase 0's target beat owns the section start.
            const v = summarizeVariations(guarded, GUARDED_BARS);
            expect(v.kinds.length, `occurrence ${occ}`).toBeGreaterThanOrEqual(1);
            expect(v.dropped.length, `occurrence ${occ} lost every drop`).toBeGreaterThan(0);
        }
    });

    // #1276 (P0 review) — the `fifth` variation must never fire on a chord whose fifth is
    // altered.
    //
    // `fifth` voices the pump's lift as `baseRoot + 7`, a natural 5. On a dim7 / m7b5 / aug
    // / 7alt the chord's fifth is ♭5 or ♯5, so the bass would grind a semitone against the
    // comper on an accented upbeat. This is the first chord-quality-dependent pitch the pump
    // has ever produced — `pumpAnchorFor` and `baseRoot + 12` are root-and-octave and
    // therefore quality-agnostic — so the whole family needs its own gate.
    //
    // Reachability is not hypothetical: `chord-presets.ts` ships `#IVdim7`, `iim7b5`,
    // `V7alt` and `bIIIdim7`, and genre is independent of preset, so any of them can play
    // at Disco.
    //
    // Two-sided by construction: `maj` and `7b9` (both natural-fifth qualities) run through
    // the identical sweep and MUST produce fifths, or the altered rows would be proving
    // nothing but that the sweep is broken.
    it.each([
        ['dim7', false],
        ['m7b5', false],
        ['aug', false],
        ['7alt', false],
        ['maj', true],
        ['7b9', true],
    ])('fires the fifth only where the chord has one — %s (#1276)', (quality, hasFifth) => {
        const BARS = 32;
        const settings = { playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 } };
        let fifthLifts = 0;
        let varied = 0;
        const illegalDeltas = [];
        for (let occ = 2; occ <= 6; occ++) {
            const perf = simulatePerformance(
                BARS,
                settings,
                48,
                { stepCoordination: { sectionOccurrence: occ } },
                { quality },
            );
            const r = scoreOctaveAlternation(perf);
            const v = summarizeVariations(perf, BARS);
            fifthLifts += r.fifthLifts;
            varied += v.dropped.length + v.shifted.length + v.fifths.length;
            illegalDeltas.push(...r.illegalDeltas);
        }
        console.log(
            `[Disco Critique] Quality ${quality} over occurrences 2-6: ${fifthLifts} fifth ` +
                `lift(s), ${varied} varied beat(s), ${illegalDeltas.length} illegal delta(s)`,
        );

        if (hasFifth) {
            expect(fifthLifts).toBeGreaterThan(0);
        } else {
            // No natural 5 anywhere in the line, on any repeat.
            expect(fifthLifts).toBe(0);
            // ...and the beat still varies some other way — the ladder substitutes, it does
            // not silently turn the repeat back into the Statement.
            expect(varied).toBeGreaterThan(0);
        }
        // The rest of the pump's vocabulary is unchanged in every quality.
        expect(illegalDeltas).toEqual([]);
    });

    // #1276 (P1 review) — the hole has to be part of the RIFF, not scatter.
    //
    // A beat-long rest is real disco vocabulary, but on every record where it works the hole
    // recurs at the same phrase-relative position bar after bar, so the ear learns it and
    // hears the next downbeat land into an expected shape. Under the pre-review draft the
    // target beat was seeded on `phraseIndex` too, so it moved every 4 bars — measured
    // beat-in-phrase over 128 bars: 3, 6, 8, 8, 11, 12, 13, 13, 13, 3, 3. Against a texture
    // whose identity is relentless eighth-note motion, one hole per 4 bars at a different
    // spot each time reads as the bassist losing the thread.
    //
    // So: placement is CONSTANT within an occurrence and DIFFERENT across occurrences —
    // placement is what distinguishes the repeats, and the per-phrase menu draw is what
    // keeps each repeat internally alive.
    it('keeps the hole in the same place all occurrence long (#1276)', () => {
        const BARS = 128;
        const settings = { playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 } };
        const rows = [];
        for (let occ = 2; occ <= 9; occ++) {
            const v = summarizeVariations(
                simulatePerformance(BARS, settings, 48, {
                    stepCoordination: { sectionOccurrence: occ },
                }),
                BARS,
            );
            rows.push({ occ, positions: v.dropBeatsInPhrase, count: v.dropped.length });
        }
        console.log(
            `[Disco Critique] Drop placement per occurrence (beat-in-phrase, 0-15): ` +
                rows.map((r) => `V${r.occ}:[${r.positions.join(',')}]×${r.count}`).join(' '),
        );

        for (const row of rows) {
            // EXACTLY one position per occurrence, which is two claims in one `toBe`:
            //
            //   ≤ 1 — every drop in an occurrence lands on the SAME beat of its phrase. The
            //         assertion the scattered draft could not pass; it produced up to 11
            //         distinct positions in one occurrence.
            //   ≥ 1 — every occurrence drops SOMEWHERE. Tightened from the earlier
            //         "more than 3 of the 8 occurrences drop" once the target beat stopped
            //         being able to land on a bar's One: with the One in the candidate set,
            //         an occurrence that drew it lost every `drop` to the ladder for its
            //         whole repeat pass, and verse 2 — the first repeat a listener actually
            //         hears — was measured with zero holes in all twelve keys while the
            //         story's whole premise is that the repeat pass has one. Every outcome
            //         is legal at every beat the selection can now produce, so with 32
            //         phrases at a 0.3 drop weight an occurrence with no hole is a defect,
            //         not a draw (0.7^32 ≈ 1e-5).
            expect(row.positions.length, `V${row.occ} has ${row.count} drops`).toBe(1);
        }

        // The other half of the claim: the occurrences don't all pick the same beat —
        // otherwise "constant within an occurrence" would be satisfied by a gesture that
        // never varies at all.
        expect(new Set(rows.map((r) => r.positions[0])).size).toBeGreaterThan(3);
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
