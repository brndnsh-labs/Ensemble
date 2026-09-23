/**
 * Determinism primitives. Every musical decision draws from a stream keyed on *where it is
 * in the music* (seed, lane, bar, purpose), never on how many draws happened before it. So
 * regenerating bar 40 gives the same answer whether or not bars 0–39 were generated first,
 * and adding a new decision in one idiom can never reshuffle another idiom's choices.
 */

/** FNV-1a over a string, folded to uint32. */
function hashString(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** Combine integers/strings into one uint32 key. Order matters. */
export function hashKey(...parts: (number | string)[]): number {
    let h = 0x9e3779b9;
    for (const part of parts) {
        const v = typeof part === 'number' ? part | 0 : hashString(part);
        h ^= v + 0x9e3779b9 + (h << 6) + (h >>> 2);
        h >>>= 0;
    }
    return h >>> 0;
}

/** A small seeded stream. mulberry32: well-distributed even for adjacent integer seeds. */
export interface Rng {
    /** Uniform in [0, 1). */
    next(): number;
    /** True with probability p. */
    chance(p: number): boolean;
    /** Integer in [0, n). */
    int(n: number): number;
    pick<T>(items: readonly T[]): T;
    /** Weighted pick; weights need not sum to 1. Zero-weight items are never picked. */
    weighted<T>(items: readonly (readonly [T, number])[]): T;
    /** Uniform in [-1, 1). */
    bipolar(): number;
}

export function rng(...key: (number | string)[]): Rng {
    let a = hashKey(...key);
    const next = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
    return {
        next,
        chance: (p) => next() < p,
        int: (n) => Math.floor(next() * n),
        pick: (items) => items[Math.floor(next() * items.length)],
        weighted(items) {
            const total = items.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
            let r = next() * total;
            for (const [item, w] of items) {
                if (w <= 0) {
                    continue;
                }
                r -= w;
                if (r < 0) {
                    return item;
                }
            }
            // Float rounding can leave r a hair above zero: return the last pickable item.
            for (let i = items.length - 1; i >= 0; i--) {
                if (items[i][1] > 0) {
                    return items[i][0];
                }
            }
            return items[items.length - 1][0];
        },
        bipolar: () => next() * 2 - 1,
    };
}
