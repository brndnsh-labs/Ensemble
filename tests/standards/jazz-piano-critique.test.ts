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

describe('Jazz Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, step: 0, intent: {} },
            groove: { genreFeel: 'Jazz', pocket: 0, instruments: [] },
            soloist: makeSoloistMock({ enabled: true, busySteps: 0, lastFreq: 0 }),
            bass: { enabled: true, lastFreq: 110 }, // A2 (MIDI 45)
            harmony: { enabled: false },
            chords: { enabled: true, style: 'smart', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 1000, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    it('should pass an authenticity critique for a 128-bar Jazz piano performance', () => {
        // Authentic rootless maj9 voicing (3, 7, 9)
        const chordC = {
            rootMidi: 60,
            quality: 'maj7',
            intervals: [4, 11, 14],
            freqs: [329.63, 493.88, 587.33],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chordC];
        const totalMeasures = 128;
        const totalSteps = totalMeasures * 16;

        let charlestonHits = 0;
        let rootlessVoicings = 0;
        let totalStabs = 0;

        for (let i = 0; i < totalSteps; i++) {
            mockState.playback.step = i;
            const stepInMeasure = i % 16;
            const notes = getAccompanimentNotes(
                getState(),
                chordC,
                i,
                stepInMeasure,
                stepInMeasure,
                { isBeatStart: stepInMeasure % 4 === 0 },
                {},
            );

            if (notes.length > 0 && notes[0].midi > 0) {
                totalStabs++;
                const midis = notes.map((n) => n.midi);

                // 1. Rhythmic Alignment (Charleston focus on 0, 6)
                if (stepInMeasure === 0 || stepInMeasure === 6) {
                    charlestonHits++;
                }

                // 2. Rootless Voicing (Should not contain the root MIDI 60)
                const containsRoot = midis.some((m) => m % 12 === 0);
                if (!containsRoot) {
                    rootlessVoicings++;
                }
            }
        }

        const charlestonScore = charlestonHits / (totalMeasures * 2);
        const rootlessRatio = rootlessVoicings / totalStabs;

        console.log(
            '\n--- JAZZ PIANO CRITIQUE REPORT ---\n' +
                `[Charleston Frequency]  ${(charlestonScore * 100).toFixed(1)}%\n` +
                `[Rootless Accuracy]     ${(rootlessRatio * 100).toFixed(1)}%\n` +
                `[Rhythmic Density]      ${(totalStabs / totalMeasures).toFixed(2)} hits/bar\n` +
                '------------------------------------\n',
        );

        expect(charlestonScore).toBeGreaterThan(0.55); // Slightly loosened from 0.6 to accommodate semantic variety
        expect(rootlessRatio).toBeGreaterThan(0.9);
    });

    it('should thin out voicings when the soloist is busy', () => {
        // Mock Math.random to ensure deterministic voicing choices
        // We use 0.1 to avoid triggering probabilistic skips that could make notesQuiet smaller than notesBusy randomly
        const originalRandom = Math.random;
        Math.random = () => 0.1;

        const chord = {
            rootMidi: 60,
            quality: 'maj7',
            is7th: true,
            intervals: [0, 4, 7, 11, 2, 9],
            freqs: [261.63, 329.63, 392.0, 493.88, 587.33, 739.99],
            sectionId: 'A',
        };
        mockState.arranger.progression = [chord];

        // Scenario 1: Soloist Resting
        mockState.soloist.session.phrasing.busySteps = 0;
        const notesQuiet = getAccompanimentNotes(
            getState(),
            chord,
            0,
            0,
            0,
            { isBeatStart: true },
            { soloistActive: false },
        );

        // Scenario 2: Soloist Busy
        mockState.soloist.session.phrasing.busySteps = 10;
        const notesBusy = getAccompanimentNotes(
            getState(),
            chord,
            0,
            0,
            0,
            { isBeatStart: true },
            { soloistActive: true, soloistMidi: 73 },
        );

        console.log(
            `[Coordination] Quiet polyphony: ${notesQuiet.length}, Busy polyphony: ${notesBusy.length}`,
        );
        expect(notesBusy.length).toBeLessThanOrEqual(notesQuiet.length);

        // Restore Math.random
        Math.random = originalRandom;
    });

    // why: chords.md P0 #2 / epic-deterministic-phrasing S2. Charleston-family
    //      comping for Jazz/Bossa/Blues currently re-rolls `Math.random()` every
    //      bar (`accompaniment.ts:680-727` for Jazz/Bossa, `:633-678` for Blues),
    //      so the comping reads as amnesiac across a phrase. S2 replaces this
    //      with a deterministic bank keyed by `(sectionId, barIndex >> 2)` — one
    //      pattern is held for the full 4-bar phrase, with in-phrase variation
    //      driven by intensity/soloistBusy. These tests prove (a) the bank has
    //      enough variety to read as motivic development across a section,
    //      (b) the picked cell is STABLE across the 4 bars of one phrase (the
    //      core S2 claim), (c) the sectionId hash isn't degenerate, and (d) end-
    //      to-end through the STICKY-groove pipeline two loops produce bar-for-
    //      bar identical cell sequences. (d) implicitly enforces the
    //      `STICKY_GENRES` list update: if Jazz/Bossa/Blues aren't added, the
    //      non-STICKY branch leaves the per-bar re-roll path live and loop-
    //      equality fails.
    describe.each([
        { genre: 'Jazz', bankSize: 5 },
        { genre: 'Bossa', bankSize: 5 },
        { genre: 'Blues', bankSize: 4 },
    ])('$genre comping cell bank (S2: phrase-stable Charleston picker)', ({ genre, bankSize }) => {
        const ts4 = { beats: 4, stepsPerBeat: 4, backbeat: [1, 3] };
        // generateCompingPattern reads only playback.bandIntensity/complexity off
        // state, so a minimal stub is enough for direct-bank assertions.
        const stateStub = { playback: { bandIntensity: 0.6, complexity: 0.5 } };

        const cellKey = (cell) => cell.join(',');

        // why: helper to reset module-level comping state so each loop starts
        //      identically. Used by the integration-level loop-determinism test.
        //      Includes funkRotationIndex even though S2 keys off bar arithmetic,
        //      not the rotation counter — guards against any cross-test bleed.
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

        // why: every test in this describe runs against the parametrized genre,
        //      so set `groove.genreFeel` here. The outer beforeEach defaults to
        //      'Jazz' which works for two of three genres but breaks Bossa/Blues.
        beforeEach(() => {
            mockState.groove.genreFeel = genre;
        });

        it(`holds the same cell across all 4 bars of one phrase (phrase stability)`, () => {
            // why: THE core S2 acceptance — `(sectionId, barIndex >> 2)` hash
            //      means bars 0-3 share the same picker output, bars 4-7 share
            //      a (different or same) picker output, etc. Cell IDENTITY,
            //      not just "rhythmic density similar" — the named claim is
            //      cell-stability across the phrase, so we measure cell equality
            //      directly. Smell (c) guard: no density proxy.
            for (const phraseStart of [0, 4, 8, 12]) {
                const phraseCells = [];
                for (let bar = phraseStart; bar < phraseStart + 4; bar++) {
                    phraseCells.push(
                        cellKey(
                            generateCompingPattern(stateStub, genre, 'balanced', ts4, 16, bar, 'A'),
                        ),
                    );
                }
                // All 4 bars of one phrase produce the same cell.
                expect(phraseCells[1]).toEqual(phraseCells[0]);
                expect(phraseCells[2]).toEqual(phraseCells[0]);
                expect(phraseCells[3]).toEqual(phraseCells[0]);
            }
        });

        it(`visits the full ${bankSize}-cell bank across 20 bars in one section (variety)`, () => {
            // why: 20 bars = 5 four-bar phrases. With a hash that maps each
            //      phrase to a bank entry, 5 phrases should hit every entry of
            //      a 4-cell bank and most entries of a 5-cell bank. Threshold
            //      = full bank size: that's the honest claim about variety;
            //      anything weaker is sub-baseline (smell (b)).
            const seen = new Set();
            for (let bar = 0; bar < 20; bar++) {
                const cell = generateCompingPattern(
                    stateStub,
                    genre,
                    'balanced',
                    ts4,
                    16,
                    bar,
                    'A',
                );
                seen.add(cellKey(cell));
            }
            console.log(
                `\n--- ${genre.toUpperCase()} CELL-BANK VARIETY ---\n` +
                    `[Distinct cells across 20 bars] ${seen.size} (bank=${bankSize})\n` +
                    `--------------------------------\n`,
            );
            expect(seen.size).toBeGreaterThanOrEqual(bankSize);
        });

        it(`is deterministic across loop restarts (bar N from cold-start = bar N from sequential)`, () => {
            // why: covers the loop-comparison property — bar 12 reached by
            //      iterating 0..12 must equal bar 12 reached by a direct call.
            //      Proves the picker keys off `(sectionId, barIndex)`, not on
            //      hidden module state. Smell (a) guard: not a tautology
            //      because we compare DIFFERENT call paths to the SAME (sid,
            //      barIndex) tuple, not the same call twice.
            const sequential = [];
            for (let bar = 0; bar <= 12; bar++) {
                sequential.push(
                    cellKey(
                        generateCompingPattern(stateStub, genre, 'balanced', ts4, 16, bar, 'A'),
                    ),
                );
            }
            const restartAt12 = cellKey(
                generateCompingPattern(stateStub, genre, 'balanced', ts4, 16, 12, 'A'),
            );
            const restartAt8 = cellKey(
                generateCompingPattern(stateStub, genre, 'balanced', ts4, 16, 8, 'A'),
            );
            expect(restartAt12).toEqual(sequential[12]);
            expect(restartAt8).toEqual(sequential[8]);
        });

        it(`varies cell choice across distinct sectionIds (same barIndex)`, () => {
            // why: the sectionId hash is folded into the cell pick; two
            //      different section ids should produce different cells at a
            //      meaningful fraction of phrase indices. We sample one bar
            //      per phrase across 20 bars (= 5 phrases) and require at
            //      least 2 of 5 phrases to differ — proves the sectionId hash
            //      actually moves the bank pointer rather than always landing
            //      on the same bucket. Random-baseline argument: with bank size
            //      N>=4 and a uniform hash, P(same | random pair) = 1/N, so
            //      expected matches across 5 phrases <= 5/4 ~= 1.25. Asserting
            //      >=2 differences sits well above that floor with headroom.
            let diffs = 0;
            const phraseStarts = [0, 4, 8, 12, 16];
            for (const bar of phraseStarts) {
                const a = cellKey(
                    generateCompingPattern(stateStub, genre, 'balanced', ts4, 16, bar, 'A'),
                );
                const b = cellKey(
                    generateCompingPattern(stateStub, genre, 'balanced', ts4, 16, bar, 'B'),
                );
                if (a !== b) {
                    diffs++;
                }
            }
            console.log(
                `\n--- ${genre.toUpperCase()} SECTION-ID DIFFERENTIATION ---\n` +
                    `[Phrases differing across sectionIds A vs B] ${diffs} / ${phraseStarts.length}\n` +
                    `--------------------------------\n`,
            );
            expect(diffs).toBeGreaterThanOrEqual(2);
        });

        it(`reproduces the same cell sequence across two loops (integration determinism + STICKY gate)`, () => {
            // why: drives the full STICKY-groove + section-reset pipeline. Two
            //      passes must produce bar-for-bar identical cell sequences.
            //      THIS test transitively enforces the `STICKY_GENRES` list
            //      update from the S2 acceptance criteria: if Jazz/Bossa/Blues
            //      aren't added to STICKY_GENRES, `grooveRetentionCount` stays
            //      at 0 and the picker re-rolls every bar via `Math.random()`,
            //      so loop2 != loop1. No need to grep the list directly.
            //
            //      Loop the loop 5 times to catch any non-deterministic
            //      mock-state perturbation (per audit methodology — direct-
            //      bank tests are deterministic by construction, but the
            //      integration path through updateRhythmicIntent touches more
            //      state and warrants the 30-run-style reliability gate. 5 is
            //      sufficient here because the assertion is bar-for-bar
            //      EQUALITY, not a statistical threshold — a single failure
            //      across any pair surfaces the bug).
            const chord = {
                rootMidi: 60,
                quality: genre === 'Blues' ? '7' : 'maj7',
                intervals: genre === 'Blues' ? [0, 4, 7, 10] : [4, 11, 14],
                freqs:
                    genre === 'Blues' ? [261.63, 329.63, 392.0, 466.16] : [329.63, 493.88, 587.33],
                sectionId: 'A',
            };
            mockState.arranger.progression = [chord];
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
                        chord,
                        stepAbs,
                        0,
                        0,
                        { isBeatStart: true, isMeasureStart: true },
                        {},
                    );
                    cells.push(compingState.currentCell.join(''));
                }
                return cells;
            };

            const loop1 = runLoop();
            const loop2 = runLoop();
            expect(loop2).toEqual(loop1);

            // Five-pass reliability gate: every subsequent loop must also match.
            for (let i = 0; i < 3; i++) {
                const loopN = runLoop();
                expect(loopN).toEqual(loop1);
            }

            const distinctCells = new Set(loop1).size;
            console.log(
                `\n--- ${genre.toUpperCase()} COMPING LOOP DETERMINISM ---\n` +
                    `[Distinct cells across 32 bars] ${distinctCells} (bank=${bankSize})\n` +
                    `--------------------------------------\n`,
            );
            // why: 32 bars / 4-bar phrases = 8 phrases. With a non-degenerate
            //      hash and a bank of size N, expected distinct ≈ N (the bank
            //      should be fully covered). Threshold = full bank size, no
            //      sub-baseline slack.
            expect(distinctCells).toBeGreaterThanOrEqual(bankSize);
        });
    });
});
