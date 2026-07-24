import { describe, expect, it } from 'vitest';
import { INTENSITY_BANDS, makeMotifSelector } from '../../../public/engine/grooves/utils.js';

// Verify that makeMotifSelector produces identical output to the hand-written
// getMotif functions it replaced, using a representative sample of (seed, complexity,
// intensity) triples for each genre.

describe('makeMotifSelector factory', () => {
    describe('basic guard conditions', () => {
        const selector = makeMotifSelector([
            {
                picks: [
                    [0.5, 0],
                    [1.0, 1],
                ],
            },
        ]);

        it('returns 0 when complexity is below threshold', () => {
            expect(selector(0.9, 0.1, 1.0)).toBe(0);
        });

        it('returns 0 when intensity is below floor', () => {
            expect(selector(0.9, 0.8, INTENSITY_BANDS.LOW - 0.01)).toBe(0);
        });
    });

    describe('pickBySeed via single-tier selector', () => {
        const sel = makeMotifSelector([
            {
                picks: [
                    [0.3, 0],
                    [0.7, 1],
                    [1.0, 2],
                ],
            },
        ]);

        it('picks first motif when seed < first threshold', () => {
            expect(sel(0.1, 1.0, 1.0)).toBe(0);
        });

        it('picks second motif in mid range', () => {
            expect(sel(0.5, 1.0, 1.0)).toBe(1);
        });

        it('picks last motif for high seed', () => {
            expect(sel(0.8, 1.0, 1.0)).toBe(2);
        });
    });

    describe('Funk motif selector (2-tier)', () => {
        const getMotif = makeMotifSelector([
            {
                maxIntensity: 0.7,
                picks: [
                    [0.4, 0],
                    [1.0, 1],
                ],
            },
            {
                picks: [
                    [0.2, 0],
                    [0.5, 1],
                    [0.75, 2],
                    [1.0, 3],
                ],
            },
        ]);

        it('guard: low intensity → 0', () => {
            expect(getMotif(0.9, 0.8, 0.2)).toBe(0);
        });
        it('mid tier: seed < 0.4 → 0', () => {
            expect(getMotif(0.3, 0.8, 0.5)).toBe(0);
        });
        it('mid tier: seed >= 0.4 → 1', () => {
            expect(getMotif(0.5, 0.8, 0.5)).toBe(1);
        });
        it('high tier: seed < 0.2 → 0', () => {
            expect(getMotif(0.1, 0.8, 0.9)).toBe(0);
        });
        it('high tier: seed 0.2–0.5 → 1', () => {
            expect(getMotif(0.4, 0.8, 0.9)).toBe(1);
        });
        it('high tier: seed 0.5–0.75 → 2', () => {
            expect(getMotif(0.6, 0.8, 0.9)).toBe(2);
        });
        it('high tier: seed >= 0.75 → 3', () => {
            expect(getMotif(0.9, 0.8, 0.9)).toBe(3);
        });
    });

    describe('Blues motif selector (3-tier with INTENSITY_BANDS.HIGH)', () => {
        const getMotif = makeMotifSelector([
            {
                maxIntensity: 0.6,
                picks: [
                    [0.75, 0],
                    [1.0, 1],
                ],
            },
            {
                maxIntensity: INTENSITY_BANDS.HIGH,
                picks: [
                    [0.5, 0],
                    [0.8, 1],
                    [1.0, 2],
                ],
            },
            {
                picks: [
                    [0.3, 1],
                    [0.7, 2],
                    [1.0, 3],
                ],
            },
        ]);

        it('low tier: seed < 0.75 → 0', () => {
            expect(getMotif(0.5, 0.8, 0.5)).toBe(0);
        });
        it('low tier: seed >= 0.75 → 1', () => {
            expect(getMotif(0.9, 0.8, 0.5)).toBe(1);
        });
        it('mid tier: seed < 0.5 → 0', () => {
            expect(getMotif(0.3, 0.8, 0.7)).toBe(0);
        });
        it('mid tier: seed 0.5–0.8 → 1', () => {
            expect(getMotif(0.6, 0.8, 0.7)).toBe(1);
        });
        it('mid tier: seed >= 0.8 → 2', () => {
            expect(getMotif(0.9, 0.8, 0.7)).toBe(2);
        });
        it('high tier: seed < 0.3 → 1', () => {
            expect(getMotif(0.2, 0.8, 0.95)).toBe(1);
        });
        it('high tier: seed 0.3–0.7 → 2', () => {
            expect(getMotif(0.5, 0.8, 0.95)).toBe(2);
        });
        it('high tier: seed >= 0.7 → 3', () => {
            expect(getMotif(0.8, 0.8, 0.95)).toBe(3);
        });
    });

    describe('Jazz motif selector (3-tier, 5 motifs)', () => {
        const getMotif = makeMotifSelector([
            {
                maxIntensity: 0.6,
                picks: [
                    [0.75, 0],
                    [1.0, 1],
                ],
            },
            {
                maxIntensity: INTENSITY_BANDS.HIGH,
                picks: [
                    [0.3, 0],
                    [0.6, 1],
                    [0.85, 2],
                    [1.0, 3],
                ],
            },
            {
                picks: [
                    [0.2, 0],
                    [0.4, 1],
                    [0.6, 2],
                    [0.8, 3],
                    [1.0, 4],
                ],
            },
        ]);

        it('high tier: seed >= 0.8 → 4', () => {
            expect(getMotif(0.9, 0.8, 0.95)).toBe(4);
        });
        it('high tier: seed 0.6–0.8 → 3', () => {
            expect(getMotif(0.7, 0.8, 0.95)).toBe(3);
        });
        it('mid tier: seed >= 0.85 → 3', () => {
            expect(getMotif(0.9, 0.8, 0.7)).toBe(3);
        });
    });

    describe('Metal motif selector (3-tier, skips motif 0 in high tiers)', () => {
        const getMotif = makeMotifSelector([
            {
                maxIntensity: 0.65,
                picks: [
                    [0.6, 0],
                    [1.0, 1],
                ],
            },
            {
                maxIntensity: INTENSITY_BANDS.HIGH,
                picks: [
                    [0.3, 1],
                    [0.7, 2],
                    [1.0, 3],
                ],
            },
            {
                picks: [
                    [0.25, 2],
                    [0.6, 3],
                    [1.0, 4],
                ],
            },
        ]);

        it('mid tier: any seed below 0.3 → 1', () => {
            expect(getMotif(0.1, 0.8, 0.7)).toBe(1);
        });
        it('high tier: seed < 0.25 → 2', () => {
            expect(getMotif(0.1, 0.8, 0.95)).toBe(2);
        });
        it('high tier: seed >= 0.6 → 4 (blast beat)', () => {
            expect(getMotif(0.8, 0.8, 0.95)).toBe(4);
        });
    });
});

describe('Groove files use makeMotifSelector correctly', () => {
    it('funk getMotif pins both tiers against the source tier table', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/funk.js');
        expect(typeof getMotif).toBe('function');
        // Source (funk.ts): binaryTier(0.7, 0.4) then high tier picks
        // [[0.2,0],[0.5,1],[0.75,2], 3]. Guards: complexity < 0.3 or
        // intensity < INTENSITY_BANDS.LOW (0.35) → 0.
        expect(getMotif(0.9, 0.2, 0.8)).toBe(0); // low complexity guard
        expect(getMotif(0.9, 0.8, 0.3)).toBe(0); // low intensity guard (< 0.35)
        // mid tier (intensity < 0.7): binaryTier, seed < 0.4 → 0, else → 1.
        expect(getMotif(0.399, 0.8, 0.5)).toBe(0);
        expect(getMotif(0.4, 0.8, 0.5)).toBe(1);
        // high tier (intensity >= 0.7): 0.2 / 0.5 / 0.75 seed ceilings → 0/1/2/3.
        expect(getMotif(0.199, 0.8, 0.8)).toBe(0);
        expect(getMotif(0.2, 0.8, 0.8)).toBe(1);
        expect(getMotif(0.499, 0.8, 0.8)).toBe(1);
        expect(getMotif(0.5, 0.8, 0.8)).toBe(2);
        expect(getMotif(0.749, 0.8, 0.8)).toBe(2);
        expect(getMotif(0.75, 0.8, 0.8)).toBe(3);
        // tier boundary: maxIntensity 0.7 belongs to the HIGHER tier (strict <).
        expect(getMotif(0.5, 0.8, 0.699)).toBe(1); // mid tier → binaryTier
        expect(getMotif(0.5, 0.8, 0.7)).toBe(2); // high tier
    });

    it('rock getMotif pins all three tiers against the source tier table', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/rock.js');
        expect(typeof getMotif).toBe('function');
        // Source (rock.ts): binaryTier(0.6, 0.6); mid tier (maxIntensity HIGH=0.85)
        // picks [[0.3,0],[0.6,1],[0.85,2], 3]; high tier picks [[0.2,1],[0.5,2], 3].
        expect(getMotif(0.9, 0.2, 0.8)).toBe(0); // low complexity guard
        expect(getMotif(0.9, 0.8, 0.3)).toBe(0); // low intensity guard (< 0.35)
        // low tier (intensity < 0.6): seed < 0.6 → 0, else → 1.
        expect(getMotif(0.599, 0.8, 0.5)).toBe(0);
        expect(getMotif(0.6, 0.8, 0.5)).toBe(1);
        // mid tier (0.6 <= intensity < 0.85): 0.3 / 0.6 / 0.85 ceilings → 0/1/2/3.
        expect(getMotif(0.299, 0.8, 0.7)).toBe(0);
        expect(getMotif(0.3, 0.8, 0.7)).toBe(1);
        expect(getMotif(0.599, 0.8, 0.7)).toBe(1);
        expect(getMotif(0.6, 0.8, 0.7)).toBe(2);
        expect(getMotif(0.849, 0.8, 0.7)).toBe(2);
        expect(getMotif(0.85, 0.8, 0.7)).toBe(3);
        // high tier (intensity >= 0.85): 0.2 / 0.5 ceilings, lowest motif is 1 → 1/2/3.
        expect(getMotif(0.199, 0.8, 0.9)).toBe(1);
        expect(getMotif(0.2, 0.8, 0.9)).toBe(2);
        expect(getMotif(0.499, 0.8, 0.9)).toBe(2);
        expect(getMotif(0.5, 0.8, 0.9)).toBe(3);
        // tier boundaries belong to the HIGHER tier (strict <).
        expect(getMotif(0.3, 0.8, 0.599)).toBe(0); // low tier
        expect(getMotif(0.3, 0.8, 0.6)).toBe(1); // mid tier
        expect(getMotif(0.2, 0.8, 0.849)).toBe(0); // mid tier
        expect(getMotif(0.2, 0.8, 0.85)).toBe(2); // high tier
    });

    it('jazz getMotif pins all three tiers against the source tier table', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/jazz.js');
        expect(typeof getMotif).toBe('function');
        // Source (jazz.ts): binaryTier(0.6, 0.75); mid tier (maxIntensity HIGH=0.85)
        // picks [[0.3,0],[0.6,1],[0.85,2], 3]; high tier picks
        // [[0.2,0],[0.4,1],[0.6,2],[0.8,3], 4].
        expect(getMotif(0.9, 0.2, 0.8)).toBe(0); // low complexity guard
        expect(getMotif(0.9, 0.8, 0.3)).toBe(0); // low intensity guard (< 0.35)
        // low tier (intensity < 0.6): seed < 0.75 → 0, else → 1.
        expect(getMotif(0.749, 0.8, 0.5)).toBe(0);
        expect(getMotif(0.75, 0.8, 0.5)).toBe(1);
        // mid tier (0.6 <= intensity < 0.85): 0.3 / 0.6 / 0.85 ceilings → 0/1/2/3.
        expect(getMotif(0.299, 0.8, 0.7)).toBe(0);
        expect(getMotif(0.3, 0.8, 0.7)).toBe(1);
        expect(getMotif(0.599, 0.8, 0.7)).toBe(1);
        expect(getMotif(0.6, 0.8, 0.7)).toBe(2);
        expect(getMotif(0.849, 0.8, 0.7)).toBe(2);
        expect(getMotif(0.85, 0.8, 0.7)).toBe(3);
        // high tier (intensity >= 0.85): 0.2 / 0.4 / 0.6 / 0.8 ceilings → 0/1/2/3/4.
        expect(getMotif(0.199, 0.8, 0.9)).toBe(0);
        expect(getMotif(0.2, 0.8, 0.9)).toBe(1);
        expect(getMotif(0.399, 0.8, 0.9)).toBe(1);
        expect(getMotif(0.4, 0.8, 0.9)).toBe(2);
        expect(getMotif(0.599, 0.8, 0.9)).toBe(2);
        expect(getMotif(0.6, 0.8, 0.9)).toBe(3);
        expect(getMotif(0.799, 0.8, 0.9)).toBe(3);
        expect(getMotif(0.8, 0.8, 0.9)).toBe(4);
        // tier boundaries belong to the HIGHER tier (strict <).
        expect(getMotif(0.5, 0.8, 0.599)).toBe(0); // low tier
        expect(getMotif(0.5, 0.8, 0.6)).toBe(1); // mid tier
        expect(getMotif(0.2, 0.8, 0.849)).toBe(0); // mid tier
        expect(getMotif(0.2, 0.8, 0.85)).toBe(1); // high tier
    });

    it('metal getMotif pins all three tiers against the source tier table', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/metal.js');
        expect(typeof getMotif).toBe('function');
        // Source (metal.ts): binaryTier(0.65, 0.6); mid tier (maxIntensity HIGH=0.85)
        // picks [[0.3,1],[0.7,2], 3] (skips motif 0); high tier picks
        // [[0.25,2],[0.6,3], 4].
        expect(getMotif(0.9, 0.2, 0.8)).toBe(0); // low complexity guard
        expect(getMotif(0.9, 0.8, 0.3)).toBe(0); // low intensity guard (< 0.35)
        // low tier (intensity < 0.65): seed < 0.6 → 0, else → 1.
        expect(getMotif(0.599, 0.8, 0.5)).toBe(0);
        expect(getMotif(0.6, 0.8, 0.5)).toBe(1);
        // mid tier (0.65 <= intensity < 0.85): 0.3 / 0.7 ceilings, lowest motif 1 → 1/2/3.
        expect(getMotif(0.299, 0.8, 0.7)).toBe(1);
        expect(getMotif(0.3, 0.8, 0.7)).toBe(2);
        expect(getMotif(0.699, 0.8, 0.7)).toBe(2);
        expect(getMotif(0.7, 0.8, 0.7)).toBe(3);
        // high tier (intensity >= 0.85): 0.25 / 0.6 ceilings, lowest motif 2 → 2/3/4.
        expect(getMotif(0.249, 0.8, 0.9)).toBe(2);
        expect(getMotif(0.25, 0.8, 0.9)).toBe(3);
        expect(getMotif(0.599, 0.8, 0.9)).toBe(3);
        expect(getMotif(0.6, 0.8, 0.9)).toBe(4); // blast beat
        // tier boundaries belong to the HIGHER tier (strict <).
        expect(getMotif(0.1, 0.8, 0.649)).toBe(0); // low tier
        expect(getMotif(0.1, 0.8, 0.65)).toBe(1); // mid tier
        expect(getMotif(0.1, 0.8, 0.849)).toBe(1); // mid tier
        expect(getMotif(0.1, 0.8, 0.85)).toBe(2); // high tier
    });

    it('hiphop getMotif pins both tiers against the source tier table', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/hiphop.js');
        expect(typeof getMotif).toBe('function');
        // Source (hiphop.ts): binaryTier(0.65, 0.6); high tier picks
        // [[0.3,1],[0.7,2], 3] (lowest motif is 1, Trap Foundation).
        expect(getMotif(0.9, 0.2, 0.8)).toBe(0); // low complexity guard
        expect(getMotif(0.9, 0.8, 0.3)).toBe(0); // low intensity guard (< 0.35)
        // low tier (intensity < 0.65): seed < 0.6 → 0, else → 1.
        expect(getMotif(0.599, 0.8, 0.5)).toBe(0);
        expect(getMotif(0.6, 0.8, 0.5)).toBe(1);
        // high tier (intensity >= 0.65): 0.3 / 0.7 ceilings, lowest motif 1 → 1/2/3.
        expect(getMotif(0.1, 0.8, 0.9)).toBe(1); // Trap Foundation
        expect(getMotif(0.299, 0.8, 0.9)).toBe(1);
        expect(getMotif(0.3, 0.8, 0.9)).toBe(2);
        expect(getMotif(0.699, 0.8, 0.9)).toBe(2);
        expect(getMotif(0.7, 0.8, 0.9)).toBe(3);
        // tier boundary: maxIntensity 0.65 belongs to the HIGHER tier (strict <).
        expect(getMotif(0.1, 0.8, 0.649)).toBe(0); // low tier
        expect(getMotif(0.1, 0.8, 0.65)).toBe(1); // high tier
    });

    it('neo-soul getMotif pins both tiers (mid tier folds back onto the core pair)', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/neo-soul.js');
        expect(typeof getMotif).toBe('function');
        expect(getMotif(0.9, 0.2, 0.9)).toBe(0); // low complexity guard
        expect(getMotif(0.9, 0.8, 0.3)).toBe(0); // low intensity guard (< INTENSITY_BANDS.LOW)
        // mid tier (intensity < 0.7): expressive motifs are gated off, seeds fold to 0/1.
        // Seeds bracket each threshold exactly (pickBySeed is strict `<`) so a shifted
        // ceiling can't slip through.
        expect(getMotif(0.299, 0.8, 0.5)).toBe(0); // seed < 0.3 → Boom Bap
        expect(getMotif(0.3, 0.8, 0.5)).toBe(1); // seed 0.3–0.6 → Ghost Note Heavy
        expect(getMotif(0.599, 0.8, 0.5)).toBe(1);
        expect(getMotif(0.6, 0.8, 0.5)).toBe(0); // seed 0.6–0.8 → back to Boom Bap
        expect(getMotif(0.799, 0.8, 0.5)).toBe(0);
        expect(getMotif(0.8, 0.8, 0.5)).toBe(1); // seed >= 0.8 → Ghost Note Heavy
        // high tier (intensity >= 0.7): the top 40% of seed space unlocks 2/3
        expect(getMotif(0.299, 0.8, 0.9)).toBe(0); // seed < 0.3 → Boom Bap
        expect(getMotif(0.3, 0.8, 0.9)).toBe(1); // seed 0.3–0.6 → Ghost Note Heavy
        expect(getMotif(0.599, 0.8, 0.9)).toBe(1);
        expect(getMotif(0.6, 0.8, 0.9)).toBe(2); // seed 0.6–0.8 → Dilla Skips
        expect(getMotif(0.799, 0.8, 0.9)).toBe(2);
        expect(getMotif(0.8, 0.8, 0.9)).toBe(3); // seed >= 0.8 → Modern Hybrid
    });

    it('neo-soul getMotif treats intensity exactly 0.7 as the high tier', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/neo-soul.js');
        // Tier selection is strict `<`, so 0.7 is NOT in the maxIntensity-0.7 tier.
        expect(getMotif(0.7, 0.8, 0.7)).toBe(2); // high tier → Dilla Skips
        expect(getMotif(0.9, 0.8, 0.7)).toBe(3); // high tier → Modern Hybrid
        // ...and one step below the boundary still folds back onto the core pair.
        expect(getMotif(0.7, 0.8, 0.69)).toBe(0);
        expect(getMotif(0.9, 0.8, 0.69)).toBe(1);
    });

    it('country getMotif pins both tiers against the source tier table', async () => {
        const { getMotif } = await import('../../../public/engine/grooves/country.js');
        expect(typeof getMotif).toBe('function');
        // Source (country.ts): binaryTier(0.6, 0.6); high tier picks
        // [[0.3,0],[0.8,1], 2] — at most motif 2.
        expect(getMotif(0.9, 0.2, 0.9)).toBe(0); // low complexity guard
        expect(getMotif(0.9, 0.8, 0.3)).toBe(0); // low intensity guard (< 0.35)
        // low tier (intensity < 0.6): seed < 0.6 → 0, else → 1.
        expect(getMotif(0.599, 0.8, 0.5)).toBe(0);
        expect(getMotif(0.6, 0.8, 0.5)).toBe(1);
        // high tier (intensity >= 0.6): 0.3 / 0.8 ceilings → 0/1/2.
        expect(getMotif(0.299, 0.8, 0.9)).toBe(0);
        expect(getMotif(0.3, 0.8, 0.9)).toBe(1);
        expect(getMotif(0.799, 0.8, 0.9)).toBe(1);
        expect(getMotif(0.8, 0.8, 0.9)).toBe(2);
        // tier boundary: maxIntensity 0.6 belongs to the HIGHER tier (strict <).
        expect(getMotif(0.3, 0.8, 0.599)).toBe(0); // low tier
        expect(getMotif(0.3, 0.8, 0.6)).toBe(1); // high tier
    });
});
