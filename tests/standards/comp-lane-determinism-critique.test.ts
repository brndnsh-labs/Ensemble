/**
 * Critique: the per-genre comping lanes must LOCK loop-to-loop.
 *
 * `getAccompanimentNotes` has early-return per-genre lanes (strum-country,
 * Neo-Soul, Funk, ...) that decided whether a ghost/onset note plays via raw
 * Math.random — so each lane re-rolled its offbeats every bar AND every loop,
 * never locking. Epic 2 S5 seeded those onset gates on (step, loopCount), the
 * same shape the smart-overlay (the original comp-lock fix), bass, and drums
 * use. (Per-note velocity/timing humanize stays raw — color, not placement.)
 *
 * Guards (mirrors bass-density-lock-critique):
 *   (1) determinism — identical (step, loop) → identical onset pattern.
 *   (2) non-tautology — the seeded ghost gate actually fires (bars vary within
 *       a loop), so a determinism-only check isn't trivially satisfied by a
 *       lane that ignored the gate.
 *   (3) loop reproducibility — a later loop reproduces itself.
 *   (5) #712 — the comp LOCKS loop-to-loop: for non-sticky lanes (picker keyed
 *       off the IN-LOOP bar, no cross-loop rotation/retention), loop N+1 must
 *       reproduce loop N bar-for-bar EVEN as currentLoopCount changes. This is
 *       the property that makes the rhythm "lock in"; the pre-#712 seed
 *       (global-step ^ loopCount) made every loop a different pattern and failed
 *       it. Sticky/rotation lanes (Funk, Neo-Soul) deliberately evolve across
 *       the form, so the guard is scoped to the non-sticky lanes.
 */
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { resetCompingState as resetCanonicalCompingState } from '../../public/engine/comping-state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

const FOUR_FOUR = '4/4';
const STEPS_PER_BAR = 16;
const NUM_BARS = 24;

const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);
function makeC7() {
    const intervals = [0, 4, 7, 10];
    return {
        rootMidi: 60,
        quality: '7',
        intervals,
        is7th: true,
        beats: 4,
        freqs: intervals.map((iv) => midiToFreq(60 + iv)),
        sectionId: 'Head',
    };
}

function resetCompingState() {
    // why: all-zero cell isolates the SEEDED ghost gate as the only onset source
    // (isHit is always false), so guard (2) directly exercises the gate the fix
    // touched. Persistent groove-memory fields reset for clean pass-to-pass
    // determinism (soloistActivity is a converging smoother).
    resetCanonicalCompingState(compingState);
}

function dirtyCompingMemory() {
    compingState.currentCell = new Array(16).fill(1);
    compingState.lockedUntil = 999;
    compingState.statementVoicingMidis = [72, 76, 79];
    compingState.statementChordKey = 'stale-statement';
    compingState.ringSuppressStep = 7;
    compingState.ringSuppressChordKey = 'stale-ring';
    compingState.lastSectionId = 'stale-section';
    compingState.funkRotationIndex = 11;
    compingState.bossaRotationIndex = 13;
}

function runPrimedStep(dirty: boolean) {
    resetCanonicalCompingState(compingState);
    const state = buildState('Rock', 'smart', 0);
    const chord = makeC7();
    const firstInfo = getStepInfo(0, FOUR_FOUR, [], TIME_SIGNATURES);
    getAccompanimentNotes(state, chord, 0, 0, 0, firstInfo, COORD);
    if (dirty) {
        dirtyCompingMemory();
    }
    resetCompingState();
    const resetDefaults = {
        currentCell: [...compingState.currentCell],
        statementVoicingMidis: [...compingState.statementVoicingMidis],
        ringSuppressStep: compingState.ringSuppressStep,
        lastSectionId: compingState.lastSectionId,
        funkRotationIndex: compingState.funkRotationIndex,
        bossaRotationIndex: compingState.bossaRotationIndex,
    };
    const info = getStepInfo(0, FOUR_FOUR, [], TIME_SIGNATURES);
    const notes = getAccompanimentNotes(state, chord, 0, 0, 0, info, COORD);
    const trace = notes.map((note: any) => ({
        midi: note.midi,
        muted: note.muted,
        timingOffset: note.timingOffset,
    }));
    return {
        trace,
        hitCount: trace.filter((note: any) => note.midi > 0 && !note.muted).length,
        resetDefaults,
    };
}

function buildState(genreFeel: string, chordStyle: string, currentLoopCount: number) {
    const soloist = makeSoloistMock({
        enabled: false,
        style: 'jazz',
        mode: 'monophonic',
        octave: 64,
        sessionSteps: 0,
        phrasingState: 'active',
        isResting: false,
        phraseContext: { role: 'call', sectionLabel: 'Head', sectionOccurrence: 0 },
    });
    return {
        playback: {
            bandIntensity: 0.6,
            bpm: 110,
            complexity: 0.5,
            currentLoopCount,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
            audio: { currentTime: 0 },
        },
        groove: { genreFeel, lastDrumPreset: genreFeel, pocket: 0, enabled: true },
        soloist,
        arranger: {
            timeSignature: FOUR_FOUR,
            totalSteps: STEPS_PER_BAR * NUM_BARS,
            stepMap: [],
            key: 'C',
            isMinor: false,
            progression: [],
        },
        chords: { enabled: true, style: chordStyle, density: 'standard', octave: 60 },
        bass: { enabled: true, lastFreq: null },
        harmony: { enabled: false, rhythmicMask: 0 },
        vizState: { enabled: false },
        midi: {},
    } as any;
}

// why: soloistBusy false so the shared yield gate (compDraw 20) doesn't early-
// return — we want the genre lane itself to run every step.
const COORD = {
    soloistBusy: false,
    soloistResting: false,
    soloistActive: false,
    soloistNotesInPhrase: 0,
    bassHit: false,
    kickHit: false,
    snareHit: false,
    accompanimentHit: false,
    sectionOccurrence: 1,
};

function runPass(genreFeel: string, chordStyle: string, currentLoopCount: number): boolean[][] {
    resetCompingState();
    const state = buildState(genreFeel, chordStyle, currentLoopCount);
    const chord = makeC7();
    const bars: boolean[][] = [];
    for (let bar = 0; bar < NUM_BARS; bar++) {
        const row = new Array(STEPS_PER_BAR).fill(false);
        for (let mStep = 0; mStep < STEPS_PER_BAR; mStep++) {
            const step = bar * STEPS_PER_BAR + mStep;
            const info = getStepInfo(step, FOUR_FOUR, [], TIME_SIGNATURES);
            const notes = getAccompanimentNotes(state, chord, step, step, mStep, info, COORD);
            row[mStep] = notes.some((n: any) => n && n.midi > 0 && !n.muted);
        }
        bars.push(row);
    }
    return bars;
}

// checkVariation: whether the seeded GHOST gate is the dominant onset source so
// "bars vary" is a valid non-tautology proxy. Funk surfaces its ghost gate audibly.
// Neo-Soul's onset is driven by a locked comp cell (updateRhythmicIntent regenerates
// + locks it), so its rhythm is deterministic by design and its ghost contribution
// doesn't surface in this minimal harness. strum-country is ALSO regular-by-design as
// of #877: country boom-chicka is a metronomic REGULAR subdivision (chicka on every
// &, identical every bar) — the old per-step hash scatter that made bars vary was the
// bug, not the idiom. So country's bars SHOULD be identical; its specific pattern is
// guarded positively by country-piano-critique ('regular, bar-stable subdivision'),
// and determinism here is the meaningful check (guards 1/2/4/5), not bar-variation.
// lockLoopToLoop: the lane's onsets are purely picker-keyed off the IN-LOOP bar
// with no cross-loop rotation counter (Funk/Bossa) or sticky retention that
// straddles the loop boundary (the STICKY_GENRES) — so loop N+1 must reproduce
// loop N exactly. Rock/Country are non-sticky; Funk and Neo-Soul are not.
const LANES: {
    name: string;
    genreFeel: string;
    chordStyle: string;
    checkVariation: boolean;
    lockLoopToLoop: boolean;
}[] = [
    {
        name: 'strum-country',
        genreFeel: 'Country',
        chordStyle: 'strum-country',
        // #877: country boom-chicka is regular-by-design (identical every bar) — the
        // bar-variation proxy no longer applies; the pattern is pinned positively in
        // country-piano-critique. Determinism + loop-lock (1/2/4/5) are the checks here.
        checkVariation: false,
        lockLoopToLoop: true,
    },
    {
        name: 'Rock',
        genreFeel: 'Rock',
        chordStyle: 'smart',
        checkVariation: true,
        lockLoopToLoop: true,
    },
    {
        name: 'Neo-Soul',
        genreFeel: 'Neo-Soul',
        chordStyle: 'smart',
        checkVariation: false,
        lockLoopToLoop: false,
    },
    {
        name: 'Funk',
        genreFeel: 'Funk',
        chordStyle: 'smart',
        checkVariation: true,
        lockLoopToLoop: false,
    },
];

// Run `numLoops` full loops back-to-back on ONE evolving comping state. step
// keeps climbing and currentLoopCount is bumped each loop — so if a lane still
// repeats bar-for-bar across the boundary, it's genuinely keyed off the in-loop
// position and not the global step or the loop counter.
function runPassNLoops(genreFeel: string, chordStyle: string, numLoops: number): boolean[][] {
    resetCompingState();
    const state = buildState(genreFeel, chordStyle, 0);
    const chord = makeC7();
    const bars: boolean[][] = [];
    for (let loop = 0; loop < numLoops; loop++) {
        state.playback.currentLoopCount = loop;
        for (let bar = 0; bar < NUM_BARS; bar++) {
            const row = new Array(STEPS_PER_BAR).fill(false);
            for (let mStep = 0; mStep < STEPS_PER_BAR; mStep++) {
                const step = loop * NUM_BARS * STEPS_PER_BAR + bar * STEPS_PER_BAR + mStep;
                const info = getStepInfo(step, FOUR_FOUR, [], TIME_SIGNATURES);
                const notes = getAccompanimentNotes(state, chord, step, step, mStep, info, COORD);
                row[mStep] = notes.some((n: any) => n && n.midi > 0 && !n.muted);
            }
            bars.push(row);
        }
    }
    return bars;
}

const barsEqual = (a: boolean[], b: boolean[]) => a.every((v, i) => v === b[i]);

describe('Comp genre lanes lock (determinism + non-tautology)', () => {
    it('isolates fixture order: dirty statement/ring/section/rotation memory is cleared', () => {
        const baseline = runPrimedStep(false);
        const rerun = runPrimedStep(true);
        expect(baseline.trace.length).toBeGreaterThan(0);
        expect(baseline.hitCount).toBeGreaterThan(0);
        expect(rerun.trace).toEqual(baseline.trace);
        expect(rerun.hitCount).toBe(baseline.hitCount);
        expect(rerun.resetDefaults).toEqual({
            currentCell: new Array(16).fill(0),
            statementVoicingMidis: [],
            ringSuppressStep: -1,
            lastSectionId: null,
            funkRotationIndex: 0,
            bossaRotationIndex: 0,
        });
    });

    for (const lane of LANES) {
        describe(lane.name, () => {
            it('(1) is deterministic loop-to-loop: identical (step, loop) → identical onsets', () => {
                const a = runPass(lane.genreFeel, lane.chordStyle, 0);
                const b = runPass(lane.genreFeel, lane.chordStyle, 0);
                expect(b).toEqual(a);
            });

            it('(2) the lane produces audible onsets (not trivially empty)', () => {
                const bars = runPass(lane.genreFeel, lane.chordStyle, 0);
                const anyActive = bars.some((row) => row.some((v) => v));
                expect(anyActive, `${lane.name}: lane produced no audible notes`).toBe(true);
            });

            if (lane.checkVariation) {
                it('(3) the seeded ghost gate actually fires (pattern varies bar-to-bar)', () => {
                    const bars = runPass(lane.genreFeel, lane.chordStyle, 0);
                    const allBarsIdentical = bars.every((row) => barsEqual(row, bars[0]));
                    expect(
                        allBarsIdentical,
                        `${lane.name}: every bar identical — the seeded ghost gate isn't ` +
                            `contributing, so a determinism-only pass would be tautological`,
                    ).toBe(false);
                });
            }

            it('(4) a later loop is itself reproducible', () => {
                expect(runPass(lane.genreFeel, lane.chordStyle, 3)).toEqual(
                    runPass(lane.genreFeel, lane.chordStyle, 3),
                );
            });

            if (lane.lockLoopToLoop) {
                it('(5) #712 — LOCKS loop-to-loop: loops 1 and 2 reproduce loop 0 bar-for-bar', () => {
                    // 3 loops, not 2 — also catches a hypothetical odd/even-loop
                    // alternation that a single boundary comparison would miss.
                    const three = runPassNLoops(lane.genreFeel, lane.chordStyle, 3);
                    for (let loop = 1; loop < 3; loop++) {
                        for (let bar = 0; bar < NUM_BARS; bar++) {
                            expect(
                                barsEqual(three[loop * NUM_BARS + bar], three[bar]),
                                `${lane.name}: bar ${bar} of loop ${loop} differs from loop 0 — ` +
                                    `the comp isn't locking loop-to-loop`,
                            ).toBe(true);
                        }
                    }
                });
            }
        });
    }
});
