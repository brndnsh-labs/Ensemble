// @ts-nocheck
/**
 * Hip Hop Soloist Critique — VERBATIM HOOK LANE (#555, genre-audit Wave 1)
 *
 * Two defects, one fix:
 *  (1) Wiring — `smart-genres.ts` set Hip Hop's soloist to `'neo'`, and the smart
 *      key out-prioritizes GENRE_STYLE_MAPPING, so Hip Hop played Neo-Soul and the
 *      hand-tuned `hiphop` profile was DEAD. Flipped to `'hiphop'`.
 *  (2) Idiom — hip-hop melody is a sparse 1–2 bar HOOK looped, not a through-
 *      composed solo. A surgical retune ("make it sparse") was disproved (the
 *      sparse line was *less* repetitive than the neo it replaced — motivicResponse
 *      is washed out by SRDC head-replay). The fix is a dedicated VERBATIM hook
 *      lane: carve the strongest 2-bar window of the head and replay it exactly
 *      every bar (`hookLoop` profile flag → short-circuit in getSoloistNote).
 *
 * The repetition metric below is the one the sparse retune FAILED: exact pitch
 * repetition across the hook period and across loops. With the verbatim lane it
 * lands at ~1.0; Neo-Soul (the dead routing, no hook) sits far lower — the clean
 * discriminator that proves the lane works, not just that notes got sparser.
 */
import { describe, expect, it } from 'vitest';
import { resolveSoloistStyle } from '../../public/engine/soloist-config.js';
import {
    bootstrapSoloistAudit,
    buildHookAuditArrangement,
    simulateSoloistLoops,
} from '../../scripts/soloist-analysis-utils.js';

// Exact-pitch repetition of the emitted line at a given step lag. lag = hook
// length → "does the 2-bar hook repeat verbatim"; lag = loop length → "is every
// loop identical". Keyed on absoluteStep→midi so it measures the real output.
function repetitionProfile(genre, style = 'smart') {
    const arrangement = buildHookAuditArrangement('4/4');
    const boot = bootstrapSoloistAudit({
        arrangement,
        genre,
        bpm: 90,
        intensity: 0.5,
        timeSignature: '4/4',
        style,
        seed: 'HEAD_AUDIT',
    });
    const cap = simulateSoloistLoops({ state: boot.state, arrangement, loops: 4, style });
    const hookLen = boot.state.soloist.session.hook?.loopLengthSteps || 0;
    const byStep = new Map();
    for (const e of cap.events) {
        if (e.absoluteStep >= 0) {
            byStep.set(e.absoluteStep, e.note.midi);
        }
    }
    const lagRep = (lag) => {
        if (lag <= 0) {
            return 0;
        }
        let hits = 0;
        let total = 0;
        for (const [s, midi] of byStep) {
            const other = byStep.get(s + lag);
            if (other !== undefined) {
                total++;
                if (other === midi) {
                    hits++;
                }
            }
        }
        return total ? hits / total : 0;
    };
    return {
        hookLen,
        noteCount: byStep.size,
        measures: arrangement.measuresPerLoop * 4,
        periodRep: lagRep(hookLen),
        loopOverLoop: lagRep(arrangement.totalSteps),
    };
}

describe('Hip Hop Soloist Critique', () => {
    // (1) DEAD-KEY ROUTING GUARD. The whole bug started here: the smart key must
    // resolve to the dedicated hiphop profile, not neo. Pins it both ways.
    it('routes Hip Hop (smart) to the dedicated hiphop profile, not neo', () => {
        expect(resolveSoloistStyle('smart', 'Hip Hop')).toBe('hiphop');
        // explicit style honored too
        expect(resolveSoloistStyle('hiphop', 'Hip Hop')).toBe('hiphop');
        // regression: must NOT fall back to neo
        expect(resolveSoloistStyle('smart', 'Hip Hop')).not.toBe('neo');
    });

    it('plays a verbatim looping hook — measurably more repetitive than neo', () => {
        const hip = repetitionProfile('Hip Hop');
        const neo = repetitionProfile('Neo-Soul');

        console.log('\n--- HIP HOP SOLOIST CRITIQUE REPORT ---');
        console.log(`[hook length steps]   ${hip.hookLen} (2 bars × 16 = 32)`);
        console.log(`[period repetition]   ${(hip.periodRep * 100).toFixed(1)}% (Target: >0.90)`);
        console.log(
            `[loop-over-loop]      hiphop ${(hip.loopOverLoop * 100).toFixed(1)}%  vs  neo ${(neo.loopOverLoop * 100).toFixed(1)}%`,
        );
        console.log(`[notes over 4 loops]  hiphop ${hip.noteCount}  neo ${neo.noteCount}`);
        console.log('---------------------------------------\n');

        // (2) THE HOOK IS CAPTURED. 2 bars × 16 steps/bar = 32.
        expect(hip.hookLen).toBe(32);

        // (3) VERBATIM REPETITION — the feature. The emitted line repeats exactly
        // at the hook period: the same pitch recurs 2 bars later across the whole
        // performance. Engine: ~1.0; >0.90 leaves headroom for any future
        // micro-variation that rides velocity/timing (never pitch).
        expect(hip.periodRep).toBeGreaterThan(0.9);

        // (4) MEASURABLY MORE REPETITIVE THAN NEO — the metric the sparse retune
        // FAILED. Loop-over-loop exact pitch: hiphop ~1.0 (every loop identical),
        // neo ~0.18 (regenerates). Assert the wide separation, not just "hiphop
        // high", so a regression that weakens the lane is caught.
        expect(hip.loopOverLoop).toBeGreaterThan(0.85);
        expect(neo.loopOverLoop).toBeLessThan(0.45);
        expect(hip.loopOverLoop - neo.loopOverLoop).toBeGreaterThan(0.4);
    });

    it('stays a coherent, non-empty melodic line (regression guard)', () => {
        const hip = repetitionProfile('Hip Hop');
        // The hook must actually produce notes (not silence the soloist) and not
        // spray every step. notesPerMeasure across the 4-loop performance.
        const notesPerMeasure = hip.noteCount / Math.max(1, hip.measures);
        expect(hip.noteCount).toBeGreaterThan(0);
        expect(notesPerMeasure).toBeGreaterThan(1);
        expect(notesPerMeasure).toBeLessThan(16);
    });
});
