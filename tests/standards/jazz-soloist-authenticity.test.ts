// @ts-nocheck
// tests/standards/jazz-soloist-authenticity.test.js
import { getSoloistNote } from '../../public/engine/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

describe('Jazz Soloist Authenticity Benchmark', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Jazz', enabled: true });
        dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'jazz' });
        dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'debugSoloist', value: true });
    });

    it('should alternate between Call and Response roles in Jazz', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 64 };
        const { soloist } = getState();

        let callCount = 0;
        let responseCount = 0;

        for (let i = 0; i < 500; i += 16) {
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
                'jazz',
                0,
                { sectionStart: 0, sectionEnd: 128, bypassRhythm: true },
                { mStep: 0 },
            );

            if (soloist.session.currentPhrase.context.role === 'call') {
                callCount++;
            } else {
                responseCount++;
            }

            soloist.session.phrasing.activeSteps = 0;
            soloist.session.phrasing.isResting = true;
        }

        console.log(`[Jazz Audit] Calls: ${callCount}, Responses: ${responseCount}`);
        expect(callCount).toBeGreaterThan(0);
        expect(responseCount).toBeGreaterThan(0);
    });

    it('should pick characteristic Jazz profiles (Bird, Evans, Coltrane, Miles)', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10] };
        const { soloist } = getState();

        const profilesSeen = new Set();

        // Simulate 100 section boundaries to ensure we see the whole pool
        for (let section = 0; section < 100; section++) {
            const sectionStart = section * 64;
            const sectionEnd = (section + 1) * 64;

            getSoloistNote(
                getState(),
                chord,
                null,
                sectionStart,
                440,
                0,
                'jazz',
                0,
                { sectionStart, sectionEnd, bypassRhythm: true },
                { mStep: 0, isMeasureStart: true, isBeatStart: true },
            );

            if (soloist.session.currentPhrase.context.profile) {
                profilesSeen.add(soloist.session.currentPhrase.context.profile);
            }
        }

        console.log(`[Jazz Audit] Profiles detected: ${Array.from(profilesSeen).join(', ')}`);
        expect(profilesSeen.has('bird')).toBe(true);
        expect(profilesSeen.has('evans')).toBe(true);
        expect(profilesSeen.has('coltrane')).toBe(true);
        expect(profilesSeen.has('miles')).toBe(true);
    });

    it('Bill Evans profile should target upper extensions', () => {
        // why: large loop + per-iteration profile/role pin keeps the engine
        // measurably "in Evans" for the whole sample. Pre-S2 the test ran
        // 200 steps with profile pinned once at setup; soloist.ts's section-
        // boundary profile re-roll (Math.random() < 0.8) overwrote Evans at
        // step 128 in ~80% of runs, halving effective Evans coverage and
        // driving small-sample noise. Now we re-pin every iteration so the
        // measurement reflects the engine's actual Evans behavior, not the
        // rotation-churn artifact. Also extended to 800 steps for sample
        // stability (typical capture is ~120-180 notes, vs ~25-50 pre-fix).
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 64 };
        const { soloist } = getState();

        let extensionCount = 0;
        let totalNotes = 0;

        for (let i = 1; i < 801; i++) {
            soloist.session.currentPhrase.context.profile = 'evans';
            soloist.session.currentPhrase.context.role = 'call';

            const note = getSoloistNote(
                getState(),
                chord,
                null,
                i,
                440,
                0,
                'jazz',
                i % 16,
                { sectionStart: 0, sectionEnd: 512 },
                { mStep: i % 16 },
            );
            if (note) {
                const results = Array.isArray(note) ? note : [note];
                const lastNote = results[results.length - 1];
                const rel = ((lastNote.midi % 12) - (chord.rootMidi % 12) + 12) % 12;
                if ([2, 5, 6, 9].includes(rel)) {
                    extensionCount++;
                }
                totalNotes++;
            }
        }

        const extensionRate = extensionCount / totalNotes;
        console.log(
            `[Jazz Audit] Evans Extension Rate: ${(extensionRate * 100).toFixed(1)}% (Notes: ${totalNotes})`,
        );
        // Bill Evans should target extensions significantly more than roots,
        // but NOT blanket the line with them. Transcribed Evans sits in the
        // 25-35% band; >55% is stacked-fourths / late-modal caricature.
        // Floor was 0.3 pre-S2 but that was calibrated for the additive
        // `+500` anti-pattern that produced ~80% extensions; a musically
        // defensible hybrid lands at ~30% mean with a ~15-50% distribution
        // because the engine's RNG (picker scoring, profile re-rolls,
        // rhythm seed) is not test-seeded. Wide bounds reflect the engine's
        // real variance band; the upper bound at 0.55 still trips if a
        // future change pushes back into caricature (×80 era was ~55%
        // mean, not just tail). 30-run loop passes 28-30/30 in practice.
        // See Evans multiplier comment in soloist-pitch-engine.ts for the
        // tuning rationale and the deferred follow-up on RNG seeding.
        expect(extensionRate).toBeGreaterThan(0.15);
        expect(extensionRate).toBeLessThan(0.55);
    });

    it('Bill Evans response cadences should resolve home (root/5th present)', () => {
        // why: pre-S2 the Evans extension boost (`weight += 500; weight *= 10`)
        // ran on EVERY attack, including phrase-end response beats. Combined
        // with `if (interval === 0) weight *= 0.01`, the root was effectively
        // unreachable — ~0% of attacks landed on the root regardless of
        // phrase position or role. The V→I cadence couldn't happen.
        //
        // S2 fix: at `isPhraseEnd && role === 'response'`, the Evans extension
        // multiplier is bypassed so the existing phrase-end ×4.0 root/5th pull
        // can win. Across a long Evans-response loop, the root should appear
        // as a meaningful fraction of landings (was ~0% pre-fix). Floor is
        // intentionally modest: only phrase-end attacks get the cadence
        // bypass, and phrase-end attacks are a small subset of total notes,
        // so root rate across all attacks lands in the single-digit-percent
        // band post-fix. The guard catches regression to ~0%.
        const chord = { rootMidi: 60, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 64 };
        const { soloist } = getState();

        soloist.session.currentPhrase.context.profile = 'evans';
        soloist.session.currentPhrase.context.role = 'response';

        let rootCount = 0;
        let fifthCount = 0;
        let totalNotes = 0;

        for (let i = 1; i < 801; i++) {
            // Re-pin profile + role each iteration so the engine's natural
            // call/response rotation and profile re-roll don't drift us out.
            soloist.session.currentPhrase.context.profile = 'evans';
            soloist.session.currentPhrase.context.role = 'response';

            const note = getSoloistNote(
                getState(),
                chord,
                null,
                i,
                440,
                0,
                'jazz',
                i % 16,
                { sectionStart: 0, sectionEnd: 512 },
                { mStep: i % 16 },
            );
            if (note) {
                const results = Array.isArray(note) ? note : [note];
                const lastNote = results[results.length - 1];
                const rel = ((lastNote.midi % 12) - (chord.rootMidi % 12) + 12) % 12;
                if (rel === 0) {
                    rootCount++;
                }
                if (rel === 7) {
                    fifthCount++;
                }
                totalNotes++;
            }
        }

        const rootRate = rootCount / totalNotes;
        const fifthRate = fifthCount / totalNotes;
        const homeRate = (rootCount + fifthCount) / totalNotes;
        console.log(
            `[Jazz Audit] Evans Response Cadence: root ${(rootRate * 100).toFixed(1)}%, 5th ${(fifthRate * 100).toFixed(1)}%, home ${(homeRate * 100).toFixed(1)}% (Notes: ${totalNotes})`,
        );
        // Pre-S2 baseline: ~0% root, ~0% 5th, all extensions. Post-fix: at
        // phrase-end the extension boost is bypassed and the existing
        // phrase-end ×4.0 root/5th cadence pull wins. Root and 5th are both
        // legitimate V→I cadence targets; the 5th often wins because of
        // stepwise-motion bias from the prior attack. The combined home
        // (root+5th) rate is the primary musical signal — Evans response
        // cadences should land on a tonic-anchor tone, regardless of which
        // one. Floor at 0.10 is conservative against ~20-50% observed.
        //
        // Root-alone floor at 0.01 is a belt-and-suspenders regression guard
        // against the specific `×0.01 → ×0.1` root-suppression loosening:
        // if a future change reverts it (e.g. "tighten Evans roots back
        // up"), root alone would re-collapse toward 0% even with the home
        // rate carried by the 5th. Observed root-alone range across 30 runs
        // is ~1.5-13%, so the 1% floor has headroom (~0.5pt over worst-case
        // tail) while still tripping on the pre-fix ~0% baseline. The
        // root-alone metric is noisy because phrase-end attacks are sparse;
        // FOLLOWUPS.md tracks isolating to phrase-end specifically.
        expect(homeRate).toBeGreaterThan(0.1);
        expect(rootRate).toBeGreaterThan(0.01);
    });
});
