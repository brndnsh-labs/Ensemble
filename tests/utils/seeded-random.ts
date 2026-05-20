/**
 * Shared deterministic-RNG fixture for soloist (and other engine) critique
 * tests — Epic 10 S2 (d).
 *
 * Several soloist critique tests (Evans extension/cadence, expansion, idiom)
 * showed 15-50% single-run variance despite per-iteration profile/role pinning
 * and 800-step loops. The variance is dominated by un-seeded `Math.random()`
 * in the picker weight roulette, the section-boundary profile re-roll, and the
 * rhythm engine's attack distribution. Installing a `mulberry32`-seeded
 * `Math.random` spy collapses each test to a single deterministic run, so the
 * assertion bounds can tighten 3-5x without flaking.
 *
 * Canonical PRNG: mulberry32 (see `feedback_seeded_prng_mulberry32` in user
 * memory). A bare LCG correlates badly on small integer seeds; mulberry32's
 * avalanche keeps the stream well-distributed.
 *
 * Usage:
 *   import { installSeededRandom } from '../utils/seeded-random.js';
 *
 *   describe('...', () => {
 *       const rng = installSeededRandom();   // spies Math.random in beforeEach,
 *                                            // restores in afterEach
 *       it('...', () => {
 *           rng.reseed(0xC0FFEE);            // optional: pin a specific seed
 *           // ... engine runs are now fully deterministic ...
 *       });
 *   });
 */
import { afterEach, beforeEach, vi } from 'vitest';

const DEFAULT_SEED = 0xc0ffee;

/** Build a standalone mulberry32 generator. Identical to the project-wide
 *  `scrambleHash`/mulberry32 used in the engine; exported so tests that need
 *  a private deterministic stream (not the global spy) can reuse it. */
export function makeMulberry32(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface SeededRandomHandle {
    /** Re-seed the global `Math.random` spy mid-test. Resets the stream so the
     *  next engine run starts from a known point. */
    reseed: (seed: number) => void;
    /** The seed the spy is currently driven by. */
    readonly seed: number;
}

/**
 * Installs a `mulberry32`-seeded `Math.random` spy. Call once at the top of a
 * `describe` block; the spy is (re)installed before every test and restored
 * after, so it never leaks across files. Each test starts from `DEFAULT_SEED`
 * unless `reseed()` is called.
 */
export function installSeededRandom(initialSeed: number = DEFAULT_SEED): SeededRandomHandle {
    const handle = {
        seed: initialSeed,
        reseed: (seed: number) => {
            handle.seed = seed;
            const prng = makeMulberry32(seed);
            vi.spyOn(Math, 'random').mockImplementation(prng);
        },
    };

    beforeEach(() => {
        // restoreAllMocks first so a prior file's leftover spy can't stack.
        vi.restoreAllMocks();
        handle.reseed(handle.seed);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    return handle;
}
