// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
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

    it('should pass an authenticity critique for a 128-bar Funk performance', () => {
        const totalMeasures = 128;
        const performance = simulatePerformance(totalMeasures);

        let ghostNotes = 0;
        let downbeatHits = 0;

        performance.forEach((p) => {
            const midi = p.note.midi;
            if (p.stepInMeasure === 0) {
                downbeatHits++;
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
        // DIRECTION — these two bounds are a REGRESSION RATCHET, not the musical target.
        //
        // The corrected metric exposes a live engine defect (filed separately as #1295):
        // at intensity 0.9 the pop lands an octave BELOW its own
        // slapped root on 135 of 196 paired beats — 68.9% of the gesture plays upside
        // down. The musical target is liftRate ~1.0 and inversionRate 0. The cause is the
        // same one #1271 removed for disco: `normalizeToRange` re-resolves `baseRoot` per
        // step against a `prevMidi`-weighted reference, so a high downbeat drags the next
        // resolution down an octave and `baseRoot + 12` lands under the note it should
        // rise above. Funk is deliberately NOT in `PUMP_ANCHOR_STYLES` (its line is
        // genuinely melodic — hammer-ons, fifths, chromatic approaches — so a fixed anchor
        // is the wrong medicine); the fix is its own design call, which is why this file
        // reports the defect rather than tuning a floor to hide it.
        //
        // The bounds are set just outside today's measured split so the file cannot drift
        // further in either direction while the engine question is open: a rise in
        // inversions reds immediately, and so does a collapse in genuine lifts. Both move
        // the correct way when the anchor is fixed (liftRate -> 1, inversionRate -> 0), so
        // neither has to be relaxed to land that fix.
        expect(r.inversionRate).toBeLessThan(0.75); // measured 0.689 — TARGET IS 0
        expect(r.liftRate).toBeGreaterThan(0.25); // measured 0.311 — TARGET IS ~1.0
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

        // High intensity fires the ladder: 16 genuine octave lifts over 32 bars (of 52
        // paired beats — the rest are the inversions the sweep above ratchets).
        expect(high.octavePops).toBeGreaterThan(10); // measured 16 over 32 bars
        // Low intensity suppresses it entirely: measured 0 lifts over 32 bars, with all
        // 13 paired beats landing a unison instead. The suppression is real — below
        // ~0.4 the rock/funk no-kick branch returns null on most non-downbeats — but note
        // it is a suppression of the LIFT, not of the pop: the ladder still emits 29 pops,
        // they just never leave the root. That distinction is the thing the absolute
        // metric could not express, and it is the low-intensity face of the same anchor
        // defect the sweep above documents.
        expect(low.octavePops).toBeLessThanOrEqual(high.octavePops / 3);
    });
});
