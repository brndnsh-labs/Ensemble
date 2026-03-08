// tests/scripts/analyze-blues-feel.test.js
import { getSoloistNote } from '../../public/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

describe('Blues Soloist Authenticity Benchmark', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Blues', enabled: true });
        dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'blues' });
        dispatch(ACTIONS.UPDATE_PLAYBACK, { debugSoloist: true });
    });

    it('should alternate between Call and Response roles', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 64 };
        const { soloist } = getState();

        let callCount = 0;
        let responseCount = 0;

        // Simulate many phrases
        for (let i = 0; i < 1000; i += 16) {
            // Force start of new phrase if resting
            if (soloist.isResting) {
                soloist.restSteps = 0;
            }
            getSoloistNote(
                chord,
                null,
                i,
                440,
                0,
                'blues',
                0,
                false,
                { sectionStart: 0, sectionEnd: 128, bypassRhythm: true },
                { mStep: 0 },
            );

            if (soloist.phraseContext.role === 'call') {
                callCount++;
            } else {
                responseCount++;
            }

            // Fast forward past phrase
            soloist.activeSteps = 0;
            soloist.isResting = true;
        }

        console.log(`[Blues Audit] Calls: ${callCount}, Responses: ${responseCount}`);
        expect(callCount).toBeGreaterThan(0);
        expect(responseCount).toBeGreaterThan(0);
    });

    it('should end Response phrases on resolution tones more often than Call phrases', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 128 };
        const { soloist } = getState();

        let callResScore = 0;
        let respResScore = 0;
        let callTotal = 0;
        let respTotal = 0;

        for (let i = 0; i < 2000; i++) {
            const step = i;
            const note = getSoloistNote(
                chord,
                null,
                step,
                440,
                0,
                'blues',
                step % 16,
                false,
                { sectionStart: 0, sectionEnd: 128 },
                { mStep: step % 16 },
            );

            if (note) {
                const results = Array.isArray(note) ? note : [note];
                const lastNote = results[results.length - 1];
                const rel = ((lastNote.midi % 12) - (chord.rootMidi % 12) + 12) % 12;
                const isRes = [0, 4, 7].includes(rel);

                if (soloist.phraseContext.role === 'call') {
                    if (isRes) {
                        callResScore++;
                    }
                    callTotal++;
                } else {
                    if (isRes) {
                        respResScore++;
                    }
                    respTotal++;
                }
            }
        }

        const callRate = callResScore / callTotal;
        const respRate = respResScore / respTotal;

        console.log(
            `[Blues Audit] Call Resolution: ${(callRate * 100).toFixed(1)}%, Response Resolution: ${(respRate * 100).toFixed(1)}%`,
        );
        expect(respRate).toBeGreaterThan(callRate);
    });

    it('should trigger bluesTurnaround device during turnaround steps', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 128 };
        // Turnaround is last 2 bars of 128 steps (8 bars)
        // 128 - 32 = 96

        let turnaroundNotes = 0;
        for (let i = 100; i < 128; i++) {
            const note = getSoloistNote(
                chord,
                null,
                i,
                440,
                0,
                'blues',
                i % 16,
                false,
                { sectionStart: 0, sectionEnd: 128, isTurnaround: true, bypassRhythm: true },
                { mStep: i % 16 },
            );
            if (note) {
                const results = Array.isArray(note) ? note : [note];
                if (results.some((n) => n.midi === 67 || n.midi === 66)) {
                    // 5th or b5 in turnaround
                    turnaroundNotes++;
                }
            }
        }

        console.log(`[Blues Audit] Turnaround-flavored notes detected: ${turnaroundNotes}`);
        expect(turnaroundNotes).toBeGreaterThan(0);
    });
});
