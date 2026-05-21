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
export const stringHash31 = (str: string): number => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return h;
};
