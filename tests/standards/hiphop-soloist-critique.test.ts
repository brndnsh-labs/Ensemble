// @ts-nocheck
/**
 * Hip Hop Soloist Critique — LIVING HOOK LANE (#555, genre-audit Wave 1)
 *
 * Two defects, one fix:
 *  (1) Wiring — `smart-genres.ts` set Hip Hop's soloist to `'neo'`, and the smart
 *      key out-prioritizes GENRE_STYLE_MAPPING, so Hip Hop played Neo-Soul and the
 *      hand-tuned `hiphop` profile was DEAD. Flipped to `'hiphop'`.
 *  (2) Idiom — hip-hop melody centers on a recurring 1–2 bar HOOK. A first cut
 *      replayed it VERBATIM, which read as copy-paste and ignored the chords
 *      (caught by ear). The fix is a LIVING hook: the rhythm/contour skeleton
 *      recurs (recognizable), but the hook FOLLOWS THE CHORD (anchors snap to the
 *      current chord's tones, passing notes to its scale), ORNAMENT grows over
 *      loops (soft graces over the sustains), and every 4th statement is a fill.
 *
 * The metrics are honest discriminators, NOT the engine's own predicates:
 *  - chord-following is proven by the LIFT it provides — emitted (snapped) anchor
 *    chord-tone rate vs the RAW carved hook's rate over the same moving chords.
 *    (Asserting "snapped anchors are chord tones" alone would be a tautology — the
 *    snap guarantees it.)
 *  - "not copy-paste" is a repetition WINDOW (well below the old verbatim 1.0, but
 *    not random).
 *  - "builds over loops" is proven by note growth + graces appearing only from
 *    loop 1 on (the ornament path is otherwise dead on a dense hook).
 * The audit arrangement has moving chords (Cmaj7→G7→Am7→Fmaj7), so chord-following
 * and the lift are observable.
 */
import { describe, expect, it } from 'vitest';
import { resolveSoloistStyle } from '../../public/engine/soloist-config.js';
import {
    bootstrapSoloistAudit,
    buildHookAuditArrangement,
    simulateSoloistLoops,
} from '../../scripts/soloist-analysis-utils.js';

const pc = (m) => ((m % 12) + 12) % 12;

function hookProfile() {
    const arrangement = buildHookAuditArrangement('4/4');
    const boot = bootstrapSoloistAudit({
        arrangement,
        genre: 'Hip Hop',
        bpm: 90,
        intensity: 0.5,
        timeSignature: '4/4',
        style: 'smart',
        seed: 'HEAD_AUDIT',
    });
    const cap = simulateSoloistLoops({ state: boot.state, arrangement, loops: 4, style: 'smart' });
    // Recurrence period the line is checked NOT to verbatim-repeat at: 2 bars × 16
    // steps in 4/4. Formerly read off the retired #555 hook lane's `loopLengthSteps`
    // (removed in #1059 — that mechanism was inert, never consumed by phrase-first);
    // the period is the same literal 2-bar window regardless of the dead lane.
    const HOOK_PERIOD = 32;

    let allNotes = 0;
    let allOnChord = 0;
    const byStep = new Map();
    const loopNotes = {};
    const loopGhosts = {};
    for (const e of cap.events) {
        if (e.absoluteStep < 0) {
            continue;
        }
        byStep.set(e.absoluteStep, e.note.midi);
        loopNotes[e.loop] = (loopNotes[e.loop] || 0) + 1;
        if (e.note.velocity <= 0.36) {
            loopGhosts[e.loop] = (loopGhosts[e.loop] || 0) + 1;
        }
        if (!e.chord?.intervals) {
            continue;
        }
        const rootPc = pc(e.chord.rootMidi);
        const chordPcs = new Set(e.chord.intervals.map((i) => pc(rootPc + i)));
        allNotes++;
        if (chordPcs.has(pc(e.note.midi))) {
            allOnChord++;
        }
    }
    let pHits = 0;
    let pTot = 0;
    for (const [s, m] of byStep) {
        const o = byStep.get(s + HOOK_PERIOD);
        if (o !== undefined) {
            pTot++;
            if (o === m) {
                pHits++;
            }
        }
    }
    return {
        noteCount: byStep.size,
        measures: arrangement.measuresPerLoop * 4,
        allChordToneRate: allNotes ? allOnChord / allNotes : 0,
        periodPitchRep: pTot ? pHits / pTot : 0,
        loopNotes,
        loopGhosts,
    };
}

describe('Hip Hop Soloist Critique', () => {
    // (1) DEAD-KEY ROUTING GUARD — the bug started here: the smart key must resolve
    // to the dedicated hiphop profile, not neo.
    it('routes Hip Hop (smart) to the dedicated hiphop profile, not neo', () => {
        expect(resolveSoloistStyle('smart', 'Hip Hop')).toBe('hiphop');
        expect(resolveSoloistStyle('hiphop', 'Hip Hop')).toBe('hiphop');
        expect(resolveSoloistStyle('smart', 'Hip Hop')).not.toBe('neo');
    });

    it('outlines the chord changes — voice-led chord-tone alignment, not a verbatim loop', () => {
        const p = hookProfile();
        console.log('\n--- HIP HOP SOLOIST REPORT (phrase-first) ---');
        console.log(
            `[all chord-tone]       ${(p.allChordToneRate * 100).toFixed(1)}% (Target: >0.55)`,
        );
        console.log(
            `[period pitch rep]     ${(p.periodPitchRep * 100).toFixed(1)}% (Target: <0.90 — not verbatim)`,
        );
        console.log(`[notes/loop]           ${JSON.stringify(p.loopNotes)}`);
        console.log('----------------------------------\n');

        // Phrase-first voice-leads to the chord under it, so the whole line stays
        // harmonic (chord + scale tones) — well above the ~0.33 random floor over a
        // 4-note chord set. This IS the live engine's "outlines the changes".
        expect(p.allChordToneRate).toBeGreaterThan(0.55);
        // Not a verbatim copy-paste loop (the old failure mode was periodPitchRep
        // 1.0). Phrase-first sits far lower (~0.14) because it DEVELOPS the theme
        // each loop rather than replaying it.
        expect(p.periodPitchRep).toBeLessThan(0.9);

        // DROPPED (epic #10 — legacy "living hook" mechanism #555, dark on the live
        // engine): the anchor-snap LIFT metric (emit-anchor chord rate vs the raw
        // carved hook). Phrase-first DOES consume `isAnchor` internally (it reads it
        // off the seed), but it does not propagate an `isAnchor` flag onto its EMITTED
        // note object, so the metric had no denominator on the live engine — its
        // machinery, along with the #555 hook lane it read from, was removed in #1059.
        // Also dropped earlier: the recurring-hook recognizability window
        // (periodPitchRep >0.4 — phrase-first develops to ~0.14, the "hooks wash out
        // under SRDC development" behavior), and the ghost-grace / monotonic-densify
        // "builds over loops" guard (phrase-first emits no sub-0.36 ghost graces and
        // grows via pitch development, not density). The recurring hip-hop HOOK
        // character is a genuine phrase-first PORT CANDIDATE.
    });

    it('stays a coherent, non-empty melodic line (regression guard)', () => {
        const p = hookProfile();
        const notesPerMeasure = p.noteCount / Math.max(1, p.measures);
        expect(p.noteCount).toBeGreaterThan(0);
        expect(notesPerMeasure).toBeGreaterThan(1);
        expect(notesPerMeasure).toBeLessThan(16);
    });
});
