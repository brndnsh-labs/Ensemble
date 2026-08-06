// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { DRUM_PRESETS } from '../../public/data/drum-presets.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import {
    BASS_VELOCITY_DOMAIN_MAX,
    bassVelocityToAmplitude,
} from '../../public/engine/velocity-shaping.js';
import { getState } from '../../public/state.js';
import { getFrequency, getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Funk Bass Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.9, bpm: 110, complexity: 0.8 },
            groove: { genreFeel: 'Funk', pocket: 0, instruments: [] },
            soloist: makeSoloistMock({ busySteps: 0 }),
            arranger: { timeSignature: '4/4', totalSteps: numBars * 16 },
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const chordC = { rootMidi: 48, quality: '7', beats: 4, intervals: [0, 4, 7, 10] };
        const tsConfig = TIME_SIGNATURES['4/4'];
        const performance = [];
        let lastMidi = null;

        for (let i = 0; i < numBars * 16; i++) {
            const stepInMeasure = i % 16;
            // Build full stepInfo so engine lanes that read isBackbeat/isOffbeat/mStep fire,
            // not the 4/4-only fallback formulas (smell (e) fix; aligns with funk-drummer fix).
            const info = getStepInfo(i, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(getState(), 'smart', i, stepInMeasure, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    lastMidi ? getFrequency(lastMidi) : 440,
                    48,
                    'smart',
                    0,
                    i,
                    stepInMeasure,
                    {},
                    info,
                );

                if (note) {
                    performance.push({ step: i, stepInMeasure, info, note, chord: chordC });
                    lastMidi = note.midi;
                }
            }
        }
        return performance;
    };

    /**
     * Slap-pop rate: of every beat whose "and" carries a pop, how often does the pop land
     * an octave ABOVE that beat's own slapped root?
     *
     * #1277 — this replaces an adjacency-based, non-directional counter that stacked the
     * three ways of being loose that #1254 and #1271 had already corrected on the disco side:
     *
     *   1. NON-DIRECTIONAL. `Math.abs(midi - prevMidi) === 12` scored a pop an octave
     *      BELOW the prior note identically to one above. The pop is the bright upper
     *      snap of the slap idiom — the low root is the floor of the groove and the pop
     *      is the lift off it, not an interchangeable pair. Direction is the gesture.
     *   2. `|| interval === 24` admitted a two-octave leap as a healthy pop. That is the
     *      precise artifact a drifting register anchor produces (#1271 measured a 33 -> 57
     *      under a conductor ramp), so the old metric scored the defect as the feature.
     *   3. ADJACENCY, NOT STEP INDEX. Pairing against `prevMidi` — whatever note happened
     *      to play last — measured chuck-to-chuck and gallop-to-gallop intervals as
     *      "octave pops" and never once asked whether a given beat's own pop rose off its
     *      own root. It is the same flaw #1254 corrected for disco.
     *
     * The pop is looked up BY STEP INDEX from the beat it belongs to: the engine fires it
     * at `stepInBeat === stepsPerBeat / 2` (`bass-styles.ts`, the funk `popProb` ladder),
     * so its root is the note at that beat's own downbeat step. A beat whose downbeat is
     * unplayed has no root to rise off and is counted in `beatsNotPlayed` rather than
     * silently dropped — the funk engine plays nothing at all on the downbeats of beats 2
     * and 4 (it slaps beat 1 and beat 3), so roughly half of all pops are legitimately left
     * unpaired, and a collapse in the sample size must not be able to masquerade as a
     * healthy score.
     *
     * `unisons` and `inversions` are returned separately rather than folded into a miss
     * count, because they are different engine failures: a unison means the pop never
     * lifted, an inversion means it lifted downward. Both are invisible to a rate alone.
     */
    const scoreOctavePops = (performance, tsConfig) => {
        const spb = tsConfig.stepsPerBeat;
        const popOffset = Math.floor(spb / 2);
        const byStep = new Map(performance.map((p) => [p.step, p]));

        let octavePops = 0;
        let inversions = 0;
        let unisons = 0;
        let checks = 0;
        let beatsNotPlayed = 0;
        let pops = 0;
        const illegalDeltas = [];

        performance.forEach((p) => {
            if (p.step % spb !== popOffset) {
                return;
            }
            pops++;
            const beat = byStep.get(p.step - popOffset);
            if (!beat) {
                beatsNotPlayed++;
                return;
            }
            checks++;
            const delta = p.note.midi - beat.note.midi;
            if (delta === 12) {
                octavePops++;
            } else if (delta === 0) {
                unisons++;
            } else if (delta < 0) {
                inversions++;
            }
            // The vocabulary check, and the tightest assertion in this file. A slap-pop
            // has exactly one legal move off its root — up an octave — and exactly two
            // legal ways to fail it: not lift (0) or lift the wrong way (-12). ANYTHING
            // else, above all the +-24 leap the old metric explicitly counted as a pass,
            // means the register anchor moved between the two steps of a single beat.
            // That is the class of bug a rate cannot see, because a drifted-unison and a
            // 24-semitone leap both leave a high rate barely dented.
            if (delta !== 12 && delta !== 0 && delta !== -12) {
                illegalDeltas.push(`step${p.step}:${beat.note.midi}->${p.note.midi}`);
            }
        });

        return {
            octavePops,
            inversions,
            unisons,
            illegalDeltas,
            checks,
            beatsNotPlayed,
            pops,
            liftRate: octavePops / (checks || 1),
            inversionRate: inversions / (checks || 1),
        };
    };

    /**
     * #1312 — the sibling gesture to `scoreOctavePops`: the high-complexity 16th-note
     * "a" pop (`stepInBeat === 3`, gated on `playback.complexity > 0.7`, the
     * "Syncopated Pushes & Gallops" section of the funk `popProb` ladder in
     * `bass-styles.ts`). Structurally invisible to `scoreOctavePops`, which only ever
     * samples `stepInBeat === stepsPerBeat / 2` (the "and") — nothing in this suite
     * previously exercised the "a" at all.
     *
     * `stepInBeat === 3` is shared by THREE competing branches (the high-complexity
     * pop itself, the dead-note "chuck" ghost, and the melodic hammer-on), so unlike
     * `scoreOctavePops` this can't isolate the pop by step index alone — pairing every
     * note at that step against the previous one measured the ghost/hammer-on notes
     * too and produced a false "drifts to +2" reading (#1312 investigation). Isolate
     * by OUTPUT SHAPE instead of replicating the internal `scrambleHash` gate (which
     * would silently stop matching if the seed formula in bass-styles.ts ever
     * changes): the pop is the only one of the three that is both unmuted (the chuck
     * always sets `muted: 1`) and lands exactly on the chord root's pitch class (the
     * hammer-on always lands a 2nd above it).
     *
     * MEASURED (#1312, 128-bar sweep, intensity 0.9, complexity 0.8): 233 qualifying
     * pops, 0 inversions, 0 illegal (non {0, +12}) deltas — the vocabulary is clean;
     * this gesture's headroom fallback (`note > absMax ? baseRoot : note`) genuinely
     * cannot invert, exactly as the issue predicted. But only 30/233 (12.9%) actually
     * LIFT the octave — 203/233 (87.1%) land as an inert UNISON. `baseRoot` here is an
     * independent `normalizeToRange` resolution gravitating toward `safeCenterMidi`
     * (~42-48 at this intensity), which frequently sits AT the pitch the pop would
     * need to rise FROM, so `baseRoot + 12` clears `absMax` (57) and folds back to a
     * no-op. KNOWN GAP, NOT fixed by this story: simulating #1295's anchor-to-
     * `prevMidi` fix against these same recordings reproduces an IDENTICAL 30/203
     * split — the defect is a register-HEADROOM problem (nothing upstream reserves
     * room for this pop's lift, unlike bass-engine.ts's `safeBaseRoot` fold that
     * reserves room for the downbeat -> "and"-pop relationship), not an
     * anchor-computation one, so reusing #1295's fix shape verbatim is a no-op here.
     * A real fix needs a headroom-reservation companion for whatever fires
     * immediately before the "a" (three different possible predecessors), which is a
     * design decision beyond this story's scope — tracked as a follow-up, not
     * papered over here. This test guards the vocabulary/direction health that IS
     * true today (never inverts, never drifts to an illegal interval), per
     * feedback_dod_test_skip_smell the lift-rate itself is reported for visibility
     * only and not gated — asserting today's ~13% lift rate as a target would
     * calcify the known gap instead of flagging it for the follow-up fix.
     */
    const scoreAPop = (performance, tsConfig) => {
        const spb = tsConfig.stepsPerBeat;
        let checks = 0;
        let octaveUp = 0;
        let unison = 0;
        let inversions = 0;
        let firedAtStep = 0;
        const illegalDeltas = [];

        performance.forEach((p, idx) => {
            if (p.stepInMeasure % spb !== 3) {
                return;
            }
            firedAtStep++;
            const rootPc = ((p.chord.rootMidi % 12) + 12) % 12;
            const midiPc = ((p.note.midi % 12) + 12) % 12;
            const isChuckGhost = p.note.muted === 1;
            const isAPop = !isChuckGhost && midiPc === rootPc;
            if (!isAPop) {
                return;
            }
            const prevEntry = performance[idx - 1];
            if (!prevEntry) {
                return;
            }
            checks++;
            const prevMidi = prevEntry.note.midi;
            const anchorBase = Math.floor(prevMidi / 12) * 12;
            const anchorRoot = [anchorBase - 12, anchorBase, anchorBase + 12]
                .map((o) => o + rootPc)
                .reduce((best, c) =>
                    Math.abs(c - prevMidi) < Math.abs(best - prevMidi) ? c : best,
                );
            const delta = p.note.midi - anchorRoot;
            if (delta === 12) {
                octaveUp++;
            } else if (delta === 0) {
                unison++;
            } else if (delta < 0) {
                inversions++;
            }
            if (delta !== 12 && delta !== 0 && delta !== -12) {
                illegalDeltas.push(`step${p.step}:${prevMidi}->${p.note.midi}`);
            }
        });

        return {
            checks,
            octaveUp,
            unison,
            inversions,
            illegalDeltas,
            firedAtStep,
            liftRate: octaveUp / (checks || 1),
            inversionRate: inversions / (checks || 1),
        };
    };

    it('funk "a" 16th high-complexity pop: vocabulary/direction guard (#1312)', () => {
        const performance = simulatePerformance(128, {
            playback: { bandIntensity: 0.9, bpm: 110, complexity: 0.8 },
        });
        const r = scoreAPop(performance, TIME_SIGNATURES['4/4']);

        console.log(
            '\n--- FUNK "A" POP CRITIQUE REPORT (#1312) ---\n' +
                `[A-Pop Vocabulary]      ${r.illegalDeltas.length} illegal deltas (Target: 0)\n` +
                `[A-Pop Direction]       ${(r.inversionRate * 100).toFixed(1)}% inverted (Target: 0%)\n` +
                `[A-Pop Lift Direction]  ${(r.liftRate * 100).toFixed(1)}% up an octave, ${r.unison} unison ` +
                `(${r.octaveUp}/${r.checks} pairs) — KNOWN GAP #1312, reported only, not gated\n` +
                '------------------------------------\n',
        );

        // Non-vacuous: confirm the high-complexity branch actually fired enough
        // times in this sweep for the vocabulary guard below to mean something.
        expect(r.checks).toBeGreaterThan(50); // measured 233/128 bars

        // Vocabulary/direction health — this IS true today and is the regression
        // guard: no illegal interval, never inverted. This is what would have
        // caught the #1295-class bug (inconsistent/inverted interval) had it
        // existed here; it doesn't, but the lift-rate gap above is real and
        // deliberately left unasserted (see block comment above).
        expect(r.illegalDeltas).toEqual([]);
        expect(r.inversionRate).toBe(0);
    });

    it('should pass an authenticity critique for a 128-bar Funk performance', () => {
        const totalMeasures = 128;
        const performance = simulatePerformance(totalMeasures);

        let ghostNotes = 0;
        let downbeatHits = 0;
        const downbeatMidiValues = new Set();

        performance.forEach((p) => {
            const midi = p.note.midi;
            if (p.stepInMeasure === 0) {
                downbeatHits++;
                downbeatMidiValues.add(midi);
                expect(midi % 12).toBe(p.chord.rootMidi % 12);
            }
            if (p.note.muted) {
                ghostNotes++;
            }
        });

        const totalActive = performance.length;
        const downbeatRatio = downbeatHits / totalMeasures;
        const ghostRatio = ghostNotes / totalActive;
        const r = scoreOctavePops(performance, TIME_SIGNATURES['4/4']);
        const popsPerBar = r.pops / totalMeasures;

        console.log(
            '\n--- FUNK BASS CRITIQUE REPORT ---\n' +
                `[The One Solidity]      ${(downbeatRatio * 100).toFixed(1)}% (Target: 100%)\n` +
                `[Ghost Note Density]    ${(ghostRatio * 100).toFixed(1)}% (Target: 16-28%)\n` +
                `[Pop Density]           ${popsPerBar.toFixed(2)} pops/bar of 4 possible (Target: >2.5)\n` +
                `[Pop Lift Direction]    ${(r.liftRate * 100).toFixed(1)}% up an octave, ` +
                `${(r.inversionRate * 100).toFixed(1)}% INVERTED, ${r.unisons} unison ` +
                `(${r.octavePops}/${r.checks} pairs; ${r.beatsNotPlayed} pops off an unplayed beat)\n` +
                `[Pop Vocabulary]        ${r.illegalDeltas.length} illegal deltas (Target: 0)\n` +
                '------------------------------------\n',
        );

        // The One: deterministic root on every bar downbeat (per bass-engine.ts:439, 509)
        expect(downbeatRatio).toBe(1.0); // intent: the downbeat is deterministically the chord root — an engine guarantee, not a measured tendency

        // #1295 regression guard: the downbeat's OCTAVE must still vary across a long
        // performance. An earlier version of the #1295 fix folded `withOctaveJump`'s
        // output (rather than its input) to reserve pop headroom, which silently
        // cancelled every Imperfect Symmetry structural jump for funk — measured
        // 128/128 downbeats collapsing onto one fixed pitch, caught only by review,
        // not by this file. Register-class (pitch class) is checked above; this
        // checks the register itself hasn't gone rigid.
        expect(downbeatMidiValues.size).toBeGreaterThan(1); // measured 2 (MIDI 36 x122, 48 x6)
        // Ghost density: engine fires chuckProb = 0.2 + intensity*0.4 = 0.56 on 16th offbeats.
        // #1277 — re-measured. This path is fully seeded (`scrambleHash`), so there is one
        // exact figure rather than a range: 24.76% (311/1256 notes). The previous
        // "17.5-19.7% across 10 runs" comment predates the seeding and understated the
        // real value by ~5pt, which mattered — it advertised ~8pt of headroom under the
        // 0.28 ceiling when the true margin is 3.2pt. Left as-is rather than tightened again:
        // the band is still correct, and moving a ghost-density bound is a musical call
        // that belongs with a story about ghost density, not with an octave-metric fix.
        expect(ghostRatio).toBeGreaterThan(0.15); // measured 24.76%; floor 0.15 sits 9.8pt below
        expect(ghostRatio).toBeLessThan(0.28); // measured 24.76%; ceiling 0.28 leaves 3.2pt above

        // Pop density — the half of the old ">2.5" claim that was always sound. The engine
        // fires popProb = 0.6 + intensity*0.4 = 0.96 on the 4 "ands" of each bar, so a
        // healthy line pops on nearly every one. Measured 2.99/bar (383/512 "ands"); the
        // shortfall from 4.0 is `isBassActive` gating the step, not the ladder declining.
        // This path is fully seeded (`scrambleHash`), so the figure is exact, not a range —
        // the old "3.38-3.76 across 10 runs" comment predates the seeding and was stale.
        expect(popsPerBar).toBeGreaterThan(2.5); // measured 2.99/bar; floor leaves ~0.49/bar headroom

        // Vocabulary: no anchor movement inside a single beat. Measured 0 illegal deltas —
        // every beat->pop pair in the sweep is exactly 0 or +-12. Note this means the old
        // metric's `|| interval === 24` admission was catching nothing in funk anyway;
        // dropping it costs no coverage and closes the door the disco line walked through.
        expect(r.illegalDeltas).toEqual([]);

        // ---------------------------------------------------------------------------
        // DIRECTION — the real musical targets (#1295), not a regression ratchet.
        //
        // #1295 fixed the anchor: the pop now resolves off the beat's own ACTUAL
        // slapped root (nearest occurrence of the chord root's pitch class around
        // `prevMidi`, immune to an intervening chuck/hammer-on) plus 12, instead of a
        // fresh independent `normalizeToRange` resolution — one resolution, not two.
        // The companion half of the fix is in `bass-engine.ts`: the funk downbeat
        // itself (the `stepInChord === 0` early return that actually emits it, ahead
        // of `getBassNoteStyle`) now folds `baseRoot` down an octave BEFORE
        // `withOctaveJump` runs, when `normalizeToRange`'s own register drift
        // wouldn't leave the pop room to lift under `absMax` — a real player picks
        // the lower hand position on beat 1 knowing the pop follows. Folding
        // `withOctaveJump`'s own OUTPUT instead of its input was tried first and
        // rejected in review: it silently cancelled every Imperfect Symmetry
        // structural jump for funk (measured: 128/128 downbeats collapsed to one
        // fixed pitch on a 128-bar sweep). Folding the input instead leaves
        // `withOctaveJump`'s own headroom-aware direction logic free to fire — on
        // the rare bar (~5% here) where it still lands the downbeat too high, the
        // pop's own `note > absMax ? slappedRoot : note` fallback holds a unison
        // rather than an inversion. Net: a 128-bar sweep went from 68.9% inverted /
        // 31.1% lifted to 0% inverted / 98.0% lifted (192/196), with genuine
        // downbeat register variety preserved (measured 122×MIDI36, 6×MIDI48) and
        // zero illegal deltas.
        expect(r.inversionRate).toBe(0); // measured 0/196 — acceptance #1: never inverted
        expect(r.liftRate).toBeGreaterThan(0.9); // measured 192/196 (98.0%)
    });

    it('should suppress octave pops at low intensity', () => {
        // At intensity < 0.4 the rock/funk no-kick branch (bass-engine.ts:444-456)
        // returns null 60% of the time on non-downbeats and ghosts the rest, so the
        // engine should no longer fire the pop-prob ladder.
        const highPerf = simulatePerformance(32, {
            playback: { bandIntensity: 0.9, bpm: 110, complexity: 0.8 },
        });
        const lowPerf = simulatePerformance(32, {
            playback: { bandIntensity: 0.3, bpm: 110, complexity: 0.3 },
        });

        // #1277 — scored with the same directional, step-indexed metric as the sweep
        // above. The old adjacency counter answered "how many +-12 or +-24 steps does
        // this line contain", which at low intensity is dominated by whether the line is
        // playing at all rather than by whether the pop ladder fired; the directional
        // form asks the actual question, "did a beat's pop rise an octave off its root",
        // and separates the two ways low intensity can look quiet.
        const ts44 = TIME_SIGNATURES['4/4'];
        const high = scoreOctavePops(highPerf, ts44);
        const low = scoreOctavePops(lowPerf, ts44);
        const ratio = low.octavePops === 0 ? Infinity : high.octavePops / low.octavePops;
        console.log(
            `[Funk Intensity Scaling] octave pops high=${high.octavePops}/${high.checks} ` +
                `low=${low.octavePops}/${low.checks} ratio=${ratio.toFixed(2)} ` +
                `(low unisons=${low.unisons}, low pops fired=${low.pops})`,
        );

        // High intensity: essentially every paired beat lifts post-#1295 — measured
        // 52/52 over 32 bars in this run, 0 inversions (the sweep above's
        // inversionRate === 0 holds here too).
        expect(high.octavePops).toBeGreaterThan(10); // measured 52 over 32 bars
        // Low intensity suppression is now almost entirely a DENSITY effect, not a
        // direction one: below ~0.4 the rock/funk no-kick branch (bass-engine.ts,
        // `intensity < 0.4 && !isDownbeat`) returns null on most non-downbeats via a
        // deliberately unseeded `Math.random()` (#1083 — per-loop variety is the
        // point there), so this branch's exact counts vary run-to-run (typically
        // single digits for both `checks` and `octavePops`). Of the few pops that do
        // fire, #1295 means most still lift correctly rather than collapsing to a
        // unison the way the pre-#1295 anchor bug did at this register. The ratio
        // bound below holds with wide margin across runs because the density drop
        // alone is enough to clear it — it is no longer evidence of a direction defect.
        expect(low.octavePops).toBeLessThanOrEqual(high.octavePops / 3);
    });

    it('lifts at moderate intensity instead of collapsing to unisons (#1295 acceptance #2)', () => {
        // Pre-#1295, moderate intensity (0.4-0.6) was the WORST band, not a middle
        // ground: the register geometry at that band made the double-resolution bug
        // land almost every pop back on the downbeat's own pitch — measured 2/166
        // genuine lifts at intensity 0.5 in the original report, a near-total
        // collapse the high/low-intensity comparison above can't see (it only
        // samples the endpoints). This is the dedicated regression guard for that
        // middle band.
        const ts44 = TIME_SIGNATURES['4/4'];
        for (const bandIntensity of [0.4, 0.5, 0.6]) {
            const perf = simulatePerformance(64, {
                playback: { bandIntensity, bpm: 110, complexity: 0.5 },
            });
            const r = scoreOctavePops(perf, ts44);
            console.log(
                `[Funk Moderate-Intensity Lift] intensity=${bandIntensity} ` +
                    `lift=${r.octavePops}/${r.checks} unisons=${r.unisons} inversions=${r.inversions}`,
            );
            expect(r.inversionRate).toBe(0);
            // Measured 100% lift at all three sampled points post-#1295; headroom
            // below that guards against a false pass from a near-empty sample.
            expect(r.liftRate).toBeGreaterThan(0.8);
        }
    });

    // --- Rendered dynamics (#1331) -----------------------------------------
    //
    // Every OTHER bass velocity assertion in `tests/standards/` measures
    // engine-side `note.velocity` — which sits UPSTREAM of both the engine's
    // emission clamp and the synth voice's amplitude curve. That is how the bass
    // shipped dynamically flat for a whole release cycle while the critique suite
    // stayed green: the engine emitted a healthy accent hierarchy that
    // `playBassNoteNew`'s `sqrt(min(1, velocity))` then erased before it reached
    // a speaker. These assertions pipe the engine's real output through
    // `bassVelocityToAmplitude` — the live voice's own law — so they measure what
    // a listener actually hears.
    //
    // dB throughout, because that is the unit the musical claim is in: ~1 dB is
    // roughly the JND for a low-register tone inside a mix.
    const dB = (ratio) => 20 * Math.log10(ratio);
    // The band-wide swell gain `scheduler-core.ts` multiplies onto every bass
    // note between the engine and the voice — `applyConductor` in `conductor.ts`,
    // running every step because `autoIntensity` is ON by default. It is part of
    // the rendered chain, so a rendered-dynamics test that skipped it would be
    // measuring a signal path no listener ever hears. (Per-note humanize —
    // `velSpread` 0.1 — also multiplies in live; it is omitted here because it is
    // ±10% seeded jitter AROUND each level, not a level of its own.)
    const conductorGain = (bandIntensity) => 0.7 + bandIntensity * 0.45;
    const renderedFullNotes = (perf, bandIntensity) =>
        perf
            .map((p) => p.note.velocity)
            // why: ghost/chuck notes (authored 0.2-0.5) are a separate dynamic
            // layer, not part of the base-vs-accent hierarchy under test. 0.8
            // sits in the empty gap between the two populations at every
            // intensity (measured: ghosts top out ~0.79, full notes start ~1.01).
            .filter((v) => v >= 0.8)
            .map((v) => bassVelocityToAmplitude(v * conductorGain(bandIntensity)));

    it('renders the authored velocity vocabulary as audibly distinct levels (#1331 acceptance 4a)', () => {
        // The three tokens a bass style may author: 1.0 base, 1.15 odd-beat
        // accent, 1.25 funk slap. Pre-#1331 all three rendered at EXACTLY 1.0
        // (the unity clamp), so the vocabulary existed only on paper.
        const base = bassVelocityToAmplitude(1.0);
        const accent = bassVelocityToAmplitude(1.15);
        const slap = bassVelocityToAmplitude(1.25);
        const ceiling = bassVelocityToAmplitude(1.5);
        console.log(
            `[#1331 Rendered Vocabulary] base=${base.toFixed(4)} accent=${accent.toFixed(4)} ` +
                `slap=${slap.toFixed(4)} ceiling=${ceiling.toFixed(4)} | ` +
                `accent=+${dB(accent / base).toFixed(2)}dB slap=+${dB(slap / base).toFixed(2)}dB ` +
                `ceiling=+${dB(ceiling / base).toFixed(2)}dB (was +0.00dB for all three)`,
        );

        expect(base).toBeLessThan(accent);
        expect(accent).toBeLessThan(slap);
        expect(slap).toBeLessThan(ceiling);
        // intent: the accent must clear the ~1 dB JND ; measured +1.09 dB ; floor 1.0.
        expect(dB(accent / base)).toBeGreaterThanOrEqual(1.0);
        // intent: the slap reads as the loudest thing in the bar ; measured +1.74 dB ; floor 1.5.
        expect(dB(slap / base)).toBeGreaterThanOrEqual(1.5);
        // NOTE: adjacent 1.15 -> 1.25 is only +0.65 dB and cannot reach 1 dB under
        // ANY compressive law — the authored tokens are 0.72 dB apart even at
        // perfect linearity, and widening them is out of scope (1.25 is the
        // authoring ceiling, acceptance 1). The base->accent step is the JND claim
        // the finding actually rests on.
    });

    it('keeps the accent hierarchy alive at chorus intensity (#1331 acceptance 4a, engine path)', () => {
        // The headline symptom: at i=0.9 the engine's emission clamp put EVERY
        // full note on the 1.25 rail, so the whole bar rendered at one identical
        // amplitude — measured 1 distinct level, 0.00 dB of spread.
        const chorus = renderedFullNotes(
            simulatePerformance(8, { playback: { bandIntensity: 0.9, bpm: 110, complexity: 0.8 } }),
            0.9,
        );
        const verse = renderedFullNotes(
            simulatePerformance(8, { playback: { bandIntensity: 0.3, bpm: 110, complexity: 0.8 } }),
            0.3,
        );
        const spread = dB(Math.max(...chorus) / Math.min(...chorus));
        const levelCounts = new Map();
        for (const v of chorus) {
            const key = v.toFixed(4);
            levelCounts.set(key, (levelCounts.get(key) ?? 0) + 1);
        }
        const levels = levelCounts.size;
        // why: `levels`/`spread` alone are extrema-only — satisfied by a
        // handful of outliers even if the bulk of the bar collapses onto one
        // rail (measured: this exact shape, 50/62 notes on one level, before
        // this assertion existed — the review that found it is #1331's own
        // patch round). `modalShare` is the fraction of full notes sharing the
        // single most common rendered level — the metric that actually detects
        // "the bar plays at one dynamic," regardless of how many outliers exist.
        const modalCount = Math.max(...levelCounts.values());
        const modalShare = modalCount / chorus.length;
        console.log(
            `[#1331 Chorus Hierarchy] i=0.9 n=${chorus.length} levels=${levels} ` +
                `spread=${spread.toFixed(2)}dB modalShare=${(modalShare * 100).toFixed(0)}% ` +
                `(was 1 level / 0.00dB / 100%) | ` +
                `i=0.3 spread=${dB(Math.max(...verse) / Math.min(...verse)).toFixed(2)}dB`,
        );

        expect(chorus.length).toBeGreaterThan(20);
        // intent: base / accent / ceiling all survive as separate levels ;
        // measured 5 levels post-#1342 (was 3), deterministic across 30 runs ;
        // floor 4 — ratcheted with the measurement (#942 review: the modalShare
        // ceiling below was ratcheted on the same improvement, and leaving this
        // floor at the stale pre-#1342 value while moving that one was an
        // inconsistent policy; 1 level of headroom against the deterministic 5).
        expect(levels).toBeGreaterThanOrEqual(4);
        // intent: the bar's dynamic contrast clears the JND ; measured 1.37 dB ; floor 1.0 (37% headroom).
        expect(spread).toBeGreaterThanOrEqual(1.0);
        // intent: no single rendered level dominates the bar ; measured 71%
        // post-#1342, down from 81% — dropping funk's generic backbeat accent
        // took a ×1.15 off the notes that were pinning hardest to the domain
        // ceiling, so two more rendered levels came back. Funk's slap+intensity
        // product still rails at i≳0.83 (#1336, untouched). Non-regression
        // ratchet moved 85% -> 78% with the measurement (7pt headroom; the old
        // pair ran 4pt — #942 review corrected an earlier draft that claimed
        // "same margin"). Target once #1336 lands is ≤50% — tighten
        // again then, don't just watch the log line.
        expect(modalShare).toBeLessThanOrEqual(0.78);
        // NOT asserted: acceptance 4c ("accent/base ratio at i=0.9 >= at i=0.3").
        // It is not reachable from this fix and the residual causes are both
        // explicitly out of scope. At i=0.9 the intensity term alone is 1.23, so
        // funk's slap (authored 1.25 + intensity*0.2 = 1.43) reaches the domain
        // ceiling at a product of ~2.0 and still rails — that is #1334 (the slap's
        // own intensity term) and #1336 (three stacked intensity multiplications).
        // The i=0.3 spread is also unstable run-to-run (0.36-2.06 dB measured over
        // 30 runs, pre-conductor-gain) because the ghost-note lane is
        // probabilistic, so a comparison against it would be a flaky assertion
        // even if the engine allowed it.
        // Both numbers are logged above so the regression stays visible.
        //
        // Honest cost of #1342, stated rather than buried (#942 review): the
        // backbeat accent it removed was carrying the only above-JND full-note
        // contrast in the VERSE — post-fix the i=0.3 spread runs ~0.6-0.8 dB,
        // one dynamic level to a listener, separated by the metric envelope
        // alone. Right trade (it was WRONG contrast — a rock 2&4 lift on a funk
        // line), but the completion is widening funk's own authored ladder at
        // low intensity, tracked as #947. Watch the i=0.3 log line above until
        // that lands.
    });

    it('swells the bass with the band instead of flattening (#1331 acceptance 4b)', () => {
        // The macro swell, measured on the bar downbeat — the one note every
        // intensity plays. Pre-#1331 the rendered downbeat was FLAT from i=0.4
        // upward (mutation-tested: exactly 1.000 at every intensity from 0.4 to
        // 1.0, even with the conductor gain applied — the unity clamp ate that
        // too): the conductor drove the band harder and the bass did not move.
        const ramp = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((bandIntensity) => {
            const perf = simulatePerformance(8, {
                playback: { bandIntensity, bpm: 110, complexity: 0.8 },
            });
            const downbeats = perf
                .filter((p) => p.stepInMeasure === 0)
                .map((p) =>
                    bassVelocityToAmplitude(p.note.velocity * conductorGain(bandIntensity)),
                );
            return downbeats.reduce((s, v) => s + v, 0) / downbeats.length;
        });
        console.log(
            `[#1331 Macro Swell] downbeat amplitude 0.1->1.0: ${ramp
                .map((v) => v.toFixed(3))
                .join(
                    ' ',
                )} | total=+${dB(ramp[9] / ramp[0]).toFixed(2)}dB (was +1.84dB, flat from i=0.4)`,
        );

        // intent: NO flat region anywhere as the band swells ; strictly increasing
        // at all ten points, deterministic across 30 runs. Funk's slap token does
        // still hit the engine's emission ceiling around i≈0.8 (the residual
        // stacked intensity terms, #1336) — the ramp keeps climbing past it only
        // because `conductorVelocity` is applied downstream of that clamp, which
        // is also why `bassVelocityToAmplitude` must not re-clamp at the domain max.
        for (let i = 1; i < ramp.length; i++) {
            expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
        }
        // intent: the swell is audible, not a rounding artifact ; measured +6.10 dB ; floor 5.0.
        expect(dB(ramp[9] / ramp[0])).toBeGreaterThanOrEqual(5.0);
    });

    // --- #1334: funk downbeat slap responds to intensity -------------------
    //
    // "The One" (the bar downbeat) had a FLAT velocityParam (`BASS_AUTHORING_
    // CEILING`, no intensity term) while its own sibling gesture — the
    // secondary slap on beat 3 — already scaled with intensity via
    // `bass-styles.ts`'s `slapVel`. The fix gives it the same slope as
    // `popVel` (`BASS_AUTHORING_CEILING + intensity*0.2`), sitting 0.05 above
    // the secondary slap so The One stays the louder of the two.
    //
    // NOTE ON SCOPE (re-derived from the issue, and corrected again during
    // review — read this before touching the assertions below):
    //
    // The issue's acceptance criterion asked for the downbeat to show +3 to
    // +5dB of RENDERED separation over "the rest of the bar," WIDENING from
    // verse (i=0.3) to chorus (i=0.9). Measured directly against the actual
    // full rest-of-bar population (every other full note in the bar, not
    // just the pop): separation is real at low intensity (~2.1-2.5dB) but
    // NARROWS toward chorus (~1.3dB) — i.e. acceptance 1's primary clause
    // (sep(0.9) >= sep(0.3)) is NOT met, and this fix does not meaningfully
    // change that (pre-fix ~2.14dB->1.31dB, post-fix ~2.17dB->1.31dB). Two
    // separate, verified reasons, neither fixable by retuning this one
    // literal:
    //   1. At i>=0.7, this term and `popVel` both saturate
    //      `BASS_VELOCITY_DOMAIN_MAX` and render IDENTICALLY regardless of
    //      either one's own slope — a structural ceiling (#1336's territory).
    //   2. Below that ceiling, funk was not in `EVEN_ACCENT_BASS_STYLES`
    //      (#1335 deliberately left it accented), so the pop (odd `intBeat`)
    //      still carried the +15% backbeat accent The One (even `intBeat`)
    //      doesn't — measured: the pop was actually LOUDER than The One from
    //      i~0.1 to i~0.65. RESOLVED BY #1342 (funk now opts out of the
    //      generic accent via `GESTURE_ACCENT_BASS_STYLES`); the dominance
    //      sweep at the bottom of this file is that fix's gate.
    //
    // What IS real, testable, and asserted below: this fix makes the
    // downbeat measurably louder through the verse->chorus BUILD (i=0.4-0.7,
    // before the ceiling saturates everything), where pre-fix it was making
    // no independent contribution at all. That is a genuine, if modest,
    // improvement. It was NOT, on its own, "The One is now the loudest thing
    // in the bar" — that claim only became true once #1342 landed, and it is
    // asserted there, not here.
    const meanOf = (arr) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
    const theOneAmplitude = (bandIntensity) => {
        const perf = simulatePerformance(32, {
            playback: { bandIntensity, bpm: 110, complexity: 0.8 },
        });
        const gain = conductorGain(bandIntensity);
        const theOne = perf
            .filter((p) => p.stepInMeasure === 0)
            .map((p) => bassVelocityToAmplitude(p.note.velocity * gain));
        return { mean: meanOf(theOne), n: theOne.length };
    };

    it('funk downbeat slap gets louder through the verse->chorus build (#1334)', () => {
        const buildIntensities = [0.4, 0.5, 0.6, 0.7];
        const results = buildIntensities.map((bi) => ({ bi, ...theOneAmplitude(bi) }));

        console.log(
            [
                '',
                '--- #1334 FUNK "THE ONE" BUILD AMPLITUDE ---',
                ...results.map((r) => `[i=${r.bi}]  n=${r.n}  amplitude=${r.mean.toFixed(4)}`),
                '-------------------------------------------------------',
            ].join('\n'),
        );

        for (const r of results) {
            expect(r.n).toBeGreaterThan(20);
        }
        // intent: strictly increasing through the build — the downbeat must
        // keep climbing as the band lifts, not plateau. This alone doesn't
        // distinguish the fix from pre-fix behavior (intensityFactor/
        // bassEnvelope already gave every note SOME growth) — the mutation
        // check below does that.
        for (let i = 1; i < results.length; i++) {
            expect(results[i].mean).toBeGreaterThan(results[i - 1].mean);
        }
        // intent: the mutation check — reconstructs what the OLD flat-1.25
        // velocityParam would have rendered to at each build intensity, via
        // the same closed-form chain the engine itself uses
        // (velocityParam * accent(1.0, downbeat is always even intBeat) *
        // intensityFactor(0.6+i*0.7) * bassEnvelope(1.05, the downbeat is
        // always a strong beat) * conductorGain, domain-clamped, then
        // bassVelocityToAmplitude). Verified this closed form matches the
        // real simulation's measured amplitude to 4 decimal places at every
        // build intensity — confirms the downbeat's ONLY per-note inputs here
        // are velocityParam and intensity, so this is a faithful reconstruction,
        // not an approximation. Pre-fix, velocityParam contributed nothing
        // beyond the shared intensityFactor/bassEnvelope terms every OTHER
        // note also gets; measured post-fix gain is +0.2 to +0.4dB across the
        // build (i=0.4-0.7) — small but real, and this proves it's the fix's
        // doing, not simulation noise.
        const oldAmplitudeAt = (bandIntensity) => {
            const intensityFactor = 0.6 + bandIntensity * 0.7;
            const bassEnvelope = 1.05;
            const gain = conductorGain(bandIntensity);
            const oldRaw = Math.min(
                BASS_VELOCITY_DOMAIN_MAX,
                1.25 * intensityFactor * bassEnvelope,
            );
            return bassVelocityToAmplitude(oldRaw * gain);
        };
        for (const r of results) {
            expect(r.mean).toBeGreaterThan(oldAmplitudeAt(r.bi));
        }
    });

    // --- #1342: "The One" is the loudest thing in the funk bar -------------
    //
    // #1335 exempted 'quarter'/'bossa' from the generic odd-beat velocity
    // accent (`intBeat % 2 === 1 ? 1.15 : 1.0` in `bass-engine.ts`) and
    // deliberately left funk accented. That accent lands on beats 2 and 4 — a
    // rock/pop BACKBEAT — while funk's own authored accents (the thumb slap on
    // The One, the secondary slap on beat 3) sit on beats 1 and 3. Measured
    // during #1334's review: the "and" pop, riding the +15% backbeat accent,
    // rendered LOUDER than The One from i~0.1 to i~0.65 — the genre's
    // structural anchor ("everything on The One") was not the loudest thing in
    // its own bar across most of the practical dynamic range.
    //
    // #1342's design call: funk is exempted from the generic metric accent
    // ENTIRELY (`GESTURE_ACCENT_BASS_STYLES`, `bass-styles.ts`) rather than
    // moved onto a beats-1&3 accent set. Funk authors a per-gesture velocity
    // for every note it emits (slap / secondary slap / pop / "a"-pop /
    // hammer-on / approach / 0.5 dead-note chuck), so a blanket per-BEAT
    // multiplier — on either pair — scales whatever gesture happens to land
    // inside the accented beat and re-orders that authored hierarchy. Full
    // reasoning lives in that set's doc comment.
    //
    // THE HONEST BOUND, read this before tightening: at i >= 0.7 The One and
    // the "and" pop share the same authored token (1.25 + intensity*0.2) and
    // BOTH saturate `BASS_VELOCITY_DOMAIN_MAX`, so they render bit-identically
    // — the stacked-intensity structural ceiling (#1336), not this fix's
    // business. So "strictly loudest" is asserted only below saturation;
    // "never beaten" is asserted at EVERY sampled intensity, which is the
    // claim that actually failed before this fix.
    const funkBarDominance = (bandIntensity, numBars = 64, grooveOverride = null) => {
        const perf = simulatePerformance(numBars, {
            playback: { bandIntensity, bpm: 110, complexity: 0.8 },
            ...(grooveOverride ? { groove: grooveOverride } : {}),
        });
        const gain = conductorGain(bandIntensity);
        const amp = (p) => bassVelocityToAmplitude(p.note.velocity * gain);
        const bars = new Map();
        for (const p of perf) {
            const bar = Math.floor(p.step / 16);
            if (!bars.has(bar)) {
                bars.set(bar, { one: null, others: [], pops: [] });
            }
            const b = bars.get(bar);
            if (p.stepInMeasure === 0) {
                b.one = amp(p);
            } else {
                b.others.push(amp(p));
                // The "and" pops: the funk engine fires them at
                // `stepInBeat === stepsPerBeat / 2` (steps 2/6/10/14 in 4/4).
                // `>= 0.8` keeps the ghost/chuck lane (authored 0.2-0.5) out —
                // same split `renderedFullNotes` uses.
                if (p.stepInMeasure % 4 === 2 && p.note.velocity >= 0.8) {
                    b.pops.push(amp(p));
                }
            }
        }
        // why 1e-9: the tie case is a genuine bit-identical saturation at the
        // domain ceiling (both operands are `Math.min(1.5, ...)` of the same
        // token), so this epsilon only absorbs accumulated float rounding — it
        // is not wide enough to hide a real dynamic difference (the smallest
        // real gap in this bar is the +5%/-3.5% metric envelope step, ~0.2 dB).
        const EPS = 1e-9;
        let checked = 0;
        let strict = 0;
        let tied = 0;
        let beaten = 0;
        let marginSum = 0;
        let worstMargin = Number.POSITIVE_INFINITY;
        const oneAmps = [];
        const popAmps = [];
        for (const b of bars.values()) {
            if (b.one === null) {
                continue;
            }
            oneAmps.push(b.one);
            popAmps.push(...b.pops);
            if (b.others.length === 0) {
                continue;
            }
            checked++;
            const loudestOther = Math.max(...b.others);
            const marginDb = dB(b.one / loudestOther);
            marginSum += marginDb;
            worstMargin = Math.min(worstMargin, marginDb);
            if (b.one > loudestOther + EPS) {
                strict++;
            } else if (b.one >= loudestOther - EPS) {
                tied++;
            } else {
                beaten++;
            }
        }
        return {
            checked,
            strict,
            tied,
            beaten,
            meanMarginDb: marginSum / (checked || 1),
            worstMarginDb: worstMargin,
            onePop: popAmps.length ? dB(meanOf(oneAmps) / meanOf(popAmps)) : Number.NaN,
            nPops: popAmps.length,
        };
    };

    // #942 review P0: this file's shared harness runs `instruments: []`, which
    // silences `getBassNote`'s kick-lock early return (`hasKickTrigger` is
    // permanently false — harness-silencing, smell (e)). The shipped Funk
    // preset has a kick ON The One (step 0, accented), and pre-patch that
    // branch intercepted the downbeat ahead of the authored slap and rendered
    // it at ~1.06 (i=0.5) against the pop's 1.35 — the #942 inversion, alive in
    // production while the kickless sweep read green. So the dominance sweep
    // runs BOTH lanes: kickless isolates the gesture ladder + accent fix; the
    // kick lane replays it under the production Funk preset's real kick grid
    // and is what makes the claim true of what ships. Kick-coincident non-One
    // steps still render at the generic lock level — that open design call is
    // #948, and until it lands the kick lane's population is a mix of authored
    // gestures (non-kick steps) and lock-level notes (kick steps), all of which
    // must stay under The One.
    const funkKickGroove = () => {
        const preset = DRUM_PRESETS.Funk;
        return {
            genreFeel: 'Funk',
            pocket: 0,
            measures: preset.measures,
            instruments: [{ name: 'Kick', steps: preset.variations[0].Kick }],
        };
    };

    it('"The One" is never out-rendered in the funk bar across 0.1-0.9, kickless AND on the production kick grid (#1342/#942)', () => {
        const intensities = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
        const sweep = intensities.map((bi) => ({ bi, ...funkBarDominance(bi) }));
        const kickSweep = intensities.map((bi) => ({
            bi,
            ...funkBarDominance(bi, 64, funkKickGroove()),
        }));

        const fmt = (r) =>
            `[i=${r.bi}]  bars=${r.checked}  strict=${r.strict}  tied=${r.tied}  ` +
            `BEATEN=${r.beaten}  margin(mean/worst)=${r.meanMarginDb.toFixed(
                2,
            )}/${r.worstMarginDb.toFixed(2)}dB  ` +
            `One-vs-pop=${r.onePop >= 0 ? '+' : ''}${r.onePop.toFixed(2)}dB (n=${r.nPops})`;
        console.log(
            [
                '',
                '--- #1342 FUNK "THE ONE" vs THE REST OF THE BAR (kickless) ---',
                ...sweep.map(fmt),
                '--- #942 same sweep, production Funk kick grid loaded ---',
                ...kickSweep.map(fmt),
                '(pre-#1342, kickless, per-bar: The One out-rendered in 50/54/55 of 64 bars at i=0.4/0.5/0.6)',
                '(pre-#942 kick carve-out, kick grid: The One out-rendered in 64/64 bars at i=0.4-0.6, worst -1.5dB)',
                '---------------------------------------------------',
            ].join('\n'),
        );

        // intent: the sample can't collapse — a bar count near zero would let
        // "never beaten" pass vacuously. Low intensities legitimately thin out
        // (the `intensity < 0.4 && !isDownbeat` lay-out branch), so the floor
        // is deliberately low there and tight above it. The kick lane lays out
        // LESS at low intensity (kick-coincident steps bypass the lay-out
        // branch), so the same floors hold there a fortiori.
        for (const r of [...sweep, ...kickSweep]) {
            expect(r.checked).toBeGreaterThanOrEqual(r.bi < 0.4 ? 8 : 60);
        }

        // intent (the acceptance): nothing in the bar is EVER louder than The
        // One, at any sampled intensity, in EITHER lane. Kickless, this was
        // false before #1342 — measured 50/54/55 of 64 bars beaten at
        // i=0.4/0.5/0.6 (deterministic there; NOT the 64/64 an earlier draft of
        // this comment claimed). On the kick grid it was false before the #942
        // kick carve-out — 64/64 bars beaten at i=0.4-0.6, by up to -1.5 dB.
        for (const r of [...sweep, ...kickSweep]) {
            expect(r.beaten).toBe(0);
        }

        // intent: below the domain-ceiling saturation point The One is
        // STRICTLY the loudest, in every bar — not merely tied. Saturation
        // engages at i~0.65 for the downbeat token (#1336), so this is
        // asserted on the 0.1-0.6 half of the sweep, in both lanes (the kick
        // lane's loudest challenger is still a NON-kick-step pop at full
        // `popVel`, so the margins match the kickless lane's).
        for (const r of [...sweep, ...kickSweep].filter((s) => s.bi <= 0.6)) {
            expect(r.strict).toBe(r.checked);
            // intent: the margin is a real level difference, not a rounding
            // artifact ; measured worst-case ~0.10dB at i=0.1 (the sqrt half of
            // `bassVelocityToAmplitude` compresses the soft end) ; floor 0.05dB.
            expect(r.worstMarginDb).toBeGreaterThan(0.05);
        }

        // intent: at/above saturation the honest claim is "never quieter" —
        // both notes rail at `BASS_VELOCITY_DOMAIN_MAX` and tie. Asserting a
        // strict win here would be asserting against #1336's ceiling.
        for (const r of [...sweep, ...kickSweep].filter((s) => s.bi >= 0.7)) {
            expect(r.worstMarginDb).toBeGreaterThanOrEqual(0);
        }

        // intent: SUPPORTING metric in the issue's own terms — mean The One vs
        // mean "and" pop. The per-bar `beaten === 0` above is the load-bearing
        // acceptance guard; this mean-based pair is looser (pre-fix it already
        // sat positive at the band edges, i=0.1 and i=0.6, so it alone would
        // NOT have caught the regression) and is kept for the report line and
        // as a cheap direction check, not as the gate. The bound is -1e-6 dB
        // rather than 0 because at i >= 0.7 both populations are pinned to the
        // same domain-ceiling value and the two means differ only by float
        // accumulation (measured -1.6e-14 dB) — a true tie, not a loss.
        for (const r of [...sweep, ...kickSweep]) {
            expect(r.onePop).toBeGreaterThan(-1e-6);
        }
    });

    it('drops the rock/pop 2&4 backbeat accent from funk (#1342 mutation guard)', () => {
        // The dominance test above can be satisfied by several shapes; this one
        // pins the actual mechanism. Compare the "and" pops on ODD `intBeat`
        // (the & of 2 and the & of 4 — steps 6 and 14, which carried the +15%
        // generic backbeat accent) against those on EVEN `intBeat` (the & of 1
        // and the & of 3 — steps 2 and 10, which never did). Both populations
        // share one authored token (`popVel`), so post-#1342 the ONLY thing
        // separating them is the genre-neutral metric envelope (+2.5% into a
        // strong beat vs -3.5% just after one, `bassEnvelope` in
        // `bass-engine.ts`) — a ~0.45 dB rendered step. Pre-#1342 the backbeat
        // accent stacked ~1.5 dB on top of that. Measured at intensities where
        // the domain clamp is NOT engaged, and where the deliberately unseeded
        // low-intensity lay-out branch is NOT live, so this is deterministic.
        const rows = [0.4, 0.5, 0.6].map((bandIntensity) => {
            const perf = simulatePerformance(32, {
                playback: { bandIntensity, bpm: 110, complexity: 0.8 },
            });
            const gain = conductorGain(bandIntensity);
            const pops = (steps) =>
                perf
                    .filter((p) => steps.includes(p.stepInMeasure) && p.note.velocity >= 0.8)
                    .map((p) => bassVelocityToAmplitude(p.note.velocity * gain));
            const backbeat = pops([6, 14]);
            const evenBeatPops = pops([2, 10]);
            return {
                bandIntensity,
                nBack: backbeat.length,
                nOn: evenBeatPops.length,
                gapDb: dB(meanOf(backbeat) / meanOf(evenBeatPops)),
            };
        });

        console.log(
            [
                '',
                '--- #1342 FUNK BACKBEAT-ACCENT RESIDUE ---',
                ...rows.map(
                    (r) =>
                        `[i=${r.bandIntensity}]  &of2/&of4 n=${r.nBack}  &of1/&of3 n=${r.nOn}  ` +
                        `gap=${r.gapDb >= 0 ? '+' : ''}${r.gapDb.toFixed(2)}dB ` +
                        '(envelope-only target ~0.45dB; pre-#1342 ~1.5dB)',
                ),
                '------------------------------------------',
            ].join('\n'),
        );

        for (const r of rows) {
            expect(r.nBack).toBeGreaterThan(20);
            expect(r.nOn).toBeGreaterThan(20);
            // intent: only the metric envelope may separate the two pop
            // positions ; measured 0.45/0.47/0.47 dB ; ceiling 0.70 dB (~49%
            // headroom). Mutation-checked in both directions: reverting the
            // engine fix measures 1.54/1.50/0.83 dB, red at all three sampled
            // intensities. (0.9 was the first ceiling tried and let the i=0.6
            // pre-fix value through — the domain clamp already eats part of the
            // accent there, so the mutation signal is weakest at the top of
            // this band and the ceiling has to be set against THAT value, not
            // the headline 1.5.)
            expect(r.gapDb).toBeLessThan(0.7);
            // intent: the envelope itself must survive — this is not a
            // "flatten everything" fix. The & of 2/4 lean INTO the coming
            // strong beat and stay slightly above the & of 1/3.
            expect(r.gapDb).toBeGreaterThan(0.1);
        }
    });
});
