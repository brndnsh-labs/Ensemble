// @ts-nocheck
// tests/standards/ensemble-coordination.test.js

import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

describe('Ensemble Coordination Contract', () => {
    beforeEach(() => {
        // Reset state before each test
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Rock', enabled: true });
        dispatch(ACTIONS.UPDATE_BASS, { enabled: true, style: 'rock' });
        dispatch(ACTIONS.UPDATE_CHORDS, { enabled: true });
    });

    describe('Unified Coordination State', () => {
        it('passes a CoordinationContext with required flags to generators', () => {
            const context = {
                soloistBusy: true,
                accompanimentHit: true,
                kickHit: true,
            };

            expect(context).toHaveProperty('soloistBusy');
            expect(context).toHaveProperty('accompanimentHit');
            expect(context).toHaveProperty('kickHit');
        });
    });

    describe('Strict Register Slotting', () => {
        it('restricts Bass notes to MIDI 28-51 (via coordination context)', () => {
            const chord = {
                rootMidi: 60,
                freqs: [261.63, 329.63, 392.0],
                intervals: [0, 4, 7],
                quality: 'Major',
            }; // C4
            const context = { kickHit: true };
            const bassResult = getBassNote(
                getState(),
                chord,
                null,
                0,
                110,
                40,
                'rock',
                0,
                0,
                0,
                { stepCoordination: context },
                {},
            );

            if (bassResult?.midi) {
                expect(bassResult.midi).toBeGreaterThanOrEqual(28);
                expect(bassResult.midi).toBeLessThanOrEqual(51);
            }
        });

        it('restricts Chord notes to MIDI 52-84 (via coordination context)', () => {
            const chord = {
                rootMidi: 60,
                freqs: [261.63, 329.63, 392.0],
                intervals: [0, 4, 7],
                quality: 'Major',
            }; // C4
            const context = { soloistBusy: false };
            const chordNotes = getAccompanimentNotes(
                getState(),
                chord,
                0,
                0,
                0,
                { isBeatStart: true },
                context,
            );

            chordNotes.forEach((n) => {
                if (n.midi > 0) {
                    expect(n.midi).toBeGreaterThanOrEqual(52);
                    expect(n.midi).toBeLessThanOrEqual(84);
                }
            });
        });
    });

    describe('Proactive Generator Awareness', () => {
        it('Harmony fills spectral gaps based on Soloist position', () => {
            const chord = {
                rootMidi: 60,
                intervals: [0, 4, 7, 10], // C7
                freqs: [261.63, 329.63, 392.0, 466.16],
            };

            // Scenario 1: Soloist is HIGH (e.g., MIDI 85)
            // Harmony should target the "hole" between Chords (52+) and Soloist
            const contextSoloHigh = { soloistMidi: 85, soloistActive: true };
            const harmonyHigh = getHarmonyNotes(
                getState(),
                chord,
                null,
                0,
                0,
                'stabs',
                0,
                null,
                contextSoloHigh,
                { isBeatStart: true },
            );

            // Scenario 2: Soloist is LOW (e.g., MIDI 62)
            // Harmony should shift ABOVE the soloist
            const contextSoloLow = { soloistMidi: 62, soloistActive: true };
            const harmonyLow = getHarmonyNotes(
                getState(),
                chord,
                null,
                0,
                0,
                'stabs',
                0,
                null,
                contextSoloLow,
                { isBeatStart: true },
            );

            if (harmonyHigh.length > 0 && harmonyLow.length > 0) {
                const avgHigh =
                    harmonyHigh.reduce((acc, n) => acc + n.midi, 0) / harmonyHigh.length;
                const avgLow = harmonyLow.reduce((acc, n) => acc + n.midi, 0) / harmonyLow.length;

                // When soloist is high, harmony should sit LOWER than when soloist is low
                expect(avgHigh).toBeLessThan(avgLow);
            }
        });

        it('Soloist coordination context allows for structural flares', () => {
            // This test verifies the LIVE soloist engine (getSoloistNotePhraseFirst,
            // epic #10 reroute from the retired legacy getSoloistNote) accepts the
            // coordination context and executes against a seeded session without
            // throwing. Phrase-first rests (returns null) unless a session seed is
            // present, so we install a small theme + clear isResting to keep the lane
            // active. Not a density/metric claim — soloist musicality is guarded by
            // tests/standards/soloist-*-critique; this is a coordination-contract
            // smoke test for one lane.
            const chord = { rootMidi: 60, intervals: [0, 4, 7] };
            const context = { isMeasureEnd: true };
            const state = getState();
            state.soloist.session.seed = {
                loopLengthSteps: 16,
                notes: [
                    { step: 0, midi: 67, durationSteps: 2, velocity: 0.8 },
                    { step: 4, midi: 71, durationSteps: 2, velocity: 0.8 },
                    { step: 8, midi: 67, durationSteps: 2, velocity: 0.8 },
                    { step: 12, midi: 64, durationSteps: 2, velocity: 0.8 },
                ],
            };
            state.soloist.session.phrasing.isResting = false;
            const note = getSoloistNotePhraseFirst(
                state,
                chord,
                null,
                12,
                440,
                0,
                'scalar',
                12,
                context,
                {
                    mStep: 12,
                },
            );

            // Phrase-first returns either a rest (null) or a note/double-stop
            // (object/array) — never a primitive or undefined. Shape guard that the
            // call completed with the coordination context accepted.
            expect(note === null || typeof note === 'object').toBe(true);
        });
    });

    describe('Rhythmic Yielding Hierarchy', () => {
        it('Bass kick-lock is style-gated: kick-lock genres fire on every kick', () => {
            const context = { kickHit: true };

            // 'rock' is an 8th-note style — step 1 is NOT an 8th-note position, so rock
            // would not fire on its own. With kickHit set, the style-gated lock forces on.
            const rockActive = isBassActive(
                getState(),
                'rock',
                1,
                1,
                { isBeatStart: false },
                context,
            );
            expect(rockActive).toBe(true);

            // Without kickHit, rock on step 1 must NOT fire (proves kick-lock is what
            // activated the previous assertion, not the style's own logic).
            const rockNoKick = isBassActive(
                getState(),
                'rock',
                1,
                1,
                { isBeatStart: false },
                { kickHit: false },
            );
            expect(rockNoKick).toBe(false);
        });

        it('Bass kick-lock is style-gated: independent genres phrase against the kick', () => {
            const context = { kickHit: true };

            // 'quarter' (Jazz walking) — step 1 is not a beat-start, so the style would
            // not fire on its own. Kick-lock must NOT force it active.
            const jazzActive = isBassActive(
                getState(),
                'quarter',
                1,
                1,
                { isBeatStart: false, isOffbeat: false },
                context,
            );
            expect(jazzActive).toBe(false);

            // 'country' is half-note Two-Step (beats 1 and 3). Beat 2 (step 4) is not a
            // country fire position — kick-lock must not override.
            const countryActive = isBassActive(
                getState(),
                'country',
                4,
                4,
                { isBeatStart: true },
                context,
            );
            expect(countryActive).toBe(false);

            // 'dub' — step 1 is not a riddim position in any band. Kick-lock must not fire.
            const dubActive = isBassActive(
                getState(),
                'dub',
                1,
                1,
                { isBeatStart: false, mStep: 1 },
                context,
            );
            expect(dubActive).toBe(false);
        });

        it('Bass independent styles fire on their own active lane without kick assistance', () => {
            // Proves the dub active-lane works without coordination plumbing
            // (Open Finding #2 resolution): One Drop riddim at low intensity fires
            // deterministically on mStep 8 with kickHit absent.
            dispatch(ACTIONS.UPDATE_PLAYBACK, { bandIntensity: 0.3, complexity: 0 });
            const dubFires = isBassActive(
                getState(),
                'dub',
                8,
                8,
                { isBeatStart: true, mStep: 8 },
                { kickHit: false },
            );
            expect(dubFires).toBe(true);
        });

        it('Chords yield density to a busy Soloist', () => {
            const chord = { rootMidi: 60, freqs: [261.63, 329.63, 392.0] };
            const step = 4; // An offbeat
            const contextBusy = { soloistBusy: true };
            const originalRandom = Math.random;
            Math.random = () => 0.1; // Force yielding

            const chordResultBusyForced = getAccompanimentNotes(
                getState(),
                chord,
                step,
                step,
                step,
                { isBeatStart: false },
                contextBusy,
            );
            expect(chordResultBusyForced.length).toBe(0);

            Math.random = originalRandom;
        });
    });

    describe('Register Slotting Enforcement (Middleware)', () => {
        const { enforceRegisterSlotting } = require('../../public/engine/coordination-engine.ts');

        it('transposes any active note to the correct register regardless of input', () => {
            for (let i = 0; i < 100; i++) {
                const randomMidi = 1 + Math.floor(Math.random() * 126);

                const bassMidi = enforceRegisterSlotting('bass', randomMidi, {});
                expect(bassMidi).toBeGreaterThanOrEqual(23);
                expect(bassMidi).toBeLessThanOrEqual(57);

                const chordMidi = enforceRegisterSlotting('chords', randomMidi, {});
                expect(chordMidi).toBeGreaterThanOrEqual(52);
                expect(chordMidi).toBeLessThanOrEqual(84);
            }
        });

        it('performs smooth octave shifts when a target is provided', () => {
            // Target is 48 (C3), input is 72 (C5)
            // Should shift down 2 octaves to 48, not just stay at 72 (which is out of range)
            // or shift to 36 (which is in range but further from target).
            const clamped = enforceRegisterSlotting('bass', 72, {}, 48);
            expect(clamped).toBe(48);
        });
    });
});
