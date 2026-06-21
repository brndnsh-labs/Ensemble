// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { resolveSoloistStyle } from '../../public/engine/soloist-config.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4 },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

describe('Soloist Rock Critique', () => {
    let soloistState;

    const makeState = (bandIntensity, complexity) => ({
        playback: {
            bandIntensity,
            bpm: 130,
            complexity,
            intent: {},
            lyricalBias: 0.4,
            currentLoopCount: 1,
        },
        groove: { genreFeel: 'Rock', pocket: 0 },
        soloist: soloistState,
        harmony: { enabled: false },
        arranger: { timeSignature: '4/4' },
    });

    beforeEach(() => {
        vi.restoreAllMocks();

        soloistState = makeSoloistMock({
            enabled: true,
            // Explicit 'rock' STYLE_CONFIG profile. Since #592 this is ALSO what
            // the Rock *genre* plays in smart mode (SMART_GENRES.Rock.soloist =
            // 'rock') — see the resolution guard below. 'shred' is now the
            // explicit fast-lead voice only.
            style: 'rock',
            mode: 'guitar',
            octave: 64,
            sessionSteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            srdcState: 'Statement',
            qaState: 'Question',
            isResting: true,
            motifBuffer: [],
            thematicSeed: [],
            thematicSeedRoot: 0,
            isReplayingMotif: false,
            isReplayingSeed: false,
            busySteps: 0,
            pitchHistory: [],
            lastInterval: 0,
            stagnationCount: 0,
            deviceBuffer: [],
            lastFreq: 0,
            currentCell: null,
            phraseContext: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                profile: 'slash',
            },
        });

        getState.mockReturnValue(makeState(0.85, 0.7));
    });

    const simulatePerformance = (numBars, intensity = 0.85) => {
        getState.mockReturnValue(makeState(intensity, 0.7));
        const history = [];
        // Dominant-7 power-chord progression (I-IV-V-IV in A). Over dom7 chords
        // the rock chord-scale is the Mixolydian+b3 blues scale
        // [0,2,3,4,5,7,9,10] (theory-scales.ts), the natural home for the
        // pentatonic/blues claim.
        const A7 = { rootMidi: 57, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };
        const D7 = { rootMidi: 62, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };
        const E7 = { rootMidi: 64, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };
        const progression = [A7, A7, D7, A7, E7, D7, A7, E7];

        let lastFreq = 0;
        for (let bar = 0; bar < numBars; bar++) {
            const chord = progression[bar % progression.length];
            for (let step = 0; step < 16; step++) {
                const note = getSoloistNote(
                    getState(),
                    chord,
                    chord,
                    bar * 16 + step,
                    lastFreq,
                    64,
                    'rock',
                    step,
                    {},
                    getStepInfo(bar * 16 + step, {
                        beats: 4,
                        stepsPerBeat: 4,
                        grouping: [4],
                        backbeat: [1, 3],
                    }),
                );
                if (note) {
                    const arr = Array.isArray(note) ? note : [note];
                    const primary = arr[arr.length - 1];
                    lastFreq = primary.frequency || 0;
                    history.push({
                        step: bar * 16 + step,
                        bar,
                        midi: primary.midi,
                        device: primary.device || 'none',
                        isDoubleStop: arr.length > 1 || primary.isDoubleStop === true,
                        chordRoot: chord.rootMidi,
                    });
                }
                soloistState.session.sessionSteps++;
            }
        }
        return history;
    };

    it('should pass an idiom critique for a 256-bar Rock soloist performance', () => {
        const numBars = 256;
        const notes = simulatePerformance(numBars, 0.85);

        // Pentatonic / blues target set, hard-coded (NOT re-derived from the
        // engine's chord-scale predicate — that would be smell-a). The minor-
        // pentatonic core {0,3,5,7,10} + the blue b5 {6} is the signature rock-
        // guitar scale; the major-pentatonic color tones {2,4,9} round out the
        // full pentatonic/blues palette a rock lead draws from.
        const MINOR_PENT_BLUE = new Set([0, 3, 5, 7, 10, 6]);
        const PENT_BLUES = new Set([0, 3, 5, 7, 10, 6, 2, 4, 9]);

        let pentBlues = 0;
        let minorPentBlue = 0;
        let doubleStops = 0;
        const devices = {};
        for (const n of notes) {
            const rel = (n.midi - n.chordRoot + 120) % 12;
            if (PENT_BLUES.has(rel)) {
                pentBlues++;
            }
            if (MINOR_PENT_BLUE.has(rel)) {
                minorPentBlue++;
            }
            if (n.isDoubleStop) {
                doubleStops++;
            }
            devices[n.device] = (devices[n.device] || 0) + 1;
        }
        const bendDevices = (devices.bluesCurl || 0) + (devices.slide || 0);

        const pentBluesShare = pentBlues / notes.length;
        const minorPentBlueShare = minorPentBlue / notes.length;
        const doubleStopRate = doubleStops / notes.length;
        const bendShareHi = bendDevices / notes.length;

        // Random baselines (explicit, for the share assertions):
        //  - PENT_BLUES set has 9 of 12 chromatic PCs → uniform-chromatic baseline
        //    9/12 = 0.75.
        //  - MINOR_PENT_BLUE core has 6 of 12 PCs → uniform-chromatic baseline
        //    6/12 = 0.50.
        const PENT_BLUES_BASELINE = PENT_BLUES.size / 12; // 0.75
        const MINOR_PENT_BASELINE = MINOR_PENT_BLUE.size / 12; // 0.50

        // Low-intensity comparison run: bend devices (bluesCurl/slide) should be
        // an intensity-gated feature, so the same engine at low intensity emits
        // near-zero bends. This is the discriminator for the "at intensity" claim
        // (a flat bend rate across intensities would mean the gate is dead).
        const loNotes = simulatePerformance(numBars, 0.25);
        let loBend = 0;
        for (const n of loNotes) {
            if (n.device === 'bluesCurl' || n.device === 'slide') {
                loBend++;
            }
        }
        const bendShareLo = loBend / loNotes.length;

        console.log('\n--- ROCK SOLOIST CRITIQUE REPORT ---');
        console.log(
            `[Pent/Blues Scale Share]  ${(pentBluesShare * 100).toFixed(1)}% (Target: >0.85; baseline ${PENT_BLUES_BASELINE})`,
        );
        console.log(
            `[Minor-Pent+Blue Core]    ${(minorPentBlueShare * 100).toFixed(1)}% (Target: >0.58; baseline ${MINOR_PENT_BASELINE})`,
        );
        console.log(
            `[Double-Stop Rate]        ${(doubleStopRate * 100).toFixed(1)}% (Target: >0.04)`,
        );
        console.log(`[Bend Devices @0.85]      ${(bendShareHi * 100).toFixed(1)}% (Target: >0.03)`);
        console.log(
            `[Bend Devices @0.25]      ${(bendShareLo * 100).toFixed(1)}% (Target: <0.015, < hi)`,
        );
        console.log('------------------------------------\n');

        // The soloist generation path is fully seeded (scrambleHash over
        // step/section/loop), so every metric below is deterministic to the last
        // digit across runs (verified 3/3 identical during calibration). Thresholds
        // therefore carry generous fixed headroom rather than a flake band.

        // (1) Pentatonic/blues scale adherence. Engine delivers 98.1% over a
        // 256-bar dom7 progression. The rock soloist stays on its pent/blues
        // palette and rarely spills chromatic. Uniform-chromatic baseline is
        // 0.75 (9/12 PCs), so >0.85 sits ~10pp above baseline and ~13pp below
        // the engine's real output — guards against a regression that lets the
        // line wander chromatic/atonal. Hard-coded target set, not the engine's
        // own scale lookup, so this is not a tautology.
        expect(pentBluesShare).toBeGreaterThan(0.85);

        // (2) The DISCRIMINATING pentatonic claim: share landing on the minor-
        // pentatonic + blue-note CORE {0,3,5,7,10,6} — the 6-PC signature rock
        // scale, which is a strict subset of the 8-PC chord scale, so this is
        // NOT "stayed in scale" restated. Engine delivers 66.1%. Uniform-
        // chromatic baseline 0.50; uniform-over-the-8-PC-scale baseline is
        // 5/8 = 0.625 (the b5 isn't in the dom7 scale). Engine 0.661 clears
        // both. >0.58 sits above the chromatic baseline with ~8pp engine
        // headroom and guards that the rock line favors the pentatonic core
        // over the full diatonic set.
        expect(minorPentBlueShare).toBeGreaterThan(0.58);

        // (3) Double-stops. The rock soloist plays double-stops (config
        // doubleStopProb 0.1, scaled by intensity in the guitar-mode branch).
        // Engine delivers 7.7% of attacks as double-stops at intensity 0.85.
        // >0.04 guards the feature is alive (a regression zeroing the rock
        // double-stop branch drops this to ~0) with ~3.7pp headroom.
        expect(doubleStopRate).toBeGreaterThan(0.04);

        // (4) Bend devices (bluesCurl / slide) fire when intensity is up.
        // Engine delivers 5.3% bend-device share at intensity 0.85 vs 0.3% at
        // intensity 0.25 — an ~18x gate. Two assertions:
        //   - presence at high intensity: >0.03 (engine 0.053, ~2.3pp headroom)
        //   - intensity gating is real: high > low AND low stays near-zero
        //     (<0.015). A flat rate across intensities would mean the
        //     intensity>0.5 bluesCurl-priority gate (soloist-pitch-engine.ts
        //     ~1718) and the intensity-scaled deviceProb are dead.
        expect(bendShareHi).toBeGreaterThan(0.03);
        expect(bendShareLo).toBeLessThan(0.015);
        expect(bendShareHi).toBeGreaterThan(bendShareLo);
    });

    // why: style-resolution guard (the reggae dead-profile class of bug, #570).
    // This documents the CANONICAL routing so a future change can't silently
    // reroute it. Since #592 the Rock GENRE in smart mode resolves to 'rock'
    // (SMART_GENRES.Rock.soloist = 'rock') — the tailored bluesy profile this
    // critique exercises is now what users actually hear. 'shred' is the
    // explicit fast-lead voice, reached only by the UI style or Shred genre.
    // (The full cross-genre table lives in soloist-routing-guard.test.ts.)
    it('resolves Rock genre/style to the canonical soloist profiles', () => {
        // Smart mode + Rock feel → 'rock' (the SMART_GENRES routing — the
        // profile a user actually hears for the Rock genre, post-#592).
        expect(resolveSoloistStyle('smart', 'Rock')).toBe('rock');
        expect(resolveSoloistStyle(undefined, 'Rock')).toBe('rock');
        // An explicit 'rock' UI style is honored verbatim.
        expect(resolveSoloistStyle('rock', 'Rock')).toBe('rock');
        // #628: the `shred` phantom profile is retired; an explicit 'shred' style
        // now gracefully degrades to the genre's own 'rock' profile.
        expect(resolveSoloistStyle('shred', 'Rock')).toBe('rock');
    });
});
