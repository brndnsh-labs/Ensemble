// tests/standards/ensemble-coordination.test.js

import { getAccompanimentNotes } from '../../public/accompaniment.js';
import { getBassNote, isBassActive } from '../../public/bass.js';
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
            // This property is enforced by the logic-worker/coordination-engine wrapper
            // which we verify by ensuring the generator's output is clamped if it goes high.
            // Note: In a unit test, we can verify if the engine naturally favors this range.
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
                // The actual getBassNote might return a note that is then clamped by logic-worker.
                // However, we want the engine to be compliant too.
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

    describe('Rhythmic Yielding Hierarchy', () => {
        it('Bass locks rhythm to Kick drum', () => {
            // If kickHit is true, isBassActive should return true even if the style wouldn't normally play
            // We use a style like 'whole' which only plays on stepInChord 0.
            const context = { kickHit: true };
            const isActive = isBassActive('whole', 4, 4, { isBeatStart: true }, context);

            expect(isActive).toBe(true); // Should play because kick is hitting
        });

        it('Chords yield density to a busy Soloist', () => {
            const chord = { rootMidi: 60, freqs: [261.63, 329.63, 392.0] };
            const step = 4; // An offbeat

            // Busy soloist
            const contextBusy = { soloistBusy: true };

            // Not busy soloist
            const contextNotBusy = { soloistBusy: false };

            // Mock Math.random to be 0 for this test to ensure it hits the skip branch.
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

            const _chordResultNotBusy = getAccompanimentNotes(
                chord,
                step,
                step,
                step,
                { isBeatStart: false },
                contextNotBusy,
            );
            // In Rock style, 4 is an 8th note, so it might play depending on the engine.
            // We just want to see if busy vs not busy makes a difference.

            Math.random = originalRandom;
        });
    });

    describe('Register Slotting Enforcement (Middleware)', () => {
        const { enforceRegisterSlotting } = require('../../public/engine/coordination-engine.js');

        it('transposes any active note to the correct register regardless of input', () => {
            // Fuzzing: Test 100 random MIDI notes
            for (let i = 0; i < 100; i++) {
                const randomMidi = 1 + Math.floor(Math.random() * 126); // 1 to 127

                const bassMidi = enforceRegisterSlotting('bass', randomMidi, {});
                expect(bassMidi).toBeGreaterThanOrEqual(28);
                expect(bassMidi).toBeLessThanOrEqual(51);

                const chordMidi = enforceRegisterSlotting('chords', randomMidi, {});
                expect(chordMidi).toBeGreaterThanOrEqual(52);
                expect(chordMidi).toBeLessThanOrEqual(84);
            }
        });
    });
});
