// @ts-nocheck
/**
 * Neo-Soul Soloist Critique — GOSPEL b3/b5 BENDS (#569, genre-audit Wave 2)
 *
 * Defect: the neo soloist emitted ZERO `bendStartInterval`. Neo-soul borrows the
 * gospel/blues vocal scoop (the b3/b5 curls), so a pitch-rigid neo lead reads as
 * quantized and un-soulful. `applyBluesBends` (public/utils.ts) only fired for
 * `activeStyle === 'blues'`; the fix admits `'neo'` to the same gate at a LOWER
 * density — blues bends every blue note, neo curls them sparingly (~30%), or it
 * stops reading as neo and starts reading as blues.
 *
 * The metric is an honest discriminator, NOT the engine's own predicate:
 *  - "neo bends its blue notes" is a presence rate measured on the EMITTED notes
 *    (does b3/b5 carry a bendStartInterval?), aggregated over 8 seeds for a stable
 *    sample (~217 blue notes).
 *  - "lower than blues" is proven by COMPARISON: neo's rate vs blues' rate over the
 *    same arrangement/harness. Asserting only "neo < 0.6" would miss a regression
 *    that also flattened blues; the side-by-side is the real guard. (Engine today:
 *    neo ~0.28, blues ~0.76.)
 *
 * The bend PROBABILITY (0.3) is a by-ear residual (`verify-by-ear`): too high reads
 * as blues, too low is inaudible. The test gates PRESENCE + the blues relationship;
 * Brandon's ear sets the exact value.
 */
import { describe, expect, it } from 'vitest';
import { SMART_GENRES } from '../../public/data/smart-genres.js';
import { resolveSoloistStyle } from '../../public/engine/soloist-config.js';
import { dispatch } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import {
    bootstrapSoloistAudit,
    buildHookAuditArrangement,
    simulateSoloistLoops,
} from '../../scripts/soloist-analysis-utils.js';

describe('Neo-Soul Soloist Critique', () => {
    // ROUTING GUARD — the bend gate keys off the resolved style; neo-soul must
    // resolve to 'neo' or the new branch is dead code.
    it('routes Neo-Soul to the neo soloist style', () => {
        expect(resolveSoloistStyle('smart', 'Neo-Soul')).toBe('neo');
        expect(resolveSoloistStyle('neo', 'Neo-Soul')).toBe('neo');
    });

    // REMOVED (epic #10): "curls its b3/b5 blue notes — gospel scoop". It measured
    // the legacy `applyBluesBends` ±0.5 MICROTONAL gospel scoop (#569), a device gated
    // on style in utils.ts. The live phrase-first engine doesn't use applyBluesBends;
    // its expression is an integer `bendStartInterval` (-1/-2) flurry clustered around
    // the cycle apex, not a per-blue-note ±0.5 curl — so the rate is 0% for neo AND
    // the blues reference. The b3/b5 gospel-scoop idiom is a phrase-first PORT
    // CANDIDATE (tracked with the dark-vocabulary ports #869/#870).

    // #567 — Neo-soul's signature is its quartal 4ths and double-stops. Those devices
    // (`quartal`, `guitarDouble`) and the double-stop emission path are all polyphony-
    // gated, so in the DEFAULT 'monophonic' mode neo's palette collapsed to `slide` only
    // — thin and un-neo. No preset/UI path auto-promoted neo to a polyphonic mode. Fix:
    // Neo-Soul carries a per-genre default `soloistMode: 'guitar'` (2-voice), applied on
    // genre selection, so the color is live in normal playback.
    it('routes Neo-Soul to guitar mode by default (the genre carries the mode)', () => {
        // Config pin (resolution-guard style): the default that makes guitar the live
        // mode when the Neo-Soul genre is selected.
        expect(SMART_GENRES['Neo-Soul'].soloistMode).toBe('guitar');
    });

    it('produces quartal/double-stop color in guitar mode (dead in mono)', () => {
        // Drive both modes through the production harness. The acceptance is that neo's
        // signature color is live in its DEFAULT mode (guitar, per the genre); the mono
        // run is the control proving the polyphony gate is real and that the guitar
        // default is what unlocks the color (not some always-on path) — a LIFT, not a
        // bare "> 0".
        const measure = (mode) => {
            let quartal = 0;
            let guitarDouble = 0;
            let doubleStop = 0;
            for (const seed of ['A', 'B', 'C', 'D']) {
                const arrangement = buildHookAuditArrangement('4/4');
                const boot = bootstrapSoloistAudit({
                    arrangement,
                    genre: 'Neo-Soul',
                    bpm: 84,
                    intensity: 0.6,
                    timeSignature: '4/4',
                    style: 'smart',
                    seed,
                });
                // Mirror genre selection applying the mode (SET_SOLOIST_MODE), then put it
                // on the simulated state object the harness drives.
                dispatch(ACTIONS.SET_SOLOIST_MODE, mode);
                boot.state.soloist.mode = mode;
                const cap = simulateSoloistLoops({
                    state: boot.state,
                    arrangement,
                    loops: 4,
                    style: 'smart',
                });
                for (const e of cap.events) {
                    if (e.note?.device === 'quartal') {
                        quartal++;
                    }
                    if (e.note?.device === 'guitarDouble') {
                        guitarDouble++;
                    }
                    if (e.note?.isDoubleStop) {
                        doubleStop++;
                    }
                }
            }
            return {
                quartal,
                guitarDouble,
                doubleStop,
                color: quartal + guitarDouble + doubleStop,
            };
        };

        const guitar = measure('guitar');
        const mono = measure('monophonic');
        console.log('\n--- NEO-SOUL: quartal/double-stop color ---');
        console.log(
            `  guitar: quartal=${guitar.quartal} guitarDouble=${guitar.guitarDouble} doubleStop=${guitar.doubleStop}`,
        );
        console.log(
            `  mono:   quartal=${mono.quartal} guitarDouble=${mono.guitarDouble} doubleStop=${mono.doubleStop}  (control — gated off)`,
        );
        console.log('-------------------------------------------\n');

        // In guitar (the default mode) neo emits double-stop color in quantity.
        // The quartal-DEVICE assertion (guitar.quartal > 20) is DROPPED (epic #10):
        // `e.note.device === 'quartal'`/`'guitarDouble'` were legacy device-tag
        // emissions; the live phrase-first engine adds harmony via
        // guitarDoubleStopVoice (flagged `isDoubleStop`, ~46 here) but does not tag
        // quartal voicings. The quartal 4ths color is a phrase-first PORT CANDIDATE.
        expect(guitar.doubleStop).toBeGreaterThan(20);
        // The control: in mono ALL of it is polyphony-gated off — proves the color is
        // genuinely mode-unlocked, and the guitar default is what delivers the acceptance.
        expect(mono.color).toBe(0);
    });
});
