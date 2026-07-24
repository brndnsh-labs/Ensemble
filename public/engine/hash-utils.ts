/**
 * hash-utils.ts — canonical deterministic hash + seeded-RNG helpers shared
 * across the generative engines (bass, drums/groove, harmony, accompaniment,
 * soloist/drum seeders, conductor).
 *
 * What belongs here: pure, dependency-free determinism primitives — string
 * folds, stateless scrambles, and seeded generators. Nothing in this module may
 * import anything else in the repo; it is deliberately a leaf so both worker
 * and main thread can use it freely.
 *
 * What does NOT belong here: musical interpretation of a seeded draw (that's
 * the engine that owns the decision), step/meter math (`../utils.js`), string
 * sanitization (`../sanitize.js`), or share/persistence encoding
 * (`../state/share-codec.js`).
 *
 * **The two RNG idioms here stay distinct on purpose** — see
 * `public/engine/CLAUDE.md` §27. `scrambleHash` is *stateless*, indexed by an
 * explicit seed tuple; `createPRNG` is a *stateful, sequential* stream whose
 * draw count is load-bearing. Do not unify them, and do not change how many
 * draws any call path consumes.
 *
 * Before Epic 11 S9 `scrambleHash` was copy-pasted into four engines
 * (bass-engine, groove-engine, harmonies, plus accompaniment's
 * `compScrambleHash`) and the string hash had drifted into two divergent
 * variants. Consolidating here keeps the *observable* per-engine distribution
 * identical — see notes on `stringHash33` vs `stringHash31` below — while
 * removing the dead-helper duplication.
 *
 * The consolidation is complete: `scrambleHash` is defined here and nowhere
 * else. The soloist migrated with it — `soloist-phrase-first.ts` imports the
 * canonical helper, and the old `soloist.ts` that carried a byte-identical
 * local copy no longer exists.
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
// Also serves as a general string→int32 fold for call sites (e.g. the soloist
// seed keying) that just need a stable, well-mixed integer per distinct label.
export const stringHash31 = (str: string): number => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return h;
};

/**
 * deriveSectionSeed — the per-section groove-variation marker, derived purely
 * from `(sectionId, songSeed)`. Returns a well-distributed float in [0, 1) used
 * as the abstract pool marker that `getMotif` (and the per-genre phrase seeds)
 * key off (groove-engine.ts).
 *
 * why (finding #791): this used to be `Math.random()` written into
 * `groove.sectionSeedMap` by the conductor, with a *different*, bar-indexed
 * fallback in the groove engine for sections the conductor hadn't seeded yet.
 * Three bugs fell out of that: the seed wasn't reproducible (same chart + same
 * song seed → different groove across replays/devices), the two paths
 * disagreed (a mid-section groove swap as the lagged conductor write landed
 * over the fallback), and the bar-indexed fallback re-picked the motif every
 * bar so an unseeded section never settled. Deriving BOTH the conductor write
 * and the engine fallback from this one function makes the two paths identical
 * — the swap is gone by construction — and ties the groove to the song seed so
 * a pinned seed reproduces the exact drum performance everywhere.
 *
 * Keyed via `stringHash31` (the engines' general string→int32 fold) XORed so a
 * given section moves with the song seed but stays distinct from its siblings.
 */
export const deriveSectionSeed = (sectionId: string, songSeed: string): number =>
    scrambleHash((stringHash31(sectionId) ^ stringHash31(songSeed)) | 0);

/**
 * Creates a seeded pseudo-random number generator (Mulberry32).
 *
 * Distinct from {@link scrambleHash} and not interchangeable with it: this is a
 * **stateful, sequential** stream used for seed-time generation (the soloist and
 * drum seeders, the conductor's macro jitter). Every consumer sharing a stream
 * depends on the exact number of draws taken before it, so adding or removing a
 * `prng()` call anywhere upstream reseats everything downstream — see
 * `public/engine/CLAUDE.md` §27 before touching a call path's draw count.
 *
 * String seeds are folded with the canonical djb2 ×33 hash
 * ({@link stringHash33}) and coerced **unsigned** (`>>> 0`). The unsigned
 * coercion is load-bearing history, not decoration: the local `hashString`
 * this replaced returned `hash >>> 0`, and every seeded stream in the repo was
 * tuned against that starting value. `stringHash33` returns the signed (`| 0`)
 * form of the identical accumulator, so `>>> 0` reproduces the old seed
 * bit-for-bit — do not "simplify" it to `| 0`.
 */
export function createPRNG(seed: number | string): () => number {
    let s = typeof seed === 'string' ? stringHash33(seed) >>> 0 : seed;
    return () => {
        s |= 0;
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
