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

const pc = (m) => ((m % 12) + 12) % 12;
const SEEDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Aggregate the b3/b5 (blue-note) gospel-scoop rate over several seeds: of the notes
// the soloist plays a minor-3rd or tritone above the current chord root, how many
// carry a `applyBluesBends` SCOOP (a ±0.5 bend)? We match ±0.5 exactly, NOT any bend
// — `soloist-devices.ts` independently sets ±1 (slides/hammer-ons), and counting those
// would prop up the rate with bends this feature didn't add.
function blueNoteBendRate(genre, style) {
    let blue = 0;
    let bent = 0;
    let up = 0; // +0.5 scoops
    let down = 0; // -0.5 scoops
    for (const seed of SEEDS) {
        const arrangement = buildHookAuditArrangement('4/4');
        const boot = bootstrapSoloistAudit({
            arrangement,
            genre,
            bpm: 84,
            intensity: 0.55,
            timeSignature: '4/4',
            style,
            seed,
        });
        const cap = simulateSoloistLoops({ state: boot.state, arrangement, loops: 4, style });
        for (const e of cap.events) {
            if (e.absoluteStep < 0 || !e.chord) {
                continue;
            }
            const rel = (pc(e.note.midi) - pc(e.chord.rootMidi) + 12) % 12;
            if (rel === 3 || rel === 6) {
                blue++;
                if (Math.abs(e.note.bendStartInterval) === 0.5) {
                    bent++;
                    if (e.note.bendStartInterval > 0) {
                        up++;
                    } else {
                        down++;
                    }
                }
            }
        }
    }
    return { blue, bent, up, down, rate: blue ? bent / blue : 0 };
}

describe('Neo-Soul Soloist Critique', () => {
    // ROUTING GUARD — the bend gate keys off the resolved style; neo-soul must
    // resolve to 'neo' or the new branch is dead code.
    it('routes Neo-Soul to the neo soloist style', () => {
        expect(resolveSoloistStyle('smart', 'Neo-Soul')).toBe('neo');
        expect(resolveSoloistStyle('neo', 'Neo-Soul')).toBe('neo');
    });

    it('curls its b3/b5 blue notes — gospel scoop is present but sparser than blues', () => {
        const neo = blueNoteBendRate('Neo-Soul', 'smart');
        const blues = blueNoteBendRate('Blues', 'smart');
        console.log('\n--- NEO-SOUL GOSPEL-BEND REPORT ---');
        console.log(
            `[neo scoop rate]    ${neo.bent}/${neo.blue} = ${(neo.rate * 100).toFixed(1)}%  (Target: 0.10–0.45)`,
        );
        console.log(
            `[neo scoop dir]     ${neo.up} up / ${neo.down} down  (Target: both present, neither >80%)`,
        );
        console.log(
            `[blues scoop rate]  ${blues.bent}/${blues.blue} = ${(blues.rate * 100).toFixed(1)}%  (reference)`,
        );
        console.log('-----------------------------------\n');

        // (1) PRESENCE — the lead is no longer pitch-rigid; a meaningful share of
        // blue notes carry the ±0.5 gospel scoop. Sampled enough blue notes to be real.
        expect(neo.blue).toBeGreaterThan(40);
        expect(neo.bent).toBeGreaterThan(0);
        expect(neo.rate).toBeGreaterThan(0.1);

        // (2) RESTRAINT (the acceptance: "lower than blues' 0.6"). Neo curls
        // sparingly; full blues density would stop reading as neo.
        expect(neo.rate).toBeLessThan(0.45);

        // (3) LOWER THAN BLUES, proven by comparison (not the bare < 0.6 bound — that
        // alone would survive a regression that also flattened blues).
        expect(neo.rate).toBeLessThan(blues.rate);

        // (4) BIDIRECTIONAL SCOOP — the gospel/vocal scoop curls both up into the note
        // and down onto it. A single-shot seed source once pinned every neo scoop to one
        // direction (it draws gate + direction from the same value); this guards that the
        // direction draw is independent of the gate draw. Neither direction dominates.
        const dirShare = Math.max(neo.up, neo.down) / neo.bent;
        expect(neo.up).toBeGreaterThan(0);
        expect(neo.down).toBeGreaterThan(0);
        expect(dirShare).toBeLessThan(0.8);
    });

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

        // In guitar (the default mode) neo emits its signature color in quantity.
        expect(guitar.quartal).toBeGreaterThan(20);
        expect(guitar.doubleStop).toBeGreaterThan(20);
        // The control: in mono ALL of it is polyphony-gated off — proves the color is
        // genuinely mode-unlocked, and the guitar default is what delivers the acceptance.
        expect(mono.color).toBe(0);
    });
});
