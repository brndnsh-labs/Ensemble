// @ts-nocheck
import { beforeEach, describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { SMART_GENRES } from '../../public/data/smart-genres.js';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getScaleForChord } from '../../public/engine/theory-scales.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { getStepInfo } from '../../public/utils.js';

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
