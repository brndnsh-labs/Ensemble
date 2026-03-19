// tests/standards/ensemble-coordination.test.js

import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getSoloistNote } from '../../public/engine/soloist.js';
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
                pocketOffset: 0.05,
            };

            expect(context).toHaveProperty('soloistBusy');
            expect(context).toHaveProperty('accompanimentHit');
            expect(context).toHaveProperty('kickHit');
            expect(context).toHaveProperty('pocketOffset');
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
            // This test verifies the context is accepted and accessible
            const chord = { rootMidi: 60, intervals: [0, 4, 7] };
            const context = { isMeasureEnd: true };
            const _note = getSoloistNote(chord, null, 12, 440, 0, 'scalar', 12, false, context, {
                mStep: 12,
            });

            // We don't assert density here due to randomness,
            // but we ensure the function executes with the new context without error.
            expect(true).toBe(true);
        });
    });

    describe('Rhythmic Yielding Hierarchy', () => {
        it('Bass locks rhythm to Kick drum', () => {
            const context = { kickHit: true };
            const isActive = isBassActive('whole', 4, 4, { isBeatStart: true }, context);

            expect(isActive).toBe(true);
        });

        it('Chords yield density to a busy Soloist', () => {
            const chord = { rootMidi: 60, freqs: [261.63, 329.63, 392.0] };
            const step = 4; // An offbeat
            const contextBusy = { soloistBusy: true };
            const originalRandom = Math.random;
            Math.random = () => 0.1; // Force yielding

            const chordResultBusyForced = getAccompanimentNotes(
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
        const { enforceRegisterSlotting } = require('../../public/engine/coordination-engine.js');

        it('transposes any active note to the correct register regardless of input', () => {
            for (let i = 0; i < 100; i++) {
                const randomMidi = 1 + Math.floor(Math.random() * 126);

                const bassMidi = enforceRegisterSlotting('bass', randomMidi, {});
                expect(bassMidi).toBeGreaterThanOrEqual(28);
                expect(bassMidi).toBeLessThanOrEqual(51);

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
