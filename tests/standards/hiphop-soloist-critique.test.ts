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
 *      loops, and every 4th statement is a fill.
 *
 * So the metric is a WINDOW, not a ceiling: the hook must OUTLINE the changes
 * (anchors are chord tones) and must NOT be a verbatim loop (period pitch
 * repetition well below the old 1.0) while staying recognizable (not random).
 * The audit arrangement has moving chords (Cmaj7→G7→Am7→Fmaj7), so chord-following
 * is observable.
 */
import { describe, expect, it } from 'vitest';
import { resolveSoloistStyle } from '../../public/engine/soloist-config.js';
import {
    bootstrapSoloistAudit,
    buildHookAuditArrangement,
    simulateSoloistLoops,
} from '../../scripts/soloist-analysis-utils.js';

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
    const hookLen = boot.state.soloist.session.hook?.loopLengthSteps || 0;

    let anchorNotes = 0;
    let anchorOnChord = 0;
    let allNotes = 0;
    let allOnChord = 0;
    const byStep = new Map();
    for (const e of cap.events) {
        if (e.absoluteStep < 0) {
            continue;
        }
        byStep.set(e.absoluteStep, e.note.midi);
        const ch = e.chord;
        if (!ch?.intervals) {
            continue;
        }
        const rootPc = ((ch.rootMidi % 12) + 12) % 12;
        const chordPcs = new Set(ch.intervals.map((i) => (((rootPc + i) % 12) + 12) % 12));
        const pc = ((e.note.midi % 12) + 12) % 12;
        allNotes++;
        if (chordPcs.has(pc)) {
            allOnChord++;
        }
        if (e.note.isAnchor) {
            anchorNotes++;
            if (chordPcs.has(pc)) {
                anchorOnChord++;
            }
        }
    }
    let pHits = 0;
    let pTot = 0;
    for (const [s, m] of byStep) {
        const o = byStep.get(s + hookLen);
        if (o !== undefined) {
            pTot++;
            if (o === m) {
                pHits++;
            }
        }
    }
    return {
        hookLen,
        noteCount: byStep.size,
        measures: arrangement.measuresPerLoop * 4,
        anchorChordToneRate: anchorNotes ? anchorOnChord / anchorNotes : 0,
        allChordToneRate: allNotes ? allOnChord / allNotes : 0,
        periodPitchRep: pTot ? pHits / pTot : 0,
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

    it('outlines the chord changes — the hook follows the harmony', () => {
        const p = hookProfile();
        console.log('\n--- HIP HOP LIVING-HOOK REPORT ---');
        console.log(`[hook length]          ${p.hookLen} (2 bars × 16)`);
        console.log(
            `[anchor chord-tone]    ${(p.anchorChordToneRate * 100).toFixed(1)}% (Target: >0.85)`,
        );
        console.log(
            `[all chord-tone]       ${(p.allChordToneRate * 100).toFixed(1)}% (Target: >0.55)`,
        );
        console.log(
            `[period pitch rep]     ${(p.periodPitchRep * 100).toFixed(1)}% (Target: 0.40–0.90; was 1.0 verbatim)`,
        );
        console.log(`[notes over 4 loops]   ${p.noteCount}`);
        console.log('----------------------------------\n');

        expect(p.hookLen).toBe(32);
        // (2) CHORD-FOLLOWING — the headline fix. The hook's structural notes land
        // on the chord under them, so it outlines the progression instead of
        // freezing. Engine: ~1.0. A static verbatim hook over moving chords would
        // score far lower (its fixed pitches clash with most chords).
        expect(p.anchorChordToneRate).toBeGreaterThan(0.85);
        // The whole line stays harmonic (chord + scale tones), not just anchors.
        expect(p.allChordToneRate).toBeGreaterThan(0.55);
    });

    it('breathes — recognizable but NOT a verbatim copy-paste loop', () => {
        const p = hookProfile();
        // (3) THE WINDOW. period pitch repetition must be BELOW the old verbatim 1.0
        // (it varies as the chords move + ornament grows) yet not collapse to random
        // (the rhythm/contour skeleton still recurs). Engine: ~0.76.
        expect(p.periodPitchRep).toBeLessThan(0.9); // broke copy-paste
        expect(p.periodPitchRep).toBeGreaterThan(0.4); // still a recognizable hook
    });

    it('stays a coherent, non-empty melodic line (regression guard)', () => {
        const p = hookProfile();
        const notesPerMeasure = p.noteCount / Math.max(1, p.measures);
        expect(p.noteCount).toBeGreaterThan(0);
        expect(notesPerMeasure).toBeGreaterThan(1);
        expect(notesPerMeasure).toBeLessThan(16);
    });
});
