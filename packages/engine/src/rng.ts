// Seeded randomness. Every random choice in the engine draws from one of these,
// passed in explicitly, so a take is fully determined by its seed.

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, n). */
  int(n: number): number;
  /** An integer in [low, high], both inclusive. */
  between(low: number, high: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Pick by weight. Weights need not sum to one; zero and negative weights never win. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  /**
   * An independent stream named by labels, e.g. `rng.fork("bass", pass, bar)`.
   * It depends only on the seed and the labels, never on how many numbers this
   * stream has produced. That is what keeps bar 9 the same when bar 8 changes
   * how many decisions it makes, and keeps earlier passes fixed when a plan is extended.
   */
  fork(...labels: readonly (string | number)[]): Rng;
}

export function createRng(seed: number | string): Rng {
  return rngAt(`seed:${seed}`);
}

function rngAt(path: string): Rng {
  const next = sfc32(hashString(path));
  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    between: (low, high) => low + Math.floor(next() * (high - low + 1)),
    chance: (probability) => next() < probability,
    pick: (items) => {
      if (items.length === 0) throw new Error("pick from an empty list");
      return items[Math.floor(next() * items.length)]!;
    },
    weighted: (items, weight) => {
      const weights = items.map((item) => Math.max(0, weight(item)));
      const total = weights.reduce((sum, w) => sum + w, 0);
      if (items.length === 0 || total <= 0)
        throw new Error("weighted pick with no positive weight");
      let roll = next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= weights[i]!;
        if (roll < 0) return items[i]!;
      }
      return items[items.length - 1]!;
    },
    fork: (...labels) => rngAt(`${path}/${labels.join("/")}`),
  };
  return rng;
}

/** Four 32-bit words from a string (the cyrb128 mixing function). */
function hashString(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  return [h1 >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/** The sfc32 generator: small, fast, and well distributed for this purpose. */
function sfc32([s0, s1, s2, s3]: [number, number, number, number]): () => number {
  let a = s0;
  let b = s1;
  let c = s2;
  let d = s3;
  const step = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) step();
  return step;
}
