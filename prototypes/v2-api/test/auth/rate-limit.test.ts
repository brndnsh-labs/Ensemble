import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../src/auth/rate-limit.js';

/**
 * Unit tests for the ported sliding-window limiter (#1191 adversarial-review P2 finding: this
 * module shipped with zero direct tests — every prior assertion of its behavior was incidental,
 * exercised only through `/api/auth/recovery/claim`'s HTTP tests, which never drove the sweep
 * path or the window-boundary edges directly).
 */

describe('createRateLimiter', () => {
    it('caps identity churn without evicting live buckets or resetting their allowance', () => {
        const check = createRateLimiter({ max: 1, windowMs: 1000, maxKeys: 2 });
        expect(check('a', 0).allowed).toBe(true);
        expect(check('b', 0).allowed).toBe(true);
        expect(check('c', 1).allowed).toBe(true); // one shared overflow bucket
        expect(check('d', 2).allowed).toBe(false);
        expect(check('a', 2).allowed).toBe(false);
        expect(check('e', 1001).allowed).toBe(true);
    });
    it('allows up to max hits within the window, blocks the (max + 1)th', () => {
        const check = createRateLimiter({ max: 3, windowMs: 1000 });
        expect(check('k', 0).allowed).toBe(true);
        expect(check('k', 1).allowed).toBe(true);
        expect(check('k', 2).allowed).toBe(true);
        expect(check('k', 3).allowed).toBe(false);
    });

    it('a blocked call does NOT count as an additional hit (repeated 429s do not extend the block)', () => {
        const check = createRateLimiter({ max: 1, windowMs: 1000 });
        expect(check('k', 0).allowed).toBe(true);
        expect(check('k', 500).allowed).toBe(false);
        expect(check('k', 999).allowed).toBe(false);
        // The window is anchored to the ORIGINAL hit at t=0, not extended by the blocked probes
        // at t=500/999 — reclaimable at exactly t=1000.
        expect(check('k', 1000).allowed).toBe(true);
    });

    it('retryAfterMs reflects time until the OLDEST in-window hit falls out', () => {
        const check = createRateLimiter({ max: 1, windowMs: 1000 });
        check('k', 100);
        const blocked = check('k', 300);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterMs).toBe(800);
    });

    it('retryAfterMs is 0 when allowed', () => {
        const check = createRateLimiter({ max: 5, windowMs: 1000 });
        const result = check('k', 0);
        expect(result.allowed).toBe(true);
        expect(result.retryAfterMs).toBe(0);
    });

    it('sliding window: reclaimable once the oldest hit ages out, independent of later ones', () => {
        const check = createRateLimiter({ max: 2, windowMs: 1000 });
        check('k', 0);
        check('k', 500);
        expect(check('k', 999).allowed).toBe(false);
        // t=0's hit is now outside the window (999 - 1000 < 0 is false at t=1000: cutoff=0, hit
        // at exactly 0 is NOT > cutoff, so it's excluded) — one slot freed.
        expect(check('k', 1000).allowed).toBe(true);
    });

    it('distinct keys never share a bucket', () => {
        const check = createRateLimiter({ max: 1, windowMs: 1000 });
        expect(check('a', 0).allowed).toBe(true);
        expect(check('a', 1).allowed).toBe(false);
        // 'b' has never been hit — must be allowed despite 'a' being exhausted.
        expect(check('b', 1).allowed).toBe(true);
    });

    it('two separate createRateLimiter() instances never share state (factory, not a singleton)', () => {
        const checkA = createRateLimiter({ max: 1, windowMs: 1000 });
        const checkB = createRateLimiter({ max: 1, windowMs: 1000 });
        expect(checkA('k', 0).allowed).toBe(true);
        expect(checkA('k', 1).allowed).toBe(false);
        // A fresh limiter's own bucket for the SAME key is untouched by A's exhaustion.
        expect(checkB('k', 1).allowed).toBe(true);
    });

    it('a long idle gap, then activity again, behaves as a fresh window (exercises the sweep path)', () => {
        const check = createRateLimiter({ max: 1, windowMs: 1000 });
        expect(check('k', 0).allowed).toBe(true);
        expect(check('k', 1).allowed).toBe(false);
        // Far past several window lengths — `sweep()` (internal, at most once per window) would
        // have dropped 'k' entirely by now were it ever invoked again; either way the key must
        // behave as freshly available.
        expect(check('k', 50_000).allowed).toBe(true);
    });
});
