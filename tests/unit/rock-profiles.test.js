import { describe, expect, it, beforeEach } from 'vitest';
import { getSoloistNote } from '../../public/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

describe('Rock Soloist Profiles & Phrasing', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Rock', enabled: true });
        dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    });

    it('should assign Rock profiles during Call & Response cycles', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], sectionStart: 0, sectionEnd: 64 };
        const { soloist } = getState();

        const profilesSeen = new Set();
        const rockProfiles = ['gilmour', 'slash', 'hendrix', 'evh', 'beck'];

        for (let i = 0; i < 1000; i += 16) {
            if (soloist.isResting) {
                soloist.restSteps = 0;
            }
            getSoloistNote(
                chord,
                null,
                i,
                440,
                0,
                'smart',
                0,
                false,
                { sectionStart: 0, sectionEnd: 128, bypassRhythm: true },
                { mStep: 0, isMeasureStart: true, isBeatStart: true },
            );

            if (soloist.phraseContext.profile) {
                profilesSeen.add(soloist.phraseContext.profile);
            }

            soloist.activeSteps = 0;
            soloist.isResting = true;
            soloist.phraseContext.role = 'response'; // Force transition back to call next time
        }

        rockProfiles.forEach(p => {
            expect(profilesSeen.has(p)).toBe(true);
        });
    });

    it('should produce higher density for EVH bursts than Gilmour lyrical phrases', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], sectionStart: 0, sectionEnd: 256 };
        const { soloist, playback } = getState();
        playback.bandIntensity = 0.8;

        // Test Gilmour (Lyrical)
        soloist.phraseContext.profile = 'gilmour';
        soloist.phraseContext.role = 'call';
        soloist.isResting = false;
        soloist.activeSteps = 0; // Force refill
        soloist.sessionSteps = 128; 

        let gilmourNotes = 0;
        for (let i = 0; i < 128; i++) {
            if (getSoloistNote(chord, null, i, 440, 0, 'rock', i % 16, false, { sectionEnd: 256 })) {
                gilmourNotes++;
            }
        }

        // Test EVH (Burst)
        soloist.phraseContext.profile = 'evh';
        soloist.phraseContext.role = 'call';
        soloist.isResting = false;
        soloist.activeSteps = 0; // Force refill
        soloist.sessionSteps = 128;
        soloist.rhythmPlan = []; 

        let evhNotes = 0;
        for (let i = 0; i < 128; i++) {
            if (getSoloistNote(chord, null, i, 440, 0, 'rock', i % 16, false, { sectionEnd: 256 })) {
                evhNotes++;
            }
        }

        expect(evhNotes).toBeGreaterThan(gilmourNotes);
    });
});
