// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { getStepInfo } from '../../public/utils.js';

describe('Blues Soloist Authenticity Benchmark', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.SET_PARAM, { module: 'groove', param: 'genreFeel', value: 'Blues' });
        dispatch(ACTIONS.SET_PARAM, { module: 'groove', param: 'enabled', value: true });
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'enabled', value: true });
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'style', value: 'blues' });
        dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'debugSoloist', value: true });
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
                getState(),
                chord,
                null,
                i,
                440,
                0,
                'blues',
                0,
                { sectionStart: 0, sectionEnd: 128, bypassRhythm: true },
                { mStep: 0 },
            );

            if (soloist.phraseContext && soloist.phraseContext.role === 'call') {
                callCount++;
            } else if (soloist.phraseContext) {
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
        const { soloist, playback } = getState();
        playback.bandIntensity = 0.8; // More active for better statistics

        let callResScore = 0;
        let respResScore = 0;
        let callTotal = 0;
        let respTotal = 0;

        const ts = TIME_SIGNATURES['4/4'];

        for (let i = 0; i < 50000; i++) {
            const step = i;
            const info = getStepInfo(step, ts, [], TIME_SIGNATURES);

            const note = getSoloistNote(
                getState(),
                chord,
                null,
                step,
                440,
                0,
                'blues',
                info.mStep,
                { sectionStart: 0, sectionEnd: 50000 },
                info,
            );

            if (note) {
                const results = Array.isArray(note) ? note : [note];
                const lastNote = results[results.length - 1];
                const rel = ((lastNote.midi % 12) - (chord.rootMidi % 12) + 12) % 12;
                const isRes = [0, 4, 7].includes(rel);

                if (soloist.phraseContext && soloist.phraseContext.role === 'call') {
                    if (isRes) {
                        callResScore++;
                    }
                    callTotal++;
                } else if (soloist.phraseContext) {
                    if (isRes) {
                        respResScore++;
                    }
                    respTotal++;
                }
            }
        }

        const callRate = callResScore / (callTotal || 1);
        const respRate = respResScore / (respTotal || 1);

        console.log(
            `[Blues Audit] Call Resolution: ${(callRate * 100).toFixed(1)}%, Response Resolution: ${(respRate * 100).toFixed(1)}%`,
        );
        expect(respRate).toBeGreaterThan(callRate);
    });

    it('should trigger bluesTurnaround device during turnaround steps', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 128 };
        const { soloist } = getState();

        // Setup state to ensure selectPitchAndDevices is called
        soloist.rhythmPlan = [{ stepTarget: 100, durationSteps: 1, velocity: 1.0 }];
        soloist.isResting = false;
        soloist.activeSteps = 100;
        soloist.embellishmentBuffer = [];
        soloist.deviceBuffer = [];

        // Force high probability for device triggering
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.01);

        getSoloistNote(
            getState(),
            chord,
            null,
            100,
            440,
            0,
            'blues',
            4,
            { sectionStart: 0, sectionEnd: 128, isTurnaround: true, bypassRhythm: false },
            { mStep: 4, tsConfig: TIME_SIGNATURES['4/4'] },
        );

        console.log(
            `[Blues Audit] Embellishment Buffer Size: ${soloist.embellishmentBuffer.length}`,
        );
        expect(soloist.embellishmentBuffer.length).toBeGreaterThan(0);

        randomSpy.mockRestore();
    });
});
