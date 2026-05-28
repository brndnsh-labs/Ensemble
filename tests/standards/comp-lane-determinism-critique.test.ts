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
 */
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
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
    compingState.currentCell = new Array(16).fill(0);
    compingState.lockedUntil = 0;
    compingState.grooveRetentionCount = 0;
    compingState.lastSectionId = null;
    compingState.lastVoicingMidis = [];
    compingState.lastChordIndex = -1;
    compingState.lastChordQuality = null;
    compingState.funkRotationIndex = 0;
    compingState.bossaRotationIndex = 0;
    compingState.currentVibe = 'balanced';
    compingState.soloistActivity = 0;
    compingState.maxGrooveLength = 4;
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
// "bars vary" is a valid non-tautology proxy. strum-country + Funk surface their
// ghost gates audibly. Neo-Soul's onset is driven by a locked comp cell
// (updateRhythmicIntent regenerates + locks it), so its rhythm is deterministic
// by design and its ghost contribution doesn't surface in this minimal harness —
// the seeded ghost gate (compDraw 22) is the same proven pattern as Funk's, so
// determinism (guards 1+3) is the meaningful check there.
const LANES: { name: string; genreFeel: string; chordStyle: string; checkVariation: boolean }[] = [
    {
        name: 'strum-country',
        genreFeel: 'Country',
        chordStyle: 'strum-country',
        checkVariation: true,
    },
    { name: 'Neo-Soul', genreFeel: 'Neo-Soul', chordStyle: 'smart', checkVariation: false },
    { name: 'Funk', genreFeel: 'Funk', chordStyle: 'smart', checkVariation: true },
];

const barsEqual = (a: boolean[], b: boolean[]) => a.every((v, i) => v === b[i]);

describe('Comp genre lanes lock (determinism + non-tautology)', () => {
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
        });
    }
});
