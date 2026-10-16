/**
 * hash-utils.ts — canonical deterministic hash + seeded-RNG helpers shared
 * across the voices (sample, soloist, drums). (The generative
 * engines it was written for — bass, drums/groove, harmony, accompaniment,
 * soloist/drum seeders, conductor — are gone, #1404.)
 *
 * What belongs here: pure, dependency-free determinism primitives — stateless
 * scrambles. Nothing in this module may
 * import anything else in the repo; it is deliberately a leaf so any caller
 * (voices, scripts, tests) can use it freely.
 *
 * What does NOT belong here: musical interpretation of a seeded draw (that's
 * the engine that owns the decision), step/meter math (`../utils.js`), string
 * sanitization (`../sanitize.js`).
 *
 * **`scrambleHash` is *stateless*, indexed by an explicit seed tuple** — see
 * `public/engine/CLAUDE.md` §27. It used to sit beside `createPRNG`, a *stateful,
 * sequential* stream whose draw count was load-bearing; that went with the old
 * engine (the band draws from `rng(seed, …keys)`, `band/core/random.ts`). Do not
 * change how many draws any call path consumes.
 *
 * `scrambleHash` is defined here and nowhere else (the old engine's generators that
 * shared it were deleted, #1404; the synth voices still use it).
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
