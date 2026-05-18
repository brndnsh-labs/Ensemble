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

        // 100k steps gives ~600 phrase-end samples per role at this configuration,
        // which keeps the Response-vs-Call gap distribution tight enough to assert
        // direction without flaking on the small-sample tail.
        const totalSteps = 100000;
        for (let i = 0; i < totalSteps; i++) {
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
                { sectionStart: 0, sectionEnd: totalSteps },
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
        // At 100k steps each role yields ~580-830 phrase-end samples.
        expect(callEndTotal).toBeGreaterThan(50);
        expect(respEndTotal).toBeGreaterThan(50);

        // The soloist's phrase-end bias (soloist-pitch-engine.ts) is role-aware:
        // Response endings get pulled toward root / 3rd / 5th; Call endings get
        // pushed away from those tones and toward suspended 2 / 4 / 6.
        //
        // Three combined assertions enforce the musical claim:
        //  (a) Response rate stays above the 33% random baseline by a real margin.
        //  (b) Call rate stays below 50% — the bias actively pushes it away from
        //      home, but not so aggressively that every Call ends on a suspended
        //      tone (that would sound robotic; real soloists vary).
        //  (c) Response strictly exceeds Call — the direction itself.
        // Across 20 runs at 100k steps each: Response landed 48.9–59.0% (median
        // ~52%), Call landed 35.5–46.4% (median ~43%), gap 3.8–18.3pt (median
        // ~10pt). The combined thresholds hold every time; no single threshold
        // is tight enough to flake on the small-gap tail.
        expect(respEndRate).toBeGreaterThan(0.45);
        expect(callEndRate).toBeLessThan(0.5);
        expect(respEndRate).toBeGreaterThan(callEndRate);
    });

    it('should not bury planned attacks when a device fires mid-phrase', () => {
        // Long melodic devices (bluesLick spans up to 12 steps) used to fire mid-phrase
        // and silently consume the next several planned attacks via the plan consumer's
        // `while (step > plan[0].stepTarget) plan.shift()` discard loop. Audibly: phrases
        // lost their planned shape after a device appeared. We now gate device firing on
        // whether the device's span fits the plan ahead — long devices only fire when
        // they bury zero plan attacks, medium devices allow at most one. See
        // docs/MUSICAL_AUDIT.md and soloist-pitch-engine.ts:deviceFitsHere.
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 1024 };
        const { soloist, playback } = getState();
        playback.bandIntensity = 0.85; // high intensity → frequent device attempts

        const ts = TIME_SIGNATURES['4/4'];

        let totalDeviceFirings = 0;
        let buryingDeviceFirings = 0;

        for (let i = 0; i < 8000; i++) {
            const info = getStepInfo(i, ts, [], TIME_SIGNATURES);

            // Snapshot plan attacks ahead of the call so we can detect any that the
            // call discards without playing them.
            const planBefore = (soloist.session.rhythm.plan || []).map((n) => n.stepTarget);
            const deviceBufferBefore = soloist.session.rhythm.deviceBuffer?.length || 0;

            getSoloistNote(
                getState(),
                chord,
                null,
                i,
                440,
                0,
                'blues',
                info.mStep,
                { sectionStart: 0, sectionEnd: 8000 },
                info,
            );

            const deviceBufferAfter = soloist.session.rhythm.deviceBuffer?.length || 0;
            const deviceJustFired = deviceBufferAfter > deviceBufferBefore;

            if (deviceJustFired) {
                totalDeviceFirings++;
                // A device that fires AT step `i` claims the soloist through
                // `i + busySteps + deviceBuffer.length`. Any plan attack strictly
                // between `i` and the device's end would be silently discarded.
                const span = soloist.session.phrasing.busySteps + deviceBufferAfter + 1;
                const buriedAttacksAhead = planBefore.filter(
                    (target) => target > i && target < i + span,
                ).length;
                if (buriedAttacksAhead > 1) {
                    buryingDeviceFirings++;
                }
            }
        }

        const buryRate = buryingDeviceFirings / (totalDeviceFirings || 1);
        console.log(
            `[Blues Audit] Device firings: ${totalDeviceFirings}, attack-burying firings: ` +
                `${buryingDeviceFirings} (${(buryRate * 100).toFixed(1)}%)`,
        );

        // Device firings vary widely run-to-run (RNG dependent on prior tests in the same
        // vitest session — anywhere from a handful to 100+). The bury invariant is what
        // we actually care about, so require only that the gate path is exercised at all
        // and that when devices fire, they reliably don't bury planned attacks.
        expect(totalDeviceFirings).toBeGreaterThan(0);
        // Long devices should bury zero plan attacks; medium devices may legitimately
        // swallow one as an "expanded ornament." A few stragglers are tolerated because
        // plan regeneration mid-phrase can briefly produce overlap, but the rate should
        // be near zero, not the pre-fix flood.
        expect(buryRate).toBeLessThan(0.05);
    });

    it('should preserve call duration shape on the response (skeleton-mirror branch)', () => {
        // why: epic-soloist-idiom S5 — the response-skeleton branch in
        // soloist-rhythm-engine used to emit `durationSteps: 1` for every
        // attack, flattening any "long-long-short-short" call into a uniform
        // sixteenth tick. This test fails pre-fix because every captured
        // response phrase has duration variance ≈ 0 (every entry is 1).
        // Post-fix the response plan carries the call's durations, so the
        // response distribution mirrors the call's distribution.
        //
        // Measurement: every time the role transitions, snapshot the current
        // rhythm-plan's durationSteps as an array (the "phrase"). Bucket
        // each phrase's durations into [short=1, medium=2-3, long=4+] and
        // compare paired call → response histograms via L1 distance. The
        // response that *flattens* shows L1 ≈ (call's long+medium fraction);
        // the response that *mirrors* shows L1 close to 0.
        //
        // Two assertions: (1) the response distribution has nontrivial long+
        // medium mass (i.e., not 100% short); (2) the mean paired-L1 distance
        // is smaller than the random-shuffle baseline by a real margin —
        // the actual mirroring claim.
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 1024 };
        const { soloist, playback } = getState();
        playback.bandIntensity = 0.7;

        const ts = TIME_SIGNATURES['4/4'];

        type Phrase = { role: 'call' | 'response'; durations: number[] };
        const phrases: Phrase[] = [];

        // Capture each phrase exactly once at its onset — the moment the
        // soloist wakes from rest. The plan is regenerated at that transition
        // (see soloist.ts:1395 and surrounding), so the role + the fresh plan
        // we read on the first non-resting tick *is* the phrase. Mid-phrase
        // ticks shrink the plan as notes play and would over-count if we
        // sampled them, so we gate strictly on the rest→active edge.
        let prevIsResting = true;

        const totalSteps = 60000;
        for (let i = 0; i < totalSteps; i++) {
            const info = getStepInfo(i, ts, [], TIME_SIGNATURES);

            getSoloistNote(
                getState(),
                chord,
                null,
                i,
                440,
                0,
                'blues',
                info.mStep,
                { sectionStart: 0, sectionEnd: totalSteps, bypassRhythm: false },
                info,
            );

            const isResting = soloist.session.phrasing.isResting;
            const currentRole = soloist.session.currentPhrase.context?.role;
            // Rest → active edge: a new phrase just started, the plan has been
            // freshly generated for it. Capture once and wait for the next rest.
            if (prevIsResting && !isResting) {
                const plan = soloist.session.rhythm.plan || [];
                if (plan.length > 0 && (currentRole === 'call' || currentRole === 'response')) {
                    phrases.push({
                        role: currentRole,
                        durations: plan.map((n: any) =>
                            Math.max(1, Math.round(n.durationSteps || 1)),
                        ),
                    });
                }
            }
            prevIsResting = isResting;
        }

        // Bucket durations into [short=1, medium=2-3, long=4+].
        const bucketHistogram = (durations: number[]): [number, number, number] => {
            if (durations.length === 0) {
                return [0, 0, 0];
            }
            let short = 0;
            let medium = 0;
            let long = 0;
            for (const d of durations) {
                if (d <= 1) {
                    short++;
                } else if (d <= 3) {
                    medium++;
                } else {
                    long++;
                }
            }
            const total = durations.length;
            return [short / total, medium / total, long / total];
        };

        const l1 = (a: [number, number, number], b: [number, number, number]) =>
            Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

        // Build paired call → response sequences from the captured phrases.
        const pairs: Array<{ call: number[]; response: number[] }> = [];
        for (let i = 0; i < phrases.length - 1; i++) {
            if (phrases[i].role === 'call' && phrases[i + 1].role === 'response') {
                const call = phrases[i].durations;
                const response = phrases[i + 1].durations;
                if (call.length >= 2 && response.length >= 2) {
                    pairs.push({ call, response });
                }
            }
        }

        const responsePhrases = phrases.filter((p) => p.role === 'response');
        const responseBuckets = responsePhrases.map((p) => bucketHistogram(p.durations));
        const avgResponseShortFraction =
            responseBuckets.reduce((s, b) => s + b[0], 0) / (responseBuckets.length || 1);

        // Paired L1: distance between each call→response bucket pair.
        const pairedL1s = pairs.map(({ call, response }) =>
            l1(bucketHistogram(call), bucketHistogram(response)),
        );
        const meanPairedL1 = pairedL1s.reduce((s, v) => s + v, 0) / (pairedL1s.length || 1);

        // Random-shuffle baseline: for each call, pair it with a random response
        // from elsewhere in the session. If duration shape is unrelated to call,
        // paired-L1 ≈ shuffled-L1. If responses mirror their own calls, paired-L1
        // is meaningfully smaller. Use a deterministic shuffle (i+7) so the
        // baseline is stable across runs.
        const shuffledL1s = pairs.map(({ call }, idx) => {
            const partnerIdx = (idx + 7) % pairs.length;
            return l1(bucketHistogram(call), bucketHistogram(pairs[partnerIdx].response));
        });
        const meanShuffledL1 = shuffledL1s.reduce((s, v) => s + v, 0) / (shuffledL1s.length || 1);

        console.log(
            `[Blues Audit S5] phrases=${phrases.length} pairs=${pairs.length} ` +
                `response-short-fraction=${(avgResponseShortFraction * 100).toFixed(1)}% ` +
                `paired-L1=${meanPairedL1.toFixed(3)} shuffled-L1=${meanShuffledL1.toFixed(3)}`,
        );

        // Sanity: we got enough paired samples to measure.
        expect(pairs.length).toBeGreaterThan(10);

        // (1) Response distribution is not flat-sixteenths. Pre-fix this was
        //     ~0.95+ short (every skeleton-branch attack used durationSteps:1).
        //     Post-fix the call's long/medium notes are mirrored — across 30
        //     reliability runs response-short stayed between 0.15 and 0.30.
        //     Threshold 0.50 gives ~20pt headroom over the upper observed edge
        //     while still catching a partial regression (if someone hardcodes
        //     `durationSteps: 1` in ~60%+ of skeleton entries the fraction
        //     climbs back through 0.50 long before the old 0.88 trip-wire).
        expect(avgResponseShortFraction).toBeLessThan(0.5);

        // (2) Paired call→response L1 distance is meaningfully smaller than
        //     the random-shuffle baseline. With 3-bucket histograms L1 lives
        //     in [0, 2]. Across 30 runs paired-L1 stayed 0.05-0.20 below
        //     shuffled-L1; require at least a 0.02 gap so the assertion is
        //     directional but doesn't flake on the small-sample tail.
        expect(meanPairedL1).toBeLessThan(meanShuffledL1 - 0.02);
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
