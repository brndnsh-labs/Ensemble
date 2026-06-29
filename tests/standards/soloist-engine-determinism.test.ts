// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
// THE live soloist engine (epic #10 — legacy getSoloistNote retired). Determinism
// is now asserted against the engine that actually plays.
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

/**
 * Engine-wide soloist determinism — production-faithful on the live engine
 * (getSoloistNotePhraseFirst). Rerouted from the retired legacy getSoloistNote
 * (epic #10, #863).
 *
 * Runs the full soloist engine over a macro-form TWICE, each pass driven by a
 * DELIBERATELY DIFFERENT `Math.random` stream, and asserts the emitted note
 * sequence is byte-identical across the two runs. Phrase-first is deterministic
 * BY CONSTRUCTION: it replays a seeded theme and every per-tick decision (density
 * gate, expression flurry, double-stop) is a `scrambleHash` keyed on
 * (step, loopCount) — it never draws from `Math.random`. So two passes under two
 * different streams MUST agree byte-for-byte.
 *
 * This subsumes the legacy head-bypass-jitter determinism probe (deleted in #863):
 * driving two different Math.random streams is the strongest possible proof that
 * the engine has NO dependence on the global RNG at all.
 *
 * What it catches:
 *   - any sub-path re-introducing an un-seeded `Math.random()` draw (the two
 *     streams would feed it different values → divergence),
 *   - a NON-RNG source of nondeterminism (Date.now / performance.now,
 *     Set/Map iteration order, uninitialized module state),
 *   - cross-run state leakage that survives `RESET_STATE`,
 *   - a seed-keying regression that makes the soloist non-reproducible.
 */

// One full soloist pass over a macro-form, with `Math.random` pinned to a fixed
// stream so a re-introduced un-seeded draw is observable (two streams → two
// values → divergence). Returns a compact per-step signature of emitted notes.
function runSoloistPass(rngValue: number): string[] {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Jazz' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'jazz' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.7);
    dispatch(ACTIONS.SET_BPM, 140);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === 'Jazz Blues');
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);

    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.7, 'DETERMINISM');
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = false;

    const loopLen = seed.loopLengthSteps || state.arranger.totalSteps;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    // Pin Math.random to a constant for this pass. The two passes use DIFFERENT
    // constants, so any engine draw from Math.random produces a different result
    // per pass and the signatures would diverge — a deterministic engine ignores
    // it entirely and the signatures stay identical.
    const spy = vi.spyOn(Math, 'random').mockReturnValue(rngValue);
    const signature: string[] = [];
    try {
        for (let abs = 0; abs < loopLen * 3 + 64; abs++) {
            state.playback.currentLoopCount = Math.floor(abs / total);
            const note = getSoloistNotePhraseFirst(
                state,
                chordAt(abs),
                chordAt(abs + 1),
                abs,
                null,
                state.soloist.octave,
                'smart',
                abs % 16,
                {},
                { isDownbeat: abs % 16 === 0, isMeasureStart: abs % 16 === 0 },
            );
            if (note) {
                const results = Array.isArray(note) ? note : [note];
                // Capture pitch + duration + timing + expression — a regression in
                // any sub-path (pitch, voice-leading, density gate, flurry, double-
                // stop) changes at least one field.
                signature.push(
                    results
                        .map(
                            (n: any) =>
                                `${n.midi}/${n.durationSteps ?? 0}/${(n.timingOffset ?? 0).toFixed(4)}/${n.bendStartInterval ?? 0}`,
                        )
                        .join('+'),
                );
            } else {
                signature.push('-');
            }
        }
    } finally {
        spy.mockRestore();
    }
    return signature;
}

function countDivergences(a: string[], b: string[]): { count: number; firstAt: number } {
    let count = 0;
    let firstAt = -1;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) {
            if (firstAt < 0) {
                firstAt = i;
            }
            count++;
        }
    }
    return { count, firstAt };
}

describe('Soloist engine-wide determinism (phrase-first)', () => {
    it('is byte-identical across two runs under two DIFFERENT Math.random streams', () => {
        // Two deliberately different constant RNG streams. Anything the engine
        // draws from Math.random differs between the two passes; only seeded paths
        // (scrambleHash + the fixed-seed theme) stay stable.
        const runA = runSoloistPass(0.123_456_789);
        const runB = runSoloistPass(0.987_654_321);

        const { count, firstAt } = countDivergences(runA, runB);
        const emitted = runA.filter((s) => s !== '-').length;

        console.log(
            '\n--- SOLOIST ENGINE DETERMINISM (phrase-first) ---\n' +
                `[Signature length]      ${runA.length}\n` +
                `[Notes emitted (run A)] ${emitted}\n` +
                `[Divergences]           ${count}\n` +
                (firstAt >= 0
                    ? `[First divergence]      step ${firstAt}: A=${runA[firstAt]} B=${runB[firstAt]}\n`
                    : '') +
                '[Target]                0 divergences\n' +
                '-------------------------------------------------\n',
        );

        // Both runs must have produced a full-length signature, and the engine must
        // actually be playing — a non-trivial count of emitted notes — so the
        // 0-divergence assertion isn't vacuously satisfied by an all-rest run.
        expect(runA.length).toBe(runB.length);
        expect(emitted).toBeGreaterThan(50);
        // The soloist must be byte-reproducible regardless of the Math.random
        // stream. Any divergence means a sub-path re-introduced an un-seeded
        // `Math.random()` draw, has a non-RNG source of nondeterminism, or
        // cross-run state leaks past RESET_STATE. Determinism is exact — no
        // headroom argument.
        expect(count).toBe(0);
    });
});
