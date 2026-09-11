/**
 * A tiny in-memory sliding-window rate limiter, ported from
 * `../songsiknow/src/lib/auth/rate-limit.ts` (#1191 decision 10) with one required adaptation:
 * `check` takes `now` as a REQUIRED argument, never a `Date.now()` default. Every other module in
 * this service takes time as an explicit argument (see `config.ts`'s doc comment) rather than
 * reading the wall clock internally, and this is the one caller — `/api/auth/recovery/claim` —
 * that most needs a test to be able to drive the window boundary with a fake clock instead of a
 * real 10-minute sleep.
 *
 * Why in-memory, not DB-counted: this service, like the sibling, runs as a SINGLE container
 * process (the ratified deployment topology for this service). One process-local limiter sees
 * every request. **This is a correctness assumption, not an incidental implementation detail**:
 * if this service is ever scaled out to multiple instances, each instance gets its own bucket
 * map, and the effective limit becomes `max * instanceCount` — the limiter degrades SILENTLY
 * (still returns `allowed`/`blocked` answers, never throws or warns) rather than loudly. Anyone
 * changing the deployment topology must re-examine this file.
 *
 * Each limiter owns its own bucket map (factory, not a global singleton) — `src/http/app.ts`
 * instantiates exactly one per `createApp()` call, closure-captured alongside `now`/
 * `sessionTtlMs`, so tests get an isolated limiter per app instance instead of state leaking
 * across unrelated test cases via a module-level map.
 */

export interface RateLimitResult {
    /** False when this call is over the limit and should be rejected. */
    allowed: boolean;
    /** Ms until the oldest in-window hit falls out (so a 429 can set Retry-After). 0 when allowed. */
    retryAfterMs: number;
}

export interface RateLimiterOptions {
    /** Max allowed hits per key within the window. */
    max: number;
    /** Sliding window length in ms. */
    windowMs: number;
}

/**
 * Builds a sliding-window limiter. The returned `check` function records a hit for `key` and
 * reports whether it's within the limit.
 *
 * Memory is bounded to keys active within the last window: each call prunes its own key, and a
 * periodic sweep (at most once per window) drops keys that have gone idle, so a churn of
 * distinct keys (e.g. distinct source IPs) can't grow the map without bound.
 */
export function createRateLimiter({ max, windowMs }: RateLimiterOptions) {
    const hitsByKey = new Map<string, number[]>();
    let lastSweep = 0;

    function sweep(now: number): void {
        if (now - lastSweep < windowMs) {
            return;
        }
        lastSweep = now;
        const cutoff = now - windowMs;
        for (const [k, hits] of hitsByKey) {
            const live = hits.filter((t) => t > cutoff);
            if (live.length === 0) {
                hitsByKey.delete(k);
            } else {
                hitsByKey.set(k, live);
            }
        }
    }

    return function check(key: string, now: number): RateLimitResult {
        sweep(now);
        const cutoff = now - windowMs;
        const hits = (hitsByKey.get(key) ?? []).filter((t) => t > cutoff);

        if (hits.length >= max) {
            hitsByKey.set(key, hits);
            // The oldest in-window hit is what's keeping us blocked; once it ages out, there's
            // room again.
            const retryAfterMs = Math.max(0, (hits[0] ?? now) + windowMs - now);
            return { allowed: false, retryAfterMs };
        }

        hits.push(now);
        hitsByKey.set(key, hits);
        return { allowed: true, retryAfterMs: 0 };
    };
}
