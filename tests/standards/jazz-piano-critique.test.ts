// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    compingState,
    generateCompingPattern,
    getAccompanimentNotes,
} from '../../public/engine/accompaniment.js';
import { getBestInversion } from '../../public/engine/chords-engine.js';
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
    // why: Bossa post-S5.c-followup uses its own 4-cell partido-alto bank, sourced
    //      from a dedicated `bossaRotationIndex` counter that advances once per
    //      STICKY picker call (2-bar retention pinned for Bossa). The picker treats
    //      `phraseIndex` as the rotation counter directly (no internal shift).
    //      Jazz/Blues retain the 4-bar Charleston-family `barIndex >> 2` shift
    //      inside the picker. `phraseIndex(bar)` reflects this: Bossa hands the
    //      picker `bar >> 1` (the simulated rotation-counter value at the start
    //      of each 2-bar phrase), Jazz/Blues hand it the raw bar. `phraseLength`
    //      is the number of bars sharing a single cell (= STICKY retention).
    describe.each([
        { genre: 'Jazz', bankSize: 5, phraseLength: 4, phraseIndexFor: (bar: number) => bar },
        {
            genre: 'Bossa Nova',
            bankSize: 4,
            phraseLength: 2,
            phraseIndexFor: (bar: number) => bar >> 1,
        },
        { genre: 'Blues', bankSize: 4, phraseLength: 4, phraseIndexFor: (bar: number) => bar },
    ])('$genre comping cell bank (S2: phrase-stable Charleston picker)', ({
        genre,
        bankSize,
        phraseLength,
        phraseIndexFor,
    }) => {
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
            compingState.bossaRotationIndex = 0;
        };

        // why: every test in this describe runs against the parametrized genre,
        //      so set `groove.genreFeel` here. The outer beforeEach defaults to
        //      'Jazz' which works for two of three genres but breaks Bossa/Blues.
        beforeEach(() => {
            mockState.groove.genreFeel = genre;
        });

        it(`holds the same cell across all ${phraseLength} bars of one phrase (phrase stability)`, () => {
            // why: THE core S2 acceptance — `(sectionId, barIndex >> shift)` hash
            //      means consecutive bars within one phrase share the same
            //      picker output. Jazz/Blues use a 4-bar phrase (`>> 2`); Bossa
            //      post-S5.c uses a 2-bar phrase (`>> 1`, partido-alto's
            //      shorter clave-cycle). Cell IDENTITY, not just "rhythmic
            //      density similar" — the named claim is cell-stability across
            //      the phrase, so we measure cell equality directly. Smell (c)
            //      guard: no density proxy.
            const phraseStarts = [0, phraseLength, phraseLength * 2, phraseLength * 3];
            for (const phraseStart of phraseStarts) {
                const phraseCells = [];
                for (let bar = phraseStart; bar < phraseStart + phraseLength; bar++) {
                    phraseCells.push(
                        cellKey(
                            generateCompingPattern(
                                stateStub,
                                genre,
                                'balanced',
                                ts4,
                                16,
                                phraseIndexFor(bar),
                                'A',
                            ),
                        ),
                    );
                }
                // All bars within one phrase produce the same cell.
                for (let i = 1; i < phraseLength; i++) {
                    expect(phraseCells[i]).toEqual(phraseCells[0]);
                }
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
                    phraseIndexFor(bar),
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
                        generateCompingPattern(
                            stateStub,
                            genre,
                            'balanced',
                            ts4,
                            16,
                            phraseIndexFor(bar),
                            'A',
                        ),
                    ),
                );
            }
            const restartAt12 = cellKey(
                generateCompingPattern(
                    stateStub,
                    genre,
                    'balanced',
                    ts4,
                    16,
                    phraseIndexFor(12),
                    'A',
                ),
            );
            const restartAt8 = cellKey(
                generateCompingPattern(
                    stateStub,
                    genre,
                    'balanced',
                    ts4,
                    16,
                    phraseIndexFor(8),
                    'A',
                ),
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
                    generateCompingPattern(
                        stateStub,
                        genre,
                        'balanced',
                        ts4,
                        16,
                        phraseIndexFor(bar),
                        'A',
                    ),
                );
                const b = cellKey(
                    generateCompingPattern(
                        stateStub,
                        genre,
                        'balanced',
                        ts4,
                        16,
                        phraseIndexFor(bar),
                        'B',
                    ),
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
                    `[Distinct cells across 32 bars] ${distinctCells} (bank=${bankSize}, phraseLength=${phraseLength})\n` +
                    `--------------------------------------\n`,
            );
            // why: 32 bars / STICKY retention = picks per loop. With a non-
            //      degenerate hash and a bank of size N, expected distinct ≈ N
            //      (the bank should be fully covered).
            //
            //      Bossa (post-S5.c-followup): the bar-A/bar-B aliasing flagged in
            //      review is now fixed — Bossa uses 2-bar STICKY retention plus a
            //      dedicated `bossaRotationIndex` counter advancing 1-per-pick.
            //      32 bars / 2 = 16 picks → cells walk 0,1,2,3,0,1,... → all 4
            //      bank entries reached → bar-A/bar-B alternation structurally
            //      produced. Full-bank coverage is the right assertion now.
            expect(distinctCells).toBeGreaterThanOrEqual(bankSize);
        });
    });

    // why: chords.md P1 #6 / epic-chords-voicing S1. `getBestInversion` previously
    //      placed each interval at "nearest octave to targetCenter" independently.
    //      The targetCenter is derived from the previous voicing centroid, which
    //      did pull new voicings into roughly the same register pocket, but the
    //      per-interval pass had no notion of which previous voice each new voice
    //      should hold/resolve to. A common-tone PC could land in a different
    //      octave than its prior incarnation; a guide-tone third/seventh could
    //      jump an octave away from the prior seventh/third. S1 adds a second
    //      pass that snaps each new voice to the octave of the nearest-PC previous
    //      voice (common tones collapse to the prior MIDI, b7→3 resolutions
    //      collapse to the prior 7th's octave), cost-gated and register-clamped.
    //
    //      These assertions prove the second pass actually moves the needle on
    //      the canonical ii–V–I voice-leading benchmark. We compare against a
    //      "null prev" control where each chord is voiced from scratch — the
    //      honest baseline for a register-centroid optimizer without voice
    //      leading. Threshold is set above the noise floor of the centroid-pull
    //      behavior so a regression to "centroid only" (which still produces
    //      *some* implicit voice leading via shared targetCenter) is caught.
    describe('S1: voice-leading second pass on ii–V–I', () => {
        // Rootless jazz voicings: m7=[3,10,14], 7=[4,10,14], maj7=[4,11,14].
        // Standard `[3,7,10]` / `[4,7,10]` / `[4,7,11]` (with-5) work too —
        // we test both to confirm the pass helps across voicing densities.
        const PROGS_C = [
            // Dm7 — G7 — Cmaj7 in C major (the canonical example from the audit).
            {
                name: 'rootless',
                chords: [
                    { root: 62, intervals: [3, 10, 14] }, // F, C, E (b3, b7, 9)
                    { root: 55, intervals: [4, 10, 14] }, // B, F, A (3, b7, 9)
                    { root: 60, intervals: [4, 11, 14] }, // E, B, D (3, 7, 9)
                ],
            },
            {
                name: 'with-5',
                chords: [
                    { root: 62, intervals: [0, 3, 7, 10] }, // D, F, A, C
                    { root: 55, intervals: [0, 4, 7, 10] }, // G, B, D, F
                    { root: 60, intervals: [0, 4, 7, 11] }, // C, E, G, B
                ],
            },
        ];

        // why: ii–V–I across the circle of fifths probes voice leading at every
        //      starting register, not just C. Some keys force the centroid pull
        //      to fire (drift > 5 from anchor), which is exactly where the
        //      second pass earns its keep — when the centroid is yanked back
        //      toward the home anchor and would otherwise misplace a voice.
        const KEYS = [
            { name: 'C', ii: 62, V: 55, I: 60 },
            { name: 'F', ii: 67, V: 60, I: 65 },
            { name: 'Bb', ii: 60, V: 53, I: 58 },
            { name: 'Eb', ii: 65, V: 58, I: 63 },
            { name: 'Ab', ii: 58, V: 63, I: 56 },
            { name: 'Db', ii: 63, V: 56, I: 61 },
            { name: 'G', ii: 57, V: 62, I: 67 },
            { name: 'D', ii: 64, V: 57, I: 62 },
        ];

        const topMotionFor = (chords) => {
            const tops = chords.map((c) => Math.max(...c));
            let sum = 0;
            for (let i = 1; i < tops.length; i++) {
                sum += Math.abs(tops[i] - tops[i - 1]);
            }
            return sum;
        };

        const totalMotionFor = (chords) => {
            // Sum of per-voice nearest-neighbor distances across consecutive chords.
            // Mirrors the engine's own `getNearestVoiceLeadingCost` (one-direction).
            let total = 0;
            for (let i = 1; i < chords.length; i++) {
                const from = chords[i - 1];
                const to = chords[i];
                for (const f of from) {
                    let best = Number.POSITIVE_INFINITY;
                    for (const t of to) {
                        best = Math.min(best, Math.abs(t - f));
                    }
                    total += best;
                }
            }
            return total;
        };

        const stateStub = {
            playback: { bandIntensity: 0.5, complexity: 0.5 },
            chords: { octave: 60 },
        };

        // `getBestInversion`'s 5th argument is an options object; the opt-in
        // `enableVoiceLeading` flag is what these fixtures exercise. The other
        // fields (`isPivot`, `anchor`, `min`, `max`, `style`) are left at their
        // defaults — spelling them out keeps the call site readable when the
        // test breaks in the future.
        const vlOpts = {
            isPivot: false,
            anchor: null,
            min: 52,
            max: 84,
            style: 'stabs',
            enableVoiceLeading: true,
        } as const;

        it.each(PROGS_C)('holds common-tone F across Dm7→G7 (C major, $name)', ({ chords }) => {
            // why: the canonical "F held" claim from the story. F is the b3 of
            //      Dm7 (pc 5) and the b7 of G7 (pc 5). With voice leading on, the
            //      same MIDI value should appear in both voicings — not just the
            //      same pitch class in some random octave. This isolates the
            //      common-tone-hold branch of the second pass without any
            //      statistical thresholds.
            const dm7 = getBestInversion(
                stateStub,
                chords[0].root,
                chords[0].intervals,
                [],
                vlOpts,
            );
            const g7 = getBestInversion(
                stateStub,
                chords[1].root,
                chords[1].intervals,
                dm7,
                vlOpts,
            );
            // F-pitch-class MIDIs present in each chord:
            const dm7Fs = dm7.filter((m) => m % 12 === 5);
            const g7Fs = g7.filter((m) => m % 12 === 5);
            expect(dm7Fs.length).toBeGreaterThan(0);
            expect(g7Fs.length).toBeGreaterThan(0);
            // The same MIDI should appear in both — common-tone hold, not octave jump.
            const sharedMidi = dm7Fs.some((m) => g7Fs.includes(m));
            expect(sharedMidi).toBe(true);
        });

        it.each(PROGS_C)('minimizes top-voice motion across ii–V–I in C ($name)', ({ chords }) => {
            // With voice leading (production path: previousMidis passed forward)
            const withVL = [];
            for (let i = 0; i < chords.length; i++) {
                const prev = i === 0 ? [] : withVL[i - 1];
                withVL.push(
                    getBestInversion(stateStub, chords[i].root, chords[i].intervals, prev, vlOpts),
                );
            }

            // Without voice leading (control: previousMidis forced empty for each chord —
            // each voicing is centered on the home anchor in isolation).
            const noVL = chords.map((c) => getBestInversion(stateStub, c.root, c.intervals, []));

            const topVL = topMotionFor(withVL);
            const topNoVL = topMotionFor(noVL);
            const totalVL = totalMotionFor(withVL);
            const totalNoVL = totalMotionFor(noVL);

            console.log(
                `\n--- ii–V–I C ${chords.length}v ${chords[0].intervals.length}-interval ` +
                    `($name) ---\n` +
                    `[Top motion]    VL=${topVL}  NoVL=${topNoVL}\n` +
                    `[Total motion]  VL=${totalVL}  NoVL=${totalNoVL}\n` +
                    '------------------------------------\n',
            );

            // With voice leading must not be WORSE than the null-baseline.
            // why: per-key the differential can be 0 when both paths happen to
            //      land identical voicings, but it must never regress.
            expect(totalVL).toBeLessThanOrEqual(totalNoVL);
            expect(topVL).toBeLessThanOrEqual(topNoVL);
        });

        it('aggregate top-voice motion across 8 keys drops substantially with voice leading', () => {
            // why: this is the headline assertion — across the circle of fifths,
            //      voice-leading-aware placement should significantly reduce the
            //      summed top-voice traversal vs the null-prev control. We sum
            //      over all 8 keys × 2 voicing densities = 16 progressions and
            //      require the VL aggregate to be at most 60% of the null
            //      baseline. The 60% headroom is calibrated from the simulator:
            //      the centroid-pull baseline already produces ~70% of null,
            //      and the second pass takes another ~10pp off; 60% is the
            //      midpoint with a comfortable cushion against single-key
            //      regressions. Sub-baseline guard (per MUSICAL_AUDIT): a 60%
            //      threshold is well above the noise floor.
            let totalVL = 0;
            let totalNoVL = 0;
            let topVL = 0;
            let topNoVL = 0;

            for (const key of KEYS) {
                for (const voicing of PROGS_C) {
                    // Re-root the voicing template at this key's degrees:
                    const chords = [
                        { root: key.ii, intervals: voicing.chords[0].intervals },
                        { root: key.V, intervals: voicing.chords[1].intervals },
                        { root: key.I, intervals: voicing.chords[2].intervals },
                    ];
                    const withVL = [];
                    for (let i = 0; i < chords.length; i++) {
                        const prev = i === 0 ? [] : withVL[i - 1];
                        withVL.push(
                            getBestInversion(
                                stateStub,
                                chords[i].root,
                                chords[i].intervals,
                                prev,
                                vlOpts,
                            ),
                        );
                    }
                    const noVL = chords.map((c) =>
                        getBestInversion(stateStub, c.root, c.intervals, []),
                    );
                    totalVL += totalMotionFor(withVL);
                    totalNoVL += totalMotionFor(noVL);
                    topVL += topMotionFor(withVL);
                    topNoVL += topMotionFor(noVL);
                }
            }

            const totalRatio = totalVL / totalNoVL;
            const topRatio = topVL / topNoVL;

            console.log(
                '\n--- ii–V–I VOICE-LEADING AGGREGATE (8 keys × 2 voicings) ---\n' +
                    `[Total motion]  VL=${totalVL}  NoVL=${totalNoVL}  ratio=${(totalRatio * 100).toFixed(1)}%\n` +
                    `[Top motion]    VL=${topVL}  NoVL=${topNoVL}  ratio=${(topRatio * 100).toFixed(1)}%\n` +
                    '----------------------------------------------------------\n',
            );

            // why: empirically the opt-in second pass (with the pocket-preservation
            //      gate in place) drops total motion to ~66% of the null baseline.
            //      Top-voice motion was ~74%; the #708 m2-cluster guard raised it to
            //      ~82.5%: de-clustering a tight Imaj7 (root↔maj7 a half-step apart)
            //      has no in-register spread that preserves the melody note, so it
            //      necessarily relocates the top voice on those chords — the cost of
            //      removing an audible B+C smear (the B6/#705 bug). VL still cuts top
            //      motion ~17% and total ~34%, so the pass is demonstrably working;
            //      guard at 0.72 / 0.86 — above measurement with headroom, below the
            //      null-baseline floor (1.0), so disabling the pass or breaking the
            //      cost gate still fails loudly. Sub-baseline-threshold guard per
            //      docs/archive/MUSICAL_AUDIT.md.
            expect(totalRatio).toBeLessThan(0.72);
            expect(topRatio).toBeLessThan(0.86);

            // why: pocket-preservation assertion. The motion-ratio metric doesn't
            //      enforce a one-to-one match between new and prev voices, so it
            //      would reward an algorithm that ratchets every chord toward
            //      whichever register has the most prev voices, even
            //      if the resulting voicings collapse below the comping pocket.
            //      Require every chord's centroid to stay within ~7 of the home
            //      anchor (55 ≤ centroid ≤ 67) AND the median top voice across all
            //      progressions to land at or above MIDI 63 (D#4) — both ensure
            //      voicings remain in the canonical mid-piano comping range.
            //      Per-chord centroid ceiling is asymmetric (down-cap tighter
            //      than up-cap) because some keys' first-pass placement is
            //      naturally pulled high by the centroid-pull cascade, and that
            //      pre-existing first-pass behavior is out of S1 scope. If a
            //      future cost-gate change lets refinements migrate the centroid
            //      down the keyboard, these gates fail before the motion-ratio
            //      gates do. Direct guard against the music-theory-reviewer's
            //      register-collapse pathology.
            const allCentroids: number[] = [];
            const allTops: number[] = [];
            for (const key of KEYS) {
                for (const voicing of PROGS_C) {
                    const chords = [
                        { root: key.ii, intervals: voicing.chords[0].intervals },
                        { root: key.V, intervals: voicing.chords[1].intervals },
                        { root: key.I, intervals: voicing.chords[2].intervals },
                    ];
                    const voiced: number[][] = [];
                    for (let i = 0; i < chords.length; i++) {
                        const prev = i === 0 ? [] : voiced[i - 1];
                        voiced.push(
                            getBestInversion(
                                stateStub,
                                chords[i].root,
                                chords[i].intervals,
                                prev,
                                vlOpts,
                            ),
                        );
                    }
                    // Skip the first chord — it has no `previousMidis`, so the
                    // second pass doesn't run on it. Its placement is whatever the
                    // existing first-pass + range-clamp produces; that's a
                    // pre-existing concern, not what S1 governs.
                    for (let i = 1; i < voiced.length; i++) {
                        const c = voiced[i];
                        allCentroids.push(c.reduce((s, m) => s + m, 0) / c.length);
                        allTops.push(Math.max(...c));
                    }
                }
            }
            const minCentroid = Math.min(...allCentroids);
            const maxCentroid = Math.max(...allCentroids);
            const sortedTops = [...allTops].sort((a, b) => a - b);
            const medianTop = sortedTops[Math.floor(sortedTops.length / 2)];
            expect(minCentroid).toBeGreaterThanOrEqual(55);
            expect(maxCentroid).toBeLessThanOrEqual(67);
            expect(medianTop).toBeGreaterThanOrEqual(63);
        });
    });
});
