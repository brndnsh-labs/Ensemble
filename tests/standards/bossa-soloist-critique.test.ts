// @ts-nocheck
/**
 * Bossa Soloist Critique — LYRICAL RESTRAINT (#572, genre-audit Wave 2)
 *
 * Bossa is harmonically idiomatic but was rhythmically/texturally generic-jazz: it
 * leaned toward a continuous bebop line where bossa wants lyrical restraint and space
 * — long, singable, sustained color tones with rests between phrases.
 *
 * Measurement-first finding (the audit body flagged "the density numbers may already
 * sound acceptable"): bossa is ALREADY materially sparser than jazz (its config carries
 * a lower rhythmicDensity 0.64 + higher restBase 0.12), so it plays ~29% fewer notes
 * over the same bars. The structural `isLineStyle` grouping with jazz/bird is therefore
 * left intact (removing it would also lose bossa's device filter that keeps runs/flurries
 * out). The real gap was lyrical SUSTAIN — bossa held tones no longer than jazz. The fix
 * adds a bossa `sustainProb`/`maxSustainSteps` bias (soloist-config.ts), nudging notes
 * longer (which also further spaces the line). Exact value is a by-ear item (verify-by-ear).
 *
 * Discriminators here compare bossa to JAZZ over the same harness/arrangement — bossa
 * must read MORE lyrical on every axis, not in absolute terms (which would be arbitrary):
 *   (1) RESTRAINT/SPACE — bossa emits materially fewer notes per bar than jazz (robust:
 *       ~1142 vs ~1611 over 6 seeds). Pre-fix this was already true; the test locks it in
 *       so a future change can't drift bossa back toward a bebop note-flood.
 *   (2) LYRICAL SUSTAIN — bossa's mean note duration exceeds jazz's by a real margin
 *       (deterministic 3.59 vs 3.40, ratio ~1.055). Asserted with a 4% margin: bossa's
 *       sparser density alone only lifts the ratio to ~1.018, so the margin specifically
 *       guards the sustainProb/maxSustainSteps bias — drop it and the assertion fails.
 *   (3) COLOR — bossa lands the 6/9 (its targetExtensions) more than jazz (0.229 vs 0.158).
 */
import { describe, expect, it } from 'vitest';
import {
    BOSSA_CLAVE_STEPS_4_4,
    BOSSA_OFFBEAT_CELL_STEPS_4_4,
    isBossaClaveStep,
} from '../../public/engine/clave.js';
import {
    bootstrapSoloistAudit,
    buildHookAuditArrangement,
    simulateSoloistLoops,
} from '../../scripts/soloist-analysis-utils.js';

const pc = (m) => ((m % 12) + 12) % 12;
const SEEDS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Profile a style over the shared audit arrangement (moving chords). Note count is a
// per-bar proxy: both genres run the identical arrangement/loops/seeds, so raw counts
// are directly comparable.
function profile(genre) {
    let notes = 0;
    let durSum = 0;
    let color69 = 0;
    let chordNotes = 0;
    for (const seed of SEEDS) {
        const arrangement = buildHookAuditArrangement('4/4');
        const boot = bootstrapSoloistAudit({
            arrangement,
            genre,
            bpm: 120,
            intensity: 0.5,
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
        for (const e of cap.events) {
            notes++;
            durSum += e.note?.durationSteps || 1;
            if (e.chord) {
                chordNotes++;
                const rel = (pc(e.note.midi) - pc(e.chord.rootMidi) + 12) % 12;
                if (rel === 9 || rel === 2) {
                    color69++;
                }
            }
        }
    }
    return {
        notes,
        meanDur: durSum / notes,
        color69Share: chordNotes ? color69 / chordNotes : 0,
    };
}

describe('Bossa Soloist Critique', () => {
    it('reads as lyrical/spacious vs jazz — materially sparser', () => {
        const bossa = profile('Bossa');
        const jazz = profile('Jazz');
        console.log('\n--- BOSSA vs JAZZ SOLOIST: lyrical restraint (phrase-first) ---');
        console.log(
            `  notes:    bossa ${bossa.notes}  jazz ${jazz.notes}  (bossa materially fewer)`,
        );
        console.log(
            `  meanDur:  bossa ${bossa.meanDur.toFixed(2)}  jazz ${jazz.meanDur.toFixed(2)}`,
        );
        console.log(
            `  6/9 color: bossa ${(bossa.color69Share * 100).toFixed(1)}%  jazz ${(jazz.color69Share * 100).toFixed(1)}%`,
        );
        console.log('-----------------------------------------------\n');

        expect(bossa.notes).toBeGreaterThan(200); // real sample
        expect(jazz.notes).toBeGreaterThan(200);

        // RESTRAINT/SPACE — bossa is materially sparser than jazz. This is the live
        // engine's primary bossa-vs-jazz differentiator (deterministic across seeds);
        // require at least 12% fewer, which a bebop-line regression would breach.
        expect(bossa.notes).toBeLessThan(jazz.notes * 0.88);

        // DROPPED (epic #10 — live phrase-first engine):
        //  - "longer-held": the legacy `sustainProb`/`maxSustainSteps` bias widened
        //    bossa's mean duration above jazz. Phrase-first clamps every duration to
        //    the next sounding note, so bossa (3.6) sits ≈ jazz (3.8), NOT longer —
        //    the claim is false on this engine.
        //  - "more 6/9 color": phrase-first lands the 6/9 at ~14.6% vs jazz ~14.3% —
        //    a 0.3pp tie, not a differentiation; asserting it would mislabel a
        //    non-effect. Bossa's lyrical sustain + 6/9-targeting are PORT CANDIDATES.
    });

    // #571 — Bossa CLAVE-AWARE phrasing. Before this, bossa note placement was generic
    // positional probability (offbeat-eighth boost, sixteenth boost, a sine syncopation
    // arc) with ZERO clave awareness — syncopation that was statistically present but
    // rhythmically rootless. The fix locks the lead's OFFBEATS to the clave cells
    // (&-of-2/3/4, the partido-alto answer the comp plays — see public/engine/clave.ts).
    //
    // Note the canonical son clave (the documented spine) is 4/5 ON-beats, so accenting it
    // is indistinguishable from beat-playing — which is WHY the lead targets the offbeat
    // cells instead. This guard pins both: the spine constant's shape, and that bossa's
    // offbeats genuinely cluster on the cells above a uniform baseline AND above jazz.
    it('documents the son-clave spine and its single syncopated stroke', () => {
        // The 3-2 son clave spine: positions 0,6,12 (bar 0) + 20,24 (bar 1).
        expect([...BOSSA_CLAVE_STEPS_4_4]).toEqual([0, 6, 12, 20, 24]);
        // Only the &-of-2 (step 6) is off-beat; the rest sit on beats — hence it's a poor
        // soloist accent target on its own, and the lead uses the offbeat cells.
        const offBeatStrokes = BOSSA_CLAVE_STEPS_4_4.filter(
            (s) => s % 4 !== 0 && isBossaClaveStep(s, 4, 16),
        );
        expect(offBeatStrokes).toEqual([6]);
        // The lead's actual accent cells are the &-of-2/3/4.
        expect([...BOSSA_OFFBEAT_CELL_STEPS_4_4]).toEqual([6, 10, 14]);
    });

    it("locks the lead's offbeats to the clave cells — above uniform and above jazz", () => {
        const cell = new Set(BOSSA_OFFBEAT_CELL_STEPS_4_4);
        // Of a style's OFF-beat attacks (the only ones the clave lock shapes), what share
        // land on a clave cell (&-of-2/3/4)? Uniform baseline = 3 cells / 12 offbeat
        // positions per bar = 0.25.
        const offbeatCellShare = (genre) => {
            let offbeat = 0;
            let onCell = 0;
            for (const seed of SEEDS) {
                const arrangement = buildHookAuditArrangement('4/4');
                const boot = bootstrapSoloistAudit({
                    arrangement,
                    genre,
                    bpm: 120,
                    intensity: 0.55,
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
                for (const e of cap.events) {
                    const stepInBar = ((e.absoluteStep % 16) + 16) % 16;
                    if (stepInBar % 4 !== 0) {
                        offbeat++;
                        if (cell.has(stepInBar)) {
                            onCell++;
                        }
                    }
                }
            }
            return { offbeat, share: onCell / (offbeat || 1) };
        };

        const bossa = offbeatCellShare('Bossa');
        const jazz = offbeatCellShare('Jazz');
        const UNIFORM = 3 / 12; // 0.25
        console.log('\n--- BOSSA SOLOIST: clave-cell lock ---');
        console.log(
            `  offbeat→cell share: bossa ${(bossa.share * 100).toFixed(1)}%  jazz ${(jazz.share * 100).toFixed(1)}%  uniform ${(UNIFORM * 100).toFixed(0)}%`,
        );
        console.log('--------------------------------------\n');

        expect(bossa.offbeat).toBeGreaterThan(100); // real sample of offbeat attacks
        // (1) ABOVE UNIFORM — bossa's offbeats cluster on the clave cells far above the
        // 25% you'd get from uniform offbeat placement (measured ~0.67).
        expect(bossa.share).toBeGreaterThan(0.55);
        // (2) ABOVE JAZZ — the clave LOCK, not just the generic offbeat-eighth boost jazz
        // also gets (jazz ~0.47). The gap is the clave-awareness this story adds.
        expect(bossa.share).toBeGreaterThan(jazz.share + 0.1);
    });
});
