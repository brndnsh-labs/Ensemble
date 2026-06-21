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
    it('reads as lyrical/spacious vs jazz — sparser, longer-held, more 6/9 color', () => {
        const bossa = profile('Bossa');
        const jazz = profile('Jazz');
        console.log('\n--- BOSSA vs JAZZ SOLOIST: lyrical restraint ---');
        console.log(
            `  notes:    bossa ${bossa.notes}  jazz ${jazz.notes}  (bossa materially fewer)`,
        );
        console.log(
            `  meanDur:  bossa ${bossa.meanDur.toFixed(2)}  jazz ${jazz.meanDur.toFixed(2)}  (bossa longer-held)`,
        );
        console.log(
            `  6/9 color: bossa ${(bossa.color69Share * 100).toFixed(1)}%  jazz ${(jazz.color69Share * 100).toFixed(1)}%`,
        );
        console.log('-----------------------------------------------\n');

        expect(bossa.notes).toBeGreaterThan(200); // real sample
        expect(jazz.notes).toBeGreaterThan(200);

        // (1) RESTRAINT/SPACE — bossa is materially sparser than jazz. Measured ~29%
        // fewer; require at least 12% fewer (wide headroom, robust across seeds), which
        // a bebop-line regression would breach.
        expect(bossa.notes).toBeLessThan(jazz.notes * 0.88);

        // (2) LYRICAL SUSTAIN — the sustain bias. bossa's sparser density already nudges
        // its mean duration slightly above jazz (no-bias ratio ~1.018, a side effect of
        // fewer onsets); the `sustainProb`/`maxSustainSteps` bias WIDENS that to ~1.055.
        // Require a 4% margin so the assertion fails without the bias (it'd be ~1.018) —
        // i.e. this guards the sustain change specifically, not just bossa's density.
        // Deterministic across the fixed seeds.
        expect(bossa.meanDur).toBeGreaterThan(jazz.meanDur * 1.04);

        // (3) COLOR — bossa lands the 6/9 more than jazz (its targetExtensions [2,6,9]).
        expect(bossa.color69Share).toBeGreaterThan(jazz.color69Share);
    });
});
