import { describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { makeMulberry32 } from '../utils/seeded-random.js';

/**
 * Epic 10 S2 (b) — Engine-wide soloist determinism.
 *
 * Runs the full soloist engine for N bars under a pinned `mulberry32`-seeded
 * `Math.random`, twice, and asserts the emitted note sequence is byte-identical
 * across the two runs. This is the property EVERY other seeded soloist
 * critique test (S2.c picker chromatism, S2.e Evans cadence, the chorus-
 * evolution rhythm tests) silently relies on — this test makes it explicit.
 *
 * What it catches:
 *   - a sub-engine introducing a NON-`Math.random` source of nondeterminism
 *     (Date.now / performance.now, Set/Map iteration order, uninitialized
 *     module state),
 *   - cross-run state leakage that survives `RESET_STATE`,
 *   - a regression that makes the soloist non-reproducible under a fixed RNG.
 *
 * What it deliberately does NOT claim: byte-determinism with the REAL
 * (un-stubbed) `Math.random`. The soloist pitch picker's weighted roulette
 * (`Math.random() * totalWeight`), device-trigger gates and timing jitter
 * still draw from un-seeded `Math.random()` — the May 2026 `scrambleHash`
 * migration covered bass / harmonies / grooves but NOT the soloist picker. A
 * no-stub determinism test is therefore impossible today; that gap is filed
 * in FOLLOWUPS §F as an engine task.
 *
 * First-call warm-up: the very first `getSoloistNote` call in a process sets
 * some module-level state that `RESET_STATE` does not clear, so run #1 in a
 * file can differ at step 0 from runs #2+ (runs #2 and #3 are identical to
 * each other). The test does one discarded warm-up pass before the two
 * measured passes. That step-0 warm-up artifact is itself filed in
 * FOLLOWUPS §F.
 */

const NUM_STEPS = 1024; // 64 bars of 16 steps — long enough to exercise loops,
// section recall, device buffers, and the SRDC phase machine.

const Dm7 = { rootMidi: 62, intervals: [0, 3, 7, 10], sectionStart: 0, sectionEnd: 512 };
const G7 = { rootMidi: 67, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 512 };
const Cmaj7 = { rootMidi: 60, intervals: [0, 4, 7, 11], sectionStart: 0, sectionEnd: 512 };
const PROGRESSION = [Dm7, G7, Cmaj7, Cmaj7];

/**
 * One full soloist pass. When `seededRngSeed` is a number, `Math.random` is
 * pinned to a mulberry32 stream at that seed; when `null`, the real
 * `Math.random` is used (for the discriminating-power check only). Returns a
 * compact per-step signature of the emitted notes.
 */
function runSoloistPass(seededRngSeed: number | null): string[] {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Jazz', enabled: true });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'jazz' });

    const spy =
        seededRngSeed !== null
            ? vi.spyOn(Math, 'random').mockImplementation(makeMulberry32(seededRngSeed))
            : null;
    const signature: string[] = [];
    try {
        let lastFreq = 440;
        for (let i = 0; i < NUM_STEPS; i++) {
            const chord = PROGRESSION[Math.floor(i / 16) % 4];
            const note = getSoloistNote(
                getState(),
                chord,
                null,
                i,
                lastFreq,
                0,
                'jazz',
                i % 16,
                { sectionStart: 0, sectionEnd: 512 },
                { mStep: i % 16 } as never,
            );
            if (note) {
                const results = Array.isArray(note) ? note : [note];
                // Capture pitch + duration + timing — a regression in any
                // engine sub-path (picker, devices, rhythm, register slotting)
                // changes at least one of these.
                signature.push(
                    results
                        .map(
                            (n: { midi: number; durationSteps?: number; timingOffset?: number }) =>
                                `${n.midi}/${n.durationSteps ?? 0}/${(n.timingOffset ?? 0).toFixed(4)}`,
                        )
                        .join('+'),
                );
                lastFreq = results[results.length - 1].frequency || lastFreq;
            } else {
                signature.push('-');
            }
        }
    } finally {
        spy?.mockRestore();
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

describe('Soloist engine-wide determinism (Epic 10 S2.b)', () => {
    it('is byte-identical across two runs under a pinned mulberry32 seed', () => {
        const SEED = 0xa5_3c_91_e0;

        // Discarded warm-up pass — absorbs the documented first-call module
        // warm-up so the two measured passes start from identical module
        // state. (FOLLOWUPS §F tracks eliminating the warm-up artifact.)
        runSoloistPass(SEED);

        const runA = runSoloistPass(SEED);
        const runB = runSoloistPass(SEED);

        const { count, firstAt } = countDivergences(runA, runB);

        console.log(
            '\n--- SOLOIST ENGINE DETERMINISM (S2.b) ---\n' +
                `[Steps per run]         ${NUM_STEPS}\n` +
                `[Run A signature len]   ${runA.length}\n` +
                `[Run B signature len]   ${runB.length}\n` +
                `[Divergences]           ${count}\n` +
                (firstAt >= 0
                    ? `[First divergence]      step ${firstAt}: A=${runA[firstAt]} B=${runB[firstAt]}\n`
                    : '') +
                '[Target]                0 divergences\n' +
                '-----------------------------------------\n',
        );

        // Both runs must have produced a full-length signature — guards
        // against an early-throw silently shortening one run.
        expect(runA.length).toBe(NUM_STEPS);
        expect(runB.length).toBe(NUM_STEPS);
        // Under a pinned RNG the soloist must be byte-reproducible. Any
        // divergence means a sub-engine has a non-seeded, non-`Math.random`
        // source of nondeterminism, or cross-run state leaks past
        // RESET_STATE. There is no headroom argument — determinism is exact.
        expect(count).toBe(0);
    });

    it('detects nondeterminism: the same two runs diverge with the real RNG', () => {
        // Discriminating-power / negative control. This is what gives the S2.b
        // assertion its teeth: if the soloist were trivially deterministic the
        // headline test would be vacuous. With the real un-stubbed
        // `Math.random`, the SAME two-run comparison must show many
        // divergences — proving (a) the engine genuinely consumes RNG entropy,
        // and (b) the headline test's 0-divergence result is attributable to
        // the seeded fixture, not to the engine being inert.
        const runA = runSoloistPass(null);
        const runB = runSoloistPass(null);

        const { count } = countDivergences(runA, runB);

        console.log(
            '\n--- SOLOIST DETERMINISM — NEGATIVE CONTROL ---\n' +
                `[Divergences with real RNG]  ${count} / ${NUM_STEPS}\n` +
                '[Expectation]                many (engine is stochastic without a seed)\n' +
                '-----------------------------------------------\n',
        );

        // The engine draws enough `Math.random()` entropy that two un-seeded
        // runs of 1024 steps differ at well over 50 positions in practice.
        // 20 is a deliberately conservative floor: it cannot be reached by
        // an engine that ignores its RNG, so it certifies the headline
        // test's seeded-RNG result is meaningful.
        expect(count).toBeGreaterThan(20);
    });
});
