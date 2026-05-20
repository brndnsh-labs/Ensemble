// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    compingState,
    generateCompingPattern,
    getAccompanimentNotes,
} from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock state
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Funk Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.7, complexity: 0.7, step: 0, intent: {} },
            groove: { genreFeel: 'Funk', pocket: 0, instruments: [] },
            soloist: makeSoloistMock({ enabled: true, busySteps: 0, lastFreq: 0 }),
            bass: { enabled: true, lastFreq: 110 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'smart', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 1000, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Funk performance', () => {
        const chordC7 = {
            rootMidi: 60,
            quality: '7',
            intervals: [0, 4, 7, 10],
            freqs: [261.63, 329.63, 392.0, 466.16],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chordC7];
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let syncopatedHits = 0;
        let totalStabs = 0;
        let leanVoicings = 0;

        for (let i = 0; i < totalSteps; i++) {
            mockState.playback.step = i;
            const stepInMeasure = i % 16;
            const notes = getAccompanimentNotes(
                getState(),
                chordC7,
                i,
                stepInMeasure,
                stepInMeasure,
                { isBeatStart: stepInMeasure % 4 === 0 },
                {},
            );

            if (notes.length > 0 && notes[0].midi > 0) {
                totalStabs++;
                // why: a 16th syncopation is anything that doesn't land on a quarter-
                //      note pulse (steps 0, 4, 8, 12). The earlier `% 2` metric
                //      counted `&` positions (steps 2, 6, 10, 14) as on-beat, which
                //      undercounted real syncopation by ~50% across the bank.
                if (stepInMeasure % 4 !== 0) {
                    syncopatedHits++;
                }
                if (notes.length <= 3) {
                    leanVoicings++;
                }
            }
        }

        const syncopationRatio = syncopatedHits / totalStabs;
        const leanRatio = leanVoicings / totalStabs;

        console.log(
            '\n--- FUNK PIANO CRITIQUE REPORT ---\n' +
                `[16th Syncopation]      ${(syncopationRatio * 100).toFixed(1)}%\n` +
                `[Lean Voicing (Clav)]   ${(leanRatio * 100).toFixed(1)}%\n` +
                `[Rhythmic Density]      ${(totalStabs / totalMeasures).toFixed(2)} hits/bar\n` +
                '------------------------------------\n',
        );

        expect(syncopationRatio).toBeGreaterThan(0.7);
        expect(leanRatio).toBeGreaterThan(0.9);
    });

    it('voices funk stabs as a 3-note Clav cell, not a 2-note jazz shell', () => {
        // why: chords.md P2 #17 / Epic 11 S6(b) — the funk lane previously
        //      targeted a 2-voice cluster (`selectCompactCluster(..., 2, ...)`),
        //      which reads as a jazz guide-tone shell. Authentic clav funk
        //      comping (Stevie Wonder "Superstition," Stubblefield-era JB) is a
        //      3-note cell. With the target bumped to 3, the dominant stab
        //      voicing across a long performance should be 3 notes — while the
        //      "lean voicing" critique above still holds (`<= 3`).
        const chordC9 = {
            rootMidi: 60,
            quality: '9',
            // root, 3, 5, b7, 9 — a real C9 voicing so the 3-note Clav cell
            // (3 + b7 + 9) can actually form.
            intervals: [0, 4, 7, 10, 14],
            freqs: [261.63, 329.63, 392.0, 466.16, 587.33],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chordC9];
        // why: 32 bars is ample for a near-deterministic ratio metric (the
        //      voicing math doesn't vary per bar) — keeping the loop short
        //      limits how many Math.random() draws this test consumes from the
        //      shared stream, so it does not shift the random state that later
        //      stochastic critique tests inherit in a full-suite run.
        const totalSteps = 32 * 16;

        let clavCell = 0;
        let totalStabs = 0;
        for (let i = 0; i < totalSteps; i++) {
            mockState.playback.step = i;
            const stepInMeasure = i % 16;
            const notes = getAccompanimentNotes(
                getState(),
                chordC9,
                i,
                stepInMeasure,
                stepInMeasure,
                { isBeatStart: stepInMeasure % 4 === 0 },
                {},
            );
            // Audible stabs only — drop muted ghost "chucks".
            const audible = notes.filter((n) => n.midi > 0 && !n.muted);
            if (audible.length > 0) {
                totalStabs++;
                // why: assert on voicing *content*, not note count — a 3-5-b7
                //      shell is also 3 notes but is not a Clav cell. The Clav
                //      idiom is the *gapped* 3 + b7 + 9: pitch classes 4, 10
                //      and 2 (relative to root 60) present, the 5th (pc 7)
                //      deliberately dropped so the 9 reads as the color voice.
                const pcs = new Set(audible.map((n) => (((n.midi - 60) % 12) + 12) % 12));
                const isGappedClavCell = pcs.has(4) && pcs.has(10) && pcs.has(2) && !pcs.has(7);
                if (isGappedClavCell) {
                    clavCell++;
                }
            }
        }

        const clavCellRatio = clavCell / totalStabs;
        console.log(
            '\n--- FUNK 3-NOTE CLAV CRITIQUE ---\n' +
                `[gapped 3+b7+9 cells]   ${(clavCellRatio * 100).toFixed(1)}%\n` +
                '----------------------------------\n',
        );
        // why: every funk stab over a C9 should voice the gapped Clav cell.
        //      Guard at 0.95 — well below 100% to absorb any phrase-end/ghost
        //      edge cases without flaking, but high enough that a regression
        //      back to a 3-5-b7 dominant shell (which lands near 0% because
        //      pc 7 would be present and pc 2 absent) fails loudly.
        expect(clavCellRatio).toBeGreaterThan(0.95);
    });

    // why: chords.md P0 #1 / epic-deterministic-phrasing S1. Funk comping must be
    //      a deterministic cell bank keyed by (sectionId, funkRotationIndex), not a
    //      per-bar Math.random() scatter. These tests prove (a) the bank has
    //      enough variety to read as motivic development across a section, (b) the
    //      same chord on the same bar of two consecutive loops produces the same
    //      rhythmic shape (the property that makes loop-comparison critique tests
    //      possible), and (c) end-to-end through the STICKY-groove pipeline the
    //      cell sequence visits the full 4-cell bank across a 32-bar window.
    describe('Funk comping cell bank (S1: deterministic phrasing)', () => {
        const ts4 = { beats: 4, stepsPerBeat: 4 };
        // generateCompingPattern reads only playback.bandIntensity off state, so a
        // minimal stub is enough for direct-bank assertions.
        const stateStub = { playback: { bandIntensity: 0.6, complexity: 0.5 } };

        const cellKey = (cell) => cell.join(',');

        // why: helper to reset module-level comping state so each loop starts
        //      identically. Used by the integration-level loop-determinism test.
        const resetCompingState = () => {
            compingState.currentVibe = 'balanced';
            compingState.currentCell = new Array(16).fill(0);
            compingState.lockedUntil = 0;
            compingState.soloistActivity = 0;
            compingState.lastChordIndex = -1;
            compingState.lastChordQuality = null;
            compingState.grooveRetentionCount = 0;
            compingState.maxGrooveLength = 4;
            compingState.lastSectionId = null;
            compingState.lastVoicingMidis = [];
            compingState.funkRotationIndex = 0;
        };

        it('produces all 4 distinct cells across 8 bars in one section (variety)', () => {
            const seen = new Set();
            for (let bar = 0; bar < 8; bar++) {
                const cell = generateCompingPattern(
                    stateStub,
                    'Funk',
                    'balanced',
                    ts4,
                    16,
                    bar,
                    'A',
                );
                seen.add(cellKey(cell));
            }
            console.log(
                `\n--- FUNK CELL-BANK VARIETY ---\n` +
                    `[Distinct cells across 8 bars] ${seen.size}\n` +
                    `--------------------------------\n`,
            );
            // why: P0-2 — with the `>> 1` aliasing removed (reviewer P0-1), the
            //      hash `sectionHash*17 + barIndex*31` mod 4 cycles through all
            //      4 bank entries across any 4 consecutive bar indices. 8 bars
            //      must hit the full bank; threshold tightened from 3 -> 4.
            expect(seen.size).toBeGreaterThanOrEqual(4);
        });

        it('locks the same cell across loop boundaries (deterministic across restarts)', () => {
            // why: P1-5 — the previous version of this test asserted
            //      `generateCompingPattern(args) === generateCompingPattern(args)`,
            //      which is a tautology (the function is pure). Repurposed to
            //      cover the real loop-comparison property: bar 8 reached by
            //      counting bar 0..8 must produce the same cell as bar 8 reached
            //      by jumping straight to bar 8 (loop restart at bar 8). This
            //      would catch any regression where the picker started keying off
            //      hidden state instead of the (sectionId, barIndex) tuple.
            const sequential = [];
            for (let bar = 0; bar <= 8; bar++) {
                sequential.push(
                    cellKey(
                        generateCompingPattern(stateStub, 'Funk', 'balanced', ts4, 16, bar, 'A'),
                    ),
                );
            }
            const restartAt8 = cellKey(
                generateCompingPattern(stateStub, 'Funk', 'balanced', ts4, 16, 8, 'A'),
            );
            // Bar 8 reached two different ways must produce the same cell.
            expect(restartAt8).toEqual(sequential[8]);
            // And the full sequence is reproducible bar-for-bar on a fresh call.
            const replay = [];
            for (let bar = 0; bar <= 8; bar++) {
                replay.push(
                    cellKey(
                        generateCompingPattern(stateStub, 'Funk', 'balanced', ts4, 16, bar, 'A'),
                    ),
                );
            }
            expect(replay).toEqual(sequential);
        });

        it('varies cell choice across distinct sectionIds (same barIndex)', () => {
            // why: P1-4 — the sectionId hash is folded into the cell pick, so
            //      sections that hash to different `% 4` buckets produce different
            //      cells at *every* phrase index. Threshold tightened from `>0`
            //      (satisfied by a single hash collision) to `>=4` (half the bars
            //      differ across two sectionIds — proves the hash isn't degenerate).
            let diffs = 0;
            for (let bar = 0; bar < 8; bar++) {
                const a = cellKey(
                    generateCompingPattern(stateStub, 'Funk', 'balanced', ts4, 16, bar, 'A'),
                );
                const b = cellKey(
                    generateCompingPattern(stateStub, 'Funk', 'balanced', ts4, 16, bar, 'B'),
                );
                if (a !== b) {
                    diffs++;
                }
            }
            expect(diffs).toBeGreaterThanOrEqual(4);
        });

        it('updateRhythmicIntent visits the full bank across 32 bars per section (simulation gate)', () => {
            // why: P0-1 simulation gate. Drive updateRhythmicIntent for 32 bars
            //      across 4 distinct sectionIds and confirm each one visits at
            //      least 4 distinct cells (the full bank size). This is the test
            //      the reviewer's STICKY-collapse finding required: before P0-1
            //      was fixed, every sectionId collapsed to 1-2 cells after the
            //      first few rotations because `barIndex >> 1` aliased with the
            //      {4, 8} rotation snap.
            const chordC7 = {
                rootMidi: 60,
                quality: '7',
                intervals: [0, 4, 7, 10],
                freqs: [261.63, 329.63, 392.0, 466.16],
                sectionId: 'A',
            };
            mockState.arranger.progression = [chordC7];
            mockState.playback.bandIntensity = 0.6;
            mockState.playback.complexity = 0.5;

            const runSection = (sectionId) => {
                resetCompingState();
                const chord = { ...chordC7, sectionId };
                const totalBars = 32;
                const cells = [];
                for (let bar = 0; bar < totalBars; bar++) {
                    const stepAbs = bar * 16;
                    mockState.playback.step = stepAbs;
                    getAccompanimentNotes(
                        getState(),
                        chord,
                        stepAbs,
                        0,
                        0,
                        { isBeatStart: true },
                        {},
                    );
                    cells.push(compingState.currentCell.join(''));
                }
                return cells;
            };

            const sections = ['A', 'B', 'Verse', 'Chorus'];
            const distinctPerSection = {};
            for (const sid of sections) {
                const cells = runSection(sid);
                distinctPerSection[sid] = new Set(cells).size;
            }
            console.log(
                `\n--- FUNK STICKY 32-BAR SIMULATION ---\n` +
                    sections
                        .map(
                            (sid) => `[${sid.padEnd(7)}] ${distinctPerSection[sid]} distinct cells`,
                        )
                        .join('\n') +
                    `\n--------------------------------------\n`,
            );
            // why: simulation gate from the reviewer's P0-1 acceptance — each
            //      section must visit the full bank (>=4 cells) over 32 bars.
            for (const sid of sections) {
                expect(distinctPerSection[sid]).toBeGreaterThanOrEqual(4);
            }
        });

        it('updateRhythmicIntent reproduces the same cell sequence across two loops (integration determinism)', () => {
            // Integration-level loop-determinism check. Two passes through the full
            // STICKY-groove + section-reset pipeline must produce bar-for-bar
            // identical cell sequences. This is the property loop-comparison
            // critique tests rely on end-to-end.
            const chordC7 = {
                rootMidi: 60,
                quality: '7',
                intervals: [0, 4, 7, 10],
                freqs: [261.63, 329.63, 392.0, 466.16],
                sectionId: 'A',
            };
            mockState.arranger.progression = [chordC7];
            mockState.playback.bandIntensity = 0.6;
            mockState.playback.complexity = 0.5;

            const runLoop = () => {
                resetCompingState();
                const totalBars = 32;
                const cells = [];
                for (let bar = 0; bar < totalBars; bar++) {
                    const stepAbs = bar * 16;
                    mockState.playback.step = stepAbs;
                    getAccompanimentNotes(
                        getState(),
                        chordC7,
                        stepAbs,
                        0,
                        0,
                        { isBeatStart: true },
                        {},
                    );
                    cells.push(compingState.currentCell.join(''));
                }
                return cells;
            };

            const loop1 = runLoop();
            const loop2 = runLoop();
            expect(loop2).toEqual(loop1);

            const distinctCells = new Set(loop1).size;
            console.log(
                `\n--- FUNK COMPING LOOP DETERMINISM ---\n` +
                    `[Distinct cells across 32 bars] ${distinctCells}\n` +
                    `--------------------------------------\n`,
            );
            // why: P0-2 — threshold tightened from `>=2` (sub-baseline; the engine
            //      collapsed to 1-2 cells before P0-1 was fixed) to `>=4` (the
            //      full bank size, the actual claim S1 makes about cell variety).
            expect(distinctCells).toBeGreaterThanOrEqual(4);
        });
    });
});
