import { describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { makeMulberry32 } from '../utils/seeded-random.js';

/**
 * Epic 10 S2 (e) — Evans response-cadence test, filtered to phrase-end attacks.
 *
 * The legacy `jazz-soloist-authenticity.test.ts` "Bill Evans response cadences
 * should resolve home" test measured root/5th rate across ALL response
 * attacks. The fix being guarded — the `isEvansCadence` early-exit at
 * `soloist-pitch-engine.ts` ~line 757 (skip the Evans extension boost when
 * `isPhraseEnd && role === 'response'` so the V->I cadence can land home) —
 * acts ONLY on phrase-end response attacks. The broad metric was dominated by
 * the `isCallResponse ×8.0` boost (which hits every response attack), so the
 * test still passed with `isEvansCadence` reverted (verified: legacy test
 * stayed green when the guard was forced false).
 *
 * This test filters to phrase-end attacks. The engine's *real* phrase-end mark
 * is surfaced to the emitted note as `note.isPhraseEnd` in test mode
 * (`debugSoloist`), so we measure exactly the attacks the guard touches —
 * not a `i % 16 === 15` proxy that wouldn't correlate with the rhythm
 * engine's actual phrase boundaries.
 *
 * ENGINE REALITY (measured, see FOLLOWUPS §F note):
 *   The `isEvansCadence` guard's effect is SMALL. The picker's phrase-end
 *   ×4.0 root/5th pull and the isCallResponse ×8.0 boost already pull hard
 *   toward home at phrase-end; the Evans extension ×3.5 boost the guard
 *   suppresses is a comparatively minor competitor. Per single seed the
 *   phrase-end home rate swings 17-72% (only ~18 phrase-end samples/run).
 *   The signal surfaces only on aggregate:
 *     - post-fix : 43.9% phrase-end home rate  (20-seed aggregate, 355 attacks)
 *     - pre-fix  : 39.3% phrase-end home rate  (20-seed aggregate, 356 attacks)
 *   A ~4.6pt delta. To make the test a reliable regression guard despite the
 *   thin signal, it (a) aggregates over 20 pinned mulberry32 seeds so the
 *   measurement is fully deterministic, and (b) filters to phrase-end attacks
 *   so the guard's effect isn't diluted by the ~340 non-phrase-end response
 *   attacks per run. Threshold 41.5% sits 2.2pt above the pre-fix aggregate
 *   and 2.4pt below the post-fix aggregate.
 */

const SEEDS: number[] = [];
for (let k = 0; k < 20; k++) {
    SEEDS.push(0x10000 + k * 0x9e37);
}

interface PhraseEndTally {
    phraseEndAttacks: number;
    phraseEndHome: number;
    phraseEndRoot: number;
}

/** Run one 800-step Evans-response loop with `Math.random` pinned to a
 *  mulberry32 stream, tallying root/5th landings among phrase-end attacks. */
function runEvansLoop(seed: number): PhraseEndTally {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Jazz', enabled: true });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'jazz' });
    // SET_PARAM is the canonical action for playback flags — UPDATE_PLAYBACK
    // (used by the legacy file) is not a real action and silently no-ops, so
    // the legacy test never actually had debugSoloist on. We need it on so the
    // engine surfaces `note.isPhraseEnd`.
    dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'debugSoloist', value: true });

    const spy = vi.spyOn(Math, 'random').mockImplementation(makeMulberry32(seed));
    const tally: PhraseEndTally = { phraseEndAttacks: 0, phraseEndHome: 0, phraseEndRoot: 0 };
    try {
        const chord = {
            rootMidi: 60,
            intervals: [0, 4, 7, 10],
            sectionStart: 0,
            sectionEnd: 64,
        };
        const { soloist } = getState();
        for (let i = 1; i < 801; i++) {
            // Re-pin profile + role every iteration so the engine's natural
            // call/response rotation and section-boundary profile re-roll
            // don't drift us out of the Evans-response regime under test.
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
                { mStep: i % 16 } as never,
            );
            if (!note) {
                continue;
            }
            const results = Array.isArray(note) ? note : [note];
            const last = results[results.length - 1];
            // Only phrase-end attacks — the exact subset `isEvansCadence` acts on.
            if (last.isPhraseEnd !== true) {
                continue;
            }
            tally.phraseEndAttacks++;
            const rel = ((((last.midi % 12) - (chord.rootMidi % 12)) % 12) + 12) % 12;
            if (rel === 0) {
                tally.phraseEndHome++;
                tally.phraseEndRoot++;
            }
            if (rel === 7) {
                tally.phraseEndHome++;
            }
        }
    } finally {
        spy.mockRestore();
    }
    return tally;
}

describe('Soloist Evans response cadence — phrase-end isolation (Epic 10 S2.e)', () => {
    it('phrase-end response attacks resolve home above the pre-fix aggregate', () => {
        let totalPhraseEnd = 0;
        let totalHome = 0;
        let totalRoot = 0;
        for (const seed of SEEDS) {
            const t = runEvansLoop(seed);
            totalPhraseEnd += t.phraseEndAttacks;
            totalHome += t.phraseEndHome;
            totalRoot += t.phraseEndRoot;
        }

        const homeRate = totalHome / Math.max(totalPhraseEnd, 1);
        const rootRate = totalRoot / Math.max(totalPhraseEnd, 1);

        console.log(
            '\n--- EVANS PHRASE-END CADENCE (S2.e) ---\n' +
                `[Seeds aggregated]      ${SEEDS.length}\n` +
                `[Phrase-end attacks]    ${totalPhraseEnd}\n` +
                `[Phrase-end home]       ${totalHome} (${(homeRate * 100).toFixed(1)}%)\n` +
                `[Phrase-end root]       ${totalRoot} (${(rootRate * 100).toFixed(1)}%)\n` +
                '[Target]                phrase-end home rate > 41.5%\n' +
                '----------------------------------------\n',
        );

        // The phrase-end sample must be non-trivial; if `isPhraseEnd` plumbing
        // broke (or debugSoloist were off) this collapses to 0 and the
        // home-rate denominator becomes meaningless.
        expect(totalPhraseEnd).toBeGreaterThan(200);

        // Threshold 41.5%. The `isEvansCadence` early-exit lets the V->I
        // cadence land home at phrase-end response attacks instead of being
        // overridden by the Evans upper-extension boost.
        //   - pre-fix  aggregate phrase-end home rate: 39.3% (guard reverted)
        //   - post-fix aggregate phrase-end home rate: 43.9%
        // Both values are fully deterministic (20 pinned mulberry32 seeds,
        // RESET_STATE between seeds). 41.5% is 2.2pt above pre-fix and 2.4pt
        // below post-fix. The signal is intrinsically small because the
        // picker's phrase-end ×4.0 + isCallResponse ×8.0 home pulls already
        // dominate; aggregation over 20 seeds is what makes the 4.6pt delta a
        // reliable guard rather than per-seed noise (single-seed swing is
        // 17-72%). See FOLLOWUPS §F for the engine observation that the guard
        // is a comparatively weak lever.
        // FRAGILE: 41.5% sits inside a 4.6pt window. Any retune of the
        // phrase-end ×4.0, isCallResponse ×8.0, or interval===0 ×0.1 weights in
        // soloist-pitch-engine.ts moves this baseline more than the isEvansCadence
        // delta — re-run the revert-confirm (force isEvansCadence=false, expect
        // RED) whenever those weights change, or this test silently false-passes.
        expect(homeRate).toBeGreaterThan(0.415);
    });
});
