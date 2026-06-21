// @ts-nocheck
import { beforeEach, describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { SMART_GENRES } from '../../public/data/smart-genres.js';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getScaleForChord } from '../../public/engine/theory-scales.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { getStepInfo } from '../../public/utils.js';
import {
    bootstrapSoloistAudit,
    buildHookAuditArrangement,
    simulateSoloistLoops,
} from '../../scripts/soloist-analysis-utils.js';

// #564 — Funk's signature b3/b5 grit (the SRV/Hendrix/Maceo vocabulary the funk
// profile claims) was structurally out of reach: over a plain dom9 vamp funk got
// pure Mixolydian (natural 3, no b3, no b5) and the blue-note reward excluded
// funk entirely. Two gates were fixed:
//   1. theory-scales.ts — funk over dominants now gets a dominant blues scale
//      (Mixolydian body + b3 + b5), not plain Mixolydian.
//   2. soloist-pitch-engine.ts — funk is admitted to blue-note recognition with a
//      TEMPERED reward (base color, no blues +500 b3-landing fixation, since funk
//      uses the b3 as a passing grace into the major 3, not a landing tone).
//
// The metric is the share of b3 (interval 3) + b5 (interval 6) among emitted
// notes over a dom9 vamp. The Mixolydian baseline for that share is structurally
// ~0 — Mixolydian [0,2,4,5,7,9,10] does NOT contain pc 3 or 6, so a pre-fix funk
// line could only hit them via a chromatic neighbor (which funk didn't admit).
// The threshold therefore sits well ABOVE the diatonic-Mixolydian rate, not below
// it (no sub-baseline tautology).
describe('Funk Soloist Authenticity Benchmark', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.SET_PARAM, { module: 'groove', param: 'genreFeel', value: 'Funk' });
        dispatch(ACTIONS.SET_PARAM, { module: 'groove', param: 'enabled', value: true });
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'enabled', value: true });
        dispatch(ACTIONS.SET_PARAM, { module: 'soloist', param: 'style', value: 'funk' });
        dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'debugSoloist', value: true });
    });

    // Gate-1 unit pin: funk over a plain dom9 must NOT be plain Mixolydian — it
    // must carry the b3 (3) and b5 (6) blue notes. Guards the scale routing
    // directly, independent of picker statistics.
    it('routes funk over a dom9 to a blue-note dominant scale (b3 + b5 present)', () => {
        const chord = { rootMidi: 60, quality: '9', intervals: [0, 4, 7, 10, 14] };
        const scale = getScaleForChord(getState(), chord, null, 'funk');
        expect(scale).toContain(3); // b3 grit
        expect(scale).toContain(6); // b5 grit
        expect(scale).toContain(4); // natural 3 retained (funk's major-3 body)
        // Not plain Mixolydian (which lacks 3 and 6).
        expect(scale).not.toEqual([0, 2, 4, 5, 7, 9, 10]);
    });

    // Resolution guard (per the genre→profile resolution-guard lesson): the Funk
    // genre's soloist actually routes to the 'funk' style, so the gate-1/gate-2
    // fixes (keyed on activeStyle === 'funk') sit on the live path, not a dead
    // branch. Asserts the routing map directly (not the dispatched value), so it
    // can't pass tautologically.
    it('Funk genre routes its soloist to the funk style', () => {
        expect(SMART_GENRES.Funk.soloist).toBe('funk');
    });

    // #563 — Call-and-response (the horn-stab-and-answer dialogue) is THE defining
    // funk/soul soloing gesture, and the funk soloist never produced it: 'funk' was
    // absent from MOTIVIC_RESPONSE_STYLES, so nextRole was pinned to 'call' for the
    // whole session (100% call, ZERO role transitions). The fix admits funk to that
    // set + gives it a sparse/rhythmic motivicResponse block.
    //
    // Measured against the FIXED engine over a real session (the production path —
    // call/response needs the dynamic head seed that playback always establishes, so
    // we drive it through the audit harness, not the lower-level loop above which has
    // no seed). Two honest discriminators of the fix:
    //   (1) BALANCE — both roles get substantial airtime (note-role share). The role
    //       roll is an asymmetric Markov chain (soloist.ts: enter-response 0.88/0.7 vs
    //       stay-in-response 0.28/0.24), so 'call' is the deliberate home state and a
    //       call-MAJORITY is correct (you make more statements than answers). Engine is
    //       deterministic: ~60/40 call across seeds (731/486). The band is NOT centered
    //       on 50 — it brackets the real ~0.60 with retuning headroom on both sides,
    //       and the upper bound still fails the pre-fix 100%-call engine by a wide margin.
    //   (2) ALTERNATION — the role actually changes within a session (transitions > 0).
    //       This is the part note-share alone can't prove; the pre-fix engine had ZERO
    //       transitions, so any real alternation kills it. Deterministic ~7 across the
    //       4 seeds; floor of 3 gives headroom without flaking.
    it('plays call-and-response — both roles in balance, and the role alternates', () => {
        let call = 0;
        let response = 0;
        let transitions = 0;
        for (const seed of ['A', 'B', 'C', 'D']) {
            const arrangement = buildHookAuditArrangement('4/4');
            const boot = bootstrapSoloistAudit({
                arrangement,
                genre: 'Funk',
                bpm: 96,
                intensity: 0.6,
                timeSignature: '4/4',
                style: 'smart',
                seed,
            });
            const cap = simulateSoloistLoops({
                state: boot.state,
                arrangement,
                loops: 4,
                style: 'smart',
            });
            let prevRole = null;
            for (const e of cap.events) {
                if (e.role !== 'call' && e.role !== 'response') {
                    continue;
                }
                if (e.role === 'call') {
                    call++;
                } else {
                    response++;
                }
                if (prevRole !== null && e.role !== prevRole) {
                    transitions++;
                }
                prevRole = e.role;
            }
        }

        const total = call + response;
        const callShare = call / (total || 1);
        console.log('\n--- FUNK SOLOIST: call-and-response ---');
        console.log(
            `  call=${call}  response=${response}  call-share=${(callShare * 100).toFixed(1)}%  (Target band 45–72%)`,
        );
        console.log(`  role transitions=${transitions}  (Target: >=3; pre-fix was 0)`);
        console.log('---------------------------------------\n');

        // Real sample of role-tagged events.
        expect(total).toBeGreaterThan(100);
        // (1) BALANCE — both roles substantially present. Band brackets the real ~0.60
        // call-majority (the asymmetric chain's intended home state) with headroom for
        // weight retuning; upper bound still fails the pre-fix 100%-call engine.
        expect(callShare).toBeGreaterThan(0.45);
        expect(callShare).toBeLessThan(0.72);
        // (2) ALTERNATION — the role genuinely changes during sessions. Pre-fix = 0.
        expect(transitions).toBeGreaterThanOrEqual(3);
    });

    // Statistical pin: over a dom9 vamp, funk's emitted line carries meaningful
    // b3+b5 grit, well above the ~0 Mixolydian baseline.
    it('plays b3/b5 grit over a dom9 vamp, above the Mixolydian baseline', () => {
        const chord = { rootMidi: 60, quality: '9', intervals: [0, 4, 7, 10, 14] };
        const ts = TIME_SIGNATURES['4/4'];
        const { playback } = getState();
        playback.bandIntensity = 0.6; // moderate tension — the case the audit flagged

        let total = 0;
        let blueGrit = 0; // b3 (3) + b5 (6)
        let b3 = 0;
        let b5 = 0;

        const totalSteps = 40000;
        for (let i = 0; i < totalSteps; i++) {
            const info = getStepInfo(i, ts, [], TIME_SIGNATURES);
            const note = getSoloistNote(
                getState(),
                chord,
                null,
                i,
                440,
                0,
                'funk',
                info.mStep,
                { sectionStart: 0, sectionEnd: totalSteps },
                info,
            );
            if (!note) {
                continue;
            }
            const results = Array.isArray(note) ? note : [note];
            for (const n of results) {
                if (typeof n?.midi !== 'number') {
                    continue;
                }
                const rel = ((n.midi % 12) - (chord.rootMidi % 12) + 12) % 12;
                total++;
                if (rel === 3) {
                    b3++;
                    blueGrit++;
                } else if (rel === 6) {
                    b5++;
                    blueGrit++;
                }
            }
        }

        const gritShare = blueGrit / (total || 1);
        console.log('\n--- FUNK SOLOIST: blue-note grit over dom9 ---');
        console.log(
            `  notes=${total}  b3=${b3}  b5=${b5}  grit(b3+b5) share=${(gritShare * 100).toFixed(1)}%`,
        );
        console.log('  (Mixolydian baseline for b3+b5 share is ~0 — scale lacks pc 3 and 6)');
        console.log('----------------------------------------------\n');

        expect(total).toBeGreaterThan(200); // real sample
        // Threshold sits well above the ~0 Mixolydian baseline. Funk uses the b3 as
        // a grace (tempered reward), so this is a meaningful-presence floor, not a
        // saturation target. Measured ~16%.
        expect(gritShare).toBeGreaterThan(0.08);
        // Ceiling guard: funk grit must NOT saturate into a blues-scale random walk
        // — the natural-3 Mixolydian body should still dominate. Guards a future
        // change that over-rewards the blue notes.
        expect(gritShare).toBeLessThan(0.3);
    });
});
