/**
 * Leaf module for chord-quality classification Sets shared across engines.
 *
 * Kept strictly dependency-free (no lane-generator imports) so cross-engine
 * consumers can reference a shared quality Set WITHOUT dragging a heavy lane
 * generator into their bundle chunk. #542: `soloist-pitch-engine.ts` previously
 * imported `ALTERED_HOOK_QUALITIES` from `accompaniment.ts`, which (since the
 * soloist is in the main chunk) statically pulled all of `accompaniment.ts` into
 * `index.js`. Hoisting the const here breaks that edge.
 */

// 7alt/7b9/7#9/7b13 are the altered-dominant qualities used for soloist
// hook-pitch reward (soloist-pitch-engine) and the comper tension-resolution
// breath (accompaniment). Distinct from ALTERED_DOMINANT_QUALITIES, which is
// for structural concerns (inversion routing, shell reduction): 7#11 is a
// static color chord that rings through and is deliberately excluded here.
// Source: Epic 9 S3 P1 finding (music-theory review).
export const ALTERED_HOOK_QUALITIES = new Set(['7alt', '7b9', '7#9', '7b13']);
