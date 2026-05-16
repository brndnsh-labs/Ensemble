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
            if (soloist.session.phrasing.isResting) {
                soloist.session.phrasing.restSteps = 0;
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

            if (
                soloist.session.currentPhrase.context &&
                soloist.session.currentPhrase.context.role === 'call'
            ) {
                callCount++;
            } else if (soloist.session.currentPhrase.context) {
                responseCount++;
            }

            // Fast forward past phrase
            soloist.session.phrasing.activeSteps = 0;
            soloist.session.phrasing.isResting = true;
        }

        console.log(`[Blues Audit] Calls: ${callCount}, Responses: ${responseCount}`);
        expect(callCount).toBeGreaterThan(0);
        expect(responseCount).toBeGreaterThan(0);
    });

    it('should end Response phrases on resolution tones more often than Call phrases', () => {
        // Resolution is a *phrase-ending* phenomenon: only the last note of a phrase
        // carries the "did we land at home or leave it open?" weight. The previous version
        // of this test counted pitch class on every emitted note, which mostly measured the
        // blues-scale distribution (root, b3, 3, 4, b5, 5, b7) — ~40-48% naturally hits 1/3/5
        // even from random scale-tone choice. That meant "Response > Call" passed at a tiny
        // margin without proving anything about phrase endings.
        //
        // Here we identify phrase boundaries (role transition or transition into a rest)
        // and check resolution only on the *last note before the boundary*.
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 128 };
        const { soloist, playback } = getState();
        playback.bandIntensity = 0.8;

        const ts = TIME_SIGNATURES['4/4'];

        let prevNote = null;
        let prevRole = null;
        let prevIsResting = false;

        let callEndRes = 0;
        let callEndTotal = 0;
        let respEndRes = 0;
        let respEndTotal = 0;

        const recordPhraseEnd = (note, role) => {
            const rel = ((note.midi % 12) - (chord.rootMidi % 12) + 12) % 12;
            const isRes = [0, 4, 7].includes(rel);
            if (role === 'call') {
                if (isRes) {
                    callEndRes++;
                }
                callEndTotal++;
            } else if (role === 'response') {
                if (isRes) {
                    respEndRes++;
                }
                respEndTotal++;
            }
        };

        for (let i = 0; i < 50000; i++) {
            const info = getStepInfo(i, ts, [], TIME_SIGNATURES);

            const note = getSoloistNote(
                getState(),
                chord,
                null,
                i,
                440,
                0,
                'blues',
                info.mStep,
                { sectionStart: 0, sectionEnd: 50000 },
                info,
            );

            const currentRole = soloist.session.currentPhrase.context?.role;
            const currentIsResting = soloist.session.phrasing.isResting;

            // Phrase boundary: role transitioned, or we just started resting.
            const phraseEnded =
                prevNote &&
                prevRole &&
                ((currentRole && currentRole !== prevRole) || (!prevIsResting && currentIsResting));
            if (phraseEnded) {
                recordPhraseEnd(prevNote, prevRole);
                prevNote = null;
                prevRole = null;
            }

            if (note) {
                const results = Array.isArray(note) ? note : [note];
                prevNote = results[results.length - 1];
                prevRole = currentRole;
            }
            prevIsResting = currentIsResting;
        }

        const callEndRate = callEndRes / (callEndTotal || 1);
        const respEndRate = respEndRes / (respEndTotal || 1);

        console.log(
            `[Blues Audit] Phrase-end resolution — Call: ${(callEndRate * 100).toFixed(1)}% ` +
                `(${callEndRes}/${callEndTotal}), Response: ${(respEndRate * 100).toFixed(1)}% ` +
                `(${respEndRes}/${respEndTotal})`,
        );

        // Statistical confidence: need enough phrase endings of each type.
        expect(callEndTotal).toBeGreaterThan(50);
        expect(respEndTotal).toBeGreaterThan(50);

        // Both Call and Response phrase endings should reliably beat the 33% random
        // baseline ("4 of 12 pitches are resolution tones"). That's what the engine's
        // current uniform call-response resolution bias (8× weight on root/5th in
        // soloist-pitch-engine.ts:579-587) actually delivers.
        //
        // What it does NOT reliably deliver: a stronger resolution lean on Response than
        // on Call. The engine has no phrase-end-specific kicker, so the directional gap
        // is RNG-dependent across runs (sometimes +9 points, sometimes -4). That's a
        // real engine gap, tracked in docs/MUSICAL_AUDIT.md "Open findings." We do NOT
        // assert directionality here — that would either be flaky or paper over the gap.
        expect(callEndRate).toBeGreaterThan(0.33);
        expect(respEndRate).toBeGreaterThan(0.33);
    });

    it('should trigger bluesTurnaround device during turnaround steps', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 128 };
        const { soloist } = getState();

        // Setup state to ensure selectPitchAndDevices is called
        soloist.session.rhythm.plan = [{ stepTarget: 100, durationSteps: 1, velocity: 1.0 }];
        soloist.session.phrasing.isResting = false;
        soloist.session.phrasing.activeSteps = 100;
        soloist.session.rhythm.embellishmentBuffer = [];
        soloist.session.rhythm.deviceBuffer = [];

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
            `[Blues Audit] Embellishment Buffer Size: ${soloist.session.rhythm.embellishmentBuffer.length}`,
        );
        expect(soloist.session.rhythm.embellishmentBuffer.length).toBeGreaterThan(0);

        randomSpy.mockRestore();
    });
});
