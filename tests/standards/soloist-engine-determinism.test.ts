import { describe, expect, it } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

/**
 * Epic 10 S2 (b) — Engine-wide soloist determinism.
 * Re-scoped Epic 12 S1 — un-stubbed byte-reproducibility.
 *
 * Runs the full soloist engine for N bars TWICE with the REAL (un-stubbed)
 * `Math.random`, and asserts the emitted note sequence is byte-identical
 * across the two runs. This is the property EVERY other seeded soloist
 * critique test (S2.c picker chromatism, S2.e Evans cadence, the chorus-
 * evolution rhythm tests) silently relies on — this test makes it explicit.
 *
 * Epic 12 S1 migrated every un-seeded `Math.random()` in the soloist engine
 * (`soloist.ts`, `soloist-pitch-engine.ts`, `soloist-rhythm-engine.ts`) onto
 * the canonical `scrambleHash` / `makeSeededStream` keyed on
 * `(step, section, loopCount)`. The engine is therefore deterministic *by
 * construction* — no `Math.random` spy is needed, and a pinned-mulberry32
 * fixture would no longer prove anything the engine doesn't already guarantee.
 *
 * What it catches:
 *   - a sub-engine re-introducing an un-seeded `Math.random()` draw,
 *   - a NON-RNG source of nondeterminism (Date.now / performance.now,
 *     Set/Map iteration order, uninitialized module state),
 *   - cross-run state leakage that survives `RESET_STATE`,
 *   - a seed-keying regression that makes the soloist non-reproducible.
 *
 * No warm-up needed: the soloist's `audio` runtime (`lastMidiPlayed` etc.)
 * is cleared by the `RESET_STATE` reducer, so the very first
 * `getSoloistNote` pass in a process is already byte-identical to every
 * later pass.
 */

const NUM_STEPS = 1024; // 64 bars of 16 steps — long enough to exercise loops,
// section recall, device buffers, and the SRDC phase machine.

const Dm7 = { rootMidi: 62, intervals: [0, 3, 7, 10], sectionStart: 0, sectionEnd: 512 };
const G7 = { rootMidi: 67, intervals: [0, 4, 7, 10], sectionStart: 0, sectionEnd: 512 };
const Cmaj7 = { rootMidi: 60, intervals: [0, 4, 7, 11], sectionStart: 0, sectionEnd: 512 };
const PROGRESSION = [Dm7, G7, Cmaj7, Cmaj7];

/**
 * One full soloist pass under the REAL (un-stubbed) `Math.random`. The soloist
 * engine is deterministic by construction (Epic 12 S1), so two passes must
 * agree byte-for-byte without any RNG pinning. Returns a compact per-step
 * signature of the emitted notes.
 */
function runSoloistPass(): string[] {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Jazz', enabled: true });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'jazz' });

    const signature: string[] = [];
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

describe('Soloist engine-wide determinism (Epic 10 S2.b / Epic 12 S1)', () => {
    it('is byte-identical across two un-stubbed runs', () => {
        // No RNG spy: the soloist engine is deterministic by construction
        // (Epic 12 S1 migrated every draw to `scrambleHash` keyed on
        // (step, section, loopCount)). Two passes with the REAL `Math.random`
        // must agree byte-for-byte.
        const runA = runSoloistPass();
        const runB = runSoloistPass();

        const { count, firstAt } = countDivergences(runA, runB);

        console.log(
            '\n--- SOLOIST ENGINE DETERMINISM (S2.b / Epic 12 S1) ---\n' +
                `[Steps per run]         ${NUM_STEPS}\n` +
                `[Run A signature len]   ${runA.length}\n` +
                `[Run B signature len]   ${runB.length}\n` +
                `[Divergences]           ${count}\n` +
                (firstAt >= 0
                    ? `[First divergence]      step ${firstAt}: A=${runA[firstAt]} B=${runB[firstAt]}\n`
                    : '') +
                '[Target]                0 divergences\n' +
                '------------------------------------------------------\n',
        );

        // Both runs must have produced a full-length signature — guards
        // against an early-throw silently shortening one run.
        expect(runA.length).toBe(NUM_STEPS);
        expect(runB.length).toBe(NUM_STEPS);
        // The soloist must be byte-reproducible with NO RNG stub. Any
        // divergence means a sub-engine re-introduced an un-seeded
        // `Math.random()` draw, has a non-RNG source of nondeterminism, or
        // cross-run state leaks past RESET_STATE. There is no headroom
        // argument — determinism is exact.
        expect(count).toBe(0);
    });
});
