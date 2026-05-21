/**
 * hash-utils.ts — canonical deterministic hash helpers shared across the
 * generative engines (bass, drums/groove, harmony, accompaniment).
 *
 * Before Epic 11 S9 `scrambleHash` was copy-pasted into four engines
 * (bass-engine, groove-engine, harmonies, plus accompaniment's
 * `compScrambleHash`) and the string hash had drifted into two divergent
 * variants. Consolidating here keeps the *observable* per-engine distribution
 * identical — see notes on `stringHash33` vs `stringHash31` below — while
 * removing the dead-helper duplication.
 *
 * NOTE: soloist.ts still carries its own byte-identical local `scrambleHash`.
 * Migrating the soloist's draw sites is deferred to FOLLOWUPS §F (the
 * soloist-picker scrambleHash migration, its own opus story) so S9 did not
 * disturb the seeded streams S10 had just stabilized.
 *
 * why two string hashes, not one: changing which djb2 variant an engine feeds
 * into its seeded RNG shifts the distribution flowing into the critique gates
 * (the `feedback_prng_migration_dead_gates` trap). Bass + groove section
 * hashing already depend on the 33-from-5381 variant; accompaniment cell-bank
 * picking and groove instrument-name folding depend on the 31-from-0 variant.
 * Both are exported so every call site keeps its exact prior output.
 */

/**
 * mulberry32 — 32-bit scrambled hash. Maps a small integer seed to a
 * well-distributed float in [0, 1). Deterministic: the canonical replacement
 * for raw `Math.random()` at seeded per-step decision sites so motif/velocity
 * decisions are reproducible across loops and critique-test runs.
 *
 * Do NOT substitute a bare LCG on small integer seeds — mulberry32 scrambles
 * small linear inputs into well-distributed uint32 outputs; an LCG produces
 * a low-entropy sawtooth pattern instead.
 */
export const scrambleHash = (seed: number): number => {
    let t = (seed + 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
};

/**
 * makeSeededStream — build a stateful mulberry32 generator from an integer
 * seed. Each call returns the next well-distributed float in [0, 1).
 *
 * This is the *stream* counterpart to `scrambleHash` (a single-shot map). Use
 * it when a function makes an unbounded / variable number of draws and you
 * want determinism-by-construction: seed the stream once on the function's
 * stable inputs (e.g. `(startStep, sessionSteps, loopCount)`), then draw from
 * it like a drop-in `Math.random`. Two calls with the same seed replay the
 * exact same sequence — so looped playback and critique tests are byte-stable
 * without needing to stub `Math.random`.
 *
 * Do NOT re-seed per draw with a bare integer (`scrambleHash(step)` per call):
 * for a SMALL FIXED number of co-located draws a discriminated `scrambleHash`
 * is fine, but for a loop of N draws a single advancing stream avoids both the
 * per-step correlation trap and the discriminator-collision bookkeeping.
 */
export const makeSeededStream = (seed: number): (() => number) => {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
};

/**
 * djb2 string hash, ×33 multiplier seeded from 5381 (the classic djb2
 * constants). Returns a signed 32-bit int (`| 0`).
 *
 * Used by bass-engine + groove-engine for section-id folding. The signed
 * result is intentional — both call sites XOR it into a larger seed.
 */
export const stringHash33 = (str: string): number => {
    let h = 5381 | 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(h, 33) + str.charCodeAt(i)) | 0;
    }
    return h;
};

/**
 * djb2-style string hash, ×31 multiplier seeded from 0. Returns a signed
 * 32-bit int (`| 0`); callers that need a non-negative value apply
 * `Math.abs` themselves (see `hashSectionId` in accompaniment.ts).
 *
 * Used by accompaniment cell-bank picking and groove instrument-name folding.
 * Kept distinct from `stringHash33` so those engines' seeded distributions —
 * and the critique gates downstream of them — survive the consolidation
 * unchanged.
 */
// Also serves as a general string→int32 fold for call sites (e.g. the soloist
// seed keying) that just need a stable, well-mixed integer per distinct label.
export const stringHash31 = (str: string): number => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return h;
};
